import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Paginated, TaskActivityEntry } from '@projectflow/shared';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { toUserSummary } from '../common/utils/serialize';
import { ProjectAccessService } from '../projects/project-access.service';
import { UsersService } from '../users/users.service';
import { Task, type TaskDocument } from './schemas/task.schema';
import { TaskActivity, type TaskActivityDocument } from './schemas/task-activity.schema';

@Injectable()
export class TaskActivityService {
  constructor(
    @InjectModel(TaskActivity.name) private readonly activityModel: Model<TaskActivityDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly projectAccessService: ProjectAccessService,
    private readonly usersService: UsersService,
  ) {}

  async findByTask(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    query: PaginationQueryDto,
  ): Promise<Paginated<TaskActivityEntry>> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    await this.projectAccessService.assertCanView(task.projectId, userId);

    const [activities, total] = await Promise.all([
      this.activityModel
        .find({ taskId })
        .sort({ createdAt: -1 })
        .skip(query.skip)
        .limit(query.pageSize)
        .exec(),
      this.activityModel.countDocuments({ taskId }),
    ]);

    return {
      items: await this.toEntries(activities),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async logAssigneeChange(
    taskId: Types.ObjectId,
    actorId: Types.ObjectId,
    from: Types.ObjectId | null,
    to: Types.ObjectId | null,
  ): Promise<void> {
    await this.activityModel.create({
      taskId,
      type: 'TASK_ASSIGNEE_CHANGED',
      actor: actorId,
      from,
      to,
    });
  }

  private async toEntries(activities: TaskActivityDocument[]): Promise<TaskActivityEntry[]> {
    if (activities.length === 0) {
      return [];
    }

    const actorIds = activities.map((a) => a.actor);
    const fromIds = activities.map((a) => a.from).filter((id): id is Types.ObjectId => id !== null);
    const toIds = activities.map((a) => a.to).filter((id): id is Types.ObjectId => id !== null);

    const allUserIds = [...new Set([...actorIds, ...fromIds, ...toIds].map((id) => id.toString()))];
    const users = await this.usersService.findManyByIds(allUserIds.map((id) => new Types.ObjectId(id)));
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));

    return activities.map((activity) => ({
      id: activity._id.toString(),
      taskId: activity.taskId.toString(),
      type: activity.type,
      actor: toUserSummary(usersById.get(activity.actor.toString())!),
      metadata: {
        from: activity.from ? toUserSummary(usersById.get(activity.from.toString())!) : null,
        to: activity.to ? toUserSummary(usersById.get(activity.to.toString())!) : null,
      },
      createdAt: activity.createdAt.toISOString(),
    }));
  }
}
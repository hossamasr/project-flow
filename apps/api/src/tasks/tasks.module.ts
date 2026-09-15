import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { ProjectMembersModule } from '../project-members/project-members.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { Task, TaskSchema } from './schemas/task.schema';
import { TaskActivity, TaskActivitySchema } from './schemas/task-activity.schema';
import { TaskCounter, TaskCounterSchema } from './schemas/task-counter.schema';
import { TaskActivityService } from './task-activity.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: TaskActivity.name, schema: TaskActivitySchema },
      { name: TaskCounter.name, schema: TaskCounterSchema },
    ]),
    ProjectMembersModule,
    ProjectsModule,
    UsersModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskActivityService],
  exports: [TasksService, TaskActivityService, MongooseModule],
})
export class TasksModule {}

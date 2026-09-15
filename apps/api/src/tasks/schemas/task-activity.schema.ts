import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type TaskActivityDocument = HydratedDocument<TaskActivity>;

export enum TaskActivityType {
  TASK_ASSIGNEE_CHANGED = 'TASK_ASSIGNEE_CHANGED',
}

@Schema({ timestamps: true, collection: 'task_activities' })
export class TaskActivity {
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TaskActivityType), required: true })
  type: TaskActivityType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  from: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  to: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export const TaskActivitySchema = SchemaFactory.createForClass(TaskActivity);

TaskActivitySchema.index({ taskId: 1, createdAt: -1 });
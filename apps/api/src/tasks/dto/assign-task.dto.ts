import { IsOptional, IsString } from 'class-validator';

export class AssignTaskDto {
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
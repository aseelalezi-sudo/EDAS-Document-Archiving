import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { TASK_PRIORITIES, TASK_STATUSES } from "./create-task.dto";

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}

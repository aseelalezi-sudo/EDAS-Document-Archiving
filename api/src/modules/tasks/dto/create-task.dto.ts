import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export const TASK_STATUSES = ["open", "in_progress", "changes_requested", "completed", "rejected", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}

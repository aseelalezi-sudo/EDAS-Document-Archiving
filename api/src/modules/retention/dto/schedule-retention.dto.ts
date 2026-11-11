import { IsUUID } from "class-validator";

export class ScheduleRetentionDto {
  @IsUUID()
  documentId!: string;

  @IsUUID()
  policyId!: string;
}

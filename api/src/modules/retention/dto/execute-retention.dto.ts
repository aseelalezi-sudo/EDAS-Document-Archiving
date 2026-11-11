import { RetentionAction } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ExecuteRetentionDto {
  @IsOptional()
  @IsEnum(RetentionAction)
  action?: RetentionAction;

  @IsOptional()
  @IsString()
  note?: string;
}

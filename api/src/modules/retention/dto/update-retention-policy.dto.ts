import { RetentionAction } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class UpdateRetentionPolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  legalBasis?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionMonths?: number;

  @IsOptional()
  @IsEnum(RetentionAction)
  action?: RetentionAction;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

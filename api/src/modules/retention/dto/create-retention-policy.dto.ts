import { RetentionAction } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class CreateRetentionPolicyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  legalBasis?: string;

  @IsInt()
  @Min(1)
  retentionMonths!: number;

  @IsEnum(RetentionAction)
  action!: RetentionAction;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

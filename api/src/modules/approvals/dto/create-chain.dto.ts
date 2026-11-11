import { UserRole } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class ApprovalStepDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateChainDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}

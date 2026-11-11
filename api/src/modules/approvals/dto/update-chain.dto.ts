import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { ApprovalStepDto } from "./create-chain.dto";

export class UpdateChainDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps?: ApprovalStepDto[];
}

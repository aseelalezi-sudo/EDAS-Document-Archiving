import { IsArray, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateLegalHoldDto {
  @IsString()
  @MinLength(1)
  caseNo!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  documentIds?: string[];
}

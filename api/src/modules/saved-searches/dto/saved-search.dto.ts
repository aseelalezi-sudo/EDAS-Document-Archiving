import { Allow, IsOptional, IsString, MinLength } from "class-validator";

export class CreateSavedSearchDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Allow()
  query!: Record<string, unknown>;
}

export class UpdateSavedSearchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Allow()
  query?: Record<string, unknown>;
}

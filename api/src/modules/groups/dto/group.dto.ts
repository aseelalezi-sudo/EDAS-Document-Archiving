import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

const TYPES = ["functional", "dept", "project"] as const;

export class CreateGroupDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  memberIds?: string[];
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  memberIds?: string[];
}

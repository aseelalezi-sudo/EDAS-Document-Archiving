import { FolderScope } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsEnum(FolderScope)
  scope?: FolderScope;

  @IsOptional()
  @IsBoolean()
  aclInherit?: boolean;
}

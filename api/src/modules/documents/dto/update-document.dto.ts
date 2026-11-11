import { Classification } from "@prisma/client";
import { IsArray, IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export type DocumentTransition = "ARCHIVE" | "REOPEN";

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(Classification)
  classification?: Classification;

  @IsOptional()
  @IsIn(["ARCHIVE", "REOPEN"])
  transition?: DocumentTransition;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsISO8601()
  retentionEnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

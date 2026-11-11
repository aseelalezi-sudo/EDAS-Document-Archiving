import { Classification } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  title!: string;

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
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

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

  @IsUUID()
  fileId!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class PurgeUnreferencedDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  fileIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storageKeys?: string[];
}

import { IsOptional, IsString, IsUUID } from "class-validator";

export class AddVersionDto {
  @IsUUID()
  fileId!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

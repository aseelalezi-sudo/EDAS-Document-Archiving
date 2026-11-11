import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class RegisterFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  storageKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  mimeType!: string;

  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/, { message: "checksumSha256 must be 64 hexadecimal characters" })
  checksumSha256!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1073741824)
  sizeBytes?: number;
}

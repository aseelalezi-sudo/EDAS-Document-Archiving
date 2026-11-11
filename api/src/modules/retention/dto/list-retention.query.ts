import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class ListRetentionQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  dueOnly?: boolean;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  policyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 25;
}

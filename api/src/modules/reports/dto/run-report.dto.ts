import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RunReportDto {
  @IsString()
  @MinLength(1)
  reportType!: string;

  @IsOptional()
  @IsIn(["pdf", "xlsx", "csv"])
  format?: string;

  @IsOptional()
  @IsUUID()
  scheduleId?: string;
}

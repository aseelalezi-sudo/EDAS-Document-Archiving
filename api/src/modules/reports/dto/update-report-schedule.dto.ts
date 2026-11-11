import { ReportCadence } from "@prisma/client";
import { Allow, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateReportScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reportType?: string;

  @IsOptional()
  @IsEnum(ReportCadence)
  cadence?: ReportCadence;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @Allow()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

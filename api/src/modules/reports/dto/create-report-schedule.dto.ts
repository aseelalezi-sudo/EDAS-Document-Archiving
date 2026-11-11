import { ReportCadence } from "@prisma/client";
import { Allow, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class CreateReportScheduleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  reportType!: string;

  @IsEnum(ReportCadence)
  cadence!: ReportCadence;

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

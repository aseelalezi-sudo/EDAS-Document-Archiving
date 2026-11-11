import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class PreviewCacheCleanupDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  olderThanDays?: number;
}

import { NotificationLevel } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateNotificationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsEnum(NotificationLevel)
  level?: NotificationLevel;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}

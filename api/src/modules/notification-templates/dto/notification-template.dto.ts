import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@edas/shared";

export class CreateNotificationTemplateDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsOptional()
  @IsIn(NOTIFICATION_CHANNELS)
  channel?: NotificationChannel;

  @IsString()
  @MinLength(2)
  subject!: string;

  @IsString()
  @MinLength(2)
  subjectEn!: string;

  @IsString()
  @MinLength(2)
  body!: string;

  @IsString()
  @MinLength(2)
  bodyEn!: string;
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nameEn?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_CHANNELS)
  channel?: NotificationChannel;

  @IsOptional()
  @IsString()
  @MinLength(2)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  subjectEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  body?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  bodyEn?: string;
}

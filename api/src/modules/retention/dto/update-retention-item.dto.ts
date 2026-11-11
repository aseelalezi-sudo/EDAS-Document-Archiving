import { IsISO8601 } from "class-validator";

export class UpdateRetentionItemDto {
  @IsISO8601()
  dueAt!: string;
}

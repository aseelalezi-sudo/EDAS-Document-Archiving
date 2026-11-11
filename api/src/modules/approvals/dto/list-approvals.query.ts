import { ApprovalStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class ListApprovalsQuery {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @IsUUID()
  documentId?: string;

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

import { IsIn, IsOptional, IsString } from "class-validator";

export type Decision = "APPROVED" | "REJECTED";

export class DecideApprovalDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: Decision;

  @IsOptional()
  @IsString()
  comment?: string;
}

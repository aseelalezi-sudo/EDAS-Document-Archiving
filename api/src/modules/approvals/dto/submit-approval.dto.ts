import { IsOptional, IsString, IsUUID } from "class-validator";

export class SubmitApprovalDto {
  @IsUUID()
  documentId!: string;

  @IsOptional()
  @IsUUID()
  chainId?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

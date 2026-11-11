import { IsUUID } from "class-validator";

export class AddHoldDocumentDto {
  @IsUUID()
  documentId!: string;
}

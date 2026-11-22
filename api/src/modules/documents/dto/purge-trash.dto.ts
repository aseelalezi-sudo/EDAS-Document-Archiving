import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class PurgeTrashDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  ids!: string[];
}

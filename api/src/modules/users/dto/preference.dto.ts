import { Allow } from "class-validator";

export class UpdatePreferenceDto {
  @Allow()
  value!: unknown;
}

import { ArrayUnique, IsArray, IsIn } from "class-validator";
import { ACL_ACTIONS, type AclAction } from "@edas/shared";

export class UpdateRoleDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(ACL_ACTIONS, { each: true })
  actions!: AclAction[];
}

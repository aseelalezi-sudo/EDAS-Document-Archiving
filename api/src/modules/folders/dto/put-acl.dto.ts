import { AclAction, AclEffect, AclPrincipal } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, ValidateNested } from "class-validator";

export class AclRuleDto {
  @IsEnum(AclPrincipal)
  principalType!: AclPrincipal;

  @IsString()
  principalId!: string;

  @IsArray()
  @IsEnum(AclAction, { each: true })
  actions!: AclAction[];

  @IsOptional()
  @IsEnum(AclEffect)
  effect?: AclEffect;
}

export class PutAclDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AclRuleDto)
  rules!: AclRuleDto[];
}

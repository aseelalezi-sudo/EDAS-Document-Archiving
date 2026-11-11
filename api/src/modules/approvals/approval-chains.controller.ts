import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { ApprovalsService } from "./approvals.service";
import { CreateChainDto } from "./dto/create-chain.dto";
import { UpdateChainDto } from "./dto/update-chain.dto";

@Controller("approval-chains")
export class ApprovalChainsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list() {
    return this.approvals.listChains();
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  create(@CurrentUser() principal: Principal, @Body() dto: CreateChainDto) {
    return this.approvals.createChain(principal, dto);
  }

  @Patch(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateChainDto) {
    return this.approvals.updateChain(principal, id, dto);
  }
}

import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { ApprovalsService } from "./approvals.service";
import { DecideApprovalDto } from "./dto/decide-approval.dto";
import { ListApprovalsQuery } from "./dto/list-approvals.query";
import { SubmitApprovalDto } from "./dto/submit-approval.dto";

@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query() query: ListApprovalsQuery) {
    return this.approvals.list(principal, query);
  }

  @Get("pending")
  pending(@CurrentUser() principal: Principal) {
    return this.approvals.pending(principal);
  }

  @Get(":id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.approvals.get(principal, id);
  }

  @Post()
  submit(@CurrentUser() principal: Principal, @Body() dto: SubmitApprovalDto) {
    return this.approvals.submit(principal, dto);
  }

  @Post(":id/decide")
  decide(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: DecideApprovalDto) {
    return this.approvals.decide(principal, id, dto);
  }
}

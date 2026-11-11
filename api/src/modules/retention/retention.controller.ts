import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { CreateRetentionPolicyDto } from "./dto/create-retention-policy.dto";
import { ExecuteRetentionDto } from "./dto/execute-retention.dto";
import { ListRetentionQuery } from "./dto/list-retention.query";
import { ScheduleRetentionDto } from "./dto/schedule-retention.dto";
import { UpdateRetentionItemDto } from "./dto/update-retention-item.dto";
import { UpdateRetentionPolicyDto } from "./dto/update-retention-policy.dto";
import { RetentionService } from "./retention.service";

@Controller("retention")
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get("policies")
  listPolicies(@CurrentUser() principal: Principal) {
    return this.retention.listPolicies(principal);
  }

  @Post("policies")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  createPolicy(@CurrentUser() principal: Principal, @Body() dto: CreateRetentionPolicyDto) {
    return this.retention.createPolicy(principal, dto);
  }

  @Patch("policies/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  updatePolicy(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateRetentionPolicyDto) {
    return this.retention.updatePolicy(principal, id, dto);
  }

  @Delete("policies/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ARCHIVIST)
  deletePolicy(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.retention.deletePolicy(principal, id);
  }

  @Get("items")
  listItems(@CurrentUser() principal: Principal, @Query() query: ListRetentionQuery) {
    return this.retention.listItems(principal, query);
  }

  @Post("items")
  schedule(@CurrentUser() principal: Principal, @Body() dto: ScheduleRetentionDto) {
    return this.retention.schedule(principal, dto);
  }

  @Post("items/:id/execute")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  execute(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: ExecuteRetentionDto) {
    return this.retention.execute(principal, id, dto);
  }

  @Get("items/:id/certificate")
  certificate(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.retention.certificate(principal, id);
  }

  @Patch("items/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  updateItem(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateRetentionItemDto) {
    return this.retention.updateItem(principal, id, dto);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { AddHoldDocumentDto } from "./dto/add-hold-document.dto";
import { CreateLegalHoldDto } from "./dto/create-legal-hold.dto";
import { ListLegalHoldsQuery } from "./dto/list-legal-holds.query";
import { LegalHoldsService } from "./legal-holds.service";

@Controller("legal-holds")
export class LegalHoldsController {
  constructor(private readonly holds: LegalHoldsService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query() query: ListLegalHoldsQuery) {
    return this.holds.list(principal, query);
  }

  @Get(":id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.holds.get(principal, id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  create(@CurrentUser() principal: Principal, @Body() dto: CreateLegalHoldDto) {
    return this.holds.create(principal, dto);
  }

  @Post(":id/documents")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  addDocument(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: AddHoldDocumentDto) {
    return this.holds.addDocument(principal, id, dto.documentId);
  }

  @Delete(":id/documents/:documentId")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  removeDocument(@CurrentUser() principal: Principal, @Param("id") id: string, @Param("documentId") documentId: string) {
    return this.holds.removeDocument(principal, id, documentId);
  }

  @Post(":id/release")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  release(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.holds.release(principal, id);
  }
}

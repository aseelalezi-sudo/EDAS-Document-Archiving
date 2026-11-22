import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { DocumentsService } from "./documents.service";
import { AddVersionDto } from "./dto/add-version.dto";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { ListDocumentsQuery } from "./dto/list-documents.query";
import { PurgeTrashDto } from "./dto/purge-trash.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query() query: ListDocumentsQuery) {
    return this.documents.list(principal, query);
  }

  @Get("trash")
  trash(@CurrentUser() principal: Principal, @Query() query: ListDocumentsQuery) {
    return this.documents.trash(principal, query);
  }

  @Get("trash/ids")
  trashIds(@CurrentUser() principal: Principal) {
    return this.documents.trashIds(principal);
  }

  @Post("trash/purge")
  purgeTrash(@CurrentUser() principal: Principal, @Body() dto: PurgeTrashDto) {
    return this.documents.purgeTrash(principal, dto.ids);
  }

  @Get(":id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.get(principal, id);
  }

  @Get(":id/permissions")
  permissions(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.permissions(principal, id);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateDocumentDto) {
    return this.documents.create(principal, dto);
  }

  @Patch(":id")
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.update(principal, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.remove(principal, id);
  }

  @Post(":id/restore")
  restore(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.restore(principal, id);
  }

  @Delete(":id/purge")
  purge(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.purge(principal, id);
  }

  @Post(":id/versions")
  addVersion(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: AddVersionDto) {
    return this.documents.addVersion(principal, id, dto);
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(@CurrentUser() principal: Principal, @Param("id") id: string, @Param("versionId") versionId: string) {
    return this.documents.restoreVersion(principal, id, versionId);
  }

  @Post(":id/checkout")
  checkout(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.checkout(principal, id);
  }

  @Post(":id/checkin")
  checkin(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.checkin(principal, id);
  }

  @Post(":id/signature/request")
  requestSignature(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.requestSignature(principal, id);
  }

  @Post(":id/signature/sign")
  sign(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.sign(principal, id);
  }

  @Post(":id/declare-record")
  declareRecord(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.documents.declareRecord(principal, id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { CreateFolderDto } from "./dto/create-folder.dto";
import { PutAclDto } from "./dto/put-acl.dto";
import { UpdateFolderDto } from "./dto/update-folder.dto";
import { FoldersService } from "./folders.service";

@Controller("folders")
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get("tree")
  tree(@CurrentUser() principal: Principal) {
    return this.folders.tree(principal);
  }

  @Get("acls")
  listAcls(@CurrentUser() principal: Principal) {
    return this.folders.listAcls(principal);
  }

  @Get(":id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.folders.get(principal, id);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateFolderDto) {
    return this.folders.create(principal, dto);
  }

  @Patch(":id")
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateFolderDto) {
    return this.folders.update(principal, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.folders.remove(principal, id);
  }

  @Get(":id/acl")
  getAcl(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.folders.getAcl(principal, id);
  }

  @Put(":id/acl")
  putAcl(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: PutAclDto) {
    return this.folders.putAcl(principal, id, dto);
  }
}

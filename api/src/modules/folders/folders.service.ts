import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AclAction, AclEffect, Folder, FolderType, Prisma } from "@prisma/client";
import { AccessService, departmentMatch } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateFolderDto } from "./dto/create-folder.dto";
import { PutAclDto } from "./dto/put-acl.dto";
import { UpdateFolderDto } from "./dto/update-folder.dto";

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async tree(principal: Principal) {
    const { actor, departmentId } = await this.access.listScope(principal);
    const match = departmentMatch(departmentId);
    const where: Prisma.FolderWhereInput = match ? { departmentId: match } : {};
    const folders = await this.prisma.folder.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        nameEn: true,
        type: true,
        scope: true,
        path: true,
        parentId: true,
        departmentId: true,
        projectId: true,
        createdAt: true,
      },
    });
    return { items: folders, departmentId: departmentId ?? null, actorId: actor.id };
  }

  async get(principal: Principal, id: string) {
    await this.access.assert(principal, AclAction.VIEW, id);
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      include: { acl: true, _count: { select: { documents: true, children: true } } },
    });
    if (!folder) throw new NotFoundException("Folder not found");
    return folder;
  }

  async create(principal: Principal, dto: CreateFolderDto) {
    const actor = await this.access.assert(principal, AclAction.CREATE, dto.parentId ?? null);
    const departmentId = this.access.isGlobal(actor) ? dto.departmentId : (actor.departmentId ?? undefined);

    let path = "/";
    if (dto.parentId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: dto.parentId }, select: { path: true } });
      if (!parent) throw new BadRequestException("Parent folder not found");
      path = parent.path;
    }

    const id = randomUUID();
    const folder = await this.prisma.folder.create({
      data: {
        id,
        name: dto.name,
        nameEn: dto.nameEn,
        type: dto.type ?? FolderType.DEPARTMENT,
        scope: dto.scope,
        parentId: dto.parentId,
        departmentId,
        projectId: dto.projectId,
        path: `${path}${id}/`,
      },
    });

    await this.audit.record({
      action: "folder.create",
      entityType: "Folder",
      entityId: folder.id,
      actorId: actor.id,
      departmentId: folder.departmentId,
      detail: { name: folder.name, parentId: folder.parentId },
    });
    return folder;
  }

  async update(principal: Principal, id: string, dto: UpdateFolderDto) {
    const actor = await this.access.assert(principal, AclAction.EDIT, id);
    await this.ensureExists(id);
    const folder = await this.prisma.folder.update({
      where: { id },
      data: { name: dto.name, nameEn: dto.nameEn, scope: dto.scope, aclInherit: dto.aclInherit },
    });
    await this.audit.record({
      action: "folder.update",
      entityType: "Folder",
      entityId: id,
      actorId: actor.id,
      departmentId: folder.departmentId,
      detail: { ...dto },
    });
    return folder;
  }

  async remove(principal: Principal, id: string) {
    const actor = await this.access.assert(principal, AclAction.DELETE, id);
    await this.ensureExists(id);

    const counts = await this.prisma.folder.findUnique({
      where: { id },
      select: { _count: { select: { children: true, documents: true } } },
    });
    if (counts && (counts._count.children > 0 || counts._count.documents > 0)) {
      throw new BadRequestException("Folder is not empty");
    }

    await this.prisma.$transaction([
      this.prisma.aclRule.deleteMany({ where: { folderId: id } }),
      this.prisma.folder.delete({ where: { id } }),
    ]);
    await this.audit.record({ action: "folder.delete", entityType: "Folder", entityId: id, actorId: actor.id });
    return { id, deleted: true };
  }

  async getAcl(principal: Principal, id: string) {
    await this.access.assert(principal, AclAction.VIEW, id);
    await this.ensureExists(id);
    return this.prisma.aclRule.findMany({ where: { folderId: id }, orderBy: { createdAt: "asc" } });
  }

  /**
   * Returns the ACL rules of every folder in the caller's tree in one query. The SPA needs the whole map to resolve
   * inherited permissions, and fetching it folder by folder turned one screen into dozens of requests.
   */
  async listAcls(principal: Principal) {
    const { items } = await this.tree(principal);
    const ids = items.map((folder) => folder.id);
    if (ids.length === 0) return [];
    return this.prisma.aclRule.findMany({ where: { folderId: { in: ids } }, orderBy: { createdAt: "asc" } });
  }

  async putAcl(principal: Principal, id: string, dto: PutAclDto) {
    const actor = await this.access.assert(principal, AclAction.EDIT, id);
    await this.ensureExists(id);

    await this.prisma.$transaction([
      this.prisma.aclRule.deleteMany({ where: { folderId: id } }),
      this.prisma.aclRule.createMany({
        data: dto.rules.map((rule) => ({
          folderId: id,
          principalType: rule.principalType,
          principalId: rule.principalId,
          actions: rule.actions,
          effect: rule.effect ?? AclEffect.ALLOW,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.audit.record({
      action: "folder.acl.update",
      entityType: "Folder",
      entityId: id,
      actorId: actor.id,
      detail: {
        rules: dto.rules.length,
        effect: dto.rules.map((rule) => `${rule.principalType}:${rule.principalId}:${rule.effect ?? "ALLOW"}`),
      },
    });
    return this.prisma.aclRule.findMany({ where: { folderId: id }, orderBy: { createdAt: "asc" } });
  }

  private async ensureExists(id: string): Promise<Folder> {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException("Folder not found");
    return folder;
  }
}

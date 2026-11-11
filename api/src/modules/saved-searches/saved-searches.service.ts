import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateSavedSearchDto, UpdateSavedSearchDto } from "./dto/saved-search.dto";

@Injectable()
export class SavedSearchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const items = await this.prisma.savedSearch.findMany({
      where: { userId: actor.id || "__none__" },
      orderBy: { createdAt: "desc" },
    });
    return { items, meta: { total: items.length } };
  }

  async create(principal: Principal, dto: CreateSavedSearchDto) {
    const actor = await this.access.resolveActor(principal);
    if (!actor.id) throw new BadRequestException("Actor is not provisioned");

    const saved = await this.prisma.savedSearch.create({
      data: { userId: actor.id, name: dto.name, query: dto.query as Prisma.InputJsonValue },
    });

    await this.audit.record({
      action: "saved-search.create",
      entityType: "SavedSearch",
      entityId: saved.id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { name: saved.name },
    });

    return saved;
  }

  async update(principal: Principal, id: string, dto: UpdateSavedSearchDto) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.mustFindOwned(actor.id, id);

    const updated = await this.prisma.savedSearch.update({
      where: { id: existing.id },
      data: { name: dto.name, query: dto.query as Prisma.InputJsonValue | undefined },
    });

    await this.audit.record({
      action: "saved-search.update",
      entityType: "SavedSearch",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { name: updated.name },
    });

    return updated;
  }

  async remove(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.mustFindOwned(actor.id, id);

    await this.prisma.savedSearch.delete({ where: { id: existing.id } });

    await this.audit.record({
      action: "saved-search.delete",
      entityType: "SavedSearch",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { name: existing.name },
    });

    return { id, deleted: true };
  }

  private async mustFindOwned(userId: string, id: string) {
    const saved = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!saved || saved.userId !== userId) throw new NotFoundException("Saved search not found");
    return saved;
  }
}

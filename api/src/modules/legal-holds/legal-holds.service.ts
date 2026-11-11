import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HoldStatus, Prisma } from "@prisma/client";
import { advisoryLock, documentHoldLock } from "../../common/db/advisory-lock";
import { AccessService, documentDepartmentFilter, type Actor } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateLegalHoldDto } from "./dto/create-legal-hold.dto";
import { ListLegalHoldsQuery } from "./dto/list-legal-holds.query";

const HOLD_INCLUDE = {
  placedBy: { select: { id: true, name: true } },
  releasedBy: { select: { id: true, name: true } },
  documents: {
    include: {
      document: {
        select: { id: true, docNo: true, title: true, status: true, departmentId: true },
      },
    },
  },
} satisfies Prisma.LegalHoldInclude;

type HoldWithRelations = Prisma.LegalHoldGetPayload<{ include: typeof HOLD_INCLUDE }>;

@Injectable()
export class LegalHoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: Principal, query: ListLegalHoldsQuery) {
    const actor = await this.access.resolveActor(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.LegalHoldWhereInput = {};
    if (query.status) where.status = query.status;
    if (!this.access.isGlobal(actor)) {
      where.documents = { some: { document: documentDepartmentFilter(actor.departmentId) } };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.legalHold.findMany({
        where,
        orderBy: { placedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: HOLD_INCLUDE,
      }),
      this.prisma.legalHold.count({ where }),
    ]);

    return { items: items.map((hold) => this.toDto(hold)), meta: { page, pageSize, total } };
  }

  async get(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const hold = await this.prisma.legalHold.findUnique({ where: { id }, include: HOLD_INCLUDE });
    if (!hold) throw new NotFoundException("Legal hold not found");
    await this.assertVisible(actor, hold);
    return this.toDto(hold);
  }

  async create(principal: Principal, dto: CreateLegalHoldDto) {
    const actor = await this.access.resolveActor(principal);
    const documentIds = [...new Set(dto.documentIds ?? [])].sort();
    await this.assertDocuments(actor, documentIds);

    const hold = await this.prisma.$transaction(async (tx) => {
      for (const documentId of documentIds) await advisoryLock(tx, documentHoldLock(documentId));

      const stillThere = await tx.document.count({ where: { id: { in: documentIds } } });
      if (stillThere !== documentIds.length) throw new BadRequestException("One or more documents were not found");

      const created = await tx.legalHold.create({
        data: {
          caseNo: dto.caseNo,
          reason: dto.reason,
          placedById: actor.id || null,
          documents: { create: documentIds.map((documentId) => ({ documentId })) },
        },
        include: HOLD_INCLUDE,
      });

      await this.audit.record(
        {
          action: "legal-hold.create",
          entityType: "LegalHold",
          entityId: created.id,
          actorId: actor.id || null,
          departmentId: actor.departmentId,
          detail: { caseNo: created.caseNo, documentIds },
        },
        tx,
      );

      return created;
    });

    return this.toDto(hold);
  }

  async addDocument(principal: Principal, id: string, documentId: string) {
    const actor = await this.access.resolveActor(principal);
    const hold = await this.mustFindActive(id);
    await this.assertVisible(actor, hold);
    await this.assertDocuments(actor, [documentId]);

    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, documentHoldLock(documentId));
      await this.assertHoldActive(tx, id);

      const existing = await tx.legalHoldDocument.findUnique({
        where: { holdId_documentId: { holdId: id, documentId } },
      });
      if (existing) return;

      await tx.legalHoldDocument.create({ data: { holdId: id, documentId } });

      await this.audit.record(
        {
          action: "legal-hold.add-document",
          entityType: "LegalHold",
          entityId: id,
          actorId: actor.id || null,
          departmentId: actor.departmentId,
          detail: { caseNo: hold.caseNo, documentId },
        },
        tx,
      );
    });

    return this.toDto(await this.mustFind(id));
  }

  async removeDocument(principal: Principal, id: string, documentId: string) {
    const actor = await this.access.resolveActor(principal);
    const hold = await this.mustFindActive(id);

    const link = await this.prisma.legalHoldDocument.findUnique({
      where: { holdId_documentId: { holdId: id, documentId } },
      select: { document: { select: { id: true, departmentId: true, folderId: true, ownerId: true } } },
    });
    if (!link) throw new NotFoundException("Document is not attached to this hold");
    await this.access.assertDepartmentScope(actor, link.document);

    await this.prisma.$transaction(async (tx) => {
      await this.assertHoldActive(tx, id);

      const removed = await tx.legalHoldDocument.deleteMany({ where: { holdId: id, documentId } });
      if (removed.count === 0) throw new NotFoundException("Document is not attached to this hold");

      await this.audit.record(
        {
          action: "legal-hold.remove-document",
          entityType: "LegalHold",
          entityId: id,
          actorId: actor.id || null,
          departmentId: actor.departmentId,
          detail: { caseNo: hold.caseNo, documentId },
        },
        tx,
      );
    });

    return this.toDto(await this.mustFind(id));
  }

  async release(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const hold = await this.mustFind(id);
    await this.assertVisible(actor, hold);
    if (hold.status === HoldStatus.RELEASED) throw new ConflictException("Legal hold is already released");
    await this.assertWholeHold(actor, id);

    const releasedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.legalHold.updateMany({
        where: { id, status: { not: HoldStatus.RELEASED } },
        data: { status: HoldStatus.RELEASED, releasedById: actor.id || null, releasedAt },
      });
      if (claimed.count === 0) throw new ConflictException("Legal hold is already released");

      const fresh = await tx.legalHold.findUnique({ where: { id }, include: HOLD_INCLUDE });
      if (!fresh) throw new NotFoundException("Legal hold not found");

      await this.audit.record(
        {
          action: "legal-hold.release",
          entityType: "LegalHold",
          entityId: id,
          actorId: actor.id || null,
          departmentId: actor.departmentId,
          detail: { caseNo: fresh.caseNo, documentCount: fresh.documents.length },
        },
        tx,
      );

      return fresh;
    });

    return this.toDto(updated);
  }

  private async assertHoldActive(tx: Prisma.TransactionClient, id: string) {
    const fresh = await tx.legalHold.findUnique({ where: { id }, select: { status: true } });
    if (!fresh) throw new NotFoundException("Legal hold not found");
    if (fresh.status !== HoldStatus.ACTIVE) throw new ConflictException("Legal hold has been released");
  }

  private async assertDocuments(actor: Actor, documentIds: string[]) {
    if (documentIds.length === 0) return;
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, departmentId: true, folderId: true, ownerId: true },
    });
    if (documents.length !== documentIds.length) throw new BadRequestException("One or more documents were not found");
    if (this.access.isGlobal(actor)) return;

    for (const document of documents) {
      await this.access.assertDepartmentScope(actor, document);
    }
  }

  private async assertVisible(actor: Actor, hold: HoldWithRelations) {
    if (this.access.isGlobal(actor)) return;
    const scoped = await this.prisma.document.count({
      where: { ...documentDepartmentFilter(actor.departmentId), holds: { some: { holdId: hold.id } } },
    });
    if (scoped === 0) throw new ForbiddenException("Out of department scope");
  }

  private async assertWholeHold(actor: Actor, holdId: string) {
    if (this.access.isGlobal(actor)) return;
    const outside = await this.prisma.document.count({
      where: { holds: { some: { holdId } }, NOT: documentDepartmentFilter(actor.departmentId) },
    });
    if (outside > 0) {
      throw new ForbiddenException("This hold covers documents outside your department; only a system administrator can release it");
    }
  }

  private async mustFind(id: string): Promise<HoldWithRelations> {
    const hold = await this.prisma.legalHold.findUnique({ where: { id }, include: HOLD_INCLUDE });
    if (!hold) throw new NotFoundException("Legal hold not found");
    return hold;
  }

  private async mustFindActive(id: string) {
    const hold = await this.mustFind(id);
    if (hold.status !== HoldStatus.ACTIVE) throw new ConflictException("Legal hold has been released");
    return hold;
  }

  private toDto(hold: HoldWithRelations) {
    return {
      id: hold.id,
      caseNo: hold.caseNo,
      reason: hold.reason,
      status: hold.status,
      placedById: hold.placedById,
      placedByName: hold.placedBy?.name ?? null,
      placedAt: hold.placedAt,
      releasedById: hold.releasedById,
      releasedByName: hold.releasedBy?.name ?? null,
      releasedAt: hold.releasedAt,
      documents: hold.documents.map((entry) => ({ ...entry.document, addedAt: entry.addedAt })),
    };
  }
}

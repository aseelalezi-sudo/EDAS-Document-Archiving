import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AclAction, DocumentStatus, NotificationLevel, Prisma, RetentionAction } from "@prisma/client";
import { AccessService, departmentMatch, type Actor } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { advisoryLock, documentHoldLock } from "../../common/db/advisory-lock";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateRetentionPolicyDto } from "./dto/create-retention-policy.dto";
import { ExecuteRetentionDto } from "./dto/execute-retention.dto";
import { ListRetentionQuery } from "./dto/list-retention.query";
import { ScheduleRetentionDto } from "./dto/schedule-retention.dto";
import { UpdateRetentionItemDto } from "./dto/update-retention-item.dto";
import { UpdateRetentionPolicyDto } from "./dto/update-retention-policy.dto";

const ITEM_INCLUDE = {
  document: {
    select: {
      id: true,
      docNo: true,
      title: true,
      status: true,
      isRecord: true,
      departmentId: true,
      retentionEnd: true,
      folderId: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  },
  policy: { select: { id: true, name: true, action: true, retentionMonths: true, legalBasis: true } },
} satisfies Prisma.RetentionItemInclude;

const ACTION_TO_STATUS: Record<RetentionAction, DocumentStatus> = {
  REVIEW: DocumentStatus.IN_REVIEW,
  ARCHIVE: DocumentStatus.ARCHIVED,
  DESTROY: DocumentStatus.DISPOSED,
};

export type DestroyedFileRecord = {
  version: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: string | null;
  uploadedAt: string;
};

export interface DestructionCertificate {
  certificateRef: string;
  auditEventId: string;
  auditHash: string | null;
  destroyedAt: string;
  performedById: string | null;
  performedBy: string | null;
  retentionItemId: string;
  document: { id: string; docNo: string; title: string };
  policy: { id: string; name: string; retentionMonths: number; legalBasis: string | null };
  dueAt: string | null;
  note: string | null;
  files: DestroyedFileRecord[];
  fileCount: number;
  totalBytes: number;
  storageErrors: number;
}

interface DestructionPlan {
  files: DestroyedFileRecord[];
  orphanFileIds: string[];
  storageKeys: string[];
  totalBytes: number;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  async listPolicies(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const where: Prisma.RetentionPolicyWhereInput = this.access.isGlobal(actor)
      ? {}
      : { OR: [{ departmentId: departmentMatch(actor.departmentId) }, { departmentId: null }] };

    const items = await this.prisma.retentionPolicy.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { items: true } }, department: { select: { id: true, name: true } } },
    });
    return { items, meta: { total: items.length } };
  }

  async createPolicy(principal: Principal, dto: CreateRetentionPolicyDto) {
    const actor = await this.access.resolveActor(principal);
    const departmentId = this.access.isGlobal(actor) ? (dto.departmentId ?? null) : actor.departmentId;
    if (!this.access.isGlobal(actor) && !departmentId) throw new BadRequestException("Actor has no department");

    const policy = await this.prisma.retentionPolicy.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        legalBasis: dto.legalBasis,
        retentionMonths: dto.retentionMonths,
        action: dto.action,
        isActive: dto.isActive ?? true,
        departmentId,
      },
    });

    await this.audit.record({
      action: "retention.policy.create",
      entityType: "RetentionPolicy",
      entityId: policy.id,
      actorId: actor.id || null,
      departmentId,
      detail: { name: policy.name, retentionMonths: policy.retentionMonths, action: policy.action },
    });

    return policy;
  }

  async updatePolicy(principal: Principal, id: string, dto: UpdateRetentionPolicyDto) {
    const actor = await this.access.resolveActor(principal);
    const policy = await this.prisma.retentionPolicy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException("Retention policy not found");
    this.assertPolicyScope(actor, policy.departmentId);
    if (dto.departmentId !== undefined) this.assertPolicyScope(actor, dto.departmentId);

    const updated = await this.prisma.retentionPolicy.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        legalBasis: dto.legalBasis,
        retentionMonths: dto.retentionMonths,
        action: dto.action,
        departmentId: dto.departmentId,
        isActive: dto.isActive,
      },
    });

    await this.audit.record({
      action: "retention.policy.update",
      entityType: "RetentionPolicy",
      entityId: id,
      actorId: actor.id || null,
      departmentId: updated.departmentId,
      detail: { ...dto },
    });

    return updated;
  }

  async deletePolicy(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const policy = await this.prisma.retentionPolicy.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!policy) throw new NotFoundException("Retention policy not found");
    this.assertPolicyScope(actor, policy.departmentId);
    if (policy._count.items > 0) throw new ConflictException("Retention policy is in use");

    await this.prisma.retentionPolicy.delete({ where: { id } });

    await this.audit.record({
      action: "retention.policy.delete",
      entityType: "RetentionPolicy",
      entityId: id,
      actorId: actor.id || null,
      departmentId: policy.departmentId,
      detail: { name: policy.name },
    });

    return { id, deleted: true };
  }

  async listItems(principal: Principal, query: ListRetentionQuery) {
    const actor = await this.access.resolveActor(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.RetentionItemWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.policyId) where.policyId = query.policyId;
    if (query.dueOnly) where.dueAt = { lte: new Date() };

    const departmentId = this.access.isGlobal(actor) ? query.departmentId : departmentMatch(actor.departmentId);
    if (departmentId) where.document = { departmentId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.retentionItem.findMany({
        where,
        orderBy: { dueAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: ITEM_INCLUDE,
      }),
      this.prisma.retentionItem.count({ where }),
    ]);

    return { items: await this.withHoldFlags(items), meta: { page, pageSize, total } };
  }

  async schedule(principal: Principal, dto: ScheduleRetentionDto) {
    const document = await this.prisma.document.findUnique({ where: { id: dto.documentId } });
    if (!document) throw new NotFoundException("Document not found");

    const actor = await this.access.assert(principal, AclAction.APPROVE, document.folderId);
    this.assertDepartment(actor, document.departmentId);

    const policy = await this.prisma.retentionPolicy.findUnique({ where: { id: dto.policyId } });
    if (!policy) throw new NotFoundException("Retention policy not found");
    if (!policy.isActive) throw new BadRequestException("Retention policy is inactive");
    if (policy.departmentId && document.departmentId && policy.departmentId !== document.departmentId) {
      throw new BadRequestException("Retention policy does not apply to this department");
    }

    const dueAt = document.retentionEnd ?? this.addMonths(document.createdAt, policy.retentionMonths);

    const item = await this.prisma.retentionItem.upsert({
      where: { documentId_policyId: { documentId: document.id, policyId: policy.id } },
      update: { dueAt, action: policy.action, status: "scheduled", executedAt: null },
      create: { documentId: document.id, policyId: policy.id, dueAt, action: policy.action },
      include: ITEM_INCLUDE,
    });

    await this.prisma.document.update({ where: { id: document.id }, data: { retentionEnd: dueAt } });

    await this.audit.record({
      action: "retention.schedule",
      entityType: "Document",
      entityId: document.id,
      actorId: actor.id || null,
      departmentId: document.departmentId,
      detail: { policyId: policy.id, dueAt: dueAt.toISOString(), action: policy.action },
    });

    if (document.ownerId) {
      await this.notifications.push({
        userId: document.ownerId,
        title: "جدولة احتفاظ",
        message: `تمت جدولة الوثيقة ${document.docNo} وفق سياسة «${policy.name}»`,
        level: NotificationLevel.INFO,
        entityType: "Document",
        entityId: document.id,
      });
    }

    return (await this.withHoldFlags([item]))[0];
  }

  async updateItem(principal: Principal, id: string, dto: UpdateRetentionItemDto) {
    const item = await this.prisma.retentionItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!item) throw new NotFoundException("Retention item not found");

    const actor = await this.access.assert(principal, AclAction.APPROVE, item.document.folderId);
    this.assertDepartment(actor, item.document.departmentId);
    if (item.status === "executed") throw new ConflictException("Retention item already executed");

    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException("Invalid due date");

    const [, updated] = await this.prisma.$transaction([
      this.prisma.document.update({ where: { id: item.documentId }, data: { retentionEnd: dueAt } }),
      this.prisma.retentionItem.update({ where: { id }, data: { dueAt }, include: ITEM_INCLUDE }),
    ]);

    await this.audit.record({
      action: "retention.extend",
      entityType: "Document",
      entityId: item.documentId,
      actorId: actor.id || null,
      departmentId: item.document.departmentId,
      detail: { retentionItemId: id, previousDueAt: item.dueAt, dueAt },
    });

    return (await this.withHoldFlags([updated]))[0];
  }

  async execute(principal: Principal, id: string, dto: ExecuteRetentionDto) {
    const item = await this.prisma.retentionItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!item) throw new NotFoundException("Retention item not found");

    const actor = await this.access.assert(principal, AclAction.APPROVE, item.document.folderId);
    this.assertDepartment(actor, item.document.departmentId);

    if (item.status === "executed") throw new ConflictException("Retention item already executed");

    const action = dto.action ?? item.action;
    const destroying = action === RetentionAction.DESTROY;
    const executedAt = new Date();

    const { document, event, plan } = await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, documentHoldLock(item.documentId));

      if (destroying) {
        const activeHolds = await tx.legalHoldDocument.count({
          where: { documentId: item.documentId, hold: { status: "ACTIVE" } },
        });
        if (activeHolds > 0) throw new ConflictException("Document is under legal hold");
      }

      const claimed = await tx.retentionItem.updateMany({
        where: { id, status: { not: "executed" } },
        data: { status: "executed", executedAt, action },
      });
      if (claimed.count === 0) throw new ConflictException("Retention item already executed");

      const destructionPlan = destroying ? await this.buildDestructionPlan(item.documentId, tx) : null;
      if (destructionPlan) {
        await tx.documentVersion.deleteMany({ where: { documentId: item.documentId } });
        await tx.fileObject.deleteMany({ where: { id: { in: destructionPlan.orphanFileIds } } });
      }

      const updatedDocument = await tx.document.update({
        where: { id: item.documentId },
        data: { status: ACTION_TO_STATUS[action], ...(destructionPlan ? { sizeBytes: 0n } : {}) },
        select: { id: true, docNo: true, title: true, status: true, retentionEnd: true },
      });

      const auditEvent = await this.audit.record(
        {
          action: destroying ? "retention.destroy" : "retention.execute",
          entityType: "Document",
          entityId: item.documentId,
          actorId: actor.id || null,
          actorName: principal.name ?? principal.username ?? null,
          departmentId: item.document.departmentId,
          result: "success",
          detail: {
            retentionItemId: id,
            action,
            policyId: item.policyId,
            note: dto.note ?? null,
            ...(destructionPlan ? { destruction: this.destructionAuditDetail(item, destructionPlan) } : {}),
          },
        },
        tx,
      );

      return { document: updatedDocument, event: auditEvent, plan: destructionPlan };
    });

    const storageErrors = plan ? await this.removeStoredObjects(item.documentId, plan) : 0;
    if (storageErrors > 0) {
      await this.audit.record({
        action: "retention.destroy.storage",
        entityType: "Document",
        entityId: item.documentId,
        actorId: actor.id || null,
        actorName: principal.name ?? principal.username ?? null,
        departmentId: item.document.departmentId,
        result: "failure",
        detail: { retentionItemId: id, storageErrors, storageKeys: plan?.storageKeys ?? [] },
      });
    }

    const updated = await this.prisma.retentionItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    const certificate = plan ? this.certificateFromEvent(event, updated ?? item) : null;
    if (certificate) certificate.storageErrors = storageErrors;

    if (item.document.ownerId) {
      await this.notifications.push({
        userId: item.document.ownerId,
        title: destroying ? "تنفيذ إتلاف" : "تنفيذ احتفاظ",
        message: `نُفّذ إجراء ${action} على الوثيقة ${item.document.docNo}`,
        level: destroying ? NotificationLevel.WARNING : NotificationLevel.SUCCESS,
        entityType: "Document",
        entityId: item.documentId,
      });
    }

    return { item: (await this.withHoldFlags([updated ?? item]))[0], document, certificate };
  }

  async certificate(principal: Principal, id: string): Promise<DestructionCertificate> {
    const item = await this.prisma.retentionItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!item) throw new NotFoundException("Retention item not found");

    const actor = await this.access.resolveActor(principal);
    this.assertDepartment(actor, item.document.departmentId);

    const events = await this.prisma.auditEvent.findMany({
      where: { entityType: "Document", entityId: item.documentId, action: "retention.destroy" },
      orderBy: { ts: "desc" },
      take: 20,
    });
    const event = events.find((candidate) => this.retentionItemIdOf(candidate) === item.id) ?? events[0];
    if (!event) throw new NotFoundException("No destruction certificate for this retention item");

    const certificate = this.certificateFromEvent(event, item);
    if (!certificate) throw new NotFoundException("No destruction certificate for this retention item");

    const storageEvents = await this.prisma.auditEvent.findMany({
      where: { entityType: "Document", entityId: item.documentId, action: "retention.destroy.storage" },
      orderBy: { ts: "desc" },
      take: 20,
    });
    const storageEvent = storageEvents.find((candidate) => this.retentionItemIdOf(candidate) === item.id);
    const reported = (storageEvent?.detail as { storageErrors?: unknown } | null)?.storageErrors;
    if (certificate && typeof reported === "number") certificate.storageErrors = reported;

    return certificate;
  }

  private async withHoldFlags<T extends { documentId: string }>(items: T[]): Promise<(T & { onHold: boolean })[]> {
    if (items.length === 0) return [];
    const holds = await this.prisma.legalHoldDocument.findMany({
      where: { documentId: { in: items.map((item) => item.documentId) }, hold: { status: "ACTIVE" } },
      select: { documentId: true },
    });
    const held = new Set(holds.map((hold) => hold.documentId));
    return items.map((item) => ({ ...item, onHold: held.has(item.documentId) }));
  }

  private async buildDestructionPlan(documentId: string, tx: Prisma.TransactionClient): Promise<DestructionPlan> {
    const versions = await tx.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: "asc" },
      select: {
        version: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        file: {
          select: { id: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true, checksumSha256: true },
        },
      },
    });

    const fileIds = versions.map((version) => version.file.id);
    const sharedFileIds =
      fileIds.length > 0
        ? await tx.documentVersion.findMany({
            where: { fileId: { in: fileIds }, documentId: { not: documentId } },
            select: { fileId: true },
          })
        : [];
    const stillReferenced = new Set(sharedFileIds.map((version) => version.fileId));
    const orphanFileIds = fileIds.filter((fileId) => !stillReferenced.has(fileId));

    return {
      files: versions.map((version) => ({
        version: version.version,
        originalName: version.file.originalName,
        mimeType: version.file.mimeType,
        sizeBytes: Number(version.file.sizeBytes),
        checksumSha256: version.file.checksumSha256,
        uploadedBy: version.createdBy?.name ?? null,
        uploadedAt: version.createdAt.toISOString(),
      })),
      orphanFileIds,
      storageKeys: versions.filter((version) => orphanFileIds.includes(version.file.id)).map((version) => version.file.storageKey),
      totalBytes: versions.reduce((sum, version) => sum + Number(version.file.sizeBytes), 0),
    };
  }

  private async removeStoredObjects(documentId: string, plan: DestructionPlan): Promise<number> {
    const results = await Promise.allSettled(plan.storageKeys.map((key) => this.storage.remove(key)));
    return results.reduce((failures, result) => {
      if (result.status === "fulfilled") return failures;
      this.logger.warn(`destroy(${documentId}) could not delete a stored object: ${(result.reason as Error).message}`);
      return failures + 1;
    }, 0);
  }

  /**
   * The certificate is written inside the deletion transaction, so it can only attest to the rows the transaction
   * removed. Anything that fails during the post-commit storage sweep is attested by its own
   * `retention.destroy.storage` event, which `certificate` folds back into the reported figure.
   */
  private destructionAuditDetail(item: Prisma.RetentionItemGetPayload<{ include: typeof ITEM_INCLUDE }>, plan: DestructionPlan) {
    return {
      policyName: item.policy.name,
      retentionMonths: item.policy.retentionMonths,
      legalBasis: item.policy.legalBasis,
      dueAt: item.dueAt.toISOString(),
      files: plan.files,
      fileCount: plan.files.length,
      totalBytes: plan.totalBytes,
      storageErrors: 0,
    };
  }

  private retentionItemIdOf(event: { detail: Prisma.JsonValue }): string | null {
    const detail = event.detail as { retentionItemId?: unknown } | null;
    return typeof detail?.retentionItemId === "string" ? detail.retentionItemId : null;
  }

  private certificateFromEvent(
    event: { id: string; ts: Date; hash: string | null; actorId: string | null; actorName: string | null; detail: Prisma.JsonValue },
    item: Prisma.RetentionItemGetPayload<{ include: typeof ITEM_INCLUDE }>,
  ): DestructionCertificate | null {
    const detail = event.detail as
      { note?: string | null; destruction?: ReturnType<RetentionService["destructionAuditDetail"]> } | null | undefined;
    const destruction = detail?.destruction;
    if (!destruction) return null;

    return {
      certificateRef: `DES-${event.id.slice(0, 8).toUpperCase()}-${event.ts.getUTCFullYear()}`,
      auditEventId: event.id,
      auditHash: event.hash,
      destroyedAt: event.ts.toISOString(),
      performedById: event.actorId,
      performedBy: event.actorName,
      retentionItemId: item.id,
      document: { id: item.documentId, docNo: item.document.docNo, title: item.document.title },
      policy: {
        id: item.policy.id,
        name: destruction.policyName ?? item.policy.name,
        retentionMonths: destruction.retentionMonths ?? item.policy.retentionMonths,
        legalBasis: destruction.legalBasis ?? item.policy.legalBasis,
      },
      dueAt: destruction.dueAt ?? item.dueAt.toISOString(),
      note: detail?.note ?? null,
      files: destruction.files ?? [],
      fileCount: destruction.fileCount ?? destruction.files?.length ?? 0,
      totalBytes: destruction.totalBytes ?? 0,
      storageErrors: destruction.storageErrors ?? 0,
    };
  }

  private assertPolicyScope(actor: Actor, departmentId: string | null) {
    if (!this.access.isGlobal(actor) && departmentId !== actor.departmentId) {
      throw new ForbiddenException("Out of department scope");
    }
  }

  private assertDepartment(actor: Actor, departmentId: string | null) {
    if (!this.access.isGlobal(actor) && departmentId && departmentId !== actor.departmentId) {
      throw new ForbiddenException("Out of department scope");
    }
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }
}

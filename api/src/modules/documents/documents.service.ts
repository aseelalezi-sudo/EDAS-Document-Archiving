import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AclAction, Document, DocumentStatus, Prisma } from "@prisma/client";
import { advisoryLock, documentHoldLock } from "../../common/db/advisory-lock";
import { isUniqueViolation } from "../../common/db/prisma-errors";
import { AccessService, type Actor } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { removeCurrentObjects } from "../../common/storage/remove-current-objects";
import { StorageService } from "../../common/storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { PreviewService } from "../preview/preview.service";
import { AddVersionDto } from "./dto/add-version.dto";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { ListDocumentsQuery } from "./dto/list-documents.query";
import { UpdateDocumentDto } from "./dto/update-document.dto";

const LIST_SELECT = {
  id: true,
  docNo: true,
  title: true,
  titleEn: true,
  description: true,
  category: true,
  classification: true,
  status: true,
  isRecord: true,
  currentVersion: true,
  fileType: true,
  sizeBytes: true,
  tags: true,
  retentionEnd: true,
  folderId: true,
  departmentId: true,
  sectionId: true,
  projectId: true,
  ownerId: true,
  checkedOutById: true,
  checkedOutAt: true,
  signatureStatus: true,
  signedById: true,
  signedAt: true,
  deletedAt: true,
  deletedById: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { name: true, nameEn: true } },
  department: { select: { name: true, nameEn: true } },
  folder: { select: { name: true } },
  checkedOutBy: { select: { name: true } },
  signedBy: { select: { name: true } },
  deletedBy: { select: { name: true } },
} satisfies Prisma.DocumentSelect;

type DocumentRow = Prisma.DocumentGetPayload<{ select: typeof LIST_SELECT }>;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly preview: PreviewService,
  ) {}

  async list(principal: Principal, query: ListDocumentsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { actor, departmentId } = await this.access.listScope(principal);
    const visibility = await this.access.documentVisibilityFilter(actor);

    const where = this.scopeWhere(departmentId, query, visibility);
    await this.applySearch(where, query.q);
    where.deletedAt = null;

    if (query.after !== undefined) {
      return this.paginateAfter(where, query.after, pageSize, departmentId ?? actor.departmentId);
    }

    return this.paginate(where, page, pageSize, departmentId ?? actor.departmentId);
  }

  async trash(principal: Principal, query: ListDocumentsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { actor, departmentId } = await this.access.listScope(principal);
    const visibility = await this.access.documentVisibilityFilter(actor);

    const where = this.scopeWhere(departmentId, query, visibility);
    await this.applySearch(where, query.q);
    where.deletedAt = { not: null };

    return this.paginate(where, page, pageSize, departmentId ?? actor.departmentId);
  }

  async trashIds(principal: Principal) {
    const { actor, departmentId } = await this.access.listScope(principal);
    if (actor.role !== "SYSTEM_ADMIN") throw new ForbiddenException("Only system administrators can purge documents");
    const visibility = await this.access.documentVisibilityFilter(actor);
    const where = this.scopeWhere(departmentId, {}, visibility);
    const rows = await this.prisma.document.findMany({ where: { ...where, deletedAt: { not: null } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async purgeTrash(principal: Principal, ids: string[]) {
    const actor = await this.access.resolveActor(principal);
    if (actor.role !== "SYSTEM_ADMIN") throw new ForbiddenException("Only system administrators can purge documents");

    let failed = 0;
    let storageErrors = 0;
    for (let offset = 0; offset < ids.length; offset += 5) {
      const results = await Promise.allSettled(ids.slice(offset, offset + 5).map((id) => this.purge(principal, id)));
      for (const result of results) {
        if (result.status === "rejected") failed++;
        else storageErrors += result.value.storageErrors;
      }
    }
    return { failed, storageErrors };
  }

  async get(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    await this.authorize(principal, AclAction.VIEW, document);

    return this.detail(id);
  }

  async permissions(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.access.resolveActor(principal);
    await this.access.assertDepartmentScope(actor, document);
    const actions = await this.access.permissionsFor(actor, document.folderId);
    return { documentId: id, actions: [...actions] };
  }

  async create(principal: Principal, dto: CreateDocumentDto) {
    const actor = await this.access.assert(principal, AclAction.CREATE, dto.folderId ?? null);
    const file = await this.attachableFile(actor, dto.fileId);

    const requestedDepartment = this.access.isGlobal(actor) ? dto.departmentId : actor.departmentId;
    const departmentId = dto.folderId
      ? await this.folderDepartment(dto.folderId, requestedDepartment ?? null)
      : (requestedDepartment ?? null);
    if (requestedDepartment && departmentId !== requestedDepartment) {
      throw new BadRequestException("Folder belongs to another department");
    }
    const docNo = `DOC-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          docNo,
          title: dto.title,
          titleEn: dto.titleEn,
          description: dto.description,
          category: dto.category,
          classification: dto.classification,
          folderId: dto.folderId,
          departmentId,
          sectionId: dto.sectionId,
          projectId: dto.projectId,
          tags: dto.tags ?? [],
          ownerId: actor.id || null,
          fileType: file.mimeType,
          sizeBytes: file.sizeBytes,
          versions: {
            create: {
              version: 1,
              fileId: file.id,
              comment: dto.comment,
              isCurrent: true,
              createdById: actor.id || null,
            },
          },
        },
      });

      await this.audit.record(
        {
          action: "document.create",
          entityType: "Document",
          entityId: created.id,
          actorId: actor.id,
          departmentId,
          detail: { docNo: created.docNo, title: created.title, fileId: file.id },
        },
        tx,
      );

      return created;
    });

    void this.preview.prewarm(file.id, actor);

    return this.detail(document.id);
  }

  async update(principal: Principal, id: string, dto: UpdateDocumentDto) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.EDIT, document);

    const moving = Boolean(dto.folderId) && dto.folderId !== document.folderId;
    let departmentId: string | null | undefined;
    if (moving) {
      await this.access.assert(principal, AclAction.CREATE, dto.folderId);
      departmentId = await this.folderDepartment(dto.folderId!, document.departmentId);
      if (!this.access.isGlobal(actor) && departmentId && departmentId !== actor.departmentId) {
        throw new ForbiddenException("Out of department scope");
      }
    }

    const status = this.transitionStatus(dto.transition, document);

    const guard: Prisma.DocumentWhereInput = { id };
    if (status !== undefined) {
      guard.deletedAt = null;
      guard.status = { not: DocumentStatus.DISPOSED };
      if (status === DocumentStatus.DRAFT) guard.isRecord = false;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.updateMany({
        where: guard,
        data: {
          title: dto.title,
          titleEn: dto.titleEn,
          description: dto.description,
          category: dto.category,
          classification: dto.classification,
          status,
          folderId: dto.folderId,
          departmentId,
          sectionId: dto.sectionId,
          projectId: dto.projectId,
          tags: dto.tags,
          retentionEnd: dto.retentionEnd ? new Date(dto.retentionEnd) : undefined,
        },
      });

      if (updated.count === 0) {
        // The row moved under us: re-apply the same lifecycle rule to the fresh state so the client gets the real reason.
        const current = await tx.document.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Document not found");
        this.transitionStatus(dto.transition, current);
        throw new ConflictException("Document changed while it was being updated");
      }

      await this.audit.record(
        {
          action: "document.update",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: departmentId === undefined ? document.departmentId : departmentId,
          detail: { ...dto },
        },
        tx,
      );
    });

    return this.detail(id);
  }

  private transitionStatus(transition: UpdateDocumentDto["transition"], document: Document): DocumentStatus | undefined {
    if (!transition) return undefined;
    if (document.status === DocumentStatus.DISPOSED) throw new ConflictException("Disposed documents cannot change status");
    if (document.deletedAt) throw new ConflictException("Document is in the trash");
    if (transition === "ARCHIVE") return DocumentStatus.ARCHIVED;
    if (document.isRecord) throw new ConflictException("Declared records cannot be reopened");
    return DocumentStatus.DRAFT;
  }

  async remove(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.DELETE, document);

    if (document.deletedAt) return { id, deleted: true, deletedAt: document.deletedAt };
    if (document.isRecord) throw new ConflictException("Declared records cannot be deleted");

    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, documentHoldLock(id));

      const activeHolds = await tx.legalHoldDocument.count({ where: { documentId: id, hold: { status: "ACTIVE" } } });
      if (activeHolds > 0) throw new ConflictException("Document is under legal hold");

      const claimed = await tx.document.updateMany({
        where: { id, deletedAt: null, isRecord: false },
        data: { deletedAt, deletedById: actor.id || null },
      });
      if (claimed.count === 0) throw new ConflictException("Document is already in the trash");

      await this.audit.record(
        {
          action: "document.trash",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { docNo: document.docNo },
        },
        tx,
      );
    });

    return { id, deleted: true, deletedAt };
  }

  async restore(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.DELETE, document);
    if (!document.deletedAt) throw new BadRequestException("Document is not in the trash");

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null, deletedById: null },
      });
      if (claimed.count === 0) throw new BadRequestException("Document is not in the trash");

      await this.audit.record(
        {
          action: "document.restore",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { docNo: document.docNo },
        },
        tx,
      );
    });

    return this.detail(id);
  }

  async purge(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.DELETE, document);
    if (actor.role !== "SYSTEM_ADMIN") throw new ForbiddenException("Only system administrators can purge documents");
    if (!document.deletedAt) throw new ConflictException("Only trashed documents can be purged");

    const { storedFiles } = await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, documentHoldLock(id));

      const current = await tx.document.findUnique({ where: { id }, select: { deletedAt: true, status: true } });
      if (!current) throw new NotFoundException("Document not found");
      if (!current.deletedAt) throw new ConflictException("Only trashed documents can be purged");

      const activeHolds = await tx.legalHoldDocument.count({ where: { documentId: id, hold: { status: "ACTIVE" } } });
      if (activeHolds > 0) throw new ConflictException("Document is under legal hold");

      const approvals = await tx.approvalInstance.findMany({ where: { documentId: id }, select: { id: true } });
      const versionFileIds = (await tx.documentVersion.findMany({ where: { documentId: id }, select: { fileId: true } })).map(
        (version) => version.fileId,
      );
      const orphanFileIds = await this.unreferencedFileIds(id, versionFileIds, tx);
      const files = orphanFileIds.length
        ? await tx.fileObject.findMany({ where: { id: { in: orphanFileIds } }, select: { id: true, storageKey: true } })
        : [];

      await tx.approvalDecision.deleteMany({ where: { instanceId: { in: approvals.map((approval) => approval.id) } } });
      await tx.approvalInstance.deleteMany({ where: { documentId: id } });
      await tx.documentVersion.deleteMany({ where: { documentId: id } });
      await tx.fileObject.deleteMany({ where: { id: { in: orphanFileIds } } });
      await tx.retentionItem.deleteMany({ where: { documentId: id } });
      await tx.legalHoldDocument.deleteMany({ where: { documentId: id } });
      const removed = await tx.document.deleteMany({ where: { id, deletedAt: { not: null } } });
      if (removed.count === 0) throw new ConflictException("Document changed while it was being purged");

      await this.audit.record(
        {
          action: "document.purge",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { docNo: document.docNo, purgedFiles: files.length, storageKeys: files.map((file) => file.storageKey) },
        },
        tx,
      );

      return { storedFiles: files };
    });

    const failedKeys = await removeCurrentObjects(this.storage, storedFiles.map((file) => file.storageKey));
    if (storedFiles.length) {
      await this.audit.record({
        action: "document.purge.storage",
        entityType: "Document",
        entityId: id,
        actorId: actor.id,
        departmentId: document.departmentId,
        result: failedKeys.length ? "failure" : "success",
        detail: { docNo: document.docNo, storageErrors: failedKeys.length, storageKeys: failedKeys },
      });
    }

    return { id, deleted: true, purged: true, storageErrors: failedKeys.length };
  }

  async addVersion(principal: Principal, id: string, dto: AddVersionDto) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.EDIT, document);

    if (document.status === DocumentStatus.DISPOSED) throw new ConflictException("Disposed documents cannot accept new versions");
    if (document.deletedAt) throw new ConflictException("Document is in the trash");

    const file = await this.attachableFile(actor, dto.fileId);

    let version: { version: number; fileId: string; isCurrent: boolean };
    try {
      version = await this.prisma.$transaction(async (tx) => {
        await this.lockVersionTarget(tx, id);

        const latest = await tx.documentVersion.findFirst({
          where: { documentId: id },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (latest?.version ?? 0) + 1;

        await tx.documentVersion.updateMany({ where: { documentId: id }, data: { isCurrent: false } });
        const created = await tx.documentVersion.create({
          data: {
            documentId: id,
            fileId: file.id,
            version: nextVersion,
            comment: dto.comment,
            isCurrent: true,
            createdById: actor.id || null,
          },
        });

        await tx.document.update({
          where: { id },
          data: {
            currentVersion: nextVersion,
            fileType: file.mimeType,
            sizeBytes: file.sizeBytes,
            signatureStatus: "NONE",
            signedById: null,
            signedAt: null,
          },
        });

        await this.audit.record(
          {
            action: "document.version.add",
            entityType: "Document",
            entityId: id,
            actorId: actor.id,
            departmentId: document.departmentId,
            detail: { version: nextVersion, fileId: file.id },
          },
          tx,
        );

        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Another version was added at the same time; please retry");
      throw error;
    }

    void this.preview.prewarm(version.fileId, actor);

    return { documentId: id, version: version.version, fileId: version.fileId, isCurrent: version.isCurrent };
  }

  async restoreVersion(principal: Principal, id: string, versionId: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.EDIT, document);

    if (document.status === DocumentStatus.DISPOSED) throw new ConflictException("Disposed documents cannot change version");
    if (document.deletedAt) throw new ConflictException("Document is in the trash");

    const fileId = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockVersionTarget(tx, id);
      const version = await tx.documentVersion.findFirst({
        where: { id: versionId, documentId: id },
        include: { file: true },
      });
      if (!version) throw new NotFoundException("Version not found");
      if (version.version === 1 && current.isRecord) throw new ConflictException("Declared records cannot be reopened");

      await tx.documentVersion.updateMany({ where: { documentId: id }, data: { isCurrent: false } });
      await tx.documentVersion.update({ where: { id: version.id }, data: { isCurrent: true } });
      await tx.document.update({
        where: { id },
        data: {
          currentVersion: version.version,
          fileType: version.file.mimeType,
          sizeBytes: version.file.sizeBytes,
          status: version.version === 1 ? "DRAFT" : undefined,
          signatureStatus: "NONE",
          signedById: null,
          signedAt: null,
        },
      });

      await this.audit.record(
        {
          action: "document.version.restore",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { version: version.version, versionId },
        },
        tx,
      );
      return version.file.id;
    });

    void this.preview.prewarm(fileId, actor);

    return this.detail(id);
  }

  async checkout(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.EDIT, document);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: {
          id,
          deletedAt: null,
          status: { not: DocumentStatus.DISPOSED },
          OR: [{ checkedOutById: null }, { checkedOutById: actor.id }],
        },
        data: { checkedOutById: actor.id || null, checkedOutAt: new Date() },
      });
      if (claimed.count === 0) {
        if (document.checkedOutById && document.checkedOutById !== actor.id) {
          throw new ConflictException("Document is checked out by another user");
        }
        throw new ConflictException("Document is not available for checkout");
      }

      await this.audit.record(
        {
          action: "document.checkout",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { docNo: document.docNo },
        },
        tx,
      );
    });

    return this.detail(id);
  }

  async checkin(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.EDIT, document);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: this.access.isGlobal(actor) ? { id } : { id, OR: [{ checkedOutById: actor.id }, { checkedOutById: null }] },
        data: { checkedOutById: null, checkedOutAt: null },
      });
      if (claimed.count === 0 && document.checkedOutById && document.checkedOutById !== actor.id) {
        throw new ForbiddenException("Only the user who checked out the document can check it in");
      }

      await this.audit.record(
        {
          action: "document.checkin",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { docNo: document.docNo },
        },
        tx,
      );
    });

    return this.detail(id);
  }

  async requestSignature(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.EDIT, document);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: { id, deletedAt: null, status: { not: DocumentStatus.DISPOSED }, signatureStatus: { not: "SIGNED" } },
        data: { signatureStatus: "PENDING" },
      });
      if (claimed.count === 0) throw new ConflictException("Document is already signed or is not available");

      await this.audit.record(
        {
          action: "document.signature.request",
          entityType: "Document",
          entityId: id,
          actorId: actor.id,
          departmentId: document.departmentId,
          detail: { docNo: document.docNo },
        },
        tx,
      );
    });

    return this.detail(id);
  }

  async sign(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.APPROVE, document);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: { id, deletedAt: null, status: { not: DocumentStatus.DISPOSED }, signatureStatus: { not: "SIGNED" } },
        data: { signatureStatus: "SIGNED", signedById: actor.id || null, signedAt: new Date() },
      });
      if (claimed.count > 0) {
        await this.audit.record(
          {
            action: "document.signature.sign",
            entityType: "Document",
            entityId: id,
            actorId: actor.id,
            departmentId: document.departmentId,
            detail: { docNo: document.docNo },
          },
          tx,
        );
        return;
      }

      const current = await tx.document.findUnique({ where: { id }, select: { signatureStatus: true } });
      if (current?.signatureStatus !== "SIGNED") throw new ConflictException("Document is not available for signing");
    });

    return this.detail(id);
  }

  async declareRecord(principal: Principal, id: string) {
    const document = await this.mustFind(id);
    const actor = await this.authorize(principal, AclAction.APPROVE, document);

    if (document.isRecord) return this.detail(id);

    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, documentHoldLock(id));
      const claimed = await tx.document.updateMany({
        where: { id, isRecord: false, deletedAt: null, status: { not: DocumentStatus.DISPOSED } },
        data: { isRecord: true, status: "ARCHIVED" },
      });
      if (claimed.count > 0) {
        await this.audit.record(
          {
            action: "document.declare-record",
            entityType: "Document",
            entityId: id,
            actorId: actor.id,
            departmentId: document.departmentId,
            detail: { docNo: document.docNo },
          },
          tx,
        );
        return;
      }

      const current = await tx.document.findUnique({ where: { id }, select: { isRecord: true } });
      if (!current?.isRecord) throw new ConflictException("Document is not available for record declaration");
    });

    return this.detail(id);
  }

  private scopeWhere(
    departmentId: string | null | undefined,
    query: ListDocumentsQuery,
    visibility: Prisma.DocumentWhereInput | undefined,
  ): Prisma.DocumentWhereInput {
    const where: Prisma.DocumentWhereInput = {};
    if (visibility) where.AND = [visibility];
    if (departmentId === undefined && query.departmentId) where.departmentId = query.departmentId;
    if (query.folderId) where.folderId = query.folderId;
    if (query.status) where.status = query.status;
    if (query.classification) where.classification = query.classification;
    if (query.projectId) where.projectId = query.projectId;
    if (query.category) where.category = query.category;
    if (query.tag) where.tags = { has: query.tag };
    return where;
  }

  private async applySearch(where: Prisma.DocumentWhereInput, query: string | undefined) {
    const term = query?.trim();
    if (!term) return;

    const text = { contains: term, mode: "insensitive" } as const;
    const owner = { OR: [{ name: text }, { nameEn: text }] };
    const maxOwnerMatches = 1_000;
    const owners = await this.prisma.user.findMany({
      where: owner,
      select: { id: true },
      take: maxOwnerMatches + 1,
    });
    where.OR = [
      { title: text },
      { titleEn: text },
      { docNo: text },
      { description: text },
      { category: text },
      { tags: { has: term } },
    ];
    if (owners.length > maxOwnerMatches) {
      where.OR.push({ owner: { is: owner } });
    } else if (owners.length) {
      where.OR.push({ ownerId: { in: owners.map(({ id }) => id) } });
    }
  }

  private async paginate(where: Prisma.DocumentWhereInput, page: number, pageSize: number, departmentId?: string | null) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toDto(item)),
      meta: { page, pageSize, total, departmentId: departmentId ?? null },
    };
  }

  private async paginateAfter(where: Prisma.DocumentWhereInput, after: string, pageSize: number, departmentId?: string | null) {
    const take = pageSize + 1;
    const find = (range: Prisma.DocumentWhereInput, limit: number) =>
      this.prisma.document.findMany({
        where: { AND: [where, range] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: LIST_SELECT,
      });

    const readWindow = async () => {
      if (after === "start") return find({}, take);

      const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i.exec(after);
      if (!match) throw new BadRequestException("Invalid document cursor");
      const [, timestamp, id] = match;
      const createdAt = new Date(timestamp);
      if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== timestamp) {
        throw new BadRequestException("Invalid document cursor");
      }

      const sameTime = await find({ createdAt, id: { lt: id } }, take);
      if (sameTime.length === take) return sameTime;
      const earlier = await find({ createdAt: { lt: createdAt } }, take - sameTime.length);
      return sameTime.concat(earlier);
    };

    const [window, total] = await Promise.all([
      readWindow(),
      after === "start" ? this.prisma.document.count({ where }) : undefined,
    ]);
    const items = window.slice(0, pageSize);
    const last = items.at(-1);
    const nextCursor = last && window.length === take ? `${last.createdAt.toISOString()}/${last.id}` : null;

    return { items: items.map((item) => this.toDto(item)), meta: { pageSize, total, nextCursor, departmentId: departmentId ?? null } };
  }

  private async detail(id: string) {
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { version: "desc" },
      include: { file: true, createdBy: { select: { name: true } } },
    });

    return {
      ...this.toDto(await this.dtoRow(id)),
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        comment: version.comment,
        isCurrent: version.isCurrent,
        createdById: version.createdById,
        createdByName: version.createdBy?.name ?? null,
        createdAt: version.createdAt,
        file: {
          id: version.file.id,
          originalName: version.file.originalName,
          mimeType: version.file.mimeType,
          sizeBytes: Number(version.file.sizeBytes),
          checksumSha256: version.file.checksumSha256,
          createdAt: version.file.createdAt,
        },
      })),
    };
  }

  private async dtoRow(id: string): Promise<DocumentRow> {
    const row = await this.prisma.document.findUnique({ where: { id }, select: LIST_SELECT });
    if (!row) throw new NotFoundException("Document not found");
    return row;
  }

  private async folderDepartment(folderId: string, fallback: string | null): Promise<string | null> {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId }, select: { departmentId: true } });
    if (!folder) throw new NotFoundException("Folder not found");
    return folder.departmentId ?? fallback;
  }

  private async lockVersionTarget(tx: Prisma.TransactionClient, id: string) {
    await advisoryLock(tx, documentHoldLock(id));
    const current = await tx.document.findUnique({ where: { id }, select: { status: true, deletedAt: true, isRecord: true } });
    if (!current) throw new NotFoundException("Document not found");
    if (current.status === DocumentStatus.DISPOSED) throw new ConflictException("Disposed documents cannot change version");
    if (current.deletedAt) throw new ConflictException("Document is in the trash");
    return current;
  }

  private async mustFind(id: string): Promise<Document> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  private async unreferencedFileIds(documentId: string, fileIds: string[], tx: Prisma.TransactionClient) {
    if (fileIds.length === 0) return [];
    const keptByOtherDocuments = await tx.documentVersion.findMany({
      where: { fileId: { in: fileIds }, documentId: { not: documentId } },
      select: { fileId: true },
    });
    const stillReferenced = new Set(keptByOtherDocuments.map((version) => version.fileId));
    return fileIds.filter((fileId) => !stillReferenced.has(fileId));
  }

  private async attachableFile(actor: Actor, fileId: string) {
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file) throw new BadRequestException("File not found");
    if (!this.access.isGlobal(actor) && file.uploadedById !== actor.id) {
      throw new ForbiddenException("Only the account that uploaded a file can attach it to a document");
    }
    return file;
  }

  private async authorize(principal: Principal, action: AclAction, document: Document): Promise<Actor> {
    const actor = await this.access.resolveActor(principal);
    await this.access.assertDepartmentScope(actor, document);
    const permissions = await this.access.permissionsFor(actor, document.folderId);
    if (!permissions.has(action)) throw new ForbiddenException(`Missing permission: ${action}`);
    return actor;
  }

  private toDto(document: DocumentRow) {
    return {
      id: document.id,
      docNo: document.docNo,
      title: document.title,
      titleEn: document.titleEn,
      description: document.description,
      category: document.category,
      classification: document.classification,
      status: document.status,
      isRecord: document.isRecord,
      currentVersion: document.currentVersion,
      fileType: document.fileType,
      sizeBytes: Number(document.sizeBytes),
      tags: document.tags,
      retentionEnd: document.retentionEnd,
      folderId: document.folderId,
      departmentId: document.departmentId,
      sectionId: document.sectionId,
      projectId: document.projectId,
      ownerId: document.ownerId,
      ownerName: document.owner?.name ?? null,
      ownerNameEn: document.owner?.nameEn ?? null,
      departmentName: document.department?.name ?? null,
      departmentNameEn: document.department?.nameEn ?? null,
      folderName: document.folder?.name ?? null,
      checkedOutById: document.checkedOutById,
      checkedOutByName: document.checkedOutBy?.name ?? null,
      checkedOutAt: document.checkedOutAt,
      signatureStatus: document.signatureStatus,
      signedById: document.signedById,
      signedByName: document.signedBy?.name ?? null,
      signedAt: document.signedAt,
      deletedAt: document.deletedAt,
      deletedById: document.deletedById,
      deletedByName: document.deletedBy?.name ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

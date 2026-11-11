import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AclAction, FileObject, Prisma } from "@prisma/client";
import { API_PREFIX } from "@edas/shared";
import type { FileDto, FileVerificationDto, StorageIntegrityDto, StoragePurgeResultDto, UnreferencedFileDto } from "@edas/shared";
import { AccessService, type Actor } from "../../common/access/access.service";
import { denialReason } from "../../common/access/denial-reason";
import { DOWNLOAD_TICKET_TTL_SECONDS, DownloadTicketService } from "../../common/download/download-ticket.service";
import { detectFileContent, type DetectedFile } from "../preview/preview-file-type";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { PresignUploadDto } from "./dto/presign-upload.dto";
import { RegisterFileDto } from "./dto/register-file.dto";
import { PurgeUnreferencedDto } from "./dto/purge-unreferenced.dto";

export const MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/zip": ["zip"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/tiff": ["tif", "tiff"],
  "image/vnd.dwg": ["dwg"],
  "application/acad": ["dwg"],
  "application/x-acad": ["dwg"],
  "application/dwg": ["dwg"],
  "application/x-dwg": ["dwg"],
  "image/vnd.dxf": ["dxf"],
  "application/dxf": ["dxf"],
  "application/x-dxf": ["dxf"],
  "text/x-dxf": ["dxf"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/xml": ["xml"],
  "text/xml": ["xml"],
};

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const INTEGRITY_LIST_LIMIT = 50;
const INTEGRITY_SCAN_LIMIT = 20_000;
const MAX_STORAGE_KEY_LENGTH = 512;
const INLINE_PREVIEW_TYPES = new Set(["pdf", "image", "text", "dxf"]);
const PASSTHROUGH_STORED_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

export interface DownloadContent {
  key: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  inline: boolean;
}

export interface LinkedDocument {
  id: string;
  departmentId: string | null;
  folderId: string | null;
  ownerId: string | null;
  deletedAt: Date | null;
}

export interface ReadableFile {
  actor: Actor;
  file: Omit<FileObject, "versions">;
  documents: LinkedDocument[];
}

type InventoryFile = Omit<FileObject, "versions"> & { versions: { documentId: string }[] };

interface Inventory {
  files: InventoryFile[];
  unreferenced: InventoryFile[];
  missing: InventoryFile[];
  orphans: string[];
  attachedToDocuments: number;
  attachedToReportRuns: number;
  listingFailed: boolean;
  listingError: string | null;
  listedObjects: number;
  listingTruncated: boolean;
}

interface VersionPointerRow {
  id: string;
  docNo: string;
  currentVersion: number;
  status: string;
  versionCount: number;
  currentFlags: number;
  flaggedVersion: number | null;
  totalCount?: number | bigint;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly tickets: DownloadTicketService,
  ) {}

  private get maxUploadBytes(): number {
    const configured = Number(this.config.get<string>("MAX_UPLOAD_BYTES"));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
  }

  private get allowedMimeTypes(): Set<string> {
    const configured = (this.config.get("ALLOWED_UPLOAD_MIME") as string | undefined) ?? "";
    const list = (configured.trim() ? configured.split(",") : Object.keys(MIME_EXTENSIONS))
      .map((entry: string) => entry.trim().toLowerCase())
      .filter(Boolean);
    return new Set(list.length > 0 ? list : Object.keys(MIME_EXTENSIONS));
  }

  async presignUpload(principal: Principal, dto: PresignUploadDto) {
    const actor = await this.access.resolveActor(principal);
    const originalName = sanitizeName(dto.fileName);
    if (!originalName) throw new BadRequestException("File name must not be empty");

    const mimeType = normalizeMimeType(dto.mimeType);
    if (!mimeType || !this.allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException(`Unsupported content type: ${mimeType}`);
    }

    const extension = extname(originalName).replace(/^\./, "").toLowerCase();
    const extensions = MIME_EXTENSIONS[mimeType] ?? [];
    if (!extension || !extensions.includes(extension)) {
      throw new BadRequestException(`File extension ".${extension}" does not match the declared type "${mimeType}"`);
    }

    const maxBytes = this.maxUploadBytes;
    if (dto.sizeBytes !== undefined && dto.sizeBytes > maxBytes) {
      throw new BadRequestException(`File exceeds the upload limit of ${maxBytes} bytes`);
    }

    const storageKey = `documents/${new Date().getUTCFullYear()}/${randomUUID()}.${extension}`;
    await this.prisma.uploadIntent.create({
      data: {
        storageKey,
        actorId: actor.id,
        mimeType,
        maxBytes,
        expiresAt: new Date(Date.now() + this.storage.presignExpiresSeconds * 1000),
      },
    });
    const url = await this.storage.presignUpload(storageKey, mimeType);
    await this.audit.record({
      action: "file.presign",
      entityType: "File",
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { storageKey, mimeType, sizeBytes: dto.sizeBytes ?? null },
    });

    return {
      storageKey,
      bucket: this.storage.bucketName,
      method: "PUT" as const,
      url,
      expiresInSeconds: this.storage.presignExpiresSeconds,
      maxBytes,
    };
  }

  /** Binds a presigned upload to a FileObject, trusting only what storage reports about the stored bytes. */
  async register(principal: Principal, dto: RegisterFileDto): Promise<FileDto> {
    const actor = await this.access.resolveActor(principal);
    if (!isSafeStorageKey(dto.storageKey)) throw new BadRequestException("Invalid storage key");
    const originalName = sanitizeName(dto.originalName);
    if (!originalName) throw new BadRequestException("File name must not be empty");
    const declaredChecksum = dto.checksumSha256.toLowerCase();

    const intent = await this.prisma.uploadIntent.findUnique({ where: { storageKey: dto.storageKey } });
    if (!intent || intent.actorId !== actor.id) {
      throw new ForbiddenException("This upload was not presigned by the current account");
    }
    if (intent.consumedAt) throw new ConflictException("This upload has already been registered");
    if (intent.expiresAt.getTime() <= Date.now()) throw new BadRequestException("The upload link expired; presign again");

    const stored = await this.storage.head(dto.storageKey);
    if (!stored) throw new BadRequestException("Uploaded object was not found in storage");
    if (stored.sizeBytes <= 0) throw new BadRequestException("Uploaded object is empty");
    if (stored.sizeBytes > intent.maxBytes) {
      throw new BadRequestException(`Uploaded file is larger than the presigned limit of ${intent.maxBytes} bytes`);
    }
    if (dto.sizeBytes !== undefined && dto.sizeBytes !== stored.sizeBytes) {
      throw new BadRequestException("Declared size does not match the stored size");
    }
    const storedType = normalizeMimeType(stored.mimeType ?? "");
    if (storedType && storedType !== intent.mimeType && !PASSTHROUGH_STORED_TYPES.has(storedType)) {
      throw new BadRequestException(`Stored content type ${stored.mimeType} does not match the presigned type ${intent.mimeType}`);
    }

    const digest = await this.storage.sha256(dto.storageKey, stored.sizeBytes);
    if (!digest || digest.sizeBytes !== stored.sizeBytes) {
      throw new BadRequestException("Uploaded object could not be read for verification");
    }
    if (digest.checksum !== declaredChecksum) {
      throw new BadRequestException("Uploaded file does not match the declared checksum");
    }
    const checksumSha256 = digest.checksum;

    const created = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.uploadIntent.updateMany({ where: { id: intent.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (claimed.count === 0) throw new ConflictException("This upload has already been registered");
      return tx.fileObject.create({
        data: {
          bucket: this.storage.bucketName,
          storageKey: dto.storageKey,
          originalName,
          mimeType: intent.mimeType,
          sizeBytes: BigInt(stored.sizeBytes),
          checksumSha256,
          uploadedById: actor.id,
        },
      });
    });

    await this.audit.record({
      action: "file.register",
      entityType: "File",
      entityId: created.id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { storageKey: dto.storageKey, mimeType: created.mimeType, sizeBytes: Number(created.sizeBytes) },
    });

    return {
      id: created.id,
      originalName: created.originalName,
      mimeType: created.mimeType,
      sizeBytes: Number(created.sizeBytes),
      checksumSha256: created.checksumSha256,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async downloadUrl(
    principal: Principal,
    id: string,
    options: { inline?: boolean; baseUrl?: string } = {},
  ): Promise<{ url: string; fileName: string; expiresInSeconds: number }> {
    const actor = await this.access.resolveActor(principal);

    let resolved: ReadableFile;
    try {
      resolved = await this.authorizedFile(actor, id, AclAction.VIEW);
    } catch (error) {
      await this.auditDownload(id, actor, "failure", { reason: "not_allowed" }).catch(() => undefined);
      throw error;
    }
    const { file, documents } = resolved;

    if (!(await this.canDownloadAny(actor, file.uploadedById, documents))) {
      await this.auditDownload(id, actor, "failure", { reason: "missing_download_permission" }).catch(() => undefined);
      throw new ForbiddenException(`Missing permission: ${AclAction.EXPORT}`);
    }

    const detected = await this.inspect(file);
    const requestedInline = options.inline === true;
    const inline = requestedInline && Boolean(detected && !detected.mismatch && INLINE_PREVIEW_TYPES.has(detected.type));

    const ticket = this.tickets.issue("file", file.id, principal.sub, { inline });
    const path = `${API_PREFIX}/files/${encodeURIComponent(file.id)}/content?ticket=${ticket}`;
    const base = (options.baseUrl ?? "").replace(/\/+$/, "");
    const url = base ? `${base}${path}` : path;

    await this.auditDownload(file.id, actor, "success", {
      mode: "proxy",
      inline,
      requestedInline,
      linkedDocuments: documents.length,
    });

    return { url, fileName: basename(file.originalName), expiresInSeconds: DOWNLOAD_TICKET_TTL_SECONDS };
  }

  /** Consumes a download ticket and re-checks access at delivery time, so a revoked grant or a deleted account cannot keep downloading with a URL issued moments earlier. */
  async openTicketDownload(id: string, ticket: string | undefined): Promise<DownloadContent> {
    const grant = this.tickets.verify("file", id, ticket);
    if (!grant) {
      await this.audit
        .record({
          action: "file.download",
          entityType: "File",
          entityId: id,
          actorId: null,
          result: "failure",
          detail: { reason: "invalid_ticket" },
        })
        .catch(() => undefined);
      throw new ForbiddenException("This download link is invalid or has expired");
    }

    try {
      const actor = await this.access.resolveActor({ sub: grant.sub } as Principal);
      const { file, documents } = await this.authorizedFile(actor, id, AclAction.VIEW);
      if (!(await this.canDownloadAny(actor, file.uploadedById, documents))) {
        throw new ForbiddenException(`Missing permission: ${AclAction.EXPORT}`);
      }

      const detected = await this.inspect(file);
      const inline = grant.inline && Boolean(detected && !detected.mismatch && INLINE_PREVIEW_TYPES.has(detected.type));
      const content: DownloadContent = {
        key: file.storageKey,
        contentType: inline && detected ? detected.mimeType : "application/octet-stream",
        fileName: basename(file.originalName),
        sizeBytes: Number(file.sizeBytes),
        inline,
      };

      if (await this.tickets.firstDelivery(grant)) {
        await this.audit
          .record({
            action: "file.download",
            entityType: "File",
            entityId: file.id,
            actorId: actor.id,
            departmentId: actor.departmentId,
            result: "success",
            detail: { delivered: true, linkedDocuments: documents.length, inline },
          })
          .catch(() => undefined);
      }
      return content;
    } catch (error) {
      await this.audit
        .record({
          action: "file.download",
          entityType: "File",
          entityId: id,
          actorId: grant.sub,
          result: "failure",
          detail: { reason: denialReason(error) },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  /** Verifies a download ticket without consuming it, for testing and cross-instance validation. */
  verifyDownloadTicket(ticket: string, fileId: string): { sub: string; inline: boolean } | null {
    return this.tickets.verify("file", fileId, ticket);
  }

  /** Resolves a file and verifies the caller may read at least one document it belongs to. */
  async readableFile(principal: Principal, id: string): Promise<ReadableFile> {
    const actor = await this.access.resolveActor(principal);
    return this.authorizedFile(actor, id, AclAction.VIEW);
  }

  /** Loads a stored file without an ACL check; only for internal jobs whose caller already verified access. */
  async fileForJob(id: string): Promise<FileObject | null> {
    return this.prisma.fileObject.findUnique({ where: { id } });
  }

  async canDownloadAny(
    actor: Actor,
    uploadedById: string | null,
    documents: LinkedDocument[],
  ): Promise<boolean> {
    if (documents.length === 0) return Boolean(uploadedById) && uploadedById === actor.id;
    return this.canAccessAnyDocument(actor, documents, AclAction.EXPORT);
  }

  private async canAccessAnyDocument(actor: Actor, documents: LinkedDocument[], action: AclAction): Promise<boolean> {
    for (const document of documents) {
      try {
        await this.access.assertDepartmentScope(actor, document);
      } catch {
        continue;
      }
      const permissions = await this.access.permissionsFor(actor, document.folderId);
      if (permissions.has(action)) return true;
    }
    return false;
  }

  private async authorizedFile(actor: Actor, id: string, action: AclAction): Promise<ReadableFile> {
    const file = await this.prisma.fileObject.findUnique({
      where: { id },
      include: {
        versions: {
          select: {
            document: {
              select: {
                id: true,
                departmentId: true,
                folderId: true,
                ownerId: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
    if (!file) throw new NotFoundException("File not found");

    const documents = file.versions.map((version) => version.document);
    if (documents.length > 0) {
      if (!(await this.canAccessAnyDocument(actor, documents, action))) {
        throw new ForbiddenException(action === AclAction.VIEW ? "Not allowed to access this file" : `Missing permission: ${action}`);
      }
    } else if (file.uploadedById !== actor.id) {
      throw new ForbiddenException("Not allowed to access this file");
    }

    const { versions: _versions, ...rest } = file;
    return { actor, file: rest, documents };
  }

  private async inspect(file: Omit<FileObject, "versions">): Promise<DetectedFile | null> {
    const head = await this.storage.readHead(file.storageKey, 8192);
    if (!head) return null;
    return detectFileContent(head, file.originalName, file.mimeType);
  }

  private auditDownload(
    id: string,
    actor: Actor,
    result: "success" | "failure",
    detail: Prisma.InputJsonObject,
  ): Promise<unknown> {
    return this.audit.record({
      action: "file.download",
      entityType: "File",
      entityId: id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      result,
      detail,
    });
  }

  /** Recomputes the sha256 of the stored object and compares it with the fingerprint registered for this row. */
  async verify(principal: Principal, id: string): Promise<FileVerificationDto> {
    const actor = await this.access.resolveActor(principal);
    const file = await this.prisma.fileObject.findUnique({ where: { id } });
    if (!file) throw new NotFoundException("File not found");

    const expectedChecksum = file.checksumSha256 ?? "";
    const declaredSizeBytes = Number(file.sizeBytes);
    const stored = await this.storage.head(file.storageKey);
    const storedSizeBytes = stored ? stored.sizeBytes : null;
    let actualChecksum: string | null = null;
    let reason: FileVerificationDto["reason"] = null;

    if (!stored) {
      reason = "missing_object";
    } else if (stored.sizeBytes !== declaredSizeBytes) {
      reason = "size_mismatch";
    } else {
      const body = await this.storage.get(file.storageKey, Math.max(1, stored.sizeBytes));
      if (!body) {
        reason = "unreadable_object";
      } else {
        actualChecksum = createHash("sha256").update(body).digest("hex");
        if (actualChecksum !== expectedChecksum) reason = "checksum_mismatch";
      }
    }

    await this.audit.record({
      action: "file.verify",
      entityType: "File",
      entityId: file.id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      result: reason === null ? "success" : "failure",
      detail: { reason, expectedChecksum, actualChecksum, declaredSizeBytes, storedSizeBytes },
    });

    return {
      id: file.id,
      storageKey: file.storageKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      ok: reason === null,
      reason,
      declaredSizeBytes,
      storedSizeBytes,
      expectedChecksum,
      actualChecksum,
      verifiedAt: new Date().toISOString(),
    };
  }

  async integrity(principal: Principal): Promise<StorageIntegrityDto> {
    const actor = await this.access.resolveActor(principal);
    const inventory = await this.inventory();
    const pointerRows = await this.prisma.$queryRaw<VersionPointerRow[]>`
      WITH stats AS (
        SELECT d.id,
               d."docNo",
               d."currentVersion",
               d.status::text AS status,
               COUNT(v.id)::int AS "versionCount",
               COUNT(v.id) FILTER (WHERE v."isCurrent")::int AS "currentFlags",
               MAX(v.version) FILTER (WHERE v."isCurrent") AS "flaggedVersion"
        FROM "Document" d
        LEFT JOIN "DocumentVersion" v ON v."documentId" = d.id
        GROUP BY d.id
      )
      SELECT id, "docNo", "currentVersion", status, "versionCount", "currentFlags", "flaggedVersion",
             COUNT(*) OVER ()::int AS "totalCount"
      FROM stats
      WHERE "versionCount" <> "currentVersion"
         OR "currentFlags" <> 1
         OR COALESCE("flaggedVersion", -1) <> "currentVersion"
      ORDER BY "docNo"
      LIMIT ${INTEGRITY_LIST_LIMIT}
    `;

    const pointerIssueCount = pointerRows.length > 0 ? Number(pointerRows[0].totalCount ?? pointerRows.length) : 0;
    const mismatches = pointerRows.slice(0, INTEGRITY_LIST_LIMIT).map((row) => ({
      id: row.id,
      docNo: row.docNo,
      currentVersion: row.currentVersion,
      status: row.status,
      versionCount: row.versionCount,
      currentFlags: row.currentFlags,
      flaggedVersion: row.flaggedVersion,
    }));

    const unreferencedTruncated = inventory.unreferenced.length > INTEGRITY_LIST_LIMIT;
    const missingObjectsTruncated = inventory.missing.length > INTEGRITY_LIST_LIMIT;
    const orphanObjectsTruncated = inventory.orphans.length > INTEGRITY_LIST_LIMIT;
    const mismatchesTruncated = pointerIssueCount > mismatches.length;

    const report: StorageIntegrityDto = {
      generatedAt: new Date().toISOString(),
      bucket: this.storage.bucketName,
      files: {
        total: inventory.files.length,
        attachedToDocuments: inventory.attachedToDocuments,
        attachedToReportRuns: inventory.attachedToReportRuns,
        unreferencedCount: inventory.unreferenced.length,
        unreferencedTruncated,
        unreferenced: inventory.unreferenced.slice(0, INTEGRITY_LIST_LIMIT).map(toUnreferencedFile),
      },
      storage: {
        listedObjects: inventory.listedObjects,
        listingTruncated: inventory.listingTruncated,
        listingFailed: inventory.listingFailed,
        listingError: inventory.listingError,
        missingObjectsCount: inventory.missing.length,
        missingObjectsTruncated,
        missingObjects: inventory.missing.slice(0, INTEGRITY_LIST_LIMIT).map(toMissingObject),
        orphanObjectsCount: inventory.orphans.length,
        orphanObjectsTruncated,
        orphanObjects: inventory.orphans.slice(0, INTEGRITY_LIST_LIMIT),
      },
      versions: { mismatchCount: pointerIssueCount, mismatchesTruncated, mismatches },
      checksums: { verified: false, note: "Use the per-file verification endpoint to recompute stored checksums" },
    };

    await this.audit.record({
      action: "file.integrity",
      entityType: "File",
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: {
        missingObjects: inventory.missing.length,
        orphanObjects: inventory.orphans.length,
        unreferencedFiles: inventory.unreferenced.length,
        pointerIssues: pointerIssueCount,
        truncated: {
          unreferenced: unreferencedTruncated,
          missingObjects: missingObjectsTruncated,
          orphanObjects: orphanObjectsTruncated,
          mismatches: mismatchesTruncated,
        },
        listingFailed: inventory.listingFailed,
        listingError: inventory.listingError,
      },
    });

    return report;
  }

  async purgeUnreferenced(principal: Principal, dto: PurgeUnreferencedDto): Promise<StoragePurgeResultDto> {
    const actor = await this.access.resolveActor(principal);
    const inventory = await this.inventory();

    const requestedFileIds = dto?.fileIds?.length ? new Set(dto.fileIds) : null;
    const selectedFiles = requestedFileIds
      ? inventory.unreferenced.filter((file) => requestedFileIds.has(file.id))
      : inventory.unreferenced;
    if (requestedFileIds && selectedFiles.length !== requestedFileIds.size) {
      throw new ConflictException("Only unreferenced files that the inventory lists can be purged");
    }

    const requestedKeys = dto?.storageKeys?.length ? new Set(dto.storageKeys) : null;
    const selectedKeys = requestedKeys ? inventory.orphans.filter((key) => requestedKeys.has(key)) : inventory.orphans;
    if (requestedKeys && selectedKeys.length !== requestedKeys.size) {
      throw new ConflictException("Only storage keys the inventory lists as orphaned can be purged");
    }

    const plannedFiles = selectedFiles.map(toUnreferencedFile);
    if (dto?.confirm !== true) {
      return { dryRun: true, bucket: this.storage.bucketName, files: plannedFiles, storageKeys: selectedKeys, deleted: null };
    }

    const targetIds = selectedFiles.map((file) => file.id);
    const deletedFiles = await this.prisma.$transaction(async (tx) => {
      const fresh =
        targetIds.length > 0
          ? await tx.fileObject.findMany({
              where: { id: { in: targetIds } },
              include: { versions: { select: { documentId: true } } },
            })
          : [];
      const stillUnreferenced = fresh.filter((file) => file.versions.length === 0);
      if (stillUnreferenced.length > 0) {
        await tx.fileObject.deleteMany({ where: { id: { in: stillUnreferenced.map((file) => file.id) } } });
      }
      return stillUnreferenced;
    });

    const deletedIds = new Set(deletedFiles.map((file) => file.id));
    const keysToRemove = [
      ...selectedFiles.filter((file) => deletedIds.has(file.id)).map((file) => file.storageKey),
      ...selectedKeys,
    ];
    const failures: string[] = [];
    let removed = 0;
    for (const key of keysToRemove) {
      try {
        await this.storage.remove(key);
        removed += 1;
      } catch (error) {
        failures.push(key);
        this.logger.warn(`purge could not remove ${key}: ${(error as Error).message}`);
      }
    }

    await this.audit.record({
      action: "file.purge_unreferenced",
      entityType: "File",
      actorId: actor.id,
      departmentId: actor.departmentId,
      result: failures.length === 0 ? "success" : "failure",
      detail: { files: deletedFiles.length, objects: removed, failures: failures.length, dryRun: false },
    });

    return {
      dryRun: false,
      bucket: this.storage.bucketName,
      files: plannedFiles,
      storageKeys: selectedKeys,
      deleted: { files: deletedFiles.length, objects: removed, failures },
    };
  }

  private async inventory(): Promise<Inventory> {
    const files = await this.prisma.fileObject.findMany({
      include: { versions: { select: { documentId: true } } },
    });
    const reportRuns = await this.prisma.reportRun.findMany({ where: { fileId: { not: null } }, select: { fileId: true } });
    const reportFileIds = new Set(reportRuns.map((run) => run.fileId).filter((id): id is string => Boolean(id)));

    const attachedToDocuments = files.filter((file) => file.versions.length > 0);
    const attachedToReportRuns = files.filter((file) => reportFileIds.has(file.id));
    const referenced = new Set([...attachedToDocuments.map((file) => file.id), ...attachedToReportRuns.map((file) => file.id)]);
    const unreferenced = files.filter((file) => !referenced.has(file.id));

    const scanLimit = Number(this.config.get<string>("FILES_INVENTORY_SCAN_LIMIT")) || INTEGRITY_SCAN_LIMIT;
    const listing = await this.storage.listKeys("", scanLimit);
    const listed = new Set(listing.keys);
    const fileKeys = new Set(files.map((file) => file.storageKey));
    const listingFailed = Boolean(listing.error);
    const missing = listingFailed ? [] : files.filter((file) => !listed.has(file.storageKey));
    const orphans = listingFailed ? [] : listing.keys.filter((key) => !fileKeys.has(key));

    return {
      files,
      unreferenced,
      missing,
      orphans,
      attachedToDocuments: attachedToDocuments.length,
      attachedToReportRuns: attachedToReportRuns.length,
      listingFailed,
      listingError: listing.error ?? null,
      listedObjects: listing.keys.length,
      listingTruncated: listing.truncated,
    };
  }
}

function normalizeMimeType(value: string | undefined): string {
  return String(value ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function sanitizeName(value: string | undefined): string {
  const base = basename(String(value ?? "").replace(/\\/g, "/"));
  const printable = Array.from(base)
    .filter((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7f)
    .join("");
  return printable.trim().slice(0, 255);
}

function isSafeStorageKey(key: string): boolean {
  if (!key || key.length > MAX_STORAGE_KEY_LENGTH) return false;
  if (key.startsWith("/") || key.includes("..") || key.includes("\\") || key.includes("\0")) return false;
  return true;
}

function toUnreferencedFile(file: InventoryFile): UnreferencedFileDto {
  return {
    id: file.id,
    storageKey: file.storageKey,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    createdAt: file.createdAt.toISOString(),
  };
}

function toMissingObject(file: InventoryFile) {
  return { id: file.id, storageKey: file.storageKey, originalName: file.originalName, sizeBytes: Number(file.sizeBytes) };
}
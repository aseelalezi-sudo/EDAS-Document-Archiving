import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { AuditService } from "../modules/audit/audit.service";

export interface DocumentDepartmentDrift {
  documentId: string;
  docNo: string;
  folderId: string;
  folderName: string | null;
  currentDepartmentId: string | null;
  targetDepartmentId: string;
}

export interface ReconciliationReport {
  applied: boolean;
  scanned: number;
  drift: number;
  fixed: number;
  skipped: number;
  documents: DocumentDepartmentDrift[];
}

export async function findDocumentDepartmentDrift(prisma: PrismaService): Promise<DocumentDepartmentDrift[]> {
  const rows = await prisma.document.findMany({
    where: { folderId: { not: null }, folder: { departmentId: { not: null } } },
    select: {
      id: true,
      docNo: true,
      departmentId: true,
      folderId: true,
      folder: { select: { name: true, departmentId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.flatMap((row) => {
    const target = row.folder?.departmentId;
    if (!row.folderId || !target || target === row.departmentId) return [];
    return [
      {
        documentId: row.id,
        docNo: row.docNo,
        folderId: row.folderId,
        folderName: row.folder?.name ?? null,
        currentDepartmentId: row.departmentId,
        targetDepartmentId: target,
      },
    ];
  });
}

export async function reconcileDocumentDepartments(
  prisma: PrismaService,
  audit: Pick<AuditService, "record">,
  options: { apply: boolean },
): Promise<ReconciliationReport> {
  const documents = await findDocumentDepartmentDrift(prisma);
  const scanned = await prisma.document.count({ where: { folderId: { not: null } } });

  if (!options.apply) {
    return { applied: false, scanned, drift: documents.length, fixed: 0, skipped: 0, documents };
  }

  let fixed = 0;
  let skipped = 0;
  for (const item of documents) {
    const changed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.document.updateMany({
        where: { id: item.documentId, departmentId: item.currentDepartmentId },
        data: { departmentId: item.targetDepartmentId },
      });
      if (updated.count === 0) return false;

      await audit.record(
        {
          action: "document.reconcile_department",
          entityType: "Document",
          entityId: item.documentId,
          actorName: "maintenance:reconcile-document-departments",
          departmentId: item.targetDepartmentId,
          detail: {
            docNo: item.docNo,
            folderId: item.folderId,
            fromDepartmentId: item.currentDepartmentId,
            toDepartmentId: item.targetDepartmentId,
          },
        },
        tx,
      );
      return true;
    });

    if (changed) fixed += 1;
    else skipped += 1;
  }

  return { applied: true, scanned, drift: documents.length, fixed, skipped, documents };
}

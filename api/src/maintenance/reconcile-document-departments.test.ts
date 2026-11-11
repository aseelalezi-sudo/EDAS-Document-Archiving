import { describe, expect, it, vi } from "vitest";
import { findDocumentDepartmentDrift, reconcileDocumentDepartments } from "./reconcile-document-departments";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    docNo: "DOC-2026-0001",
    departmentId: "dept-old",
    folderId: "folder-1",
    folder: { name: "المجلد", departmentId: "dept-new" },
    ...overrides,
  };
}

function buildContext(rows: Array<Record<string, unknown>>) {
  const prisma = {
    document: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => Promise<unknown>) => void };
  transaction.mockImplementation(async (work) => (work as (tx: typeof prisma) => unknown)(prisma));
  const audit = { record: vi.fn().mockResolvedValue({ id: "event-1" }) };
  return { prisma, audit };
}

describe("document department reconciliation", () => {
  it("reports documents whose stored department disagrees with their folder", async () => {
    const { prisma } = buildContext([
      row(),
      row({ id: "doc-2", docNo: "DOC-2026-0002" }),
      row({ id: "doc-3", departmentId: "dept-new" }),
      row({ id: "doc-4", folder: { name: "عام", departmentId: null } }),
      row({ id: "doc-5", folderId: null, folder: null }),
    ]);

    const drift = await findDocumentDepartmentDrift(prisma as never);

    expect(drift.map((item) => item.documentId)).toEqual(["doc-1", "doc-2"]);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { folderId: { not: null }, folder: { departmentId: { not: null } } } }),
    );
  });

  it("never writes during a dry run", async () => {
    const { prisma, audit } = buildContext([row()]);

    const report = await reconcileDocumentDepartments(prisma as never, audit, { apply: false });

    expect(report).toMatchObject({ applied: false, drift: 1, fixed: 0, skipped: 0 });
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("aligns the department with the folder and signs an audit event inside the same transaction", async () => {
    const { prisma, audit } = buildContext([row()]);

    const report = await reconcileDocumentDepartments(prisma as never, audit, { apply: true });

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", departmentId: "dept-old" },
      data: { departmentId: "dept-new" },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.reconcile_department",
        entityId: "doc-1",
        departmentId: "dept-new",
        detail: expect.objectContaining({ fromDepartmentId: "dept-old", toDepartmentId: "dept-new" }),
      }),
      prisma,
    );
    expect(report).toMatchObject({ applied: true, drift: 1, fixed: 1, skipped: 0 });
  });

  it("skips a document that was corrected concurrently instead of auditing a change it did not make", async () => {
    const { prisma, audit } = buildContext([row()]);
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    const report = await reconcileDocumentDepartments(prisma as never, audit, { apply: true });

    expect(audit.record).not.toHaveBeenCalled();
    expect(report).toMatchObject({ applied: true, drift: 1, fixed: 0, skipped: 1 });
  });
});

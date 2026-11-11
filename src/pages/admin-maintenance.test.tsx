import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { ApiError } from "../lib/api-client";
import type { StorageIntegrityDto, StoragePurgeResultDto } from "@edas/shared";
import { Maintenance } from "./admin-maintenance";

const storageIntegrity = vi.fn();
const verifyFile = vi.fn();
const purgeUnreferencedFiles = vi.fn();

vi.mock("../config", () => ({ config: { apiBaseUrl: "http://localhost:4210/api/v1", oidc: {}, useApi: true } }));
vi.mock("../lib/domain-api", () => {
  const stub = () => Promise.resolve({ items: [], meta: { total: 0 } });
  const api: Record<string, unknown> = {
    storageIntegrity: () => storageIntegrity(),
    verifyFile: (id: string) => verifyFile(id),
    purgeUnreferencedFiles: (body: unknown) => purgeUnreferencedFiles(body),
  };
  return { domainApi: new Proxy(api, { get: (target, key: string) => target[key] ?? stub }) };
});

function inventory(overrides: Partial<StorageIntegrityDto> = {}): StorageIntegrityDto {
  return {
    generatedAt: "2026-11-05T08:00:00.000Z",
    bucket: "edas-documents",
    files: {
      total: 46,
      attachedToDocuments: 21,
      attachedToReportRuns: 1,
      unreferencedCount: 1,
      unreferencedTruncated: false,
      unreferenced: [],
    },
    storage: {
      listedObjects: 47,
      listingTruncated: false,
      listingFailed: false,
      listingError: null,
      missingObjectsCount: 1,
      missingObjectsTruncated: false,
      missingObjects: [{ id: "file-1", storageKey: "documents/2026/missing.pdf", originalName: "missing.pdf", sizeBytes: 4096 }],
      orphanObjectsCount: 1,
      orphanObjectsTruncated: false,
      orphanObjects: ["documents/2026/orphan.pdf"],
    },
    versions: { mismatchCount: 0, mismatchesTruncated: false, mismatches: [] },
    checksums: { verified: false, note: "Checksums are verified per file with POST /files/:id/verify." },
    ...overrides,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>{children}</DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

function debrisInventory(): StorageIntegrityDto {
  return inventory({
    files: {
      total: 46,
      attachedToDocuments: 21,
      attachedToReportRuns: 1,
      unreferencedCount: 1,
      unreferencedTruncated: false,
      unreferenced: [
        {
          id: "file-9",
          storageKey: "documents/2026/loose.pdf",
          originalName: "loose.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          createdAt: "2026-11-01T08:00:00.000Z",
        },
      ],
    },
  });
}

function purgePlan(overrides: Partial<StoragePurgeResultDto> = {}): StoragePurgeResultDto {
  return {
    dryRun: true,
    bucket: "edas-documents",
    files: [
      {
        id: "file-9",
        storageKey: "documents/2026/loose.pdf",
        originalName: "loose.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        createdAt: "2026-11-01T08:00:00.000Z",
      },
    ],
    storageKeys: ["documents/2026/loose.pdf", "documents/2026/orphan.pdf"],
    deleted: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("Maintenance storage reconciliation", () => {
  it("runs the inventory and lists the differences it found", async () => {
    storageIntegrity.mockResolvedValue(inventory());
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));

    expect(await screen.findByText(/documents\/2026\/missing\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("documents/2026/orphan.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/لا فروق/)).toBeNull();
    expect(storageIntegrity).toHaveBeenCalledTimes(1);
  });

  it("verifies the checksum of a flagged file and reports the mismatch reason", async () => {
    storageIntegrity.mockResolvedValue(inventory());
    verifyFile.mockResolvedValue({
      id: "file-1",
      storageKey: "documents/2026/missing.pdf",
      originalName: "missing.pdf",
      mimeType: "application/pdf",
      ok: false,
      reason: "missing_object",
      declaredSizeBytes: 4096,
      storedSizeBytes: null,
      expectedChecksum: "a".repeat(64),
      actualChecksum: null,
      verifiedAt: "2026-11-05T08:05:00.000Z",
    });
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));
    fireEvent.click(await screen.findByRole("button", { name: /تحقق البصمة/ }));

    expect(await screen.findByText("الكائن مفقود من التخزين")).toBeInTheDocument();
    expect(verifyFile).toHaveBeenCalledWith("file-1");
  });

  it("labels capped lists with their real totals", async () => {
    storageIntegrity.mockResolvedValue(
      inventory({
        files: {
          total: 200,
          attachedToDocuments: 21,
          attachedToReportRuns: 1,
          unreferencedCount: 64,
          unreferencedTruncated: true,
          unreferenced: [
            {
              id: "file-9",
              storageKey: "documents/2026/loose.pdf",
              originalName: "loose.pdf",
              mimeType: "application/pdf",
              sizeBytes: 2048,
              createdAt: "2026-11-01T08:00:00.000Z",
            },
          ],
        },
        storage: {
          listedObjects: 300,
          listingTruncated: true,
          listingFailed: false,
          listingError: null,
          missingObjectsCount: 61,
          missingObjectsTruncated: true,
          missingObjects: [{ id: "file-1", storageKey: "documents/2026/missing.pdf", originalName: "missing.pdf", sizeBytes: 4096 }],
          orphanObjectsCount: 90,
          orphanObjectsTruncated: true,
          orphanObjects: ["documents/2026/orphan.pdf"],
        },
        versions: {
          mismatchCount: 120,
          mismatchesTruncated: true,
          mismatches: [
            {
              id: "doc-3",
              docNo: "DOC-3",
              currentVersion: 2,
              status: "APPROVED",
              versionCount: 3,
              currentFlags: 0,
              flaggedVersion: null,
            },
          ],
        },
      }),
    );
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));

    expect(await screen.findByText(/تُعرض أول 1 من 61 كائناً مفقوداً/)).toBeInTheDocument();
    expect(screen.getByText(/تُعرض أول 1 من 90 كائناً يتيماً/)).toBeInTheDocument();
    expect(screen.getByText(/تُعرض أول 1 من 120 تعارضاً/)).toBeInTheDocument();
    expect(screen.getByText(/تُعرض أول 1 من 64 ملفاً غير مرتبط/)).toBeInTheDocument();
    expect(screen.getByText(/عدد الكائنات اليتيمة حدّ أدنى/)).toBeInTheDocument();
  });

  it("refuses to call the bucket clean when its listing failed", async () => {
    storageIntegrity.mockResolvedValue(
      inventory({
        files: {
          total: 4,
          attachedToDocuments: 4,
          attachedToReportRuns: 0,
          unreferencedCount: 0,
          unreferencedTruncated: false,
          unreferenced: [],
        },
        storage: {
          listedObjects: 0,
          listingTruncated: false,
          listingFailed: true,
          listingError: "Access Denied",
          missingObjectsCount: 0,
          missingObjectsTruncated: false,
          missingObjects: [],
          orphanObjectsCount: 0,
          orphanObjectsTruncated: false,
          orphanObjects: [],
        },
      }),
    );
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));

    expect(await screen.findByText(/تعذّر سرد الدلو \(Access Denied\)/)).toBeInTheDocument();
    expect(screen.queryByText(/لا فروق بين القاعدة والتخزين/)).toBeNull();
  });

  it("reports a clean reconciliation without rows", async () => {
    storageIntegrity.mockResolvedValue(
      inventory({
        files: {
          total: 46,
          attachedToDocuments: 21,
          attachedToReportRuns: 1,
          unreferencedCount: 0,
          unreferencedTruncated: false,
          unreferenced: [],
        },
        storage: {
          listedObjects: 46,
          listingTruncated: false,
          listingFailed: false,
          listingError: null,
          missingObjectsCount: 0,
          missingObjectsTruncated: false,
          missingObjects: [],
          orphanObjectsCount: 0,
          orphanObjectsTruncated: false,
          orphanObjects: [],
        },
      }),
    );
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));

    expect(await screen.findByText(/لا فروق بين القاعدة والتخزين/)).toBeInTheDocument();
  });

  it("shows the server reason when the inventory is denied", async () => {
    storageIntegrity.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Missing permission: files.integrity"));
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));

    expect(await screen.findByText(/Missing permission: files.integrity/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});

describe("Maintenance debris cleanup", () => {
  beforeEach(() => {
    localStorage.setItem("edas.v1.role", JSON.stringify("system_admin"));
    storageIntegrity.mockResolvedValue(debrisInventory());
  });

  it("previews the plan without deleting anything", async () => {
    purgeUnreferencedFiles.mockResolvedValue(purgePlan());
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));
    fireEvent.click(await screen.findByRole("button", { name: /معاينة خطة التنظيف/ }));

    expect(await screen.findByText(/خطة الحذف في الدلو edas-documents: 1 صفوف ملفات و2 كائنات تخزين/)).toBeInTheDocument();
    expect(screen.getByText("loose.pdf · documents/2026/loose.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("documents/2026/orphan.pdf")).toHaveLength(2);
    expect(purgeUnreferencedFiles).toHaveBeenCalledWith({});
    expect(screen.getByRole("button", { name: /حذف ما في الخطة/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /تأكيد الحذف النهائي/ })).toBeNull();
    expect(storageIntegrity).toHaveBeenCalledTimes(1);
  });

  it("deletes only after the second confirmation and re-reads the inventory", async () => {
    purgeUnreferencedFiles
      .mockResolvedValueOnce(purgePlan())
      .mockResolvedValueOnce(purgePlan({ dryRun: false, deleted: { files: 1, objects: 2, failures: [] } }));
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));
    fireEvent.click(await screen.findByRole("button", { name: /معاينة خطة التنظيف/ }));
    await screen.findByText(/خطة الحذف في الدلو/);

    fireEvent.click(screen.getByRole("button", { name: /حذف ما في الخطة/ }));
    expect(purgeUnreferencedFiles).not.toHaveBeenCalledWith({ confirm: true });

    fireEvent.click(screen.getByRole("button", { name: /تأكيد الحذف النهائي/ }));

    await waitFor(() => expect(purgeUnreferencedFiles).toHaveBeenCalledWith({ confirm: true }));
    expect(await screen.findByText(/نُفّذ التنظيف: 1 صفوف ملفات و2 كائنات تخزين حُذفت/)).toBeInTheDocument();
    expect(storageIntegrity).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/خطة الحذف في الدلو/)).toBeNull();
  });

  it("reports which objects the bucket refused to delete", async () => {
    purgeUnreferencedFiles
      .mockResolvedValueOnce(purgePlan())
      .mockResolvedValueOnce(purgePlan({ dryRun: false, deleted: { files: 1, objects: 1, failures: ["documents/2026/orphan.pdf"] } }));
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));
    fireEvent.click(await screen.findByRole("button", { name: /معاينة خطة التنظيف/ }));
    await screen.findByText(/خطة الحذف في الدلو/);
    fireEvent.click(screen.getByRole("button", { name: /حذف ما في الخطة/ }));
    fireEvent.click(screen.getByRole("button", { name: /تأكيد الحذف النهائي/ }));

    expect(await screen.findByText(/تعذّر حذف 1 كائناً من الدلو/)).toBeInTheDocument();
    expect(screen.getAllByText("documents/2026/orphan.pdf")).toHaveLength(2);
  });

  it("keeps the cleanup entry away from roles that cannot purge", async () => {
    localStorage.setItem("edas.v1.role", JSON.stringify("employee"));
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));

    await screen.findByText(/documents\/2026\/loose\.pdf/);
    expect(screen.queryByRole("button", { name: /معاينة خطة التنظيف/ })).toBeNull();
    expect(purgeUnreferencedFiles).not.toHaveBeenCalled();
  });

  it("shows the cap warning when the plan is smaller than the debris found", async () => {
    purgeUnreferencedFiles.mockResolvedValue(purgePlan({ files: [], storageKeys: [] }));
    storageIntegrity.mockResolvedValue(
      inventory({
        files: {
          total: 90,
          attachedToDocuments: 21,
          attachedToReportRuns: 1,
          unreferencedCount: 64,
          unreferencedTruncated: true,
          unreferenced: [],
        },
      }),
    );
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));
    fireEvent.click(await screen.findByRole("button", { name: /معاينة خطة التنظيف/ }));

    expect(await screen.findByText(/الخطة مقيّدة بأول 50 صفاً؛ البيات الكلي 64/)).toBeInTheDocument();
  });

  it("surfaces a denied purge with the reason instead of a silent failure", async () => {
    purgeUnreferencedFiles.mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Missing capability: files.purge", undefined, null, "تفتقد صلاحية تنظيف الملفات"),
    );
    render(<Maintenance />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /جرد التخزين/ }));
    fireEvent.click(await screen.findByRole("button", { name: /معاينة خطة التنظيف/ }));

    expect(await screen.findByText("تفتقد صلاحية تنظيف الملفات")).toBeInTheDocument();
    expect(screen.queryByText(/خطة الحذف في الدلو/)).toBeNull();
  });
});

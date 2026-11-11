import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DestructionCertificateDto } from "@edas/shared";
import { AppProvider } from "../store";
import { DestructionCertificateModal } from "./policies-retention-parts";

vi.mock("../config", () => ({ config: { apiBaseUrl: "http://localhost:4210/api/v1", oidc: {}, useApi: true } }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>{children}</AppProvider>
  </MemoryRouter>
);

function certificate(overrides: Partial<DestructionCertificateDto> = {}): DestructionCertificateDto {
  return {
    certificateRef: "DES-0F1E2D3C-2026",
    auditEventId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    auditHash: "9f2c4b71e0a3d5864c1f",
    destroyedAt: "2026-10-31T08:00:00.000Z",
    performedById: "user-1",
    performedBy: "أسماء العلي",
    retentionItemId: "item-1",
    document: { id: "doc-1", docNo: "DOC-2026-0001", title: "محضر تدقيق الحسابات" },
    policy: { id: "pol-1", name: "سياسة الإتلاف بعد 5 سنوات", retentionMonths: 60, legalBasis: "نظام Archive 14" },
    dueAt: "2026-10-30T00:00:00.000Z",
    note: "انتهاء المدة النظامية",
    files: [
      {
        version: 1,
        originalName: "محضر.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "d1a4f7c3b0e9285643def111aabb2223cc44dd55ee66ff77889900aabbccddee",
        uploadedBy: "خالد",
        uploadedAt: "2021-01-04T08:00:00.000Z",
      },
    ],
    fileCount: 1,
    totalBytes: 4096,
    storageErrors: 0,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("destruction certificate", () => {
  it("shows the destroyed content, the policy basis and the audit reference", async () => {
    render(<DestructionCertificateModal certificate={certificate()} loading={false} onClose={() => {}} />, { wrapper });

    expect(await screen.findByText(/DES-0F1E2D3C-2026/)).toBeInTheDocument();
    expect(screen.getByText("DOC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("محضر.pdf")).toBeInTheDocument();
    expect(screen.getByText(/d1a4f7c3b0e9285643def111aabb2223/)).toBeInTheDocument();
    expect(screen.getByText("نظام Archive 14")).toBeInTheDocument();
    expect(screen.getByText("أسماء العلي")).toBeInTheDocument();
    expect(screen.getByText(/9f2c4b71e0a3d5864c1f/)).toBeInTheDocument();
    expect(screen.queryByText(/وضع العرض/)).toBeNull();
  });

  it("warns when stored objects could not be deleted", async () => {
    render(<DestructionCertificateModal certificate={certificate({ storageErrors: 2 })} loading={false} onClose={() => {}} />, {
      wrapper,
    });

    expect(await screen.findByText(/تعذّر حذف 2 من الكائنات المخزنة/)).toBeInTheDocument();
  });

  it("reports that no file was attached when the manifest is empty", async () => {
    render(
      <DestructionCertificateModal
        certificate={certificate({ files: [], fileCount: 0, totalBytes: 0 })}
        loading={false}
        onClose={() => {}}
      />,
      { wrapper },
    );

    expect(await screen.findByText("لا توجد ملفات مرتبطة بالوثيقة وقت الإتلاف.")).toBeInTheDocument();
  });

  it("stays open with a pending state while the certificate is being fetched", async () => {
    render(<DestructionCertificateModal certificate={null} loading onClose={() => {}} />, { wrapper });

    expect(await screen.findByText("جارٍ استخراج الشهادة…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /طباعة/ })).toBeDisabled();
  });
});

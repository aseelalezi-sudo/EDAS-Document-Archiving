import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdtemp: vi.fn().mockRejectedValue(new Error("No space left on device")) };
});

import { PreviewService } from "./preview.service";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_HEAD = (() => {
  const name = Buffer.from("[Content_Types].xml");
  const head = Buffer.alloc(30 + name.length);
  head.write("PK", 0, "latin1");
  head[2] = 3;
  head[3] = 4;
  head.writeUInt16LE(name.length, 26);
  name.copy(head, 30);
  return head;
})();

describe("PreviewService work directory failures", () => {
  it("fails the job without cleaning a directory that was never created", async () => {
    const stored = {
      id: "file-1",
      storageKey: "documents/2026/a.docx",
      originalName: "a.docx",
      mimeType: DOCX_MIME,
      sizeBytes: 1024n,
      checksumSha256: "abc123",
      uploadedById: "user-1",
    };
    const storage = {
      readHead: vi.fn().mockResolvedValue(DOCX_HEAD),
      head: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      downloadToFile: vi.fn().mockResolvedValue(1024),
      presignExpiresSeconds: 900,
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new PreviewService(
      {
        readableFile: vi.fn().mockResolvedValue({ actor: { id: "user-1", departmentId: "dept-1" }, file: stored, documents: [] }),
        canDownloadAny: vi.fn().mockResolvedValue(true),
      } as never,
      storage as never,
      {
        officeAvailability: vi.fn().mockResolvedValue({ command: "/opt/soffice", version: "7.6" }),
        convertOfficeToPdf: vi.fn(),
      } as never,
      audit as never,
      { resolveActor: vi.fn().mockResolvedValue({ id: "user-1", departmentId: "dept-1" }) } as never,
      { get: (_key: string, fallback?: string) => fallback } as never,
    );

    await service.getPreview({ sub: "user-1" } as never, "file-1");

    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "preview.convert.done",
          result: "failure",
          detail: expect.objectContaining({ reason: "conversion_failed" }),
        }),
      ),
    );
    expect(storage.downloadToFile).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
    await expect(service.getPreview({ sub: "user-1" } as never, "file-1")).resolves.toMatchObject({
      status: "failed",
      reason: "conversion_failed",
    });
  });
});

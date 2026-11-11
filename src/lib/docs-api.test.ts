import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  foldersTree: vi.fn(async () => ({ items: [] })),
  get: vi.fn(async () => []),
  post: vi.fn(async () => ({ ok: true })),
  patch: vi.fn(async () => ({ ok: true })),
  put: vi.fn(async () => []),
  del: vi.fn(async () => ({ deleted: true })),
  listDocuments: vi.fn(async () => ({ items: [], meta: { total: 0 } })),
  getDocument: vi.fn(async () => ({ id: "d1", versions: [{ id: "v1" }] })),
  createDocument: vi.fn(async () => ({ id: "d1" })),
  presignUpload: vi.fn(async () => ({ url: "https://s3.test/put", method: "PUT", storageKey: "documents/2026/a.pdf" })),
  registerFile: vi.fn(async () => ({ id: "file-1" })),
  downloadUrl: vi.fn(async () => ({ url: "https://files.test/a", fileName: "a.pdf" })),
  preview: vi.fn(async () => ({ status: "READY" })),
  retryPreview: vi.fn(async () => ({ status: "PENDING" })),
  previewCapabilities: vi.fn(async () => ({ office: true })),
  previewContentUrl: vi.fn((fileId: string, kind: string) => `/api/v1/preview/files/${fileId}/content?kind=${kind}`),
}));

vi.mock("./api-client", () => ({ createApiClient: () => client }));

import { docsApi, uploadToStorage } from "./docs-api";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("docsApi endpoints", () => {
  it("maps folder operations", async () => {
    await docsApi.foldersTree();
    await docsApi.createFolder({ name: "مجلد", scope: "DEPARTMENT" });
    await docsApi.updateFolder("f1", { name: "جديد", aclInherit: false });
    await docsApi.folderAcl("f1");
    await docsApi.folderAcls();
    await docsApi.putFolderAcl("f1", [{ principalType: "USER", principalId: "user-1", actions: ["VIEW"], effect: "ALLOW" }]);
    await docsApi.deleteFolder("f1");

    expect(client.foldersTree).toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledWith("/folders", { name: "مجلد", scope: "DEPARTMENT" });
    expect(client.patch).toHaveBeenCalledWith("/folders/f1", { name: "جديد", aclInherit: false });
    expect(client.get).toHaveBeenCalledWith("/folders/f1/acl");
    expect(client.get).toHaveBeenCalledWith("/folders/acls");
    expect(client.put).toHaveBeenCalledWith("/folders/f1/acl", {
      rules: [{ principalType: "USER", principalId: "user-1", actions: ["VIEW"], effect: "ALLOW" }],
    });
    expect(client.del).toHaveBeenCalledWith("/folders/f1");
  });

  it("maps document listing, trash and lifecycle operations", async () => {
    await docsApi.listDocuments({ q: "عقد" });
    await docsApi.trashDocuments({ page: 2 });
    await docsApi.getDocument("d1");
    await docsApi.createDocument({ title: "عقد", fileId: "file-1" });
    await docsApi.updateDocument("d1", { title: "جديد", transition: "ARCHIVE" });
    await docsApi.deleteDocument("d1");
    await docsApi.restoreDocument("d1");
    await docsApi.purgeDocument("d1");
    await docsApi.checkout("d1");
    await docsApi.checkin("d1");
    await docsApi.requestSignature("d1");
    await docsApi.sign("d1");
    await docsApi.declareRecord("d1");

    expect(client.listDocuments).toHaveBeenCalledWith({ q: "عقد" });
    expect(client.get).toHaveBeenCalledWith("/documents/trash", { query: { page: 2 } });
    expect(client.getDocument).toHaveBeenCalledWith("d1");
    expect(client.post).toHaveBeenCalledWith("/documents", { title: "عقد", fileId: "file-1" });
    expect(client.patch).toHaveBeenCalledWith("/documents/d1", { title: "جديد", transition: "ARCHIVE" });
    expect(client.del).toHaveBeenCalledWith("/documents/d1");
    expect(client.post).toHaveBeenCalledWith("/documents/d1/restore", {});
    expect(client.del).toHaveBeenCalledWith("/documents/d1/purge");
    expect(client.post).toHaveBeenCalledWith("/documents/d1/checkout", {});
    expect(client.post).toHaveBeenCalledWith("/documents/d1/checkin", {});
    expect(client.post).toHaveBeenCalledWith("/documents/d1/signature/request", {});
    expect(client.post).toHaveBeenCalledWith("/documents/d1/signature/sign", {});
    expect(client.post).toHaveBeenCalledWith("/documents/d1/declare-record", {});
  });

  it("maps versions, files and preview helpers", async () => {
    await docsApi.addVersion("d1", { fileId: "file-2", comment: "نسخة" });
    await docsApi.restoreVersion("d1", "v1");
    await docsApi.presignUpload({ fileName: "a.pdf", mimeType: "application/pdf" });
    await docsApi.registerFile({
      storageKey: "documents/2026/a.pdf",
      originalName: "a.pdf",
      mimeType: "application/pdf",
      checksumSha256: "abc",
    });
    await docsApi.downloadUrl("file-1", true);
    await docsApi.preview("file-1");
    await docsApi.retryPreview("file-1");
    await docsApi.previewCapabilities();
    await docsApi.versions("d1");

    expect(client.post).toHaveBeenCalledWith("/documents/d1/versions", { fileId: "file-2", comment: "نسخة" });
    expect(client.post).toHaveBeenCalledWith("/documents/d1/versions/v1/restore", {});
    expect(client.presignUpload).toHaveBeenCalledWith({ fileName: "a.pdf", mimeType: "application/pdf" });
    expect(client.downloadUrl).toHaveBeenCalledWith("file-1", true);
    expect(client.preview).toHaveBeenCalledWith("file-1", { signal: undefined });
    expect(client.retryPreview).toHaveBeenCalledWith("file-1");
    expect(client.previewCapabilities).toHaveBeenCalled();
    expect(docsApi.previewContentUrl("file-1", "original")).toBe("/api/v1/preview/files/file-1/content?kind=original");
  });

  it("reads versions from the document detail", async () => {
    await expect(docsApi.versions("d1")).resolves.toEqual([{ id: "v1" }]);
  });
});

describe("uploadToStorage", () => {
  it("presigns, uploads the bytes, hashes them and registers the file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = {
      name: "a.pdf",
      type: "application/pdf",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
    } as unknown as File;

    const registered = await uploadToStorage(file);

    const expectedDigest = await webcrypto.subtle.digest("SHA-256", bytes);
    const expectedChecksum = [...new Uint8Array(expectedDigest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

    expect(client.presignUpload).toHaveBeenCalledWith({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 4 });
    expect(fetchMock).toHaveBeenCalledWith("https://s3.test/put", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    expect(client.registerFile).toHaveBeenCalledWith({
      storageKey: "documents/2026/a.pdf",
      originalName: "a.pdf",
      mimeType: "application/pdf",
      checksumSha256: expectedChecksum,
      sizeBytes: 4,
    });
    expect(registered).toEqual({ id: "file-1" });
  });

  it("falls back to a binary content type for files without one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    const file = {
      name: "scan.bin",
      type: "",
      size: 1,
      arrayBuffer: async () => new Uint8Array([0]).buffer,
    } as unknown as File;

    await uploadToStorage(file);

    expect(client.presignUpload).toHaveBeenCalledWith({ fileName: "scan.bin", mimeType: "application/octet-stream", sizeBytes: 1 });
  });

  it("refuses to register a file the storage rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    const file = {
      name: "a.pdf",
      type: "application/pdf",
      size: 1,
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    } as unknown as File;

    await expect(uploadToStorage(file)).rejects.toThrow(/403/);
    expect(client.registerFile).not.toHaveBeenCalled();
  });
});

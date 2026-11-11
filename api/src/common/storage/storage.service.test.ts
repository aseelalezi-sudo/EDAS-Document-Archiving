import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "./storage.service";

function makeConfig(values: Record<string, string>) {
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
}

describe("StorageService presign endpoints", () => {
  it("presigns against the public endpoint when MINIO_PUBLIC_ENDPOINT is set", async () => {
    const service = new StorageService(
      makeConfig({
        MINIO_ENDPOINT: "minio",
        MINIO_PORT: "9000",
        MINIO_ACCESS_KEY: "ak",
        MINIO_SECRET_KEY: "sk",
        MINIO_PUBLIC_ENDPOINT: "localhost",
        MINIO_PUBLIC_PORT: "9001",
      }),
    );
    const [upload, download] = await Promise.all([
      service.presignUpload("documents/2026/a.txt", "text/plain"),
      service.presignDownload("documents/2026/a.txt"),
    ]);
    expect(upload).toContain("http://localhost:9001/edas-documents/documents/2026/a.txt");
    expect(download).toContain("http://localhost:9001/edas-documents/documents/2026/a.txt");
    expect(upload).not.toContain("minio:9000");
  });

  it("presigns against the internal endpoint by default", async () => {
    const service = new StorageService(
      makeConfig({
        MINIO_ENDPOINT: "localhost",
        MINIO_PORT: "9000",
        MINIO_ACCESS_KEY: "ak",
        MINIO_SECRET_KEY: "sk",
      }),
    );
    const download = await service.presignDownload("documents/2026/b.txt");
    expect(download).toContain("http://localhost:9000/edas-documents/documents/2026/b.txt");
  });

  it("signs attachments for downloads and inline responses for previews", async () => {
    const service = new StorageService(
      makeConfig({ MINIO_ENDPOINT: "localhost", MINIO_PORT: "9000", MINIO_ACCESS_KEY: "ak", MINIO_SECRET_KEY: "sk" }),
    );
    const [download, preview] = await Promise.all([
      service.presignDownload("documents/2026/c.pdf", "c.pdf"),
      service.presignDownload("documents/2026/c.pdf", "c.pdf", "inline"),
    ]);
    expect(download).toContain("response-content-disposition=attachment");
    expect(preview).toContain("response-content-disposition=inline");
  });
});

describe("StorageService object reads", () => {
  function withClient(send: () => Promise<unknown>) {
    const service = new StorageService(
      makeConfig({ MINIO_ENDPOINT: "localhost", MINIO_PORT: "9000", MINIO_ACCESS_KEY: "ak", MINIO_SECRET_KEY: "sk" }),
    );
    (service as unknown as { client: { send: (command: never) => Promise<never> } }).client.send = send as never;
    return service;
  }

  it("buffers a stored object up to the byte cap", async () => {
    const service = withClient(async () => ({ Body: Readable.from([Buffer.from("contract"), Buffer.from("-bytes")]) }));

    await expect(service.get("documents/2026/a.pdf", 1024)).resolves.toEqual(Buffer.from("contract-bytes"));
  });

  it("refuses to buffer an object that outgrows the cap", async () => {
    const service = withClient(async () => ({ Body: Readable.from([Buffer.from("contract-bytes")]) }));

    await expect(service.get("documents/2026/a.pdf", 5)).resolves.toBeNull();
  });

  it("hashes a stored object by streaming it once", async () => {
    const service = withClient(async () => ({ Body: Readable.from([Buffer.from("contract"), Buffer.from("-bytes")]) }));
    const expected = createHash("sha256").update("contract-bytes").digest("hex");

    await expect(service.sha256("documents/2026/a.pdf", 1024)).resolves.toEqual({
      checksum: expected,
      sizeBytes: 14,
    });
  });

  it("refuses to hash an object that outgrows the cap", async () => {
    const service = withClient(async () => ({ Body: Readable.from([Buffer.from("contract-bytes")]) }));

    await expect(service.sha256("documents/2026/a.pdf", 5)).resolves.toBeNull();
  });

  it("reports a missing object as null instead of throwing", async () => {
    const service = withClient(async () => {
      throw new Error("NoSuchKey: The specified key does not exist.");
    });

    await expect(service.get("documents/2026/gone.pdf", 1024)).resolves.toBeNull();
  });

  it("walks the paginated listing until the bucket is exhausted", async () => {
    const pages = [
      { Contents: [{ Key: "documents/2026/1.pdf" }, { Key: "documents/2026/2.pdf" }], IsTruncated: true, NextContinuationToken: "next" },
      { Contents: [{ Key: "documents/2026/3.pdf" }], IsTruncated: false },
    ];
    let calls = 0;
    const service = withClient(async () => pages[calls++]);

    await expect(service.listKeys("documents/")).resolves.toEqual({
      keys: ["documents/2026/1.pdf", "documents/2026/2.pdf", "documents/2026/3.pdf"],
      truncated: false,
    });
    expect(calls).toBe(2);
  });

  it("truncates a listing that exceeds the requested cap", async () => {
    const service = withClient(async () => ({
      Contents: [{ Key: "documents/2026/1.pdf" }, { Key: "documents/2026/2.pdf" }, { Key: "documents/2026/3.pdf" }],
      IsTruncated: false,
    }));

    await expect(service.listKeys("documents/", 2)).resolves.toEqual({
      keys: ["documents/2026/1.pdf", "documents/2026/2.pdf"],
      truncated: true,
    });
  });

  it("surfaces a listing failure instead of pretending the bucket is empty", async () => {
    const service = withClient(async () => {
      throw new Error("Access Denied");
    });

    await expect(service.listKeys("")).resolves.toEqual({ keys: [], truncated: false, error: "Access Denied" });
  });
});

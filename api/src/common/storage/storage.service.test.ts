import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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

  it("switches both endpoints to https when TLS is enabled", async () => {
    const internal = new StorageService(
      makeConfig({
        MINIO_ENDPOINT: "minio",
        MINIO_PORT: "9000",
        MINIO_ACCESS_KEY: "ak",
        MINIO_SECRET_KEY: "sk",
        MINIO_USE_SSL: "true",
      }),
    );
    await expect(internal.presignDownload("documents/2026/d.txt")).resolves.toContain("https://minio:9000/edas-documents/");

    const both = new StorageService(
      makeConfig({
        MINIO_ENDPOINT: "minio",
        MINIO_PORT: "9000",
        MINIO_ACCESS_KEY: "ak",
        MINIO_SECRET_KEY: "sk",
        MINIO_USE_SSL: "true",
        MINIO_PUBLIC_ENDPOINT: "files.example",
      }),
    );
    await expect(both.presignDownload("documents/2026/d.txt")).resolves.toContain("https://files.example:9000/edas-documents/");
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

  it("buffers an empty body, string chunks and byte-array chunks", async () => {
    const empty = withClient(async () => ({}));
    await expect(empty.get("documents/2026/empty.pdf", 1024)).resolves.toBeNull();

    const strings = withClient(async () => ({ Body: Readable.from(["contract", "-bytes"]) }));
    await expect(strings.get("documents/2026/a.pdf", 1024)).resolves.toEqual(Buffer.from("contract-bytes"));

    const bytes = withClient(async () => ({ Body: Readable.from([new Uint8Array([97, 98, 99])]) }));
    await expect(bytes.sha256("documents/2026/a.pdf", 1024)).resolves.toMatchObject({ sizeBytes: 3 });
  });

  it("skips a listing page without contents or without object keys", async () => {
    const blank = withClient(async () => ({ IsTruncated: false }));
    await expect(blank.listKeys("documents/")).resolves.toEqual({ keys: [], truncated: false });

    const keyless = withClient(async () => ({ Contents: [{ Size: 12 }, { Key: "documents/2026/1.pdf" }] }));
    await expect(keyless.listKeys("documents/")).resolves.toEqual({ keys: ["documents/2026/1.pdf"], truncated: false });
  });

  it("stringifies a listing failure that is not an Error", async () => {
    const service = withClient(async () => {
      throw "bucket offline";
    });

    await expect(service.listKeys("")).resolves.toEqual({ keys: [], truncated: false, error: "bucket offline" });
  });
});

describe("StorageService object writes and metadata", () => {
  function tracked() {
    const sent: { constructor: { name: string }; input: Record<string, unknown> }[] = [];
    const service = new StorageService(
      makeConfig({
        MINIO_ENDPOINT: "localhost",
        MINIO_PORT: "9000",
        MINIO_ACCESS_KEY: "ak",
        MINIO_SECRET_KEY: "sk",
        MINIO_BUCKET: "edas-test",
        MINIO_PRESIGN_EXPIRES: "120",
      }),
    );
    (service as unknown as { client: { send: (command: never) => Promise<never> } }).client.send = (async (command: never) => {
      sent.push(command);
      return {};
    }) as never;
    return { service, sent };
  }

  it("exposes the configured bucket and presign lifetime", () => {
    const { service } = tracked();

    expect(service.bucketName).toBe("edas-test");
    expect(service.presignExpiresSeconds).toBe(120);
  });

  it("streams an object with the requested range and its metadata", async () => {
    const { service, sent } = tracked();
    const body = Readable.from([Buffer.from("pdf")]);
    (service as unknown as { client: { send: (command: { input: Record<string, unknown> }) => Promise<unknown> } }).client.send = async (
      command,
    ) => {
      sent.push(command as never);
      return {
        Body: body,
        ContentLength: 3,
        ContentRange: "bytes 0-2/3",
        ContentType: "application/pdf",
      };
    };

    const stream = await service.getObjectStream("documents/2026/a.pdf", "bytes=0-2");

    expect(stream).toEqual({ body, contentLength: 3, contentRange: "bytes 0-2/3", contentType: "application/pdf" });
    expect(sent[0].input.Range).toBe("bytes=0-2");
  });

  it("defaults the stream metadata and omits the range when none is asked", async () => {
    const { service, sent } = tracked();
    (service as unknown as { client: { send: (command: { input: Record<string, unknown> }) => Promise<unknown> } }).client.send = async (
      command,
    ) => {
      sent.push(command as never);
      return { Body: Readable.from([Buffer.from("x")]) };
    };

    const stream = await service.getObjectStream("documents/2026/b.bin");

    expect(stream.contentLength).toBe(0);
    expect(stream.contentRange).toBeNull();
    expect(stream.contentType).toBe("application/octet-stream");
    expect((sent[0].input as Record<string, unknown>).Range).toBeUndefined();
  });

  it("refuses a stream without a body", async () => {
    const { service } = tracked();

    await expect(service.getObjectStream("documents/2026/empty.pdf")).rejects.toThrow(/has no body/);
  });

  it("uploads an object with the bucket, key and content type", async () => {
    const { service, sent } = tracked();

    await service.put("reports/2026/run.csv", "a,b", "text/csv");

    expect(sent[0].constructor.name).toBe("PutObjectCommand");
    expect(sent[0].input).toMatchObject({ Bucket: "edas-test", Key: "reports/2026/run.csv", Body: "a,b", ContentType: "text/csv" });
  });

  it("reports object metadata from head and treats a failure as missing", async () => {
    const { service } = tracked();
    const commands: { constructor: { name: string } }[] = [];
    (service as unknown as { client: { send: (command: never) => Promise<unknown> } }).client.send = async (command) => {
      commands.push(command as never);
      return { ContentLength: 4096, ContentType: "application/pdf" };
    };

    await expect(service.head("documents/2026/a.pdf")).resolves.toEqual({ sizeBytes: 4096, mimeType: "application/pdf" });
    expect(commands[0].constructor.name).toBe("HeadObjectCommand");

    (service as unknown as { client: { send: () => Promise<unknown> } }).client.send = async () => {
      throw new Error("Forbidden");
    };
    await expect(service.head("documents/2026/a.pdf")).resolves.toBeNull();
  });

  it("defaults the size when head returns no content length", async () => {
    const { service } = tracked();
    (service as unknown as { client: { send: () => Promise<unknown> } }).client.send = async () => ({});

    await expect(service.head("documents/2026/a.pdf")).resolves.toEqual({ sizeBytes: 0, mimeType: undefined });
  });

  it("deletes a single object", async () => {
    const { service, sent } = tracked();

    await service.remove("documents/2026/a.pdf");

    expect(sent[0].constructor.name).toBe("DeleteObjectCommand");
    expect(sent[0].input).toMatchObject({ Bucket: "edas-test", Key: "documents/2026/a.pdf" });
  });

  it("reports a hashing failure as null", async () => {
    const { service } = tracked();
    (service as unknown as { client: { send: () => Promise<unknown> } }).client.send = async () => {
      throw new Error("SlowDown");
    };

    await expect(service.sha256("documents/2026/a.pdf", 1024)).resolves.toBeNull();
  });

  it("reports an empty body as null when hashing", async () => {
    const { service } = tracked();
    (service as unknown as { client: { send: () => Promise<unknown> } }).client.send = async () => ({});

    await expect(service.sha256("documents/2026/a.pdf", 1024)).resolves.toBeNull();
  });
});

describe("StorageService ranged head reads", () => {
  function withBody(send: (command: { input: Record<string, unknown> }) => Promise<unknown>) {
    const service = new StorageService(
      makeConfig({ MINIO_ENDPOINT: "localhost", MINIO_PORT: "9000", MINIO_ACCESS_KEY: "ak", MINIO_SECRET_KEY: "sk" }),
    );
    (service as unknown as { client: { send: typeof send } }).client.send = send;
    return service;
  }

  it("copies the inspected revision to the server-owned key", async () => {
    const send = vi.fn().mockResolvedValue({});
    await withBody(send).copyUpload("documents/in box.pdf", "documents/sealed/id/copy.pdf", '"rev"');
    expect(send.mock.calls[0][0].input).toMatchObject({
      Key: "documents/sealed/id/copy.pdf",
      CopySource: "edas-documents/documents/in%20box.pdf",
      CopySourceIfMatch: '"rev"',
    });
  });

  it("reads only the requested prefix of an object", async () => {
    const sent: { input: Record<string, unknown> }[] = [];
    const service = withBody(async (command) => {
      sent.push(command);
      return { Body: Readable.from([Buffer.from("abcdefghij")]) };
    });

    await expect(service.readHead("documents/2026/a.pdf", 4)).resolves.toEqual(Buffer.from("abcd"));
    expect(sent[0].input.Range).toBe("bytes=0-3");
  });

  it("reads the default prefix when no size is given", async () => {
    const service = withBody(async () => ({ Body: Readable.from([Buffer.from("short")]) }));

    await expect(service.readHead("documents/2026/a.pdf")).resolves.toEqual(Buffer.from("short"));
  });

  it("accepts a byte array chunk", async () => {
    const service = withBody(async () => ({ Body: Readable.from([new Uint8Array([97, 98, 99])]) }));

    await expect(service.readHead("documents/2026/a.pdf", 3)).resolves.toEqual(Buffer.from("abc"));
  });

  it("floors a fractional or zero limit to one byte", async () => {
    const sent: { input: Record<string, unknown> }[] = [];
    const service = withBody(async (command) => {
      sent.push(command);
      return { Body: Readable.from([Buffer.from("abc")]) };
    });

    await expect(service.readHead("documents/2026/a.pdf", 0.4)).resolves.toEqual(Buffer.from("a"));
    expect(sent[0].input.Range).toBe("bytes=0-0");
  });

  it("returns null for a missing body or a failed request", async () => {
    const noBody = withBody(async () => ({}));
    await expect(noBody.readHead("documents/2026/a.pdf")).resolves.toBeNull();

    const failing = withBody(async () => {
      throw new Error("Access Denied");
    });
    await expect(failing.readHead("documents/2026/a.pdf")).resolves.toBeNull();
  });
});

describe("StorageService local downloads", () => {
  function withBody(body: unknown) {
    const service = new StorageService(
      makeConfig({ MINIO_ENDPOINT: "localhost", MINIO_PORT: "9000", MINIO_ACCESS_KEY: "ak", MINIO_SECRET_KEY: "sk" }),
    );
    (service as unknown as { client: { send: () => Promise<unknown> } }).client.send = async () => ({ Body: body });
    return service;
  }

  it("writes the object to disk and reports the byte count", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edas-storage-"));
    const target = join(dir, "preview.bin");

    try {
      const service = withBody(Readable.from([Buffer.from("12345"), Buffer.from("6789")]));
      await expect(service.downloadToFile("documents/2026/a.bin", target, 1024)).resolves.toBe(9);
      await expect(readFile(target)).resolves.toEqual(Buffer.from("123456789"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("aborts a download that outgrows the byte cap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edas-storage-"));
    const target = join(dir, "preview.bin");

    try {
      const service = withBody(Readable.from([Buffer.from("0123456789")]));
      await expect(service.downloadToFile("documents/2026/a.bin", target, 5)).rejects.toThrow(/exceeds the 5 byte preview limit/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a download without a body", async () => {
    const service = withBody(undefined);

    await expect(service.downloadToFile("documents/2026/a.bin", join(tmpdir(), "unused.bin"), 1024)).rejects.toThrow(/has no body/);
  });
});

describe("StorageService prefix cleanup", () => {
  function cleanup(listKeys: { keys: string[]; truncated: boolean; error?: string }, failures: string[] = []) {
    const service = new StorageService(
      makeConfig({ MINIO_ENDPOINT: "localhost", MINIO_PORT: "9000", MINIO_ACCESS_KEY: "ak", MINIO_SECRET_KEY: "sk" }),
    );
    const internals = service as unknown as {
      listKeys: (prefix: string, limit?: number) => Promise<typeof listKeys>;
      remove: (key: string) => Promise<void>;
    };
    internals.listKeys = vi.fn().mockResolvedValue(listKeys);
    internals.remove = vi.fn(async (key: string) => {
      if (failures.includes(key)) throw new Error("Access Denied");
    });
    return { service, internals };
  }

  it("removes every listed key and counts the failures", async () => {
    const { service } = cleanup({ keys: ["previews/a", "previews/b", "previews/c"], truncated: false }, ["previews/b"]);

    await expect(service.removePrefix("previews/")).resolves.toEqual({ removed: 2, failed: 1, truncated: false });
  });

  it("forwards the truncation flag and stops on an empty listing", async () => {
    const { service } = cleanup({ keys: [], truncated: true });

    await expect(service.removePrefix("previews/", 10)).resolves.toEqual({ removed: 0, failed: 0, truncated: true });
  });
});

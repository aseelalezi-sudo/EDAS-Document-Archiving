import { Readable, Writable } from "node:stream";
import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "../../common/auth/principal";
import { PreviewController } from "./preview.controller";

const principal = { sub: "keycloak-1" } as Principal;

class FakeResponse extends Writable {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  private readonly chunks: Buffer[] = [];

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function build(
  object: {
    body?: Buffer;
    contentLength?: number;
    contentRange?: string | null;
    contentType?: string;
  } = {},
) {
  const body = object.body ?? Buffer.from("%PDF-1.7\n");
  const preview = {
    resolveContent: vi.fn().mockResolvedValue({
      key: "documents/2026/contract.pdf",
      contentType: object.contentType ?? "application/pdf",
      fileName: "عقد توريد.pdf",
      sizeBytes: body.length,
    }),
  };
  const storage = {
    getObjectStream: vi.fn().mockResolvedValue({
      body: Readable.from([body]),
      contentLength: object.contentLength ?? body.length,
      contentRange: object.contentRange ?? null,
      contentType: object.contentType ?? "application/pdf",
    }),
  };
  return { controller: new PreviewController(preview as never, storage as never), preview, storage };
}

async function stream(controller: PreviewController, range: string | undefined, kind: "original" | "preview" = "original") {
  const response = new FakeResponse();
  const finished = new Promise<void>((resolve) => response.once("finish", resolve));
  await controller.content(principal, "file-1", kind, range, response as unknown as Response);
  await finished;
  return response;
}

describe("PreviewController.content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams an authorized original inline with private cache headers", async () => {
    const { controller, preview, storage } = build();

    const response = await stream(controller, undefined);

    expect(preview.resolveContent).toHaveBeenCalledWith(principal, "file-1", "original");
    expect(storage.getObjectStream).toHaveBeenCalledWith("documents/2026/contract.pdf", undefined);
    expect(response.statusCode).toBe(200);
    expect(response.text()).toBe("%PDF-1.7\n");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline;");
    expect(response.headers.get("content-disposition")).toContain(encodeURIComponent("عقد توريد.pdf"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe(String("%PDF-1.7\n".length));
  });

  it("keeps the 206 status and Content-Range for a valid byte range", async () => {
    const { controller, storage } = build({
      body: Buffer.from("%PDF"),
      contentLength: 4,
      contentRange: "bytes 0-3/20",
    });

    const response = await stream(controller, "bytes=0-3");

    expect(storage.getObjectStream).toHaveBeenCalledWith("documents/2026/contract.pdf", "bytes=0-3");
    expect(response.statusCode).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/20");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.text()).toBe("%PDF");
  });

  it("drops malformed multi-range headers instead of forwarding them to storage", async () => {
    const { controller, storage } = build();

    const response = await stream(controller, "bytes=0-1,4-5");

    expect(storage.getObjectStream).toHaveBeenCalledWith("documents/2026/contract.pdf", undefined);
    expect(response.statusCode).toBe(200);
  });

  it("rejects a range beyond the object with 416 and the real size", async () => {
    const { controller, storage } = build();

    const response = await stream(controller, "bytes=9000-");

    expect(storage.getObjectStream).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${"%PDF-1.7\n".length}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.text()).toBe("");
  });

  it("clamps a suffix range onto the last bytes", async () => {
    const { controller, storage } = build({ contentRange: "bytes 5-8/9", contentLength: 4 });

    await stream(controller, "bytes=-4");

    expect(storage.getObjectStream).toHaveBeenCalledWith("documents/2026/contract.pdf", "bytes=5-8");
  });

  it("serves the converted preview when kind=preview is requested", async () => {
    const { controller, preview } = build({ contentType: "application/pdf" });

    await stream(controller, undefined, "preview");

    expect(preview.resolveContent).toHaveBeenCalledWith(principal, "file-1", "preview");
    expect(preview.resolveContent).not.toHaveBeenCalledWith(principal, "file-1", "original");
  });

  it("answers 416 when storage itself refuses the range", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockRejectedValue({ $metadata: { httpStatusCode: 416 } });

    const response = await stream(controller, "bytes=0-1");

    expect(response.statusCode).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${"%PDF-1.7\n".length}`);
  });

  it("aborts with 502 when the object stream breaks mid-flight", async () => {
    const { controller, storage } = build();
    const body = new Readable({ read() {} });
    storage.getObjectStream.mockResolvedValue({ body, contentLength: 9, contentRange: null, contentType: "application/pdf" });
    const response = new FakeResponse();

    await controller.content(principal, "file-1", "original", undefined, response as unknown as Response);
    body.emit("error", new Error("socket hang up"));

    expect(response.statusCode).toBe(502);
    body.destroy();
    response.destroy();
  });

  it("ends the stream without a new status when the body breaks after the headers went out", async () => {
    const { controller, storage } = build();
    const body = new Readable({ read() {} });
    storage.getObjectStream.mockResolvedValue({ body, contentLength: 9, contentRange: null, contentType: "application/pdf" });
    const response = new FakeResponse();
    (response as unknown as { headersSent: boolean }).headersSent = true;

    await controller.content(principal, "file-1", "original", undefined, response as unknown as Response);
    body.emit("error", new Error("socket hang up"));

    expect(response.statusCode).toBe(200);
    body.destroy();
    response.destroy();
  });
});

describe("PreviewController delegation", () => {
  function delegated() {
    const preview = {
      capabilities: vi.fn().mockResolvedValue({ office: { available: true } }),
      getPreview: vi.fn().mockResolvedValue({ status: "ready" }),
      retry: vi.fn().mockResolvedValue({ status: "converting" }),
      cleanupCache: vi.fn().mockResolvedValue({ removed: 0 }),
      resolveContent: vi.fn(),
    };
    const controller = new PreviewController(preview as never, { getObjectStream: vi.fn() } as never);
    return { controller, preview };
  }

  it("forwards the capability probe, the preview read and the retry", async () => {
    const { controller, preview } = delegated();

    await expect(controller.capabilities()).resolves.toEqual({ office: { available: true } });
    await expect(controller.get(principal, "file-1")).resolves.toEqual({ status: "ready" });
    await expect(controller.retry(principal, "file-1")).resolves.toEqual({ status: "converting" });

    expect(preview.capabilities).toHaveBeenCalledWith();
    expect(preview.getPreview).toHaveBeenCalledWith(principal, "file-1");
    expect(preview.retry).toHaveBeenCalledWith(principal, "file-1");
  });

  it("forwards the cleanup window, including an omitted one", async () => {
    const { controller, preview } = delegated();

    await controller.cleanup(principal, { olderThanDays: 7 });
    await controller.cleanup(principal, {});

    expect(preview.cleanupCache).toHaveBeenNthCalledWith(1, principal, 7);
    expect(preview.cleanupCache).toHaveBeenNthCalledWith(2, principal, undefined);
  });
});

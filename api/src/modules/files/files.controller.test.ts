import { Readable, Writable } from "node:stream";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { StorageService } from "../../common/storage/storage.service";
import type { FilesService } from "./files.service";
import { FilesController } from "./files.controller";

const PRINCIPAL = { sub: "user-1", role: "EMPLOYEE" };

function fakeResponse() {
  const chunks: Buffer[] = [];
  const response = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  const status = vi.fn();
  const setHeader = vi.fn();
  const target = Object.assign(response, { status, setHeader, headersSent: false, chunks });
  status.mockReturnValue(target);
  return target;
}

function fakeRequest(host = "api.example", headers: Record<string, string> = {}): Request {
  return { headers, protocol: "http", get: (name: string) => (name === "host" ? host : undefined) } as unknown as Request;
}

function build(options: { publicUrl?: string } = {}) {
  const files = {
    presignUpload: vi.fn().mockResolvedValue({ uploadUrl: "https://minio/put" }),
    register: vi.fn().mockResolvedValue({ id: "file-1" }),
    integrity: vi.fn().mockResolvedValue({ checked: 0 }),
    purgeUnreferenced: vi.fn().mockResolvedValue({ removed: 0 }),
    verify: vi.fn().mockResolvedValue({ status: "ok" }),
    downloadUrl: vi.fn().mockResolvedValue({ url: "https://edas.example/content" }),
    openTicketDownload: vi.fn().mockResolvedValue({
      key: "documents/2026/a.pdf",
      contentType: "application/pdf",
      fileName: "a.pdf",
      sizeBytes: 5,
      inline: true,
    }),
  };
  const storage = { getObjectStream: vi.fn() };
  const config = { get: (key: string) => (key === "API_PUBLIC_URL" ? options.publicUrl : undefined) };
  return {
    controller: new FilesController(files as unknown as FilesService, storage as unknown as StorageService, config as never),
    files,
    storage,
  };
}

describe("FilesController delegation", () => {
  it("forwards the upload, registration and integrity calls", async () => {
    const { controller, files } = build();
    const presign = { fileName: "a.pdf", contentType: "application/pdf" } as never;
    const register = { storageKey: "documents/2026/a.pdf", sizeBytes: 5 } as never;

    await controller.presignUpload(PRINCIPAL as never, presign);
    await controller.register(PRINCIPAL as never, register);
    await controller.integrity(PRINCIPAL as never);
    await controller.purgeUnreferenced(PRINCIPAL as never, { dryRun: true } as never);
    await controller.verify(PRINCIPAL as never, "file-1");

    expect(files.presignUpload).toHaveBeenCalledWith(PRINCIPAL, presign);
    expect(files.register).toHaveBeenCalledWith(PRINCIPAL, register);
    expect(files.integrity).toHaveBeenCalledWith(PRINCIPAL);
    expect(files.purgeUnreferenced).toHaveBeenCalledWith(PRINCIPAL, { dryRun: true });
    expect(files.verify).toHaveBeenCalledWith(PRINCIPAL, "file-1");
  });

  it("parses the inline flag and builds the public base URL", async () => {
    const { controller, files } = build({ publicUrl: "https://edas.example/api" });

    await controller.download(PRINCIPAL as never, "file-1", "true", fakeRequest());
    await controller.download(PRINCIPAL as never, "file-1", "1", fakeRequest());
    await controller.download(PRINCIPAL as never, "file-1", "false", fakeRequest());
    await controller.download(PRINCIPAL as never, "file-1", undefined, fakeRequest("api.internal:4000"));

    expect(files.downloadUrl).toHaveBeenNthCalledWith(1, PRINCIPAL, "file-1", {
      inline: true,
      baseUrl: "https://edas.example/api",
    });
    expect(files.downloadUrl).toHaveBeenNthCalledWith(2, PRINCIPAL, "file-1", {
      inline: true,
      baseUrl: "https://edas.example/api",
    });
    expect(files.downloadUrl).toHaveBeenNthCalledWith(3, PRINCIPAL, "file-1", {
      inline: false,
      baseUrl: "https://edas.example/api",
    });
    expect(files.downloadUrl).toHaveBeenNthCalledWith(4, PRINCIPAL, "file-1", {
      inline: false,
      baseUrl: "https://edas.example/api",
    });

    const derived = build();
    await derived.controller.download(PRINCIPAL as never, "file-2", undefined, fakeRequest("api.internal:4000"));
    expect(derived.files.downloadUrl).toHaveBeenCalledWith(PRINCIPAL, "file-2", {
      inline: false,
      baseUrl: "http://api.internal:4000",
    });
  });
});

describe("FilesController content streaming", () => {
  it("streams inline with a 206 range response", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("abc")]),
      contentLength: 3,
      contentRange: "bytes 1-3/5",
      contentType: "application/pdf",
    });
    const response = fakeResponse();

    await controller.content("file-1", "ticket-1", "bytes=1-3", response as unknown as Response);

    expect(storage.getObjectStream).toHaveBeenCalledWith("documents/2026/a.pdf", "bytes=1-3");
    expect(response.status).toHaveBeenCalledWith(206);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", "inline; filename*=UTF-8''a.pdf");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Range", "bytes 1-3/5");
    expect(response.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
  });

  it("answers 200 for the whole object and completes the pipe", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("hello")]),
      contentLength: 5,
      contentRange: null,
      contentType: "application/pdf",
    });
    const response = fakeResponse();
    const finished = new Promise<void>((resolve) => response.on("finish", () => resolve()));

    await controller.content("file-1", "ticket-1", undefined, response as unknown as Response);
    await finished;

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.chunks.join("")).toBe("hello");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Length", "5");
  });

  it("refuses a range beyond the object size", async () => {
    const { controller, storage } = build();
    const response = fakeResponse();

    await controller.content("file-1", "ticket-1", "bytes=99-", response as unknown as Response);

    expect(storage.getObjectStream).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(416);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Range", "bytes */5");
  });

  it("answers 502 when the body breaks mid-flight", async () => {
    const { controller, storage } = build();
    const body = new Readable({ read() {} });
    storage.getObjectStream.mockResolvedValue({ body, contentLength: 3, contentRange: null, contentType: "application/pdf" });
    const response = fakeResponse();

    await controller.content("file-1", "ticket-1", undefined, response as unknown as Response);
    body.emit("error", new Error("ECONNRESET"));

    expect(response.status).toHaveBeenCalledWith(502);
    body.destroy();
  });

  it("closes the response without a new status when the body breaks after the headers went out", async () => {
    const { controller, storage } = build();
    const body = new Readable({ read() {} });
    storage.getObjectStream.mockResolvedValue({ body, contentLength: 3, contentRange: null, contentType: "application/pdf" });
    const response = fakeResponse();
    response.headersSent = true;
    const end = vi.spyOn(response, "end");

    await controller.content("file-1", "ticket-1", undefined, response as unknown as Response);
    body.emit("error", new Error("ECONNRESET"));

    expect(response.status).not.toHaveBeenCalledWith(502);
    expect(end).toHaveBeenCalled();
    body.destroy();
  });

  it("answers 416 when storage itself refuses the byte range", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockRejectedValue(Object.assign(new Error("range"), { $metadata: { httpStatusCode: 416 } }));
    const response = fakeResponse();

    await controller.content("file-1", "ticket-1", "bytes=1-3", response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(416);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Range", "bytes */5");
  });

  it("marks a download-only ticket as an attachment", async () => {
    const { controller, files, storage } = build();
    files.openTicketDownload.mockResolvedValue({
      key: "documents/2026/a.pdf",
      contentType: "application/pdf",
      fileName: "a.pdf",
      sizeBytes: 5,
      inline: false,
    });
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("hello")]),
      contentLength: 5,
      contentRange: null,
      contentType: "application/pdf",
    });
    const response = fakeResponse();
    const finished = new Promise<void>((resolve) => response.on("finish", () => resolve()));

    await controller.content("file-1", "ticket-1", undefined, response as unknown as Response);
    await finished;

    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", "attachment; filename*=UTF-8''a.pdf");
  });
});

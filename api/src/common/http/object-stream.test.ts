import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { StorageService } from "../storage/storage.service";
import { applyStreamHeaders, openObjectStream, parseByteRange, sendUnsatisfiable } from "./object-stream";

const TARGET = {
  key: "documents/2026/a.pdf",
  contentType: "application/pdf",
  fileName: "تقرير نهائي.pdf",
  sizeBytes: 100,
};

describe("parseByteRange", () => {
  it("ignores a missing or foreign range header", () => {
    expect(parseByteRange(undefined, 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
  });

  it("ignores a header without both bounds", () => {
    expect(parseByteRange("bytes=-", 100)).toBeNull();
  });

  it("refuses any range on an empty object", () => {
    expect(parseByteRange("bytes=0-1", 0)).toBe("unsatisfiable");
  });

  it("serves the tail for a suffix range", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("refuses a zero suffix, a non-numeric header and an unsafe suffix", () => {
    expect(parseByteRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-abc", 100)).toBeNull();
    expect(parseByteRange("bytes=-99999999999999999999", 100)).toBe("unsatisfiable");
  });

  it("serves an open-ended and a closed range", () => {
    expect(parseByteRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseByteRange("bytes=10-20", 100)).toEqual({ start: 10, end: 20 });
  });

  it("clamps a closing bound past the end of the object", () => {
    expect(parseByteRange("bytes=10-500", 100)).toEqual({ start: 10, end: 99 });
  });

  it("refuses a start beyond the object, a non-numeric start and an inverted range", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=99999999999999999999-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=10-abc", 100)).toBeNull();
    expect(parseByteRange("bytes=20-10", 100)).toBe("unsatisfiable");
  });
});

describe("openObjectStream", () => {
  it("asks storage for the whole object when no range was requested", async () => {
    const storage = { getObjectStream: vi.fn().mockResolvedValue("stream") } as unknown as StorageService;

    await expect(openObjectStream(storage, TARGET, null)).resolves.toBe("stream");
    expect(storage.getObjectStream).toHaveBeenCalledWith(TARGET.key, undefined);
  });

  it("asks storage for the requested range", async () => {
    const storage = { getObjectStream: vi.fn().mockResolvedValue("stream") } as unknown as StorageService;

    await expect(openObjectStream(storage, TARGET, { start: 10, end: 20 })).resolves.toBe("stream");
    expect(storage.getObjectStream).toHaveBeenCalledWith(TARGET.key, "bytes=10-20");
  });

  it("returns null when storage reports an unsatisfiable range", async () => {
    const storage = {
      getObjectStream: vi.fn().mockRejectedValue(Object.assign(new Error("range"), { $metadata: { httpStatusCode: 416 } })),
    } as unknown as StorageService;

    await expect(openObjectStream(storage, TARGET, { start: 10, end: 20 })).resolves.toBeNull();
  });

  it("rethrows any other storage failure", async () => {
    const storage = {
      getObjectStream: vi.fn().mockRejectedValue(Object.assign(new Error("access denied"), { $metadata: { httpStatusCode: 403 } })),
    } as unknown as StorageService;

    await expect(openObjectStream(storage, TARGET, null)).rejects.toThrow("access denied");
    await expect(
      openObjectStream({ getObjectStream: vi.fn().mockRejectedValue("offline") } as unknown as StorageService, TARGET, null),
    ).rejects.toBe("offline");
  });
});

describe("stream responses", () => {
  function fakeResponse() {
    const response = { setHeader: vi.fn(), status: vi.fn(), end: vi.fn() };
    response.status.mockReturnValue(response);
    return response as unknown as Response;
  }

  it("sets inline and attachment headers with an encoded file name", () => {
    const response = fakeResponse();

    applyStreamHeaders(response, TARGET, "attachment");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent("تقرير نهائي.pdf")}`,
    );
    expect(response.setHeader).toHaveBeenCalledWith("Accept-Ranges", "bytes");
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("answers 416 with the total size", () => {
    const response = fakeResponse();

    sendUnsatisfiable(response, 4096);

    expect(response.status).toHaveBeenCalledWith(416);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Range", "bytes */4096");
    expect(response.end).toHaveBeenCalled();
  });
});

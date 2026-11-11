import type { Response } from "express";
import type { StorageService } from "../storage/storage.service";

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

export interface ByteRange {
  start: number;
  end: number;
}

export interface StreamTarget {
  key: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
}

export function parseByteRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (size <= 0) return "unsatisfiable";

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start >= size) return "unsatisfiable";
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (!Number.isSafeInteger(end) || end < start) return "unsatisfiable";
  return { start, end };
}

function isRangeNotSatisfiable(error: unknown): boolean {
  return (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode === 416;
}

/** Returns null when storage rejects the range as unsatisfiable, so the caller can answer 416. */
export async function openObjectStream(storage: StorageService, target: StreamTarget, range: ByteRange | null) {
  try {
    return await storage.getObjectStream(target.key, range ? `bytes=${range.start}-${range.end}` : undefined);
  } catch (error) {
    if (isRangeNotSatisfiable(error)) return null;
    throw error;
  }
}

export function applyStreamHeaders(response: Response, target: StreamTarget, disposition: "inline" | "attachment"): void {
  response.setHeader("Content-Type", target.contentType);
  response.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(target.fileName)}`);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Referrer-Policy", "no-referrer");
}

export function sendUnsatisfiable(response: Response, sizeBytes: number): void {
  response.status(416);
  response.setHeader("Content-Range", `bytes */${sizeBytes}`);
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end();
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface StoredObjectInfo {
  sizeBytes: number;
  mimeType?: string;
}

export interface StoredObjectEntry {
  key: string;
  sizeBytes: number;
  lastModified?: Date;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly presignExpires: number;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>("MINIO_ENDPOINT", "localhost");
    const port = config.get<string>("MINIO_PORT", "9000");
    const useSsl = config.get<string>("MINIO_USE_SSL", "false") === "true";
    this.bucket = config.get<string>("MINIO_BUCKET", "edas-documents");
    this.presignExpires = Number(config.get("MINIO_PRESIGN_EXPIRES", 900));

    const credentials = {
      accessKeyId: config.get<string>("MINIO_ACCESS_KEY", ""),
      secretAccessKey: config.get<string>("MINIO_SECRET_KEY", ""),
    };
    const baseConfig = {
      region: config.get<string>("MINIO_REGION", "us-east-1"),
      forcePathStyle: true as const,
      credentials,
    };
    this.client = new S3Client({ ...baseConfig, endpoint: `${useSsl ? "https" : "http"}://${endpoint}:${port}` });

    const publicEndpoint = config.get<string>("MINIO_PUBLIC_ENDPOINT", "");
    if (publicEndpoint) {
      const publicPort = config.get<string>("MINIO_PUBLIC_PORT", port);
      const publicUseSsl = config.get<string>("MINIO_PUBLIC_USE_SSL", String(useSsl)) === "true";
      this.presignClient = new S3Client({
        ...baseConfig,
        endpoint: `${publicUseSsl ? "https" : "http"}://${publicEndpoint}:${publicPort}`,
      });
    } else {
      this.presignClient = this.client;
    }
  }

  get bucketName(): string {
    return this.bucket;
  }

  get presignExpiresSeconds(): number {
    return this.presignExpires;
  }

  async presignUpload(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.presignClient, command, { expiresIn: this.presignExpires });
  }

  async presignDownload(key: string, fileName?: string, disposition: "attachment" | "inline" = "attachment"): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: fileName ? `${disposition}; filename="${encodeURIComponent(fileName)}"` : undefined,
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: this.presignExpires });
  }

  /** Streams an object for a protected preview response, optionally honouring a single Range header. */
  async getObjectStream(
    key: string,
    range?: string,
  ): Promise<{ body: Readable; contentLength: number; contentRange: string | null; contentType: string }> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range ? { Range: range } : {}) }),
    );
    if (!result.Body) throw new Error(`Object ${key} has no body`);
    return {
      body: result.Body as Readable,
      contentLength: result.ContentLength ?? 0,
      contentRange: result.ContentRange ?? null,
      contentType: result.ContentType ?? "application/octet-stream",
    };
  }

  async put(key: string, body: string | Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, mimeType: result.ContentType };
    } catch (error) {
      this.logger.warn(`head(${key}) failed: ${(error as Error).message}`);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Reads a whole object for checksum verification. Returns null when the object is absent or unreadable,
   * and null as soon as the stream exceeds `maxBytes` so a hostile or corrupt object cannot exhaust memory.
   */
  async get(key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) return null;
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of result.Body as Readable) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        length += buffer.length;
        if (length > maxBytes) {
          this.logger.warn(`get(${key}) exceeded ${maxBytes} bytes; aborted`);
          return null;
        }
        chunks.push(buffer);
      }
      return Buffer.concat(chunks, length);
    } catch (error) {
      this.logger.warn(`get(${key}) failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Streams the object once and returns its SHA-256, so callers never trust a client-declared fingerprint.
   * Aborts (null) when the object is unreadable or larger than `maxBytes`.
   */
  async sha256(key: string, maxBytes: number): Promise<{ checksum: string; sizeBytes: number } | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) return null;
      const hash = createHash("sha256");
      let length = 0;
      for await (const chunk of result.Body as Readable) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        length += buffer.length;
        if (length > maxBytes) {
          this.logger.warn(`sha256(${key}) exceeded ${maxBytes} bytes; aborted`);
          return null;
        }
        hash.update(buffer);
      }
      return { checksum: hash.digest("hex"), sizeBytes: length };
    } catch (error) {
      this.logger.warn(`sha256(${key}) failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Reads only the first bytes of an object; used to verify the real content type without downloading it. */
  async readHead(key: string, bytes = 8192): Promise<Buffer | null> {
    const limit = Math.max(1, Math.floor(bytes));
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${limit - 1}` }),
      );
      if (!result.Body) return null;
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of result.Body as Readable) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        chunks.push(buffer);
        length += buffer.length;
        if (length >= limit) break;
      }
      return Buffer.concat(chunks, length).subarray(0, limit);
    } catch (error) {
      this.logger.warn(`readHead(${key}) failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Streams an object to a local file, aborting as soon as it exceeds `maxBytes`. */
  async downloadToFile(key: string, filePath: string, maxBytes: number): Promise<number> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`Object ${key} has no body`);
    let total = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        if (total > maxBytes) {
          callback(new Error(`Object ${key} exceeds the ${maxBytes} byte preview limit`));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(result.Body as Readable, limiter, createWriteStream(filePath));
    return total;
  }

  /** Every object key under `prefix`, capped at `limit` so an inventory run cannot lock the request thread. */
  async listKeys(prefix: string, limit = 5000): Promise<{ keys: string[]; truncated: boolean; error?: string }> {
    const listing = await this.listObjects(prefix, limit);
    return { keys: listing.objects.map((object) => object.key), truncated: listing.truncated, ...(listing.error ? { error: listing.error } : {}) };
  }

  /** Object metadata under `prefix`, used by preview-cache maintenance. */
  async listObjects(prefix: string, limit = 5000): Promise<{ objects: StoredObjectEntry[]; truncated: boolean; error?: string }> {
    const objects: StoredObjectEntry[] = [];
    let continuationToken: string | undefined;
    try {
      do {
        const result = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            MaxKeys: Math.min(1000, limit - objects.length),
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of result.Contents ?? []) {
          if (object.Key) {
            objects.push({ key: object.Key, sizeBytes: object.Size ?? 0, lastModified: object.LastModified });
          }
          if (objects.length >= limit) return { objects, truncated: true };
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`listObjects(${prefix}) failed: ${message}`);
      return { objects, truncated: false, error: message };
    }
    return { objects, truncated: false };
  }

  /** Removes every object under `prefix`; used to clean a file's cached previews. */
  async removePrefix(prefix: string, limit = 1000): Promise<{ removed: number; failed: number; truncated: boolean }> {
    const listing = await this.listKeys(prefix, limit);
    let removed = 0;
    let failed = 0;
    for (const key of listing.keys) {
      try {
        await this.remove(key);
        removed += 1;
      } catch (error) {
        this.logger.warn(`removePrefix(${key}) failed: ${(error as Error).message}`);
        failed += 1;
      }
    }
    return { removed, failed, truncated: listing.truncated };
  }
}

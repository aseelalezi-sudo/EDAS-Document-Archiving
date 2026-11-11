import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const MIN_SECRET_LENGTH = 32;

/**
 * Seals server-side session material (OIDC tokens, the pending-login cookie) with AES-256-GCM so the
 * database only ever holds ciphertext. The key derives from SESSION_SECRET; without it a per-process
 * random key is used, which keeps development working but invalidates sessions on restart.
 */
@Injectable()
export class SessionCryptoService {
  private static warned = false;
  private readonly logger = new Logger(SessionCryptoService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = String(config.get<string>("SESSION_SECRET") ?? "").trim();
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    if (secret) {
      this.key = createHash("sha256").update(secret).digest();
      return;
    }
    this.key = randomBytes(32);
    if (!SessionCryptoService.warned) {
      SessionCryptoService.warned = true;
      this.logger.warn("SESSION_SECRET is not set; sessions are ephemeral and other API instances cannot read them");
    }
  }

  seal(payload: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  open<T>(token: string | null | undefined): T | null {
    if (!token) return null;
    try {
      const raw = Buffer.from(token, "base64url");
      if (raw.length <= 28) return null;
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }
}

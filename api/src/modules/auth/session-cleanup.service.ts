import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { SessionService } from "./session.service";

const DEFAULT_INTERVAL_MS = 3_600_000;

@Injectable()
export class SessionCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly sessions: SessionService) {}

  onApplicationBootstrap() {
    const configured = Number(process.env.SESSION_CLEANUP_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.sessions.purgeExpired();
      if (count > 0) this.logger.log(`Purged ${count} expired session(s)`);
    } catch (error) {
      this.logger.error(`Session cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

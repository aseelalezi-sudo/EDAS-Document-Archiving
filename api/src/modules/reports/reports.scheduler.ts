import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ReportsService } from "./reports.service";

const DEFAULT_INTERVAL_MS = 60_000;

@Injectable()
export class ReportsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportsScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly reports: ReportsService) {}

  onApplicationBootstrap() {
    const configured = Number(process.env.REPORT_SCHEDULER_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.reports.runDueSchedules();
      if (count > 0) this.logger.log(`Executed ${count} scheduled report(s)`);
    } catch (error) {
      this.logger.error(`Scheduled report run failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

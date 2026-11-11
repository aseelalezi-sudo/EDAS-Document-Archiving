import { Module } from "@nestjs/common";
import { DownloadModule } from "../../common/download/download.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsController } from "./reports.controller";
import { ReportsScheduler } from "./reports.scheduler";
import { ReportsService } from "./reports.service";

@Module({
  imports: [DownloadModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsScheduler],
  exports: [ReportsService],
})
export class ReportsModule {}

import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ApprovalChainsController } from "./approval-chains.controller";
import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";

@Module({
  imports: [NotificationsModule],
  controllers: [ApprovalChainsController, ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}

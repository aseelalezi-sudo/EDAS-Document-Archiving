import { Module } from "@nestjs/common";
import { DownloadTicketService } from "./download-ticket.service";

@Module({
  providers: [DownloadTicketService],
  exports: [DownloadTicketService],
})
export class DownloadModule {}

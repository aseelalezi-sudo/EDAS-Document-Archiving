import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { PreviewController } from "./preview.controller";
import { PreviewConverterService } from "./preview-converter.service";
import { PreviewQueueService } from "./preview-queue.service";
import { PreviewService } from "./preview.service";

@Module({
  imports: [FilesModule],
  controllers: [PreviewController],
  providers: [PreviewService, PreviewConverterService, PreviewQueueService],
  exports: [PreviewService],
})
export class PreviewModule {}

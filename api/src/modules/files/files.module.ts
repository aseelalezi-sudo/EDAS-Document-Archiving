import { Module } from "@nestjs/common";
import { DownloadModule } from "../../common/download/download.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [DownloadModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

import { Body, Controller, Get, Headers, Logger, Param, Post, Query, Res } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { applyStreamHeaders, openObjectStream, parseByteRange, sendUnsatisfiable } from "../../common/http/object-stream";
import { StorageService } from "../../common/storage/storage.service";
import { PreviewCacheCleanupDto } from "./dto/preview-cache-cleanup.dto";
import { PreviewService } from "./preview.service";

@Controller("preview")
export class PreviewController {
  private readonly logger = new Logger(PreviewController.name);

  constructor(
    private readonly preview: PreviewService,
    private readonly storage: StorageService,
  ) {}

  @Get("capabilities")
  capabilities() {
    return this.preview.capabilities();
  }

  @Get("files/:id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.preview.getPreview(principal, id);
  }

  @Post("files/:id/retry")
  retry(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.preview.retry(principal, id);
  }

  @Get("files/:id/content")
  async content(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Query("kind") kind: string | undefined,
    @Headers("range") rangeHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const target = await this.preview.resolveContent(principal, id, kind === "preview" ? "preview" : "original");
    const range = parseByteRange(rangeHeader, target.sizeBytes);
    if (range === "unsatisfiable") {
      sendUnsatisfiable(response, target.sizeBytes);
      return;
    }

    const object = await openObjectStream(this.storage, target, range);
    if (!object) {
      sendUnsatisfiable(response, target.sizeBytes);
      return;
    }

    response.status(object.contentRange ? 206 : 200);
    applyStreamHeaders(response, target, "inline");
    if (object.contentLength > 0) response.setHeader("Content-Length", String(object.contentLength));
    if (object.contentRange) response.setHeader("Content-Range", object.contentRange);

    object.body.on("error", (error: Error) => {
      this.logger.warn(`preview stream failed for ${id}: ${error.message}`);
      if (!response.headersSent) response.status(502);
      response.end();
    });
    response.on("close", () => object.body.destroy());
    object.body.pipe(response);
  }

  @Post("cache/cleanup")
  @Roles(UserRole.SYSTEM_ADMIN)
  cleanup(@CurrentUser() principal: Principal, @Body() dto: PreviewCacheCleanupDto) {
    return this.preview.cleanupCache(principal, dto?.olderThanDays);
  }
}
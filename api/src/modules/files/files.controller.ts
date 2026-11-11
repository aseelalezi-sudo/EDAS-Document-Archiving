import { Body, Controller, Get, Headers, Logger, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Public } from "../../common/auth/public.decorator";
import { Roles } from "../../common/auth/roles.decorator";
import { applyStreamHeaders, openObjectStream, parseByteRange, sendUnsatisfiable } from "../../common/http/object-stream";
import { publicOrigin } from "../../common/http/public-origin";
import { StorageService } from "../../common/storage/storage.service";
import { PresignUploadDto } from "./dto/presign-upload.dto";
import { PurgeUnreferencedDto } from "./dto/purge-unreferenced.dto";
import { RegisterFileDto } from "./dto/register-file.dto";
import { FilesService } from "./files.service";

@Controller("files")
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  @Post("presign-upload")
  presignUpload(@CurrentUser() principal: Principal, @Body() dto: PresignUploadDto) {
    return this.files.presignUpload(principal, dto);
  }

  @Post()
  register(@CurrentUser() principal: Principal, @Body() dto: RegisterFileDto) {
    return this.files.register(principal, dto);
  }

  @Get("integrity")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.AUDITOR)
  integrity(@CurrentUser() principal: Principal) {
    return this.files.integrity(principal);
  }

  @Post("integrity/purge")
  @Roles(UserRole.SYSTEM_ADMIN)
  purgeUnreferenced(@CurrentUser() principal: Principal, @Body() dto: PurgeUnreferencedDto) {
    return this.files.purgeUnreferenced(principal, dto);
  }

  @Post(":id/verify")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.AUDITOR)
  verify(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.files.verify(principal, id);
  }

  @Get(":id/download")
  download(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Query("inline") inline: string | undefined,
    @Req() request: Request,
  ) {
    return this.files.downloadUrl(principal, id, {
      inline: inline === "true" || inline === "1",
      baseUrl: publicOrigin(request, this.config),
    });
  }

  /** Streams the original through the API for a short-lived ticket; no MinIO URL or bearer header is needed. */
  @Get(":id/content")
  @Public()
  async content(
    @Param("id") id: string,
    @Query("ticket") ticket: string | undefined,
    @Headers("range") rangeHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const target = await this.files.openTicketDownload(id, ticket);
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
    applyStreamHeaders(response, target, target.inline ? "inline" : "attachment");
    if (object.contentLength > 0) response.setHeader("Content-Length", String(object.contentLength));
    if (object.contentRange) response.setHeader("Content-Range", object.contentRange);

    object.body.on("error", (error: Error) => {
      this.logger.warn(`download stream failed for ${id}: ${error.message}`);
      if (!response.headersSent) response.status(502);
      response.end();
    });
    response.on("close", () => object.body.destroy());
    object.body.pipe(response);
  }
}

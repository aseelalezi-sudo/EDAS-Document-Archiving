import { Body, Controller, Delete, Get, Headers, Logger, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
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
import { CreateReportScheduleDto } from "./dto/create-report-schedule.dto";
import { ListReportRunsQuery } from "./dto/list-report-runs.query";
import { RunReportDto } from "./dto/run-report.dto";
import { UpdateReportScheduleDto } from "./dto/update-report-schedule.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  @Get("summary")
  summary(@CurrentUser() principal: Principal) {
    return this.reports.summary(principal);
  }

  @Get("schedules")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST, UserRole.AUDITOR)
  listSchedules(@CurrentUser() principal: Principal) {
    return this.reports.listSchedules(principal);
  }

  @Post("schedules")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  createSchedule(@CurrentUser() principal: Principal, @Body() dto: CreateReportScheduleDto) {
    return this.reports.createSchedule(principal, dto);
  }

  @Patch("schedules/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  updateSchedule(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateReportScheduleDto) {
    return this.reports.updateSchedule(principal, id, dto);
  }

  @Delete("schedules/:id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  deleteSchedule(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.reports.deleteSchedule(principal, id);
  }

  @Post("schedules/:id/run")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  runSchedule(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.reports.runSchedule(principal, id);
  }

  @Get("runs")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST, UserRole.AUDITOR)
  listRuns(@CurrentUser() principal: Principal, @Query() query: ListReportRunsQuery) {
    return this.reports.listRuns(principal, query);
  }

  @Post("runs")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST, UserRole.AUDITOR)
  createRun(@CurrentUser() principal: Principal, @Body() dto: RunReportDto) {
    return this.reports.createRun(principal, dto);
  }

  @Get("runs/:id/download")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST, UserRole.AUDITOR)
  downloadRun(@CurrentUser() principal: Principal, @Param("id") id: string, @Req() request: Request) {
    return this.reports.downloadRun(principal, id, { baseUrl: publicOrigin(request, this.config) });
  }

  /** Streams a generated report for a short-lived ticket; the report scope is re-checked at delivery. */
  @Get("runs/:id/content")
  @Public()
  async content(
    @Param("id") id: string,
    @Query("ticket") ticket: string | undefined,
    @Headers("range") rangeHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const target = await this.reports.openTicketDownload(id, ticket);
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
    applyStreamHeaders(response, target, "attachment");
    if (object.contentLength > 0) response.setHeader("Content-Length", String(object.contentLength));
    if (object.contentRange) response.setHeader("Content-Range", object.contentRange);

    object.body.on("error", (error: Error) => {
      this.logger.warn(`report download stream failed for ${id}: ${error.message}`);
      if (!response.headersSent) response.status(502);
      response.end();
    });
    response.on("close", () => object.body.destroy());
    object.body.pipe(response);
  }
}

import { Controller, Get, Post, Query } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "./audit.service";
import { ListAuditQuery } from "./dto/list-audit.query";

@Controller("audit")
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("verify")
  @Roles(UserRole.AUDITOR, UserRole.SYSTEM_ADMIN)
  verify() {
    return this.audit.verifyChain();
  }

  @Post("verify/baseline")
  @Roles(UserRole.SYSTEM_ADMIN)
  async recordBaseline(@CurrentUser() principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { keycloakSub: principal.sub },
      select: { id: true, name: true },
    });
    return this.audit.recordBaseline({ id: user?.id ?? null, name: user?.name ?? principal.username });
  }

  @Get()
  @Roles(UserRole.AUDITOR, UserRole.SYSTEM_ADMIN)
  async list(@Query() query: ListAuditQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AuditEventWhereInput = {
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
      actorId: query.actorId,
      result: query.result,
      ts:
        query.from || query.to
          ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
          : undefined,
    };
    if (query.q) {
      where.OR = [
        { action: { contains: query.q, mode: "insensitive" } },
        { entityType: { contains: query.q, mode: "insensitive" } },
        { entityId: { contains: query.q, mode: "insensitive" } },
        { actorName: { contains: query.q, mode: "insensitive" } },
        { ip: { contains: query.q, mode: "insensitive" } },
        { correlationId: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        select: {
          id: true,
          seq: true,
          ts: true,
          action: true,
          entityType: true,
          entityId: true,
          actorId: true,
          actorName: true,
          departmentId: true,
          result: true,
          ip: true,
          userAgent: true,
          correlationId: true,
          detail: true,
          prevHash: true,
          hash: true,
          hashVersion: true,
        },
        orderBy: { seq: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    const items = rows.map((row) => ({ ...row, ts: row.ts.toISOString(), seq: Number(row.seq) }));

    const [resultCounts, entityTypes] = await Promise.all([
      this.prisma.auditEvent.groupBy({
        by: ["result"],
        where,
        orderBy: { result: "asc" },
        _count: { _all: true },
      }),
      this.prisma.auditEvent.groupBy({
        by: ["entityType"],
        where: { ...where, entityType: undefined },
        orderBy: { entityType: "asc" },
      }),
    ]);

    const counts = { success: 0, failure: 0 };
    for (const row of resultCounts) {
      if (row.result === "failure") counts.failure += row._count._all;
      else counts.success += row._count._all;
    }

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        success: counts.success,
        failure: counts.failure,
        entityTypes: entityTypes.map((row) => row.entityType),
      },
    };
  }
}

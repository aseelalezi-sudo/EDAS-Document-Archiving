import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UpdateSettingDto } from "./dto/update-setting.dto";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const items = await this.prisma.setting.findMany({ orderBy: { key: "asc" } });
    return { items, meta: { total: items.length } };
  }

  async get(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException("Setting not found");
    return setting;
  }

  async put(principal: Principal, key: string, dto: UpdateSettingDto) {
    const actor = await this.access.resolveActor(principal);
    const setting = await this.prisma.setting.upsert({
      where: { key },
      update: { value: dto.value as Prisma.InputJsonValue },
      create: { key, value: dto.value as Prisma.InputJsonValue },
    });

    await this.audit.record({
      action: "setting.update",
      entityType: "Setting",
      entityId: setting.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { key, value: dto.value as Prisma.InputJsonValue },
    });

    return setting;
  }
}

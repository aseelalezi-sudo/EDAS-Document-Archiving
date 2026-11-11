import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";

const GROUP_SELECT = {
  id: true,
  name: true,
  nameEn: true,
  desc: true,
  scope: true,
  type: true,
  createdAt: true,
  members: { select: { userId: true } },
} satisfies Prisma.GroupSelect;

function toDto(group: Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>) {
  return {
    id: group.id,
    name: group.name,
    nameEn: group.nameEn,
    desc: group.desc,
    scope: group.scope,
    type: group.type,
    memberIds: group.members.map((member) => member.userId),
    createdAt: group.createdAt,
  };
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const groups = await this.prisma.group.findMany({ orderBy: { createdAt: "asc" }, select: GROUP_SELECT });
    return { items: groups.map(toDto), meta: { total: groups.length } };
  }

  async create(principal: Principal, dto: CreateGroupDto) {
    const actor = await this.access.resolveActor(principal);
    const group = await this.prisma.group
      .create({
        data: {
          name: dto.name,
          nameEn: dto.nameEn,
          desc: dto.desc ?? "",
          scope: dto.scope ?? "",
          type: dto.type ?? "functional",
          members: dto.memberIds?.length
            ? { createMany: { data: dto.memberIds.map((userId) => ({ userId })), skipDuplicates: true } }
            : undefined,
        },
        select: GROUP_SELECT,
      })
      .catch(rethrowReferences);
    await this.record(actor.id, actor.departmentId, "group.create", group.id, { name: group.name, type: group.type });
    return toDto(group);
  }

  async update(principal: Principal, id: string, dto: UpdateGroupDto) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.prisma.group.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Group not found");

    await this.prisma
      .$transaction(async (tx) => {
        await tx.group.update({
          where: { id },
          data: { name: dto.name, nameEn: dto.nameEn, desc: dto.desc, scope: dto.scope, type: dto.type },
        });
        if (dto.memberIds) {
          await tx.groupMember.deleteMany({ where: { groupId: id } });
          if (dto.memberIds.length > 0) {
            await tx.groupMember.createMany({
              data: dto.memberIds.map((userId) => ({ groupId: id, userId })),
              skipDuplicates: true,
            });
          }
        }
      })
      .catch(rethrowReferences);

    const group = await this.prisma.group.findUniqueOrThrow({ where: { id }, select: GROUP_SELECT });
    await this.record(actor.id, actor.departmentId, "group.update", id, { ...dto });
    return toDto(group);
  }

  async remove(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.prisma.group.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw new NotFoundException("Group not found");
    await this.prisma.group.delete({ where: { id } });
    await this.record(actor.id, actor.departmentId, "group.delete", id, { name: existing.name });
    return { id, deleted: true };
  }

  private async record(actorId: string, departmentId: string | null, action: string, entityId: string, detail: Prisma.InputJsonObject) {
    await this.audit.record({ action, entityType: "Group", entityId, actorId: actorId || null, departmentId, detail });
  }
}

function rethrowReferences(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    throw new BadRequestException("A referenced member does not exist");
  }
  throw error;
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "../auth/session.service";
import type { CreateUserDto, ResetPasswordDto, UpdateSelfDto, UpdateUserDto } from "./dto/user.dto";
import type { UpdatePreferenceDto } from "./dto/preference.dto";
import type { ListUsersQuery } from "./dto/list-users.query";
import { KeycloakAdminService } from "./keycloak-admin.service";

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  nameEn: true,
  email: true,
  role: true,
  status: true,
  departmentId: true,
  sectionId: true,
  jobTitle: true,
  jobTitleEn: true,
  phone: true,
  failedAttempts: true,
  activeSessions: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly keycloak: KeycloakAdminService,
    private readonly browserSessions: SessionService,
  ) {}

  async list(principal: Principal, query: ListUsersQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = await this.scope(principal, query.departmentId);

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { username: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  async findOne(principal: Principal, id: string) {
    const where = await this.scope(principal);
    const user = await this.prisma.user.findFirst({ where: { ...where, id }, select: USER_SELECT });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async create(principal: Principal, dto: CreateUserDto) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
      select: { id: true },
    });
    if (existing) throw new ConflictException("A user with this username or email already exists");
    const [firstName, ...rest] = dto.name.trim().split(/\s+/);
    const keycloakSub = await this.keycloak.createUser({
      username: dto.username,
      email: dto.email,
      firstName,
      lastName: rest.join(" ") || firstName,
      password: dto.password,
      role: dto.role,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          keycloakSub,
          username: dto.username,
          name: dto.name,
          nameEn: dto.name,
          email: dto.email,
          role: dto.role,
          status: UserStatus.ACTIVE,
          departmentId: dto.departmentId ?? null,
          sectionId: dto.sectionId ?? null,
          jobTitle: dto.jobTitle,
          jobTitleEn: dto.jobTitle,
          phone: dto.phone,
        },
        select: USER_SELECT,
      });
      await this.record(actor.id, actor.departmentId, "user.create", user.id, { username: user.username, role: user.role });
      return user;
    } catch (error) {
      await this.keycloak.deleteUser(keycloakSub).catch(() => undefined);
      rethrowConflict(error);
    }
  }

  async update(principal: Principal, id: string, dto: UpdateUserDto) {
    const actor = await this.access.resolveActor(principal);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    if (user.id === actor.id && dto.role && dto.role !== user.role) {
      throw new BadRequestException("You cannot change your own role");
    }

    if (user.keycloakSub) {
      await this.keycloak.updateUser(user.keycloakSub, {
        username: dto.username,
        email: dto.email,
        firstName: dto.name?.split(/\s+/)[0],
        lastName: dto.name?.split(/\s+/).slice(1).join(" ") || undefined,
        enabled: dto.status ? dto.status === UserStatus.ACTIVE : undefined,
        requiredActions: buildRequiredActions(dto.requirePasswordChange, dto.requireTwoFactor),
      });
      if (dto.role && dto.role !== user.role) await this.keycloak.setRole(user.keycloakSub, dto.role);
    }

    const updated = await this.prisma.user
      .update({
        where: { id },
        data: {
          username: dto.username,
          name: dto.name,
          nameEn: dto.name ?? undefined,
          email: dto.email,
          role: dto.role,
          status: dto.status,
          departmentId: dto.departmentId,
          sectionId: dto.sectionId,
          jobTitle: dto.jobTitle,
          jobTitleEn: dto.jobTitle ?? undefined,
          phone: dto.phone,
          failedAttempts: dto.status === UserStatus.ACTIVE ? 0 : undefined,
        },
        select: USER_SELECT,
      })
      .catch(rethrowConflict);

    await this.record(actor.id, actor.departmentId, "user.update", id, { ...dto });
    return updated;
  }

  async updateSelf(principal: Principal, dto: UpdateSelfDto) {
    const actor = await this.access.resolveActor(principal);
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) throw new NotFoundException("User not found");

    if (user.keycloakSub) {
      const [firstName, ...rest] = (dto.name ?? "").trim().split(/\s+/);
      await this.keycloak.updateUser(user.keycloakSub, {
        email: dto.email,
        firstName: firstName || undefined,
        lastName: rest.join(" ") || undefined,
      });
    }

    const updated = await this.prisma.user
      .update({
        where: { id: user.id },
        data: {
          name: dto.name,
          nameEn: dto.nameEn,
          email: dto.email,
          jobTitle: dto.jobTitle,
          jobTitleEn: dto.jobTitleEn,
          phone: dto.phone,
        },
        select: USER_SELECT,
      })
      .catch(rethrowConflict);

    const changed: Record<string, string> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (typeof value === "string") changed[key] = value;
    }
    await this.record(actor.id, actor.departmentId, "user.update-self", user.id, changed);
    return updated;
  }

  async preferences(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const prefix = preferencePrefix(actor.id);
    const rows = await this.prisma.setting.findMany({ where: { key: { startsWith: prefix } } });
    const items: Record<string, unknown> = {};
    for (const row of rows) items[row.key.slice(prefix.length)] = row.value;
    return { items };
  }

  async putPreference(principal: Principal, key: string, dto: UpdatePreferenceDto) {
    const actor = await this.access.resolveActor(principal);
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
    if (!safeKey) throw new BadRequestException("Invalid preference key");
    const setting = await this.prisma.setting.upsert({
      where: { key: `${preferencePrefix(actor.id)}${safeKey}` },
      update: { value: dto.value as Prisma.InputJsonValue },
      create: { key: `${preferencePrefix(actor.id)}${safeKey}`, value: dto.value as Prisma.InputJsonValue },
    });
    await this.record(actor.id, actor.departmentId, "user.preference", actor.id, { key: safeKey });
    return { key: safeKey, value: setting.value };
  }

  async remove(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    if (id === actor.id) throw new BadRequestException("You cannot delete your own account");
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (user.keycloakSub) await this.keycloak.deleteUser(user.keycloakSub);
    await this.prisma.user.delete({ where: { id } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException("User still owns documents or records and cannot be deleted");
      }
      throw error;
    });
    await this.record(actor.id, actor.departmentId, "user.delete", id, { username: user.username });
    return { id, deleted: true };
  }

  async resetPassword(principal: Principal, id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    if (!user.keycloakSub) throw new BadRequestException("User is not linked to an identity provider");
    await this.keycloak.resetPassword(user.keycloakSub, dto.password);
    const actor = await this.access.resolveActor(principal);
    await this.record(actor.id, actor.departmentId, "user.reset-password", id, { username: user.username });
    return { id, updated: true };
  }

  async revokeSessions(principal: Principal, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    if (user.keycloakSub) await this.keycloak.logoutUser(user.keycloakSub);
    if (user.keycloakSub) await this.browserSessions.revokeForSub(user.keycloakSub);
    await this.prisma.user.update({ where: { id }, data: { activeSessions: 0 } });
    const actor = await this.access.resolveActor(principal);
    await this.record(actor.id, actor.departmentId, "user.revoke-sessions", id, { username: user.username });
    return { id, sessions: 0 };
  }

  async sessions(principal: Principal, id: string) {
    const where = await this.scope(principal);
    const user = await this.prisma.user.findFirst({ where: { ...where, id }, select: { id: true, keycloakSub: true } });
    if (!user) throw new NotFoundException("User not found");
    if (!user.keycloakSub) return { count: 0, sessions: [] };
    const raw = await this.keycloak.listSessions(user.keycloakSub).catch(() => []);
    const sessions = raw.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress ?? null,
      started: typeof session.start === "number" ? new Date(session.start).toISOString() : null,
      lastAccess: typeof session.lastAccess === "number" ? new Date(session.lastAccess).toISOString() : null,
      clients: Object.values(session.clients ?? {}),
    }));
    return { count: sessions.length, sessions };
  }

  private async record(actorId: string, departmentId: string | null, action: string, entityId: string, detail: Prisma.InputJsonObject) {
    await this.audit.record({ action, entityType: "User", entityId, actorId: actorId || null, departmentId, detail });
  }

  private async scope(principal: Principal, departmentId?: string): Promise<Prisma.UserWhereInput> {
    const globalReader = principal.roles.includes(UserRole.SYSTEM_ADMIN) || principal.roles.includes(UserRole.AUDITOR);
    if (globalReader) return departmentId ? { departmentId } : {};

    const actor = await this.prisma.user.findUnique({
      where: { keycloakSub: principal.sub },
      select: { departmentId: true },
    });
    if (!actor?.departmentId) throw new ForbiddenException("Account is not linked to a department");
    return { departmentId: actor.departmentId };
  }
}
function preferencePrefix(userId: string): string {
  return `user-pref.${userId}.`;
}
function rethrowConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException("A user with this username or email already exists");
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    throw new BadRequestException("Referenced department or section does not exist");
  }
  throw error;
}
function buildRequiredActions(requirePasswordChange?: boolean, requireTwoFactor?: boolean): string[] | undefined {
  const actions = [...(requirePasswordChange ? ["UPDATE_PASSWORD"] : []), ...(requireTwoFactor ? ["CONFIGURE_TOTP"] : [])];
  return actions.length > 0 ? actions : undefined;
}

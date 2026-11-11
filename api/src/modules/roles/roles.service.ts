import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AclAction, UserRole } from "@prisma/client";
import { ACL_ACTIONS, ROLE_CAPABILITIES, USER_ROLES, type RolePolicyDto, isUserRole } from "@edas/shared";
import type { Principal } from "../../common/auth/principal";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<{ items: RolePolicyDto[]; meta: { total: number } }> {
    const [policies, counts] = await Promise.all([
      this.prisma.rolePolicy.findMany(),
      this.prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    ]);
    const policyByRole = new Map(policies.map((policy) => [policy.role, policy]));
    const countByRole = new Map(counts.map((entry) => [entry.role, entry._count._all]));
    const items = USER_ROLES.map((role) => {
      const policy = policyByRole.get(role as UserRole);
      return {
        role,
        actions: policy ? policy.actions : [...ROLE_CAPABILITIES[role]],
        customized: Boolean(policy),
        userCount: countByRole.get(role as UserRole) ?? 0,
        updatedAt: policy?.updatedAt.toISOString() ?? null,
      } satisfies RolePolicyDto;
    });
    return { items, meta: { total: items.length } };
  }

  async update(principal: Principal, role: string, actions: AclAction[]): Promise<RolePolicyDto> {
    if (!isUserRole(role)) throw new NotFoundException("Unknown role");
    if (role === "SYSTEM_ADMIN") throw new BadRequestException("The system administrator capabilities are fixed");
    if (!actions.includes(AclAction.VIEW)) throw new BadRequestException("VIEW is required for every role");
    if (actions.some((action) => !ACL_ACTIONS.includes(action))) throw new BadRequestException("Unknown permission");

    const actor = await this.access.resolveActor(principal);
    const policy = await this.prisma.rolePolicy.upsert({
      where: { role: role as UserRole },
      create: { role: role as UserRole, actions, updatedById: actor.id || null },
      update: { actions, updatedById: actor.id || null },
    });
    await this.audit.record({
      action: "role.update",
      entityType: "RolePolicy",
      entityId: role,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { actions },
    });
    const users = await this.prisma.user.count({ where: { role: role as UserRole } });
    return {
      role,
      actions: policy.actions,
      customized: true,
      userCount: users,
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async reset(principal: Principal, role: string): Promise<RolePolicyDto> {
    if (!isUserRole(role)) throw new NotFoundException("Unknown role");
    const actor = await this.access.resolveActor(principal);
    await this.prisma.rolePolicy.deleteMany({ where: { role: role as UserRole } });
    await this.audit.record({
      action: "role.reset",
      entityType: "RolePolicy",
      entityId: role,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { actions: [...ROLE_CAPABILITIES[role]] },
    });
    const users = await this.prisma.user.count({ where: { role: role as UserRole } });
    return {
      role,
      actions: [...ROLE_CAPABILITIES[role]],
      customized: false,
      userCount: users,
      updatedAt: null,
    };
  }
}

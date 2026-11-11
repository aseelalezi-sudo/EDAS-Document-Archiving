import { ForbiddenException, Injectable } from "@nestjs/common";
import { AclAction, AclEffect, AclPrincipal, Prisma, UserRole } from "@prisma/client";
import { ROLE_CAPABILITIES, isGlobalRole } from "@edas/shared";
import type { UserRole as SharedRole } from "@edas/shared";
import type { Principal } from "../auth/principal";
import { PrismaService } from "../prisma/prisma.service";

export interface Actor {
  id: string;
  departmentId: string | null;
  role: UserRole;
}

export type DepartmentMatch = string | { in: string[] } | undefined;

export function departmentMatch(departmentId: string | null | undefined): DepartmentMatch {
  if (departmentId === undefined) return undefined;
  return departmentId ?? { in: [] };
}

export function documentDepartmentFilter(departmentId: string | null): Prisma.DocumentWhereInput {
  if (!departmentId) return { departmentId: { in: [] } };
  return { OR: [{ departmentId }, { departmentId: null, folder: { departmentId } }] };
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActor(principal: Principal): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakSub: principal.sub },
      select: { id: true, departmentId: true, role: true },
    });
    if (!user) throw new ForbiddenException("Account is not provisioned in EDAS");
    const actor = { id: user.id, departmentId: user.departmentId, role: user.role };
    if (!this.isGlobal(actor) && !actor.departmentId) {
      throw new ForbiddenException("Account is not assigned to a department");
    }
    return actor;
  }

  isGlobal(actor: Actor): boolean {
    return isGlobalRole(actor.role as unknown as SharedRole);
  }

  async assertDepartmentScope(
    actor: Actor,
    document: { departmentId: string | null; folderId?: string | null; ownerId?: string | null },
  ): Promise<void> {
    if (this.isGlobal(actor)) return;
    if (document.ownerId && document.ownerId === actor.id) return;
    const anchor = document.departmentId ?? (await this.folderDepartmentId(document.folderId ?? null));
    if (!actor.departmentId || anchor !== actor.departmentId) {
      throw new ForbiddenException("Out of department scope");
    }
  }

  private async folderDepartmentId(folderId: string | null): Promise<string | null> {
    if (!folderId) return null;
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId }, select: { departmentId: true } });
    return folder?.departmentId ?? null;
  }

  async assert(principal: Principal, action: AclAction, folderId?: string | null): Promise<Actor> {
    const actor = await this.resolveActor(principal);
    if (folderId) await this.assertFolderScope(actor, folderId);
    const permissions = await this.permissionsFor(actor, folderId);
    if (!permissions.has(action)) {
      throw new ForbiddenException(`Missing permission: ${action}`);
    }
    return actor;
  }

  private async assertFolderScope(actor: Actor, folderId: string): Promise<void> {
    if (this.isGlobal(actor)) return;
    const departmentId = await this.folderDepartmentId(folderId);
    if (departmentId && departmentId !== actor.departmentId) {
      throw new ForbiddenException("Out of department scope");
    }
  }

  async listScope(principal: Principal): Promise<{ actor: Actor; departmentId: string | null | undefined }> {
    const actor = await this.resolveActor(principal);
    if (this.isGlobal(actor)) return { actor, departmentId: undefined };
    return { actor, departmentId: actor.departmentId };
  }

  async permissionsFor(actor: Actor, folderId?: string | null): Promise<Set<AclAction>> {
    const policy = await this.prisma.rolePolicy.findUnique({ where: { role: actor.role }, select: { actions: true } });
    const roleCapabilities = policy?.actions ?? ((ROLE_CAPABILITIES[actor.role as unknown as SharedRole] ?? []) as readonly AclAction[]);
    const actions = new Set<AclAction>(roleCapabilities);
    if (!folderId) return actions;

    const chain = await this.folderChain(folderId);
    const rules = await this.prisma.aclRule.findMany({ where: { folderId: { in: chain } } });
    const denied = new Set<AclAction>();
    for (const rule of rules) {
      const matches =
        (rule.principalType === AclPrincipal.USER && rule.principalId === actor.id) ||
        (rule.principalType === AclPrincipal.DEPARTMENT && rule.principalId === actor.departmentId) ||
        (rule.principalType === AclPrincipal.ROLE && rule.principalId.toUpperCase() === actor.role);
      if (!matches) continue;
      const target = rule.effect === AclEffect.DENY ? denied : actions;
      for (const action of rule.actions) target.add(action);
    }
    for (const action of denied) actions.delete(action);
    return actions;
  }

  private async folderChain(folderId: string): Promise<string[]> {
    const chain: string[] = [];
    let currentId: string | null = folderId;
    while (currentId && !chain.includes(currentId) && chain.length < 64) {
      const folder: { parentId: string | null; aclInherit: boolean } | null = await this.prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true, aclInherit: true },
      });
      if (!folder) break;
      chain.push(currentId);
      if (!folder.aclInherit) break;
      currentId = folder.parentId;
    }
    return chain;
  }
}

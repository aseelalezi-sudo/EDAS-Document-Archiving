import { ForbiddenException, Injectable } from "@nestjs/common";
import { AclAction, AclEffect, AclPrincipal, FolderScope, Prisma, UserRole } from "@prisma/client";
import { ROLE_CAPABILITIES, isGlobalRole } from "@edas/shared";
import type { UserRole as SharedRole } from "@edas/shared";
import type { Principal } from "../auth/principal";
import { PrismaService } from "../prisma/prisma.service";

export interface Actor {
  id: string;
  departmentId: string | null;
  sectionId?: string | null;
  role: UserRole;
}

export type DepartmentMatch = string | { in: string[] } | undefined;

interface FolderScopeRow {
  id: string;
  parentId: string | null;
  scope: FolderScope;
  departmentId: string | null;
  sectionId: string | null;
  ownerId: string | null;
  aclInherit: boolean;
}

const FOLDER_SCOPE_SELECT = {
  id: true,
  parentId: true,
  scope: true,
  departmentId: true,
  sectionId: true,
  ownerId: true,
  aclInherit: true,
} satisfies Prisma.FolderSelect;

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
      select: { id: true, departmentId: true, sectionId: true, role: true },
    });
    if (!user) throw new ForbiddenException("Account is not provisioned in EDAS");
    const actor = { id: user.id, departmentId: user.departmentId, sectionId: user.sectionId, role: user.role };
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
    const folder = document.folderId ? await this.folderScopeRow(document.folderId) : null;
    if (folder && !this.folderScopeAllows(actor, folder)) throw new ForbiddenException("Out of scope");
    if (folder && (folder.scope === FolderScope.PUBLIC || (folder.scope === FolderScope.PRIVATE && folder.ownerId === actor.id))) {
      return;
    }
    const anchor = document.departmentId ?? folder?.departmentId ?? null;
    if (!actor.departmentId || anchor !== actor.departmentId) {
      throw new ForbiddenException("Out of department scope");
    }
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
    const folder = await this.folderScopeRow(folderId);
    if (!folder) throw new ForbiddenException("Folder not found");
    if (!this.folderScopeAllows(actor, folder)) throw new ForbiddenException("Out of scope");
  }

  async listScope(principal: Principal): Promise<{ actor: Actor; departmentId: string | null | undefined }> {
    const actor = await this.resolveActor(principal);
    if (this.isGlobal(actor)) return { actor, departmentId: undefined };
    return { actor, departmentId: actor.departmentId };
  }

  async permissionsFor(actor: Actor, folderId?: string | null): Promise<Set<AclAction>> {
    const actions = await this.capabilitiesFor(actor);
    if (!folderId) return actions;

    const folder = await this.folderScopeRow(folderId);
    if (!folder || !this.folderScopeAllows(actor, folder)) return new Set<AclAction>();

    return this.applyRestrictions(actor, actions, await this.folderChain(folderId));
  }

  async documentVisibilityFilter(actor: Actor): Promise<Prisma.DocumentWhereInput | undefined> {
    if (this.isGlobal(actor)) return undefined;
    const folderIds = await this.visibleFolderIds(actor);
    return {
      OR: [
        { folderId: { in: folderIds ?? [] } },
        { folderId: null, departmentId: actor.departmentId ?? "" },
      ],
    };
  }

  async visibleFolderIds(actor: Actor): Promise<string[] | null> {
    if (this.isGlobal(actor)) return null;
    const folders = await this.prisma.folder.findMany({ select: FOLDER_SCOPE_SELECT });
    if (folders.length === 0) return [];
    const rules = await this.prisma.aclRule.findMany({
      where: { folderId: { in: folders.map((folder) => folder.id) } },
      select: { folderId: true, principalType: true, principalId: true, actions: true, effect: true },
    });
    const byFolder = new Map<string, typeof rules>();
    for (const rule of rules) byFolder.set(rule.folderId, [...(byFolder.get(rule.folderId) ?? []), rule]);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const actions = await this.capabilitiesFor(actor);
    if (!actions.has(AclAction.VIEW)) return [];

    const visible: string[] = [];
    for (const folder of folders) {
      if (!this.folderScopeAllows(actor, folder)) continue;
      const chain = this.folderChainFrom(folder, byId);
      const effective = this.applyRules(actor, new Set(actions), chain, byFolder);
      if (effective.has(AclAction.VIEW)) visible.push(folder.id);
    }
    return visible;
  }

  private async capabilitiesFor(actor: Actor): Promise<Set<AclAction>> {
    const policy = await this.prisma.rolePolicy.findUnique({ where: { role: actor.role }, select: { actions: true } });
    const capabilities =
      policy?.actions ?? ((ROLE_CAPABILITIES[actor.role as unknown as SharedRole] ?? []) as readonly AclAction[]);
    return new Set<AclAction>(capabilities);
  }

  private async applyRestrictions(actor: Actor, actions: Set<AclAction>, chain: string[]): Promise<Set<AclAction>> {
    const rules = await this.prisma.aclRule.findMany({ where: { folderId: { in: chain } } });
    return this.filterRules(actor, actions, rules);
  }

  private filterRules(
    actor: Actor,
    actions: Set<AclAction>,
    rules: Array<{ principalType: AclPrincipal; principalId: string; actions: AclAction[]; effect: AclEffect }>,
  ): Set<AclAction> {
    const denied = new Set<AclAction>();
    for (const rule of rules) {
      if (!this.ruleMatches(actor, rule)) continue;
      if (rule.effect === AclEffect.DENY) {
        for (const action of rule.actions) denied.add(action);
      }
    }
    for (const action of denied) actions.delete(action);
    return actions;
  }

  private applyRules(
    actor: Actor,
    actions: Set<AclAction>,
    chain: string[],
    byFolder: Map<
      string,
      Array<{ folderId: string; principalType: AclPrincipal; principalId: string; actions: AclAction[]; effect: AclEffect }>
    >,
  ): Set<AclAction> {
    const rules = chain.flatMap((folderId) => byFolder.get(folderId) ?? []);
    return this.filterRules(actor, actions, rules);
  }

  private ruleMatches(
    actor: Actor,
    rule: { principalType: AclPrincipal; principalId: string },
  ): boolean {
    return (
      (rule.principalType === AclPrincipal.USER && rule.principalId === actor.id) ||
      (rule.principalType === AclPrincipal.DEPARTMENT && rule.principalId === actor.departmentId) ||
      (rule.principalType === AclPrincipal.ROLE && rule.principalId.toUpperCase() === actor.role)
    );
  }

  private folderScopeAllows(actor: Actor, folder: Pick<FolderScopeRow, "scope" | "departmentId" | "sectionId" | "ownerId">): boolean {
    if (this.isGlobal(actor)) return true;
    if (folder.scope === FolderScope.PUBLIC) return true;
    if (folder.scope === FolderScope.PRIVATE) {
      if (folder.ownerId) return folder.ownerId === actor.id;
      return this.departmentAllows(actor, folder.departmentId);
    }
    if (folder.scope === FolderScope.SECTION) {
      if (folder.sectionId) return Boolean(actor.sectionId) && folder.sectionId === actor.sectionId;
      return this.departmentAllows(actor, folder.departmentId);
    }
    return this.departmentAllows(actor, folder.departmentId);
  }

  private departmentAllows(actor: Actor, departmentId: string | null): boolean {
    return !departmentId || departmentId === actor.departmentId;
  }

  private async folderScopeRow(folderId: string): Promise<FolderScopeRow | null> {
    return this.prisma.folder.findUnique({ where: { id: folderId }, select: FOLDER_SCOPE_SELECT });
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

  private folderChainFrom(folder: FolderScopeRow, byId: Map<string, FolderScopeRow>): string[] {
    const chain: string[] = [];
    let current: FolderScopeRow | undefined = folder;
    while (current && !chain.includes(current.id) && chain.length < 64) {
      chain.push(current.id);
      if (!current.aclInherit) break;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  }
}

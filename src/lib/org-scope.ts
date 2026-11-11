import type { Department, Employee, Project, Section } from "../types";
import type { Role } from "../store";
import { roleToApi } from "./role-bridge";

/** `null` means "no department limit" (system administrator); a Set lists the departments the actor may administer. */
export type OrgScope = Set<string> | null;

/** Mirrors the `@Roles(SYSTEM_ADMIN, DEPT_MANAGER)` guard on every `/org` write endpoint. */
export function canWriteOrg(role: Role): boolean {
  const apiRole = roleToApi(role);
  return apiRole === "SYSTEM_ADMIN" || apiRole === "DEPT_MANAGER";
}

/** Mirrors `OrgService#managedDepartmentIds`: a manager owns their department plus every department below it. */
export function orgScope(role: Role, ownDepartmentId: string | null | undefined, departments: Department[]): OrgScope {
  const apiRole = roleToApi(role);
  if (apiRole === "SYSTEM_ADMIN") return null;
  const managed = new Set<string>();
  if (apiRole !== "DEPT_MANAGER" || !ownDepartmentId) return managed;

  const childrenOf = new Map<string, string[]>();
  for (const department of departments) {
    if (!department.parentId) continue;
    childrenOf.set(department.parentId, [...(childrenOf.get(department.parentId) ?? []), department.id]);
  }
  const queue: string[] = [ownDepartmentId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (managed.has(current)) continue;
    managed.add(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return managed;
}

/** Mirrors `OrgService#owns`: rows without a department belong to no manager. */
export function canManage(scope: OrgScope, departmentId: string | null | undefined): boolean {
  if (!scope) return true;
  return Boolean(departmentId) && scope.has(departmentId as string);
}

/** Mirrors `OrgService#employeeDepartment`: a section membership implies the section's department. */
export function employeeDepartmentId(employee: Employee, sections: Section[]): string | null {
  if (employee.deptId) return employee.deptId;
  return sections.find((section) => section.id === employee.sectionId)?.deptId ?? null;
}

export function projectDepartmentId(project: Project): string | null {
  return project.departments[0] ?? null;
}

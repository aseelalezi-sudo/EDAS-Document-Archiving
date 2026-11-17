import type { Role } from "../store";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CheckSquare,
  Clock,
  FileChartColumn,
  Files,
  FolderTree,
  Gavel,
  GitBranch,
  LayoutDashboard,
  Lock,
  Network,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserCircle,
  Users,
} from "lucide-react";
export interface NavItem {
  to: string;
  key: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: boolean;
}
export interface NavGroup {
  key: string;
  items: NavItem[];
}

export const PENDING_TASK_STATUSES = ["assigned", "sent", "overdue", "reassigned"];

export function pendingTaskCount(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => PENDING_TASK_STATUSES.includes(task.status)).length;
}

export const NAV: NavGroup[] = [
  {
    key: "nav.group.main",
    items: [
      { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard, end: true },
      { to: "/dashboard/department", key: "nav.dashboardDept", icon: Network },
    ],
  },
  {
    key: "nav.group.documents",
    items: [
      { to: "/library", key: "nav.library", icon: FolderTree },
      { to: "/documents", key: "nav.documents", icon: Files },
      { to: "/search", key: "nav.search", icon: Search },
      { to: "/search/advanced", key: "nav.advancedSearch", icon: SlidersHorizontal },
      { to: "/search/saved", key: "nav.savedSearches", icon: ScrollText },
    ],
  },
  {
    key: "nav.group.workflow",
    items: [
      { to: "/workflow/my-tasks", key: "nav.myTasks", icon: CheckSquare, badge: true } as NavItem,
      { to: "/workflow/chains", key: "nav.approvalChains", icon: Network },
    ],
  },
  {
    key: "nav.group.governance",
    items: [
      { to: "/policies", key: "nav.policies", icon: ShieldCheck },
      { to: "/policies/retention-queue", key: "nav.retentionQueue", icon: Clock },
      { to: "/policies/legal-holds", key: "nav.legalHolds", icon: Gavel },
    ],
  },
  {
    key: "nav.group.org",
    items: [
      { to: "/org/departments", key: "nav.departments", icon: Building2 },
      { to: "/org/sections", key: "nav.sections", icon: GitBranch },
      { to: "/org/employees", key: "nav.employees", icon: Users },
      { to: "/org/projects", key: "nav.projects", icon: Boxes },
    ],
  },
  {
    key: "nav.group.reports",
    items: [
      { to: "/reports", key: "nav.reportsHome", icon: BarChart3 },
      { to: "/reports/builder", key: "nav.reportBuilder", icon: FileChartColumn },
      { to: "/reports/audit-trail", key: "nav.auditTrail", icon: ScrollText },
      { to: "/reports/errors", key: "nav.errors", icon: AlertTriangle },
      { to: "/reports/scheduled", key: "nav.scheduled", icon: Clock },
    ],
  },
  {
    key: "nav.group.admin",
    items: [
      { to: "/admin/users", key: "nav.users", icon: Users },
      { to: "/admin/roles", key: "nav.roles", icon: ShieldCheck },
      { to: "/admin/groups", key: "nav.groups", icon: Boxes },
      { to: "/admin/security", key: "nav.security", icon: Lock },
      { to: "/admin/system", key: "nav.system", icon: Settings },
      { to: "/admin/maintenance", key: "nav.maintenance", icon: Server },
      { to: "/admin/notifications", key: "nav.notifications", icon: Bell },
      { to: "/admin/permissions", key: "nav.permissions", icon: Lock },
    ],
  },
  {
    key: "nav.group.settings",
    items: [
      { to: "/settings/profile", key: "nav.profile", icon: UserCircle },
      { to: "/settings/notifications", key: "nav.notifPrefs", icon: Bell },
      { to: "/settings/department-defaults", key: "nav.deptDefaults", icon: Building2 },
      { to: "/settings/display", key: "nav.display", icon: Sun },
      { to: "/trash", key: "nav.trash", icon: Trash2 },
    ],
  },
];

export const ROLE_ACCESS: Record<Role, string[]> = {
  employee: [
    "/dashboard",
    "/library",
    "/documents",
    "/search",
    "/search/advanced",
    "/search/saved",
    "/workflow/my-tasks",
    "/reports",
    "/settings/profile",
    "/settings/notifications",
    "/settings/display",
    "/trash",
  ],
  supervisor: [
    "/dashboard",
    "/dashboard/department",
    "/library",
    "/documents",
    "/search",
    "/search/advanced",
    "/search/saved",
    "/workflow/my-tasks",
    "/reports",
    "/settings/profile",
    "/settings/notifications",
    "/settings/display",
    "/trash",
  ],
  dept_manager: [
    "/dashboard",
    "/dashboard/department",
    "/library",
    "/documents",
    "/search",
    "/search/advanced",
    "/search/saved",
    "/workflow/my-tasks",
    "/workflow/chains",
    "/org/departments",
    "/org/sections",
    "/org/employees",
    "/org/projects",
    "/policies/legal-holds",
    "/reports",
    "/settings/profile",
    "/settings/notifications",
    "/settings/department-defaults",
    "/settings/display",
    "/trash",
  ],
  archivist: [
    "/dashboard",
    "/dashboard/department",
    "/library",
    "/documents",
    "/search",
    "/search/advanced",
    "/search/saved",
    "/workflow/my-tasks",
    "/workflow/chains",
    "/policies",
    "/policies/retention-queue",
    "/policies/legal-holds",
    "/org/departments",
    "/org/sections",
    "/org/employees",
    "/org/projects",
    "/reports",
    "/reports/builder",
    "/settings/profile",
    "/settings/notifications",
    "/settings/department-defaults",
    "/settings/display",
    "/trash",
  ],
  system_admin: NAV.flatMap((g) => g.items.map((i) => i.to)),
  auditor: ["/dashboard", "/search", "/reports", "/reports/audit-trail", "/reports/errors", "/settings/profile", "/settings/display"],
};

const WORKFLOW_DETAIL = /^\/workflow\/(?!chains$)[^/]+$/;

const ROLE_DENY: Partial<Record<Role, string[]>> = {
  employee: ["/dashboard/department", "/reports/audit-trail", "/reports/builder", "/reports/scheduled"],
  supervisor: ["/reports/audit-trail", "/reports/builder", "/reports/scheduled"],
  dept_manager: ["/reports/audit-trail"],
  archivist: ["/reports/audit-trail"],
  auditor: ["/dashboard/department", "/reports/scheduled"],
  system_admin: [],
};

export function hasAccess(role: Role, to: string) {
  const denied = ROLE_DENY[role] ?? [];
  if (denied.some((p) => to === p || to.startsWith(p + "/"))) return false;
  if (ROLE_ACCESS[role].some((p) => to === p || to.startsWith(p + "/"))) return true;
  return WORKFLOW_DETAIL.test(to) && ROLE_ACCESS[role].includes("/workflow/my-tasks");
}

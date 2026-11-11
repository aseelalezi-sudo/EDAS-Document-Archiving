import { HashRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { AppProvider, useApp } from "./store";
import { DocsProvider } from "./store-docs";
import { Layout } from "./components/Layout";
import { hasAccess } from "./components/nav-config";
import { NoAccessState } from "./components/ui";
import { hasSeenOnboarding } from "./lib/onboarding";

function lazyPage<T extends Record<string, unknown>, K extends keyof T & string>(loader: () => Promise<T>, name: K) {
  return lazy(() => loader().then((module) => ({ default: module[name] as unknown as ComponentType })));
}

const Login = lazyPage(() => import("./pages/auth"), "Login");
const PasswordReset = lazyPage(() => import("./pages/auth"), "PasswordReset");
const Onboarding = lazyPage(() => import("./pages/auth"), "Onboarding");
const AuthCallback = lazyPage(() => import("./pages/auth"), "AuthCallback");
const NotFound = lazyPage(() => import("./pages/not-found"), "NotFound");
const UserDashboard = lazyPage(() => import("./pages/dashboard"), "UserDashboard");
const DepartmentDashboard = lazyPage(() => import("./pages/dashboard"), "DepartmentDashboard");
const Library = lazyPage(() => import("./pages/documents"), "Library");
const FolderDetails = lazyPage(() => import("./pages/documents"), "FolderDetails");
const AllDocuments = lazyPage(() => import("./pages/documents"), "AllDocuments");
const NewDocument = lazyPage(() => import("./pages/documents"), "NewDocument");
const EditDocument = lazyPage(() => import("./pages/documents"), "EditDocument");
const DocumentDetails = lazyPage(() => import("./pages/documents"), "DocumentDetails");
const DocumentPreview = lazyPage(() => import("./pages/documents"), "DocumentPreview");
const Versions = lazyPage(() => import("./pages/documents"), "Versions");
const Trash = lazyPage(() => import("./pages/documents"), "Trash");
const SearchResults = lazyPage(() => import("./pages/search"), "SearchResults");
const AdvancedSearch = lazyPage(() => import("./pages/search"), "AdvancedSearch");
const SavedSearches = lazyPage(() => import("./pages/search"), "SavedSearches");
const MyTasks = lazyPage(() => import("./pages/workflow"), "MyTasks");
const ApprovalChains = lazyPage(() => import("./pages/workflow"), "ApprovalChains");
const WorkflowDetails = lazyPage(() => import("./pages/workflow"), "WorkflowDetails");
const Policies = lazyPage(() => import("./pages/policies"), "Policies");
const PolicyEditor = lazyPage(() => import("./pages/policies"), "PolicyEditor");
const RetentionQueue = lazyPage(() => import("./pages/policies"), "RetentionQueue");
const LegalHolds = lazyPage(() => import("./pages/policies"), "LegalHolds");
const Departments = lazyPage(() => import("./pages/organization"), "Departments");
const Sections = lazyPage(() => import("./pages/organization"), "Sections");
const Employees = lazyPage(() => import("./pages/organization"), "Employees");
const EmployeeProfile = lazyPage(() => import("./pages/organization"), "EmployeeProfile");
const Projects = lazyPage(() => import("./pages/organization"), "Projects");
const ProjectDetails = lazyPage(() => import("./pages/organization"), "ProjectDetails");
const ReportsHome = lazyPage(() => import("./pages/reports"), "ReportsHome");
const ReportDetail = lazyPage(() => import("./pages/reports"), "ReportDetail");
const ReportBuilder = lazyPage(() => import("./pages/reports"), "ReportBuilder");
const AuditTrail = lazyPage(() => import("./pages/reports"), "AuditTrail");
const Errors = lazyPage(() => import("./pages/reports"), "Errors");
const ScheduledReports = lazyPage(() => import("./pages/reports"), "ScheduledReports");
const Users = lazyPage(() => import("./pages/admin"), "Users");
const UserEditor = lazyPage(() => import("./pages/admin"), "UserEditor");
const Roles = lazyPage(() => import("./pages/admin"), "Roles");
const Groups = lazyPage(() => import("./pages/admin"), "Groups");
const Security = lazyPage(() => import("./pages/admin"), "Security");
const System = lazyPage(() => import("./pages/admin"), "System");
const Maintenance = lazyPage(() => import("./pages/admin"), "Maintenance");
const NotificationTemplates = lazyPage(() => import("./pages/admin"), "NotificationTemplates");
const Permissions = lazyPage(() => import("./pages/admin"), "Permissions");
const Profile = lazyPage(() => import("./pages/settings"), "Profile");
const NotifPrefs = lazyPage(() => import("./pages/settings"), "NotifPrefs");
const DepartmentDefaults = lazyPage(() => import("./pages/settings"), "DepartmentDefaults");
const Display = lazyPage(() => import("./pages/settings"), "Display");

function Spinner({ fullScreen = false }: { fullScreen?: boolean }) {
  const { t } = useApp();
  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center bg-ink-50 dark:bg-ink-950"
          : "flex min-h-64 items-start justify-center py-16"
      }
    >
      <span
        role="status"
        aria-label={t("g.loading")}
        className="h-8 w-8 animate-spin rounded-full border-2 border-navy-200 border-t-navy-600 dark:border-ink-800 dark:border-t-navy-400"
      />
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, role, t, authReady } = useApp();
  const loc = useLocation();
  if (!authReady) return <Spinner fullScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.isNew && !hasSeenOnboarding(user.id)) return <Navigate to="/onboarding" replace />;
  // Page-level role access control (spec §15): show a clear access-denied screen
  // rather than silently rendering modules the active role cannot access.
  const allowed = hasAccess(role, loc.pathname);
  return (
    <Layout>
      {allowed ? (
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      ) : (
        <div className="py-6">
          <NoAccessState title={t("role.noAccess")} description={t("role.noAccessSub")} />
        </div>
      )}
    </Layout>
  );
}

function AppRoutes() {
  const { user } = useApp();
  return (
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/password/reset" element={<PasswordReset />} />
        <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/login" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route
          element={
            <Protected>
              <Outlet />
            </Protected>
          }
        >
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/dashboard/department" element={<DepartmentDashboard />} />

          <Route path="/library" element={<Library />} />
          <Route path="/library/folders/:id" element={<FolderDetails />} />

          <Route path="/documents" element={<AllDocuments />} />
          <Route path="/documents/new" element={<NewDocument />} />
          <Route path="/documents/:id/edit" element={<EditDocument />} />
          <Route path="/documents/:id" element={<DocumentDetails />} />
          <Route path="/documents/:id/preview" element={<DocumentPreview />} />
          <Route path="/documents/:id/versions" element={<Versions />} />

          <Route path="/search" element={<SearchResults />} />
          <Route path="/search/advanced" element={<AdvancedSearch />} />
          <Route path="/search/saved" element={<SavedSearches />} />

          <Route path="/workflow/my-tasks" element={<MyTasks />} />
          <Route path="/workflow/chains" element={<ApprovalChains />} />
          <Route path="/workflow/:id" element={<WorkflowDetails />} />

          <Route path="/policies" element={<Policies />} />
          <Route path="/policies/retention-queue" element={<RetentionQueue />} />
          <Route path="/policies/legal-holds" element={<LegalHolds />} />
          <Route path="/policies/:id" element={<PolicyEditor />} />

          <Route path="/org/departments" element={<Departments />} />
          <Route path="/org/sections" element={<Sections />} />
          <Route path="/org/employees" element={<Employees />} />
          <Route path="/org/employees/:id" element={<EmployeeProfile />} />
          <Route path="/org/projects" element={<Projects />} />
          <Route path="/org/projects/:id" element={<ProjectDetails />} />

          <Route path="/reports" element={<ReportsHome />} />
          <Route path="/reports/builder" element={<ReportBuilder />} />
          <Route path="/reports/audit-trail" element={<AuditTrail />} />
          <Route path="/reports/errors" element={<Errors />} />
          <Route path="/reports/scheduled" element={<ScheduledReports />} />
          <Route path="/reports/:id" element={<ReportDetail />} />

          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/users/:id" element={<UserEditor />} />
          <Route path="/admin/roles" element={<Roles />} />
          <Route path="/admin/groups" element={<Groups />} />
          <Route path="/admin/security" element={<Security />} />
          <Route path="/admin/system" element={<System />} />
          <Route path="/admin/maintenance" element={<Maintenance />} />
          <Route path="/admin/notifications" element={<NotificationTemplates />} />
          <Route path="/admin/permissions" element={<Permissions />} />

          <Route path="/settings/profile" element={<Profile />} />
          <Route path="/settings/notifications" element={<NotifPrefs />} />
          <Route path="/settings/department-defaults" element={<DepartmentDefaults />} />
          <Route path="/settings/display" element={<Display />} />

          <Route path="/trash" element={<Trash />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppProvider>
      <DocsProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </DocsProvider>
    </AppProvider>
  );
}

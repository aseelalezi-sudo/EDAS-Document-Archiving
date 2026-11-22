import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AclRuleDto, ApprovalInstanceDto, DestructionCertificateDto, DocumentDto, ReportSummaryDto } from "@edas/shared";
import {
  CATEGORIES,
  documents,
  folders,
  tasks,
  retentionItems,
  defaultACLs,
  legalHolds as seedHolds,
  errors as seedErrors,
  notifications as seedNotifications,
  users as seedUsers,
  employees as seedEmployees,
  policies as seedPolicies,
  projects as seedProjects,
  departments as seedDepts,
  sections as seedSections,
  reportTemplates as seedTemplates,
  registerDepartments,
} from "./data";
import { useApp } from "./store";
import { config } from "./config";
import { docsApi, type DocumentUpdateBody } from "./lib/docs-api";
import { ApiError, serverReason } from "./lib/api-client";
import { openDownload } from "./lib/download";
import { domainApi } from "./lib/domain-api";
import { logError } from "./lib/log-error";
import { PAGE_SIZE, loadAllPages, loadDocumentWindows } from "./lib/pagination";
import { settleResult, settledOutcome } from "./lib/settled";
import {
  dateOnly,
  fileTypeFromMime,
  formatBytes,
  mapAclRules,
  mapAuditEvent,
  mapDepartment,
  mapDocument,
  mapEmployee,
  mapFolder,
  mapHold,
  mapNotification,
  mapProject,
  mapRetentionItem,
  mapSection,
  mapTask,
  mapTrashItem,
  mapUser,
  toAclPayload,
  withFolderCounts,
} from "./lib/api-mappers";
import { useDemoPersistentState } from "./utils/persist";
import { uid } from "./utils/id";
import {
  SHARED_FOLDERS,
  canAccess,
  effectiveRules,
  folderChildrenIds,
  hasOwnRules as hasOwnRulesPure,
  inheritedRules,
} from "./lib/permissions";
import type {
  ACLRule,
  AuditEntry,
  Classification,
  Department,
  DocUser,
  Document,
  Employee,
  ErrorItem,
  ErrorNote,
  FolderNode,
  LegalHold,
  Notification,
  PermAction,
  Policy,
  Project,
  ReportTemplate,
  RetentionItem,
  Section,
  TaskItem,
} from "./types";

function keepCachedVersions(next: Document, cached?: Document): Document {
  if (next.versions.length === 0 && cached && cached.versions.length > 0) return { ...next, versions: cached.versions };
  return next;
}

export interface TrashItem {
  doc: Document;
  deletedBy: string;
  deletedAt: string;
  purgeAt: string;
  original: string;
}

export interface CreateDocumentInput {
  title: string;
  titleEn?: string;
  description?: string;
  categoryId?: string;
  classification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET";
  folderId?: string;
  departmentId?: string;
  sectionId?: string;
  tags?: string[];
  file: File;
  comment?: string;
}

/* Generic entity state used by admin/org CRUD */
export interface EntityStore<T> {
  items: T[];
  add: (item: Omit<T, "id"> & { id?: string }) => T;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
  set: React.Dispatch<React.SetStateAction<T[]>>;
}

function useEntityStore<T extends { id: string }>(key: string, seed: T[]) {
  const [items, setItems] = useDemoPersistentState<T[]>(key, seed);
  const add = (item: Omit<T, "id"> & { id?: string }) => {
    const created = { ...item, id: item.id ?? uid("x") } as T;
    setItems((prev) => [created, ...prev]);
    return created;
  };
  const update = (id: string, patch: Partial<T>) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));
  return { items, add, update, remove, set: setItems };
}

interface DocsState {
  docs: Document[];
  tasks: TaskItem[];
  folders: FolderNode[];
  retention: RetentionItem[];
  trash: TrashItem[];
  acls: Record<string, ACLRule[]>;
  aclFailedFolders: string[];
  retryFolderAcl: (folderId: string) => Promise<boolean>;
  auditLog: AuditEntry[];
  docsMeta: { loaded: number; total: number };
  docsLoadingMore: boolean;
  loadMoreDocuments: () => Promise<void>;
  docsReady: boolean;
  notifications: Notification[];
  markNotificationRead: (id: string, onResult?: (ok: boolean) => void) => void;
  markAllNotificationsRead: (onResult?: (ok: boolean) => void) => void;
  summary: ReportSummaryDto | null;
  /* entity stores */
  users: EntityStore<DocUser>;
  employees: EntityStore<Employee>;
  policies: EntityStore<Policy>;
  projects: EntityStore<Project>;
  departments: EntityStore<Department>;
  sections: EntityStore<Section>;
  templates: ReportTemplate[];
  refreshOrgDirectory: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  /* settings */
  systemSettings: Record<string, string>;
  setSystemSetting: (key: string, value: string) => void;
  applySystemSettings: (values: Record<string, string>) => void;
  /* docs ops */
  createDocument: (input: CreateDocumentInput) => Promise<string | null>;
  updateDocument: (id: string, patch: DocumentUpdateBody) => Promise<boolean>;
  downloadDocument: (docId: string, versionId?: string) => Promise<void>;
  loadDocument: (id: string) => Promise<void>;
  archiveDocs: (ids: string[], onResult?: (ok: boolean, done: number) => void) => void;
  moveDocs: (ids: string[], targetFolderId: string, onResult?: (ok: boolean) => void) => void;
  checkOut: (id: string, userName: string, onResult?: (ok: boolean) => void) => void;
  checkIn: (id: string, onResult?: (ok: boolean) => void) => void;
  deleteDocs: (ids: string[], onResult?: (ok: boolean, done: number) => void) => void;
  restoreDocs: (ids: string[]) => Promise<boolean>;
  purgeDocs: (ids: string[]) => Promise<boolean>;
  trashSnapshot: () => Promise<string[]>;
  emptyTrash: (snapshot?: string[]) => Promise<boolean>;
  removeTask: (id: string) => Promise<boolean>;
  rejectTask: (id: string, comment: string) => Promise<boolean>;
  addFolder: (folder: FolderNode) => Promise<boolean>;
  renameFolder: (id: string, patch: { name: string; nameEn?: string; type?: FolderNode["type"]; accessScope?: string }) => Promise<boolean>;
  deleteFolder: (id: string) => Promise<boolean>;
  removeRetention: (id: string, payload?: { dueAt?: string; action?: "REVIEW" | "ARCHIVE" | "DESTROY" }) => Promise<boolean>;
  retentionCertificate: (id: string) => Promise<DestructionCertificateDto | null>;
  scheduleRetention: (docId: string, policyId: string) => Promise<boolean>;
  /* acl */
  addACLRule: (folderId: string, rule: Omit<ACLRule, "id">) => void;
  removeACLRule: (folderId: string, ruleId: string) => void;
  toggleRulePermission: (folderId: string, ruleId: string, perm: PermAction) => void;
  toggleRuleEffect: (folderId: string, ruleId: string) => void;
  /* lifecycle */
  requestSignature: (id: string) => Promise<boolean>;
  signDocument: (id: string, userName: string) => Promise<boolean>;
  declareRecord: (id: string) => Promise<boolean>;
  holds: EntityStore<LegalHold>;
  errors: EntityStore<ErrorItem>;
  setErrorStatus: (id: string, status: ErrorItem["status"]) => void;
  assignError: (id: string, owner: string) => void;
  addErrorNote: (id: string, note: ErrorNote) => void;
  clearErrors: () => void;
  addHold: (h: {
    ref: string;
    reason: string;
    caseRef: string;
    placedBy: string;
    placedAt: string;
    items: number;
    documentIds?: string[];
  }) => Promise<boolean>;
  releaseHold: (id: string) => Promise<boolean>;
  restoreVersion: (docId: string, version: string) => Promise<boolean>;
  saveDraft: (docId: string) => void;
  sendForApproval: (docId: string) => Promise<boolean>;
  uploadNewVersion: (docId: string, userName: string, file?: File) => Promise<boolean>;
  reassignTask: (taskId: string, toUser: string) => Promise<boolean>;
  requestChanges: (taskId: string, comment: string) => Promise<boolean>;
  pendingApprovals: ApprovalInstanceDto[];
  approvalsReady: boolean;
  decideApproval: (id: string, decision: "APPROVED" | "REJECTED", comment?: string) => Promise<boolean>;
  refetchApprovals: () => Promise<void>;
  logAction: (action: string, entityType: string, entityId: string, moduleName: string) => void;
  can: (action: PermAction, folderId: string, docDeptId?: string) => boolean;
  scopedDocs: Document[];
  visibleFolders: FolderNode[];
  getInheritedRules: (folderId: string) => { rule: ACLRule; fromFolderId: string; fromFolderName: string }[];
  getEffectiveRules: (folderId: string) => ACLRule[];
  getChildrenIds: (folderId: string) => string[];
  propagateRule: (folderId: string, rule: Omit<ACLRule, "id">) => number;
  hasOwnRules: (folderId: string) => boolean;
}

const Ctx = createContext<DocsState | null>(null);

const seedTrash: TrashItem[] = documents.slice(0, 6).map((d, i) => ({
  doc: d,
  deletedBy: ["أحمد البلوي", "سعد المالكي"][i % 2],
  deletedAt: "2026-01-15",
  purgeAt: "2026-02-14",
  original: "الإدارة المالية",
}));

export function DocsProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  return <DocumentStore key={config.useApi ? (user?.id ?? "signed-out") : "demo"}>{children}</DocumentStore>;
}

function DocumentStore({ children }: { children: ReactNode }) {
  const { user, role, lang, toast, t } = useApp();
  const apiMode = config.useApi;
  const userId = user?.id;
  const notifyRef = useRef<(key: string) => void>(() => {});
  notifyRef.current = (key: string) => toast({ type: "error", title: t(key) });
  const detailCacheRef = useRef<Map<string, Document>>(new Map());
  const errorRef = useRef<(error: unknown) => void>(() => {});
  const reportApiError = (error?: unknown) => {
    const reason = serverReason(error);
    if (reason) toast({ type: "error", title: t("err.api"), message: reason });
    else notifyRef.current("err.api");
    errorRef.current(error);
  };
  const [docs, setDocs] = useDemoPersistentState<Document[]>("docs", documents);
  const [taskList, setTaskList] = useDemoPersistentState<TaskItem[]>("tasks", tasks);
  const [folderList, setFolderList] = useDemoPersistentState<FolderNode[]>("folders", folders);
  const [retention, setRetention] = useDemoPersistentState<RetentionItem[]>("retention", retentionItems);
  const [trash, setTrash] = useDemoPersistentState<TrashItem[]>("trash", seedTrash);
  const [acls, setAcls] = useDemoPersistentState<Record<string, ACLRule[]>>("acls", defaultACLs);
  const [aclFailed, setAclFailed] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useDemoPersistentState<AuditEntry[]>("auditLog", []);
  const [docsMeta, setDocsMeta] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [docsLoadingMore, setDocsLoadingMore] = useState(false);
  const docsPagesRef = useRef(1);
  const docsCursorRef = useRef<string | null>(null);
  const docsLoadMoreRef = useRef(false);
  const [docsReady, setDocsReady] = useState(!apiMode);
  const [approvals, setApprovals] = useState<ApprovalInstanceDto[]>([]);
  const [approvalsReady, setApprovalsReady] = useState(!apiMode);
  const [notificationList, setNotificationList] = useDemoPersistentState<Notification[]>("notifications", apiMode ? [] : seedNotifications);
  const [templates, setTemplates] = useState<ReportTemplate[]>(seedTemplates);
  const [summary, setSummary] = useState<ReportSummaryDto | null>(null);
  const [systemSettings, setSystemSettings] = useDemoPersistentState<Record<string, string>>("systemSettings", {
    orgName: "هيئة المؤسسات الحكومية",
    orgNameEn: "Government Entities Authority",
    defaultLang: "ar",
    timezone: "Asia/Riyadh",
    maxFileSize: "50",
    draftDays: "30",
    numberingTemplate: "EDAS-{YEAR}{SEQ:6}",
    allowedTypes: "PDF, DOCX, XLSX, PPTX, PNG, JPG, DWG, TXT",
    retentionDefault: "5",
    idleTimeout: "30",
    maxSession: "8",
    concurrentSessions: "3",
    failedAttempts: "5",
    lockDuration: "30",
    minPassword: "12",
    passwordExpiry: "90",
  });

  /* entity stores */
  const usersStore = useEntityStore("usersStore", seedUsers);
  const employeesStore = useEntityStore("employeesStore", seedEmployees);
  const policiesStore = useEntityStore("policiesStore", seedPolicies);
  const projectsStore = useEntityStore("projectsStore", seedProjects);
  const departmentsStore = useEntityStore("departmentsStore", seedDepts);
  const sectionsStore = useEntityStore("sectionsStore", seedSections);
  const holdsStore = useEntityStore("holdsStore", seedHolds);
  const setHolds = holdsStore.set;
  const setUsersStore = usersStore.set;
  const setDepartmentsStore = departmentsStore.set;
  const setSectionsStore = sectionsStore.set;
  const setProjectsStore = projectsStore.set;
  const setEmployeesStore = employeesStore.set;
  const [apiUsers, setApiUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    registerDepartments(departmentsStore.items);
  }, [departmentsStore.items]);

  useEffect(() => {
    if (!apiMode || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.allSettled([
          docsApi.foldersTree(),
          loadDocumentWindows((after) => docsApi.listDocumentWindow(after, PAGE_SIZE), 1),
          loadAllPages((page) => docsApi.trashDocuments(page)),
          loadAllPages((page) => domainApi.retentionItems(page)),
          domainApi.holds(),
          domainApi.tasks().catch(() => null),
          domainApi.pendingApprovals().catch(() => null),
          domainApi.users().catch(() => null),
          domainApi.settings().catch(() => null),
          domainApi.auditEvents({ pageSize: 200 }).catch(() => null),
          domainApi.notifications().catch(() => null),
          domainApi.orgTree().catch(() => null),
          domainApi.orgProjects().catch(() => null),
          loadAllPages((page) => domainApi.orgEmployees(page)).catch(() => null),
          domainApi.reportSummary().catch(() => null),
          domainApi.reportTemplates().catch(() => null),
        ]);
        const tree = settleResult(results[0]);
        if (!tree) {
          if (!cancelled) notifyRef.current("err.api");
          return;
        }
        const emptyPage = { items: [] as never[], total: 0, truncated: true };
        const documentsPage = settleResult(results[1]) ?? { ...emptyPage, nextCursor: null };
        const trashPage = settleResult(results[2]) ?? emptyPage;
        const retentionPage = settleResult(results[3]) ?? emptyPage;
        const holdsPage = settleResult(results[4]) ?? { items: [] as never[] };
        const taskPage = settleResult(results[5]);
        const approvalPage = settleResult(results[6]);
        const usersPage = settleResult(results[7]);
        const settingsPage = settleResult(results[8]);
        const auditPage = settleResult(results[9]);
        const notificationPage = settleResult(results[10]);
        const orgTreePage = settleResult(results[11]);
        const projectPage = settleResult(results[12]);
        const employeePage = settleResult(results[13]);
        const summaryPage = settleResult(results[14]);
        const templatesPage = settleResult(results[15]);

        const remoteDocs = documentsPage.items.map(mapDocument);
        const aclRules = await docsApi.folderAcls().catch(() => null);
        if (cancelled) return;
        setDocs((prev) =>
          remoteDocs.map((doc) => keepCachedVersions(doc, detailCacheRef.current.get(doc.id) ?? prev.find((d) => d.id === doc.id))),
        );
        docsCursorRef.current = documentsPage.nextCursor;
        setDocsMeta({ loaded: remoteDocs.length, total: documentsPage.total });
        docsPagesRef.current = 1;
        setFolderList(withFolderCounts(tree.items.map(mapFolder), remoteDocs));
        setTrash(trashPage.items.map(mapTrashItem));
        if (aclRules) {
          const grouped = new Map<string, AclRuleDto[]>();
          for (const rule of aclRules) grouped.set(rule.folderId, [...(grouped.get(rule.folderId) ?? []), rule]);
          setAclFailed([]);
          setAcls(Object.fromEntries(tree.items.map((folder) => [folder.id, mapAclRules(grouped.get(folder.id) ?? [])])));
        } else {
          setAclFailed(tree.items.map((folder) => folder.id));
        }
        const activeHoldDocs = new Set(
          holdsPage.items.filter((hold) => hold.status === "ACTIVE").flatMap((hold) => hold.documents.map((doc) => doc.id)),
        );
        setRetention(retentionPage.items.map((item) => ({ ...mapRetentionItem(item), onHold: activeHoldDocs.has(item.documentId) })));
        setHolds(holdsPage.items.map(mapHold));
        if (usersPage) setApiUsers(usersPage.items.map((user) => ({ id: user.id, name: user.name })));
        if (usersPage) setUsersStore(usersPage.items.map(mapUser));
        if (templatesPage) {
          setTemplates(
            templatesPage.items.map((template) => ({
              id: template.id,
              name: template.name,
              nameEn: template.nameEn,
              category: template.category,
              categoryEn: template.categoryEn,
              desc: template.desc,
              descEn: template.descEn,
              favorite: template.favorite,
              lastRun: template.lastRun ?? "",
              schedule: template.schedule,
              icon: template.icon,
            })),
          );
        }
        if (orgTreePage) {
          setDepartmentsStore(orgTreePage.items.map(mapDepartment));
          setSectionsStore(orgTreePage.items.flatMap((department) => department.sections).map(mapSection));
        }
        if (projectPage) setProjectsStore(projectPage.items.map(mapProject));
        if (employeePage) setEmployeesStore(employeePage.items.map(mapEmployee));
        if (taskPage) setTaskList(taskPage.items.map((task) => mapTask(task, remoteDocs, usersPage?.items ?? [])));
        if (approvalPage) setApprovals(approvalPage.items);
        if (auditPage) {
          const knownUsers = usersPage?.items.map((user) => ({ id: user.id, name: user.name })) ?? [];
          setAuditLog(auditPage.items.map((event) => mapAuditEvent(event, knownUsers)));
        }
        if (notificationPage) setNotificationList(notificationPage.items.map(mapNotification));
        if (summaryPage) setSummary(summaryPage);
        if (settingsPage) {
          const entries = settingsPage.items.flatMap((setting) => {
            const value = setting.value;
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
              return [[setting.key, String(value)] as const];
            }
            if (value && typeof value === "object") return [[setting.key, JSON.stringify(value)] as const];
            return [];
          });
          if (entries.length > 0) setSystemSettings((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
      } catch {
        if (!cancelled) notifyRef.current("err.api");
      } finally {
        if (!cancelled) {
          setDocsReady(true);
          setApprovalsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiMode,
    userId,
    setDocs,
    setFolderList,
    setTrash,
    setAcls,
    setRetention,
    setHolds,
    setTaskList,
    setNotificationList,
    setSystemSettings,
    setAuditLog,
    setUsersStore,
    setDepartmentsStore,
    setSectionsStore,
    setProjectsStore,
    setEmployeesStore,
  ]);

  const refreshOrgDirectory = async () => {
    if (!apiMode) return;
    const [orgTreePage, projectPage, employeePage] = await Promise.all([
      domainApi.orgTree(),
      domainApi.orgProjects(),
      loadAllPages((page) => domainApi.orgEmployees(page)),
    ]);
    setDepartmentsStore(orgTreePage.items.map(mapDepartment));
    setSectionsStore(orgTreePage.items.flatMap((department) => department.sections).map(mapSection));
    setProjectsStore(projectPage.items.map(mapProject));
    setEmployeesStore(employeePage.items.map(mapEmployee));
  };

  const refreshUsers = async () => {
    if (!apiMode) return;
    const page = await domainApi.users();
    setUsersStore(page.items.map(mapUser));
    setApiUsers(page.items.map((user) => ({ id: user.id, name: user.name })));
  };

  const addHold = async (h: {
    ref: string;
    reason: string;
    caseRef: string;
    placedBy: string;
    placedAt: string;
    items: number;
    documentIds?: string[];
  }): Promise<boolean> => {
    if (apiMode) {
      try {
        await domainApi.createHold({
          caseNo: h.caseRef !== "—" ? h.caseRef : h.ref,
          reason: h.reason,
          documentIds: h.documentIds,
        });
        await refetchRetention();
      } catch (error) {
        reportApiError(error);
        return false;
      }
    } else {
      holdsStore.add({ ...h, status: "active" });
    }
    logAction(
      lang === "en" ? `Place legal hold "${h.ref}" (${h.items} items)` : `وضع حجز قانوني «${h.ref}» (${h.items} عنصر)`,
      lang === "en" ? "Legal hold" : "حجز قانوني",
      h.ref,
      lang === "en" ? "Policies" : "السياسات",
    );
    return true;
  };

  const errorsStore = useEntityStore<ErrorItem>("errorsStore", apiMode ? [] : seedErrors);
  errorRef.current = (error: unknown) => {
    const known = error instanceof ApiError ? error : null;
    const path = typeof window === "undefined" ? "—" : window.location.pathname;
    const moduleName = path.split("/").filter(Boolean)[0] ?? "app";
    const severity: ErrorItem["severity"] = known
      ? known.status >= 500
        ? "critical"
        : known.status === 401 || known.status === 403
          ? "low"
          : "medium"
      : "medium";
    errorsStore.set((prev) =>
      [
        {
          id: uid("err"),
          datetime: new Date().toLocaleString(lang === "en" ? "en-GB" : "ar-SA"),
          severity,
          code: known?.code ?? "CLIENT_ERROR",
          module: moduleName,
          path,
          message: serverReason(error) ?? known?.message ?? (error instanceof Error ? error.message : "Request failed"),
          affectedUser: user?.name ?? "—",
          correlation: known?.correlationId ?? "—",
          status: "new" as const,
          owner: "—",
        },
        ...prev,
      ].slice(0, 50),
    );
  };
  const clearErrors = () => errorsStore.set([]);
  const setErrorStatus = (id: string, status: ErrorItem["status"]) => {
    errorsStore.update(id, { status });
    logAction(
      lang === "en" ? `Set error status to "${status}"` : `تغيير حالة الخطأ إلى «${status}»`,
      lang === "en" ? "Error" : "خطأ",
      id,
      lang === "en" ? "Error center" : "مركز الأخطاء",
    );
  };
  const assignError = (id: string, owner: string) => {
    errorsStore.update(id, { owner });
    logAction(
      lang === "en" ? `Assign error to "${owner}"` : `تعيين الخطأ إلى «${owner}»`,
      lang === "en" ? "Error" : "خطأ",
      id,
      lang === "en" ? "Error center" : "مركز الأخطاء",
    );
  };
  const addErrorNote = (id: string, note: ErrorNote) => {
    const item = errorsStore.items.find((entry) => entry.id === id);
    errorsStore.update(id, { notes: [...(item?.notes ?? []), note] });
    logAction(
      lang === "en" ? "Added a triage note to an error" : "إضافة ملاحظة متابعة إلى خطأ",
      lang === "en" ? "Error" : "خطأ",
      id,
      lang === "en" ? "Error center" : "مركز الأخطاء",
    );
  };

  const releaseHold = async (id: string): Promise<boolean> => {
    if (apiMode) {
      try {
        await domainApi.releaseHold(id);
        await refetchRetention();
      } catch (error) {
        reportApiError(error);
        return false;
      }
    } else {
      holdsStore.update(id, { status: "released" });
    }
    const h = holdsStore.items.find((x) => x.id === id);
    logAction(
      lang === "en" ? "Release legal hold" : "الإفراج عن حجز قانوني",
      lang === "en" ? "Legal hold" : "حجز قانوني",
      h?.ref ?? id,
      lang === "en" ? "Policies" : "السياسات",
    );
    return true;
  };

  const settingTimers = useRef<Record<string, number>>({});
  const setSystemSetting = (key: string, value: string) => {
    setSystemSettings((prev) => ({ ...prev, [key]: value }));
    if (!apiMode || key.startsWith("user")) return;
    if (settingTimers.current[key]) window.clearTimeout(settingTimers.current[key]);
    settingTimers.current[key] = window.setTimeout(() => {
      delete settingTimers.current[key];
      void domainApi.putSetting(key, value).catch(reportApiError);
    }, 600);
  };
  const applySystemSettings = (values: Record<string, string>) => {
    setSystemSettings((prev) => ({ ...prev, ...values }));
  };

  const markNotificationRead = (id: string, onResult?: (ok: boolean) => void) => {
    const wasRead = notificationList.find((item) => item.id === id)?.read ?? false;
    setNotificationList((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    if (apiMode) {
      domainApi
        .markNotificationRead(id)
        .then(() => onResult?.(true))
        .catch((error) => {
          setNotificationList((prev) => prev.map((item) => (item.id === id ? { ...item, read: wasRead } : item)));
          reportApiError(error);
          onResult?.(false);
        });
      return;
    }
    onResult?.(true);
  };

  const markAllNotificationsRead = (onResult?: (ok: boolean) => void) => {
    const previous = notificationList;
    setNotificationList((prev) => prev.map((item) => ({ ...item, read: true })));
    if (apiMode) {
      domainApi
        .markAllNotificationsRead()
        .then(() => onResult?.(true))
        .catch((error) => {
          setNotificationList(previous);
          reportApiError(error);
          onResult?.(false);
        });
      return;
    }
    onResult?.(true);
  };

  /* ---------- Live audit logging ---------- */
  const auditRefreshTimer = useRef<number | null>(null);
  const refreshAudit = async () => {
    if (!apiMode) return;
    const page = await domainApi.auditEvents({ pageSize: 200 });
    setAuditLog(page.items.map((event) => mapAuditEvent(event, apiUsers)));
  };
  const scheduleAuditRefresh = () => {
    if (!apiMode) return;
    if (auditRefreshTimer.current) window.clearTimeout(auditRefreshTimer.current);
    auditRefreshTimer.current = window.setTimeout(() => {
      auditRefreshTimer.current = null;
      void refreshAudit().catch((error) => logError("audit refresh", error));
    }, 1200);
  };
  const logAction = (action: string, entityType: string, entityId: string, moduleName: string) => {
    if (apiMode) {
      scheduleAuditRefresh();
      return;
    }
    setAuditLog((prev) => [
      {
        id: uid("aud"),
        datetime: new Date().toLocaleString(lang === "en" ? "en-GB" : "ar-SA"),
        user: user?.name ?? (lang === "en" ? "System" : "النظام"),
        module: moduleName,
        action,
        entityType,
        entityId,
        deptId: user?.department ?? "exec",
        ip: "—",
        result: "success",
        correlation: "",
        detail:
          lang === "en"
            ? "Recorded by the local offline demo — not written to the server audit trail."
            : "سُجّلت العملية في وضع العرض المحلي دون اتصال بالخادم — غير مدرجة في سجل تدقيق الخادم.",
      },
      ...prev,
    ]);
  };

  const applyServerDoc = (next: DocumentDto) => {
    const mapped = mapDocument(next);
    if (mapped.versions.length > 0) detailCacheRef.current.set(mapped.id, mapped);
    setDocs((prev) => prev.map((d) => (d.id === next.id ? keepCachedVersions(mapped, detailCacheRef.current.get(next.id) ?? d) : d)));
  };

  const rememberDetail = useCallback(
    (detail: Document) => {
      detailCacheRef.current.set(detail.id, detail);
      setDocs((prev) => (prev.some((d) => d.id === detail.id) ? prev.map((d) => (d.id === detail.id ? detail : d)) : [detail, ...prev]));
    },
    [setDocs],
  );

  const loadDocument = useCallback(
    async (id: string) => {
      if (!apiMode) return;
      try {
        rememberDetail(mapDocument(await docsApi.getDocument(id)));
      } catch {
        /* keep the list snapshot when the detail request fails */
      }
    },
    [apiMode, rememberDetail],
  );

  const refetchDocuments = async () => {
    const [documentsPage, trashPage] = await Promise.all([
      loadDocumentWindows((after) => docsApi.listDocumentWindow(after, PAGE_SIZE), docsPagesRef.current),
      loadAllPages((page) => docsApi.trashDocuments(page)),
    ]);
    const remoteDocs = documentsPage.items.map(mapDocument);
    setDocs((prev) =>
      remoteDocs.map((doc) => keepCachedVersions(doc, detailCacheRef.current.get(doc.id) ?? prev.find((d) => d.id === doc.id))),
    );
    docsCursorRef.current = documentsPage.nextCursor;
    setDocsMeta({ loaded: remoteDocs.length, total: documentsPage.total });
    setFolderList((prev) => withFolderCounts(prev, remoteDocs));
    setTrash(trashPage.items.map(mapTrashItem));
  };

  const loadMoreDocuments = async () => {
    const after = docsCursorRef.current;
    if (!apiMode || !after || docsLoadMoreRef.current) return;
    docsLoadMoreRef.current = true;
    setDocsLoadingMore(true);
    try {
      const result = await docsApi.listDocumentWindow(after, PAGE_SIZE);
      if (docsCursorRef.current !== after) return;
      const remoteDocs = result.items.map(mapDocument);
      setDocs((prev) => {
        const known = new Set(prev.map((doc) => doc.id));
        const merged = [...prev];
        for (const doc of remoteDocs) {
          if (known.has(doc.id)) continue;
          known.add(doc.id);
          merged.push(keepCachedVersions(doc, detailCacheRef.current.get(doc.id)));
        }
        return merged;
      });
      docsPagesRef.current++;
      docsCursorRef.current = result.meta.nextCursor;
      setDocsMeta((prev) => {
        const loaded = prev.loaded + remoteDocs.length;
        const total = result.meta.nextCursor ? Math.max(prev.total, loaded + 1) : loaded;
        return { loaded, total };
      });
    } catch (error) {
      reportApiError(error);
    } finally {
      docsLoadMoreRef.current = false;
      setDocsLoadingMore(false);
    }
  };

  const refetchTasks = async () => {
    const [taskPage, documentsPage] = await Promise.all([
      domainApi.tasks(),
      loadDocumentWindows((after) => docsApi.listDocumentWindow(after, PAGE_SIZE), docsPagesRef.current),
    ]);
    const remoteDocs = documentsPage.items.map(mapDocument);
    setDocs((prev) =>
      remoteDocs.map((doc) => keepCachedVersions(doc, detailCacheRef.current.get(doc.id) ?? prev.find((d) => d.id === doc.id))),
    );
    docsCursorRef.current = documentsPage.nextCursor;
    setDocsMeta({ loaded: remoteDocs.length, total: documentsPage.total });
    setTaskList(taskPage.items.map((task) => mapTask(task, remoteDocs, apiUsers)));
  };

  const recoverDocuments = (error?: unknown) => {
    reportApiError(error);
    void refetchDocuments().catch((reason) => logError("document refetch", reason));
  };

  const recoverTasks = (error?: unknown) => {
    reportApiError(error);
    void refetchTasks().catch((reason) => logError("task refetch", reason));
  };

  const refetchApprovals = useCallback(async () => {
    if (!apiMode) return;
    const [approvalPage, documentsPage] = await Promise.all([
      domainApi.pendingApprovals(),
      loadDocumentWindows((after) => docsApi.listDocumentWindow(after, PAGE_SIZE), docsPagesRef.current),
    ]);
    setApprovals(approvalPage.items);
    const remoteDocs = documentsPage.items.map(mapDocument);
    setDocs((prev) =>
      remoteDocs.map((doc) => keepCachedVersions(doc, detailCacheRef.current.get(doc.id) ?? prev.find((d) => d.id === doc.id))),
    );
    docsCursorRef.current = documentsPage.nextCursor;
    setDocsMeta({ loaded: remoteDocs.length, total: documentsPage.total });
  }, [apiMode, setApprovals, setDocs]);

  const recoverApprovals = (error?: unknown) => {
    reportApiError(error);
    void refetchApprovals().catch((reason) => logError("approval refetch", reason));
  };

  const decideApproval = async (id: string, decision: "APPROVED" | "REJECTED", comment?: string): Promise<boolean> => {
    if (!apiMode) {
      setApprovals((prev) => prev.filter((item) => item.id !== id));
      return true;
    }
    try {
      await domainApi.decideApproval(id, { decision, comment });
      await refetchApprovals();
      return true;
    } catch (error) {
      recoverApprovals(error);
      return false;
    }
  };

  const recoverFolders = (error?: unknown) => {
    reportApiError(error);
    void docsApi
      .foldersTree()
      .then((tree) => setFolderList(withFolderCounts(tree.items.map(mapFolder), docs)))
      .catch((error) => logError("folder tree refresh", error));
  };

  const createDocument = async (input: CreateDocumentInput): Promise<string | null> => {
    if (apiMode) {
      try {
        const registered = await docsApi.uploadToStorage(input.file);
        const created = await docsApi.createDocument({
          title: input.title,
          titleEn: input.titleEn,
          description: input.description,
          category: input.categoryId,
          classification: input.classification,
          folderId: input.folderId,
          departmentId: input.departmentId,
          sectionId: input.sectionId,
          tags: input.tags,
          fileId: registered.id,
          comment: input.comment,
        });
        await refetchDocuments();
        logAction(
          lang === "en" ? `Create document "${created.title}"` : `إنشاء وثيقة «${created.title}»`,
          lang === "en" ? "Document" : "وثيقة",
          created.id,
          lang === "en" ? "Documents" : "الوثائق",
        );
        return created.id;
      } catch (error) {
        reportApiError(error);
        if (error instanceof ApiError && [400, 403, 409, 413].includes(error.status)) {
          toast({ type: "error", title: lang === "en" ? "Upload rejected" : "الرفع مرفوض", message: serverReason(error) ?? error.message });
        }
        return null;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const category = CATEGORIES.find((c) => c.id === input.categoryId);
    const classification: Classification =
      input.classification === "PUBLIC"
        ? "public"
        : input.classification === "CONFIDENTIAL"
          ? "confidential"
          : input.classification === "SECRET"
            ? "topsecret"
            : "internal";
    const size = formatBytes(input.file.size);
    const doc: Document = {
      id: uid("doc"),
      docNo: `EDAS-${new Date().getFullYear()}${String(docs.length + 1).padStart(3, "0")}`,
      title: input.title,
      titleEn: input.titleEn ?? input.title,
      category: category?.name ?? "عام",
      categoryEn: category?.nameEn ?? "General",
      categoryId: category?.id ?? "",
      deptId: user?.department ?? "",
      sectionId: user?.section ?? "",
      owner: user?.name ?? "",
      ownerEn: user?.nameEn ?? "",
      version: "1.0",
      classification,
      status: "draft",
      createdAt: today,
      modifiedAt: today,
      retentionEnd: "",
      size,
      fileType: fileTypeFromMime(input.file.type),
      folderId: input.folderId ?? "",
      tags: input.tags ?? [],
      description: input.description ?? "",
      descriptionEn: input.description ?? "",
      versions: [
        {
          v: "1.0",
          date: today,
          by: user?.name ?? "",
          size,
          fingerprint: "",
          comment: input.comment ?? "",
          current: true,
        },
      ],
      activity: [],
      retentionDays: 0,
    };
    setDocs((prev) => [doc, ...prev]);
    logAction(
      lang === "en" ? `Create document "${doc.title}"` : `إنشاء وثيقة «${doc.title}»`,
      lang === "en" ? "Document" : "وثيقة",
      doc.id,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return doc.id;
  };

  const updateDocument = async (id: string, patch: DocumentUpdateBody): Promise<boolean> => {
    if (apiMode) {
      try {
        const updated = await docsApi.updateDocument(id, patch);
        applyServerDoc(updated);
        logAction(
          lang === "en" ? `Update document "${updated.title}"` : `تعديل وثيقة «${updated.title}»`,
          lang === "en" ? "Document" : "وثيقة",
          id,
          lang === "en" ? "Documents" : "الوثائق",
        );
        return true;
      } catch {
        reportApiError();
        return false;
      }
    }
    const classification: Classification | undefined =
      patch.classification === "PUBLIC"
        ? "public"
        : patch.classification === "INTERNAL"
          ? "internal"
          : patch.classification === "CONFIDENTIAL"
            ? "confidential"
            : patch.classification === "SECRET"
              ? "topsecret"
              : undefined;
    const category = patch.category ? CATEGORIES.find((c) => c.id === patch.category) : undefined;
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              title: patch.title ?? d.title,
              titleEn: patch.titleEn ?? d.titleEn,
              description: patch.description ?? d.description,
              descriptionEn: patch.description ?? d.descriptionEn,
              category: category?.name ?? d.category,
              categoryEn: category?.nameEn ?? d.categoryEn,
              categoryId: category?.id ?? d.categoryId,
              classification: classification ?? d.classification,
              tags: patch.tags ?? d.tags,
              modifiedAt: new Date().toISOString().slice(0, 10),
            }
          : d,
      ),
    );
    logAction(
      lang === "en" ? "Update document" : "تعديل وثيقة",
      lang === "en" ? "Document" : "وثيقة",
      id,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const downloadDocument = async (docId: string, versionId?: string) => {
    if (!apiMode) {
      toast({ type: "info", title: t("docs.noFile") });
      return;
    }
    try {
      const versions = await docsApi.versions(docId);
      const version = versionId ? versions.find((v) => v.id === versionId) : (versions.find((v) => v.isCurrent) ?? versions[0]);
      if (!version?.file?.id) {
        toast({ type: "info", title: t("docs.noFile") });
        return;
      }
      const { url } = await docsApi.downloadUrl(version.file.id);
      openDownload(url);
    } catch {
      reportApiError();
    }
  };

  const archiveDocs = (ids: string[], onResult?: (ok: boolean, done: number) => void) => {
    setDocs((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, status: "archived" } : d)));
    const log = (doneIds: string[]) =>
      logAction(
        lang === "en" ? "Archive documents" : "أرشفة وثائق",
        lang === "en" ? "Document" : "وثيقة",
        doneIds.join(", "),
        lang === "en" ? "Documents" : "الوثائق",
      );
    if (apiMode) {
      void Promise.allSettled(ids.map((id) => docsApi.updateDocument(id, { transition: "ARCHIVE" }))).then(async (results) => {
        const { doneIds, failure, ok } = settledOutcome(ids, results);
        await refetchDocuments().catch((reason) => logError("refetch after archive", reason));
        if (doneIds.length) log(doneIds);
        if (failure) reportApiError(failure.reason);
        onResult?.(ok, doneIds.length);
      });
      return;
    }
    log(ids);
    onResult?.(true, ids.length);
  };

  const moveDocs = (ids: string[], targetFolderId: string, onResult?: (ok: boolean) => void) => {
    const target = folderList.find((f) => f.id === targetFolderId);
    setDocs((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, folderId: targetFolderId } : d)));
    const log = () =>
      logAction(
        lang === "en"
          ? `Move ${ids.length} document(s) to "${target?.nameEn ?? targetFolderId}"`
          : `نقل ${ids.length} وثيقة إلى «${target?.name ?? targetFolderId}»`,
        lang === "en" ? "Document" : "وثيقة",
        ids.join(", "),
        lang === "en" ? "Library" : "المكتبة",
      );
    if (apiMode) {
      void Promise.all(ids.map((id) => docsApi.updateDocument(id, { folderId: targetFolderId })))
        .then(refetchDocuments)
        .then(() => {
          log();
          onResult?.(true);
        })
        .catch((error) => {
          recoverDocuments(error);
          onResult?.(false);
        });
      return;
    }
    log();
    onResult?.(true);
  };

  const checkOut = (id: string, userName: string, onResult?: (ok: boolean) => void) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, checkedOutBy: userName } : d)));
    const log = () =>
      logAction(
        lang === "en" ? `Check-out (lock) by ${userName}` : `حجز للتحرير — ${userName}`,
        lang === "en" ? "Document" : "وثيقة",
        id,
        lang === "en" ? "Documents" : "الوثائق",
      );
    if (apiMode) {
      docsApi
        .checkout(id)
        .then((dto) => {
          applyServerDoc(dto);
          log();
          onResult?.(true);
        })
        .catch((error) => {
          recoverDocuments(error);
          onResult?.(false);
        });
      return;
    }
    log();
    onResult?.(true);
  };

  const checkIn = (id: string, onResult?: (ok: boolean) => void) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, checkedOutBy: undefined } : d)));
    const log = () =>
      logAction(
        lang === "en" ? "Check-in (release)" : "تحرير (Check-in)",
        lang === "en" ? "Document" : "وثيقة",
        id,
        lang === "en" ? "Documents" : "الوثائق",
      );
    if (apiMode) {
      docsApi
        .checkin(id)
        .then((dto) => {
          applyServerDoc(dto);
          log();
          onResult?.(true);
        })
        .catch((error) => {
          recoverDocuments(error);
          onResult?.(false);
        });
      return;
    }
    log();
    onResult?.(true);
  };

  const deleteDocs = (ids: string[], onResult?: (ok: boolean, done: number) => void) => {
    const removed = docs.filter((d) => ids.includes(d.id));
    setDocs((prev) => prev.filter((d) => !ids.includes(d.id)));
    const log = (doneIds: string[]) =>
      logAction(
        lang === "en" ? "Move to trash" : "نقل إلى السلة",
        lang === "en" ? "Document" : "وثيقة",
        doneIds.join(", "),
        lang === "en" ? "Documents" : "الوثائق",
      );
    if (apiMode) {
      void Promise.allSettled(ids.map((id) => docsApi.deleteDocument(id))).then(async (results) => {
        const { doneIds, failure, ok } = settledOutcome(ids, results);
        await refetchDocuments().catch((reason) => logError("refetch after delete", reason));
        if (doneIds.length) log(doneIds);
        if (failure) reportApiError(failure.reason);
        onResult?.(ok, doneIds.length);
      });
      return;
    }
    if (removed.length) {
      setTrash((prev) => {
        const existing = new Set(prev.map((x) => x.doc.id));
        const fresh = removed
          .filter((d) => !existing.has(d.id))
          .map((d) => ({
            doc: d,
            deletedBy: user?.name ?? "?",
            deletedAt: new Date().toLocaleDateString("ar-SA"),
            purgeAt: "2026-02-27",
            original: "?",
          }));
        return [...fresh, ...prev];
      });
    }
    log(ids);
    onResult?.(true, ids.length);
  };

  const restoreDocs = async (ids: string[]): Promise<boolean> => {
    const restored = trash.filter((x) => ids.includes(x.doc.id)).map((x) => x.doc);
    setTrash((prev) => prev.filter((x) => !ids.includes(x.doc.id)));
    setDocs((prev) => [...restored.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
    if (apiMode) {
      try {
        await Promise.all(ids.map((id) => docsApi.restoreDocument(id)));
        await refetchDocuments();
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    }
    logAction(
      lang === "en" ? "Restore from trash" : "استعادة من السلة",
      lang === "en" ? "Document" : "وثيقة",
      ids.join(", "),
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const reportStorageErrors = (count: number) => {
    if (count > 0) {
      toast({
        type: "warning",
        title: lang === "en" ? "Storage cleanup needs attention" : "حذف الملفات من التخزين يحتاج إلى متابعة",
        message:
          lang === "en"
            ? `The records were removed. Storage deletion failed for ${count} object(s).`
            : `حُذفت السجلات وتعذّر حذف ${count} من كائنات التخزين.`,
      });
    }
    return count === 0;
  };

  const purgeStoredDocuments = async (ids: string[], bulk: boolean) => {
    let failed = 0;
    let storageErrors = 0;
    if (bulk) {
      for (let offset = 0; offset < ids.length; offset += 25) {
        const batch = ids.slice(offset, offset + 25);
        try {
          const result = await docsApi.purgeTrash(batch);
          failed += result.failed;
          storageErrors += result.storageErrors;
        } catch {
          failed += batch.length;
        }
      }
    } else {
      const results = await Promise.allSettled(ids.map((id) => docsApi.purgeDocument(id)));
      for (const result of results) {
        if (result.status === "rejected") failed++;
        else storageErrors += result.value.storageErrors ?? 0;
      }
    }
    await refetchDocuments();
    const storageOk = reportStorageErrors(storageErrors);
    if (failed) {
      toast({
        type: "warning",
        title: lang === "en" ? "Purge requests with incomplete results" : "طلبات حذف تحتاج إلى مراجعة",
        message:
          lang === "en"
            ? `Confirmed: ${ids.length - failed}. Unconfirmed: ${failed}.`
            : `تأكد حذف ${ids.length - failed}، وتعذّر تأكيد حذف ${failed}.`,
      });
    }
    return failed === 0 && storageOk;
  };

  const purgeDocs = async (ids: string[]): Promise<boolean> => {
    setTrash((prev) => prev.filter((x) => !ids.includes(x.doc.id)));
    if (apiMode) {
      try {
        if (!(await purgeStoredDocuments(ids, false))) return false;
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    }
    logAction(
      lang === "en" ? "Permanent deletion" : "حذف نهائي",
      lang === "en" ? "Document" : "وثيقة",
      ids.join(", "),
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const trashSnapshot = async () => (apiMode ? docsApi.trashIds() : trash.map((item) => item.doc.id));

  const emptyTrash = async (snapshot?: string[]): Promise<boolean> => {
    if (apiMode) {
      try {
        if (!(await purgeStoredDocuments(snapshot ?? (await trashSnapshot()), true))) return false;
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    } else {
      const ids = new Set(snapshot ?? trash.map((item) => item.doc.id));
      setTrash((items) => items.filter((item) => !ids.has(item.doc.id)));
    }
    logAction(
      lang === "en" ? "Empty trash (secure)" : "إفراغ السلة (آمن)",
      lang === "en" ? "Trash" : "سلة",
      "—",
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const removeTask = async (id: string): Promise<boolean> => {
    if (apiMode) {
      try {
        await domainApi.completeTask(id);
        await refetchTasks();
      } catch (error) {
        recoverTasks(error);
        return false;
      }
    } else {
      setTaskList((prev) => prev.filter((x) => x.id !== id));
    }
    logAction(
      lang === "en" ? "Complete approval task" : "إكمال مهمة موافقة",
      lang === "en" ? "Task" : "مهمة",
      id,
      lang === "en" ? "Workflow" : "سير العمل",
    );
    return true;
  };

  const rejectTask = async (id: string, comment: string): Promise<boolean> => {
    const existing = taskList.find((x) => x.id === id);
    if (apiMode) {
      const description = [existing?.step, comment.trim()].filter(Boolean).join(" — ") || undefined;
      try {
        await domainApi.updateTask(id, { status: "rejected", description });
        await refetchTasks();
      } catch (error) {
        recoverTasks(error);
        return false;
      }
    } else {
      setTaskList((prev) => prev.map((x) => (x.id === id ? { ...x, status: "rejected" } : x)));
    }
    logAction(
      lang === "en" ? `Reject task: "${comment}"` : `رفض مهمة: «${comment}»`,
      lang === "en" ? "Task" : "مهمة",
      id,
      lang === "en" ? "Workflow" : "سير العمل",
    );
    return true;
  };

  const addFolder = async (folder: FolderNode): Promise<boolean> => {
    if (apiMode) {
      const parentId = folder.parentId && folder.parentId !== "root" ? folder.parentId : undefined;
      try {
        const created = await docsApi.createFolder({
          name: folder.name,
          nameEn: folder.nameEn || undefined,
          type: folder.type === "project" ? "PROJECT" : folder.type === "dept" ? "DEPARTMENT" : "PERSONAL",
          scope: folder.accessScope === "عام" ? "PUBLIC" : folder.accessScope === "خاص" ? "PRIVATE" : "DEPARTMENT",
          parentId,
        });
        const mapped = mapFolder(created);
        setFolderList((prev) => withFolderCounts([...prev, mapped], docs));
      } catch (error) {
        recoverFolders(error);
        return false;
      }
    } else {
      setFolderList((prev) => [...prev, folder]);
    }
    logAction(
      lang === "en" ? `Create folder "${folder.name}"` : `إنشاء مجلد «${folder.name}»`,
      lang === "en" ? "Folder" : "مجلد",
      folder.id,
      lang === "en" ? "Library" : "المكتبة",
    );
    return true;
  };

  const renameFolder = async (
    id: string,
    patch: { name: string; nameEn?: string; type?: FolderNode["type"]; accessScope?: string },
  ): Promise<boolean> => {
    const existing = folderList.find((folder) => folder.id === id);
    if (!existing) return false;
    const name = patch.name.trim() || existing.name;
    const nameEn = patch.nameEn?.trim() || name;
    if (apiMode) {
      try {
        const updated = await docsApi.updateFolder(id, {
          name,
          nameEn,
          ...(patch.accessScope
            ? { scope: patch.accessScope === "عام" ? "PUBLIC" : patch.accessScope === "خاص" ? "PRIVATE" : "DEPARTMENT" }
            : {}),
        });
        const mapped = mapFolder(updated);
        setFolderList((prev) =>
          withFolderCounts(
            prev.map((folder) => (folder.id === id ? { ...folder, ...mapped } : folder)),
            docs,
          ),
        );
      } catch (error) {
        recoverFolders(error);
        return false;
      }
    } else {
      setFolderList((prev) =>
        prev.map((folder) =>
          folder.id === id
            ? {
                ...folder,
                name,
                nameEn,
                ...(patch.type ? { type: patch.type } : {}),
                ...(patch.accessScope ? { accessScope: patch.accessScope } : {}),
              }
            : folder,
        ),
      );
    }
    logAction(
      lang === "en" ? `Rename folder to "${name}"` : `إعادة تسمية مجلد إلى «${name}»`,
      lang === "en" ? "Folder" : "مجلد",
      id,
      lang === "en" ? "Library" : "المكتبة",
    );
    return true;
  };

  const deleteFolder = async (id: string): Promise<boolean> => {
    if (apiMode) {
      try {
        await docsApi.deleteFolder(id);
      } catch (error) {
        recoverFolders(error);
        return false;
      }
    }
    setFolderList((prev) =>
      withFolderCounts(
        prev.filter((folder) => folder.id !== id),
        docs,
      ),
    );
    logAction(lang === "en" ? "Delete folder" : "حذف مجلد", lang === "en" ? "Folder" : "مجلد", id, lang === "en" ? "Library" : "المكتبة");
    return true;
  };

  const refetchRetention = async () => {
    const [retentionPage, docsPage, holdsPage] = await Promise.all([
      loadAllPages((page) => domainApi.retentionItems(page)),
      loadDocumentWindows((after) => docsApi.listDocumentWindow(after, PAGE_SIZE), docsPagesRef.current),
      domainApi.holds(),
    ]);
    const activeHoldDocs = new Set(
      holdsPage.items.filter((hold) => hold.status === "ACTIVE").flatMap((hold) => hold.documents.map((doc) => doc.id)),
    );
    setRetention(retentionPage.items.map((item) => ({ ...mapRetentionItem(item), onHold: activeHoldDocs.has(item.documentId) })));
    setHolds(holdsPage.items.map(mapHold));
    const remoteDocs = docsPage.items.map(mapDocument);
    setDocs((prev) =>
      remoteDocs.map((doc) => keepCachedVersions(doc, detailCacheRef.current.get(doc.id) ?? prev.find((d) => d.id === doc.id))),
    );
    docsCursorRef.current = docsPage.nextCursor;
    setDocsMeta({ loaded: remoteDocs.length, total: docsPage.total });
    setFolderList((prev) => withFolderCounts(prev, remoteDocs));
  };

  const recoverRetention = (error?: unknown) => {
    reportApiError(error);
    void refetchRetention().catch((reason) => logError("retention refetch", reason));
  };

  const scheduleRetention = async (docId: string, policyId: string): Promise<boolean> => {
    if (apiMode) {
      try {
        await domainApi.scheduleRetention(docId, policyId);
        await refetchRetention();
      } catch (error) {
        recoverRetention(error);
        return false;
      }
    } else {
      const document = docs.find((item) => item.id === docId);
      const policy = policiesStore.items.find((item) => item.id === policyId) as Policy | undefined;
      if (!document || !policy) return false;
      const due = new Date(document.createdAt || Date.now());
      due.setMonth(due.getMonth() + (policy.retentionMonths || 12));
      const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
      const onHold = holdsStore.items.some((hold) => hold.status === "active" && (hold.documentIds ?? []).includes(docId));
      setRetention((prev) => [
        {
          id: uid("ret"),
          documentId: docId,
          docTitle: document.title,
          docNo: document.docNo,
          policy: policy.name,
          retentionEnd: dateOnly(due.toISOString()),
          deptId: document.deptId,
          owner: document.owner,
          onHold,
          proposedAction: policy.disposal,
          proposedActionEn: policy.disposalEn,
          daysLeft,
          reviewStatus: "pending" as const,
        },
        ...prev.filter((item) => item.documentId !== docId),
      ]);
    }
    logAction(
      lang === "en" ? "Schedule retention for document" : "جدولة احتفاظ لوثيقة",
      lang === "en" ? "Retention item" : "عنصر احتفاظ",
      docId,
      lang === "en" ? "Policies" : "السياسات",
    );
    return true;
  };

  const removeRetention = async (id: string, payload?: { dueAt?: string; action?: "REVIEW" | "ARCHIVE" | "DESTROY" }): Promise<boolean> => {
    if (apiMode) {
      try {
        let storageErrors = 0;
        if (payload?.dueAt) await domainApi.extendRetention(id, payload.dueAt);
        else if (payload?.action) {
          const result = await domainApi.executeRetention(id, payload.action);
          storageErrors = result.certificate?.storageErrors ?? 0;
        }
        await refetchRetention();
        if (!reportStorageErrors(storageErrors)) return false;
      } catch (error) {
        recoverRetention(error);
        return false;
      }
    } else if (payload?.dueAt) {
      const daysLeft = Math.ceil((new Date(payload.dueAt).getTime() - Date.now()) / 86_400_000);
      setRetention((prev) => prev.map((x) => (x.id === id ? { ...x, retentionEnd: dateOnly(payload.dueAt), daysLeft } : x)));
    } else if (payload?.action) {
      const executedAt = new Date().toISOString();
      setRetention((prev) =>
        prev.map((x) => (x.id === id ? { ...x, reviewStatus: "reviewed" as const, action: payload.action, executedAt } : x)),
      );
    }
    logAction(
      lang === "en" ? "Retention review action" : "إجراء مراجعة احتفاظ",
      lang === "en" ? "Retention item" : "عنصر احتفاظ",
      id,
      lang === "en" ? "Policies" : "السياسات",
    );
    return true;
  };

  const retentionCertificate = async (id: string): Promise<DestructionCertificateDto | null> => {
    if (apiMode) {
      try {
        return await domainApi.retentionCertificate(id);
      } catch (error) {
        reportApiError(error);
        return null;
      }
    }
    const item = retention.find((x) => x.id === id);
    if (!item) return null;
    return {
      certificateRef: `DES-${item.id.toUpperCase()}-${new Date().getFullYear()}`,
      auditEventId: "",
      auditHash: null,
      destroyedAt: new Date().toISOString(),
      performedById: null,
      performedBy: user?.name ?? null,
      retentionItemId: item.id,
      document: { id: item.documentId ?? "", docNo: item.docNo, title: item.docTitle },
      policy: { id: "", name: item.policy, retentionMonths: 0, legalBasis: null },
      dueAt: item.retentionEnd,
      note: null,
      files: [],
      fileCount: 0,
      totalBytes: 0,
      storageErrors: 0,
    };
  };

  /* ---------- Folder ACL ---------- */
  const syncAcl = (folderId: string, rules: ACLRule[]) => {
    if (!apiMode) return;
    if (aclFailed.includes(folderId)) return;
    docsApi.putFolderAcl(folderId, toAclPayload(rules).rules).catch((error) => {
      reportApiError(error);
      void docsApi
        .folderAcl(folderId)
        .then((fresh) => setAcls((prev) => ({ ...prev, [folderId]: mapAclRules(fresh) })))
        .catch((error) => logError("folder acl rollback", error));
    });
  };

  const retryFolderAcl = async (folderId: string) => {
    if (!apiMode) return true;
    try {
      const fresh = await docsApi.folderAcl(folderId);
      setAclFailed((prev) => prev.filter((id) => id !== folderId));
      setAcls((prev) => ({ ...prev, [folderId]: mapAclRules(fresh) }));
      return true;
    } catch (error) {
      reportApiError(error);
      return false;
    }
  };

  const addACLRule = (folderId: string, rule: Omit<ACLRule, "id">) => {
    const next = [...(acls[folderId] ?? []), { ...rule, id: uid("acl") }];
    setAcls((prev) => ({ ...prev, [folderId]: next }));
    syncAcl(folderId, next);
    logAction(
      lang === "en" ? `Add ACL rule: ${rule.principalName}` : `إضافة قاعدة صلاحيات: ${rule.principalName}`,
      lang === "en" ? "Folder" : "مجلد",
      folderId,
      lang === "en" ? "Permissions" : "الصلاحيات",
    );
  };

  const removeACLRule = (folderId: string, ruleId: string) => {
    const next = (acls[folderId] ?? []).filter((r) => r.id !== ruleId);
    setAcls((prev) => ({ ...prev, [folderId]: next }));
    syncAcl(folderId, next);
    logAction(
      lang === "en" ? "Remove ACL rule" : "حذف قاعدة صلاحيات",
      lang === "en" ? "Folder" : "مجلد",
      folderId,
      lang === "en" ? "Permissions" : "الصلاحيات",
    );
  };

  const toggleRulePermission = (folderId: string, ruleId: string, perm: PermAction) => {
    const next = (acls[folderId] ?? []).map((r) =>
      r.id === ruleId
        ? { ...r, permissions: r.permissions.includes(perm) ? r.permissions.filter((p) => p !== perm) : [...r.permissions, perm] }
        : r,
    );
    setAcls((prev) => ({ ...prev, [folderId]: next }));
    syncAcl(folderId, next);
    logAction(
      lang === "en" ? `Toggle permission "${perm}"` : `تبديل صلاحية «${perm}»`,
      lang === "en" ? "Folder" : "مجلد",
      folderId,
      lang === "en" ? "Permissions" : "الصلاحيات",
    );
  };

  const toggleRuleEffect = (folderId: string, ruleId: string) => {
    const next = (acls[folderId] ?? []).map((r) =>
      r.id === ruleId ? { ...r, effect: r.effect === "deny" ? ("allow" as const) : ("deny" as const) } : r,
    );
    setAcls((prev) => ({ ...prev, [folderId]: next }));
    syncAcl(folderId, next);
    logAction(
      lang === "en" ? "Toggle ACL rule effect" : "تبديل أثر قاعدة الصلاحيات",
      lang === "en" ? "Folder" : "مجلد",
      folderId,
      lang === "en" ? "Permissions" : "الصلاحيات",
    );
  };

  /* ---------- Lifecycle ---------- */
  const requestSignature = async (id: string): Promise<boolean> => {
    if (apiMode) {
      try {
        applyServerDoc(await docsApi.requestSignature(id));
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    } else {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, signatureStatus: "pending" } : d)));
    }
    logAction(
      lang === "en" ? "Request e-signature" : "طلب توقيع إلكتروني",
      lang === "en" ? "Document" : "وثيقة",
      id,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const signDocument = async (id: string, userName: string): Promise<boolean> => {
    if (apiMode) {
      try {
        applyServerDoc(await docsApi.sign(id));
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    } else {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, signatureStatus: "signed", signedBy: userName, signedAt: new Date().toLocaleDateString("ar-SA") } : d,
        ),
      );
    }
    logAction(
      lang === "en" ? `E-signature by ${userName}` : `توقيع إلكتروني — ${userName}`,
      lang === "en" ? "Document" : "وثيقة",
      id,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const declareRecord = async (id: string): Promise<boolean> => {
    if (apiMode) {
      try {
        applyServerDoc(await docsApi.declareRecord(id));
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    } else {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, declaredRecord: true, status: "archived" } : d)));
    }
    logAction(
      lang === "en" ? "Declare official record (immutable)" : "إعلان سجل رسمي (غير قابل للتعديل)",
      lang === "en" ? "Document" : "وثيقة",
      id,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const restoreVersion = async (docId: string, version: string): Promise<boolean> => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              version,
              versions: d.versions.map((v) => ({ ...v, current: v.v === version })),
              status: version === "1.0" ? "draft" : d.status,
            }
          : d,
      ),
    );
    if (apiMode) {
      try {
        const detail = await docsApi.getDocument(docId);
        const target = detail.versions.find((item) => item.version.toFixed(1) === version);
        if (!target) throw new Error("Version not found");
        const restored = await docsApi.restoreVersion(docId, target.id);
        rememberDetail(mapDocument(restored));
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
    }
    logAction(
      lang === "en" ? `Restore version ${version}` : `استعادة الإصدار ${version}`,
      lang === "en" ? "Document" : "وثيقة",
      docId,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const saveDraft = (docId: string) => {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, status: "draft" } : d)));
    if (apiMode) {
      docsApi.updateDocument(docId, { transition: "REOPEN" }).then(applyServerDoc).catch(recoverDocuments);
    }
    logAction(
      lang === "en" ? "Save as draft" : "حفظ كمسودة",
      lang === "en" ? "Document" : "وثيقة",
      docId,
      lang === "en" ? "Documents" : "الوثائق",
    );
  };

  const sendForApproval = async (docId: string): Promise<boolean> => {
    if (apiMode) {
      try {
        await domainApi.submitApproval({ documentId: docId });
        await refetchDocuments();
        await refetchApprovals();
        logAction(
          lang === "en" ? "Send for approval" : "إرسال للموافقة",
          lang === "en" ? "Document" : "وثيقة",
          docId,
          lang === "en" ? "Workflow" : "سير العمل",
        );
        return true;
      } catch {
        reportApiError();
        return false;
      }
    }
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, status: "pending" } : d)));
    logAction(
      lang === "en" ? "Send for approval" : "إرسال للموافقة",
      lang === "en" ? "Document" : "وثيقة",
      docId,
      lang === "en" ? "Workflow" : "سير العمل",
    );
    return true;
  };

  const uploadNewVersion = async (docId: string, userName: string, file?: File): Promise<boolean> => {
    if (apiMode) {
      if (!file) {
        notifyRef.current("doc.versionFileRequired");
        return false;
      }
      try {
        const registered = await docsApi.uploadToStorage(file);
        await docsApi.addVersion(docId, { fileId: registered.id, comment: file.name });
        const detail = await docsApi.getDocument(docId);
        rememberDetail(mapDocument(detail));
      } catch (error) {
        recoverDocuments(error);
        return false;
      }
      logAction(
        lang === "en" ? "Upload new version" : "رفع إصدار جديد",
        lang === "en" ? "Document" : "وثيقة",
        docId,
        lang === "en" ? "Documents" : "الوثائق",
      );
      return true;
    }

    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        const next = (parseFloat(d.version) + 1).toFixed(1);
        return {
          ...d,
          version: next,
          versions: [
            ...d.versions.map((v) => ({ ...v, current: false })),
            {
              v: next,
              date: new Date().toISOString().slice(0, 10),
              by: userName,
              size: d.size,
              fingerprint: `SHA-256: ${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`,
              comment: lang === "en" ? `Version ${next} uploaded` : `رفع الإصدار ${next}`,
              current: true,
            },
          ],
        };
      }),
    );
    logAction(
      lang === "en" ? "Upload new version" : "رفع إصدار جديد",
      lang === "en" ? "Document" : "وثيقة",
      docId,
      lang === "en" ? "Documents" : "الوثائق",
    );
    return true;
  };

  const reassignTask = async (taskId: string, toUser: string): Promise<boolean> => {
    if (apiMode) {
      const target = apiUsers.find((user) => user.name === toUser || user.id === toUser);
      if (!target) {
        reportApiError();
        return false;
      }
      try {
        await domainApi.updateTask(taskId, { assigneeId: target.id });
        await refetchTasks();
      } catch (error) {
        recoverTasks(error);
        return false;
      }
    } else {
      setTaskList((prev) => prev.filter((x) => x.id !== taskId));
    }
    logAction(
      lang === "en" ? `Reassign task to ${toUser}` : `إعادة تعيين المهمة إلى ${toUser}`,
      lang === "en" ? "Task" : "مهمة",
      taskId,
      lang === "en" ? "Workflow" : "سير العمل",
    );
    return true;
  };

  const requestChanges = async (taskId: string, comment: string): Promise<boolean> => {
    if (apiMode) {
      try {
        await domainApi.updateTask(taskId, { status: "changes_requested", description: comment || undefined });
        await refetchTasks();
      } catch (error) {
        recoverTasks(error);
        return false;
      }
    } else {
      setTaskList((prev) => prev.filter((x) => x.id !== taskId));
    }
    logAction(
      lang === "en" ? `Request changes: "${comment}"` : `طلب تعديلات: «${comment}»`,
      lang === "en" ? "Task" : "مهمة",
      taskId,
      lang === "en" ? "Workflow" : "سير العمل",
    );
    return true;
  };

  /* ---------- Hierarchy helpers (delegate to pure module) ---------- */
  const getChildrenIds = (folderId: string): string[] => folderChildrenIds(folderId, folderList);

  const getInheritedRules = (folderId: string) => inheritedRules(folderId, folderList, acls);

  const getEffectiveRules = (folderId: string): ACLRule[] => effectiveRules(folderId, folderList, acls);

  const hasOwnRules = (folderId: string) => hasOwnRulesPure(folderId, acls);

  const propagateRule = (folderId: string, rule: Omit<ACLRule, "id">): number => {
    const children = getChildrenIds(folderId);
    const updates: Record<string, ACLRule[]> = {};
    const next = { ...acls };
    for (const cid of children) {
      const list = [...(next[cid] ?? []), { ...rule, id: uid(`acl-${cid}`) }];
      next[cid] = list;
      updates[cid] = list;
    }
    setAcls(next);
    for (const cid of children) syncAcl(cid, updates[cid]);
    logAction(
      lang === "en"
        ? `Propagate rule "${rule.principalName}" to ${children.length} subfolders`
        : `تعميم قاعدة «${rule.principalName}» على ${children.length} مجلد فرعي`,
      lang === "en" ? "Folder" : "مجلد",
      folderId,
      lang === "en" ? "Permissions" : "الصلاحيات",
    );
    return children.length;
  };

  /* ---------- Permission engine (delegate to pure module) ---------- */
  const can = (action: PermAction, folderId: string, docDeptId?: string): boolean =>
    canAccess({
      action,
      folderId,
      docDeptId,
      role,
      userDeptId: user?.department,
      userId: user?.id,
      folders: folderList,
      acls,
    });

  const scopedDocs = (apiMode ? docs : docs.filter((d) => can("view", d.folderId, d.deptId))).filter((d) => d.status !== "destroyed");
  const visibleFolders = apiMode
    ? folderList
    : folderList.filter((f) => {
        if (!f.owner || SHARED_FOLDERS.includes(f.id)) return true;
        return can("view", f.id);
      });

  return (
    <Ctx.Provider
      value={{
        docs,
        tasks: taskList,
        folders: folderList,
        retention,
        trash,
        acls,
        aclFailedFolders: aclFailed,
        retryFolderAcl,
        auditLog,
        docsMeta,
        docsLoadingMore,
        loadMoreDocuments,
        docsReady,
        pendingApprovals: approvals,
        approvalsReady,
        decideApproval,
        refetchApprovals,
        notifications: notificationList,
        markNotificationRead,
        markAllNotificationsRead,
        summary,
        users: usersStore,
        employees: employeesStore,
        policies: policiesStore,
        projects: projectsStore,
        departments: departmentsStore,
        sections: sectionsStore,
        templates,
        refreshOrgDirectory,
        refreshUsers,
        systemSettings,
        setSystemSetting,
        applySystemSettings,
        createDocument,
        updateDocument,
        downloadDocument,
        loadDocument,
        archiveDocs,
        moveDocs,
        checkOut,
        checkIn,
        deleteDocs,
        restoreDocs,
        purgeDocs,
        trashSnapshot,
        emptyTrash,
        removeTask,
        rejectTask,
        addFolder,
        renameFolder,
        deleteFolder,
        removeRetention,
        retentionCertificate,
        scheduleRetention,
        addACLRule,
        removeACLRule,
        toggleRulePermission,
        toggleRuleEffect,
        holds: holdsStore,
        addHold,
        releaseHold,
        errors: errorsStore,
        setErrorStatus,
        assignError,
        addErrorNote,
        clearErrors,
        requestSignature,
        signDocument,
        declareRecord,
        restoreVersion,
        saveDraft,
        sendForApproval,
        uploadNewVersion,
        reassignTask,
        requestChanges,
        logAction,
        can,
        scopedDocs,
        visibleFolders,
        getInheritedRules,
        getEffectiveRules,
        getChildrenIds,
        propagateRule,
        hasOwnRules,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDocsStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDocsStore must be used within DocsProvider");
  return ctx;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LogOut, Check, ShieldAlert, Info } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Avatar, Tabs, Field, Input, Select, Toggle, ConfirmDialog, cn } from "../components/ui";
import { PageHeader, MetaGrid } from "../components/shared";
import { roleLabel } from "../data";
import { useDocsStore } from "../store-docs";
import { config } from "../config";
import { serverReason } from "../lib/api-client";
import { domainApi } from "../lib/domain-api";
import { roleToApi } from "../lib/role-bridge";
import type { Role } from "../store";
import type { UserSessionDto } from "@edas/shared";
export function UserEditor() {
  const { id } = useParams();
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const apiMode = config.useApi;
  const { users: userStore, departments: deptStore, refreshUsers } = useDocsStore();
  const users = userStore.items;
  const departments = deptStore.items;
  const [tab, setTab] = useState("basic");
  const u = id ? users.find((x) => x.id === id) : undefined;
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [deptId, setDeptId] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [forceChange, setForceChange] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string; memberIds: string[] }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [sessions, setSessions] = useState<UserSessionDto[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const hydratedId = useRef<string | null>(null);
  const userId = u?.id;
  useEffect(() => {
    if (!u || hydratedId.current === u.id) return;
    hydratedId.current = u.id;
    setName(u.name);
    setUsername(u.username);
    setEmail(u.email);
    setDeptId(u.deptId);
    setRole(u.role);
  }, [u]);
  useEffect(() => {
    if (!apiMode || !userId) return;
    setGroupsLoading(true);
    domainApi
      .groups()
      .then((page) =>
        setGroups(
          page.items.map((group) => ({
            id: group.id,
            name: lang === "en" ? (group.nameEn ?? group.name) : group.name,
            memberIds: group.memberIds,
          })),
        ),
      )
      .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }))
      .finally(() => setGroupsLoading(false));
  }, [apiMode, userId, lang, t, toast]);
  const loadSessions = useCallback(() => {
    if (!apiMode || !userId) return;
    setSessionsLoading(true);
    setSessionsError(null);
    domainApi
      .userSessions(userId)
      .then((page) => setSessions(page.sessions))
      .catch((error) => {
        setSessions([]);
        setSessionsError(serverReason(error) ?? "");
      })
      .finally(() => setSessionsLoading(false));
  }, [apiMode, userId]);
  useEffect(() => {
    if (tab === "sessions") loadSessions();
  }, [tab, loadSessions]);
  const toggleGroup = async (groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group || !userId) return;
    const previous = group.memberIds;
    const memberIds = previous.includes(userId) ? previous.filter((memberId) => memberId !== userId) : [...previous, userId];
    setGroups((items) => items.map((item) => (item.id === groupId ? { ...item, memberIds } : item)));
    try {
      await domainApi.updateGroup(groupId, { memberIds });
      toast({
        type: "success",
        title: memberIds.includes(userId)
          ? L("تمت إضافة المستخدم للمجموعة", "User added to group")
          : L("تمت إزالة المستخدم", "User removed"),
        message: group.name,
      });
    } catch (error) {
      setGroups((items) => items.map((item) => (item.id === groupId ? { ...item, memberIds: previous } : item)));
      toast({ type: "error", title: t("err.api"), message: serverReason(error) });
    }
  };
  if (!u) {
    return (
      <Card>
        <div className="space-y-2 p-6">
          <p className="text-sm font-semibold text-ink-500">
            {apiMode && users.length === 0
              ? L("جارٍ تحميل المستخدمين…", "Loading users…")
              : L("لم يتم العثور على المستخدم", "User not found")}
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/users")}>
            {L("العودة إلى المستخدمين", "Back to users")}
          </Button>
        </div>
      </Card>
    );
  }
  const save = async () => {
    if (!name.trim() || !username.trim()) return;
    if (password && (password.length < 8 || password !== confirm)) {
      toast({
        type: "error",
        title: L("كلمة المرور غير صالحة", "Invalid password"),
        message: L("8 أحرف على الأقل ويجب أن تتطابق", "At least 8 characters and both fields must match"),
      });
      return;
    }
    if (apiMode) {
      const departmentId = departments.some((d) => d.id === deptId) ? deptId : undefined;
      setSaving(true);
      try {
        await domainApi.updateUser(u.id, {
          name,
          username,
          email,
          role: roleToApi(role),
          departmentId,
          requirePasswordChange: forceChange,
          requireTwoFactor: twoFactor,
        });
        if (password) await domainApi.resetUserPassword(u.id, password);
        await refreshUsers();
        toast({ type: "success", title: t("g.save"), message: name });
        navigate("/admin/users");
      } catch (error) {
        toast({ type: "error", title: t("err.api"), message: serverReason(error) });
      } finally {
        setSaving(false);
      }
      return;
    }
    userStore.update(u.id, { name, username, email, deptId, role });
    toast({ type: "success", title: t("g.save") });
    navigate("/admin/users");
  };
  const revoke = async () => {
    if (apiMode) {
      try {
        await domainApi.revokeUserSessions(u.id);
        await refreshUsers();
        setSessions([]);
        setSessionsError(null);
        toast({ type: "warning", title: L("تم إنهاء الجلسات", "Sessions ended"), message: u.name });
      } catch (error) {
        toast({ type: "error", title: t("err.api"), message: serverReason(error) });
      }
      return;
    }
    userStore.update(u.id, { activeSessions: 0 });
    toast({ type: "warning", title: L("تم إنهاء الجلسات", "Sessions ended") });
  };
  return (
    <div>
      <PageHeader
        title={`${t("g.edit")} — ${u.name}`}
        description={roleLabel(u.role, lang)}
        breadcrumbs={[{ label: t("nav.users"), to: "/admin/users" }, { label: u.name }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")}>
            {t("g.back")}
          </Button>
        }
      />
      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "basic", label: L("المعلومات الأساسية", "Basic info") },
              { id: "roles", label: L("الأدوار والنطاقات", "Roles & scopes") },
              { id: "groups", label: t("nav.groups") },
              { id: "security", label: L("الأمان", "Security") },
              { id: "sessions", label: L("الجلسات", "Sessions") },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === "basic" && (
            <div className="flex flex-wrap gap-4">
              <Avatar initials={u.initials} color={u.color} size="lg" />
              <div className="grid flex-1 grid-cols-2 gap-3">
                <Field label={t("g.name")}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={L("اسم المستخدم", "Username")}>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} />
                </Field>
                <Field label={L("البريد", "Email")}>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label={t("g.department")}>
                  <Select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {lang === "en" ? d.nameEn : d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}
          {tab === "roles" && (
            <div className="space-y-2">
              {(["employee", "supervisor", "dept_manager", "archivist", "system_admin", "auditor"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className="flex w-full items-center gap-2 rounded-lg border border-ink-200 p-3 text-start dark:border-ink-800"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                      role === r ? "border-navy-600 bg-navy-600 text-white" : "border-ink-300 dark:border-ink-600",
                    )}
                  >
                    {role === r && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-sm text-ink-700 dark:text-ink-200">{roleLabel(r, lang)}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "groups" &&
            (apiMode ? (
              <div className="space-y-2">
                {groupsLoading && <p className="p-2 text-sm text-ink-500">{L("جارٍ تحميل المجموعات…", "Loading groups…")}</p>}
                {!groupsLoading && groups.length === 0 && (
                  <p className="p-2 text-sm text-ink-500">{L("لا توجد مجموعات", "No groups yet")}</p>
                )}
                {groups.map((group) => {
                  const member = group.memberIds.includes(u.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      role="checkbox"
                      aria-checked={member}
                      onClick={() => void toggleGroup(group.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-ink-200 p-3 text-start dark:border-ink-800"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                          member ? "border-navy-600 bg-navy-600 text-white" : "border-ink-300 dark:border-ink-600",
                        )}
                      >
                        {member && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-sm text-ink-700 dark:text-ink-200">{group.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-ink-200 p-3.5 text-sm text-ink-500 dark:border-ink-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                {L(
                  "إدارة عضوية المجموعات متاحة في وضع الاتصال بالخادم فقط.",
                  "Group membership can be managed only when connected to the server.",
                )}
              </div>
            ))}
          {tab === "security" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={L("تغيير كلمة المرور", "Change password")} hint={L("8 أحرف على الأقل", "At least 8 characters")}>
                <Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label={t("g.confirm")}>
                <Input type="password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <div className="col-span-2 space-y-2">
                <label className="flex items-center gap-2">
                  <Toggle checked={forceChange} onChange={() => setForceChange(!forceChange)} />{" "}
                  {L("مطالبة المستخدم بتغيير كلمة المرور عند الدخول", "Require the user to change the password at next login")}
                </label>
                <label className="flex items-center gap-2">
                  <Toggle checked={twoFactor} onChange={() => setTwoFactor(!twoFactor)} />{" "}
                  {L("مطالبة المستخدم بإعداد المصادقة الثنائية", "Require the user to configure two-factor authentication")}
                </label>
                <p className="text-xs text-ink-400">
                  {L(
                    "يُضاف الإجراءان كمتطلبات دخول في مزود الهوية؛ إيقاف المفتاح لا يزيل متطلباً سابقاً.",
                    "Both options are added as required actions in the identity provider; turning a switch off does not remove an earlier requirement.",
                  )}
                </p>
              </div>
            </div>
          )}
          {tab === "sessions" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                <span className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <ShieldAlert className="h-4 w-4" />
                  {apiMode
                    ? sessionsLoading
                      ? L("جارٍ جلب الجلسات…", "Loading sessions…")
                      : sessionsError !== null
                        ? sessionsError || L("تعذّر جلب الجلسات من مزود الهوية", "Could not load sessions from the identity provider")
                        : L(`الجلسات النشطة: ${sessions.length}`, `Active sessions: ${sessions.length}`)
                    : L(`الجلسات النشطة: ${u.activeSessions}`, `Active sessions: ${u.activeSessions}`)}
                </span>
                <span className="flex items-center gap-2">
                  {apiMode && sessionsError !== null && !sessionsLoading && (
                    <Button variant="ghost" size="sm" onClick={loadSessions}>
                      {L("إعادة المحاولة", "Retry")}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => setRevokeOpen(true)}>
                    {L("إنهاء كل الجلسات", "End all sessions")}
                  </Button>
                </span>
              </div>
              {apiMode && sessions.length > 0 && (
                <div className="space-y-1.5">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-xs dark:border-ink-800"
                    >
                      <span className="font-semibold text-ink-700 dark:text-ink-200" dir="ltr">
                        {session.ipAddress ?? "—"}
                      </span>
                      <span className="text-ink-500">{session.clients.join(" · ") || L("تطبيق الويب", "Web app")}</span>
                      <span className="ms-auto text-ink-400">
                        {session.started ? new Date(session.started).toLocaleString(lang === "en" ? "en" : "ar") : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <MetaGrid
                items={[
                  { label: L("آخر دخول", "Last login"), value: u.lastLogin },
                  { label: L("محاولات فاشلة", "Failed attempts"), value: u.failedAttempts },
                ]}
              />
              <p className="text-xs text-ink-400">
                {L(
                  "تفاصيل الجلسات (العنوان، التطبيق، وقت البداية) تُجلب من مزود الهوية؛ «إنهاء كل الجلسات» يُبطلها هناك ويحتاج المستخدم لتسجيل دخول جديد.",
                  "Session details (address, app, start time) come from the identity provider; “End all sessions” invalidates them there and the user must sign in again.",
                )}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 p-3 dark:border-ink-800">
          <Button variant="outline" onClick={() => navigate("/admin/users")}>
            {t("g.cancel")}
          </Button>
          <Button icon={<Check className="h-4 w-4" />} loading={saving} onClick={save}>
            {t("g.save")}
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => void revoke()}
        title={L("إنهاء كل الجلسات", "End all sessions")}
        message={L(
          `سيتم إلغاء جلسات «${u.name}» في مزود الهوية وسيحتاج إلى تسجيل الدخول مجدداً.`,
          `All sessions for "${u.name}" will be revoked at the identity provider and the user must sign in again.`,
        )}
        confirmText={L("إنهاء الجلسات", "End sessions")}
        danger
      />
    </div>
  );
}

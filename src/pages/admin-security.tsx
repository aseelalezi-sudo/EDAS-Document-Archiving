import { useEffect, useState } from "react";
import { Plus, Lock, KeyRound, LogOut, ShieldCheck, Check, X, AlertTriangle, RefreshCw, Network } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Avatar, Field, Input, Toggle, Textarea, ConfirmDialog, cn } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";
import { config } from "../config";

interface PasswordPolicy {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  symbol: boolean;
  history: string;
  tempValid: string;
}

const DEFAULT_PW_POLICY: PasswordPolicy = { upper: true, lower: true, digit: true, symbol: true, history: "5", tempValid: "24" };

function readJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function Security() {
  const { t, lang, toast, apiMode } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { systemSettings: S, applySystemSettings, users: usersStore, refreshUsers } = useDocsStore();
  const [draft, setDraft] = useState<Record<string, string>>(S);
  const [pwPolicy, setPwPolicy] = useState<PasswordPolicy>(DEFAULT_PW_POLICY);
  const [lockManual, setLockManual] = useState(true);
  const [blockedIPs, setBlockedIPs] = useState<string[]>([]);
  const [lanRanges, setLanRanges] = useState("");
  const [newIP, setNewIP] = useState("");
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setDraft(S);
    setPwPolicy(readJson(S.pwPolicy, DEFAULT_PW_POLICY));
    setLockManual(S.lockManual !== "false");
    setBlockedIPs(readJson<string[]>(S.blockedIPs, []));
    setLanRanges(S.lanRanges ?? "");
  }, [S, dirty]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setDraft((current) => ({ ...current, [k]: value }));
    setDirty(true);
  };
  const togglePw = (k: keyof PasswordPolicy) => {
    setPwPolicy((p) => ({ ...p, [k]: !p[k] }));
    setDirty(true);
  };
  const addBlocked = () => {
    if (newIP.trim()) {
      setBlockedIPs((p) => [...p, newIP.trim()]);
      setNewIP("");
      setDirty(true);
    }
  };
  const removeBlocked = (x: string) => {
    setBlockedIPs((p) => p.filter((y) => y !== x));
    setDirty(true);
  };
  const discard = () => {
    setDraft(S);
    setPwPolicy(readJson(S.pwPolicy, DEFAULT_PW_POLICY));
    setLockManual(S.lockManual !== "false");
    setBlockedIPs(readJson<string[]>(S.blockedIPs, []));
    setLanRanges(S.lanRanges ?? "");
    setDirty(false);
    setTestResult(null);
  };
  const save = async () => {
    const values: Record<string, string> = {
      ...draft,
      pwPolicy: JSON.stringify(pwPolicy),
      lockManual: String(lockManual),
      blockedIPs: JSON.stringify(blockedIPs),
      lanRanges,
    };
    setSaving(true);
    try {
      if (apiMode) {
        const changed = Object.entries(values).filter(([key, value]) => S[key] !== value);
        await Promise.all(changed.map(([key, value]) => domainApi.putSetting(key, value)));
      }
      applySystemSettings(values);
      setDirty(false);
      toast({
        type: "success",
        title: L("تم حفظ سياسات الأمان", "Security policies saved"),
        message: L(
          "حُفظت القيم في إعدادات النظام كمرجع. لا يفرض الخادم هذه السياسات تلقائياً؛ التطبيق الفعلي يتطلب إعداد مزود الهوية والبنية التحتية.",
          "Values were stored as reference settings. The server does not enforce them automatically; enforcement requires identity-provider and infrastructure configuration.",
        ),
      });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setSaving(false);
    }
  };
  const testSettings = () => {
    const checks = [
      Number(draft.minPassword) >= 12,
      pwPolicy.upper && pwPolicy.lower,
      pwPolicy.symbol,
      Number(draft.failedAttempts) <= 5,
      Number(draft.idleTimeout) <= 30,
    ];
    const score = checks.filter(Boolean).length;
    setTestResult({
      ok: score >= 4,
      msg: `${L("تقييم إرشادي محلي", "Local guidance score")}: ${score}/5 — ${
        score >= 4
          ? L("القيم متوافقة مع الممارسات المقترحة", "Values match recommended practice")
          : L("تحتاج تحسينات", "Needs improvements")
      }`,
    });
  };
  const secScore = Math.min(
    100,
    40 +
      (Number(draft.minPassword) >= 12 ? 15 : 0) +
      (pwPolicy.symbol ? 10 : 0) +
      (Number(draft.idleTimeout) <= 30 ? 10 : 0) +
      (Number(draft.failedAttempts) <= 5 ? 10 : 0) +
      (lockManual ? 5 : 0) +
      (blockedIPs.length > 0 ? 10 : 0),
  );

  const unlockUser = async (user: { id: string; name: string }) => {
    if (!apiMode) {
      usersStore.update(user.id, { status: "active", failedAttempts: 0 });
      toast({ type: "success", title: L("تم فتح الحساب", "Account unlocked"), message: user.name });
      return;
    }
    try {
      await domainApi.updateUser(user.id, { status: "ACTIVE" });
      await refreshUsers();
      toast({ type: "success", title: L("تم فتح الحساب", "Account unlocked"), message: user.name });
    } catch {
      toast({ type: "error", title: t("err.api") });
    }
  };

  const revokeAllSessions = async () => {
    const targets = usersStore.items;
    if (apiMode) {
      if (targets.length === 0) {
        toast({ type: "info", title: L("لا مستخدمين", "No users") });
        return;
      }
      setRevoking(true);
      try {
        await Promise.all(targets.map((u) => domainApi.revokeUserSessions(u.id)));
        await refreshUsers();
        toast({ type: "warning", title: L("تم إلغاء جلسات جميع المستخدمين", "All user sessions revoked") });
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setRevoking(false);
      }
      return;
    }
    targets.forEach((u) => usersStore.update(u.id, { activeSessions: 0 }));
    toast({ type: "warning", title: L("تم إلغاء جميع الجلسات", "All sessions revoked") });
  };

  return (
    <div>
      <PageHeader
        title={t("nav.security")}
        description={L("سياسات كلمة المرور والقفل والجلسات والشبكة", "Password, lockout, session, and network policies")}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.security") }]}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={testSettings}>
              {L("اختبار", "Test")}
            </Button>
            <Button size="sm" icon={<Check className="h-4 w-4" />} loading={saving} onClick={save} disabled={!dirty}>
              {t("g.save")}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card className="flex items-center gap-3 md:col-span-1">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" className="stroke-ink-100 dark:stroke-ink-800" />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={150}
                strokeDashoffset={150 - (150 * secScore) / 100}
                className={secScore >= 80 ? "stroke-emerald-500" : secScore >= 60 ? "stroke-amber-500" : "stroke-rose-500"}
                style={{ transition: "stroke-dashoffset .5s" }}
              />
            </svg>
            <span className="absolute text-sm font-extrabold text-ink-800 dark:text-white">{secScore}</span>
          </div>
          <div>
            <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{L("مؤشر إرشادي", "Guidance score")}</p>
            <p className="text-xs text-ink-400">{L("حسب القيم المدخلة أعلاه", "Based on the values entered above")}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 md:col-span-3">
          {dirty ? (
            <>
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-bold text-ink-800 dark:text-ink-100">
                  {L("لديك تغييرات غير محفوظة", "You have unsaved changes")}
                </p>
                <p className="text-xs text-ink-400">
                  {L("لم تُحفظ التعديلات في إعدادات النظام بعد", "Changes not yet stored in system settings")}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={discard}>
                {L("تجاهل", "Discard")}
              </Button>
              <Button size="sm" loading={saving} onClick={save}>
                {t("g.save")}
              </Button>
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              <div className="flex-1">
                <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{L("الإعدادات محفوظة", "Settings saved")}</p>
                <p className="text-xs text-ink-400">
                  {L("قيم مرجعية لا يفرضها الخادم تلقائياً", "Reference values not enforced by the server")}
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
      {testResult && (
        <div
          className={cn(
            "mb-4 flex items-center gap-2 rounded-xl border p-3.5 text-sm font-semibold",
            testResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          {testResult.msg}
          <button type="button" onClick={() => setTestResult(null)} className="ms-auto" aria-label={L("إغلاق", "Dismiss")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title={L("سياسة كلمة المرور", "Password policy")} icon={<KeyRound className="h-4 w-4 text-navy-500" />} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("الحد الأدنى للطول", "Min length")}>
              <Input type="number" value={draft.minPassword ?? ""} onChange={set("minPassword")} />
            </Field>
            <Field label={L("الانتهاء (يوم)", "Expiry (days)")}>
              <Input type="number" value={draft.passwordExpiry ?? ""} onChange={set("passwordExpiry")} />
            </Field>
            <Field label={L("سجل كلمات المرور", "History")}>
              <Input
                type="number"
                value={pwPolicy.history}
                onChange={(e) => {
                  setPwPolicy((p) => ({ ...p, history: e.target.value }));
                  setDirty(true);
                }}
              />
            </Field>
            <Field label={L("صلاحية المؤقتة (ساعة)", "Temp validity (h)")}>
              <Input
                type="number"
                value={pwPolicy.tempValid}
                onChange={(e) => {
                  setPwPolicy((p) => ({ ...p, tempValid: e.target.value }));
                  setDirty(true);
                }}
              />
            </Field>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">{L("المتطلبات", "Requirements")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["upper", L("حرف كبير", "Uppercase")],
                  ["lower", L("حرف صغير", "Lowercase")],
                  ["digit", L("رقم", "Digit")],
                  ["symbol", L("رمز خاص", "Symbol")],
                ] as [keyof PasswordPolicy, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => togglePw(key)}
                  aria-pressed={Boolean(pwPolicy[key])}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-start text-xs font-semibold transition-colors",
                    pwPolicy[key]
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-ink-200 text-ink-400 dark:border-ink-800",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded",
                      pwPolicy[key] ? "bg-emerald-500 text-white" : "bg-ink-200 dark:bg-ink-700",
                    )}
                  >
                    {pwPolicy[key] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">{L("معاينة القوة", "Strength preview")}</p>
            <div className="flex gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < Math.min(6, Math.ceil(Number(draft.minPassword) / 3) + Object.values(pwPolicy).filter((v) => v === true).length - 2)
                      ? "bg-emerald-500"
                      : "bg-ink-100 dark:bg-ink-800",
                  )}
                />
              ))}
            </div>
            <p className="mt-1 font-mono text-[10px] text-ink-400">
              {L("مثال", "Example")}: {"P@ss" + "W0rd!" + "2026"}
            </p>
          </div>
        </Card>

        <Card>
          <SectionTitle title={L("قفل الحساب", "Account lockout")} icon={<Lock className="h-4 w-4 text-navy-500" />} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("عدد المحاولات", "Attempts")}>
              <Input type="number" value={draft.failedAttempts ?? ""} onChange={set("failedAttempts")} />
            </Field>
            <Field label={L("مدة القفل (دقيقة)", "Lock duration")}>
              <Input type="number" value={draft.lockDuration ?? ""} onChange={set("lockDuration")} />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
            <div>
              <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{L("فتح يدوي", "Manual unlock")}</p>
              <p className="text-xs text-ink-400">{L("يتطلب تدخل المسؤول", "Requires admin intervention")}</p>
            </div>
            <Toggle
              label={L("فتح يدوي", "Manual unlock")}
              checked={lockManual}
              onChange={(v) => {
                setLockManual(v);
                setDirty(true);
              }}
            />
          </div>
          <div className="mt-3 rounded-xl bg-rose-50 p-3.5 dark:bg-rose-500/10">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-rose-500">
              {L("حسابات مقفلة حالياً", "Currently locked")}
            </p>
            {usersStore.items.filter((u) => u.status === "locked").length === 0 ? (
              <p className="text-xs text-rose-400">{L("لا حسابات مقفلة", "No locked accounts")}</p>
            ) : (
              <div className="space-y-1.5">
                {usersStore.items
                  .filter((u) => u.status === "locked")
                  .map((u) => (
                    <div key={u.id} className="flex items-center gap-2 text-xs">
                      <Avatar initials={u.initials} color={u.color} size="xs" />
                      <span className="flex-1 truncate font-semibold text-rose-700 dark:text-rose-300">{u.name}</span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => void unlockUser({ id: u.id, name: u.name })}>
                        {L("فتح", "Unlock")}
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle title={L("إدارة الجلسات", "Session management")} icon={<RefreshCw className="h-4 w-4 text-navy-500" />} />
          <div className="grid grid-cols-3 gap-3">
            <Field label={L("مهلة النشاط (د)", "Idle (min)")}>
              <Input type="number" value={draft.idleTimeout ?? ""} onChange={set("idleTimeout")} />
            </Field>
            <Field label={L("أقصى مدة (س)", "Max (h)")}>
              <Input type="number" value={draft.maxSession ?? ""} onChange={set("maxSession")} />
            </Field>
            <Field label={L("متزامنة", "Concurrent")}>
              <Input type="number" value={draft.concurrentSessions ?? ""} onChange={set("concurrentSessions")} />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-200 p-3 dark:border-ink-800">
            <span className="text-xs text-ink-500">{L("عدد الجلسات النشطة", "Active session count")}</span>
            <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{L("غير متتبع", "Not tracked")}</Badge>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {L(
              "لا يحتفظ الخادم بعدد جلسات لكل مستخدم؛ إلغاء الجلسات يُبطل جلسات الجميع في مزود الهوية.",
              "The server does not track per-user session counts; revoking ends every user's sessions at the identity provider.",
            )}
          </p>
          <Button
            size="sm"
            variant="danger"
            className="mt-3 w-full"
            icon={<LogOut className="h-4 w-4" />}
            loading={revoking}
            onClick={() => setRevokeOpen(true)}
            disabled={usersStore.items.length === 0}
          >
            {L("إلغاء جميع الجلسات", "Revoke all sessions")}
          </Button>
        </Card>

        <Card>
          <SectionTitle title={L("أمان الشبكة (LAN)", "Network security (LAN)")} icon={<Network className="h-4 w-4 text-navy-500" />} />
          <Field label={L("عناوين LAN المسموح بها", "Allowed LAN ranges")}>
            <Textarea
              dir="ltr"
              value={lanRanges}
              onChange={(e) => {
                setLanRanges(e.target.value);
                setDirty(true);
              }}
              className="font-mono text-xs"
            />
          </Field>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{L("عناوين محظورة", "Blocked IPs")}</p>
              <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{blockedIPs.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {blockedIPs.length === 0 && <p className="text-xs text-ink-400">{L("لا عناوين محظورة", "No blocked addresses")}</p>}
              {blockedIPs.map((x) => (
                <span
                  key={x}
                  className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 font-mono text-xs font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  {x}
                  <button
                    type="button"
                    onClick={() => removeBlocked(x)}
                    aria-label={L(`إزالة ${x}`, `Remove ${x}`)}
                    className="text-rose-400 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                className="h-9"
                dir="ltr"
                placeholder="10.0.9.99"
                value={newIP}
                onChange={(e) => setNewIP(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addBlocked()}
              />
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={addBlocked} disabled={!newIP.trim()}>
                {L("حظر", "Block")}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            {L(
              "تُسجَّل هذه القيم كسياسة معتمدة، ويُطبَّق الحظر الفعلي على مستوى جدار الحماية والشبكة خارج التطبيق.",
              "These values are recorded as approved policy; actual blocking is enforced by the network firewall outside the application.",
            )}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title={L("المصادقة", "Authentication")} icon={<ShieldCheck className="h-4 w-4 text-navy-500" />} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
              <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{L("مزود الهوية", "Identity provider")}</p>
              <p className="mt-1 truncate font-mono text-[11px] text-ink-400">{config.oidc.issuer || L("غير مهيأ", "Not configured")}</p>
            </div>
            <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
              <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{L("المصادقة الثنائية", "Two-factor authentication")}</p>
              <p className="mt-1 text-xs text-ink-400">{L("تُدار في Keycloak لكل مستخدم", "Managed per user in Keycloak")}</p>
            </div>
            <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
              <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{L("دليل المستخدمين", "User directory")}</p>
              <p className="mt-1 text-xs text-ink-400">{L("Keycloak Federation (LDAP)", "Keycloak federation (LDAP)")}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            {L(
              "لا يمكن تغيير طرق المصادقة من هذه الواجهة؛ تُدار عبر مزود الهوية لتجنب تعطيل الدخول.",
              "Authentication methods cannot be changed here; they are managed through the identity provider to avoid locking users out.",
            )}
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => void revokeAllSessions()}
        title={L("إلغاء جميع الجلسات", "Revoke all sessions")}
        message={L(
          "سيتم إنهاء جلسات جميع المستخدمين في مزود الهوية، وسيحتاج كل مستخدم إلى تسجيل الدخول مجدداً.",
          "Every user's session at the identity provider will be terminated and each user must sign in again.",
        )}
        confirmText={L("إلغاء الجلسات", "Revoke sessions")}
        danger
      />
    </div>
  );
}

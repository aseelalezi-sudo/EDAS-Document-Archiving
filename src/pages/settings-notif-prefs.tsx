import { useEffect, useState } from "react";
import { Clock, Info, Save } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Field, Input, Checkbox } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { domainApi } from "../lib/domain-api";

interface ChannelPrefs {
  inapp: boolean;
  email: boolean;
}

const EVENTS = [
  { key: "document-sent", ar: "إرسال وثيقة", en: "Document sent" },
  { key: "approval-assigned", ar: "تعيين موافقة", en: "Approval assigned" },
  { key: "approval-result", ar: "نتيجة الموافقة", en: "Approval result" },
  { key: "rejection", ar: "الرفض", en: "Rejection" },
  { key: "reassignment", ar: "إعادة التعيين", en: "Reassignment" },
  { key: "retention-warning", ar: "تحذير الاحتفاظ", en: "Retention warning" },
  { key: "legal-hold", ar: "حجز قانوني", en: "Legal hold" },
  { key: "report-ready", ar: "جاهزية تقرير", en: "Report ready" },
  { key: "security-alert", ar: "تنبيه أمني", en: "Security alert" },
];

const DIGEST_MODES = [
  { id: "immediate", ar: "فوري", en: "Immediate" },
  { id: "daily", ar: "ملخص يومي", en: "Daily digest" },
  { id: "weekly", ar: "ملخص أسبوعي", en: "Weekly digest" },
  { id: "off", ar: "إيقاف", en: "Off" },
];

const DEFAULT_PREFS: Record<string, ChannelPrefs> = Object.fromEntries(EVENTS.map((event) => [event.key, { inapp: true, email: false }]));
const STORAGE_KEY = "edas.v1.notificationPreferences";

interface StoredPreferences {
  channels: Record<string, ChannelPrefs>;
  digest: string;
  quiet: { start: string; end: string };
}

function readLocal(): StoredPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPreferences) : null;
  } catch {
    return null;
  }
}

export function NotifPrefs() {
  const { t, lang, toast, apiMode } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [channels, setChannels] = useState<Record<string, ChannelPrefs>>(DEFAULT_PREFS);
  const [digest, setDigest] = useState("immediate");
  const [quiet, setQuiet] = useState({ start: "22:00", end: "07:00" });
  const [loading, setLoading] = useState(apiMode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (stored: { channels?: Record<string, ChannelPrefs>; digest?: string; quiet?: { start: string; end: string } }) => {
      if (cancelled) return;
      if (stored.channels) setChannels({ ...DEFAULT_PREFS, ...stored.channels });
      if (stored.digest) setDigest(stored.digest);
      if (stored.quiet) setQuiet(stored.quiet);
    };

    if (!apiMode) {
      const local = readLocal();
      if (local) apply(local);
      setLoading(false);
      return;
    }

    domainApi
      .myPreferences()
      .then(({ items }) => {
        const asChannels = items["notifications"];
        const asDigest = items["notifications-digest"];
        const asQuiet = items["notifications-quiet"];
        apply({
          channels: asChannels && typeof asChannels === "object" ? (asChannels as Record<string, ChannelPrefs>) : undefined,
          digest: typeof asDigest === "string" ? asDigest : undefined,
          quiet: asQuiet && typeof asQuiet === "object" ? (asQuiet as { start: string; end: string }) : undefined,
        });
      })
      .catch(() => {
        if (!cancelled) toast({ type: "error", title: t("err.api") });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, t, toast]);

  const save = async () => {
    if (!apiMode) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ channels, digest, quiet }));
      toast({ type: "success", title: L("تم حفظ التفضيلات", "Preferences saved") });
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        domainApi.putMyPreference("notifications", channels),
        domainApi.putMyPreference("notifications-digest", digest),
        domainApi.putMyPreference("notifications-quiet", quiet),
      ]);
      toast({
        type: "success",
        title: L("تم حفظ التفضيلات", "Preferences saved"),
        message: L("حُفظت في ملفك كمرجع؛ لا يفرضها الخادم.", "Saved to your profile for reference; the server does not enforce them."),
      });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setSaving(false);
    }
  };

  const setChannel = (key: string, channel: keyof ChannelPrefs, value: boolean) => {
    setChannels((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { inapp: true, email: false }), [channel]: value } }));
  };

  return (
    <div>
      <PageHeader
        title={t("nav.notifPrefs")}
        description={L("تحكّم في قنوات وتوقيت كل حدث", "Control channels and timing for each event")}
        breadcrumbs={[{ label: t("nav.settings") }, { label: t("nav.notifPrefs") }]}
        actions={
          <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={save} disabled={loading || saving}>
            {t("g.save")}
          </Button>
        }
      />
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-navy-50 px-4 py-2.5 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {L(
          "تُحفظ هذه التفضيلات في ملفك الشخصي كمرجع فقط؛ لا يقرأها الخادم عند إنشاء الإشعارات، ولا يوجد إرسال بريد إلكتروني أو محرك تلخيص في النظام. إشعارات التطبيق تُنشأ حالياً لكل الأحداث بغضّ النظر عن هذا الجدول.",
          "These preferences are stored in your profile for reference only: the server does not consult them when creating notifications, and there is no email delivery or digest engine. In-app notifications are currently created for every event regardless of this table.",
        )}
      </div>
      <Card pad={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-xs text-ink-400 dark:border-ink-800">
              <th className="p-3 text-start">{L("الحدث", "Event")}</th>
              <th className="p-3 text-center">{L("داخل التطبيق", "In-app")}</th>
              <th className="p-3 text-center">{L("البريد الإلكتروني (غير متاح)", "Email (unavailable)")}</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((event) => {
              const pref = channels[event.key] ?? { inapp: true, email: false };
              return (
                <tr key={event.key} className="border-b border-ink-100 text-center dark:border-ink-800/60">
                  <td className="p-3 text-start text-ink-700 dark:text-ink-200">{lang === "en" ? event.en : event.ar}</td>
                  <td className="p-3">
                    <Checkbox
                      checked={pref.inapp}
                      onChange={(v) => setChannel(event.key, "inapp", v)}
                      label={`${lang === "en" ? event.en : event.ar} — ${L("داخل التطبيق", "In-app")}`}
                    />
                  </td>
                  <td className="p-3">
                    <span
                      aria-hidden="true"
                      title={L("لا يوجد إرسال بريد إلكتروني في النظام", "Email delivery is not available")}
                      className="mx-auto flex h-5 w-5 items-center justify-center rounded-md border-2 border-dashed border-ink-200 dark:border-ink-700"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card className="mt-4">
        <SectionTitle title={L("خيارات التلخيص", "Digest options")} icon={<Clock className="h-4 w-4 text-navy-500" />} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DIGEST_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setDigest(mode.id)}
              aria-pressed={digest === mode.id}
              className={cn(
                "rounded-lg border-2 p-3 text-sm",
                digest === mode.id
                  ? "border-navy-600 bg-navy-50 text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                  : "border-ink-200 text-ink-500 dark:border-ink-700",
              )}
            >
              {lang === "en" ? mode.en : mode.ar}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={L("بداية ساعات الهدوء", "Quiet hours start")}>
            <Input type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />
          </Field>
          <Field label={L("نهاية ساعات الهدوء", "Quiet hours end")}>
            <Input type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />
          </Field>
        </div>
        {digest === "off" && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {L(
              "اختيار «إيقاف» يُحفظ كمرجع فقط؛ لا يوجد محرك تلخيص ينفّذه، وتبقى إشعارات التطبيق تُنشأ كما هي.",
              'Choosing "Off" is stored for reference only; no digest engine runs it, and in-app notifications are still created as before.',
            )}
          </p>
        )}
      </Card>
    </div>
  );
}

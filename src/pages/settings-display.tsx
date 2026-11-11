import { useNavigate } from "react-router-dom";
import { Monitor, Sun, Moon, Globe, Bell, Languages, RotateCcw } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
export function Display() {
  const { t, lang, setLang, theme, setTheme, density, setDensity, toast } = useApp();
  const navigate = useNavigate();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div>
      <PageHeader
        title={t("nav.display")}
        description={L("اللغة والاتجاه والنمط وكثافة العرض", "Language, direction, theme, and display density")}
        breadcrumbs={[{ label: t("nav.settings") }, { label: t("nav.display") }]}
        actions={
          <Button
            size="sm"
            variant="outline"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              setLang("ar");
              setTheme("light");
              setDensity("comfortable");
              toast({ type: "success", title: L("تمت إعادة الضبط", "Preferences reset") });
            }}
          >
            {L("إعادة الضبط", "Reset")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title={L("اللغة والاتجاه", "Language & direction")} icon={<Languages className="h-4 w-4 text-navy-500" />} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={lang === "ar"}
              onClick={() => setLang("ar")}
              className={cn(
                "rounded-xl border-2 p-4 text-center",
                lang === "ar" ? "border-navy-600 bg-navy-50 dark:bg-navy-900/40" : "border-ink-200 dark:border-ink-700",
              )}
            >
              <Globe className="mx-auto h-6 w-6 text-navy-500" />
              <p className="mt-2 font-medium text-ink-700 dark:text-ink-200">{L("العربية", "Arabic")}</p>
              <p className="text-xs text-ink-400">{L("RTL · من اليمين لليسار", "RTL · Right to left")}</p>
            </button>
            <button
              type="button"
              aria-pressed={lang === "en"}
              onClick={() => setLang("en")}
              className={cn(
                "rounded-xl border-2 p-4 text-center",
                lang === "en" ? "border-navy-600 bg-navy-50 dark:bg-navy-900/40" : "border-ink-200 dark:border-ink-700",
              )}
            >
              <Globe className="mx-auto h-6 w-6 text-navy-500" />
              <p className="mt-2 font-medium text-ink-700 dark:text-ink-200">English</p>
              <p className="text-xs text-ink-400">LTR · Left to Right</p>
            </button>
          </div>
        </Card>
        <Card>
          <SectionTitle title={L("النمط", "Theme")} icon={<Monitor className="h-4 w-4 text-navy-500" />} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
              className={cn(
                "rounded-xl border-2 p-4 text-center",
                theme === "light" ? "border-navy-600 bg-navy-50 dark:bg-navy-900/40" : "border-ink-200 dark:border-ink-700",
              )}
            >
              <Sun className="mx-auto h-6 w-6 text-amber-500" />
              <p className="mt-2 text-sm font-medium">{L("فاتح", "Light")}</p>
            </button>
            <button
              type="button"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
              className={cn(
                "rounded-xl border-2 p-4 text-center",
                theme === "dark" ? "border-navy-600 bg-navy-50 dark:bg-navy-900/40" : "border-ink-200 dark:border-ink-700",
              )}
            >
              <Moon className="mx-auto h-6 w-6 text-navy-300" />
              <p className="mt-2 text-sm font-medium">{L("داكن", "Dark")}</p>
            </button>
          </div>
        </Card>
        <Card>
          <SectionTitle title={L("كثافة العرض", "Display density")} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={density === "comfortable"}
              onClick={() => setDensity("comfortable")}
              className={cn(
                "rounded-xl border-2 p-4 text-center",
                density === "comfortable" ? "border-navy-600 bg-navy-50 dark:bg-navy-900/40" : "border-ink-200 dark:border-ink-700",
              )}
            >
              <div className="mx-auto space-y-1.5">
                <div className="h-1.5 w-16 rounded bg-ink-300" />
                <div className="h-1.5 w-16 rounded bg-ink-300" />
              </div>
              <p className="mt-2 text-sm font-medium">{L("مريحة", "Comfortable")}</p>
            </button>
            <button
              type="button"
              aria-pressed={density === "compact"}
              onClick={() => setDensity("compact")}
              className={cn(
                "rounded-xl border-2 p-4 text-center",
                density === "compact" ? "border-navy-600 bg-navy-50 dark:bg-navy-900/40" : "border-ink-200 dark:border-ink-700",
              )}
            >
              <div className="mx-auto space-y-0.5">
                <div className="h-1 w-16 rounded bg-ink-300" />
                <div className="h-1 w-16 rounded bg-ink-300" />
              </div>
              <p className="mt-2 text-sm font-medium">{L("مضغوطة", "Compact")}</p>
            </button>
          </div>
        </Card>
        <Card>
          <SectionTitle title={L("تفضيلات إضافية", "Additional preferences")} />
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {L(
              "عدد الصفوف في الجداول وصيغة التاريخ إعدادان مرجعيان على مستوى النظام يضبطهما مدير النظام من «إعدادات النظام»، ولا يغيّران هذه الصفحة؛ وليست تفضيلات شخصية. أما تنسيق الوقت وعرض الوثائق الافتراضي فلا يوجد لهما إعداد في النظام.",
              'Row limits and the date format are reference values at system level configured by a system administrator under "System settings"; they do not change this page and are not personal preferences. Time format and the default document view have no setting in the system.',
            )}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/admin/system")}>
            {t("nav.system")}
          </Button>
        </Card>
      </div>
      <Card className="mt-4 flex items-center gap-3">
        <Bell className="h-5 w-5 text-navy-500" />
        <p className="flex-1 text-sm text-ink-600 dark:text-ink-300">
          {L(
            "اللغة والنمط والكثافة تُحفظ في هذا المتصفح فقط (localStorage) ولا تُخزَّن في حسابك على الخادم؛ استخدم الزر لعرض الواجهة بالإنجليزية.",
            "Language, theme, and density are saved in this browser only (localStorage) and are not stored in your server account; use the button to preview the English interface.",
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLang("en");
            navigate("/dashboard");
          }}
        >
          {L("عرض شاشة إنجليزية LTR", "View English LTR screen")}
        </Button>
      </Card>
    </div>
  );
}

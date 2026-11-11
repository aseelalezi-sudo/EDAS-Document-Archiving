import { useNavigate } from "react-router-dom";
import { Files, Clock3, AlertTriangle, Users, TrendingUp } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card } from "../components/ui";
import { PageHeader, StatCard, SectionTitle, Progress, downloadCsv } from "../components/shared";
import { DonutChart, BarChartCard } from "../components/charts";
import { departments, CLASSIFICATION_META } from "../data";
import { hasAccess } from "../components/nav-config";
import { useDocsStore } from "../store-docs";
import { config } from "../config";

const CLASSIFICATION_KEYS: Record<string, keyof typeof CLASSIFICATION_META> = {
  PUBLIC: "public",
  INTERNAL: "internal",
  CONFIDENTIAL: "confidential",
  RESTRICTED: "restricted",
  TOPSECRET: "topsecret",
};
const CATEGORY_COLORS = ["#4f46e5", "#14a89c", "#6366f1", "#818cf8", "#f59e0b"];

export function DepartmentDashboard() {
  const { t, lang, user, role } = useApp();
  const navigate = useNavigate();
  const apiMode = config.useApi;
  const { summary, departments: deptStore, tasks: taskList, scopedDocs, retention, docsReady } = useDocsStore();
  const archivedCount = summary?.documents.byStatus.ARCHIVED ?? 0;
  const pendingApprovals = summary?.approvals.pending ?? 0;
  const totalDocs = summary?.documents.total ?? scopedDocs.length;
  const archivedShare = totalDocs > 0 ? Math.round((archivedCount / totalDocs) * 100) : 0;
  const breachedTasks = taskList.filter((task) => task.slaStatus === "breached");
  const dueRetention = summary
    ? summary.retention.overdue
    : retention.filter((item) => item.reviewStatus === "pending" && item.daysLeft <= 0).length;
  const canReviewRetention = hasAccess(role, "/policies/retention-queue");
  const topUsers = Object.entries(
    scopedDocs.reduce<Record<string, number>>((counts, doc) => {
      const owner = doc.owner || "—";
      counts[owner] = (counts[owner] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const topUserMax = topUsers.length > 0 ? topUsers[0][1] : 0;
  const departmentOptions = apiMode ? deptStore.items : departments;

  const deptData = departmentOptions.slice(0, 6).map((d) => ({ name: d.code, value: d.docs }));
  const categoryData =
    apiMode && summary
      ? Object.entries(summary.documents.byClassification).map(([key, value], index) => {
          const meta = CLASSIFICATION_META[CLASSIFICATION_KEYS[key] ?? "internal"];
          return { name: t(meta.key), value, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] };
        })
      : [];

  if (!docsReady) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label={t("g.loading")}>
        <div className="h-10 w-56 animate-pulse rounded-xl bg-ink-200/70 dark:bg-ink-800/70" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70 lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
          <div className="h-64 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("nav.dashboardDept")}
        description={t("dash.deptDesc")}
        breadcrumbs={[{ label: t("nav.dashboard") }, { label: t("nav.dashboardDept") }]}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv("edas-department-summary", [
                {
                  department: departmentOptions.find((d) => d.id === (user?.department ?? ""))?.name ?? "—",
                  archived: archivedCount,
                  pendingApprovals,
                  overdueTasks: breachedTasks.length,
                  archivedSharePercent: archivedShare,
                },
              ])
            }
          >
            {t("g.export")}
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("dash.deptArchived")} value={archivedCount} icon={<Files className="h-5 w-5" />} accent="navy" />
        <StatCard label={t("dash.kpiApprovals")} value={pendingApprovals} icon={<Clock3 className="h-5 w-5" />} accent="amber" />
        <StatCard label={t("dash.overdueTasks")} value={breachedTasks.length} icon={<TrendingUp className="h-5 w-5" />} accent="teal" />
        <StatCard label={t("dash.deptActivity")} value={`${archivedShare}%`} icon={<Users className="h-5 w-5" />} accent="purple" />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title={t("dash.chartByDept")} icon={<Files className="h-4 w-4 text-navy-500" />} />
          {deptData.some((item) => item.value > 0) ? (
            <BarChartCard
              data={deptData}
              xKey="name"
              bars={[{ key: "value", name: lang === "en" ? "Documents" : "الوثائق", color: "#4f46e5" }]}
            />
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-ink-400">{t("dash.noChartData")}</div>
          )}
        </Card>
        <Card>
          <SectionTitle title={t("dash.chartByCat")} />
          {categoryData.length > 0 ? (
            <DonutChart data={categoryData} />
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-ink-400">{t("dash.noChartData")}</div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card pad={false}>
          <div className="px-4 pt-4">
            <SectionTitle title={t("dash.topUsers")} icon={<Users className="h-4 w-4 text-navy-500" />} />
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {topUsers.length === 0 && <p className="px-4 py-8 text-center text-xs text-ink-400">{t("dash.noData")}</p>}
            {topUsers.map(([owner, count], i) => {
              const initials = owner
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part.charAt(0))
                .join("");
              return (
                <div key={owner} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-ink-400">{i + 1}</span>
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white",
                      ["bg-navy-600", "bg-teal-600", "bg-purple-600", "bg-amber-600"][i % 4],
                    )}
                  >
                    {initials}
                  </span>
                  <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{owner}</span>
                  <div className="ms-auto flex items-center gap-2">
                    <Progress value={topUserMax > 0 ? (count / topUserMax) * 100 : 0} className="w-24" color="bg-navy-500" />
                    <span className="w-10 text-end text-sm font-semibold text-ink-700 dark:text-ink-200">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card pad={false}>
          <div className="px-4 pt-4">
            <SectionTitle title={t("dash.bottlenecks")} icon={<AlertTriangle className="h-4 w-4 text-rose-500" />} />
          </div>
          <div className="space-y-3 p-4">
            {breachedTasks.length === 0 && (
              <p className="rounded-lg border border-ink-100 bg-ink-50/60 p-3 text-xs text-ink-400 dark:border-ink-800 dark:bg-ink-950/40">
                {t("dash.noBottlenecks")}
              </p>
            )}
            {breachedTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-900/40 dark:bg-rose-950/20"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{task.docTitle}</p>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                    {t("dash.overdue")} {task.age}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-400">
                  {t("dash.stuckAt")}: {task.step} · {task.from}
                </p>
                <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => navigate(`/workflow/${task.id}`)}>
                  {t("dash.followTask")}
                </Button>
              </div>
            ))}
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{t("dash.retentionRisk")}</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  {dueRetention}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-400">{t("dash.retentionRiskDesc")}</p>
              {canReviewRetention && (
                <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => navigate("/policies/retention-queue")}>
                  {lang === "en" ? "Open retention queue" : "فتح طابور الاحتفاظ"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

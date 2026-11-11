import { type ReactNode, useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  DraftingCompass,
  Folder,
  FolderOpen,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  MoreHorizontal,
  Download,
  ChevronDown,
  Printer,
  FileType2,
  Home,
  GripVertical,
  Check,
} from "lucide-react";
import { useApp } from "../store";
import { cn, Avatar, Badge, Checkbox, Tooltip, Button, EmptyState, Card, LoadingState } from "./ui";
import type { FileType } from "../types";

/* ---------------- Breadcrumbs ---------------- */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  const { t } = useApp();
  return (
    <nav className="flex items-center gap-1 text-[13px] text-ink-400">
      <Home className="h-3.5 w-3.5" />
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronLeft className="mx-0.5 h-3.5 w-3.5 flip-x" />
          {it.to && i < items.length - 1 ? (
            <Link to={it.to} className="transition-colors hover:text-navy-600 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className={cn("transition-colors", i === items.length - 1 && "font-semibold text-ink-700 dark:text-ink-200")}>
              {it.label}
            </span>
          )}
        </span>
      ))}
      <span className="sr-only">{t("app.name")}</span>
    </nav>
  );
}

/* ---------------- PageHeader ---------------- */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && <div className="mb-2.5">{<Breadcrumbs items={breadcrumbs} />}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------------- FileIcon ---------------- */
const FILE_META: Record<FileType, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20" },
  image: {
    icon: ImageIcon,
    color: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20",
  },
  office: {
    icon: FileSpreadsheet,
    color: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
  },
  cad: { icon: DraftingCompass, color: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20" },
  text: { icon: FileType2, color: "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300" },
};

export function FileIcon({ type, size = "md" }: { type: FileType; size?: "sm" | "md" | "lg" }) {
  const meta = FILE_META[type] ?? FILE_META.text;
  const Icon = meta.icon;
  const sizes = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-16 w-16" };
  const icons = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" };
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl ring-1", meta.color, sizes[size])}>
      <Icon className={icons[size]} />
    </span>
  );
}

export function FolderIcon({ open, className }: { open?: boolean; className?: string }) {
  const Icon = open ? FolderOpen : Folder;
  return <Icon className={cn("h-5 w-5 text-navy-500", className)} />;
}

/* ---------------- StatCard / KPI ---------------- */
export function StatCard({
  label,
  value,
  delta,
  trend,
  icon,
  accent = "navy",
  hint,
}: {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon: ReactNode;
  accent?: "navy" | "teal" | "emerald" | "amber" | "rose" | "purple";
  hint?: string;
}) {
  const accents: Record<string, string> = {
    navy: "from-navy-500 to-navy-700 shadow-navy-600/30",
    teal: "from-teal-500 to-teal-600 shadow-teal-500/30",
    emerald: "from-emerald-500 to-emerald-600 shadow-emerald-500/30",
    amber: "from-amber-400 to-amber-600 shadow-amber-500/30",
    rose: "from-rose-500 to-rose-600 shadow-rose-500/30",
    purple: "from-purple-500 to-purple-700 shadow-purple-600/30",
  };
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-400"
      : trend === "down"
        ? "text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-400"
        : "text-ink-500 bg-ink-100 dark:bg-ink-800";
  const glowColors: Record<string, string> = {
    navy: "#6366f1",
    teal: "#2ec7bb",
    emerald: "#34d399",
    amber: "#fbbf24",
    rose: "#fb7185",
    purple: "#a78bfa",
  };
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-4 shadow-soft transition-all hover:shadow-card dark:border-ink-800 dark:bg-ink-900/80">
      <div
        className="pointer-events-none absolute -end-10 -top-10 h-28 w-28 rounded-full opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
        style={{ background: glowColors[accent] }}
      />
      <div className="relative flex items-start justify-between">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform group-hover:scale-105",
            accents[accent],
          )}
        >
          {icon}
        </span>
        {delta && (
          <span className={cn("flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-bold", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {delta}
          </span>
        )}
      </div>
      <p className="mt-3 text-[26px] font-extrabold leading-tight text-ink-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-[13px] font-medium text-ink-500 dark:text-ink-400">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/* ---------------- DataTable ---------------- */
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  width?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  selectable,
  selected,
  onSelectedChange,
  onRowClick,
  onRowDoubleClick,
  onRowContext,
  rowActions,
  empty,
  stickyHead,
  compact,
  pageSize = 10,
  sortable = true,
  loading,
}: {
  columns: Column<T>[];
  rows: T[];
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  onRowContext?: (e: React.MouseEvent, row: T) => void;
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  stickyHead?: boolean;
  compact?: boolean;
  pageSize?: number;
  sortable?: boolean;
  loading?: boolean;
}) {
  const { density, t } = useApp();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const useCompact = compact !== undefined ? compact : density === "compact";
  const allChecked = selectable && rows.length > 0 && selected?.length === rows.length;
  const toggleAll = () => onSelectedChange?.(allChecked ? [] : rows.map((r) => r.id));
  const toggleOne = (id: string) =>
    onSelectedChange?.(selected?.includes(id) ? selected.filter((x) => x !== id) : [...(selected ?? []), id]);

  const sortBy = (col: Column<T>) => {
    if (!sortable || !col.sortValue) return;
    if (sortKey === col.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ar");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  if (loading)
    return (
      <Card pad={false}>
        <LoadingState rows={pageSize} />
      </Card>
    );
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-soft dark:border-ink-800 dark:bg-ink-900/80">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className={cn(stickyHead && "sticky top-0 z-10")}>
            <tr className="border-b border-ink-100 bg-ink-50/70 text-start dark:border-ink-800 dark:bg-ink-950/50">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <Checkbox checked={!!allChecked} onChange={toggleAll} />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => sortBy(c)}
                  className={cn(
                    "px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wider text-ink-400 select-none",
                    c.width,
                    sortable && c.sortValue && "cursor-pointer transition-colors hover:text-navy-600",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sortable &&
                      c.sortValue &&
                      (sortKey === c.key ? (
                        <ChevronDown className={cn("h-3 w-3 text-navy-500 transition-transform", sortDir === "asc" && "rotate-180")} />
                      ) : (
                        <span className="text-ink-300">⇅</span>
                      ))}
                  </span>
                </th>
              ))}
              {rowActions && <th className="w-14 px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => {
              const checked = selected?.includes(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  onDoubleClick={() => onRowDoubleClick?.(row)}
                  onContextMenu={(e) => onRowContext?.(e, row)}
                  className={cn(
                    "group/row border-b border-ink-50 transition-colors last:border-0 hover:bg-navy-50/50 dark:border-ink-800/50 dark:hover:bg-navy-500/5",
                    onRowClick && "cursor-pointer",
                    checked && "bg-navy-50/60 dark:bg-navy-500/10",
                  )}
                >
                  {selectable && (
                    <td className="px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={!!checked} onChange={() => toggleOne(row.id)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn("text-ink-700 dark:text-ink-200", useCompact ? "px-4 py-2" : "px-4 py-3", c.className)}>
                      {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 opacity-60 transition-opacity group-hover/row:opacity-100" onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 dark:border-ink-800">
          <span className="text-[11px] font-medium text-ink-400">
            {t("g.pageOf", { c: safePage, t: totalPages })} · {sorted.length} {t("g.items")}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(1)}>
              «
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("g.previous")}
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const n = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
              if (n > totalPages) return null;
              return (
                <Button
                  key={n}
                  variant={n === safePage ? "primary" : "outline"}
                  size="sm"
                  className="h-7 w-7 p-0 text-xs"
                  onClick={() => setPage(n)}
                >
                  {n}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("g.next")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={safePage >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              »
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Row action menu ---------------- */
export function RowMenu({ items }: { items: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const { t } = useApp();
  return (
    <div className="relative">
      <Tooltip label={t("g.actions")}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t("g.rowOptions")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute end-0 z-30 mt-1 min-w-48 overflow-hidden rounded-xl border border-ink-200/80 bg-white py-1.5 shadow-float animate-scale-in dark:border-ink-800 dark:bg-ink-900"
          >
            {items.map((it, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition-colors hover:bg-ink-50 dark:hover:bg-ink-800",
                  it.danger ? "text-rose-600 dark:text-rose-400" : "text-ink-700 dark:text-ink-200",
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Toolbar ---------------- */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900/80">
      {children}
    </div>
  );
}

/* ---------------- CSV download helper ---------------- */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Export Menu ---------------- */
export function ExportMenu({
  label,
  rows,
  filename,
  loadRows,
}: {
  label?: string;
  rows?: Record<string, unknown>[];
  filename?: string;
  loadRows?: () => Promise<Record<string, unknown>[]>;
}) {
  const [open, setOpen] = useState(false);
  const { toast, lang, t } = useApp();
  const text = label ?? t("g.export");
  const handle = async (kind: string) => {
    if (kind === "CSV") {
      let data: Record<string, unknown>[];
      try {
        data = loadRows ? await loadRows() : (rows ?? []);
      } catch {
        toast({ type: "error", title: lang === "en" ? "Export failed" : "تعذّر التصدير" });
        return;
      }
      if (data.length === 0) {
        toast({
          type: "info",
          title: lang === "en" ? "Nothing to export" : "لا توجد بيانات للتصدير",
          message: lang === "en" ? "No rows match the current filters." : "لا توجد صفوف مطابقة للفلاتر الحالية.",
        });
        return;
      }
      downloadCsv(`${filename ?? "edas-export"}.csv`, data);
      toast({
        type: "success",
        title: lang === "en" ? "CSV downloaded" : "تم تنزيل CSV",
        message: `${data.length} ${lang === "en" ? "rows" : "صف"}`,
      });
      return;
    }
    window.print();
  };
  const items = [
    { icon: <FileType2 className="h-4 w-4" />, label: "CSV" },
    { icon: <Printer className="h-4 w-4" />, label: lang === "en" ? "Print" : "طباعة" },
  ];
  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        aria-label={text}
        icon={<Download className="h-4 w-4" aria-hidden="true" />}
        onClick={() => setOpen((o) => !o)}
      >
        {text}
      </Button>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-ink-200/80 bg-white py-1.5 shadow-float animate-scale-in dark:border-ink-800 dark:bg-ink-900">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  handle(it.label);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm text-ink-700 transition-colors hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Activity Timeline ---------------- */
export function Timeline({
  items,
}: {
  items: { id: string; title: string; subtitle?: string; time: string; icon?: ReactNode; done?: boolean; current?: boolean }[];
}) {
  return (
    <ol className="relative space-y-5">
      {items.map((it, i) => (
        <li key={it.id} className="flex gap-3.5">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white dark:ring-ink-900",
                it.current
                  ? "bg-navy-600 text-white shadow-glow"
                  : it.done
                    ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-soft shadow-emerald-500/30"
                    : "bg-ink-100 text-ink-400 dark:bg-ink-800",
              )}
            >
              {it.icon ?? (it.done ? <Check className="h-4 w-4" /> : i + 1)}
            </span>
            {i < items.length - 1 && <span className="w-px flex-1 bg-ink-200 dark:bg-ink-700" />}
          </div>
          <div className="flex-1 pb-1">
            <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{it.title}</p>
            {it.subtitle && <p className="text-xs text-ink-400">{it.subtitle}</p>}
            <p className="mt-0.5 text-xs text-ink-400">{it.time}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Metadata Grid ---------------- */
export function MetaGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{it.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink-800 dark:text-ink-100">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-ink-200 bg-ink-50 p-1 dark:border-ink-700 dark:bg-ink-950">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
            value === o.value
              ? "bg-white text-navy-700 shadow-soft dark:bg-ink-800 dark:text-navy-300"
              : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-200",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Section Title ---------------- */
export function SectionTitle({ title, action, icon }: { title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink-800 dark:text-ink-100">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}

/* ---------------- UserChip ---------------- */
export function UserChip({ name, initials, color }: { name: string; initials: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar initials={initials} color={color} size="xs" />
      <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{name}</span>
    </span>
  );
}

/* ---------------- Progress bar ---------------- */
export function Progress({ value, className, color = "bg-navy-600" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export { GripVertical, Badge };
export { EmptyState };

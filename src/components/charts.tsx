import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useApp } from "../store";
import { Card } from "./ui";
import type { ReactNode } from "react";
import { SectionTitle } from "./shared";

const axis = { fontSize: 11, fill: "#8592a9" };

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  fill?: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-ink-700 dark:bg-ink-900">
      {label && <p className="mb-1 font-semibold text-ink-700 dark:text-ink-200">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-ink-500 dark:text-ink-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-ink-700 dark:text-ink-100">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function UploadTrendChart({ data }: { data: readonly object[] }) {
  const { lang } = useApp();
  const docsName = lang === "en" ? "Uploaded" : "وثائق مرفوعة";
  const archName = lang === "en" ? "Archived" : "مؤرشفة";
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gDocs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gArch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#14a89c" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#14a89c" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
        <XAxis dataKey={lang === "en" ? "mEn" : "m"} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <RTooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="docs" name={docsName} stroke="#4f46e5" strokeWidth={2.5} fill="url(#gDocs)" />
        <Area type="monotone" dataKey="archived" name={archName} stroke="#14a89c" strokeWidth={2.5} fill="url(#gArch)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarChartCard({
  data,
  xKey,
  bars,
  height = 240,
}: {
  data: readonly object[];
  xKey: string;
  bars: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barSize={28}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <RTooltip content={<ChartTooltip />} cursor={{ fill: "#1e3a7a0d" }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedBarChartCard({
  data,
  xKey,
  bars,
  height = 240,
}: {
  data: readonly object[];
  xKey: string;
  bars: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barSize={36}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <RTooltip content={<ChartTooltip />} cursor={{ fill: "#1e3a7a0d" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} stackId="a" fill={b.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartCard({
  data,
  lines,
  height = 240,
}: {
  data: readonly object[];
  lines: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
        <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <RTooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2.5} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 240 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} stroke="none" />
          ))}
        </Pie>
        <RTooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ChartCard({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <SectionTitle title={title} action={action} />
      {children}
    </Card>
  );
}

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 92 + 4},${28 - ((v - min) / range) * 22}`).join(" ");
  const lastY = 28 - ((data[data.length - 1] - min) / range) * 22;
  return (
    <svg viewBox="0 0 100 30" className="h-7 w-full" preserveAspectRatio="none">
      <polygon points={`0,30 ${pts} 100,30`} fill={color} opacity="0.1" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="96" cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

/* ---------------- Radial gauge ---------------- */
export function RadialGauge({ value, sub }: { value: number; sub: string }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="11" className="stroke-ink-100 dark:stroke-ink-800" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - value / 100)}
          stroke="url(#gaugeGrad)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }}
        />
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#14a89c" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-ink-900 dark:text-white">{value}%</span>
        <span className="text-[10px] font-bold text-ink-400">{sub}</span>
      </div>
    </div>
  );
}

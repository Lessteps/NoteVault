// Tiny SVG charts shared by Proyectos, Metas, Finanzas and Ejercicio.

import { cn } from "../ui";

export function Sparkline({ values, colour, width = 80, height = 22 }: {
  values: number[]; colour: string; width?: number; height?: number;
}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  return (
    <svg width={width} height={height} aria-hidden className="flex-none">
      <polyline points={pts.join(" ")} fill="none" stroke={colour} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Smooth curved sparkline with gradient fill for stat cards (matching Vista General redesign). */
export function SmoothSparkline({
  values,
  colour,
  width = 140,
  height = 36,
  strokeWidth = 2.5,
  fill = true,
  className,
}: {
  values?: number[];
  colour: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
}) {
  // Generate stable sanitized ID for gradient
  const gradId = `spark-grad-${colour.replace(/[^a-zA-Z0-9]/g, "")}-${width}-${height}`;
  const ptsData = values && values.length >= 2 ? values : [3, 5, 4, 8, 7, 10, 8, 12];
  const max = Math.max(1, ...ptsData);
  const min = Math.min(...ptsData);
  const range = max - min || 1;
  const step = width / (ptsData.length - 1);
  const coords: Array<[number, number]> = ptsData.map((v, i) => [
    i * step,
    height - 4 - ((v - min) / range) * (height - 10),
  ]);

  let strokeD = `M ${coords[0]![0].toFixed(1)},${coords[0]![1].toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]!;
    const p1 = coords[i]!;
    const p2 = coords[i + 1]!;
    const p3 = coords[Math.min(coords.length - 1, i + 2)]!;

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    strokeD += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }

  const fillD = `${strokeD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full overflow-visible", className)}
      style={{ height }}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
          <stop offset="100%" stopColor={colour} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={fillD} fill={`url(#${gradId})`} />}
      <path
        d={strokeD}
        fill="none"
        stroke={colour}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Horizontal bars with a label and a value. */
export function BarList({ rows, max }: {
  rows: Array<{ label: string; value: number; colour?: string; hint?: string }>; max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[120px_1fr_minmax(48px,auto)] items-center gap-2 text-[12px]">
          <span className="truncate text-dim">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-elevated">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / top) * 100}%`, background: r.colour ?? "var(--nv-accent)" }} />
          </span>
          <span className="whitespace-nowrap text-right font-mono text-[11px] text-faint">{r.hint ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars (e.g. a value per week or month). */
export function Columns({ values, labels, colour, height = 120, format }: {
  values: number[]; labels: string[]; colour?: string; height?: number; format?: (v: number) => string;
}) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${labels[i]}: ${format ? format(v) : v}`}>
          <span className="w-full rounded-t-md" style={{
            height: Math.max(2, (Math.abs(v) / max) * (height - 22)),
            background: v < 0 ? "var(--nv-danger)" : colour ?? "var(--nv-accent)",
            opacity: v === 0 ? 0.25 : 1,
          }} />
          <span className="truncate font-mono text-[9.5px] text-faint">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** Line chart; null values leave a gap. Several series share one scale. */
export function LineChart({ series, labels, height = 160, format }: {
  series: Array<{ values: Array<number | null>; colour: string; dashed?: boolean; name: string }>;
  labels: string[];
  height?: number;
  format?: (v: number) => string;
}) {
  const width = 600;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(1, ...all);
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => (i / n) * (width - 10) + 5;
  const y = (v: number) => height - 18 - (v / max) * (height - 30);
  const path = (vals: Array<number | null>) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const ticks = labels.length > 1 ? [0, Math.floor(n / 2), n] : [0];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img">
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={0} x2={width} y1={y(max * t)} y2={y(max * t)} stroke="var(--nv-line)" strokeWidth={1} />
      ))}
      {series.map((s) => (
        <path key={s.name} d={path(s.values)} fill="none" stroke={s.colour} strokeWidth={2}
          strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
      ))}
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={height - 3} fontSize={10} fill="var(--nv-faint)"
          textAnchor={i === 0 ? "start" : i === n ? "end" : "middle"}>{labels[i]}</text>
      ))}
      <text x={4} y={12} fontSize={10} fill="var(--nv-faint)">{format ? format(max) : Math.round(max)}</text>
    </svg>
  );
}

export function Donut({ parts, size = 120, thickness = 16, label }: {
  parts: Array<{ value: number; colour: string; name: string }>; size?: number; thickness?: number; label?: string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--nv-elevated)" strokeWidth={thickness} />
      {total > 0 && parts.map((p) => {
        const len = (p.value / total) * c;
        const el = (
          <circle key={p.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.colour} strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{p.name}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      {label && <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--nv-text)">{label}</text>}
    </svg>
  );
}

/** Jira-like row of small blocks that fill with progress. */
export function BlockProgress({ value, colour, blocks = 12, className }: {
  value: number; colour: string; blocks?: number; className?: string;
}) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * blocks);
  return (
    <span className={cn("inline-flex gap-[2px]", className)} title={`${Math.round(value * 100)}%`}>
      {Array.from({ length: blocks }, (_, i) => (
        <span key={i} className="h-2 w-[7px] rounded-[2px]" style={{ background: i < on ? colour : "var(--nv-elevated)" }} />
      ))}
    </span>
  );
}

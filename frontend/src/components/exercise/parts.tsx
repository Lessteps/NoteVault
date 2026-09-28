// Small pieces of the Ejercicio module: the colour, the failure toast, the
// circular dashboard and the statistics panel the sidebar shows.

import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
import { Bar } from "../habits/parts";
import { pct } from "../../lib/habits";

export const ORANGE = "#ff9632";

export function useFail() {
  const toast = useApp((s) => s.toast);
  return (e: unknown) => toast("error", (e as Error).message);
}

/** A single-value dashboard: one arc, its percentage in the middle. */
export function Ring({
  value, label, sub, colour = ORANGE, size = 104, thickness = 10,
}: {
  value: number;
  label: string;
  sub?: string;
  colour?: string;
  size?: number;
  thickness?: number;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5" title={`${label}${sub ? ` · ${sub}` : ""}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--nv-elevated)" strokeWidth={thickness} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${v * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span
          className="absolute inset-0 grid place-items-center font-mono text-[15px] font-semibold text-text"
          aria-hidden="true"
        >
          {Math.round(v * 100)}%
        </span>
      </div>
      <span className="text-[11.5px] text-dim">{label}</span>
      {sub && <span className="text-[10.5px] text-faint">{sub}</span>}
    </div>
  );
}

/** The four dashboards, in the order of the periods. */
export function PeriodRings({ compact }: { compact?: boolean }) {
  const stats = useExercise((s) => s.stats);
  const rings = [
    { label: "Hoy", value: stats?.today.pct ?? 0, sub: stats ? `${stats.today.done}/${stats.today.total}` : undefined },
    { label: "Semana", value: stats?.week.pct ?? 0, sub: stats ? `${stats.week.trained}/${stats.week.due} días` : undefined },
    { label: "Mes", value: stats?.month.pct ?? 0, sub: stats ? `${stats.month.trained}/${stats.month.due} días` : undefined },
    { label: "Año", value: stats?.anual.pct ?? 0, sub: stats ? `${stats.anual.trained}/${stats.anual.due} días` : undefined },
  ];
  return (
    <div className={compact ? "grid grid-cols-4 gap-2" : "grid grid-cols-2 gap-4 sm:grid-cols-4"}>
      {rings.map((r) => (
        <Ring key={r.label} value={r.value} label={r.label} sub={r.sub} size={compact ? 62 : 104} thickness={compact ? 7 : 10} />
      ))}
    </div>
  );
}

/** The streak, with the best one of the year for context. */
export function StreakLine({ compact }: { compact?: boolean }) {
  const stats = useExercise((s) => s.stats);
  const current = stats?.streak.current ?? 0;
  const best = stats?.streak.best ?? 0;
  if (compact) {
    return (
      <span className="text-[12px] text-dim">
        Racha actual: <b className="text-text">{current}</b> {current === 1 ? "día" : "días"}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-3">
      <span className="text-[26px]">🔥</span>
      <div>
        <div className="text-[19px] font-semibold text-text">
          {current} {current === 1 ? "día" : "días"}
        </div>
        <div className="text-[11.5px] text-faint">Racha actual · mejor del año: {best}</div>
      </div>
    </div>
  );
}

/** The panel the module keeps at the bottom of its sidebar. */
export function SideStats() {
  const stats = useExercise((s) => s.stats);
  const rows: Array<[string, number]> = [
    ["Hoy", stats?.today.pct ?? 0],
    ["Semana", stats?.week.pct ?? 0],
    ["Mes", stats?.month.pct ?? 0],
    ["Año", stats?.anual.pct ?? 0],
  ];
  return (
    <div className="px-4 pt-4">
      <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Estadísticas</div>
      <div className="space-y-2.5">
        {rows.map(([l, v]) => (
          <div key={l}>
            <div className="mb-1 flex text-[12px] text-dim">
              <span>{l}</span>
              <span className="ml-auto font-mono">{pct(v)}</span>
            </div>
            <Bar value={v} colour={ORANGE} />
          </div>
        ))}
        <div className="pt-1">
          <StreakLine compact />
        </div>
      </div>
    </div>
  );
}

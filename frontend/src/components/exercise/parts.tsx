// Small pieces of the Ejercicio module: the colour, the failure toast, the
// circular dashboard and the statistics panel the sidebar shows.

import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";

export const ORANGE = "#ff9632";

/** "4x5", "3 x 12", "3x20-30m" → the leading number of series. */
export function seriesOf(prescription?: string): number {
  const m = /^\s*(\d+)\s*[x×]/i.exec(prescription ?? "");
  return m ? Number(m[1]) : 0;
}

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

type ExerciseStats = ReturnType<typeof useExercise.getState>["stats"];

/** Los cuatro paneles circulares, en el orden de los periodos. Una sola lista:
 *  la pintan `PeriodRings` y el sidebar, así que no hay dos sitios que
 *  diverjan cuando cambie un periodo. */
function periodRingDefs(stats: ExerciseStats): Array<{ label: string; value: number; sub?: string }> {
  return [
    { label: "Hoy", value: stats?.today.pct ?? 0, sub: stats ? `${stats.today.done}/${stats.today.total}` : undefined },
    { label: "Semana", value: stats?.week.pct ?? 0, sub: stats ? `${stats.week.trained}/${stats.week.due} días` : undefined },
    { label: "Mes", value: stats?.month.pct ?? 0, sub: stats ? `${stats.month.trained}/${stats.month.due} días` : undefined },
    { label: "Año", value: stats?.anual.pct ?? 0, sub: stats ? `${stats.anual.trained}/${stats.anual.due} días` : undefined },
  ];
}

/**
 * The four dashboards, in the order of the periods.
 *
 * `size`/`thickness` los usan las versiones pequeñas (tira de Vista general,
 * sidebar): por defecto son los grandes de siempre. `columns="two"` fija dos
 * columnas también en pantallas anchas —en el sidebar de 260 px cuatro anillos
 * en fila no caben—.
 */
export function PeriodRings({ size = 104, thickness = 10, columns = "auto" }: {
  size?: number; thickness?: number; columns?: "auto" | "two" | "one";
}) {
  const stats = useExercise((s) => s.stats);
  return (
    <div
      data-period-rings
      className={columns === "one"
        ? "grid grid-cols-1 gap-3"
        : columns === "two" ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-4 sm:grid-cols-4"}>
      {periodRingDefs(stats).map((r) => (
        <Ring key={r.label} value={r.value} label={r.label} sub={r.sub} size={size} thickness={thickness} />
      ))}
    </div>
  );
}

/** The streak, with the best one of the year for context. */
/**
 * La racha. `compact` sí lo usa alguien —`SideStats`, el panel del sidebar— y
 * por eso se queda; el de `PeriodRings` no lo recibía nadie y se fue.
 */
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

/**
 * The panel the module keeps at the bottom of its sidebar.
 *
 * Son los cuatro anillos en pequeño (2×2: en 260 px no caben en fila) más la
 * racha compacta. Antes eran cuatro barras con los mismos números en otro
 * formato; ahora los dicen los anillos, que se ven desde cualquier pantalla
 * del módulo y no solo desde Vista general.
 */
export function SideStats({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="space-y-3 px-4 pt-4">
      {!collapsed && (
        <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">Estadísticas</div>
      )}
      <PeriodRings size={collapsed ? 40 : 60} thickness={7} columns={collapsed ? "one" : "two"} />
      {!collapsed && <StreakLine compact />}
    </div>
  );
}

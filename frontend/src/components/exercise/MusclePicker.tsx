/**
 * Muscle map · the muscle picker used by «Gestionar ejercicios».
 *
 * One chip per muscle; clicking cycles primary → secondary → off, which keeps a
 * two-level multi-select in a space the side form can afford. A muscle can never
 * be both levels at once.
 */
import { MUSCLES, MUSCLE_GROUPS } from "../../lib/muscles";
import { cn } from "../ui";

export interface MuscleSet {
  primary: string[];
  secondary: string[];
}

export function MusclePicker({ value, onChange }: {
  value?: MuscleSet;
  onChange: (next: MuscleSet) => void;
}) {
  const current: MuscleSet = { primary: value?.primary ?? [], secondary: value?.secondary ?? [] };

  const cycle = (id: string) => {
    if (current.primary.includes(id)) {
      onChange({ primary: current.primary.filter((x) => x !== id), secondary: current.secondary });
      return;
    }
    if (current.secondary.includes(id)) {
      // Elevated to primary: the second level stays clean.
      onChange({ primary: [...current.primary, id], secondary: current.secondary.filter((x) => x !== id) });
      return;
    }
    onChange({ primary: current.primary, secondary: [...current.secondary, id] });
  };

  return (
    <div className="space-y-2">
      {MUSCLE_GROUPS.map((group) => (
        <div key={group}>
          <div className="mb-1 text-[11px] font-semibold text-dim">{group}</div>
          <div className="flex flex-wrap gap-1">
            {MUSCLES.filter((m) => m.group === group).map((m) => {
              const state = current.primary.includes(m.id) ? "primary" : current.secondary.includes(m.id) ? "secondary" : "idle";
              return (
                <button key={m.id} type="button" data-muscle-chip={m.id} data-state={state}
                  title={`${m.name_es} · ${m.view === "front" ? "anterior" : "posterior"}`}
                  onClick={() => cycle(m.id)}
                  className={cn("rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                    state === "primary" && "border-transparent font-medium text-black",
                    state === "secondary" && "border-transparent text-black/80",
                    state === "idle" && "border-line text-dim hover:bg-hover hover:text-text")}
                  style={state === "primary" ? { background: "var(--nv-muscle-primary)" }
                    : state === "secondary" ? { background: "var(--nv-muscle-secondary)" } : undefined}>
                  {m.name_es}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-faint">
        Clic para alternar: <b className="font-medium">1º principal</b> (lima) · <b className="font-medium">2º secundario</b> (lima tenue) · 3º quitar.
      </p>
    </div>
  );
}

/** Compact summary of how many muscles an exercise paints. */
export function MuscleCount({ muscles }: { muscles?: MuscleSet }) {
  const n = (muscles?.primary.length ?? 0) + (muscles?.secondary.length ?? 0);
  if (!n) {
    return <span data-muscle-count="0" title="Sin músculos: no aparecerá en el mapa"
      className="rounded px-1 text-[10.5px]" style={{ background: "var(--nv-warn-soft)", color: "var(--nv-warn)" }}>0 músculos</span>;
  }
  return (
    <span data-muscle-count={n} title={`${muscles?.primary.length ?? 0} principales · ${muscles?.secondary.length ?? 0} secundarios`}
      className="flex items-center gap-1 text-[10.5px] text-faint">
      <span className="nv-legend nv-legend--primary" style={{ height: 7, width: 7 }} />
      {n}
    </span>
  );
}

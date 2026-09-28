// Anual: el año entero de un vistazo. Es el único periodo que NO se rellena
// (a propósito): aquí solo se mira — rejilla de calor por día y desglose por
// ejercicio, sin casillas que tocar.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { useExercise } from "../../store/exercise";
import type { ExerciseOverview } from "../../lib/types";
import { inputBase, GhostButton } from "../common/forms";
import { YearGrid } from "../common/YearGrid";
import { Header } from "../habits/parts";
import { cn } from "../ui";
import { ORANGE, useFail } from "./parts";

export function Yearly() {
  const fail = useFail();
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<ExerciseOverview | null>(null);

  useEffect(() => {
    api.exOverview(year, filter).then(setData).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, filter]);

  const dayName = useMemo(
    () => (k: string) => days.find((d) => d.key === k)?.name ?? k,
    [days],
  );

  return (
    <>
      <Header title="Anual">
        <span className="text-[11.5px] text-faint">Solo lectura</span>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        <section className="rounded-xl border border-line bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className={cn(inputBase, "py-1 text-[12px]")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filtrar por ejercicio"
            >
              <option value="">⊙ Todos los días</option>
              {days.map((d) => {
                const exs = list.filter((e) => e.day === d.key);
                return exs.length ? (
                  <optgroup key={d.key} label={d.name}>
                    {exs.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            <span className="text-[11.5px] text-faint">
              {filter ? "Días en que se hizo el ejercicio" : "Cumplimiento de cada día"}
            </span>
            <span className="flex-1" />
            <GhostButton onClick={() => setYear(year - 1)}>‹</GhostButton>
            <span className="font-mono text-[12px] text-dim">{year}</span>
            <GhostButton onClick={() => setYear(year + 1)}>›</GhostButton>
          </div>
          <YearGrid year={year} values={data?.grid ?? {}} colour={ORANGE} />
        </section>

        <section>
          <div className="mb-2 text-[13px] font-semibold text-text">Desglose por ejercicio · {year}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {data?.breakdown.map((b) => (
              <div key={b.day} className="rounded-xl border border-line bg-card p-3">
                <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: ORANGE }}>
                  {dayName(b.day)}
                  <span className="ml-2 font-normal text-faint">{b.rows.length} ejercicios</span>
                </div>
                {b.rows.map((r) => {
                  const pct = r.total ? r.done / r.total : 0;
                  return (
                    <div key={r.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-dim">{r.name}</span>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: pct >= 1 ? "var(--nv-mint)" : pct >= 0.5 ? ORANGE : "var(--nv-faint)" }}
                      >
                        {r.done}/{r.total} {Math.round(pct * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

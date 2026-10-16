// Mentor — Plan, sub-vista «Temas»: TODOS los temas creados en la vault (no solo los del plan; los de fuera se marcan) con lo que existe de
// cada uno: nota de teoría, contrato de la nota, mapa (.canvas), manifiesto (.practica.md), ejercicios y puntuación de diseño; y, si están en
// el plan, su área, su semana objetivo y si se completaron. SOLO LECTURA: pulsar un tema lo abre.
//
// Cada comprobación se escribe con texto Y con icono (nunca solo con color). Los datos salen de `mentor_plan_topic_catalog`; las cuentas, los
// filtros y el orden son funciones puras de `lib/planTopicCatalog.ts`.

import { Check, CircleDashed, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import {
  branchesOf, catalogCounters, filterCatalog, MISSING_FILTERS, MISSING_LABEL, sortCatalog,
  type CatalogSort, type MissingFilter, type PlanTopicRow,
} from "../../lib/planTopicCatalog";
import { ROUTE_LABEL } from "../../lib/planRoute";
import { TOPIC_TYPE_NAME } from "../../lib/topicDesign";
import { useMentor } from "../../store/mentor";
import { Chip, input } from "../common/forms";
import { cn } from "../ui";
import { openTopic } from "./openTopic";
import { LoadState } from "./parts";
import { SectionHeading } from "./planKit";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

/** Carga el catálogo (con el reintento de la vault fría); se recarga cuando cambia el plan. */
export function usePlanTopicCatalog(planId: string) {
  const planVersion = useMentor((s) => s.planVersion);
  const [rows, setRows] = useState<PlanTopicRow[] | null>(null);
  const [error, setError] = useState("");
  const [warming, setWarming] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setError("");
    try {
      for (let i = 0; i < COLD_RETRY_MAX; i++) {
        const r = await api.mentorPlanTopicCatalog(planId);
        if (!alive.current) return;
        if (r && !r.loading) {
          setRows(r.rows ?? []);
          setWarming(false);
          return;
        }
        setWarming(true);
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        if (!alive.current) return;
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo.");
    } catch (e) {
      if (alive.current) {
        setWarming(false);
        setError((e as Error).message || "No se pudo leer el catálogo de temas.");
      }
    }
  }, [planId]);
  useEffect(() => {
    void load();
  }, [load, planVersion]);
  return { rows, error, warming, reload: () => void load() };
}

/** «Sí / Falta» con icono y texto (no solo color). `n/a` = no se pudo juzgar. */
function Check3({ ok, yes = "Sí", no = "Falta", unknown = "—" }: { ok: boolean | null; yes?: string; no?: string; unknown?: string }) {
  if (ok === null) return <span className="inline-flex items-center gap-1 text-faint"><CircleDashed size={14} aria-hidden /> {unknown}</span>;
  return ok ? (
    <span className="inline-flex items-center gap-1 text-text"><Check size={14} aria-hidden className="text-mint" /> {yes}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn"><X size={14} aria-hidden /> {no}</span>
  );
}

const COUNTERS = [
  ["topics", "Temas"],
  ["withNote", "Con nota"],
  ["withCanvas", "Con mapa"],
  ["withPractica", "Con .practica"],
  ["withExercises", "Con ejercicios"],
  ["complete", "Completos"],
] as const;

export function PlanTopicCatalog({ planId }: { planId: string }) {
  const uid = useId();
  const { rows, error, warming, reload } = usePlanTopicCatalog(planId);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [missing, setMissing] = useState<MissingFilter[]>([]);
  const [sort, setSort] = useState<CatalogSort>("plan");

  const all = rows ?? [];
  const counters = useMemo(() => catalogCounters(all), [all]);
  const branches = useMemo(() => branchesOf(all), [all]);
  const shown = useMemo(() => sortCatalog(filterCatalog(all, { query, branch, missing }), sort), [all, query, branch, missing, sort]);
  const toggle = (f: MissingFilter): void => setMissing((m) => (m.includes(f) ? m.filter((x) => x !== f) : [...m, f]));
  const chip = (on: boolean): string =>
    cn("inline-flex min-h-9 items-center rounded-lg border px-2.5 text-[13.5px] font-medium", on ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover hover:text-text");

  return (
    <section aria-labelledby={`${uid}-h`} data-testid="plan-topic-catalog" className="space-y-4">
      <SectionHeading id={`${uid}-h`} hint="Todos los temas de tu vault y lo que existe de cada uno. Solo lectura: pulsa un tema para abrirlo.">
        Temas
      </SectionHeading>
      <LoadState warming={warming} error={error} empty={!rows} onRetry={reload} />

      {rows && (
        <>
          <dl className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @4xl:grid-cols-6" data-testid="catalog-counters">
            {COUNTERS.map(([k, label]) => (
              <div key={k} className="min-w-0 rounded-xl border border-line bg-card px-3 py-2" data-testid={`catalog-count-${k}`}>
                <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
                <dd className="text-[20px] font-bold text-text">{counters[k]}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <label className="min-w-0 flex-1 basis-60 text-[13.5px] text-dim">
              Buscar tema
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, carpeta o área…" className={cn(input, "mt-1 w-full")} data-testid="catalog-search" />
            </label>
            <label className="text-[13.5px] text-dim">
              Orden
              <select value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)} className={cn(input, "mt-1 block")} data-testid="catalog-sort">
                <option value="plan">Semana del plan</option>
                <option value="folder">Orden de carpetas</option>
              </select>
            </label>
          </div>

          <div role="group" aria-label="Filtrar por rama" className="flex flex-wrap gap-1.5" data-testid="catalog-branches">
            <button type="button" aria-pressed={!branch} onClick={() => setBranch("")} className={chip(!branch)} data-testid="catalog-branch-all">Todas las ramas</button>
            {branches.map((b) => (
              <button key={b} type="button" aria-pressed={branch === b} onClick={() => setBranch(branch === b ? "" : b)} className={chip(branch === b)} data-testid={`catalog-branch-${b}`}>{b}</button>
            ))}
          </div>
          <div role="group" aria-label="Filtrar por lo que falta" className="flex flex-wrap gap-1.5" data-testid="catalog-missing">
            {MISSING_FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={missing.includes(f)} onClick={() => toggle(f)} className={chip(missing.includes(f))} data-testid={`catalog-filter-${f}`}>{MISSING_LABEL[f]}</button>
            ))}
          </div>

          <p role="status" className="text-[13.5px] text-dim" data-testid="catalog-shown">
            Mostrando {shown.length} de {all.length} temas.
          </p>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim" data-testid="catalog-empty">
              {all.length === 0 ? "Todavía no hay temas en la vault." : "Ningún tema cumple el filtro."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[56rem] border-collapse text-left text-[14px]" data-testid="catalog-table">
                <caption className="sr-only">Temas de la vault y lo que existe de cada uno</caption>
                <thead className="bg-card text-[12.5px] uppercase tracking-wide text-faint">
                  <tr>
                    {["Tema", "Nota", "Estructura", "Mapa", ".practica", "Ejercicios", "Diseño", "En el plan"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.folder} className="border-t border-line align-top" data-testid="catalog-row" data-folder={r.folder}>
                      <th scope="row" className="min-w-0 max-w-[22rem] px-3 py-2 font-normal">
                        <button type="button" onClick={() => void openTopic(r.folder)} className="block max-w-full truncate text-left font-semibold text-accent-text underline-offset-2 hover:underline" title={r.folder} data-testid="catalog-open">
                          {r.title}
                        </button>
                        <span className="block truncate text-[12.5px] text-faint">{r.branch}{r.topicType !== "unknown" ? ` · ${TOPIC_TYPE_NAME[r.topicType]}` : ""}</span>
                      </th>
                      <td className="px-3 py-2"><Check3 ok={r.theory} yes="Nota" no="Sin nota" /></td>
                      <td className="px-3 py-2"><Check3 ok={r.contract} yes="Cumple" no="No cumple" unknown="Sin juzgar" /></td>
                      <td className="px-3 py-2"><Check3 ok={r.canvas} yes="Mapa" no="Sin mapa" /></td>
                      <td className="px-3 py-2">
                        {r.manifest ? <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden className="text-mint" /> {r.skills > 0 ? `${r.skills} skills` : "Sí"}</span> : <Check3 ok={false} no="Sin .practica" />}
                      </td>
                      <td className="px-3 py-2">
                        {r.exercises > 0 ? (
                          <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden className="text-mint" /> {r.exercises}{r.planExercises ? ` de ${r.planExercises}` : ""}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-warn"><X size={14} aria-hidden /> Sin ejercicios{r.planExercises ? ` (plan: ${r.planExercises})` : ""}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.score === null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <span className="font-semibold">{r.score} %</span>
                            {r.complete ? <Chip large colour="var(--nv-mint)"><Check size={12} aria-hidden /> Completo</Chip> : <span className="text-[12.5px] text-dim">{r.gaps} {r.gaps === 1 ? "faltante" : "faltantes"}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.inPlan ? (
                          <span className="block text-[13.5px]">
                            <span className="block">{r.area}{r.targetWeek ? ` · semana ${r.targetWeek}` : ""}</span>
                            <span className="block text-dim">
                              {r.completedAt ? "Completado" : "Pendiente"}{r.route && r.route !== "core" ? ` · ${ROUTE_LABEL[r.route]}` : ""}
                            </span>
                          </span>
                        ) : (
                          <Chip large colour="var(--nv-warn)">Fuera del plan</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

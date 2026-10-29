// Temas por crear — para un área del currículo de referencia (CSS, HTML, JavaScript, Java…): cuánto está cubierto, qué falta y, eligiendo varios temas,
// «Crear con Antigravity» escribe UNA tarea para el agente externo. Sin IA: la tarea se arma con reglas. La app no crea carpetas ni notas por sí misma.

import { api } from "../../lib/bridge";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Rocket, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  addAll, categoriesOf, countLabel, DEFAULT_FILTERS, essentialMissing, filterRows, groupByCategory, HARD_LIMIT, idsOf, IMPORTANCE_LABEL,
  selectable, selectionState, SOFT_LIMIT, STATUS_LABEL, toggleId, type GapFilters, type ImportanceFilter, type StatusFilter,
} from "../../lib/curriculumView";
import type { CoverageRow, CoverageStatus } from "../../lib/curriculum";
import { useApp } from "../../store/app";
import { useCurriculum, useCoverage, type CurriculumHandoffState } from "../../store/curriculum";
import { Chip, GhostButton, Modal, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { CoverageRing, LEVEL_COLOUR, LEVEL_LABEL } from "./CurriculumBadges";
import { CurriculumHandoffPanel } from "./CurriculumHandoffPanel";
import { CurriculumQueue } from "./CurriculumQueue";

const STATUS_COLOUR: Record<CoverageStatus, string> = { cubierto: "var(--nv-mint)", parcial: "var(--nv-warn)", faltante: "var(--nv-danger)" };
const IMPORTANCE_COLOUR = { esencial: "var(--nv-accent)", recomendado: "var(--nv-info)", opcional: "var(--nv-dim)" } as const;
const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "faltante", label: "Faltantes" },
  { id: "parcial", label: "Parciales" },
  { id: "cubierto", label: "Cubiertos" },
];
const IMPORTANCE_FILTERS: Array<{ id: ImportanceFilter; label: string }> = [
  { id: "todas", label: "Cualquier importancia" },
  { id: "esencial", label: "Esencial" },
  { id: "recomendado", label: "Recomendado" },
  { id: "opcional", label: "Opcional" },
];

export function CurriculumGaps({ areaId, onBack }: { areaId: string; onBack?: () => void }) {
  const toast = useApp((s) => s.toast);
  const { areas, loaded, error } = useCoverage();
  const loading = useCurriculum((s) => s.loading);
  const create = useCurriculum((s) => s.create);
  const area = areas.find((a) => a.areaId === areaId);

  const [filters, setFilters] = useState<GapFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [withExercises, setWithExercises] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [handoff, setHandoff] = useState<CurriculumHandoffState | null>(null);

  useEffect(() => {
    void useCurriculum.getState().loadPending();
  }, []);

  const rows = area?.rows ?? [];
  const visible = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const groups = useMemo(() => groupByCategory(visible), [visible]);
  const categories = useMemo(() => categoriesOf(rows), [rows]);
  const count = (s: StatusFilter): number => (s === "todos" ? rows.length : rows.filter((r) => r.status === s).length);

  // lo seleccionado que ya no existe (tras refrescar) o que se cubrió, se quita
  useEffect(() => {
    const valid = new Set(rows.filter(selectable).map((r) => r.entry.id));
    setSelected((s) => (s.every((id) => valid.has(id)) ? s : s.filter((id) => valid.has(id))));
  }, [rows]);

  const essentialCount = rows.filter((r) => r.status !== "cubierto" && r.entry.importance === "esencial").length;
  const state = selectionState(selected.length);
  const set = (patch: Partial<GapFilters>): void => setFilters((f) => ({ ...f, ...patch }));

  const submit = async (): Promise<void> => {
    setCreating(true);
    try {
      const h = await create({ areaId, entryIds: selected, withExercises });
      setHandoff(h);
      setSelected([]);
      setConfirming(false);
      toast("info", "La tarea está escrita: pega la instrucción en Antigravity.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  /** La interfaz AVANZADA: lo que elegiste a mano, escrito por la IA de la app (el progreso sale arriba, en la cola) */
  const [autoBusy, setAutoBusy] = useState(false);
  const generateSelected = async (): Promise<void> => {
    setAutoBusy(true);
    try {
      const r = await api.studyCurriculumAutoStart({ areaId, entryIds: selected, confirm: true });
      useCurriculum.getState().setAutoRun({ areaId, jobId: r.jobId });
      setSelected([]);
      toast("info", `Generando ${r.total} ${r.total === 1 ? "tema" : "temas"} con la IA de la app: el progreso está arriba.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setAutoBusy(false);
    }
  };

  const rowsOf = (ids: string[]): CoverageRow[] => rows.filter((r) => ids.includes(r.entry.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="curriculum-gaps" data-area={areaId}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {onBack && (
          <button type="button" onClick={onBack} data-testid="gaps-back" className="inline-flex min-h-8 items-center gap-1 rounded text-[13px] text-accent-text hover:underline">
            <ChevronLeft size={14} aria-hidden /> Volver
          </button>
        )}

        {!area ? (
          <p className="text-[13px] text-faint" role={error ? "alert" : "status"} data-testid="gaps-state">
            {error ? error : loaded && !loading ? "No encuentro esa área del currículo." : "Leyendo el currículo…"}
          </p>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-4" data-testid="gaps-header">
              <CoverageRing pct={area.pct} level={area.level} size={68} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-bold text-text">Temas por crear · {area.title}</h2>
                  <Chip colour={LEVEL_COLOUR[area.level]} large>{LEVEL_LABEL[area.level]}</Chip>
                </div>
                <p className="mt-0.5 text-[13px] text-dim" data-testid="gaps-counts">
                  {area.covered} cubiertos · {area.partial} parciales · {area.missing} faltan · {area.total} temas de referencia
                </p>
                <p className="text-[12px] text-faint">Se crearán dentro de <code>{area.space}/{area.areaFolder}</code>. Elige los que quieras y la app prepara la tarea para el agente.</p>
              </div>
              <button type="button" aria-label="Recalcular cobertura" title="Recalcular cobertura" onClick={() => void useCurriculum.getState().load(true)} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-panel text-faint hover:text-text">
                <RefreshCw size={13} className={cn(loading && "animate-spin")} aria-hidden />
              </button>
            </header>

            {handoff && <CurriculumHandoffPanel handoff={handoff} onUpdate={setHandoff} onClose={() => setHandoff(null)} />}

            <CurriculumQueue areaId={areaId} areaTitle={area.title} missing={area.missing + area.partial} essentials={essentialCount} withExercises={withExercises} />

            <details className="rounded-2xl border border-line bg-card p-3" data-testid="gaps-manual">
              <summary className="inline-flex min-h-9 cursor-pointer items-center text-[14px] font-semibold text-text">Elegir los temas a mano</summary>
              <div className="mt-3 space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2" data-testid="gaps-filters">
              <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.id} type="button" aria-pressed={filters.status === f.id} onClick={() => set({ status: f.id })} data-testid={`gaps-status-${f.id}`} className={cn("min-h-8 rounded-lg border px-2.5 text-[12.5px]", filters.status === f.id ? "border-accent bg-accent-soft text-text" : "border-line text-dim hover:bg-hover")}>
                    {f.label} <span className="font-mono text-[10.5px] text-faint">{count(f.id)}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-dim">
                <span className="sr-only">Importancia</span>
                <select value={filters.importance} onChange={(e) => set({ importance: e.target.value as ImportanceFilter })} aria-label="Filtrar por importancia" data-testid="gaps-importance" className="rounded-md border border-line bg-card px-1.5 py-1 text-[13px] text-text">
                  {IMPORTANCE_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </label>
              <label className="flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[13px]">
                <Search size={13} className="text-faint" aria-hidden />
                <input value={filters.query} onChange={(e) => set({ query: e.target.value })} placeholder="Buscar tema o propiedad" aria-label="Buscar tema" className="w-48 bg-transparent outline-none" />
              </label>
            </div>
            {categories.length > 1 && (
              <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-1" data-testid="gaps-categories">
                {categories.map((c) => {
                  const on = filters.categories.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => set({ categories: on ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] })} data-testid={`gaps-cat-${c}`} className={cn("min-h-7 rounded-full border px-2.5 text-[12px]", on ? "border-accent bg-accent-soft text-text" : "border-line text-dim hover:bg-hover")}>
                      {c}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Ayudas de selección */}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ayudas de selección">
              <GhostButton onClick={() => setSelected((s) => addAll(s, essentialMissing(rows)))} data-testid="gaps-sel-essential">Seleccionar esenciales faltantes</GhostButton>
              <GhostButton onClick={() => setSelected((s) => addAll(s, idsOf(visible)))} data-testid="gaps-sel-visible">Seleccionar todo lo visible</GhostButton>
              <GhostButton onClick={() => setSelected([])} disabled={selected.length === 0} data-testid="gaps-sel-clear">Limpiar</GhostButton>
            </div>

            {/* Lista por categoría */}
            {visible.length === 0 ? (
              <p className="rounded-xl border border-line bg-panel px-3.5 py-3 text-[13px] text-faint" data-testid="gaps-empty">
                {rows.length && filters.status === "faltante" && count("faltante") === 0 ? "No falta nada en esta área." : "Ningún tema coincide con el filtro."}
              </p>
            ) : (
              <div role="group" aria-label="Temas por crear" className="space-y-3" data-testid="gaps-list">
                {groups.map((g) => {
                  const shut = Boolean(collapsed[g.category]);
                  const ids = idsOf(g.rows);
                  const picked = ids.filter((id) => selected.includes(id)).length;
                  const hid = `gaps-cat-title-${g.category.replace(/\s+/g, "-")}`;
                  return (
                    <section key={g.category} role="group" aria-labelledby={hid} className="rounded-xl border border-line bg-card" data-testid="gaps-group" data-category={g.category}>
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <button type="button" aria-expanded={!shut} onClick={() => setCollapsed((c) => ({ ...c, [g.category]: !shut }))} className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left" data-testid="gaps-group-toggle">
                          {shut ? <ChevronRight size={15} className="flex-none text-faint" aria-hidden /> : <ChevronDown size={15} className="flex-none text-faint" aria-hidden />}
                          <h3 id={hid} className="truncate text-[13.5px] font-semibold text-text">{g.category}</h3>
                          <span className="font-mono text-[11px] text-faint">{g.rows.length}{picked ? ` · ${picked} elegidos` : ""}</span>
                        </button>
                        {ids.length > 0 && (
                          <GhostButton onClick={() => setSelected((s) => addAll(s, ids))} aria-label={`Seleccionar categoría ${g.category}`} data-testid="gaps-sel-category">Seleccionar categoría</GhostButton>
                        )}
                      </div>
                      {!shut && (
                        <ul className="divide-y divide-line border-t border-line">
                          {g.rows.map((r) => (
                            <GapRow key={r.entry.id} row={r} checked={selected.includes(r.entry.id)} open={Boolean(openItems[r.entry.id])} onToggle={() => setSelected((s) => toggleId(s, r.entry.id))} onItems={() => setOpenItems((o) => ({ ...o, [r.entry.id]: !o[r.entry.id] }))} />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
              </div>
            </details>
          </>
        )}
      </div>

      {/* Barra de acción */}
      {area && (
        <div role="region" aria-label="Acciones de selección" className="sticky bottom-0 flex-none border-t border-line-strong bg-card px-5 py-3" data-testid="gaps-bar" data-state={state}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13.5px] font-semibold text-text" role="status" data-testid="gaps-bar-count">{countLabel(selected.length)}</span>
            <label className="flex items-center gap-1.5 text-[13px] text-dim">
              <input type="checkbox" checked={withExercises} onChange={(e) => setWithExercises(e.target.checked)} data-testid="gaps-with-exercises" />
              Incluir ejercicios (si no, la app los genera después)
            </label>
            <GhostButton className="ml-auto" disabled={state === "vacio" || autoBusy} onClick={() => void generateSelected()} data-testid="gaps-auto" title="La app escribe estos temas ella sola con tu IA, uno tras otro">
              <Bot size={14} aria-hidden /> Generar con la IA de la app
            </GhostButton>
            <PrimaryButton disabled={state === "vacio" || state === "tope"} onClick={() => setConfirming(true)} data-testid="gaps-create">
              <Rocket size={14} aria-hidden /> Crear con Antigravity
            </PrimaryButton>
          </div>
          {state === "aviso" && <p className="mt-1.5 text-[12.5px] text-warn" role="alert" data-testid="gaps-warn">Son muchos temas ({selected.length}): divide en tandas de {SOFT_LIMIT} para que el agente los termine bien.</p>}
          {state === "tope" && <p className="mt-1.5 text-[12.5px] text-danger" role="alert" data-testid="gaps-stop">El máximo por tarea es {HARD_LIMIT} temas: quita {selected.length - HARD_LIMIT} para poder continuar.</p>}
        </div>
      )}

      {confirming && area && (
        <Modal
          title="Crear con Antigravity"
          onClose={() => !creating && setConfirming(false)}
          footer={
            <>
              <GhostButton onClick={() => setConfirming(false)} disabled={creating} data-testid="gaps-confirm-cancel">Cancelar</GhostButton>
              <PrimaryButton className="ml-auto" onClick={() => void submit()} disabled={creating} data-testid="gaps-confirm-ok">Escribir la tarea</PrimaryButton>
            </>
          }
        >
          <div className="space-y-2 text-[13.5px]" data-testid="gaps-confirm">
            <p>Vas a preparar la tarea para <strong>{selected.length} {selected.length === 1 ? "tema" : "temas"}</strong> de {area.title}{withExercises ? ", con ejercicios" : ", sin ejercicios (la app los genera después)"}.</p>
            <ul className="list-disc space-y-1 pl-5 text-dim">
              <li>La app escribe <strong>solo un archivo de tarea</strong> en tu vault.</li>
              <li>Las carpetas, notas y demás las crea el <strong>agente externo</strong> (Antigravity) cuando le pegues la instrucción.</li>
              <li>La app <strong>no crea nada</strong> por sí misma y <strong>no usa IA</strong> para armar la tarea.</li>
              <li>Cuando el agente termine, pulsas «Ya terminó — validar» y la app comprueba el resultado.</li>
            </ul>
            <p className="text-[12.5px] text-faint">Temas: {rowsOf(selected).map((r) => r.entry.title).slice(0, 5).join(", ")}{selected.length > 5 ? ` y ${selected.length - 5} más` : ""}.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GapRow({ row, checked, open, onToggle, onItems }: { row: CoverageRow; checked: boolean; open: boolean; onToggle: () => void; onItems: () => void }) {
  const e = row.entry;
  const can = selectable(row);
  const id = `gap-${e.id}`;
  return (
    <li className="px-3 py-2" data-testid="gaps-row" data-id={e.id} data-status={row.status}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input id={id} type="checkbox" checked={checked} disabled={!can} onChange={onToggle} className="h-4 w-4 flex-none" data-testid="gaps-check" />
        <label htmlFor={id} className={cn("min-w-0 flex-1 basis-56 cursor-pointer text-[13.5px] font-medium", can ? "text-text" : "text-dim")}>{e.title}</label>
        <Chip colour={IMPORTANCE_COLOUR[e.importance]}>{IMPORTANCE_LABEL[e.importance]}</Chip>
        <Chip colour={STATUS_COLOUR[row.status]}>{STATUS_LABEL[row.status]}</Chip>
        {e.items.length > 0 && (
          <button type="button" aria-expanded={open} onClick={onItems} data-testid="gaps-items-toggle" className="min-h-6 rounded text-[12px] text-accent-text hover:underline">
            {e.items.length} {e.items.length === 1 ? "elemento" : "elementos"}
          </button>
        )}
      </div>
      <p className="ml-7 mt-0.5 break-all text-[11.5px] text-faint" data-testid="gaps-folder">
        {row.status === "faltante" ? `Se crearía en: ${row.suggestedFolder}` : row.matchedFolders.length ? `Ya está en: ${row.matchedFolders.join(", ")}` : row.suggestedFolder}
      </p>
      {open && (
        <ul className="ml-7 mt-1.5 flex flex-wrap gap-1" data-testid="gaps-items" aria-label={`Elementos de ${e.title}`}>
          {e.items.map((it) => <li key={it} className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[11.5px] text-dim">{it}</li>)}
        </ul>
      )}
    </li>
  );
}

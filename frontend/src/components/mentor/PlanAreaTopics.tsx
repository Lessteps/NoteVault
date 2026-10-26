// Mentor — Plan, sub-vista «Temas por área»: una sub-barra con TODAS las áreas del plan (se actualiza sola con el plan) y, dentro de cada área,
// otra sub-barra con sus grupos (Bases, Lenguaje, Conocimientos…) y la tabla de sus temas en el orden de la ruta, con lo que existe de cada uno
// y el botón «Generar todo». Sustituye a las tarjetas: la información es la misma que la del catálogo, pero ordenada por área.
//
// Regenerar es visible a tres niveles: una casilla por tema + una barra de acciones sobre la tabla (teoría, mapa, práctica, ejercicios, «lo que falta»)
// que trabaja con los temas elegidos (cola de uno en uno, `TopicBulk`); cuatro iconos de acción rápida al final de cada fila; y el panel
// desplegable de cada tema (`TopicRegenerate`) con el estado de cada pieza. Siempre reemplaza con copia de seguridad y confirmación.
// Un filtro por estado (falta nota / mapa / práctica / ejercicios / completo) ayuda a elegir.
//
// Los datos salen del plan (áreas, grupos, semanas) y de `mentor_plan_topic_catalog` (lo que existe en la vault); la lógica está en
// `lib/planAreaTopics.ts`. Solo lectura salvo «Generar», que pasa siempre por el diálogo de confirmación de «Ejecutar plan».

import { Check, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { matchesStatus, planBulk, regenBlockedReason, STATUS_FILTERS, type BulkPlan, type RegenKind, type StatusFilter } from "../../lib/topicSelection";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { TOPIC_HIGHLIGHT_KEY } from "./mentorNav";
import { type AreaTopicRow, areaTabsOf, areaTopicRows, basesTopicRows, BASES_KEY, groupTabsOf, pendingGenerate, rowsOfGroup, type AreaTab, type GroupTab } from "../../lib/planAreaTopics";
import { ROUTE_LABEL } from "../../lib/planRoute";
import { buildSchedule, progressPlan, type PlanSchedule } from "../../lib/planSchedule";
import { timeTagOf, topicTimes } from "../../lib/planTopicTime";
import { todayIso } from "../../lib/tasks";
import type { MentorPlan } from "../../lib/types";
import { Chip } from "../common/forms";
import { cn } from "../ui";
import { TimeChip, TopicMenu } from "./PlanBoard";
import { LoadState, ProgressBar } from "./parts";
import { SectionHeading } from "./planKit";
import { usePlanTopicCatalog } from "./PlanTopicCatalog";
import { ExecuteDialog } from "./PlanExecution";
import { ExternalTasks } from "./ExternalTasks";
import { BulkConfirm, BulkProgress, BulkToolbar, RowQuickActions, useRegenQueue, type SelectHelper } from "./TopicBulk";
import { areaScope, GenerateButton, GenerateTopicButton, topicScope } from "./TopicGenerate";
import { TopicInsight } from "./TopicInsight";
import { RegeneratePanel } from "./TopicRegenerate";

/** Una sub-barra de pestañas (botones con `aria-pressed`) que se desplaza en horizontal en anchos estrechos. */
function TabBar<T extends { key: string; label: string; hint?: string; hintLabel?: string }>({ label, tabs, active, onSelect, level, testid }: { label: string; tabs: ReadonlyArray<T>; active: string; onSelect: (key: string) => void; level: 1 | 2; testid: string }) {
  return (
    <nav aria-label={label} data-testid={testid} className="min-w-0">
      <ul className={cn("flex gap-1 overflow-x-auto py-1", level === 1 ? "border-b border-line" : "")}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key} className="flex-none">
              <button
                type="button"
                aria-pressed={on}
                aria-current={on ? "page" : undefined}
                onClick={() => onSelect(t.key)}
                data-testid={`${testid}-${t.key || "all"}`}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 font-medium transition-colors",
                  level === 1 ? "min-h-10 text-[14.5px]" : "min-h-9 text-[13.5px]",
                  on ? "border-accent bg-accent-soft text-accent-text" : "border-transparent text-dim hover:bg-hover hover:text-text",
                )}
              >
                {t.label}
                {t.hint && (
                  <span className="rounded-md bg-hover px-1.5 text-[12px] text-dim">
                    <span aria-hidden>{t.hint}</span>
                    <span className="sr-only"> ({t.hintLabel ?? t.hint})</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const areaTabsView = (tabs: AreaTab[]) => tabs.map((t) => ({ key: t.key, label: t.area, ...(t.missing > 0 ? { hint: String(t.missing), hintLabel: `${t.missing} por generar` } : {}) }));
const groupTabsView = (tabs: GroupTab[]) => tabs.map((t) => ({ key: t.id, label: t.title, hint: String(t.total), hintLabel: `${t.total} ${t.total === 1 ? "tema" : "temas"}${t.missing ? `, ${t.missing} por generar` : ""}` }));

/** Anillo de avance de un tema (el mismo lenguaje visual que el resumen del área): el número va dentro y el color solo acompaña. */
function Ring({ pct, done }: { pct: number; done: boolean }) {
  const v = done ? 100 : Math.max(0, Math.min(100, Math.round(pct)));
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid h-9 w-9 place-items-center" data-testid="topic-ring" data-pct={v} role="img" aria-label={`Avance ${v} %`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-hover" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} style={{ stroke: v >= 100 ? "var(--nv-mint)" : "var(--nv-accent)" }} />
      </svg>
      <span className="text-[10px] font-semibold tabular-nums" aria-hidden>{v}%</span>
    </span>
  );
}

/** Piezas hechas con una versión anterior de su skill → qué regenerar y cómo se llama. */
const OUTDATED_KINDS = [
  { key: "theory", what: "theory", label: "Nota", full: "la nota de teoría" },
  { key: "canvas", what: "map", label: "Mapa", full: "el mapa" },
  { key: "practica", what: "practice", label: ".practica", full: "el manifiesto .practica" },
] as const;

/** Botones verdes junto al tema: la skill cambió después de generar esa pieza. Pulsar pide confirmar y regenera (con copia de seguridad). */
function OutdatedButtons({ row, busy, onAsk }: { row: AreaTopicRow; busy: boolean; onAsk: (what: RegenKind, row: AreaTopicRow) => void }) {
  const list = OUTDATED_KINDS.filter((k) => row.outdated?.[k.key]);
  if (list.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1" data-testid="outdated-buttons">
      {list.map((k) => {
        const why = busy ? "Hay una regeneración en curso." : regenBlockedReason(row, k.what);
        return (
          <button
            key={k.key}
            type="button"
            disabled={!!why}
            onClick={() => onAsk(k.what, row)}
            title={why || `La skill cambió después de generar ${k.full}: regenerarla con la versión nueva (respalda lo actual)`}
            aria-label={`Regenerar ${k.full} de ${row.title}: la skill cambió`}
            data-testid={`outdated-${k.key}`}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-mint bg-mint/15 px-2 text-[12.5px] font-medium text-mint hover:bg-mint/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} aria-hidden /> {k.label}
          </button>
        );
      })}
    </span>
  );
}

function Mark({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden className="text-mint" /> {yes}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn"><X size={14} aria-hidden /> {no}</span>
  );
}

export function PlanAreaTopics({ plan, schedule, today, started, progress, only }: { plan: MentorPlan; /** fija la página en UN área (su subplan o «__bases»): sin barra de áreas, la de la página del área */ only?: string; /** avance (0–100) de cada tema, de la práctica: el mismo que enseña el resumen del área */ progress?: ReadonlyMap<string, number>; /** el reparto del plan (si no se da, se calcula) */ schedule?: PlanSchedule; today?: string; /** ¿ha empezado la ruta? (si no se da, cuando hay algún tema completado) */ started?: boolean }) {
  const uid = useId();
  const day = today ?? todayIso();
  const begun = started ?? plan.subplans.some((s) => s.topics.some((t) => t.completedAt));
  const activeSchedule = useMemo(() => schedule ?? (plan.start && plan.end ? buildSchedule(progressPlan(plan, { today: day })) : undefined), [schedule, plan, day]);
  const times = useMemo(() => topicTimes(activeSchedule?.days ?? []), [activeSchedule]);
  const { rows: catalog, error, warming, reload } = usePlanTopicCatalog(plan.id);
  const [areaKey, setAreaKey] = useState("");
  const [groupId, setGroupId] = useState("");
  // temas desplegados (su panel de «Regenerar»); se recuerdan al cambiar de área
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  const toggleRow = (folder: string): void => setOpenRows((s) => { const n = new Set(s); if (!n.delete(folder)) n.add(folder); return n; });
  // selección para el lote, filtro por estado, modo puente de la IA y la cola
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [asking, setAsking] = useState<BulkPlan | null>(null);
  const [genChain, setGenChain] = useState<AreaTopicRow[]>([]);
  const { queue, start, stop, dismiss } = useRegenQueue();
  const queueBusy = !!queue?.running;
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const targetHighlight = useNavState((s) => s.values[TOPIC_HIGHLIGHT_KEY] as string | undefined);

  useEffect(() => {
    if (targetHighlight) {
      setHighlighted(targetHighlight);
      useNavState.getState().set(TOPIC_HIGHLIGHT_KEY, undefined);
    }
  }, [targetHighlight]);

  const cat = catalog ?? [];
  const baseTabs = useMemo(() => areaTabsOf(plan, cat), [plan, cat]);
  // Bases: los fundamentos no son de la ruta de ningún área; van juntos, sin repetirse, en su propia pestaña
  const basesRows = useMemo(() => basesTopicRows(plan, cat, activeSchedule), [plan, cat, activeSchedule]);
  const basesTab: AreaTab | undefined = basesRows.length
    ? { key: BASES_KEY, area: "Bases", subplanId: BASES_KEY, total: basesRows.length, done: basesRows.filter((r) => r.completed).length, missing: basesRows.filter(pendingGenerate).length }
    : undefined;
  const tabs = useMemo(() => (basesTab ? [...baseTabs, basesTab] : baseTabs), [baseTabs, basesTab]);
  // `only` puede ser la clave del área (`areaId`) o el id del subplan (la página del área pasa éste): si no coincidiera, la vista quedaría vacía
  const active = only ? tabs.find((t) => t.key === only || t.subplanId === only) : tabs.find((t) => t.key === areaKey) ?? tabs[0];
  const isBases = active?.key === BASES_KEY;
  const sub = active && !isBases ? plan.subplans.find((s) => s.id === active.subplanId) : undefined;
  const areaRows = useMemo(() => (isBases ? basesRows : sub ? areaTopicRows(sub, cat, false, activeSchedule) : []), [isBases, basesRows, sub, cat, activeSchedule]);
  const groups = useMemo(() => (sub ? groupTabsOf(sub, areaRows) : [{ id: "", title: "Todos", total: areaRows.length, missing: areaRows.filter(pendingGenerate).length }]), [sub, areaRows]);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const shown = useMemo(() => (sub && group ? rowsOfGroup(sub, areaRows, group.id) : areaRows), [sub, areaRows, group]);
  // si el área o el grupo elegidos desaparecen del plan, se vuelve a la primera pestaña
  useEffect(() => {
    if (active && active.key !== areaKey) setAreaKey(active.key);
  }, [active, areaKey]);
  useEffect(() => {
    if (group && group.id !== groupId) setGroupId(group.id);
  }, [group, groupId]);

  // lo que se ve (tras el filtro por estado); la selección y las acciones en lote solo cuentan lo que se ve
  const outdatedCount = useMemo(() => areaRows.filter((r) => r.outdated).length, [areaRows]);
  const visible = useMemo(() => shown.filter((r) => matchesStatus(r, statusFilter)), [shown, statusFilter]);
  const selectedRows = useMemo(() => visible.filter((r) => selected.has(r.folder)), [visible, selected]);
  const allOn = visible.length > 0 && selectedRows.length === visible.length;
  const statusCounts = useMemo(() => new Map(STATUS_FILTERS.map((f) => [f.key, shown.filter((r) => matchesStatus(r, f.key)).length])), [shown]);

  useEffect(() => {
    if (highlighted) {
      if (groupId && !shown.some((r) => r.folder === highlighted)) {
        setGroupId("");
      }
      if (statusFilter !== "all" && !visible.some((r) => r.folder === highlighted)) {
        setStatusFilter("all");
      }
    }
  }, [highlighted, shown, visible, groupId, statusFilter]);

  const pickArea = (k: string): void => {
    setAreaKey(k);
    setGroupId("");
    setSelected(new Set());
  };
  const pickGroup = (id: string): void => {
    setGroupId(id);
    setSelected(new Set());
  };
  const toggleSel = (folder: string): void => setSelected((s) => { const n = new Set(s); if (!n.delete(folder)) n.add(folder); return n; });
  const helper = (h: SelectHelper): void => {
    if (h === "clear") setSelected(new Set());
    else if (h === "all") setSelected(new Set(visible.map((r) => r.folder)));
    else if (h === "missing") setSelected(new Set(visible.filter(pendingGenerate).map((r) => r.folder)));
    else setSelected(new Set(visible.filter((r) => r.exercises === 0).map((r) => r.folder)));
  };
  const ask = (what: RegenKind, rows: ReadonlyArray<AreaTopicRow>): void => setAsking(planBulk(rows, what, false));
  const confirmBulk = (): void => {
    const p = asking;
    setAsking(null);
    if (!p || p.run.length === 0) return;
    void start(p.what, p.run);
  };
  // «Generar lo que falta» de la selección: el diálogo de «Ejecutar plan» (uno por tema) de los que están en ruta y les falta algo
  const generateMissing = (): void => {
    const todo = selectedRows.filter((r) => r.route !== "skipped" && r.incomplete);
    if (todo.length === 0) useApp.getState().toast("info", "A los temas elegidos no les falta nada que generar.");
    else setGenChain(todo);
  };

  return (
    <section aria-labelledby={`${uid}-h`} data-testid="plan-areas-view" className="space-y-3">
      <SectionHeading id={`${uid}-h`} hint="Cada área del plan con todos sus temas en el orden de la ruta y lo que existe de cada uno. Elige un área arriba y, dentro de ella, un grupo.">
        {only ? `Temas de ${tabs.find((t) => t.key === only || t.subplanId === only)?.area ?? "el área"}` : "Temas por área"}
      </SectionHeading>
      <ExternalTasks />
      <LoadState warming={warming} error={error} empty={!catalog} onRetry={reload} />

      {tabs.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim">Este plan todavía no tiene áreas.</p>}

      {catalog && active && group && (
        <>
          {!only && <TabBar label="Áreas del plan" tabs={areaTabsView(tabs)} active={active.key} onSelect={pickArea} level={1} testid="area-tabs" />}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="area-summary">
            <div className="min-w-0 flex-1 basis-72 text-[14.5px]">
              <strong>{active.area}</strong> · {active.total} {active.total === 1 ? "tema" : "temas"} · {active.done} completados ·{" "}
              {active.missing > 0 ? <span className="text-warn">{active.missing} por generar</span> : <span className="text-mint">nada por generar</span>}
              {outdatedCount > 0 && <span className="text-mint" data-testid="outdated-count"> · {outdatedCount} con skill nueva por regenerar</span>}
              <span className="mt-1.5 block max-w-md"><ProgressBar pct={active.total ? Math.round((active.done / active.total) * 100) : 0} label={`Avance de ${active.area}`} /></span>
            </div>
            {!isBases && <GenerateButton
              planId={plan.id}
              proposed={!!plan.proposed}
              scope={areaScope(active.key)}
              label={`Generar el área (${active.missing})`}
              ariaLabel={`Generar todo lo que falta del área ${active.area}`}
              disabled={active.missing === 0}
              title="Crea lo que falta de todos los temas de esta área (teoría, mapa, manifiesto y ejercicios)"
              testid="generate-area"
            />}
          </div>

          {groups.length > 1 && <TabBar label={`Grupos de ${active.area}`} tabs={groupTabsView(groups)} active={group.id} onSelect={pickGroup} level={2} testid="group-tabs" />}

          {shown.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por estado" data-testid="status-filters">
                <span className="text-[13px] text-dim">Estado:</span>
                {STATUS_FILTERS.map((f) => {
                  const on = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setStatusFilter(f.key)}
                      data-testid={`status-filter-${f.key}`}
                      className={cn("inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] transition-colors", on ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover hover:text-text")}
                    >
                      {f.label} <span className="rounded bg-hover px-1 text-[11.5px] tabular-nums">{statusCounts.get(f.key) ?? 0}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-dim hover:bg-hover hover:text-text"
                  data-testid="expand-all"
                  onClick={() => setOpenRows(visible.every((r) => openRows.has(r.folder)) ? new Set() : new Set(visible.map((r) => r.folder)))}
                >
                  {visible.every((r) => openRows.has(r.folder)) ? "Contraer todo" : "Expandir todo"}
                </button>
              </div>
              <BulkToolbar count={selectedRows.length} busy={queueBusy} onAsk={(w) => ask(w, selectedRows)} onGenerateMissing={generateMissing} onHelper={helper} />
              {queue && <BulkProgress queue={queue} onStop={stop} onClose={dismiss} />}
            </>
          )}

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim" data-testid="area-empty">Esta sección no tiene temas.</p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim" data-testid="area-filter-empty">Ningún tema cumple ese estado.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[74rem] border-collapse text-left text-[14px]" data-testid="area-table">
                <caption className="sr-only">Temas de {active.area}{group.id ? `, grupo ${group.title}` : ""}</caption>
                <thead className="bg-card text-[12.5px] uppercase tracking-wide text-faint">
                  <tr>
                    <th scope="col" className="w-9 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los temas visibles"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = selectedRows.length > 0 && !allOn; }}
                        onChange={() => setSelected(allOn ? new Set() : new Set(visible.map((r) => r.folder)))}
                        disabled={queueBusy}
                        data-testid="select-all"
                        className="h-4 w-4 accent-[var(--nv-accent)]"
                      />
                    </th>
                    {["Sem.", "Tema", "Avance", "Previsto", "Nota", "Mapa", ".practica", "Ejercicios", "Estado", "Regenerar", "Generar"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <Fragment key={r.folder}>
                    <tr
                      ref={(el) => {
                        if (el && r.folder === highlighted) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                      }}
                      className={cn(
                        "border-t border-line align-top transition-colors duration-300",
                        r.route === "skipped" && "opacity-60",
                        r.folder === highlighted && "bg-amber-300/35 dark:bg-amber-400/25 border-l-4 border-l-amber-500 dark:border-l-amber-400 shadow-[inset_0_0_12px_rgba(245,158,11,0.25)]"
                      )}
                      data-testid="area-row"
                      data-folder={r.folder}
                      data-highlighted={r.folder === highlighted ? "true" : undefined}
                      data-selected={selected.has(r.folder) || undefined}
                      onMouseEnter={() => {
                        if (r.folder === highlighted) {
                          setHighlighted(null);
                        }
                      }}
                      onMouseOver={() => {
                        if (r.folder === highlighted) {
                          setHighlighted(null);
                        }
                      }}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Seleccionar ${r.title}`} checked={selected.has(r.folder)} onChange={() => toggleSel(r.folder)} disabled={queueBusy} data-testid="row-select" className="mt-1 h-4 w-4 accent-[var(--nv-accent)]" />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-dim">{r.week}</td>
                      <th scope="row" className="min-w-0 max-w-[24rem] px-3 py-2 font-normal">
                        <span className="flex min-w-0 items-start gap-1">
                        <button
                          type="button"
                          className="mt-0.5 inline-grid h-6 w-6 flex-none place-items-center rounded-md text-dim hover:bg-hover hover:text-text"
                          aria-expanded={openRows.has(r.folder)}
                          aria-label={`${openRows.has(r.folder) ? "Contraer" : "Desplegar"} el detalle y las acciones de ${r.title}`}
                          onClick={() => toggleRow(r.folder)}
                          data-testid="row-expand"
                        >
                          {openRows.has(r.folder) ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                        </button>
                        <span className="min-w-0 flex-1">
                        <TopicMenu folder={r.folder} title={r.title} trigger={<span className="block truncate" title={r.folder} data-testid="area-open">{r.title}</span>} className="font-semibold text-accent-text underline-offset-2 hover:underline" />
                        {!r.exists && <span className="block text-[12.5px] text-faint">Aún no existe en la vault</span>}
                        <OutdatedButtons row={r} busy={queueBusy} onAsk={(w, row) => ask(w, [row])} />
                        </span>
                        </span>
                      </th>
                      <td className="px-3 py-2"><Ring pct={progress?.get(r.folder) ?? 0} done={r.completed} /></td>
                      <td className="px-3 py-2">{(() => { const t = timeTagOf(times.get(r.folder), r.completed, day, begun); return t && t.status !== "done" ? <TimeChip time={t} /> : <span className="text-dim">—</span>; })()}</td>
                      <td className="px-3 py-2"><Mark ok={r.theory} yes="Nota" no="Sin nota" /></td>
                      <td className="px-3 py-2"><Mark ok={r.canvas} yes="Mapa" no="Sin mapa" /></td>
                      <td className="px-3 py-2"><Mark ok={r.manifest} yes="Sí" no="Sin .practica" /></td>
                      <td className="px-3 py-2">
                        {r.exercises > 0 ? (
                          <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden className="text-mint" /> {r.exercises}{r.planExercises ? ` de ${r.planExercises}` : ""}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-warn"><X size={14} aria-hidden /> Sin ejercicios</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[13.5px]">
                        {(() => {
                          if (r.completed) return <Chip large colour="var(--nv-mint)"><Check size={12} aria-hidden /> Completado</Chip>;
                          const t = timeTagOf(times.get(r.folder), false, day, begun);
                          // pendiente solo cuando la ruta empezó y su tiempo previsto ya pasó
                          return t?.status === "pending" ? <Chip large colour="var(--nv-warn)">Pendiente</Chip> : <span className="text-dim">{t?.status === "current" ? "En su tiempo" : "Programado"}</span>;
                        })()}
                        {r.route !== "core" && <span className="block text-dim">{ROUTE_LABEL[r.route]}</span>}
                      </td>
                      <td className="px-3 py-2"><RowQuickActions row={r} busy={queueBusy} onAsk={(w, row) => ask(w, [row])} /></td>
                      <td className="px-3 py-2">
                        <GenerateTopicButton planId={plan.id} proposed={!!plan.proposed} folder={r.folder} title={r.title} inPlan={r.route !== "skipped"} incomplete={pendingGenerate({ ...r, completed: false })} />
                      </td>
                    </tr>
                    {openRows.has(r.folder) && (
                      <tr className="border-t border-line bg-surface/40" data-testid="area-row-expanded" data-folder={r.folder}>
                        <td colSpan={12}>
                          <div className="space-y-2 px-3 py-2">
                            <TopicInsight folder={r.folder} title={r.title} planId={plan.id} />
                            <RegeneratePanel row={r} />
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {asking && <BulkConfirm plan={asking} onCancel={() => setAsking(null)} onConfirm={confirmBulk} />}
      {genChain.length > 0 && (
        <ExecuteDialog
          key={genChain[0]!.folder}
          planId={plan.id}
          proposed={!!plan.proposed}
          initialScope={topicScope(genChain[0]!.folder)}
          onClose={() => setGenChain((c) => c.slice(1))}
          onStarted={() => {
            useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
          }}
        />
      )}
    </section>
  );
}

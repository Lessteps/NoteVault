// Mentor — Plan, sub-vista «Temas por área»: una sub-barra con TODAS las áreas del plan (se actualiza sola con el plan) y, dentro de cada área,
// otra sub-barra con sus grupos (Bases, Lenguaje, Conocimientos…) y la tabla de sus temas en el orden de la ruta, con lo que existe de cada uno
// y el botón «Generar todo». Sustituye a las tarjetas: la información es la misma que la del catálogo, pero ordenada por área.
//
// Los datos salen del plan (áreas, grupos, semanas) y de `mentor_plan_topic_catalog` (lo que existe en la vault); la lógica está en
// `lib/planAreaTopics.ts`. Solo lectura salvo «Generar», que pasa siempre por el diálogo de confirmación de «Ejecutar plan».

import { Check, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { areaTabsOf, areaTopicRows, basesTopicRows, BASES_KEY, groupTabsOf, pendingGenerate, rowsOfGroup, type AreaTab, type GroupTab } from "../../lib/planAreaTopics";
import { ROUTE_LABEL } from "../../lib/planRoute";
import { buildSchedule, type PlanSchedule } from "../../lib/planSchedule";
import { timeTagOf, topicTimes } from "../../lib/planTopicTime";
import { todayIso } from "../../lib/tasks";
import type { MentorPlan } from "../../lib/types";
import { Chip } from "../common/forms";
import { cn } from "../ui";
import { TimeChip, TopicMenu } from "./PlanBoard";
import { LoadState } from "./parts";
import { SectionHeading } from "./planKit";
import { usePlanTopicCatalog } from "./PlanTopicCatalog";
import { areaScope, GenerateButton, GenerateTopicButton } from "./TopicGenerate";

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

function Mark({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden className="text-mint" /> {yes}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn"><X size={14} aria-hidden /> {no}</span>
  );
}

export function PlanAreaTopics({ plan, schedule, today, started }: { plan: MentorPlan; /** el reparto del plan (si no se da, se calcula) */ schedule?: PlanSchedule; today?: string; /** ¿ha empezado la ruta? (si no se da, cuando hay algún tema completado) */ started?: boolean }) {
  const uid = useId();
  const day = today ?? todayIso();
  const begun = started ?? plan.subplans.some((s) => s.topics.some((t) => t.completedAt));
  const times = useMemo(() => topicTimes((schedule ?? (plan.start && plan.end ? buildSchedule(plan) : null))?.days ?? []), [schedule, plan]);
  const { rows: catalog, error, warming, reload } = usePlanTopicCatalog(plan.id);
  const [areaKey, setAreaKey] = useState("");
  const [groupId, setGroupId] = useState("");

  const cat = catalog ?? [];
  const baseTabs = useMemo(() => areaTabsOf(plan, cat), [plan, cat]);
  // Bases: los fundamentos no son de la ruta de ningún área; van juntos, sin repetirse, en su propia pestaña
  const basesRows = useMemo(() => basesTopicRows(plan, cat), [plan, cat]);
  const basesTab: AreaTab | undefined = basesRows.length
    ? { key: BASES_KEY, area: "Bases", subplanId: BASES_KEY, total: basesRows.length, done: basesRows.filter((r) => r.completed).length, missing: basesRows.filter(pendingGenerate).length }
    : undefined;
  const tabs = useMemo(() => (basesTab ? [...baseTabs, basesTab] : baseTabs), [baseTabs, basesTab]);
  const active = tabs.find((t) => t.key === areaKey) ?? tabs[0];
  const isBases = active?.key === BASES_KEY;
  const sub = active && !isBases ? plan.subplans.find((s) => s.id === active.subplanId) : undefined;
  const areaRows = useMemo(() => (isBases ? basesRows : sub ? areaTopicRows(sub, cat) : []), [isBases, basesRows, sub, cat]);
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

  const pickArea = (k: string): void => {
    setAreaKey(k);
    setGroupId("");
  };

  return (
    <section aria-labelledby={`${uid}-h`} data-testid="plan-areas-view" className="space-y-3">
      <SectionHeading id={`${uid}-h`} hint="Cada área del plan con todos sus temas en el orden de la ruta y lo que existe de cada uno. Elige un área arriba y, dentro de ella, un grupo.">
        Temas por área
      </SectionHeading>
      <LoadState warming={warming} error={error} empty={!catalog} onRetry={reload} />

      {tabs.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim">Este plan todavía no tiene áreas.</p>}

      {catalog && active && group && (
        <>
          <TabBar label="Áreas del plan" tabs={areaTabsView(tabs)} active={active.key} onSelect={pickArea} level={1} testid="area-tabs" />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="area-summary">
            <p className="min-w-0 flex-1 basis-72 text-[14.5px]">
              <strong>{active.area}</strong> · {active.total} {active.total === 1 ? "tema" : "temas"} · {active.done} completados ·{" "}
              {active.missing > 0 ? <span className="text-warn">{active.missing} por generar</span> : <span className="text-mint">nada por generar</span>}
            </p>
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

          {groups.length > 1 && <TabBar label={`Grupos de ${active.area}`} tabs={groupTabsView(groups)} active={group.id} onSelect={setGroupId} level={2} testid="group-tabs" />}

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim" data-testid="area-empty">Esta sección no tiene temas.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[62rem] border-collapse text-left text-[14px]" data-testid="area-table">
                <caption className="sr-only">Temas de {active.area}{group.id ? `, grupo ${group.title}` : ""}</caption>
                <thead className="bg-card text-[12.5px] uppercase tracking-wide text-faint">
                  <tr>
                    {["Sem.", "Tema", "Previsto", "Nota", "Mapa", ".practica", "Ejercicios", "Estado", "Generar"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.folder} className={cn("border-t border-line align-top", r.route === "skipped" && "opacity-60")} data-testid="area-row" data-folder={r.folder}>
                      <td className="px-3 py-2 tabular-nums text-dim">{r.week}</td>
                      <th scope="row" className="min-w-0 max-w-[24rem] px-3 py-2 font-normal">
                        <TopicMenu folder={r.folder} title={r.title} trigger={<span className="block truncate" title={r.folder} data-testid="area-open">{r.title}</span>} className="font-semibold text-accent-text underline-offset-2 hover:underline" />
                        {!r.exists && <span className="block text-[12.5px] text-faint">Aún no existe en la vault</span>}
                      </th>
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
                      <td className="px-3 py-2">
                        <GenerateTopicButton planId={plan.id} proposed={!!plan.proposed} folder={r.folder} title={r.title} inPlan={r.route !== "skipped"} incomplete={pendingGenerate({ ...r, completed: false })} />
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

// Mentor — Plan, pestaña «Práctica»: la página de UN área (Backend, Frontend…), con aire de página de Notion.
//
// De arriba abajo: cabecera (icono, «Área · N temas y práctica», horas estimadas · colecciones en la vault · cadencia del kata), el aviso
// descartable «Ruta de aprendizaje activa», TEORÍA de hoy, PRÁCTICA del área (sistema + el kata de hoy con su rejilla de definición, plantilla
// copiable y pistas/solución ocultas hasta abrirlas), PRÁCTICA DE LENGUAJE, VAULT DE EJERCICIOS y el progreso de la sesión. Debajo van, como
// antes, las habilidades, el proyecto de la semana y los proyectos por semana y mensual (los pinta `PracticeCard` y llegan como `children`).
//
// Los datos NO se inventan: los temas de hoy salen de `dayByArea` (el MISMO selector que la Agenda y la Ejecución), el kata de `AreaPracticeView`
// y los ejercicios de la vault de `topicByFolder`. Sin plan cargado (`plan`/`loaded` ausentes) solo se pinta el bloque del kata.

import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Info, SkipForward, Undo2, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { KATA_LEVEL_LABEL, areaPracticeSystem } from "../../lib/areaPracticeSystem";
import type { AreaPracticeView } from "../../lib/areaPracticeView";
import { kataDefinition, kataTemplate, kataTemplateExt } from "../../lib/kataView";
import { clampToPlan } from "../../lib/planSchedule";
import { areaRouteTopics, dayByArea } from "../../lib/planTopicsByArea";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { usePersistedNav } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { focusColour, useAgendaModel, type AgendaModel } from "./agendaKit";
import { openTopic } from "./openTopic";
import { ProgressBar, hm } from "./parts";
import type { AreaPracticeState } from "./PracticeCard";
import { DAY_SHORT, STATE_LABEL, type Loaded } from "./planShared";

const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";
/** Etiqueta de sección: pequeña, en mayúsculas y con contraste suficiente (text-dim, no faint). */
const LABEL = "text-[12px] font-semibold uppercase tracking-wider text-dim";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BOX = "min-w-0 rounded-2xl border border-line bg-card p-4 @3xl:p-5";


function Section({ id, label, aside, testid, children }: { id: string; label: string; aside?: string; testid: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2.5" data-testid={testid}>
      <h4 id={id} className={cn(LABEL, "flex flex-wrap items-baseline gap-x-2 px-0.5")}>
        {label}
        {aside && <span className="font-medium normal-case tracking-normal text-dim"> · {aside}</span>}
      </h4>
      {children}
    </section>
  );
}

/** Un botón-interruptor accesible (aria-expanded) con el chevron. */
function Toggle({ open, onClick, controls, children, testid, className }: { open: boolean; onClick: () => void; controls: string; children: ReactNode; testid?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      data-testid={testid}
      className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-left text-[14px] font-medium text-accent-text hover:bg-hover", FOCUS, className)}
    >
      {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
      {children}
    </button>
  );
}

// ── Filas del día ───────────────────────────────────────────────────────

interface TheoryRow {
  folder: string;
  title: string;
  minutes: number;
  part: number;
  parts: number;
  /** teoría + práctica… */
  sub: string;
  group?: string;
  groupTitle?: string;
}

function StateChip({ state }: { state: keyof typeof STATE_LABEL }) {
  const done = state === "completo";
  return (
    <Chip large colour={done ? "var(--nv-mint)" : state === "sin_tratar" ? undefined : "var(--nv-accent)"}>
      <span aria-hidden>{done ? "●" : state === "sin_tratar" ? "○" : "◐"}</span> {STATE_LABEL[state]}
    </Chip>
  );
}

function TheoryList({ rows, entryArea, stateOf, colour }: { rows: TheoryRow[]; entryArea: string; stateOf: (folder: string) => keyof typeof STATE_LABEL; colour: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card" aria-label="Teoría de hoy" data-testid="area-theory-list">
      {rows.map((r) => {
        const st = stateOf(r.folder);
        return (
          <li key={`${r.folder}:${r.part}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="area-theory-row" data-folder={r.folder}>
            <div className="min-w-0 flex-1 basis-60">
              <p className={cn("break-words text-[15px] font-semibold leading-snug", st === "completo" && "text-dim line-through decoration-faint/60")}>{r.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13.5px] text-dim">
                {r.sub && <span>{r.sub}</span>}
                <Chip large colour={colour}>{entryArea}</Chip>
                {r.groupTitle && <Chip large>{r.groupTitle}</Chip>}
                {r.parts > 1 && <span>parte {r.part} de {r.parts}</span>}
                <span className="font-mono">{hm(r.minutes)}</span>
              </p>
            </div>
            <StateChip state={st} />
            <GhostButton large="md" onClick={() => void openTopic(r.folder)} aria-label={`Ver tema: ${r.title}`} data-testid="area-theory-open">
              Ver tema
            </GhostButton>
          </li>
        );
      })}
    </ul>
  );
}

// ── El kata ─────────────────────────────────────────────────────────────

function KataCard({ area, ppBase, ppReady, today, mark, weekStrip, folderNotice }: { area: AreaPracticeView; ppBase: string; ppReady: boolean; today: string; mark: AreaPracticeState["mark"]; weekStrip: ReactNode; folderNotice: ReactNode }) {
  const toast = useApp((s) => s.toast);
  const uid = useId();
  const [help, setHelp] = useState(false);
  const [solution, setSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const next = area.kata.next;
  const isToday = !!next && next.date === today;
  const todayState = area.kata.week.find((d) => d.today)?.state;
  const def = useMemo(() => (next ? kataDefinition(next.kata.statement) : []), [next]);
  const template = useMemo(() => (next ? kataTemplate(next.kata) : ""), [next]);
  const open = async (): Promise<void> => {
    if (!next) return;
    try {
      await useApp.getState().openNote(`${ppBase}/${next.rel}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("error", "No se pudo copiar la plantilla: selecciónala y cópiala a mano.");
    }
  };
  return (
    <section className="min-w-0 rounded-2xl border border-accent/40 bg-card p-4 shadow-sm @3xl:p-5" data-testid="area-kata" aria-labelledby={`${uid}-t`}>
      <h5 id={`${uid}-t`} className="break-words text-[17px] font-bold leading-snug">
        {next ? `Kata de ${area.label} ${isToday ? "de hoy" : "siguiente"}: ${next.kata.title}` : `Sin katas de ${area.label} en este plan`}
      </h5>
      {next && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip large colour={PRACTICE_COLOUR}>{next.kata.skillName}</Chip>
          <Chip large>Nivel {next.kata.level} · {KATA_LEVEL_LABEL[next.kata.level]}</Chip>
          <Chip large>{next.kata.minutes} min</Chip>
          <span className="text-[13.5px] text-dim">kata {area.kata.todayIndex || "·"} · {isToday ? "hoy" : next.date}</span>
        </p>
      )}
      <div className="mt-3">{weekStrip}</div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] text-dim">
        <span data-testid="area-kata-count">{area.kata.doneDays}/{area.kata.plannedDays} días hechos</span>
        <span>· racha {area.kata.streak}</span>
        {area.kata.todayPlanned && (
          <Chip large colour={area.kata.todayDone ? "var(--nv-mint)" : "var(--nv-warn)"}>
            <span aria-hidden>{area.kata.todayDone ? "●" : "○"}</span> Hoy: {area.kata.todayDone ? "hecho" : "pendiente"}
          </Chip>
        )}
        {!area.kata.todayPlanned && <Chip large>Hoy no toca kata</Chip>}
      </p>

      {next && (
        <div className="mt-4 space-y-4" data-testid="area-kata-today">
          {def.length > 0 ? (
            <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line text-[14.5px]" data-testid="area-kata-def">
              {def.map((r) => (
                <div key={r.term} className="grid min-w-0 gap-x-4 gap-y-0.5 px-3.5 py-2.5 @xl:grid-cols-[9rem_minmax(0,1fr)]" data-testid="area-kata-def-row">
                  <dt className="text-[13px] font-semibold text-dim">{r.term}{r.note ? <span className="font-normal"> ({r.note})</span> : null}</dt>
                  <dd className="min-w-0 break-words">{r.text}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="break-words text-[14px] text-dim">{next.summary}</p>
          )}
          <p className="sr-only" data-testid="area-kata-summary">{next.summary}</p>

          <div className="min-w-0" data-testid="area-kata-template">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className={LABEL} id={`${uid}-tpl`}>Plantilla · .{kataTemplateExt(area.areaId)}</span>
              <GhostButton large="md" onClick={() => void copy()} data-testid="area-kata-copy" aria-label={copied ? "Plantilla copiada" : `Copiar plantilla del kata ${next.kata.title}`}>
                {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Copiada" : "Copiar plantilla"}
              </GhostButton>
            </div>
            <pre tabIndex={0} aria-labelledby={`${uid}-tpl`} className={cn("max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-3.5 font-mono text-[13px] leading-relaxed", FOCUS)}><code>{template}</code></pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {next.fileReady ? (
              <PrimaryButton large onClick={() => void open()} data-testid="area-kata-open"><ExternalLink size={15} aria-hidden /> Abrir Kata</PrimaryButton>
            ) : (
              <span className="text-[13.5px] text-dim" data-testid="area-kata-nofile">El archivo del kata aún no existe: {ppReady ? "se crea al ejecutar el plan." : "se crea al ejecutar el plan."}</span>
            )}
            {isToday && todayState !== "done" && (
              <GhostButton large onClick={() => void mark(area.areaId, today, "done")} title="Se marca solo si hay un intento calificado de este kata (nota de 75 o más)" data-testid="area-kata-done"><Check size={15} aria-hidden /> Marcar como lista</GhostButton>
            )}
            {isToday && todayState === "pending" && (
              <GhostButton large onClick={() => void mark(area.areaId, today, "skipped")} disabled={!area.kata.skip.allowed} title={area.kata.skip.allowed ? undefined : `Para saltar hace falta el ${area.kata.skip.neededPct} % de los katas hechos; llevas el ${area.kata.skip.pct} %`} data-testid="area-kata-skip"><SkipForward size={15} aria-hidden /> Saltar hoy</GhostButton>
            )}
            {isToday && (todayState === "done" || todayState === "skipped") && (
              <GhostButton large onClick={() => void mark(area.areaId, today, null)}><Undo2 size={15} aria-hidden /> Quitar marca</GhostButton>
            )}
            <Toggle open={help} onClick={() => setHelp((v) => !v)} controls={`${uid}-help`} testid="area-kata-help-toggle">Ver pistas y solución</Toggle>
          </div>

          {help && (
            <div id={`${uid}-help`} className="space-y-3 rounded-xl border border-line bg-surface/60 p-3.5" data-testid="area-kata-help">
              <ol className="list-decimal space-y-1 pl-5 text-[14px]" aria-label="Pistas">
                {next.kata.hints.map((h) => <li key={h}>{h}</li>)}
              </ol>
              <Toggle open={solution} onClick={() => setSolution((v) => !v)} controls={`${uid}-sol`} testid="area-kata-solution-toggle">{solution ? "Ocultar la solución" : "Mostrar la solución"}</Toggle>
              {solution && (
                <p id={`${uid}-sol`} className="break-words rounded-lg border border-line bg-card px-3 py-2 text-[14px]" data-testid="area-kata-solution">{next.kata.solution}</p>
              )}
              <p className="text-[13px] text-dim">Mirar la solución antes de intentarlo no cuenta como kata hecho.</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-4">{folderNotice}</div>
      <p className="mt-2 text-[13.5px] text-dim">Hecho = hay un intento calificado del kata (nota de 75 o más, sin ver la solución). No se puede marcar a mano sin esa verificación.</p>
    </section>
  );
}

// ── La página ───────────────────────────────────────────────────────────

export interface PracticeAreaViewProps {
  area: AreaPracticeView;
  ppBase: string;
  ppReady: boolean;
  today: string;
  mark: AreaPracticeState["mark"];
  plan?: MentorPlan;
  loaded?: Loaded;
  /** la tira L–D del kata y el aviso de carpeta (los pinta `PracticeCard`) */
  weekStrip: ReactNode;
  folderNotice: ReactNode;
  /** habilidades, proyecto de la semana, semanas y mensual */
  children?: ReactNode;
}

/** La página del área con el modelo de la agenda (los mismos temas de hoy que la Agenda y la Ejecución). */
export function PracticeAreaView(props: PracticeAreaViewProps) {
  const { plan, loaded } = props;
  return plan && loaded ? <WithModel {...props} plan={plan} loaded={loaded} /> : <AreaPage {...props} m={null} />;
}

function WithModel(props: PracticeAreaViewProps & { plan: MentorPlan; loaded: Loaded }) {
  const m = useAgendaModel(props.loaded, props.plan);
  return <AreaPage {...props} m={m} />;
}

function AreaPage({ area, ppBase, ppReady, today, mark, weekStrip, folderNotice, children, m }: PracticeAreaViewProps & { m: AgendaModel | null }) {
  const uid = useId();
  const colour = focusColour(area.areaId);
  const [tipClosed, setTipClosed] = usePersistedNav<boolean>("mentor.practiceTip.closed", false);
  const [sysOpen, setSysOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const sys = useMemo(() => areaPracticeSystem(area.areaId), [area.areaId]);

  const plan = m?.plan;
  const sub = plan?.subplans.find((s) => s.areaId === area.areaId);
  const date = plan ? clampToPlan(today, plan) : today;
  const day = m?.schedule.byDate.get(date);
  // LA regla de siempre: lo de hoy por área sale de `dayByArea`
  const entry = useMemo(() => (plan && day ? dayByArea(plan, day, m?.dueByDate.get(date) ?? []).find((e) => e.areaId === area.areaId) : undefined), [plan, day, m, date, area.areaId]);
  const stateOf = (folder: string): keyof typeof STATE_LABEL => (m?.topicByFolder.get(folder)?.state ?? "sin_tratar") as keyof typeof STATE_LABEL;
  const groupTitle = (g?: string): string | undefined => (g ? sub?.groups?.find((x) => x.id === g)?.title : undefined);

  const theory: TheoryRow[] = useMemo(() => {
    const seen = new Set<string>();
    const out: TheoryRow[] = [];
    for (const b of entry?.blocks ?? []) {
      if (b.kind !== "theory") continue;
      for (const i of b.items) {
        const k = `${i.folder}:${i.part}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ folder: i.folder, title: i.title, minutes: i.minutes, part: i.part, parts: i.parts, sub: "Teoría", ...(i.group ? { group: i.group } : {}), ...(groupTitle(i.group) ? { groupTitle: groupTitle(i.group)! } : {}) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, sub]);
  const langBlock = (day?.blocks ?? []).find((b) => b.daily && b.status !== "omitted" && (sub ? b.subplanId === sub.id : b.areaId === area.areaId));
  const langTopics = langBlock?.connectedTopics ?? [];
  const minutesOf = (folder: string): number | undefined => theory.find((r) => r.folder === folder)?.minutes;
  const vaultRows = useMemo(() => [...new Map(theory.map((r) => [r.folder, r] as const)).values()], [theory]);

  const total = m ? m.byWeekArea.totals[sub?.id ?? ""] : undefined;
  const topicsN = total?.topics ?? (plan && sub ? areaRouteTopics(plan, sub.id).length : 0);
  const hours = total ? Math.round(total.minutes / 6) / 10 : 0;
  const collections = plan && sub ? new Set(areaRouteTopics(plan, sub.id).map((t) => t.group).filter(Boolean)).size : 0;
  const kataDays = area.kata.week.filter((d) => d.planned).map((d) => DAY_SHORT[d.dow - 1]);
  const nextKata = area.kata.next;
  const kataToday = !!nextKata && nextKata.date === today;
  const kataDone = area.kata.week.find((d) => d.today)?.state === "done";

  // progreso de la sesión: teoría + lenguaje + ejercicios (cada tema, completo) + el kata de hoy
  const items = [
    ...theory.map((r) => stateOf(r.folder) === "completo"),
    ...langTopics.map((t) => stateOf(t.folder) === "completo"),
    ...vaultRows.map((r) => stateOf(r.folder) === "completo"),
    ...(kataToday ? [kataDone] : []),
  ];
  const doneN = items.filter(Boolean).length;
  const headCount = m ? `${topicsN} ${topicsN === 1 ? "tema" : "temas"} y práctica` : "práctica";

  return (
    <div className="space-y-6" data-testid="practice-area-view">
      <header className="space-y-2" data-testid="area-page-header">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[18px] font-bold text-white" style={{ background: colour }}>{area.label.slice(0, 1).toUpperCase()}</span>
          <h3 className="min-w-0 flex-1 basis-60 break-words text-[24px] font-bold leading-tight tracking-tight" data-testid="area-page-title">{area.label} · {headCount}</h3>
        </div>
        <p className="text-[14px] text-dim" data-testid="area-page-meta">
          {m && hours > 0 ? `~${hours} h estimadas` : "Horas por estimar"} · {m ? `${collections} ${collections === 1 ? "colección" : "colecciones"} en tu vault` : "colecciones en tu vault"} · {kataDays.length ? `kata ${kataDays.join(" · ")}` : "sin kata esta semana"}
        </p>
        <p className="max-w-3xl break-words text-[14.5px] leading-relaxed text-dim">
          <span className="font-medium text-text">{area.name}.</span> {area.purpose}
          {area.languages.length > 0 && <> Lenguajes: {area.languages.join(", ")}.</>}
        </p>
      </header>

      {!tipClosed && (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3" data-testid="area-tip">
          <Info size={18} aria-hidden className="mt-0.5 flex-none text-accent-text" />
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">Ruta de aprendizaje activa</p>
            <p className="text-[14px] text-dim">Hoy sigues la ruta de {area.label}: primero la teoría, después el kata y por último los ejercicios del tema. Terminar un tema abre el siguiente.</p>
          </div>
          <button type="button" onClick={() => setTipClosed(true)} aria-label="Cerrar el aviso «Ruta de aprendizaje activa»" className={cn("grid h-11 w-11 flex-none place-items-center rounded-lg text-dim hover:bg-hover hover:text-text", FOCUS)} data-testid="area-tip-close">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      {m && (
        <Section id={`${uid}-th`} label={`Teoría de ${area.label}`} aside={entry ? hm(entry.theoryMinutes) : undefined} testid="area-section-theory">
          {theory.length ? (
            <TheoryList rows={theory} entryArea={area.label} stateOf={stateOf} colour={colour} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="area-theory-empty">Hoy no toca teoría nueva de {area.label}.</p>
          )}
        </Section>
      )}

      <Section id={`${uid}-pr`} label={`Práctica de ${area.label}`} testid="area-section-practice">
        {sys && (
          <div className={cn(BOX, "py-2 @3xl:py-3")} data-testid="area-system">
            <Toggle open={sysOpen} onClick={() => setSysOpen((v) => !v)} controls={`${uid}-sys`} testid="area-system-toggle" className="w-full">
              <span className="min-w-0 break-words">Sistema de práctica de {area.label}: {sys.name}</span>
            </Toggle>
            {sysOpen && (
              <div id={`${uid}-sys`} className="space-y-2 pb-2 pl-2 pr-1 pt-1 text-[14px] text-dim">
                <p>{sys.purpose}</p>
                <Toggle open={archOpen} onClick={() => setArchOpen((v) => !v)} controls={`${uid}-arch`} testid="area-arch-toggle">Ver arquitectura de tests</Toggle>
                {archOpen && (
                  <ul id={`${uid}-arch`} className="space-y-1 pl-2" aria-label="Estructura de la carpeta del área" data-testid="area-arch">
                    {sys.structure.map((s) => (
                      <li key={s.path}><code className="rounded bg-hover px-1 font-mono text-[13px] text-text">{s.path}</code> · {s.purpose}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <KataCard area={area} ppBase={ppBase} ppReady={ppReady} today={today} mark={mark} weekStrip={weekStrip} folderNotice={folderNotice} />
      </Section>

      {m && langBlock && (
        <Section id={`${uid}-lg`} label={`Práctica de lenguaje (${langBlock.language ?? ""})`} aside={hm(langBlock.minutes)} testid="area-section-language">
          {langTopics.length ? (
            <div className="overflow-x-auto rounded-2xl border border-line bg-card" tabIndex={0} role="region" aria-label="Tabla de práctica de lenguaje">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[14px]" data-testid="area-language-table">
                <thead>
                  <tr className="border-b border-line text-[12px] uppercase tracking-wider text-dim">
                    {["Tema", "Módulo", "Progreso", "Tiempo", "Estado", "Acción"].map((h) => <th key={h} scope="col" className="px-3 py-2.5 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {langTopics.map((t) => {
                    const g = sub?.topics.find((x) => x.folder === t.folder)?.group;
                    const pct = m.topicByFolder.get(t.folder)?.pct ?? 0;
                    const mins = minutesOf(t.folder);
                    return (
                      <tr key={t.folder} data-testid="area-language-row">
                        <th scope="row" className="min-w-0 max-w-64 break-words px-3 py-2.5 font-medium">{t.title}</th>
                        <td className="px-3 py-2.5 text-dim">{groupTitle(g) ?? "—"}</td>
                        <td className="w-28 px-3 py-2.5"><ProgressBar pct={pct} colour={colour} label={`Progreso de ${t.title}`} /><span className="font-mono text-[12px] text-dim">{pct} %</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-dim">{mins ? hm(mins) : "—"}</td>
                        <td className="px-3 py-2.5"><StateChip state={stateOf(t.folder)} /></td>
                        <td className="px-3 py-2.5"><GhostButton large="md" onClick={() => void openTopic(t.folder)} aria-label={`Ver tema: ${t.title}`}>Ver tema</GhostButton></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="area-language-note">{langBlock.note}</p>
          )}
        </Section>
      )}

      {m && (
        <Section id={`${uid}-vx`} label="Vault de ejercicios" aside={`${vaultRows.length} ${vaultRows.length === 1 ? "reto" : "retos"}`} testid="area-section-vault">
          {vaultRows.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card" aria-label="Ejercicios de los temas de hoy" data-testid="area-vault-list">
              {vaultRows.map((r) => {
                const n = m.topicByFolder.get(r.folder)?.exercises ?? 0;
                return (
                  <li key={r.folder} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="area-vault-row">
                    <p className="min-w-0 flex-1 basis-60 break-words text-[15px]">Haz los ejercicios del tema «{r.title}»</p>
                    <Chip large colour={n > 0 ? "var(--nv-mint)" : undefined}>{n} en tu vault</Chip>
                    <GhostButton large="md" onClick={() => void openTopic(r.folder)} aria-label={`Abrir ejercicios del tema ${r.title}`} data-testid="area-vault-open">Abrir ejercicios</GhostButton>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line p-4 text-[14px] text-dim">Sin ejercicios por hacer: hoy no hay temas de {area.label}.</p>
          )}
        </Section>
      )}

      {children}

      {m && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3" data-testid="area-session-progress">
          <p className="text-[14.5px] font-semibold" role="status">Progreso de sesión: {doneN} de {items.length} completados</p>
          <div className="min-w-32 flex-1"><ProgressBar pct={items.length ? (doneN / items.length) * 100 : 0} colour={colour} label="Progreso de la sesión de hoy" /></div>
        </footer>
      )}
    </div>
  );
}

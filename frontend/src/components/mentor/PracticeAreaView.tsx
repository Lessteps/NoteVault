// Mentor — Plan, pestaña «Práctica»: la página de UN área (Backend, Frontend…), con aire de página de Notion.
//
// De arriba abajo: cabecera (icono, «Área · práctica», cadencia del kata), el aviso descartable, la PRÁCTICA del área y el progreso de la sesión. La práctica es
// SOLO la que asigna el proyecto: la cadena proyecto del mes → proyecto de la semana → piezas diarias del área (`AreaPracticeChain`) y el kata de hoy (sistema + rejilla
// de definición, plantilla copiable y pistas/solución ocultas hasta abrirlas). NO hay temas de teoría aquí (viven en «Ejecución»). Debajo van las habilidades y los
// proyectos por semana y mensual (los pinta `PracticeCard` y llegan como `children`).
//
// Los datos NO se inventan: la cadena sale de `planChain` (el mismo modelo que los Proyectos) y el kata de `AreaPracticeView`. Sin plan cargado (`plan`/`loaded`
// ausentes) solo se pinta el bloque del kata.

import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Info, SkipForward, Undo2, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { KATA_LEVEL_LABEL, areaPracticeSystem } from "../../lib/areaPracticeSystem";
import type { AreaPracticeView } from "../../lib/areaPracticeView";
import { kataDefinition, kataTemplate, kataTemplateExt } from "../../lib/kataView";
import { clampToPlan } from "../../lib/planSchedule";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { usePersistedNav } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { AreaPracticeChain, areaChainOf, todayPieceOf } from "./AreaPracticeChain";
import { focusColour, useAgendaModel, type AgendaModel } from "./agendaKit";
import { ProgressBar } from "./parts";
import type { AreaPracticeState } from "./PracticeCard";
import { DAY_SHORT, type Loaded } from "./planShared";

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

function AreaPage({ area, ppBase, ppReady, today, mark, weekStrip, folderNotice, children, m, plan: planProp, loaded }: PracticeAreaViewProps & { m: AgendaModel | null }) {
  const uid = useId();
  const colour = focusColour(area.areaId);
  const [tipClosed, setTipClosed] = usePersistedNav<boolean>("mentor.practiceTip.closed", false);
  const [sysOpen, setSysOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const sys = useMemo(() => areaPracticeSystem(area.areaId), [area.areaId]);

  const plan = m?.plan ?? planProp;
  const date = plan ? clampToPlan(today, plan) : today;
  // la práctica del área sale de la cadena de proyectos (mes → semana → piezas diarias), no de los temas de teoría
  const pieces = useMemo(() => (m && plan && loaded ? areaChainOf(plan, m, loaded, area.areaId, date).pieces : []), [m, plan, loaded, area.areaId, date]);
  const todayPiece = todayPieceOf(pieces, date);
  const kataDays = area.kata.week.filter((d) => d.planned).map((d) => DAY_SHORT[d.dow - 1]);
  const nextKata = area.kata.next;
  const kataToday = !!nextKata && nextKata.date === today;
  const kataDone = area.kata.week.find((d) => d.today)?.state === "done";

  // progreso de la sesión: la pieza del proyecto de hoy + el kata de hoy
  const items = [...(todayPiece ? [todayPiece.done] : []), ...(kataToday ? [kataDone] : [])];
  const doneN = items.filter(Boolean).length;
  const headCount = "práctica";

  return (
    <div className="space-y-6" data-testid="practice-area-view">
      <header className="space-y-2" data-testid="area-page-header">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[18px] font-bold text-white" style={{ background: colour }}>{area.label.slice(0, 1).toUpperCase()}</span>
          <h3 className="min-w-0 flex-1 basis-60 break-words text-[24px] font-bold leading-tight tracking-tight" data-testid="area-page-title">{area.label} · {headCount}</h3>
        </div>
        <p className="text-[14px] text-dim" data-testid="area-page-meta">
          {kataDays.length ? `kata ${kataDays.join(" · ")}` : "sin kata esta semana"}{pieces.length ? ` · ${pieces.length} ${pieces.length === 1 ? "pieza" : "piezas"} del proyecto esta semana` : ""}
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
            <p className="text-[14.5px] font-semibold">Práctica por proyecto</p>
            <p className="text-[14px] text-dim">Aquí solo está la práctica de {area.label}: la pieza de hoy suma al proyecto de la semana y este al proyecto del mes; el kata entrena la habilidad. La teoría está en «Ejecución».</p>
          </div>
          <button type="button" onClick={() => setTipClosed(true)} aria-label="Cerrar el aviso «Práctica por proyecto»" className={cn("grid h-11 w-11 flex-none place-items-center rounded-lg text-dim hover:bg-hover hover:text-text", FOCUS)} data-testid="area-tip-close">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      <Section id={`${uid}-pr`} label={`Práctica de ${area.label}`} testid="area-section-practice">
        {m && plan && loaded && <AreaPracticeChain plan={plan} m={m} loaded={loaded} areaId={area.areaId} areaLabel={area.label} today={date} colour={colour} />}
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

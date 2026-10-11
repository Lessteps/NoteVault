// Mentor — Plan, vista de ejecución: el TABLERO «Cómo voy». Una tarjeta por área con su avance y sus temas; cada tema se abre con su flecha,
// que ofrece ir al apunte (.md) o al archivo de práctica. Solo lectura: marcar un tema como completado lo decide la práctica, no este
// tablero. Respeta la ruta sólida (`lib/planGate.ts`): los temas repartidos después del primer día sin terminar salen bloqueados.

import { BookOpen, Dumbbell, ExternalLink, Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PlanGate } from "../../lib/planGate";
import { dateLabel } from "../../lib/planSchedule";
import { orderedAreas } from "../../lib/planTopicsByArea";
import type { MentorPlan, MentorTopicView } from "../../lib/types";
import { cn } from "../ui";
import { focusColour } from "./agendaKit";
import { openTopic, openTopicNote } from "./openTopic";
import { ProgressBar } from "./parts";
import { AreaPracticeBlock } from "./AreaPracticeBlock";
import type { AreaPracticeState } from "./PracticeCard";
import { RowMenu } from "./RowMenu";
import { SectionHeading } from "./planKit";
import { openPlanTab, STATE_LABEL, type Loaded } from "./planShared";
import type { AreaPracticeView } from "../../lib/areaPracticeView";

const VISIBLE = 4;
const FILTERS = [
  { id: "todos", label: "Todos los temas" },
  { id: "semana", label: "Esta semana" },
  { id: "pendientes", label: "Pendientes" },
  { id: "practica", label: "Con práctica" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

export interface BoardRow {
  folder: string;
  /** grupo del área al que pertenece (Bases, Lenguaje: Python, Conocimientos…) */
  group?: string;
  /** texto secundario (parte, minutos…) */
  meta?: string;
  title: string;
  week: number;
  state: MentorTopicView["state"];
  done: boolean;
  exercises: number;
  unlockOn?: string;
}

/** El menú de un tema: ir al apunte (.md) o al archivo de práctica. */
function TopicMenu({ folder, title }: { folder: string; title: string }) {
  return (
    <RowMenu
      title={title}
      items={[
        { id: "note", label: "Abrir apunte (.md)", icon: <BookOpen size={16} aria-hidden className="text-accent-text" />, onClick: () => void openTopicNote(folder), testid: "board-open-note" },
        { id: "practice", label: "Abrir archivo de práctica", icon: <Dumbbell size={16} aria-hidden className="text-mint" />, onClick: () => void openTopic(folder), testid: "board-open-practice" },
      ]}
    />
  );
}

export function TopicRow({ r, colour }: { r: BoardRow; colour: string }) {
  const locked = !!r.unlockOn;
  const working = !r.done && !locked && r.state !== "sin_tratar";
  return (
    <li
      className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-colors", locked ? "border-transparent opacity-55" : "border-transparent hover:border-line hover:bg-surface", working && "border-line bg-surface")}
      data-testid="board-topic"
      data-state={locked ? "bloqueado" : r.done ? "completo" : r.state}
    >
      <span
        aria-hidden
        className="grid h-5 w-5 flex-none place-items-center rounded-md border text-[12px] font-bold text-white"
        style={r.done ? { background: colour, borderColor: colour } : { borderColor: "var(--nv-line, currentColor)" }}
      >
        {r.done ? "✓" : locked ? <Lock size={11} className="text-faint" /> : null}
      </span>
      <span className={cn("min-w-0 flex-1 text-[15px] leading-snug", r.done && "text-faint line-through decoration-faint/60")}>
        {r.title}
        {r.meta ? <span className="text-[13.5px] font-normal text-dim"> · {r.meta}</span> : null}
        <span className="sr-only">, {locked ? `bloqueado hasta terminar el ${dateLabel(r.unlockOn!)}` : r.done ? "completado" : STATE_LABEL[r.state]}</span>
      </span>
      {working && (
        <span className="flex-none rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: colour, borderColor: `${colour}66`, background: `${colour}1a` }}>
          {r.state === "practicando" ? "Activo" : STATE_LABEL[r.state]}
        </span>
      )}
      {locked ? (
        <span className="flex-none text-[12.5px] text-faint" title={`Termina antes los temas del ${dateLabel(r.unlockOn!)}`}>
          <span className="sr-only">Bloqueado</span>
          <Lock size={14} aria-hidden />
        </span>
      ) : (
        <TopicMenu folder={r.folder} title={r.title} />
      )}
    </li>
  );
}

/** La tarjeta de un área, común al tablero «Cómo voy», a los temas de hoy y a la práctica de hoy. */
export function AreaCardShell({ colour, title, badge, sub, tag, children, footer, testid, area }: { colour: string; title: string; badge?: string; sub?: string; tag?: string; children: ReactNode; footer?: ReactNode; testid?: string; area?: string }) {
  return (
    <li className="relative rounded-2xl border border-line bg-card" style={{ borderTop: `3px solid ${colour}`, boxShadow: `0 8px 24px -18px ${colour}` }} data-testid={testid} data-area={area}>
      <header className="flex items-center gap-2.5 px-4 pt-3.5">
        <span aria-hidden className="inline-block h-3 w-3 flex-none rounded-full" style={{ background: colour }} />
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold">{title}</h3>
        {badge && <span className="rounded-md px-2 py-0.5 text-[14px] font-bold" style={{ color: colour, background: `${colour}22` }}>{badge}</span>}
      </header>
      {(sub || tag) && (
        <div className="flex items-center gap-2 px-4 pb-2 pt-1.5 text-[13.5px] text-dim">
          {sub && <span className="font-mono">{sub}</span>}
          <span className="flex-1" />
          {tag && <span className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: colour, borderColor: `${colour}55` }}>{tag}</span>}
        </div>
      )}
      <div className="border-t border-line px-2 py-2">{children}</div>
      {footer && <footer className="flex items-center gap-2 border-t border-line px-4 py-2 text-[13.5px]">{footer}</footer>}
    </li>
  );
}

/** La práctica diaria de cada área, que se pinta DENTRO de la tarjeta del área. */
export interface BoardPractice {
  areas: AreaPracticeView[];
  today: string;
  mark: AreaPracticeState["mark"];
}

export function PlanBoard({ plan, data, byFolder, gate, currentWeek, practice }: { plan: MentorPlan; data: Loaded; byFolder: Map<string, MentorTopicView>; gate: PlanGate; currentWeek: number; practice?: BoardPractice }) {
  const [filter, setFilter] = useState<FilterId>("todos");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** grupo elegido en cada área («» = todos a la vez) */
  const [groupSel, setGroupSel] = useState<Record<string, string>>({});
  const summary = data.derived?.summary;
  const areas = orderedAreas(plan).map((a) => {
    const sub = plan.subplans.find((s) => s.id === a.subplanId)!;
    const view = data.derived?.subplans.find((s) => s.id === a.subplanId);
    const rows: BoardRow[] = sub.topics
      .filter((t) => t.route !== "skipped")
      .map((t) => {
        const live = byFolder.get(t.folder);
        const state = live?.state ?? "sin_tratar";
        return { folder: t.folder, ...(t.group ? { group: t.group } : {}), title: t.title, week: t.targetWeek, state, done: state === "completo" || !!t.completedAt, exercises: live?.exercises ?? 0, unlockOn: gate.locked.get(t.folder) };
      });
    const phaseFrom = (sub as { phase?: { fromWeek: number } }).phase?.fromWeek ?? 1;
    const groups = (sub.groups ?? []).map((g) => ({ id: g.id, title: g.title, n: rows.filter((r) => r.group === g.id && !r.done).length, all: rows.filter((r) => r.group === g.id).length })).filter((g) => g.all > 0);
    return { a, rows, pct: view?.pct ?? 0, phaseFrom, groups };
  });
  if (!summary) return null;

  const keep = (r: BoardRow): boolean => (filter === "todos" ? true : filter === "semana" ? r.week === currentWeek : filter === "pendientes" ? !r.done : r.exercises > 0);
  const toggle = (id: string): void => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <section aria-labelledby="run-progress-h" data-testid="run-progress" className="space-y-4">
      <SectionHeading
        id="run-progress-h"
        hint={`Semana ${summary.currentWeek} de ${summary.weeks} · ${summary.done}/${summary.topics} temas completados. Cada área junta sus temas y su práctica diaria.`}
        right={practice && practice.areas.length > 0 ? <button type="button" onClick={() => openPlanTab(plan.id, "practica")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[14px] text-dim hover:bg-hover hover:text-text" data-testid="run-practice-all"><ExternalLink size={14} aria-hidden /> Toda la práctica</button> : undefined}
      >
        Cómo voy
      </SectionHeading>

      <div className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="board-global">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[17px] font-semibold">Plan completo</h3>
          <span className="flex-1" />
          <span className="text-[13px] uppercase tracking-wider text-faint">Progreso general</span>
          <span className="text-[26px] font-extrabold leading-none text-accent-text">{summary.pct} %</span>
        </div>
        <div className="mt-3"><ProgressBar pct={summary.pct} thick label="Avance global del plan" /></div>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 @3xl:grid-cols-3 @6xl:grid-cols-6" aria-label="Avance por área">
          {areas.map(({ a, pct }) => (
            <li key={a.subplanId} className="flex items-center gap-2 text-[14px]">
              <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: focusColour(a.areaId) }} />
              <span className="min-w-0 flex-1 truncate text-dim">{a.area}</span>
              <span className="font-semibold">{pct} %</span>
            </li>
          ))}
        </ul>
      </div>

      <div role="group" aria-label="Filtrar temas" className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-card p-1" data-testid="board-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("min-h-9 rounded-lg px-3 text-[14px] font-medium", filter === f.id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {areas.map(({ a, rows, pct, phaseFrom, groups }) => {
          const colour = focusColour(a.areaId);
          const sel = groups.some((g) => g.id === groupSel[a.subplanId]) ? groupSel[a.subplanId]! : "";
          const shown = rows.filter(keep).filter((r) => !sel || r.group === sel);
          const first = Math.max(0, shown.findIndex((r) => !r.done) - 1);
          const open = expanded.has(a.subplanId);
          const list = open ? shown : shown.slice(first, first + VISIBLE);
          const hidden = shown.length - list.length;
          const doneN = rows.filter((r) => r.done).length;
          const thisWeek = rows.some((r) => !r.done && r.week === currentWeek);
          const tag = pct >= 100 ? "Completa" : thisWeek ? "Esta semana" : phaseFrom > currentWeek ? "Próximo" : "En curso";
          return (
            <AreaCardShell
              key={a.subplanId}
              colour={colour}
              title={a.area}
              badge={`${pct} %`}
              sub={`${doneN}/${rows.length} temas`}
              tag={tag}
              testid="run-area-progress"
              area={a.areaId ?? a.subplanId}
              footer={
                hidden > 0 || open ? (
                  <>
                    <span className="text-dim">{open ? `${shown.length} temas` : `+${hidden} ${hidden === 1 ? "tema" : "temas"} por revisar`}</span>
                    <span className="flex-1" />
                    <button type="button" onClick={() => toggle(a.subplanId)} aria-expanded={open} className="inline-flex min-h-8 items-center px-1 font-medium underline-offset-2 hover:underline" style={{ color: colour }}>
                      {open ? "Ver menos" : "Ver todos"}
                    </button>
                  </>
                ) : undefined
              }
            >
              {groups.length > 1 && (
                <div className="px-1.5 pb-2" data-testid="group-chips">
                  <div role="group" aria-label={`Subáreas de ${a.area}`} className="flex flex-wrap gap-1">
                    {[{ id: "", title: "Todas a la vez", n: groups.reduce((x, g) => x + g.n, 0) }, ...groups].map((g) => (
                      <button
                        key={g.id || "all"}
                        type="button"
                        aria-pressed={sel === g.id}
                        onClick={() => setGroupSel((s) => ({ ...s, [a.subplanId]: g.id }))}
                        className={cn("rounded-md border px-2 py-0.5 text-[12.5px]", sel === g.id ? "border-accent bg-accent-soft text-text" : "border-line text-dim hover:bg-hover")}
                        data-testid="group-chip"
                      >
                        {g.title} <span className="text-faint">{g.n}</span>
                      </button>
                    ))}
                  </div>
                  {!sel && <p className="mt-1 text-[12.5px] text-faint">Estos grupos avanzan a la vez cada día: los fundamentos se intercalan con el lenguaje, no van antes.</p>}
                </div>
              )}
              {list.length === 0 ? (
                <p className="px-2.5 py-3 text-[14px] text-faint">Ningún tema con este filtro.</p>
              ) : (
                <ul className="space-y-0.5" aria-label={`Temas de ${a.area}`}>
                  {list.map((r) => <TopicRow key={r.folder} r={r} colour={colour} />)}
                </ul>
              )}
              {practice && (() => {
                const pa = practice.areas.find((x) => x.areaId === a.areaId);
                return pa ? <AreaPracticeBlock planId={plan.id} area={pa} mark={practice.mark} /> : null;
              })()}
            </AreaCardShell>
          );
        })}
      </ul>
    </section>
  );
}

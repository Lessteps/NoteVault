// Mentor — Plan, vista de ejecución: las piezas comunes del tablero: la fila de un tema (`TopicRow`, cuya flecha ofrece ir al apunte (.md) o al
// archivo de práctica) y el avance de cada área (`ProgressOverview`). Solo lectura: marcar un tema como completado lo decide la práctica.
// Respeta la ruta sólida (`lib/planGate.ts`): los temas repartidos después del primer día sin terminar salen bloqueados.

import { BookOpen, Dumbbell, Lock } from "lucide-react";
import { dateLabel } from "../../lib/planSchedule";
import { orderedAreas } from "../../lib/planTopicsByArea";
import type { MentorPlan, MentorTopicView } from "../../lib/types";
import { cn } from "../ui";
import { focusColour } from "./agendaKit";
import { openTopic, openTopicNote } from "./openTopic";
import { ProgressBar } from "./parts";
import type { AreaPracticeState } from "./PracticeCard";
import { RowMenu } from "./RowMenu";
import { SectionHeading } from "./planKit";
import { STATE_LABEL, type Loaded } from "./planShared";
import type { AreaPracticeView } from "../../lib/areaPracticeView";

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
  /** aviso a la derecha de la fila («Hoy», «Atrasado»…) */
  tag?: { text: string; colour?: string };
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
      {r.tag && (
        <span className="flex-none rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: r.tag.colour ?? colour, borderColor: `${r.tag.colour ?? colour}66`, background: `${r.tag.colour ?? colour}1a` }} data-testid="board-tag">
          {r.tag.text}
        </span>
      )}
      {working && !r.tag && (
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

/** La práctica diaria de cada área, que se pinta DENTRO de la tarjeta del área. */
export interface BoardPractice {
  areas: AreaPracticeView[];
  today: string;
  mark: AreaPracticeState["mark"];
}

/** Progreso de cada área en la vista general (solo avance, sin listas de temas); pulsar un área la abre en su pestaña. */
export function ProgressOverview({ plan, data, onPick, compact }: { plan: MentorPlan; data: Loaded; onPick?: (subplanId: string) => void; /** versión estrecha para la columna lateral: una columna y sin cabecera de sección */ compact?: boolean }) {
  const summary = data.derived?.summary;
  if (!summary) return null;
  const areas = orderedAreas(plan).map((a) => {
    const view = data.derived?.subplans.find((s) => s.id === a.subplanId);
    return { a, pct: view?.pct ?? 0, done: view?.done ?? 0, total: view?.total ?? 0 };
  });
  return (
    <section aria-labelledby="run-overview-h" data-testid="run-overview" className="space-y-3">
      {compact ? <h2 id="run-overview-h" className="sr-only">Ruta de áreas</h2> : <SectionHeading id="run-overview-h" hint={`Semana ${summary.currentWeek} de ${summary.weeks} · ${summary.done}/${summary.topics} temas completados.`}>Progreso general</SectionHeading>}
      <div className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="board-global">
        {compact && <p className="mb-2 flex items-baseline text-[13px] text-dim"><span className="text-[16px] font-bold text-text">Ruta de áreas</span><span className="flex-1" /> Semana {summary.currentWeek} de {summary.weeks}</p>}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[17px] font-semibold">Plan completo</h3>
          <span className="flex-1" />
          <span className="text-[26px] font-extrabold leading-none text-accent-text">{summary.pct} %</span>
        </div>
        <div className="mt-3"><ProgressBar pct={summary.pct} thick label="Avance global del plan" /></div>
        <ul className={cn("mt-4 grid gap-x-8 gap-y-2.5", !compact && "@3xl:grid-cols-2")} aria-label="Avance por área">
          {areas.map(({ a, pct, done, total }) => (
            <li key={a.subplanId}>
              <button type="button" onClick={() => onPick?.(a.subplanId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover" data-testid="overview-area" aria-label={`${a.area}: ${pct} %, ${done} de ${total} temas. Abrir el área`}>
                <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: focusColour(a.areaId) }} />
                <span className={cn("flex-none truncate text-[14.5px]", compact ? "w-32" : "w-40")}>{a.area}</span>
                <span className="min-w-0 flex-1"><ProgressBar pct={pct} label={`Avance de ${a.area}`} /></span>
                <span className="w-24 flex-none text-right text-[13.5px] text-dim"><strong className="text-text">{pct} %</strong> · {done}/{total}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { ChevronRight, ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dateLabel, longDateLabel } from "../../lib/planSchedule";
import { dayByArea } from "../../lib/planTopicsByArea";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useCalendar } from "../../store/calendar";
import { GhostButton } from "../common/forms";
import { PEEK_LABEL } from "../common/peek";
import { cn } from "../ui";
import type { AgendaModel } from "./agendaKit";
import { DayDetail } from "./AgendaViews";
import { AreaDot } from "./AreaViews";
import { openTopic } from "./openTopic";

export function DayNotionPeek({
  m,
  date,
  areaFilter,
  onClose,
  onChanged,
}: {
  m: AgendaModel;
  date: string | null;
  areaFilter?: string | null;
  onClose: () => void;
  onChanged: (p: MentorPlan) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!date) return null;

  const day = m.schedule.byDate.get(date);
  const due = m.dueByDate.get(date) ?? [];
  const entries = day ? dayByArea(m.plan, day, due).filter((e) => !areaFilter || e.subplanId === areaFilter) : [];
  const isToday = date === m.today;
  const inPlan = date >= m.plan.start && date <= m.plan.end;

  const openGlobalCalendar = () => {
    useCalendar.getState().setDay(date);
    useCalendar.getState().setView("dia");
    useApp.getState().openTab({ kind: "module", id: "calendario" });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del día ${longDateLabel(date)}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-6"
      data-testid="day-notion-peek-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        data-testid="day-notion-peek"
        className={cn(
          "flex max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl transition-all duration-150",
          expanded ? "h-[92vh] w-[95vw] max-w-5xl" : "h-[85vh] w-[90vw] max-w-3xl"
        )}
      >
        {/* Cabecera superior tipo Notion */}
        <div className="flex h-12 flex-none items-center justify-between border-b border-line px-4">
          <div className="flex items-center gap-1.5 text-[12.5px] text-dim">
            <span className="font-semibold text-text">Mentor</span>
            <ChevronRight size={13} className="text-faint" />
            <span>Calendario</span>
            <ChevronRight size={13} className="text-faint" />
            <span className="font-medium text-text">{dateLabel(date)}</span>
          </div>

          <div className="flex items-center gap-1">
            <GhostButton
              aria-label="Abrir en Calendario global"
              title="Abrir en Calendario global"
              onClick={openGlobalCalendar}
              data-testid="btn-open-global-cal"
            >
              <ExternalLink size={14} /> Calendario global
            </GhostButton>
            <button
              type="button"
              aria-label={expanded ? "Restaurar" : "Maximizar"}
              onClick={() => setExpanded((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-hover hover:text-text"
            >
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-hover hover:text-text"
              data-testid="btn-close-peek"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contenido scrolleable tipo Notion */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                {isToday ? "Hoy" : inPlan ? "Día de estudio" : "Fuera del plan"}
              </span>
              {day && !day.study && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                  {day.blocked ? "Día bloqueado" : "Día de descanso"}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-[26px] font-bold text-text sm:text-[32px]">
              {longDateLabel(date)}
            </h1>
          </div>

          {/* Bloque de propiedades estilo Notion */}
          <div className="rounded-xl border border-line bg-surface/50 p-3.5">
            <dl className="grid gap-2 text-[13.5px] sm:grid-cols-[8rem_1fr]">
              <dt className="font-mono uppercase tracking-wider text-faint" style={{ color: PEEK_LABEL }}>
                ÁREAS
              </dt>
              <dd className="flex flex-wrap items-center gap-2">
                {entries.length > 0 ? (
                  entries.map((e) => (
                    <span
                      key={e.subplanId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 text-[12.5px] font-medium"
                    >
                      <AreaDot {...(e.areaId ? { areaId: e.areaId } : {})} />
                      {e.area}
                    </span>
                  ))
                ) : (
                  <span className="text-dim">Sin áreas programadas</span>
                )}
              </dd>

              <dt className="font-mono uppercase tracking-wider text-faint" style={{ color: PEEK_LABEL }}>
                CARGA ESTIMADA
              </dt>
              <dd className="font-medium text-text">
                {entries.reduce((a, b) => a + b.theoryMinutes + b.practiceMinutes, 0)} minutos ({entries.reduce((a, b) => a + b.theoryTopics, 0)} temas de teoría, {entries.reduce((a, b) => a + b.practiceBlocks, 0)} bloques de práctica)
              </dd>

              <dt className="font-mono uppercase tracking-wider text-faint" style={{ color: PEEK_LABEL }}>
                SINCRONIZACIÓN
              </dt>
              <dd className="text-dim">
                Vinculado automáticamente con el módulo de Calendario global
              </dd>
            </dl>
          </div>

          {/* Desglose de temas por área y asignatura */}
          {entries.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-mono text-[12px] font-semibold uppercase tracking-wider text-faint">
                Temas y contenidos programados
              </h3>
              <div className="space-y-3">
                {entries.map((e) => (
                  <div
                    key={e.subplanId}
                    className="space-y-2 rounded-xl border border-line bg-card p-4"
                    data-testid={`peek-area-${e.subplanId}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AreaDot {...(e.areaId ? { areaId: e.areaId } : {})} />
                        <h4 className="text-[15px] font-bold text-text">{e.area}</h4>
                      </div>
                      <span className="text-[12px] text-dim">
                        {e.theoryMinutes + e.practiceMinutes} min
                      </span>
                    </div>

                    <ul className="space-y-1.5 pt-1">
                      {(day?.topics.filter((t) => t.subplanId === e.subplanId) ?? []).map((t) => (
                        <li
                          key={t.folder}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px]"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-text">{t.title}</span>
                            <span className="block text-[12px] text-dim font-mono">{t.folder}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <GhostButton
                              aria-label={`Estudiar ${t.title}`}
                              onClick={() => void openTopic(t.folder)}
                            >
                              Estudiar
                            </GhostButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DayDetail integrado */}
          <div className="border-t border-line pt-4">
            <DayDetail m={m} date={date} onChanged={onChanged} headingId="peek-day-detail-h" level={3} areaFilter={areaFilter} />
          </div>
        </div>
      </div>
    </div>
  );
}

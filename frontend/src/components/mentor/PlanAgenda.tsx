// Mentor — Plan, pestaña «Agenda»: el plan por DÍA, SEMANA, MES y CALENDARIO, en el presente, el futuro (hasta el fin del plan) y el pasado.
//
// Un control segmentado (pestañas WAI-ARIA anidadas) cambia de vista; una barra de navegación común mueve el periodo (← anterior, siguiente →,
// «Hoy», «Esta semana», «Este mes» y un selector de fecha). Un plan propuesto o futuro muestra su calendario desde su fecha de inicio.
// Al cambiar de periodo o de vista se anuncia en una región `aria-live` («Semana 3 · 20–26 oct: 12 temas, 4 entregables»).

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AGENDA_VIEWS, canShift, clampToPlan, dayBlockCounts, deliverablesText, monthSummary, periodTitle, shiftAnchor, topicsText, weekSummary, type AgendaView } from "../../lib/planSchedule";
import { daysBetween, isDate } from "../../lib/planTime";
import type { MentorPlan } from "../../lib/types";
import { useNavState, usePersistedNav } from "../../store/navState";
import { orderedAreas } from "../../lib/planTopicsByArea";
import { cn } from "../ui";
import { GhostButton } from "../common/forms";
import { AgendaCalendar } from "./AgendaCalendar";
import { PracticeCurriculumBar } from "./AgendaDayFocus";
import { DayDetail, MonthDetail, WeekDetail } from "./AgendaViews";
import { AreaDot } from "./AreaViews";
import { PhaseMonthTable } from "./PlanMonths";
import { PhaseTimeline } from "./PlanSubplans";
import { useAgendaModel } from "./agendaKit";
import { TabPanel, Tabs } from "./planKit";
import { agendaDateKey, type Loaded } from "./planShared";

const PREFIX = "agenda-view";
export const agendaViewKey = (planId: string): string => `mentor.agendaView.${planId}`;

const VIEW_NOUN: Record<AgendaView, string> = { dia: "Día", semana: "Semana", mes: "Mes", calendario: "Mes" };

export function PlanAgenda({ data, plan, onChanged, announce }: { data: Loaded; plan: MentorPlan; onChanged: (p: MentorPlan) => void; announce: (msg: string) => void }) {
  const uid = useId();
  const [stored, setStored] = usePersistedNav<string>(agendaViewKey(plan.id), "semana");
  const view: AgendaView = AGENDA_VIEWS.some((v) => v.id === stored) ? (stored as AgendaView) : "semana";
  // un plan propuesto o futuro se abre en su fecha de inicio; uno en curso, en hoy; uno terminado, en su último día
  // una fecha pedida desde fuera («Ver este mes en la Agenda») se lee al montar y se consume una sola vez
  const pendingDate = usePersistedNav<string>(agendaDateKey(plan.id), "")[0];
  const [anchor, setAnchorRaw] = useState(() => clampToPlan(isDate(pendingDate) ? pendingDate : data.today, plan));
  const setAnchor = useCallback((d: string) => setAnchorRaw(clampToPlan(d, plan)), [plan]);
  useEffect(() => {
    if (!isDate(pendingDate)) return;
    setAnchorRaw(clampToPlan(pendingDate, plan));
    useNavState.getState().set(agendaDateKey(plan.id), "");
  }, [pendingDate, plan]);
  const m = useAgendaModel(data, plan);
  // la Agenda se ve por ÁREA (pestañas «Todas · Backend · Frontend…»): lo elegido se recuerda por plan, con la misma clave que usaba el filtro del calendario
  const [storedArea, setStoredArea] = usePersistedNav<string>(`mentor.agendaArea.${plan.id}`, "");
  const only = storedArea && plan.subplans.some((x) => x.id === storedArea) ? storedArea : null;
  const areaTabs = useMemo(() => orderedAreas(plan), [plan]);
  const live = useRef("");
  const [liveText, setLiveText] = useState("");

  // al cambiar el plan (p. ej. tras «Reorganizar») el ancla sigue dentro de él
  useEffect(() => setAnchorRaw((a) => clampToPlan(a, plan)), [plan]);

  // mientras no haya entregables definidos, el resumen dice «entregables por definir» (sin contarlos)
  const delText = useCallback((n: number): string => (m.deliverablesDefined ? deliverablesText(n) : "entregables por definir"), [m.deliverablesDefined]);
  const summary = useMemo(() => {
    if (view === "dia") {
      const d = m.schedule.byDate.get(anchor);
      if (!d) return "fuera del plan";
      const c = dayBlockCounts(d);
      return `${d.focus ? `enfoque ${d.focus.label}, ${c.theory} ${c.theory === 1 ? "teoría" : "teorías"}, ${c.practice} ${c.practice === 1 ? "práctica" : "prácticas"}, ` : ""}${topicsText(d.topics.length)}, ${delText((m.dueByDate.get(anchor) ?? []).length)}`;
    }
    if (view === "semana") {
      const w = weekSummary(plan, m.schedule, Math.floor(daysBetween(plan.start, anchor) / 7) + 1, m.deliverablesDefined ? m.deliverables : []);
      return w ? `${topicsText(w.topics)}, ${delText(w.deliverables.length)}` : "";
    }
    const s = monthSummary(plan, m.schedule, anchor.slice(0, 7), m.deliverablesDefined ? m.deliverables : []);
    return s ? `${topicsText(s.topics)}, ${delText(s.deliverables.length)}` : "";
  }, [view, anchor, m, plan, delText]);
  const title = periodTitle(view === "calendario" ? "mes" : view, anchor, plan);

  // anuncia el periodo mostrado cuando cambia (no en la primera pintura)
  const first = useRef(true);
  useEffect(() => {
    const t = `${title}: ${summary}.`;
    if (first.current) {
      first.current = false;
      live.current = t;
      return;
    }
    if (live.current !== t) {
      live.current = t;
      setLiveText(t);
      announce(t);
    }
  }, [title, summary, announce]);

  const setView = (id: string) => setStored(id);
  const shift = (delta: number) => setAnchor(shiftAnchor(view === "calendario" ? "mes" : view, anchor, delta, plan));
  const navView: AgendaView = view === "calendario" ? "mes" : view;
  const noun = view === "dia" ? "día" : view === "semana" ? "semana" : "mes";
  const goToday = () => setAnchor(data.today);
  const pickWeek = (date: string) => {
    setAnchor(date);
    setView("semana");
  };
  const pickDay = (date: string) => {
    setAnchor(date);
    setView("dia");
  };
  const summary0 = data.derived?.summary;
  const status = data.today < plan.start ? "El plan aún no ha empezado: este es su calendario desde la fecha de inicio." : data.today > plan.end ? "El plan ya terminó: puedes repasar cualquier día." : "";

  return (
    <div className="space-y-4" data-testid="plan-agenda">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id={`${uid}-h`} className="text-[18px] font-semibold">Agenda del plan</h2>
        <nav aria-label="Vista de la agenda" className="min-w-0">
          <Tabs tabs={AGENDA_VIEWS.map((v) => ({ id: v.id, label: v.label }))} active={view} onChange={setView} prefix={PREFIX} label="Vista de la agenda" />
        </nav>
      </div>
      {status && <p className="text-[14px] text-dim" data-testid="agenda-status">{status}</p>}
      {plan.structure === "areas" && <PracticeCurriculumBar plan={plan} onChanged={onChanged} announce={announce} />}

      {areaTabs.length > 1 && (
        <nav aria-label="Áreas de la agenda" data-testid="agenda-area-tabs" className="min-w-0">
          <ul className="flex gap-1 overflow-x-auto border-b border-line py-1">
            {[{ subplanId: "", area: "Todas las áreas", areaId: undefined as string | undefined }, ...areaTabs].map((a) => {
              const on = (only ?? "") === a.subplanId;
              return (
                <li key={a.subplanId || "all"} className="flex-none">
                  <button type="button" aria-pressed={on} aria-current={on ? "page" : undefined} onClick={() => setStoredArea(a.subplanId)} data-testid="agenda-area-tab" data-area={a.areaId ?? (a.subplanId || "all")} className={cn("inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[14.5px] font-medium transition-colors", on ? "border-accent bg-accent-soft text-accent-text" : "border-transparent text-dim hover:bg-hover hover:text-text")}>
                    {a.subplanId && <AreaDot {...(a.areaId ? { areaId: a.areaId } : {})} />}
                    {a.area}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div role="group" aria-label="Navegación por el tiempo" className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5" data-testid="agenda-nav">
        <GhostButton large aria-label={`${VIEW_NOUN[navView]} anterior`} disabled={!canShift(navView, anchor, -1, plan)} onClick={() => shift(-1)} data-testid="agenda-prev">
          <ChevronLeft size={17} aria-hidden /> Anterior
        </GhostButton>
        <GhostButton large aria-label={`${VIEW_NOUN[navView]} siguiente`} disabled={!canShift(navView, anchor, 1, plan)} onClick={() => shift(1)} data-testid="agenda-next">
          Siguiente <ChevronRight size={17} aria-hidden />
        </GhostButton>
        <GhostButton large onClick={goToday} title={data.today < plan.start || data.today > plan.end ? "Hoy queda fuera del plan: va a su extremo más cercano" : `Ir a hoy (${noun} actual)`} data-testid="agenda-today">Hoy</GhostButton>
        <GhostButton large onClick={() => { setAnchor(data.today); setView("semana"); }} data-testid="agenda-this-week">Esta semana</GhostButton>
        <GhostButton large onClick={() => { setAnchor(data.today); setView("mes"); }} data-testid="agenda-this-month">Este mes</GhostButton>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[14px] text-dim">
          Ir a la fecha
          <input
            type="date"
            value={anchor}
            min={plan.start}
            max={plan.end}
            onChange={(e) => isDate(e.target.value) && setAnchor(e.target.value)}
            data-testid="agenda-date"
            className="min-h-11 rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] text-text"
          />
        </label>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="agenda-live">{liveText}</p>
      {/* el título y su resumen ya los dicen el encabezado de la vista y la región aria-live: aquí solo existen para las pruebas y los atajos */}
      <p className="sr-only" data-testid="agenda-title" aria-hidden>
        {title} · {summary}
      </p>

      <TabPanel prefix={PREFIX} id="dia" active={view === "dia"} className="pt-0"><>{view === "dia" && <DayDetail m={m} date={anchor} onChanged={onChanged} headingId={`${uid}-d`} areaFilter={only} />}</></TabPanel>
      <TabPanel prefix={PREFIX} id="semana" active={view === "semana"} className="pt-0">
        <>{view === "semana" && <WeekDetail m={m} week={Math.floor(daysBetween(plan.start, anchor) / 7) + 1} onPickDay={pickDay} onChanged={onChanged} headingId={`${uid}-w`} only={only} />}</>
      </TabPanel>
      <TabPanel prefix={PREFIX} id="mes" active={view === "mes"} className="pt-0">
        <>{view === "mes" && <MonthDetail m={m} month={anchor.slice(0, 7)} onPickWeek={pickWeek} onChanged={onChanged} headingId={`${uid}-m`} only={only} />}</>
      </TabPanel>
      {view === "mes" && summary0 && (
        <details open data-testid="agenda-phases" className="rounded-2xl border border-line bg-card p-4">
          <summary className="inline-flex min-h-9 cursor-pointer items-center text-[15px] font-semibold">Fases del plan, mes a mes</summary>
          <p className="mb-3 mt-1 text-[13.5px] text-dim">Qué trabaja cada área en cada mes: temas, horas y semanas activas. Pulsa un mes para verlo arriba.</p>
          <PhaseMonthTable data={data} plan={plan} onOpenMonth={(_month, firstDay) => { setAnchor(firstDay); setView("mes"); }} />
          <details className="mt-3" data-testid="agenda-phases-bars">
            <summary className="inline-flex min-h-8 cursor-pointer items-center text-[14px] text-accent-text">Ver las fases por semanas</summary>
            <div className="mt-2"><PhaseTimeline plan={plan} currentWeek={summary0.currentWeek} weeks={summary0.weeks} /></div>
          </details>
        </details>
      )}

      <TabPanel prefix={PREFIX} id="calendario" active={view === "calendario"} className="pt-0">
        <>{view === "calendario" && <AgendaCalendar m={m} anchor={anchor} onSelect={setAnchor} onChanged={onChanged} hideFilter={areaTabs.length > 1} />}</>
      </TabPanel>
    </div>
  );
}


// Mentor — Plan: la sub-interfaz de UN plan. Cabecera (título, periodo, estado y acciones), un banner «¿lo mantienes?» mientras el plan
// es solo propuesto, un aviso «Reorganizar por áreas» si el plan usa la estructura antigua, y una barra de pestañas fija:
// Mi plan · Agenda · Práctica · Entregables · Cambios. La Agenda integra las vistas Día · Semana · Mes · Calendario sin una página larga.
// Cada pestaña es un panel; la activa se recuerda por plan. Accesible: landmarks con nombre, encabezados ordenados, pestañas WAI-ARIA con
// flechas, región `aria-live` para los cambios de estado, enlace «Saltar al contenido», «Volver arriba» y un acceso «Pedir cambios» siempre
// visible junto a las pestañas.
//
// SOLO LECTURA salvo propósitos y estados de entregables y las acciones del plan (renombrar, archivar, eliminar a la papelera, mantener,
// reorganizar por áreas —deshacible desde «Preguntas y ajustes»—).

import { Archive, ArchiveRestore, Check, LayoutGrid, MessageSquareText, Pencil, PlayCircle, PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { splitNotes, tidyNotes } from "../../lib/planAreas";
import { periodLabel, weeksLabel } from "../../lib/planTime";
import type { MentorPlan as MentorPlanData, MentorPlanStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState, usePersistedNav } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { askText, cn, confirmAction } from "../ui";
import { dayText, LoadState, ProgressBar } from "./parts";
import { PlanAgenda } from "./PlanAgenda";
import { PlanChanges } from "./PlanChanges";
import { PlanDeliverables } from "./PlanDeliverables";
import { BackToTop, PlanNotes, SectionCard, SectionHeading, SkipLink, TabPanel, Tabs, panelId, type TabDef } from "./planKit";
import { agendaDateKey, cleanBranch, DAY_LONG, DAY_SHORT, num1, PLAN_TABS, planTabKey, STATUS_COLOUR, STATUS_LABEL, usePlanData, type Loaded, type PlanTab } from "./planShared";
import { PhaseTimeline, SubplanGroups } from "./PlanSubplans";
import { PhaseMonthTable } from "./PlanMonths";
import { AreaTopicsSection, TogetherBar } from "./AreaViews";
import { useAgendaModel } from "./agendaKit";
import { deliverablesDefined } from "../../lib/planTopicsByArea";
import { CoveragePanel, usePlanCoverage } from "./PlanCoverage";
import { ExecuteDialog, ExecutionPanel, EXECUTION_ID } from "./PlanExecution";
import { monthLong } from "../../lib/planMonths";
import { agendaViewKey } from "./PlanAgenda";
import { PACE_LABEL } from "./PlanForm";
import { PracticeRow, practiceSummary } from "./PracticeCard";
import { PRACTICE_NAME } from "../../lib/practiceTrack";

const PREFIX = "plan-tabs";
const CONTENT_ID = "plan-content";

export function PlanView({ planId }: { planId: string }) {
  const [storedTab, setStoredTab] = usePersistedNav<string>(planTabKey(planId), "plan");
  const { data, warming, error, reload, setData } = usePlanData(planId);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [autoSend, setAutoSend] = useState<{ text: string; n: number } | undefined>();
  const [focusSignal, setFocusSignal] = useState(0);
  const [live, setLive] = useState("");
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tabsBar = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLElement>(null);
  const [bannerGone, setBannerGone] = useState(typeof IntersectionObserver === "undefined");
  const [reorganizing, setReorganizing] = useState(false);
  // «Mantener y ejecutar» (diálogo con el informe de ejecución) y la señal para que «Ejecutar plan…» del panel abra su diálogo
  const [execOpen, setExecOpen] = useState(false);
  const toast = useApp((s) => s.toast);
  const renamePlan = useMentor((s) => s.renamePlan);
  const archivePlan = useMentor((s) => s.archivePlan);
  const deletePlan = useMentor((s) => s.deletePlan);
  const plan = data?.plan ?? null;
  const row = data?.plans.find((p) => p.id === planId);
  const summary = data?.derived?.summary;

  const proposed = !!plan?.proposed;
  // el «Mantener plan» fijo junto a las pestañas solo aparece cuando el banner ya salió de la vista
  useEffect(() => {
    const el = banner.current;
    const sc = scroller.current;
    if (!el || !sc || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setBannerGone(!e!.isIntersecting), { root: sc });
    io.observe(el);
    return () => io.disconnect();
  }, [proposed, data]);

  const announce = useCallback((msg: string) => setLive((p) => (p === msg ? `${msg} ` : msg)), []);

  // los entregables quedan «por definir» hasta que se ejecuta el plan: la decisión pendiente solo se enseña cuando ya hay entregables definidos
  const pendingDeliverables = plan && deliverablesDefined(plan) ? (plan.openQuestions ?? []).filter((q) => q.id === "deliverables").length : 0;
  const tabs: TabDef[] = [
    { id: "plan", label: "Mi plan" },
    { id: "agenda", label: "Agenda" },
    ...(plan?.programmingPractice ? [{ id: "practica", label: "Práctica", short: "Práctica" }] : []),
    { id: "entregables", label: "Entregables", badge: pendingDeliverables, badgeLabel: `${pendingDeliverables} ${pendingDeliverables === 1 ? "pendiente" : "pendientes"} de decidir` },
    { id: "cambios", label: "Preguntas y ajustes", short: "Preguntas" },
  ];
  // la antigua pestaña «Semana actual» ahora es la Agenda
  const stored = storedTab === "semana" ? "agenda" : storedTab;
  const tab: PlanTab = (PLAN_TABS as readonly string[]).includes(stored) && tabs.some((t) => t.id === stored) ? (stored as PlanTab) : "plan";
  const changeTab = useCallback(
    (id: string) => {
      setStoredTab(id);
      // al cambiar a un panel más corto, el scroll no se queda en el vacío: se coloca justo bajo la barra de pestañas
      const sc = scroller.current;
      const bar = tabsBar.current;
      if (sc && bar && sc.scrollTop > bar.offsetTop) sc.scrollTop = bar.offsetTop;
    },
    [setStoredTab],
  );
  const askChanges = useCallback(() => {
    changeTab("cambios");
    setFocusSignal((n) => n + 1);
    announce("Preguntas y ajustes: escribe tu pregunta o tu ajuste en el cuadro.");
  }, [changeTab, announce]);
  // «Pedir cambios» con un texto ya escrito (p. ej. el aviso de Bases): rellena el cuadro, NO lo envía
  const [prefill, setPrefill] = useState<{ text: string; n: number } | undefined>();
  const askChangesWith = useCallback(
    (text: string) => {
      setPrefill((p) => ({ text, n: (p?.n ?? 0) + 1 }));
      changeTab("cambios");
      announce(`Preguntas y ajustes: el cuadro tiene el texto «${text}». Revísalo y pulsa «Aplicar cambios».`);
    },
    [changeTab, announce],
  );
  // «Ver este mes en la Agenda» (tabla mes a mes): vista Mes en ese mes
  const pendingAgendaDate = usePersistedNav<string>(agendaDateKey(planId), "")[0];
  const openMonth = useCallback(
    (month: string, firstDay: string) => {
      const nav = useNavState.getState();
      nav.set(agendaViewKey(planId), "mes");
      nav.set(agendaDateKey(planId), firstDay);
      changeTab("agenda");
      announce(`Agenda del plan, vista Mes: ${monthLong(month)}.`);
    },
    [planId, changeTab, announce],
  );
  // La fecha pedida se consume una vez. Si la Agenda no la leyó al montarse, se aplica con su selector «Ir a la fecha».
  useEffect(() => {
    if (tab !== "agenda" || !pendingAgendaDate) return;
    const t = setTimeout(() => {
      const nav = useNavState.getState();
      if (nav.values[agendaDateKey(planId)] !== pendingAgendaDate) return;
      const el = document.querySelector<HTMLInputElement>(`#${panelId(PREFIX, "agenda")} [data-testid=agenda-date]`);
      if (el && el.value !== pendingAgendaDate) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, pendingAgendaDate);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (el) nav.set(agendaDateKey(planId), "");
    }, 0);
    return () => clearTimeout(t);
  }, [tab, pendingAgendaDate, planId, data]);

  const rename = async () => {
    if (!plan) return;
    const next = await askText("Nombre del plan", row?.name ?? "", "Guardar");
    if (next === null) return;
    await renamePlan(plan.id, next);
    announce(`Plan renombrado a «${next}».`);
  };
  const applied = useCallback((_p: MentorPlanData, changed: string[]) => {
    useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
    setHighlight(new Set(changed));
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlight(new Set()), 9000);
  }, []);
  useEffect(() => () => {
    if (hlTimer.current) clearTimeout(hlTimer.current);
  }, []);
  const keep = async () => {
    if (!plan) return;
    try {
      await api.mentorPlanKeep(plan.id);
      toast("info", "Plan mantenido.");
      announce("Plan mantenido. Ya alimenta «Hoy» y «Esta semana».");
      useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const remove = async () => {
    if (!plan) return;
    const ok = await confirmAction("Eliminar plan", `«${row?.name ?? plan.id}» irá a la papelera de la vault (no se borra de forma definitiva). Tus temas, metas y proyectos no se tocan.`, "Eliminar", true);
    if (ok) await deletePlan(plan.id);
  };
  const reorganize = async () => {
    if (!plan) return;
    const ok = await confirmAction(
      "Reorganizar por áreas",
      `Los ${plan.subplans.length} subplanes (uno por rama de carpeta) se agruparán en áreas elementales: Backend, Frontend, Databases… con sus grupos internos (Bases, Lenguaje, Conocimientos) y fases por semanas. Se conservan los temas completados, las semanas que fijaste, los comentarios y los estados. Queda en «Preguntas y ajustes» y puedes deshacerlo.`,
      "Reorganizar por áreas",
    );
    if (!ok) return;
    setReorganizing(true);
    try {
      const r = await api.mentorPlanReorganize(plan.id);
      setData((d) => (d ? { ...d, plan: r.plan } : d));
      applied(r.plan, r.entry.changed);
      toast("info", "Plan reorganizado por áreas. Puedes deshacerlo en «Preguntas y ajustes».");
      announce(`Plan reorganizado por áreas: ${r.plan.subplans.map((s) => s.area).join(", ")}. Puedes deshacerlo en Cambios.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setReorganizing(false);
    }
  };
  const toTop = () => {
    scroller.current?.scrollTo({ top: 0 });
    document.getElementById("plan-title")?.focus();
  };

  const state: MentorPlanStatus | null = plan ? (plan.proposed ? "propuesto" : plan.archived ? "terminado" : (data?.status ?? "activo")) : null;
  const weeks = plan ? Math.round(((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 + 1) / 7 * 10) / 10 : 0;
  const areas = plan ? [...new Set(plan.subplans.map((s) => s.area))] : [];
  const legacy = !!plan && plan.structure !== "areas" && plan.subplans.some((s) => s.topics.length > 0);

  return (
    <div ref={scroller} className="nv-a11y relative flex min-h-0 min-w-0 flex-1 scroll-pt-28 flex-col overflow-y-auto overflow-x-hidden bg-surface text-[14px] text-text" data-testid="plan-view">
      <SkipLink targetId={CONTENT_ID}>Saltar al contenido</SkipLink>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="plan-live">{live}</div>
      <div className="mx-auto w-full min-w-0 max-w-[1400px] px-4 pb-24 @3xl:px-6">
        <header className="pt-5" data-testid="plan-head">
          <p className="font-mono text-[13px] uppercase tracking-wider text-faint">
            Plan de estudio{areas.length ? ` · ${areas.join(" · ")}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-72">
              <h1 id="plan-title" tabIndex={-1} className="text-[26px] font-bold leading-tight tracking-tight outline-none @3xl:text-[30px]">{row?.name ?? "Mentor — Plan"}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-dim">
                {plan ? (
                  <>
                    <span>{periodLabel(plan.start, plan.end)} · {weeksLabel(weeks)}</span>
                    {state && <Chip large colour={STATUS_COLOUR[state]}>{plan.proposed ? "Propuesto" : plan.archived ? "Archivado" : STATUS_LABEL[state]}</Chip>}
                    {plan.auto && <Chip large colour="var(--nv-warn)">Plan automático</Chip>}
                  </>
                ) : (
                  "El plan por áreas elementales. El estado sale de tu práctica; los propósitos y los estados de los entregables se editan aquí."
                )}
              </p>
            </div>
            {plan && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Acciones del plan">
                <GhostButton large onClick={() => void rename()}>
                  <Pencil size={16} aria-hidden /> Renombrar
                </GhostButton>
                <GhostButton large onClick={() => { const a = !plan.archived; void archivePlan(plan.id, a); announce(a ? "Plan archivado." : "Plan reactivado."); }}>
                  {plan.archived ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />} {plan.archived ? "Reactivar" : "Terminar / archivar"}
                </GhostButton>
                <GhostButton large danger onClick={() => void remove()}>
                  <Trash2 size={16} aria-hidden /> Eliminar
                </GhostButton>
              </div>
            )}
          </div>
        </header>

        <div className="mt-3 space-y-3">
          <LoadState warming={warming} error={error} empty={!data} onRetry={() => void reload()} />
          {data && !plan && (
            <div className="rounded-2xl border border-dashed border-line p-6 text-center text-[14px] text-dim" data-testid="plan-missing">
              Este plan ya no existe.{" "}
              <button type="button" className="inline-flex min-h-8 items-center text-accent-text underline underline-offset-2" onClick={() => useNavState.getState().set("mentor.view", "plan")}>
                Volver al resumen de planes
              </button>
            </div>
          )}
        </div>

        {data && plan && summary && (
          <>
            {plan.proposed && (
              <section ref={banner} aria-label="Plan propuesto" data-testid="plan-proposed-bar" className="mt-3 rounded-xl border-2 border-warn/70 bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-64">
                      <h2 className="text-[16px] font-semibold">Plan propuesto por el Mentor — ¿lo mantienes?</h2>
                      <p className="text-[14px] text-dim">Mientras esté propuesto no alimenta «Hoy» ni «Esta semana» y no reserva tiempo. Puedes preguntarle o pedirle ajustes en «Preguntas y ajustes» las veces que quieras y recorrer su agenda en «Agenda».</p>
                    </div>
                    <PrimaryButton large onClick={() => void keep()}>
                      <Check size={16} aria-hidden /> Mantener plan
                    </PrimaryButton>
                    <GhostButton large onClick={() => setExecOpen(true)} data-testid="plan-keep-execute" title="Mantiene el plan y el Mentor crea lo que falta en tu vault, tras mostrarte el informe y pedirte confirmación">
                      <PlayCircle size={16} aria-hidden /> Mantener y ejecutar
                    </GhostButton>
                    <GhostButton large danger onClick={() => void remove()}>
                      <Trash2 size={16} aria-hidden /> Borrar
                    </GhostButton>
                  </div>
              </section>
            )}
            {legacy && (
              <section aria-label="Estructura del plan" data-testid="plan-legacy-bar" className="mt-3 rounded-xl border border-line bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <h2 className="text-[16px] font-semibold">Este plan usa la estructura antigua</h2>
                    <p className="text-[14px] text-dim">Tiene {plan.subplans.length} subplanes, uno por rama de carpeta. Puedes reorganizarlo por áreas elementales (Backend, Frontend, Databases…) con sus grupos y fases. No se hace solo: queda en «Preguntas y ajustes» y se puede deshacer.</p>
                  </div>
                  <PrimaryButton large disabled={reorganizing} onClick={() => void reorganize()} data-testid="plan-reorganize">
                    <LayoutGrid size={16} aria-hidden /> Reorganizar por áreas
                  </PrimaryButton>
                </div>
              </section>
            )}
            <div ref={tabsBar} className="sticky top-0 z-20 -mx-4 mt-3 flex flex-wrap items-center justify-between gap-x-4 border-b border-line bg-surface/95 px-4 backdrop-blur @3xl:-mx-6 @3xl:px-6" data-testid="plan-sticky">
              <nav aria-label="Secciones del plan" className="min-w-0">
                <Tabs tabs={tabs} active={tab} onChange={changeTab} prefix={PREFIX} label="Secciones del plan" />
              </nav>
              <div className="flex flex-wrap items-center gap-2 py-1" role="group" aria-label="Accesos rápidos">
                <GhostButton large onClick={askChanges} data-testid="plan-ask-changes" title="Pregunta algo sobre el plan, corrígelo o ajústalo con un comentario">
                  <MessageSquareText size={16} aria-hidden /> Preguntar o ajustar
                </GhostButton>
                {plan.proposed && bannerGone && (
                  <span data-testid="plan-proposed-sticky" className="inline-flex flex-wrap items-center gap-2">
                    <PrimaryButton large onClick={() => void keep()}>
                      <Check size={16} aria-hidden /> Mantener plan
                    </PrimaryButton>
                    <GhostButton large onClick={() => setExecOpen(true)}>
                      <PlayCircle size={16} aria-hidden /> Mantener y ejecutar
                    </GhostButton>
                  </span>
                )}
              </div>
            </div>

            <div id={CONTENT_ID} tabIndex={-1} className="outline-none" data-testid="plan-content">
              <TabPanel prefix={PREFIX} id="plan" active={tab === "plan"}>
                {tab === "plan" && summary && data.derived && (
                  <MiPlan
                    data={data}
                    plan={plan}
                    state={state!}
                    summary={summary}
                    highlight={highlight}
                    onChanged={(p) => setData((d) => (d ? { ...d, plan: p } : d))}
                    onApplied={(p, changed) => {
                      setData((d) => (d ? { ...d, plan: p } : d));
                      applied(p, changed);
                    }}
                    onOpenMonth={openMonth}
                    onAskChange={askChangesWith}
                    announce={announce}
                    onAddBranches={(names) => {
                      setAutoSend({ text: `Añade las ramas excluidas: ${names.join(", ")}`, n: (autoSend?.n ?? 0) + 1 });
                      changeTab("cambios");
                      announce(`Pidiéndole al Mentor que añada ${names.join(" y ")}. Mira el estado en «Preguntas y ajustes».`);
                    }}
                  />
                )}
              </TabPanel>
              <TabPanel prefix={PREFIX} id="agenda" active={tab === "agenda"}>
                {tab === "agenda" && <PlanAgenda data={data} plan={plan} onChanged={(p) => setData((d) => (d ? { ...d, plan: p } : d))} announce={announce} />}
              </TabPanel>
              {plan.programmingPractice && (
                <TabPanel prefix={PREFIX} id="practica" active={tab === "practica"}>
                  {tab === "practica" && (
                    <PracticeRow
                      track={plan.programmingPractice}
                      status={data.practice}
                      today={data.today}
                      planId={plan.id}
                      onExecute={() => {
                        changeTab("plan");
                        setTimeout(() => document.getElementById(EXECUTION_ID)?.scrollIntoView?.({ block: "start" }), 50);
                      }}
                    />
                  )}
                </TabPanel>
              )}
              <TabPanel prefix={PREFIX} id="entregables" active={tab === "entregables"}>
                {tab === "entregables" && (
                  <PlanDeliverables data={data} onChanged={(p) => setData((d) => (d ? { ...d, plan: p } : d))} announce={announce} goTab={changeTab} />
                )}
              </TabPanel>
              {/* «Cambios» siempre montado: conserva el texto a medias, el historial y el «Pensando…» al cambiar de pestaña */}
              <TabPanel prefix={PREFIX} id="cambios" active={tab === "cambios"}>
                <PlanChanges planId={plan.id} onApplied={applied} autoSend={autoSend} announce={announce} focusSignal={focusSignal} prefill={prefill} />
              </TabPanel>
            </div>
            {execOpen && (
              <ExecuteDialog
                planId={plan.id}
                proposed={!!plan.proposed}
                onClose={() => setExecOpen(false)}
                onStarted={() => {
                  announce(plan.proposed ? "Plan mantenido. La ejecución sigue en segundo plano; mira el progreso en «Mi plan», «Ejecutar plan»." : "Ejecución en marcha en segundo plano.");
                  useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
                  changeTab("plan");
                }}
              />
            )}
          </>
        )}
      </div>
      <BackToTop scroller={scroller} onTop={toTop} />
    </div>
  );
}

// ── Pestaña «Mi plan» ───────────────────────────────────────────────────

function MiPlan({
  data, plan, state, summary, highlight, onChanged, onApplied, onAddBranches, onOpenMonth, onAskChange, announce,
}: {
  data: Loaded;
  plan: MentorPlanData;
  state: MentorPlanStatus;
  summary: NonNullable<Loaded["derived"]>["summary"];
  highlight: Set<string>;
  onChanged: (p: Loaded["plan"]) => void;
  onApplied: (p: MentorPlanData, changed: string[]) => void;
  onAddBranches: (names: string[]) => void;
  onOpenMonth: (month: string, firstDay: string) => void;
  onAskChange: (text: string) => void;
  announce: (msg: string) => void;
}) {
  const cov = usePlanCoverage(plan.id);
  const pre = plan.preconditions;
  const byAreas = plan.structure === "areas";
  const defined = deliverablesDefined(plan);
  const pending = defined ? (plan.openQuestions ?? []).filter((q) => q.id === "deliverables").length : 0;
  const agenda = useAgendaModel(data, plan);
  const weeksText = state === "propuesto" ? `del ${dayText(plan.start)} al ${dayText(plan.end)}` : state === "activo" ? `semana ${summary.currentWeek} de ${summary.weeks}` : state === "futuro" ? `empieza el ${dayText(plan.start)}` : `terminó el ${dayText(plan.end)}`;
  const excluded = pre?.branchExcluded?.map(cleanBranch) ?? [];
  const exclusionText =
    pre?.branchPreset === "fullstack"
      ? `Excluí ${excluded.join(" y ")} porque pediste full stack. Añádelos si los quieres.`
      : pre?.branchPreset === "backend" || pre?.branchPreset === "frontend"
        ? `Excluí ${excluded.join(", ")} porque tu pedido es de ${pre.branchPreset === "backend" ? "Backend" : "Frontend"}. Añádelos si los quieres.`
        : `Ramas fuera del plan: ${excluded.join(", ")}.`;
  const facts: Array<{ label: string; value: React.ReactNode; hint?: string; testid?: string }> = [
    { label: "Periodo", value: periodLabel(plan.start, plan.end), hint: weeksLabel(Math.round(((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 + 1) / 7 * 10) / 10) },
  ];
  if (pre) {
    facts.push({ label: "Dedicación", value: `${num1(pre.minutesPerDay / 60)} h/día`, hint: pre.blockedDates?.length ? `${pre.blockedDates.length} fechas bloqueadas` : undefined });
    facts.push({
      label: "Días activos",
      value: (
        <ul className="flex flex-wrap gap-1" aria-label="Días de estudio">
          {DAY_SHORT.map((d, i) => {
            const on = pre.studyDays.includes(i + 1);
            return (
              <li key={d} className={cn("grid h-8 w-8 place-items-center rounded-md border text-[14px] font-semibold", on ? "border-accent bg-accent-soft text-accent-text" : "border-line text-faint")}>
                <span aria-hidden>{d}</span>
                <span className="sr-only">{DAY_LONG[i]}{on ? ", activo" : ", sin estudio"}</span>
              </li>
            );
          })}
        </ul>
      ),
      hint: `${pre.studyDays.length} ${pre.studyDays.length === 1 ? "día" : "días"} por semana`,
      testid: "plan-days",
    });
    facts.push({ label: "Ritmo", value: PACE_LABEL[pre.pace] });
  }
  if (plan.hoursPerWeek) facts.push({ label: "Carga semanal", value: `~${num1(plan.hoursPerWeek)} h/semana`, hint: plan.programmingPractice ? "para temas (la práctica va aparte)" : "efectivas" });
  if (pre) {
    facts.push(
      defined
        ? { label: "Entregables", value: pre.deliverables === "yes" ? "Sí" : pre.deliverables === "no" ? "Definidos" : "A discutir", hint: pending ? "1 decisión por tomar" : undefined, testid: "plan-deliverables-chip" }
        : { label: "Entregables", value: "Por definir", hint: "Se definen al ejecutar el plan", testid: "plan-deliverables-chip" },
    );
  }
  if (plan.programmingPractice) facts.push({ label: PRACTICE_NAME, value: "Activa", hint: practiceSummary(plan.programmingPractice), testid: "plan-practice-chip" });
  if (plan.areaMode) facts.push({ label: "Áreas", value: plan.areaMode === "together" ? "Juntas desde el día 1" : "Por fases", hint: plan.areaModeWhy, testid: "plan-area-mode-chip" });
  if (pre?.languages?.length) facts.push({ label: "Lenguajes a practicar", value: pre.languages.map((l) => ({ python: "Python", javascript: "JavaScript", typescript: "TypeScript" })[l.id]).join(" · "), hint: "Un bloque de práctica de lenguaje cada día", testid: "plan-languages-chip" });
  const skippedN = plan.subplans.reduce((n, s) => n + s.topics.filter((t) => t.route === "skipped").length, 0);
  if (skippedN) facts.push({ label: "Ruta", value: `${skippedN} ${skippedN === 1 ? "tema fuera de ruta" : "temas fuera de ruta"}`, hint: "No se borran: siguen en tus notas y puedes reactivarlos", testid: "plan-route-chip" });

  const fallbacks = plan.subplans
    .map((s) => ({ s, fb: s.fallback ?? (splitNotes(s.notes).rulesFallback ? { kind: "rules" as const, reason: "no consta el motivo (el plan se generó antes de registrarlo)" } : null) }))
    .filter((x) => !!x.fb);
  const objective = pre?.freeObjective ? tidyNotes(pre.freeObjective) : "";
  const notes = pre?.notes ? tidyNotes(pre.notes) : "";
  const countLabel = byAreas ? (summary.subplans === 1 ? "área" : "áreas") : summary.subplans === 1 ? "subplan" : "subplanes";

  return (
    <>
      <SectionCard labelledBy="mp-summary" testid="plan-header" className="space-y-3">
        <h2 id="mp-summary" className="sr-only">Resumen del plan</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Chip large colour={STATUS_COLOUR[state]}>{plan.proposed ? "Propuesto" : plan.archived ? "Archivado" : STATUS_LABEL[state]}</Chip>
          <p className="text-[16px] text-text" data-testid="plan-summary">
            <strong>{summary.subplans}</strong> {countLabel} · <strong>{summary.done}/{summary.topics}</strong> temas completados · <strong>{summary.pct} %</strong> global · {weeksText}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1"><ProgressBar pct={summary.pct} thick label="Avance global del plan" /></div>
          <span className="text-[18px] font-bold">{summary.pct} %</span>
        </div>
      </SectionCard>

      {byAreas && <TogetherBar plan={plan} onApplied={onApplied} announce={announce} />}

      <section aria-labelledby="mp-facts" data-testid="plan-preconditions">
        <SectionHeading id="mp-facts">Datos clave</SectionHeading>
        <dl className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-6">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0 rounded-xl border border-line bg-card px-4 py-3" data-testid={f.testid}>
              <dt className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-faint">{f.label}</dt>
              <dd className="text-[17px] font-semibold leading-snug text-text">{f.value}</dd>
              {f.hint && <dd className="mt-0.5 text-[13.5px] font-normal text-dim">{f.hint}</dd>}
            </div>
          ))}
        </dl>
      </section>

      {fallbacks.length > 0 && (
        <section aria-labelledby="mp-fallback" className="rounded-2xl border border-warn/60 bg-card p-4 @3xl:p-5" data-testid="plan-fallback-note">
          <h2 id="mp-fallback" className="text-[18px] font-semibold">Completado con reglas</h2>
          <p className="mt-1 text-[14px] text-dim">La IA no pudo elegir los temas de estas áreas, así que la app los completó en el orden natural de la materia (sin la selección del Mentor). Si quieres, pídele un cambio en «Preguntas y ajustes».</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px]">
            {fallbacks.map(({ s, fb }) => <li key={s.id}><span className="font-medium">{s.area}</span>: {fb!.reason}</li>)}
          </ul>
        </section>
      )}

      {(excluded.length > 0 || plan.rationale || notes || objective) && (
        <div className="grid items-start gap-4 @4xl:grid-cols-2 [&>*]:min-w-0">
          {excluded.length > 0 && (
            <section aria-labelledby="mp-excl" className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-branch-note">
              <h2 id="mp-excl" className="text-[18px] font-semibold">Exclusiones del alcance</h2>
              <p className="mt-1 text-[14px] text-dim">{exclusionText}</p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Ramas fuera del plan">
                {excluded.map((b) => (
                  <li key={b}><Chip large colour="var(--nv-warn)">{b}</Chip></li>
                ))}
              </ul>
              <GhostButton large className="mt-3" onClick={() => onAddBranches(excluded)}>
                <PlusCircle size={16} aria-hidden /> Añadir {excluded.join(" y ")}
              </GhostButton>
            </section>
          )}
          {plan.rationale && (
            <section aria-labelledby="mp-comments" className="space-y-3 rounded-2xl border border-line bg-card p-4 @3xl:p-5">
              <h2 id="mp-comments" className="text-[18px] font-semibold">Comentario del Mentor</h2>
              <p className="text-[15px] leading-relaxed text-text" data-testid="plan-rationale">{plan.rationale}</p>
            </section>
          )}
          {(notes || objective) && (
            <section aria-labelledby="mp-yours" className="space-y-3 rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-yours">
              <h2 id="mp-yours" className="text-[18px] font-semibold">Lo que pediste</h2>
              {objective && <PlanNotes notes={objective} auto={false} testid="plan-objective" title="Tu objetivo" />}
              {notes && <PlanNotes notes={notes} auto={!!plan.auto} testid="plan-notes" />}
            </section>
          )}
        </div>
      )}

      {byAreas && (
        <section aria-labelledby="mp-phases" data-testid="plan-phases-section">
          <SectionHeading id="mp-phases" hint={`Qué trabaja cada área en cada mes: temas, horas y semanas activas. ${plan.areaMode === "together" ? "Todas las áreas van juntas desde el día 1 (Automation, al final)" : "Como mucho dos áreas van en paralelo"}; el orden y el reparto los recalcula la app con tu capacidad real.`}>
            Fases del plan, mes a mes
          </SectionHeading>
          <PhaseMonthTable data={data} plan={plan} onOpenMonth={onOpenMonth} />
          <details className="mt-3" data-testid="plan-phases-bars">
            <summary className="inline-flex min-h-8 cursor-pointer items-center text-[14px] text-accent-text">Ver las fases por semanas</summary>
            <div className="mt-2">
              <PhaseTimeline plan={plan} currentWeek={summary.currentWeek} weeks={summary.weeks} />
            </div>
          </details>
        </section>
      )}

      {byAreas && <AreaTopicsSection m={agenda} currentWeek={summary.currentWeek} />}

      <CoveragePanel plan={plan} cov={cov} onPlan={onChanged} announce={announce} />
      <ExecutionPanel plan={plan} cov={cov} onPlan={onChanged} announce={announce} />

      <section aria-labelledby="mp-subplans" data-testid="plan-subplans">
        <SectionHeading id="mp-subplans" hint={byAreas ? "Cada tarjeta es un área con sus grupos internos (Bases, Lenguaje, Conocimientos): ábrela para ver su ruta de temas con el registro de completados, las metas enlazadas y el proyecto de área." : "Cada tarjeta resume un subplan: ábrela para ver sus semanas, sus temas con el registro de completados, las metas requeridas y el entregable."}>
          Áreas del plan <span className="text-[14px] font-normal text-dim">{plan.subplans.length} {plan.subplans.length === 1 ? (byAreas ? "área" : "subplan") : byAreas ? "áreas" : "subplanes"}</span>
        </SectionHeading>
        <SubplanGroups data={data} highlight={highlight} onChanged={onChanged} coverage={cov.coverage} review={cov.review} onAskChange={onAskChange} onReview={cov.setReview} />
      </section>
    </>
  );
}


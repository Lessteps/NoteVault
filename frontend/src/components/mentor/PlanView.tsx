// Mentor — Plan: la sub-interfaz de UN plan. Cabecera (título, periodo, estado y acciones), un banner «¿lo mantienes?» mientras el plan
// es solo propuesto, un aviso «Reorganizar por áreas» si el plan usa la estructura antigua, y una barra de pestañas fija:
// Mi plan · Agenda · Práctica · Entregables · Cambios. La Agenda integra las vistas Día · Semana · Mes · Calendario sin una página larga.
// Cada pestaña es un panel; la activa se recuerda por plan. Accesible: landmarks con nombre, encabezados ordenados, pestañas WAI-ARIA con
// flechas, región `aria-live` para los cambios de estado, enlace «Saltar al contenido», «Volver arriba» y un acceso «Pedir cambios» siempre
// visible junto a las pestañas.
//
// SOLO LECTURA salvo propósitos y estados de entregables y las acciones del plan (renombrar, archivar, eliminar a la papelera, mantener,
// reorganizar por áreas —deshacible desde «Preguntas y ajustes»—).

import { Archive, ArchiveRestore, Check, ClipboardList, LayoutGrid, MessageSquareText, Pencil, PlayCircle, Rocket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { periodLabel, weeksLabel } from "../../lib/planTime";
import type { MentorPlan as MentorPlanData, MentorPlanStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState, usePersistedNav } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { askText, cn, confirmAction } from "../ui";
import { LoadState } from "./parts";
import { PlanAgenda } from "./PlanAgenda";
import { PlanChanges } from "./PlanChanges";
import { PlanDeliverables } from "./PlanDeliverables";
import { BackToTop, SkipLink, TabPanel, Tabs, panelId, type TabDef } from "./planKit";
import { agendaDateKey, openPlanSection, PLAN_TABS, planModeKey, planSectionKey, planTabKey, STATUS_COLOUR, STATUS_LABEL, usePlanData, type PlanMode, type PlanTab } from "./planShared";
import { ExecutionBar } from "./ExecutionBar";
import { activeSectionOf, DEFAULT_SECTION, PlanSubNav, planSectionsOf } from "./PlanSections";
import { PlanRun } from "./PlanRun";
import { deliverablesDefined } from "../../lib/planTopicsByArea";
import { usePlanCoverage } from "./PlanCoverage";
import { ExecuteDialog } from "./PlanExecution";
import { monthLong } from "../../lib/planMonths";
import { agendaViewKey } from "./PlanAgenda";
import { PracticeRow } from "./PracticeCard";

const PREFIX = "plan-tabs";
const CONTENT_ID = "plan-content";

export function PlanView({ planId }: { planId: string }) {
  const [storedTab, setStoredTab] = usePersistedNav<string>(planTabKey(planId), "plan");
  const { data, warming, error, reload, setData } = usePlanData(planId);
  // la sub-vista elegida de «Mi plan» (por plan) y la cobertura, que alimenta tanto la sub-barra como las sub-vistas
  const [storedSection, setStoredSection] = usePersistedNav<string>(planSectionKey(planId), DEFAULT_SECTION);
  const cov = usePlanCoverage(planId);
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
  // Dos caras del plan: «plan» (pestañas, para armarlo y ajustarlo) y «ejecucion» (solo lectura, para el día a día). Sin elegir, un plan
  // mantenido y en curso abre en ejecución; uno propuesto o archivado, en plan.
  const [storedMode, setMode] = usePersistedNav<string>(planModeKey(planId), "");
  const mode: PlanMode = storedMode === "plan" || storedMode === "ejecucion" ? storedMode : plan && !plan.proposed && !plan.archived ? "ejecucion" : "plan";
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
      setMode("plan");
      // al cambiar a un panel más corto, el scroll no se queda en el vacío: se coloca justo bajo la barra de pestañas
      const sc = scroller.current;
      const bar = tabsBar.current;
      if (sc && bar && sc.scrollTop > bar.offsetTop) sc.scrollTop = bar.offsetTop;
    },
    [setStoredTab, setMode],
  );
  // cambiar de sub-vista de «Mi plan»: el scroll se coloca justo bajo la barra fija, no en el vacío de una vista más corta
  const changeSection = useCallback(
    (id: string) => {
      setStoredSection(id);
      const sc = scroller.current;
      const bar = tabsBar.current;
      if (sc && bar && sc.scrollTop > bar.offsetTop) sc.scrollTop = bar.offsetTop;
    },
    [setStoredSection],
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
  const sections = useMemo(
    () => plan && summary && state && data?.derived
      ? planSectionsOf({
          data,
          plan,
          state,
          summary,
          highlight,
          cov,
          onChanged: (p) => setData((d) => (d ? { ...d, plan: p } : d)),
          onApplied: (p, changed) => {
            setData((d) => (d ? { ...d, plan: p } : d));
            applied(p, changed);
          },
          onOpenMonth: openMonth,
          onAskChange: askChangesWith,
          announce,
          onAddBranches: (names) => {
            setAutoSend({ text: `Añade las ramas excluidas: ${names.join(", ")}`, n: (autoSend?.n ?? 0) + 1 });
            changeTab("cambios");
            announce(`Pidiéndole al Mentor que añada ${names.join(" y ")}. Mira el estado en «Preguntas y ajustes».`);
          },
        })
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, summary, state, data, highlight, cov, openMonth, askChangesWith, announce, applied, changeTab, autoSend?.n],
  );
  const section = sections.length ? activeSectionOf(sections, storedSection) : null;

  return (
    <div ref={scroller} className="nv-a11y relative flex min-h-0 min-w-0 flex-1 scroll-pt-40 flex-col overflow-y-auto overflow-x-hidden bg-surface text-[14px] text-text" data-testid="plan-view">
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
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1" role="group" aria-label="Vista del plan" data-testid="plan-mode">
                {([["ejecucion", "Ejecución", Rocket, "Qué haces hoy y cómo vas (solo lectura)"], ["plan", "Plan", ClipboardList, "Armar y ajustar el plan: áreas, agenda, entregables y cambios"]] as const).map(([id, label, Icon, hint]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={mode === id}
                    title={hint}
                    onClick={() => { setMode(id); announce(id === "ejecucion" ? "Vista de ejecución: lo que toca hoy y tu avance." : "Vista de plan: pestañas para armar y ajustar el plan."); }}
                    className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-[15px] font-semibold", mode === id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}
                    data-testid={`plan-mode-${id}`}
                  >
                    <Icon size={16} aria-hidden /> {label}
                  </button>
                ))}
              </div>
            )}
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
            {legacy && mode === "plan" && (
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
            {mode === "ejecucion" ? (
              <div id={CONTENT_ID} tabIndex={-1} className="mt-4 outline-none" data-testid="plan-content">
                <PlanRun data={data} plan={plan} />
              </div>
            ) : (
            <>
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
              {tab === "plan" && section && (
                <div className="basis-full border-t border-line/60">
                  <PlanSubNav sections={sections} active={section.id} onSelect={changeSection} />
                </div>
              )}
            </div>

            <div id={CONTENT_ID} tabIndex={-1} className="outline-none" data-testid="plan-content">
              <TabPanel prefix={PREFIX} id="plan" active={tab === "plan"}>
                {tab === "plan" && section && <div className="mt-6" data-testid={`plan-section-${section.id}`}>{section.render()}</div>}
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
                        openPlanSection(plan.id, "ejecutar");
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
            </>
            )}
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
      {/* la barra de generación en segundo plano es de planificar el plan: no estorba en el día a día (Ejecución) */}
      {plan && mode === "plan" && <ExecutionBar planId={plan.id} onOpenPlan={() => changeTab("plan")} />}
      <BackToTop scroller={scroller} onTop={toTop} />
    </div>
  );
}


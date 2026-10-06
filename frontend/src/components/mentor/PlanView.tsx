// Mentor — Plan: la sub-interfaz de UN plan. Cabecera (título, periodo, estado y acciones), un banner «¿lo mantienes?» mientras el plan
// es solo propuesto y una barra de pestañas fija: Mi plan · Semana actual · Práctica diaria · Entregables · Cambios. Cada pestaña es un
// panel (ya no hay una sola página larguísima); la pestaña activa se recuerda por plan. Accesible: landmarks con nombre, encabezados
// ordenados, pestañas WAI-ARIA con flechas, región `aria-live` para los cambios de estado, enlace «Saltar al contenido» y «Volver arriba».
//
// SOLO LECTURA salvo el estado del entregable y las acciones del plan (renombrar, archivar, eliminar a la papelera, mantener).

import { Archive, ArchiveRestore, Check, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { periodLabel, weeksLabel } from "../../lib/planTime";
import type { MentorPlan as MentorPlanData, MentorPlanStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState, usePersistedNav } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { askText, cn, confirmAction } from "../ui";
import { dayText, LoadState, ProgressBar } from "./parts";
import { PlanChanges } from "./PlanChanges";
import { PlanDeliverables } from "./PlanDeliverables";
import { BackToTop, PlanNotes, SectionCard, SectionHeading, SkipLink, TabPanel, Tabs, type TabDef } from "./planKit";
import { cleanBranch, DAY_LONG, DAY_SHORT, num1, PLAN_TABS, planTabKey, STATUS_COLOUR, STATUS_LABEL, usePlanData, type Loaded, type PlanTab } from "./planShared";
import { SubplanGroups } from "./PlanSubplans";
import { ProposedWeekPreview, ThisWeek } from "./PlanWeek";
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
  const [live, setLive] = useState("");
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tabsBar = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLElement>(null);
  const [bannerGone, setBannerGone] = useState(typeof IntersectionObserver === "undefined");
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

  const pendingDeliverables = (plan?.openQuestions ?? []).filter((q) => q.id === "deliverables").length;
  const tabs: TabDef[] = [
    { id: "plan", label: "Mi plan" },
    { id: "semana", label: "Semana actual", short: "Semana" },
    ...(plan?.programmingPractice ? [{ id: "practica", label: "Práctica diaria", short: "Práctica" }] : []),
    { id: "entregables", label: "Entregables", badge: pendingDeliverables, badgeLabel: `${pendingDeliverables} ${pendingDeliverables === 1 ? "pendiente" : "pendientes"} de decidir` },
    { id: "cambios", label: "Cambios" },
  ];
  const tab: PlanTab = (PLAN_TABS as readonly string[]).includes(storedTab) && tabs.some((t) => t.id === storedTab) ? (storedTab as PlanTab) : "plan";
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
  const toTop = () => {
    scroller.current?.scrollTo({ top: 0 });
    document.getElementById("plan-title")?.focus();
  };

  const state: MentorPlanStatus | null = plan ? (plan.proposed ? "propuesto" : plan.archived ? "terminado" : (data?.status ?? "activo")) : null;
  const weeks = plan ? Math.round(((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 + 1) / 7 * 10) / 10 : 0;
  const areas = plan ? [...new Set(plan.subplans.map((s) => s.area))] : [];

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
                  "El plan por áreas y objetivos. El estado sale de tu práctica; solo el entregable se marca aquí."
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
                      <p className="text-[14px] text-dim">Mientras esté propuesto no alimenta «Hoy» ni «Esta semana» y no reserva tiempo. Puedes pedirle cambios en «Cambios» las veces que quieras.</p>
                    </div>
                    <PrimaryButton large onClick={() => void keep()}>
                      <Check size={16} aria-hidden /> Mantener plan
                    </PrimaryButton>
                    <GhostButton large danger onClick={() => void remove()}>
                      <Trash2 size={16} aria-hidden /> Borrar
                    </GhostButton>
                  </div>
              </section>
            )}
            <div ref={tabsBar} className="sticky top-0 z-20 -mx-4 mt-3 flex flex-wrap items-center justify-between gap-x-4 border-b border-line bg-surface/95 px-4 backdrop-blur @3xl:-mx-6 @3xl:px-6" data-testid="plan-sticky">
              <nav aria-label="Secciones del plan" className="min-w-0">
                <Tabs tabs={tabs} active={tab} onChange={changeTab} prefix={PREFIX} label="Secciones del plan" />
              </nav>
              {plan.proposed && bannerGone && (
                <div className="flex items-center gap-2 py-1" role="group" aria-label="Plan propuesto" data-testid="plan-proposed-sticky">
                  <PrimaryButton large onClick={() => void keep()}>
                    <Check size={16} aria-hidden /> Mantener plan
                  </PrimaryButton>
                </div>
              )}
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
                    onAddBranches={(names) => {
                      setAutoSend({ text: `Añade las ramas excluidas: ${names.join(", ")}`, n: (autoSend?.n ?? 0) + 1 });
                      changeTab("cambios");
                      announce(`Pidiéndole al Mentor que añada ${names.join(" y ")}. Mira el estado en «Cambios».`);
                    }}
                  />
                )}
              </TabPanel>
              <TabPanel prefix={PREFIX} id="semana" active={tab === "semana"}>
                {tab === "semana" &&
                  (plan.proposed ? (
                    <ProposedWeekPreview plan={plan} views={data.derived?.subplans ?? []} week={Math.max(1, summary.currentWeek)} onKeep={() => void keep()} />
                  ) : (
                    <ThisWeek items={data.items} practiceItems={data.practiceItems} activePlans={data.plans.filter((p) => p.status === "activo").length} />
                  ))}
              </TabPanel>
              {plan.programmingPractice && (
                <TabPanel prefix={PREFIX} id="practica" active={tab === "practica"}>
                  {tab === "practica" && <PracticeRow track={plan.programmingPractice} status={data.practice} today={data.today} />}
                </TabPanel>
              )}
              <TabPanel prefix={PREFIX} id="entregables" active={tab === "entregables"}>
                {tab === "entregables" && (
                  <PlanDeliverables data={data} onChanged={(p) => setData((d) => (d ? { ...d, plan: p } : d))} announce={announce} goTab={changeTab} />
                )}
              </TabPanel>
              {/* «Cambios» siempre montado: conserva el texto a medias, el historial y el «Pensando…» al cambiar de pestaña */}
              <TabPanel prefix={PREFIX} id="cambios" active={tab === "cambios"}>
                <PlanChanges planId={plan.id} onApplied={applied} autoSend={autoSend} announce={announce} />
              </TabPanel>
            </div>
          </>
        )}
      </div>
      <BackToTop scroller={scroller} onTop={toTop} />
    </div>
  );
}

// ── Pestaña «Mi plan» ───────────────────────────────────────────────────

function MiPlan({
  data, plan, state, summary, highlight, onChanged, onAddBranches,
}: {
  data: Loaded;
  plan: MentorPlanData;
  state: MentorPlanStatus;
  summary: NonNullable<Loaded["derived"]>["summary"];
  highlight: Set<string>;
  onChanged: (p: Loaded["plan"]) => void;
  onAddBranches: (names: string[]) => void;
}) {
  const pre = plan.preconditions;
  const pending = (plan.openQuestions ?? []).filter((q) => q.id === "deliverables").length;
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
  if (pre) facts.push({ label: "Entregables", value: pre.deliverables === "yes" ? "Sí" : pre.deliverables === "no" ? "No" : "A discutir", hint: pending ? `${pending} por decidir` : undefined });
  if (plan.programmingPractice) facts.push({ label: PRACTICE_NAME, value: "Activa", hint: practiceSummary(plan.programmingPractice), testid: "plan-practice-chip" });

  return (
    <>
      <SectionCard labelledBy="mp-summary" testid="plan-header" className="space-y-3">
        <h2 id="mp-summary" className="sr-only">Resumen del plan</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Chip large colour={STATUS_COLOUR[state]}>{plan.proposed ? "Propuesto" : plan.archived ? "Archivado" : STATUS_LABEL[state]}</Chip>
          <p className="text-[16px] text-text" data-testid="plan-summary">
            <strong>{summary.subplans}</strong> {summary.subplans === 1 ? "subplan" : "subplanes"} · <strong>{summary.done}/{summary.topics}</strong> temas completados · <strong>{summary.pct} %</strong> global · {weeksText}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1"><ProgressBar pct={summary.pct} thick label="Avance global del plan" /></div>
          <span className="text-[18px] font-bold">{summary.pct} %</span>
        </div>
      </SectionCard>

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

      {(excluded.length > 0 || plan.rationale || pre?.notes || pre?.freeObjective) && (
        <div className="grid items-start gap-4 @4xl:grid-cols-2">
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
          {(plan.rationale || pre?.notes || pre?.freeObjective) && (
            <section aria-labelledby="mp-comments" className="space-y-3 rounded-2xl border border-line bg-card p-4 @3xl:p-5">
              <h2 id="mp-comments" className="text-[18px] font-semibold">Comentario del Mentor</h2>
              {plan.rationale ? <p className="text-[15px] leading-relaxed text-text" data-testid="plan-rationale">{plan.rationale}</p> : <p className="text-dim">Sin comentario del Mentor.</p>}
              {pre?.freeObjective && <PlanNotes notes={pre.freeObjective} auto={false} testid="plan-objective" title="Tu objetivo" />}
              {pre?.notes && <PlanNotes notes={pre.notes} auto={!!plan.auto} testid="plan-notes" />}
            </section>
          )}
        </div>
      )}

      <section aria-labelledby="mp-subplans" data-testid="plan-subplans">
        <SectionHeading id="mp-subplans" hint="Cada tarjeta resume un subplan: ábrela para ver sus semanas, sus temas con el registro de completados, las metas requeridas y el entregable.">
          Áreas del plan <span className="text-[14px] font-normal text-dim">{plan.subplans.length} {plan.subplans.length === 1 ? "subplan" : "subplanes"}</span>
        </SectionHeading>
        <SubplanGroups data={data} highlight={highlight} onChanged={onChanged} />
      </section>
    </>
  );
}

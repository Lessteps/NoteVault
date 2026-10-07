// Mentor — Plan, «Mi plan»: COBERTURA de notas y práctica. Parte determinista (siempre): por área y grupo, cuántos temas del plan tienen
// nota de teoría y ejercicios en la vault, qué temas no tienen práctica y qué temas de las ramas del área quedaron fuera del plan. Parte
// con IA (bajo demanda): «Revisar cobertura con el Mentor» pide los conocimientos que FALTAN para el objetivo y el perfil declarado; la
// revisión validada se guarda en el plan y se ve en la tarjeta de cada área. Solo informa: no crea notas ni cambia temas.

import { ClipboardCheck, ExternalLink, Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { AreaCoverage as AreaCov, CoverageRef, CoverageReview, CoverageReviewArea, PlanCoverage } from "../../lib/planCoverage";
import type { MentorPlan } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { openTopic } from "./openTopic";
import { dayText, ThinkingStatus, useAiStatus } from "./parts";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;
const LIST_FOLD = 8;

export interface CoverageState {
  coverage: PlanCoverage | null;
  review: CoverageReview | null;
  aiConfigured: boolean;
  loading: boolean;
  error: string;
  reload: () => void;
  setReview: (r: CoverageReview | null) => void;
}

/** Carga la cobertura del plan (con el reintento de la vault fría); se recarga cuando cambia el plan. */
export function usePlanCoverage(planId: string): CoverageState {
  const planVersion = useMentor((s) => s.planVersion);
  const [coverage, setCoverage] = useState<PlanCoverage | null>(null);
  const [review, setReview] = useState<CoverageReview | null>(null);
  const [aiConfigured, setAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      for (let i = 0; i < COLD_RETRY_MAX; i++) {
        const r = await api.mentorPlanCoverage(planId);
        if (!alive.current) return;
        if (r && !r.loading) {
          setCoverage(r.coverage);
          setReview(r.review);
          setAi(r.aiConfigured);
          setLoading(false);
          return;
        }
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        if (!alive.current) return;
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo.");
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message || "No se pudo calcular la cobertura.");
        setLoading(false);
      }
    }
  }, [planId]);
  useEffect(() => {
    void load();
  }, [load, planVersion]);
  return { coverage, review, aiConfigured, loading, error, reload: () => void load(), setReview };
}

const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);

/** «Cobertura: teoría 40/75 · práctica 12/75» (el indicador de cada tarjeta de área). */
export function CoverageLine({ area, className }: { area: AreaCov; className?: string }) {
  const found = area.total - area.notFound;
  return (
    <p className={cn("text-[13.5px] text-dim", className)} data-testid="area-coverage-line">
      <span className="font-medium text-text">Cobertura:</span> teoría {area.theory}/{area.total} · práctica {area.practice}/{area.total}
      {area.notFound > 0 && <span className="text-warn"> · {area.notFound} sin encontrar en la vault</span>}
      {found > 0 && area.practice < found && <span className="sr-only"> ({pct(area.practice, found)} % con ejercicios)</span>}
    </p>
  );
}

/** Una lista de temas plegable con «ver tema». */
function RefList({ refs, label, testid }: { refs: CoverageRef[]; label: string; testid?: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? refs : refs.slice(0, LIST_FOLD);
  return (
    <div data-testid={testid}>
      <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={label}>
        {shown.map((t) => (
          <li key={t.folder}>
            <button
              type="button"
              onClick={() => void openTopic(t.folder)}
              className="nv-ghost inline-flex min-h-8 max-w-[18rem] items-center gap-1 rounded-md border border-line px-2 py-1 text-[13px] text-text hover:bg-hover"
              aria-label={`Ver tema ${t.title}`}
              title={t.folder}
            >
              <span className="truncate">{t.title}</span>
              <ExternalLink size={12} aria-hidden className="flex-none text-faint" />
            </button>
          </li>
        ))}
      </ul>
      {refs.length > LIST_FOLD && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex min-h-8 items-center text-[13px] text-accent-text underline-offset-2 hover:underline">
          {open ? "Ver menos" : `Ver los ${refs.length}`}
        </button>
      )}
    </div>
  );
}

/** El detalle de cobertura de UN área: faltantes accionables y lo que sugirió el Mentor. */
export function AreaCoverageDetail({ area, review, reviewAt, groupTitle, areaName }: { area: AreaCov; review?: CoverageReviewArea; reviewAt?: string; groupTitle: (id: string) => string; areaName: (key: string) => string }) {
  const uid = useId();
  const noPractice = area.groups.filter((g) => g.noPractice.length > 0);
  const noTheory = area.groups.flatMap((g) => g.noTheory);
  const short = area.groups.flatMap((g) => g.shortPractice);
  const notFound = area.groups.flatMap((g) => g.notFound);
  const pending = area.outOfPlan.filter((t) => !t.done);
  const nothing = !noPractice.length && !noTheory.length && !short.length && !notFound.length && !pending.length;
  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-xl border border-line bg-surface/40 p-3.5" data-testid="area-coverage">
      <h5 id={`${uid}-h`} className="flex items-center gap-2 text-[15px] font-semibold text-text">
        <ClipboardCheck size={16} aria-hidden className="text-accent-text" /> Cobertura de notas y práctica
      </h5>
      <p className="mt-0.5 text-[13.5px] text-dim">
        Calculada con tu vault: un tema tiene teoría si su carpeta tiene alguna nota que no es ejercicio, y práctica si tiene ejercicios.
      </p>
      <CoverageLine area={area} className="mt-1.5" />
      {nothing ? (
        <p className="mt-2 text-[14px] text-mint">Todos los temas del área tienen teoría y práctica, y no quedan temas pendientes de sus ramas fuera del plan.</p>
      ) : (
        <ul className="mt-2 space-y-2.5 text-[14px]" aria-label={`Faltantes de ${area.area}`} data-testid="area-coverage-gaps">
          {noPractice.map((g) => (
            <li key={`np-${g.id}`}>
              <span className="font-medium">
                Faltan ejercicios en {g.noPractice.length} {g.noPractice.length === 1 ? "tema" : "temas"} de {groupTitle(g.id)}
              </span>
              <RefList refs={g.noPractice} label={`Temas sin ejercicios de ${groupTitle(g.id)}`} />
            </li>
          ))}
          {short.length > 0 && (
            <li>
              <span className="font-medium">Con menos ejercicios de los que pide su plan de práctica: {short.length}</span>
              <RefList refs={short} label="Temas con pocos ejercicios" />
            </li>
          )}
          {noTheory.length > 0 && (
            <li>
              <span className="font-medium">Sin notas de teoría: {noTheory.length}</span>
              <RefList refs={noTheory} label="Temas sin notas de teoría" />
            </li>
          )}
          {notFound.length > 0 && (
            <li>
              <span className="font-medium text-warn">En el plan pero no en la vault: {notFound.length}</span>
              <p className="text-[13px] text-dim">{notFound.slice(0, 6).map((t) => t.title).join(" · ")}{notFound.length > 6 ? "…" : ""}</p>
            </li>
          )}
          {pending.length > 0 && (
            <li>
              <span className="font-medium">
                {pending.length} {pending.length === 1 ? "tema" : "temas"} de {area.branches.join(", ")} fuera del plan (sin completar)
              </span>
              <RefList refs={pending} label={`Temas de ${area.area} fuera del plan`} />
            </li>
          )}
        </ul>
      )}
      {review && (review.assessment || review.missing.length > 0 || review.misplaced.length > 0) && (
        <div className="mt-3 rounded-lg border border-accent/50 bg-card p-3" data-testid="area-ai-review">
          <h6 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text">
            <Sparkles size={15} aria-hidden className="text-accent-text" /> Faltantes sugeridos por el Mentor
            {reviewAt && <span className="text-[12.5px] font-normal text-dim">revisión del {dayText(reviewAt.slice(0, 10))}</span>}
          </h6>
          {review.assessment && <p className="mt-1 text-[14px] text-text">{review.assessment}</p>}
          {review.missing.length > 0 && (
            <ul className="mt-2 space-y-1.5" aria-label={`Conocimientos que faltan en ${area.area}`}>
              {review.missing.map((m) => (
                <li key={m.title} className="rounded-md border border-line px-2.5 py-1.5 text-[13.5px]" data-testid="ai-missing">
                  <span className="font-medium text-text">{m.title}</span>
                  {m.groupId && <span className="text-dim"> · {groupTitle(m.groupId)}</span>}
                  {m.why && <span className="block text-dim">{m.why}</span>}
                </li>
              ))}
            </ul>
          )}
          {review.misplaced.length > 0 && (
            <>
              <p className="mt-2 text-[13.5px] font-medium">Sobran o irían mejor en otra área:</p>
              <ul className="mt-1 space-y-1" aria-label={`Temas sobrantes o mal ubicados en ${area.area}`}>
                {review.misplaced.map((m) => (
                  <li key={m.folder} className="text-[13.5px] text-dim">
                    <button type="button" onClick={() => void openTopic(m.folder)} className="inline-flex min-h-8 items-center font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${m.title}`}>
                      {m.title}
                    </button>
                    {m.suggestedArea && <span> → {areaName(m.suggestedArea)}</span>}
                    {m.reason && <span>: {m.reason}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-[12.5px] text-dim">Son sugerencias: no se crean notas ni se cambia el plan. Para aplicarlas, usa «Pedir cambios».</p>
        </div>
      )}
    </section>
  );
}

/** Resumen de cobertura del plan con la revisión con IA bajo demanda. */
export function CoveragePanel({ plan, cov, onPlan, announce }: { plan: MentorPlan; cov: CoverageState; onPlan: (p: MentorPlan) => void; announce: (msg: string) => void }) {
  const uid = useId();
  const [profile, setProfile] = useState(cov.review?.profile ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const key = `coverage:${plan.id}`;
  const status = useAiStatus(key, busy);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && cov.review?.profile) setProfile(cov.review.profile);
  }, [cov.review?.profile]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      let r = await api.mentorPlanCoverageReview(plan.id, profile.trim() || undefined);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        r = await api.mentorPlanCoverageReview(plan.id, profile.trim() || undefined);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo.");
      if (r.source === "ai") {
        cov.setReview(r.review);
        onPlan(r.plan);
        const n = r.review.areas.reduce((s, a) => s + a.missing.length, 0);
        const msg = `Revisión de cobertura lista: ${n} ${n === 1 ? "conocimiento sugerido" : "conocimientos sugeridos"}. Míralos en la tarjeta de cada área.`;
        setNote(msg);
        announce(msg);
      } else {
        setNote(r.reason);
        announce(r.reason);
      }
    } catch (e) {
      const msg = `${(e as Error).message} Sin IA solo se muestra la cobertura calculada.`;
      setNote(msg);
      announce(msg);
    } finally {
      setBusy(false);
    }
  };

  const c = cov.coverage;
  const stale = !!cov.review && plan.updatedAt > cov.review.at;
  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-coverage">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
          <h3 id={`${uid}-h`} className="flex items-center gap-2 text-[16px] font-semibold text-text">
            <ClipboardCheck size={17} aria-hidden className="text-accent-text" /> Cobertura de notas y práctica
          </h3>
          <p className="mt-0.5 text-[14px] text-dim">
            ¿Tiene cada tema del plan su nota de teoría y sus ejercicios en la vault? El detalle y los faltantes están en la tarjeta de cada área.
          </p>
        </div>
      </div>
      {cov.loading && !c && <p role="status" className="mt-2 text-[14px] text-dim">Calculando la cobertura con tu vault…</p>}
      {cov.error && (
        <p role="alert" className="mt-2 text-[14px] text-danger">
          {cov.error}{" "}
          <button type="button" onClick={cov.reload} className="inline-flex min-h-8 items-center underline">Reintentar</button>
        </p>
      )}
      {c && (
        <dl className="mt-3 grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-4" data-testid="plan-coverage-totals">
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Con teoría</dt>
            <dd className="text-[16px] font-semibold">{c.totals.theory}/{c.totals.topics} <span className="text-[13px] font-normal text-dim">({pct(c.totals.theory, c.totals.topics)} %)</span></dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Con ejercicios</dt>
            <dd className="text-[16px] font-semibold">{c.totals.practice}/{c.totals.topics} <span className="text-[13px] font-normal text-dim">({pct(c.totals.practice, c.totals.topics)} %)</span></dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Fuera del plan</dt>
            <dd className="text-[16px] font-semibold">{c.totals.outOfPlan} <span className="text-[13px] font-normal text-dim">temas de sus ramas sin completar</span></dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Programming practice</dt>
            <dd className="text-[14px] font-medium">{c.ppReady ? "Módulo de práctica instalado" : "Módulo de práctica no encontrado"}</dd>
          </div>
        </dl>
      )}

      <div className="mt-4 rounded-xl border border-line bg-surface/40 p-3.5" data-testid="coverage-ai">
        <h4 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={16} aria-hidden className="text-accent-text" /> Revisar cobertura con el Mentor</h4>
        <p className="mt-0.5 text-[13.5px] text-dim">
          El Mentor recibe solo tu objetivo, tu perfil, los títulos de los temas por área y esta cobertura (nunca tus notas) y te dice qué conocimientos faltan, qué sobra y cómo va cada área. Solo informa: no crea notas ni cambia el plan.
        </p>
        <label htmlFor={`${uid}-profile`} className="mt-2 block text-[14px] font-medium">Tu perfil objetivo</label>
        <input
          id={`${uid}-profile`}
          value={profile}
          onChange={(e) => {
            touched.current = true;
            setProfile(e.target.value.slice(0, 200));
          }}
          placeholder="Ej.: full stack especializado en automatización"
          className={cn(input, "mt-1 min-h-11 w-full max-w-xl text-[14px]")}
          data-testid="coverage-profile"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PrimaryButton large onClick={() => void run()} disabled={busy || !c} data-testid="coverage-review-run">
            <Sparkles size={16} aria-hidden /> Revisar cobertura con el Mentor
          </PrimaryButton>
          {!cov.aiConfigured && <span className="text-[13.5px] text-dim">La IA no está configurada: sin IA solo se muestra la cobertura calculada.</span>}
        </div>
        {busy && (
          <div className="mt-3">
            <ThinkingStatus label={status.label || "Revisando la cobertura del plan…"} elapsed={status.elapsed} onCancel={() => void api.mentorAiCancel(key, "abort")} />
          </div>
        )}
        {note && !busy && (
          <p role="status" className="mt-2 rounded-lg border border-line bg-card px-3 py-2 text-[14px]" data-testid="coverage-note">{note}</p>
        )}
        {cov.review && (
          <div className="mt-3 text-[14px]" data-testid="coverage-review-summary">
            <p className="text-[13px] text-dim">
              Última revisión: {dayText(cov.review.at.slice(0, 10))}
              {cov.review.profile ? ` · perfil «${cov.review.profile}»` : ""}
              {cov.review.discarded ? ` · ${cov.review.discarded} sugerencias descartadas (ya existían o no encajaban)` : ""}
            </p>
            {cov.review.summary && <p className="mt-1 text-text">{cov.review.summary}</p>}
            {stale && <p className="mt-1 text-[13px] text-warn">El plan cambió después de esta revisión: puedes repetirla.</p>}
          </div>
        )}
      </div>
      {c && <GhostButton className="mt-3" onClick={cov.reload}>Recalcular cobertura</GhostButton>}
    </section>
  );
}

// Mentor — Plan, «Mi plan»: COBERTURA de notas y práctica. Parte determinista (siempre): por área y grupo, cuántos temas del plan tienen
// nota de teoría y ejercicios en la vault, qué temas no tienen práctica y qué temas de las ramas del área quedaron fuera del plan. Parte
// con IA (bajo demanda): «Revisar cobertura con el Mentor» pide los conocimientos que FALTAN para el objetivo y el perfil declarado; la
// revisión validada se guarda en el plan y se ve en la tarjeta de cada área. Solo informa: no crea notas ni cambia temas.

import { ClipboardCheck, ExternalLink, EyeOff, PlusCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import {
  COVERAGE_DISCLAIMER,
  CRITERION_LABEL,
  CRITERION_PRESETS,
  criteriaText,
  CURRENT_LEVEL_LABEL,
  CURRENT_LEVELS,
  DEFAULT_CRITERIA,
  LEVEL_LABEL,
  MAX_CONDITIONS_CHARS,
  PRIORITY_LABEL,
  sanitizeCriteria,
  SKILL_LEVELS,
  VERDICT_LABEL,
  DESIGN_VERDICT_LABEL,
  type AreaCoverage as AreaCov,
  type CoverageCriteria,
  type DesignTopicRef,
  type DesignVerdict,
  type CoverageRef,
  type CoverageReview,
  type CoverageReviewArea,
  type CoverageVerdict,
  type CriterionPreset,
  type CurrentLevel,
  type PlanCoverage,
  type SkillLevel,
} from "../../lib/planCoverage";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { openTopic } from "./openTopic";
import { dayText, ThinkingStatus, useAiStatus } from "./parts";
import { artifactLabel, TOPIC_TYPE_NAME } from "../../lib/topicDesign";

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

/**
 * Carga la cobertura del plan (con el reintento de la vault fría); se recarga cuando cambia el plan. Es PEREZOSA: solo se pide cuando `enabled`
 * (las vistas que la enseñan están abiertas) y, si ya se cargó para esta versión del plan, no se vuelve a pedir al volver a entrar.
 */
export function usePlanCoverage(planId: string, enabled = true): CoverageState {
  const planVersion = useMentor((s) => s.planVersion);
  const [coverage, setCoverage] = useState<PlanCoverage | null>(null);
  const [review, setReview] = useState<CoverageReview | null>(null);
  const [aiConfigured, setAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const loadedFor = useRef("");
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
        loadedFor.current = "";
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        if (!alive.current) return;
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo.");
    } catch (e) {
      loadedFor.current = "";
      if (alive.current) {
        setError((e as Error).message || "No se pudo calcular la cobertura.");
        setLoading(false);
      }
    }
  }, [planId]);
  useEffect(() => {
    if (!enabled) return;
    const key = `${planId}:${planVersion}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    void load();
  }, [load, planVersion, enabled, planId]);
  return { coverage, review, aiConfigured, loading, error, reload: () => void load(), setReview };
}

const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);

/** «Cobertura: teoría 40/75 · práctica 12/75» (el indicador de cada tarjeta de área). */
export function CoverageLine({ area, className }: { area: AreaCov; className?: string }) {
  const found = area.total - area.notFound;
  return (
    <p className={cn("text-[13.5px] text-dim", className)} data-testid="area-coverage-line">
      <span className="font-medium text-text">Cobertura:</span> teoría {area.theory}/{area.total} · práctica {area.practice}/{area.total}
      {area.design && <span data-testid="area-design-line"> · diseño {area.design.avgScore} % ({area.design.complete}/{area.design.topics} completos)</span>}
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
          <li key={t.folder} className="min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => void openTopic(t.folder)}
              className="nv-ghost inline-flex min-h-8 max-w-full items-center gap-1 rounded-md border border-line px-2 py-1 text-[13px] text-text hover:bg-hover"
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

/** Acciones sobre la revisión que cambian el plan o la propuesta (la tarjeta del área las recibe de «Mi plan»). */
export interface ReviewActions {
  planId: string;
  /** la revisión guardada cambió (p. ej. un faltante añadido a la propuesta) */
  onReview?: (r: CoverageReview) => void;
  /** el plan cambió (p. ej. temas pasados a «fuera de ruta») */
  onPlan?: (p: MentorPlan) => void;
}

/** «Corto / Adecuado / Excesivo»: SIEMPRE con texto y glifo (nunca solo color). */
export function VerdictChip({ verdict }: { verdict: CoverageVerdict }) {
  const glyph = verdict === "short" ? "▼" : verdict === "excessive" ? "▲" : "✓";
  const colour = verdict === "short" ? "var(--nv-warn)" : verdict === "excessive" ? "var(--nv-info)" : "var(--nv-mint)";
  return (
    <Chip large colour={colour}>
      <span aria-hidden>{glyph}</span> {VERDICT_LABEL[verdict]}
    </Chip>
  );
}

const pctText = (n: number | undefined): string => (n === undefined ? "" : `≈ ${n} % de lo esperado`);

/** Pasa temas a «fuera de ruta» (con la confirmación que explica que las notas NO se borran) y avisa al plan. */
async function skipTopics(planId: string, items: Array<{ folder: string; title: string; reason: string }>, who: string, a: ReviewActions, toast: (k: "info" | "error", m: string) => void): Promise<boolean> {
  const ok = await confirmAction(
    "Pasar a fuera de ruta",
    `${items.length} ${items.length === 1 ? "tema de" : "temas de"} ${who} dejarán de contar en tu ruta: no se agendan ni suman al avance. Las notas NO se borran ni se mueven en NoteVault: solo salen de tu ruta, puedes volver a añadirlas y el cambio se puede deshacer en «Preguntas y ajustes».`,
    `Pasar ${items.length} a fuera de ruta`,
  );
  if (!ok) return false;
  try {
    const r = await api.mentorPlanRouteSet({ id: planId, folders: items.map((i) => i.folder), route: "skipped", reason: items[0]?.reason, label: `Pasar prescindibles de ${who} a fuera de ruta` });
    a.onPlan?.(r.plan);
    useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
    toast("info", `${r.changed} ${r.changed === 1 ? "tema fuera de ruta" : "temas fuera de ruta"}. Las notas siguen en tu vault; puedes deshacerlo en «Preguntas y ajustes».`);
    return true;
  } catch (e) {
    toast("error", (e as Error).message);
    return false;
  }
}

const DESIGN_FOLD = 6;
const VERDICT_COLOUR: Record<DesignVerdict, string> = { good: "var(--nv-mint)", incomplete: "var(--nv-warn)", poor: "var(--nv-danger)" };
const VERDICT_GLYPH: Record<DesignVerdict, string> = { good: "✓", incomplete: "◐", poor: "✕" };

/** Los temas con el diseño incompleto frente al checklist de la vault, con sus faltantes concretos. */
function DesignList({ topics, area }: { topics: DesignTopicRef[]; area: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? topics : topics.slice(0, DESIGN_FOLD);
  return (
    <div data-testid="area-design-list">
      <ul className="mt-1 space-y-1.5" aria-label={`Temas de ${area} con el diseño incompleto`}>
        {shown.map((t) => {
          const lines = [...new Set(t.gaps.map((g) => g.text))];
          return (
            <li key={t.folder} className="min-w-0 rounded-md border border-line px-2.5 py-1.5 text-[13.5px]" data-testid="design-topic">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center text-left font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>{t.title}</button>
                <Chip colour={t.complete ? "var(--nv-mint)" : "var(--nv-warn)"}>diseño {t.score} %</Chip>
                {t.type !== "unknown" && <Chip>{TOPIC_TYPE_NAME[t.type]}</Chip>}
              </span>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-dim">
                {lines.slice(0, 4).map((l) => <li key={l} className="break-words">{l.replace(/`/g, "")}</li>)}
                {lines.length > 4 && <li>y {lines.length - 4} más</li>}
              </ul>
            </li>
          );
        })}
      </ul>
      {topics.length > DESIGN_FOLD && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex min-h-8 items-center text-[13px] text-accent-text underline-offset-2 hover:underline">
          {open ? "Ver menos" : `Ver los ${topics.length}`}
        </button>
      )}
    </div>
  );
}

/** El detalle de cobertura de UN área: faltantes accionables y lo que sugirió el Mentor. */
export function AreaCoverageDetail({ area, review, reviewAt, groupTitle, areaName, actions }: { area: AreaCov; review?: CoverageReviewArea; reviewAt?: string; groupTitle: (id: string) => string; areaName: (key: string) => string; actions?: ReviewActions }) {
  const uid = useId();
  const toast = useApp((s) => s.toast);
  const noPractice = area.groups.filter((g) => g.noPractice.length > 0);
  const noTheory = area.groups.flatMap((g) => g.noTheory);
  const short = area.groups.flatMap((g) => g.shortPractice);
  const notFound = area.groups.flatMap((g) => g.notFound);
  const pending = area.outOfPlan.filter((t) => !t.done);
  const designTopics = area.groups.flatMap((g) => g.designTopics ?? []).sort((a, b) => a.score - b.score);
  const nothing = !noPractice.length && !noTheory.length && !short.length && !notFound.length && !pending.length && !designTopics.length;
  const dispensable = review?.dispensable ?? [];
  const accept = async (title: string, accepted: boolean) => {
    if (!actions) return;
    try {
      const r = await api.mentorPlanCoverageAccept(actions.planId, area.key, title, accepted);
      actions.onReview?.(r.review);
      toast("info", accepted ? `«${title}» queda como propuesta del plan. No se crea ninguna nota.` : `«${title}» ya no está en la propuesta.`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <section aria-labelledby={`${uid}-h`} className="min-w-0 rounded-xl border border-line bg-surface/40 p-3.5" data-testid="area-coverage">
      <h5 id={`${uid}-h`} className="flex items-center gap-2 text-[15px] font-semibold text-text">
        <ClipboardCheck size={16} aria-hidden className="text-accent-text" /> Cobertura de notas y práctica
      </h5>
      <p className="mt-0.5 text-[13.5px] text-dim">
        Calculada con tu vault: un tema tiene teoría si su carpeta tiene alguna nota que no es ejercicio, y práctica si tiene ejercicios. Además cada tema se mide contra el sistema de diseño de la vault (nota de teoría con su estructura, canvas, manifiesto de práctica con skills acordes y ejercicios por skill y dificultad).
      </p>
      <CoverageLine area={area} className="mt-1.5" />
      {nothing ? (
        <p className="mt-2 text-[14px] text-mint">Todos los temas del área tienen teoría y práctica, y no quedan temas pendientes de sus ramas fuera del plan.</p>
      ) : (
        <ul className="mt-2 space-y-2.5 text-[14px]" aria-label={`Faltantes de ${area.area}`} data-testid="area-coverage-gaps">
          {designTopics.length > 0 && (
            <li>
              <span className="font-medium">
                Diseño incompleto en {designTopics.length} {designTopics.length === 1 ? "tema" : "temas"} (checklist de la vault)
                {area.design ? ` · media ${area.design.avgScore} %` : ""}
              </span>
              <DesignList topics={designTopics} area={area.area} />
            </li>
          )}
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
      {review && (review.assessment || review.verdict || review.design || review.missing.length > 0 || review.misplaced.length > 0 || dispensable.length > 0) && (
        <div className="mt-3 min-w-0 rounded-lg border border-accent/50 bg-card p-3" data-testid="area-ai-review">
          <h6 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text">
            <Sparkles size={15} aria-hidden className="text-accent-text" /> Revisión del Mentor
            {reviewAt && <span className="text-[12.5px] font-normal text-dim">del {dayText(reviewAt.slice(0, 10))}</span>}
          </h6>
          {review.verdict && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]" data-testid="area-verdict">
              <span className="font-medium">Veredicto:</span> <VerdictChip verdict={review.verdict} />
              {review.coveragePct !== undefined && <span className="text-dim">{pctText(review.coveragePct)}</span>}
              {review.verdictWhy && <span className="min-w-0 text-dim">— {review.verdictWhy}</span>}
            </p>
          )}
          {review.assessment && <p className="mt-1 text-[14px] text-text">{review.assessment}</p>}
          {review.design && (review.design.summary || review.design.topics.length > 0) && (
            <div className="mt-2 min-w-0" data-testid="area-ai-design">
              <p className="text-[13.5px] font-medium">Diseño de los temas según el Mentor:</p>
              {review.design.summary && <p className="text-[14px] text-text">{review.design.summary}</p>}
              <ul className="mt-1 space-y-1" aria-label={`Veredicto de diseño por tema en ${area.area}`}>
                {review.design.topics.map((t) => (
                  <li key={t.folder} className="min-w-0 text-[13.5px]" data-testid="ai-design-topic">
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center text-left font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>{t.title}</button>
                      <Chip colour={VERDICT_COLOUR[t.verdict]}><span aria-hidden>{VERDICT_GLYPH[t.verdict]}</span> {DESIGN_VERDICT_LABEL[t.verdict]}</Chip>
                      {t.create.length > 0 && <span className="text-dim">crear: {t.create.map((c) => artifactLabel[c]).join(" · ")}</span>}
                    </span>
                    {t.note && <span className="block break-words text-dim">{t.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.missing.length > 0 && (
            <>
              <p className="mt-2 text-[13.5px] font-medium">Lo que falta para el criterio elegido:</p>
              <ul className="mt-1 space-y-1.5" aria-label={`Conocimientos que faltan en ${area.area}`}>
                {review.missing.map((m) => (
                  <li key={m.title} className="min-w-0 rounded-md border border-line px-2.5 py-1.5 text-[13.5px]" data-testid="ai-missing">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-text">{m.title}</span>
                      {m.priority && <Chip colour={m.priority === "high" ? "var(--nv-warn)" : undefined}>{PRIORITY_LABEL[m.priority]}</Chip>}
                      {m.level && <Chip>{LEVEL_LABEL[m.level]}</Chip>}
                      {m.groupId && <span className="text-dim">· {groupTitle(m.groupId)}</span>}
                    </span>
                    {m.why && <span className="block text-dim">{m.why}</span>}
                    {actions && (
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        {m.accepted ? (
                          <>
                            <span className="text-[13px] font-medium text-mint" data-testid="missing-accepted">✓ Añadido al plan como propuesta (sin notas todavía)</span>
                            <GhostButton onClick={() => void accept(m.title, false)} aria-label={`Quitar «${m.title}» de la propuesta`}>Quitar</GhostButton>
                          </>
                        ) : (
                          <GhostButton onClick={() => void accept(m.title, true)} aria-label={`Añadir faltante al plan: ${m.title}`} data-testid="missing-add">
                            <PlusCircle size={14} aria-hidden /> Añadir faltante al plan
                          </GhostButton>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {dispensable.length > 0 && (
            <div className="mt-3" data-testid="area-dispensable">
              <p className="text-[13.5px] font-medium">Prescindibles: pueden pasar a fuera de ruta ({dispensable.length})</p>
              <ul className="mt-1 space-y-1" aria-label={`Temas prescindibles de ${area.area}`}>
                {dispensable.map((m) => (
                  <li key={m.folder} className="text-[13.5px] text-dim">
                    <button type="button" onClick={() => void openTopic(m.folder)} className="inline-flex min-h-8 items-center text-left font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${m.title}`}>
                      {m.title}
                    </button>
                    {m.reason && <span>: {m.reason}</span>}
                  </li>
                ))}
              </ul>
              {actions && (
                <GhostButton wrap className="mt-1.5" onClick={() => void skipTopics(actions.planId, dispensable, area.area, actions, toast)} data-testid="skip-dispensable">
                  <EyeOff size={15} aria-hidden className="flex-none" /> <span className="min-w-0">Pasar prescindibles a fuera de ruta</span>
                </GhostButton>
              )}
            </div>
          )}
          {review.misplaced.length > 0 && (
            <>
              <p className="mt-2 text-[13.5px] font-medium">Irían mejor en otra área:</p>
              <ul className="mt-1 space-y-1" aria-label={`Temas sobrantes o mal ubicados en ${area.area}`}>
                {review.misplaced.map((m) => (
                  <li key={m.folder} className="text-[13.5px] text-dim">
                    <button type="button" onClick={() => void openTopic(m.folder)} className="inline-flex min-h-8 items-center text-left font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${m.title}`}>
                      {m.title}
                    </button>
                    {m.suggestedArea && <span> → {areaName(m.suggestedArea)}</span>}
                    {m.reason && <span>: {m.reason}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-[12.5px] text-dim">Son sugerencias: no se crean notas. «Añadir faltante al plan» lo deja como propuesta; «Pasar a fuera de ruta» no borra nada de NoteVault y se puede deshacer en «Preguntas y ajustes».</p>
        </div>
      )}
    </section>
  );
}

/** Los chips de criterio y los niveles: «¿Con qué criterio revisamos?». */
export function CriteriaForm({ value, onChange, idPrefix }: { value: CoverageCriteria; onChange: (c: CoverageCriteria) => void; idPrefix: string }) {
  const toggle = (p: CriterionPreset) => {
    const has = value.presets.includes(p);
    const presets = has ? value.presets.filter((x) => x !== p) : [...value.presets, p];
    onChange({ ...value, presets: presets.length ? presets : value.presets });
  };
  return (
    <fieldset className="mt-3 min-w-0" data-testid="coverage-criteria">
      <legend className="text-[14px] font-semibold">¿Con qué criterio revisamos?</legend>
      <p className="mt-0.5 text-[13.5px] text-dim">
        Elige uno o varios. Hoy un junior necesita lo que antes se le pedía a un mid-level (testing, Git avanzado, contenedores, CI/CD, cloud básico, seguridad web, IA como herramienta, tipado, APIs, SQL real…): puede que tu plan se quede <strong className="font-medium text-text">corto</strong>, no solo que tenga temas de más.
      </p>
      <div role="group" aria-label="Criterio de la revisión" className="mt-2 flex flex-wrap gap-2" data-testid="criteria-presets">
        {CRITERION_PRESETS.map((p) => {
          const on = value.presets.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p)}
              className={cn(
                "nv-ghost inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-left text-[14px]",
                on ? "border-accent bg-accent-soft font-semibold text-accent-text" : "border-line text-text hover:bg-hover",
              )}
            >
              <span aria-hidden>{on ? "✓" : "+"}</span> {CRITERION_LABEL[p]}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid gap-3 @xl:grid-cols-2">
        <label className="block min-w-0 text-[14px] font-medium">
          Nivel objetivo
          <select
            value={value.targetLevel}
            onChange={(e) => onChange({ ...value, targetLevel: e.target.value as SkillLevel })}
            className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] font-normal text-text"
            data-testid="criteria-target"
          >
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 text-[14px] font-medium">
          Nivel actual (declarado o medido)
          <select
            value={value.currentLevel}
            onChange={(e) => onChange({ ...value, currentLevel: e.target.value as CurrentLevel })}
            className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] font-normal text-text"
            data-testid="criteria-current"
          >
            {CURRENT_LEVELS.map((l) => (
              <option key={l} value={l}>{CURRENT_LEVEL_LABEL[l]}</option>
            ))}
          </select>
        </label>
      </div>
      <label htmlFor={`${idPrefix}-conditions`} className="mt-3 block text-[14px] font-medium">
        Condiciones libres {value.presets.includes("custom") ? "" : <span className="font-normal text-dim">(opcional)</span>}
      </label>
      <textarea
        id={`${idPrefix}-conditions`}
        value={value.conditions}
        onChange={(e) => onChange({ ...value, conditions: e.target.value.slice(0, MAX_CONDITIONS_CHARS) })}
        rows={2}
        placeholder="Ej.: compara con ofertas de backend con Python; prioriza testing y despliegue; no me importa mobile."
        className={cn(input, "mt-1 min-h-16 resize-y text-[14px]")}
        data-testid="criteria-conditions"
      />
    </fieldset>
  );
}

/** Resumen de la última revisión: criterio usado, veredicto global, veredicto por área (con texto) y acciones sobre los prescindibles. */
function ReviewSummary({ plan, review, stale, onPlan }: { plan: MentorPlan; review: CoverageReview; stale: boolean; onPlan: (p: MentorPlan) => void }) {
  const toast = useApp((s) => s.toast);
  const dispensable = review.areas.flatMap((a) => (a.dispensable ?? []).map((d) => ({ ...d, area: a.area })));
  const missing = review.areas.reduce((n, a) => n + a.missing.length, 0);
  return (
    <div className="mt-3 min-w-0 text-[14px]" data-testid="coverage-review-summary">
      <p className="text-[13px] text-dim">
        Última revisión: {dayText(review.at.slice(0, 10))}
        {review.profile ? ` · perfil «${review.profile}»` : ""}
        {review.discarded ? ` · ${review.discarded} sugerencias descartadas (ya existían o no encajaban)` : ""}
      </p>
      {review.criteria && (
        <p className="mt-0.5 text-[13px] text-dim" data-testid="review-criteria">
          Criterio usado: {criteriaText(review.criteria)}
        </p>
      )}
      {review.overall && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="review-overall">
          <span className="font-semibold">Veredicto global:</span> <VerdictChip verdict={review.overall.verdict} />
          {review.overall.coveragePct !== undefined && <span className="text-dim">{pctText(review.overall.coveragePct)}</span>}
          {review.overall.text && <span className="min-w-0 text-dim">— {review.overall.text}</span>}
        </p>
      )}
      {review.summary && <p className="mt-1 text-text">{review.summary}</p>}
      {review.designSummary && (
        <p className="mt-1 text-text" data-testid="review-design-summary">
          <span className="font-semibold">Diseño de los temas:</span> {review.designSummary}
        </p>
      )}
      {review.areas.some((a) => a.verdict) && (
        <div className="mt-2" data-testid="review-verdicts">
          <h5 className="text-[14px] font-semibold">Veredicto por área</h5>
          <ul className="mt-1 space-y-1.5" aria-label="Veredicto por área">
            {review.areas.filter((a) => a.verdict).map((a) => (
              <li key={a.key} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-3 py-1.5" data-testid="review-verdict-row">
                <span className="font-medium">{a.area}</span>
                <VerdictChip verdict={a.verdict!} />
                {a.coveragePct !== undefined && <span className="text-[13px] text-dim">{pctText(a.coveragePct)}</span>}
                {a.verdictWhy && <span className="min-w-0 text-[13.5px] text-dim">{a.verdictWhy}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(dispensable.length > 0 || missing > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {missing > 0 && <span className="text-[13.5px] text-dim">{missing} {missing === 1 ? "conocimiento sugerido" : "conocimientos sugeridos"}: míralos y añádelos como propuesta en la tarjeta de cada área.</span>}
          {dispensable.length > 0 && (
            <GhostButton
              wrap
              onClick={() => void skipTopics(plan.id, dispensable, "todo el plan", { planId: plan.id, onPlan }, toast)}
              data-testid="skip-all-dispensable"
            >
              <EyeOff size={15} aria-hidden className="flex-none" /> <span className="min-w-0">Pasar {dispensable.length} prescindibles a fuera de ruta</span>
            </GhostButton>
          )}
        </div>
      )}
      <p className="mt-2 text-[13px] text-dim" data-testid="review-disclaimer">{review.disclaimer ?? COVERAGE_DISCLAIMER}</p>
      {stale && <p className="mt-1 text-[13px] text-warn">El plan cambió después de esta revisión: puedes repetirla.</p>}
    </div>
  );
}

/** Resumen de cobertura del plan con la revisión con IA bajo demanda. */
export function CoveragePanel({ plan, cov, onPlan, announce }: { plan: MentorPlan; cov: CoverageState; onPlan: (p: MentorPlan) => void; announce: (msg: string) => void }) {
  const uid = useId();
  const [profile, setProfile] = useState(cov.review?.profile ?? "");
  const [criteria, setCriteria] = useState<CoverageCriteria>(cov.review?.criteria ?? DEFAULT_CRITERIA);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const key = `coverage:${plan.id}`;
  const status = useAiStatus(key, busy);
  const touched = useRef(false);
  const criteriaTouched = useRef(false);
  useEffect(() => {
    if (!touched.current && cov.review?.profile) setProfile(cov.review.profile);
  }, [cov.review?.profile]);
  useEffect(() => {
    if (!criteriaTouched.current && cov.review?.criteria) setCriteria(cov.review.criteria);
  }, [cov.review?.criteria]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote("");
    const used = sanitizeCriteria(criteria);
    try {
      let r = await api.mentorPlanCoverageReview(plan.id, profile.trim() || undefined, used);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        r = await api.mentorPlanCoverageReview(plan.id, profile.trim() || undefined, used);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo.");
      if (r.source === "ai") {
        cov.setReview(r.review);
        onPlan(r.plan);
        const n = r.review.areas.reduce((s, a) => s + a.missing.length, 0);
        const v = r.review.overall ? ` Veredicto global: ${VERDICT_LABEL[r.review.overall.verdict].toLowerCase()}${r.review.overall.coveragePct !== undefined ? `, ${pctText(r.review.overall.coveragePct)}` : ""}.` : "";
        const msg = `Revisión de cobertura lista: ${n} ${n === 1 ? "conocimiento sugerido" : "conocimientos sugeridos"}.${v} Míralos en la tarjeta de cada área.`;
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
    <section aria-labelledby={`${uid}-h`} className="min-w-0 rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-coverage">
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
        <dl className={cn("mt-3 grid gap-2 @xl:grid-cols-2", c.totals.design ? "@4xl:grid-cols-5" : "@4xl:grid-cols-4")} data-testid="plan-coverage-totals">
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Con teoría</dt>
            <dd className="text-[16px] font-semibold">{c.totals.theory}/{c.totals.topics} <span className="text-[13px] font-normal text-dim">({pct(c.totals.theory, c.totals.topics)} %)</span></dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Con ejercicios</dt>
            <dd className="text-[16px] font-semibold">{c.totals.practice}/{c.totals.topics} <span className="text-[13px] font-normal text-dim">({pct(c.totals.practice, c.totals.topics)} %)</span></dd>
          </div>
          {c.totals.design && (
            <div className="rounded-lg border border-line px-3 py-2" data-testid="coverage-design-total">
              <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-faint">Diseño de temas</dt>
              <dd className="text-[16px] font-semibold">{c.totals.design.avgScore} % <span className="text-[13px] font-normal text-dim">{c.totals.design.complete}/{c.totals.design.topics} completos</span></dd>
              <dd className="text-[13px] text-dim">{c.totals.design.requiredGaps} faltantes obligatorios · {c.totals.design.recommendedGaps} recomendados</dd>
            </div>
          )}
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

      <div className="mt-4 min-w-0 rounded-xl border border-line bg-surface/40 p-3.5" data-testid="coverage-ai">
        <h4 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={16} aria-hidden className="text-accent-text" /> Revisar cobertura con el Mentor</h4>
        <p className="mt-0.5 text-[13.5px] text-dim">
          El Mentor recibe solo tu objetivo, tu perfil, el criterio que elijas, los títulos de los temas por área y esta cobertura (nunca tus notas) y te dice cómo va cada área (corta, adecuada o excesiva), qué falta y qué sobra. Solo informa: no crea notas ni cambia el plan hasta que tú lo decidas.
        </p>
        <p className="mt-1 text-[13.5px] text-dim" data-testid="coverage-honesty">
          Ojo: el Mentor no tiene datos del mercado en vivo; lo que diga del mercado es una estimación basada en su conocimiento y su fecha de corte.
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
        <CriteriaForm
          idPrefix={uid}
          value={criteria}
          onChange={(v) => {
            criteriaTouched.current = true;
            setCriteria(v);
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrimaryButton large onClick={() => void run()} disabled={busy || !c} data-testid="coverage-review-run">
            <Sparkles size={16} aria-hidden className="flex-none" /> Revisar cobertura con el Mentor
          </PrimaryButton>
          {!cov.aiConfigured && <span className="text-[13.5px] text-dim">La IA no está configurada: sin IA solo se muestra la cobertura calculada (arriba).</span>}
        </div>
        {busy && (
          <div className="mt-3">
            <ThinkingStatus label={status.label || "Revisando la cobertura del plan…"} elapsed={status.elapsed} onCancel={() => void api.mentorAiCancel(key, "abort")} />
          </div>
        )}
        {note && !busy && (
          <p role="status" className="mt-2 rounded-lg border border-line bg-card px-3 py-2 text-[14px]" data-testid="coverage-note">{note}</p>
        )}
        {cov.review && <ReviewSummary plan={plan} review={cov.review} stale={stale} onPlan={onPlan} />}
      </div>
      {c && <GhostButton className="mt-3" onClick={cov.reload}>Recalcular cobertura</GhostButton>}
    </section>
  );
}

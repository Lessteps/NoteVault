// Mentor — Plan en construcción: el constructor GUIADO.
//
// El plan se arma por etapas (Alcance · Esqueleto · Temas · Capacidad · Práctica · Entregables · Revisión) y la app pregunta al
// estudiante SOLO cuando hay una decisión real (nivel, prioridad, recortes si no cabe o si sobra, práctica, entregables). El borrador
// crece debajo; cada respuesta se puede cambiar (rehace desde esa etapa) y «Generar ya con lo que hay» completa el resto con valores
// por defecto. El estado vive en `.notevault/mentor/plans/_building/` (cerrar la app no lo pierde). Al terminar se crea el plan como
// «propuesto» (se mantiene o se borra desde su sub-interfaz). Todo se calcula en la API; aquí solo se pinta y se responde.

import { Check, Flag, ListChecks, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { BUILD_STAGES, STAGE_LABEL, stageIndex, type BuildStage } from "../../lib/planBuild";
import { periodLabel, shortWeekLabel } from "../../lib/planTime";
import { PRACTICE_NAME } from "../../lib/practiceTrack";
import type { MentorBuildResult, MentorPlanBuild, MentorSkeletonRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { planViewId, useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { AreaRow, CARD_CLASS, ChipToggle, Disclosure, hm, LoadState, PanelPage, ProgressBar, ThinkingStatus, useAiStatus } from "./parts";
import { practiceSummary } from "./PracticeCard";

import { coldRetryDelay } from "./planShared";

const PALETTE = ["#2383e2", "#33b679", "#e67c73", "#f6bf26", "#8e24aa", "#0b8043", "#d50000", "#039be5"];
const COLD_RETRY_MAX = 40;
const cleanBranch = (n: string): string => n.replace(/^[\d.\s_-]+/, "");

type Built = Extract<MentorBuildResult, { loading: false }>;

export function PlanBuilder({ buildId }: { buildId: string }) {
  const toast = useApp((s) => s.toast);
  const loadBuilds = useMentor((s) => s.loadBuilds);
  const [build, setBuild] = useState<MentorPlanBuild | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const key = `build:${buildId}`;
  const status = useAiStatus(key, !!busy);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Llama a la API con el reintento de la vault fría; un solo envío a la vez (el doble clic no duplica la llamada). */
  const run = useCallback(
    async (label: string, fn: () => Promise<MentorBuildResult>): Promise<Built | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(label);
      setError("");
      try {
        let r = await fn();
        for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
          await new Promise((ok) => setTimeout(ok, coldRetryDelay(i)));
          r = await fn();
        }
        if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
        if (alive.current) {
          setBuild(r.build);
          setText("");
        }
        void loadBuilds();
        return r;
      } catch (e) {
        if (alive.current) setError((e as Error).message);
        return null;
      } finally {
        inFlight.current = false;
        if (alive.current) setBusy(null);
      }
    },
    [loadBuilds],
  );

  // carga inicial y reanudación: si la API sigue pensando (cambié de panel y volví), se espera a que termine y se recarga
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await api.mentorPlanBuildGet(buildId);
        if (stop || r.loading) return;
        setBuild(r.build);
        let s = await api.mentorAiStatus(key);
        if (s.busy) setBusy("Retomando lo que el Mentor estaba haciendo…");
        while (s.busy && !stop) {
          await new Promise((ok) => setTimeout(ok, 300));
          s = await api.mentorAiStatus(key);
        }
        if (stop) return;
        if (!inFlight.current) {
          const again = await api.mentorPlanBuildGet(buildId);
          if (!again.loading) setBuild(again.build);
          setBusy(null);
        }
      } catch {
        if (!stop) setMissing(true);
      }
    })();
    return () => {
      stop = true;
    };
  }, [buildId, key]);

  const answer = (o: { choice?: string; answer?: string; skip?: boolean; delegate?: boolean }) => {
    const q = build?.openQuestion;
    if (!q) return;
    void run("Aplicando tu respuesta y preparando lo siguiente…", () => api.mentorPlanBuildAnswer({ id: buildId, questionId: q.id, ...o }));
  };
  const back = async (stage: BuildStage) => {
    await run("Rehaciendo desde esa etapa…", () => api.mentorPlanBuildBack(buildId, stage));
  };
  const finishNow = () => void run("Completando lo que falta con valores razonables…", () => api.mentorPlanBuildFinishNow(buildId));
  const abandon = async () => {
    const ok = await confirmAction("Abandonar el plan en construcción", "Se descartan las respuestas y el borrador; el estado irá a la papelera de la vault. No se crea ningún plan.", "Abandonar", true);
    if (!ok) return;
    try {
      await api.mentorPlanBuildAbandon(buildId);
      await loadBuilds();
      useNavState.getState().set("mentor.view", "plan");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const create = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("Creando el plan…");
    try {
      let r = await api.mentorPlanBuildAccept(buildId);
      for (let i = 0; "loading" in r && r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, coldRetryDelay(i)));
        r = await api.mentorPlanBuildAccept(buildId);
      }
      if ("loading" in r) throw new Error("El índice de la vault tarda demasiado en estar listo.");
      toast("info", `Plan propuesto creado: ${r.subplans} subplanes, ${r.topics} temas. Mantenlo o bórralo.`);
      useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
      await loadBuilds();
      useNavState.getState().set("mentor.view", planViewId(r.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  if (missing) {
    return (
      <PanelPage a11y title="Plan en construcción" wide>
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-[14px] text-faint" data-testid="build-missing">
          Este plan en construcción ya no existe.{" "}
          <button type="button" className="text-accent-text hover:underline" onClick={() => useNavState.getState().set("mentor.view", "plan")}>Volver al resumen de planes</button>
        </div>
      </PanelPage>
    );
  }

  const q = build?.openQuestion;
  const stageNo = build ? stageIndex(build.stage) + 1 : 1;
  const review = build?.status === "review";

  return (
    <PanelPage
      a11y
      title={build?.name ?? "Plan en construcción"}
      subtitle={build ? `Armando paso a paso · etapa ${stageNo} de ${BUILD_STAGES.length} · ${periodLabel(build.effective.start, build.effective.end)} · ${build.source === "ai" ? "con el criterio del Mentor" : "por reglas (sin IA)"}` : "Cargando…"}
      wide
      action={
        build && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Acciones del plan en construcción">
            {!review && (
              <GhostButton onClick={finishNow} title="Completa el resto con valores razonables y pasa a la revisión">
                <Flag size={13} /> Generar ya con lo que hay
              </GhostButton>
            )}
            <GhostButton danger onClick={() => void abandon()}>
              <Trash2 size={13} /> Abandonar
            </GhostButton>
          </div>
        )
      }
    >
      <LoadState warming={false} error={error} empty={!build} onRetry={() => setError("")} />
      {build && (
        <>
          <StageLine build={build} />

          {busy && (
            <ThinkingStatus
              label={status.label || busy}
              elapsed={status.elapsed}
              onCancel={() => void api.mentorAiCancel(key, "abort")}
              onAuto={() => void api.mentorAiCancel(key, "auto")}
            />
          )}

          {!busy && q && build.status === "building" && (
            <section className="rounded-xl border-2 border-accent/60 bg-card p-4" aria-label="Pregunta actual" aria-live="polite" data-testid="build-question">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-faint">
                <span className="font-mono uppercase tracking-wider">Etapa {STAGE_LABEL[q.stage]}</span>
                <span>· pregunta {build.answers.length + 1} (tope {build.maxQuestions})</span>
                {q.by === "ai" && <Chip colour="var(--nv-accent)">Redactada con el Mentor</Chip>}
              </div>
              <h2 className="mt-1 text-[15px] font-semibold leading-snug">{q.text}</h2>
              {q.why && <p className="mt-1 text-[14px] text-dim">{q.why}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Opciones de respuesta">
                {q.options.map((o) => (
                  <ChipToggle key={o.id} active={false} onClick={() => answer({ choice: o.id })} title={o.hint}>
                    {o.label}
                    {o.hint ? <span className="text-[13px] text-faint"> · {o.hint}</span> : null}
                  </ChipToggle>
                ))}
              </div>
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) answer({ answer: text.trim() });
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={300}
                  aria-label="Respuesta libre"
                  placeholder={q.allowText ? "Escribe tu respuesta…" : "O escríbelo con tus palabras (p. ej. «intermedio», «sí»)"}
                  className={cn(input, "min-w-[12rem] flex-1")}
                />
                <GhostButton onClick={() => text.trim() && answer({ answer: text.trim() })}>Responder</GhostButton>
                <GhostButton onClick={() => answer({ skip: true })} title="Se queda con el valor por defecto">Saltar</GhostButton>
                <GhostButton onClick={() => answer({ delegate: true })}>Que decida el Mentor</GhostButton>
              </form>
            </section>
          )}

          {!busy && review && (
            <section className="rounded-xl border-2 border-accent/60 bg-card p-4" aria-label="Revisión" data-testid="build-review" aria-live="polite">
              <h2 className="text-[15px] font-semibold">Revisión: el plan está completo</h2>
              <p className="mt-1 text-[14px] text-dim">
                {build.draft ? `${build.draft.subplans.length} subplanes · ${build.draft.subplans.reduce((n, s) => n + s.topics.length, 0)} temas · ${build.draft.hoursPerWeek} h/semana · ${hm(build.draft.totalMinutes)} de ${hm(build.draft.availableMinutes)}` : ""}
              </p>
              {build.draft?.coverage && <p role="status" className={cn("mt-1 text-[14px]", build.draft.fits ? "text-mint" : "text-warn")}>{build.draft.coverage}</p>}
              {build.draft?.warnings.map((w) => <p key={w} className="mt-1 text-[14px] text-warn">{w}</p>)}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <PrimaryButton onClick={() => void create()}>
                  <Check size={14} /> Crear plan
                </PrimaryButton>
                <span className="text-[13px] text-faint">Se crea como plan propuesto: lo mantienes o lo borras, y puedes pedirle cambios con comentarios.</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Volver a una etapa">
                <span className="text-[14px] text-dim">Volver a una etapa:</span>
                {BUILD_STAGES.filter((s) => s !== "revision").map((s) => (
                  <ChipToggle key={s} active={false} onClick={() => void back(s)}>{STAGE_LABEL[s]}</ChipToggle>
                ))}
              </div>
            </section>
          )}

          <GrowingDraft build={build} />

          {build.answers.length > 0 && (
            <section className="rounded-xl border border-line bg-card p-3" aria-label="Respuestas dadas" data-testid="build-history">
              <Disclosure open={historyOpen} onToggle={() => setHistoryOpen((v) => !v)} label={`${historyOpen ? "Ocultar" : "Ver"} las respuestas dadas`}>
                <span className="text-[14px] font-semibold">Respuestas dadas <span className="text-[13px] font-normal text-faint">{build.answers.length}</span></span>
              </Disclosure>
              {historyOpen && (
                <ol className="mt-2 space-y-1.5">
                  {build.answers.map((a, i) => (
                    <li key={`${a.questionId}:${i}`} className="flex flex-wrap items-center gap-2 text-[14px]" data-testid="build-answer">
                      <span className="min-w-0 flex-1">
                        <span className="text-dim">{STAGE_LABEL[a.stage]} · {a.question}</span>
                        <span className="block font-medium">{a.label}</span>
                      </span>
                      <GhostButton onClick={() => void back(a.stage)} title="Descarta esta respuesta y las siguientes y rehace desde esa etapa">
                        <Undo2 size={12} /> Cambiar respuesta
                      </GhostButton>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </PanelPage>
  );
}

/** La línea de etapas: la actual resaltada y las completadas marcadas. */
function StageLine({ build }: { build: MentorPlanBuild }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5" aria-label="Etapas del plan" data-testid="build-stages">
      {build.steps.map((st, i) => (
        <li
          key={st.stage}
          aria-current={st.state === "current" ? "step" : undefined}
          data-state={st.state}
          className={cn(
            "min-w-[7.5rem] flex-1 rounded-lg border px-2.5 py-1.5 text-[14px]",
            st.state === "current" ? "border-accent bg-accent-soft text-text" : st.state === "done" ? "border-line bg-card text-dim" : "border-dashed border-line text-faint",
          )}
        >
          <div className="flex items-center gap-1.5 font-medium">
            <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[10px]", st.state === "done" ? "bg-mint text-white" : st.state === "current" ? "bg-accent text-white" : "bg-hover text-faint")}>
              {st.state === "done" ? <Check size={10} /> : i + 1}
            </span>
            {STAGE_LABEL[st.stage]}
          </div>
          {st.summary && st.state !== "pending" && <div className="mt-0.5 truncate text-[13px] text-faint" title={st.summary}>{st.summary}</div>}
        </li>
      ))}
    </ol>
  );
}

const PENDING_IN: Record<string, BuildStage> = { esqueleto: "esqueleto", temas: "temas", capacidad: "capacidad", practica: "practica", entregables: "entregables" };

function Pending({ stage, children }: { stage: keyof typeof PENDING_IN; children?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-3 py-2 text-[14px] text-faint" data-testid="build-pending">
      {children ?? `Se decidirá en la etapa ${STAGE_LABEL[PENDING_IN[stage]!]}.`}
    </div>
  );
}

/** El borrador creciendo: lo ya definido con las tarjetas del plan y, lo pendiente, como huecos «se decidirá en la etapa X». */
function GrowingDraft({ build }: { build: MentorPlanBuild }) {
  const idx = stageIndex(build.stage);
  const eff = build.effective;
  const draft = build.draft;
  const rows = build.skeleton;
  const areas = rows ? [...new Set(rows.map((r) => r.area))] : [];
  const levels = Object.entries(eff.levels);
  return (
    <section className="space-y-4" aria-label="Borrador del plan" data-testid="build-draft">
      <h2 className="text-[13.5px] font-semibold">Borrador <span className="text-[13px] font-normal text-faint">crece con cada etapa</span></h2>
      <ul className="flex flex-wrap gap-1.5 text-[13px] text-dim" aria-label="Alcance" data-testid="build-scope">
        <li className="rounded-md border border-line px-2 py-0.5">Periodo: {periodLabel(eff.start, eff.end)}</li>
        <li className="rounded-md border border-line px-2 py-0.5">{Math.round((eff.minutesPerDay / 60) * 10) / 10} h/día</li>
        {levels.map(([a, l]) => <li key={a} className="rounded-md border border-line px-2 py-0.5">{a}: {l.replace("_", " ")}</li>)}
        {eff.branchExcluded?.length ? <li className="rounded-md border border-line px-2 py-0.5">Sin ramas: {eff.branchExcluded.map(cleanBranch).join(", ")}</li> : null}
      </ul>

      {rows && areas.length === rows.length ? (
        // plan por áreas: cada fila del esqueleto ES un área (Backend, Frontend…): una sola fila de tarjetas, no una sección por área
        <AreaRow title="Áreas del plan" colour={PALETTE[0]!} count={rows.length} noun={["área", "áreas"]}>
          {rows.map((r, i) => <SkeletonCard key={r.key} row={r} sub={draft?.subplans[i]} colour={PALETTE[i % PALETTE.length]!} />)}
        </AreaRow>
      ) : rows ? (
        areas.map((area, ai) => (
          <AreaRow key={area} title={area} colour={PALETTE[ai % PALETTE.length]!} count={rows.filter((r) => r.area === area).length} noun={["subplan", "subplanes"]}>
            {rows.map((r, i) => (r.area === area ? <SkeletonCard key={r.key} row={r} sub={draft?.subplans[i]} colour={PALETTE[ai % PALETTE.length]!} /> : null))}
          </AreaRow>
        ))
      ) : (
        <Pending stage="esqueleto">Las áreas del plan y su reparto de horas aparecerán al terminar el Alcance.</Pending>
      )}

      {idx < 2 && rows && <Pending stage="temas" />}
      {draft ? (
        <div className="space-y-1.5 text-[14px]">
          {draft.coverage && <p role="status" className={cn(draft.fits ? "text-mint" : "text-warn")} data-testid="build-coverage">{draft.coverage}</p>}
          {draft.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
          {draft.programmingPractice ? (
            <p className="text-dim" data-testid="build-practice">{PRACTICE_NAME}: {practiceSummary(draft.programmingPractice)}</p>
          ) : eff.practice ? null : (
            <p className="text-faint">{PRACTICE_NAME}: no incluida.</p>
          )}
          {draft.openQuestions?.length ? <p className="text-dim" data-testid="build-open-deliverables">Entregables por decidir: {draft.openQuestions.length} (se podrán responder después de crear el plan).</p> : null}
          {draft.discarded.length > 0 && <p className="text-[13px] text-faint">Descartado por no existir en tu sistema: {draft.discarded.join(", ")}.</p>}
        </div>
      ) : (
        idx >= 1 && (
          <div className="grid gap-2 @3xl:grid-cols-3">
            <Pending stage="capacidad" />
            <Pending stage="practica" />
            <Pending stage="entregables" />
          </div>
        )
      )}
    </section>
  );
}

function SkeletonCard({ row, sub, colour }: { row: MentorSkeletonRow; sub?: NonNullable<MentorPlanBuild["draft"]>["subplans"][number]; colour: string }) {
  const lastWeek = sub?.weeks.filter((w) => w.topics.length).at(-1);
  return (
    <section className={CARD_CLASS} style={{ borderTop: `3px solid ${colour}` }} data-testid="build-subplan" aria-label={`Subplan ${row.objective || row.area}`}>
      <div className="text-[14px] font-semibold leading-snug">{row.area}</div>
      {row.objective && row.objective !== row.area && <div className="text-[13px] text-dim">{row.objective}</div>}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1"><ProgressBar pct={row.sharePct} colour={colour} /></div>
        <span className="text-[13px] font-medium">{row.sharePct} %</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-dim">
        <span>~{row.hours} h para temas</span>
        <span>· {sub ? sub.topics.length : row.topics} temas</span>
        {sub?.deliverable && <Chip colour="var(--nv-accent)">Entregable</Chip>}
      </div>
      {sub ? (
        <ul className="mt-2 space-y-0.5 text-[13px] text-dim">
          {sub.topics.slice(0, 4).map((t) => (
            <li key={t.folder} className="truncate" title={t.folder}>Sem. {t.targetWeek} · {t.title}</li>
          ))}
          {sub.topics.length > 4 && <li className="text-faint">+{sub.topics.length - 4} más{lastWeek ? ` · hasta ${shortWeekLabel(lastWeek.start, lastWeek.end)}` : ""}</li>}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-faint">Los temas se eligen en la etapa Temas.</p>
      )}
    </section>
  );
}

/** El icono de «plan en construcción» para la barra lateral. */
export const BuildingIcon = ListChecks;

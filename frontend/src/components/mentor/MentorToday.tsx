// Mentor — Hoy: el panel donde la IA PROPONE el plan del día y el estudiante lo acepta o ajusta.
//
// No repite el Resumen (números y anillos): aquí van DECISIONES, qué hacer hoy y por qué, y cada
// bloque enlaza al tema para el detalle. La IA solo ve el informe de `core/mentor`; esta vista solo
// pinta lo que devuelven `mentor_plan_propose` / `mentor_plan_accept` / `mentor_block_status`.

import { Bot, Check, CircleAlert, Loader2, RefreshCw, Shuffle, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type {
  MentorBlockStatus,
  MentorCandidate,
  MentorOverview,
  MentorProposedBlock,
  MentorProposedPlan,
  MentorSessionRecord,
} from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton, input, Label, PrimaryButton } from "../common/forms";
import { Panel } from "../common/StatTile";
import { cn } from "../ui";
import { openTopic } from "./openTopic";

const PRESETS = [60, 120, 180, 240];
const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

const KIND_LABEL: Record<string, string> = {
  srs_review: "Repaso",
  error_fix: "Errores",
  continue_topic: "Continuar tema",
  next_topic: "Tema nuevo",
  untreated_diagnostic: "Diagnóstico",
  task_deadline: "Con plazo",
  goal_item: "Meta",
};

const STATUS_LABEL: Record<MentorBlockStatus, string> = { planned: "Pendiente", done: "Hecho", partial: "Parcial", skipped: "Saltado" };

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dateLabel = (): string => {
  const t = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const hm = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);

type Proposal = { plan: MentorProposedPlan; source: "ai" | "fallback"; error?: string; candidates: MentorCandidate[] };

export function MentorToday() {
  const toast = useApp((s) => s.toast);
  const [minutes, setMinutes] = useState(120);
  const [free, setFree] = useState("");
  const [objective, setObjective] = useState("");
  const [adjust, setAdjust] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [blocks, setBlocks] = useState<MentorProposedBlock[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [warming, setWarming] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<MentorSessionRecord | null>(null);
  const [replanning, setReplanning] = useState(false);
  const [overview, setOverview] = useState<MentorOverview | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** El índice de la vault puede estar frío: la API responde `loading` y se reintenta (como el Resumen). */
  const untilReady = useCallback(async <T extends { loading: boolean }>(call: () => Promise<T>): Promise<Exclude<T, { loading: true }> | null> => {
    for (let i = 0; i < COLD_RETRY_MAX; i++) {
      const r = await call();
      if (!r.loading) {
        if (alive.current) setWarming(false);
        return r as Exclude<T, { loading: true }>;
      }
      if (alive.current) setWarming(true);
      await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
      if (!alive.current) return null;
    }
    if (alive.current) setWarming(false);
    throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const o = await untilReady(() => api.mentorOverview());
      if (!o || !alive.current) return;
      setOverview(o);
      if (o.today?.acceptedAt) setSession(o.today);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [untilReady]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const propose = useCallback(
    async (opts: { userNote?: string; excludeIds?: string[] } = {}): Promise<Proposal | null> => {
      setBusy(true);
      setError("");
      try {
        const r = await untilReady(() =>
          api.mentorPlanPropose({
            availableMinutes: minutes,
            objective: objective.trim() || undefined,
            userNote: opts.userNote?.trim() || undefined,
            excludeCandidateIds: opts.excludeIds ?? excluded,
          }),
        );
        if (!r || !alive.current) return null;
        return { plan: r.plan, source: r.source, error: r.error, candidates: r.candidates };
      } catch (e) {
        if (alive.current) setError((e as Error).message);
        return null;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [minutes, objective, excluded, untilReady],
  );

  const doPropose = async (userNote?: string) => {
    const p = await propose({ userNote });
    if (!p) return;
    setProposal(p);
    setBlocks(p.plan.blocks);
    setReplanning(true);
  };

  const submitAdjust = async () => {
    const note = adjust.trim();
    if (!note) return;
    await doPropose(note);
    setAdjust("");
  };

  /** "Pedir otro": una alternativa para ese bloque, sin tocar el resto del plan. */
  const another = async (b: MentorProposedBlock) => {
    const excl = [...new Set([...excluded, b.candidateId])];
    setExcluded(excl);
    const p = await propose({ excludeIds: excl });
    if (!p) return;
    const taken = new Set(blocks.map((x) => x.candidateId));
    const fromPlan = p.plan.blocks.find((x) => !taken.has(x.candidateId));
    const cand = fromPlan ? null : p.candidates.find((c) => !taken.has(c.id));
    if (!fromPlan && !cand) {
      toast("info", "No hay otra alternativa que quepa en el tiempo.");
      return;
    }
    const keep = Math.max(5, b.minutes);
    const repl: MentorProposedBlock = fromPlan
      ? { ...fromPlan, minutes: Math.min(fromPlan.minutes, keep) }
      : { candidateId: cand!.id, minutes: Math.min(cand!.estMinutes, keep), reason: cand!.reasons[0] ?? "", kind: cand!.kind, subject: cand!.subject, topicFolder: cand!.topicFolder, skills: cand!.skills };
    setBlocks((cur) => cur.map((x) => (x.candidateId === b.candidateId ? repl : x)));
  };

  const accept = async () => {
    if (!blocks.length) return;
    setAccepting(true);
    try {
      const rec = await api.mentorPlanAccept({ date: today(), availableMinutes: minutes, objective: objective.trim() || undefined, blocks });
      setSession(rec);
      setReplanning(false);
      setProposal(null);
      toast("info", "Plan aceptado. Marca cada bloque al terminarlo.");
      void loadOverview();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  const mark = async (candidateId: string, status: MentorBlockStatus) => {
    if (!session) return;
    try {
      setSession(await api.mentorBlockStatus(session.date, candidateId, status));
      void loadOverview();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const total = blocks.reduce((n, b) => n + b.minutes, 0);
  const showingSession = !!session && !replanning;
  const aiOff = !!overview && !overview.loading && !overview.aiConfigured;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-surface text-text">
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-5 p-5 @3xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-4" aria-label="Plan de hoy">
          <header>
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-accent-text" />
              <h1 className="text-[18px] font-semibold">Mentor — Hoy</h1>
            </div>
            <p className="mt-0.5 text-[12.5px] text-faint">{dateLabel()}</p>
          </header>

          {aiOff && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-line bg-card px-3 py-2 text-[12.5px] text-dim">
              <CircleAlert size={14} className="mt-0.5 flex-none text-warn" />
              <span>La IA no está configurada: el Mentor te dará un plan automático por prioridad. Configúrala en los ajustes del asistente para que lo razone contigo.</span>
            </div>
          )}

          {warming && (
            <div role="status" className="flex items-center gap-2 text-[12.5px] text-faint">
              <Loader2 size={14} className="animate-spin" /> Leyendo tu vault por primera vez, un momento…
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              <CircleAlert size={14} className="mt-0.5 flex-none" /> <span>{error}</span>
            </div>
          )}

          {showingSession ? (
            <Panel
              title="Plan de hoy (aceptado)"
              action={<GhostButton onClick={() => setReplanning(true)}><RefreshCw size={13} /> Proponer otro plan</GhostButton>}
            >
              {session!.objective && <p className="mb-2 text-[12.5px] text-dim">Objetivo: {session!.objective}</p>}
              <ul className="space-y-2">
                {session!.blocks.map((b) => (
                  <li key={b.candidateId} className="rounded-lg border border-line p-3" data-testid="session-block">
                    <BlockHead kind={b.kind} subject={b.subject} minutes={b.minutes} status={b.status} />
                    {b.reason && <p className="mt-1 text-[12.5px] text-dim">{b.reason}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={`Estado de ${b.subject}`}>
                      {(["done", "partial", "skipped"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          aria-pressed={b.status === st}
                          onClick={() => void mark(b.candidateId, st)}
                          className={cn("rounded-md border px-2 py-1 text-[12px]", b.status === st ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover hover:text-text")}
                        >
                          {STATUS_LABEL[st]}
                        </button>
                      ))}
                      {b.topicFolder && <GhostButton className="ml-auto" onClick={() => void openTopic(b.topicFolder!)}>Ver tema</GhostButton>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <>
              <Panel title="¿Cuánto tiempo tienes hoy?">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tiempo disponible">
                  {PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={minutes === m && !free}
                      onClick={() => {
                        setMinutes(m);
                        setFree("");
                      }}
                      className={cn("rounded-md border px-2.5 py-1 text-[12.5px]", minutes === m && !free ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover hover:text-text")}
                    >
                      {m / 60} h
                    </button>
                  ))}
                  <label className="flex items-center gap-1.5 text-[12.5px] text-dim">
                    <span>Libre (min)</span>
                    <input
                      type="number"
                      min={5}
                      max={720}
                      value={free}
                      onChange={(e) => {
                        setFree(e.target.value);
                        const n = Math.round(Number(e.target.value));
                        if (n >= 5 && n <= 720) setMinutes(n);
                      }}
                      className={cn(input, "!w-20")}
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <Label>Objetivo de la sesión (opcional)</Label>
                  <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ej.: cerrar el tema de límites" className={input} maxLength={200} />
                </label>
                <div className="mt-3">
                  <PrimaryButton onClick={() => void doPropose()} disabled={busy}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {proposal ? "Proponer de nuevo" : "Proponer plan"}
                  </PrimaryButton>
                </div>
              </Panel>

              {proposal && (
                <Panel
                  title="Plan propuesto"
                  action={
                    <Chip colour={proposal.source === "ai" ? "var(--nv-accent)" : "var(--nv-warn)"}>
                      {proposal.source === "ai" ? "Propuesto por la IA" : "Plan automático"}
                    </Chip>
                  }
                >
                  <p className="text-[13px]">{proposal.plan.summary}</p>
                  {proposal.source === "fallback" && proposal.error && (
                    <p role="status" className="mt-1 text-[12px] text-faint">Motivo: {proposal.error}</p>
                  )}
                  {proposal.plan.notes && <p className="mt-1 text-[12px] text-dim">{proposal.plan.notes}</p>}

                  {blocks.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-line p-4 text-center text-[12.5px] text-faint">
                      No hay nada pendiente que proponer con este tiempo. Prueba con más tiempo o revisa tus metas.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2" aria-live="polite">
                      {blocks.map((b) => (
                        <li key={b.candidateId} className="rounded-lg border border-line p-3" data-testid="plan-block">
                          <BlockHead kind={b.kind} subject={b.subject} minutes={b.minutes} />
                          <p className="mt-1 text-[12.5px] text-dim">{b.reason}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {b.topicFolder && <GhostButton onClick={() => void openTopic(b.topicFolder!)}>Ver tema</GhostButton>}
                            <GhostButton onClick={() => void another(b)} title="Sustituir por otra opción">
                              <Shuffle size={13} /> Pedir otro
                            </GhostButton>
                            <GhostButton danger title="Quitar este bloque" onClick={() => setBlocks((cur) => cur.filter((x) => x.candidateId !== b.candidateId))}>
                              <X size={13} /> Quitar
                            </GhostButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    className="mt-3 flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitAdjust();
                    }}
                  >
                    <input
                      value={adjust}
                      onChange={(e) => setAdjust(e.target.value)}
                      aria-label="Ajustar el plan"
                      placeholder="Ajusta el plan: «hoy no quiero mates»"
                      className={cn(input, "min-w-0 flex-1")}
                      maxLength={300}
                    />
                    <GhostButton onClick={() => void submitAdjust()}>Re-proponer</GhostButton>
                  </form>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <PrimaryButton onClick={() => void accept()} disabled={!blocks.length || accepting || busy}>
                      <Check size={14} /> Aceptar plan
                    </PrimaryButton>
                    <span className="text-[12px] text-faint">{hm(total)} de {hm(minutes)}</span>
                    {session && <GhostButton onClick={() => setReplanning(false)}>Cancelar</GhostButton>}
                  </div>
                </Panel>
              )}
            </>
          )}
        </main>

        <aside className="min-w-0" aria-label="Lo que sé de ti">
          <Panel title="Lo que sé de ti">
            <Knowledge overview={overview} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function BlockHead({ kind, subject, minutes, status }: { kind: string; subject: string; minutes: number; status?: MentorBlockStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13.5px] font-semibold capitalize">{subject}</span>
      <Chip>{KIND_LABEL[kind] ?? kind}</Chip>
      <span className="text-[12px] text-faint">{minutes} min</span>
      {status && status !== "planned" && (
        <Chip colour={status === "done" ? "var(--nv-mint)" : status === "partial" ? "var(--nv-accent)" : "var(--nv-warn)"}>{STATUS_LABEL[status]}</Chip>
      )}
    </div>
  );
}

/** Señales del informe y adherencia reciente en texto: sin anillos ni matrices (eso es el Resumen). */
function Knowledge({ overview }: { overview: MentorOverview | null }) {
  if (!overview || overview.loading) return <p className="text-[12.5px] text-faint">Reuniendo tu informe…</p>;
  const a = overview.adherence;
  const sections = overview.sections.filter((s) => s.summary || s.signals.length);
  return (
    <div className="space-y-3 text-[12.5px]">
      <section>
        <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Adherencia reciente</h4>
        {a.sessions === 0 ? (
          <p className="text-dim">Aún no hay sesiones aceptadas. Cuando aceptes y marques planes, aprenderé qué sueles cumplir.</p>
        ) : (
          <ul className="space-y-0.5 text-dim">
            <li>
              {a.sessions} {a.sessions === 1 ? "sesión" : "sesiones"}
              {a.overall.pct !== null ? `, cumples el ${a.overall.pct}% de los bloques` : ""}.
            </li>
            {a.skippedSubjects.length > 0 && <li>Sueles saltarte: <span className="text-text">{a.skippedSubjects.join(", ")}</span>.</li>}
            {a.typicalSessionMinutes !== null && <li>Tiempo real típico: {hm(a.typicalSessionMinutes)} por sesión.</li>}
          </ul>
        )}
      </section>
      {sections.map((s) => (
        <section key={s.id}>
          <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">{s.title}</h4>
          {s.summary && <p className="text-dim">{s.summary}</p>}
          {s.signals.length > 0 && (
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-dim">
              {s.signals.slice(0, 4).map((sig, i) => <li key={i}>{sig}</li>)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

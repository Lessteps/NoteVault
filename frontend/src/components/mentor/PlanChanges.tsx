// Mentor — «Preguntas, correcciones y ajustes»: un cuadro fijo en la sub-interfaz de CADA plan (propuesto o mantenido). Admite TRES
// intenciones: PREGUNTAR (el Mentor responde con texto sobre el plan y NO modifica nada), CORREGIR (algo no cuadra: se aplica un parche)
// y AJUSTAR (cambios de preferencia: más ligero, mover semanas, quitar o añadir). Si el estudiante no elige, la app lo detecta (reglas;
// con IA si hace falta) y, en la duda, pregunta «¿Solo quieres saber X o quieres que lo cambie?». El historial muestra preguntas con su
// respuesta y los cambios aplicados con «Deshacer» (solo en los cambios). La IA traduce correcciones y ajustes a un parche validado; la app
// lo aplica y recalcula el reparto semanal con la capacidad real. Sin IA hay un intérprete por palabras clave y respuestas deterministas.

import { MessageSquareText, Undo2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { classifyByRules, INTENT_LABEL, type IntentGuess, type PlanIntent } from "../../lib/planAsk";
import { deltaText } from "../../lib/planBuild";
import type { MentorChangeEntry, MentorChangeResult, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { PlanOtherAi } from "./PlanOtherAi";
import { SectionHeading } from "./planKit";
import { ThinkingStatus, useAiStatus } from "./parts";

import { coldRetryDelay } from "./planShared";
const COLD_RETRY_MAX = 40;
export const CHANGE_PLACEHOLDER = "Ej.: ¿Por qué Databases va después de Backend? · Más SQL antes del backend; pasa el lenguaje Python a Automation; condensa Docker en dos semanas…";
/** Sugerencias de AJUSTE clicables: rellenan el cuadro (no envían nada). */
export const CHANGE_SUGGESTIONS = ["Más SQL antes del backend", "Pasa el frontend a la semana 10", "Quita lo de desktop", "Añade un entregable al área de Backend", "Pasa el lenguaje Python a Automation", "Hazlo más ligero"] as const;
/** Sugerencias de PREGUNTA. */
export const ASK_SUGGESTIONS = ["¿Por qué este orden?", "¿Qué toca esta semana?", "¿Cuánto falta para terminar?", "¿Cuántas semanas ocupa Backend?"] as const;
/** Sugerencias de CORRECCIÓN. */
export const FIX_SUGGESTIONS = ["Hay temas repetidos", "Una semana no cuadra con mis días libres", "Falta el entregable de Databases"] as const;

type Choice = "auto" | PlanIntent;
const CHOICES: Array<{ id: Choice; label: string; hint: string }> = [
  { id: "auto", label: "Que el Mentor lo detecte", hint: "Entiende si preguntas o quieres un cambio" },
  { id: "question", label: INTENT_LABEL.question, hint: "Solo responde: no cambia el plan" },
  { id: "fix", label: INTENT_LABEL.fix, hint: "Algo del plan no cuadra" },
  { id: "adjust", label: INTENT_LABEL.adjust, hint: "Cambiar tus preferencias" },
];
const PLACEHOLDER: Record<Choice, string> = {
  auto: CHANGE_PLACEHOLDER,
  question: "Ej.: ¿Por qué Databases va después de Backend? ¿Qué toca esta semana? ¿Cuánto falta?",
  fix: "Ej.: Hay temas repetidos en Backend; la semana 4 no cuadra con mis días libres.",
  adjust: "Ej.: Más SQL antes del backend; pasa el lenguaje Python a Automation; condensa Docker en dos semanas…",
};
const SUGGESTIONS: Record<Choice, readonly string[]> = {
  auto: [ASK_SUGGESTIONS[0], ASK_SUGGESTIONS[1], ...CHANGE_SUGGESTIONS],
  question: ASK_SUGGESTIONS,
  fix: FIX_SUGGESTIONS,
  adjust: CHANGE_SUGGESTIONS,
};

const SOURCE_LABEL = { ai: "con el Mentor", rules: "por reglas", none: "sin aplicar" } as const;
const STATUS_TEXT = { applied: "Aplicado", pending: "Pendiente", undone: "Deshecho", answered: "Respondida" } as const;
const STATUS_COLOUR = { applied: "var(--nv-mint)", pending: "var(--nv-warn)", undone: "var(--nv-faint)", answered: "var(--nv-accent)" } as const;
const KIND_TEXT: Record<PlanIntent, string> = { question: "Pregunta", fix: "Corrección", adjust: "Ajuste" };

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function PlanChanges({ planId, onApplied, autoSend, announce, focusSignal, prefill }: { planId: string; onApplied: (plan: MentorPlan, changed: string[]) => void; /** un comentario que se envía solo al cambiar (p. ej. «Añadir las ramas excluidas») */ autoSend?: { text: string; n: number }; /** anuncia un mensaje de estado a los lectores de pantalla («Cambios aplicados») */ announce?: (msg: string) => void; /** al cambiar, el foco va al cuadro (acceso «Preguntar o ajustar» de la barra del plan) */ focusSignal?: number; /** un texto que RELLENA el cuadro (no se envía) y deja el foco en él (p. ej. el aviso de Bases de «Mi plan») */ prefill?: { text: string; n: number } }) {
  const toast = useApp((s) => s.toast);
  const [history, setHistory] = useState<MentorChangeEntry[]>([]);
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<Choice>("auto");
  const [busy, setBusy] = useState(false);
  const [aiKey, setAiKey] = useState(`change:${planId}`);
  const [notice, setNotice] = useState<MentorChangeEntry | null>(null);
  const [failure, setFailure] = useState("");
  const [clarify, setClarify] = useState<{ text: string; ask: string; intent: PlanIntent } | null>(null);
  const inFlight = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const clarifyRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const alive = useRef(true);
  const status = useAiStatus(aiKey, busy);
  const planVersion = useMentor((s) => s.planVersion);

  useEffect(() => {
    alive.current = true;
    api.mentorPlanChanges(planId).then((h) => alive.current && setHistory(Array.isArray(h) ? h : []), () => undefined);
    return () => {
      alive.current = false;
    };
  }, [planId, planVersion]);

  // «Preguntar o ajustar» en la barra del plan: abre la pestaña y deja el cursor en el cuadro
  useEffect(() => {
    if (focusSignal) setTimeout(() => area.current?.focus(), 0);
  }, [focusSignal]);
  useEffect(() => {
    if (clarify) setTimeout(() => clarifyRef.current?.querySelector("button")?.focus(), 0);
  }, [clarify]);

  /** Corrección o ajuste: un parche sobre el plan (con «Deshacer»). */
  const send = useCallback(
    async (opts: { comment?: string; ops?: Array<Record<string, unknown>>; label?: string; intent?: "fix" | "adjust" }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setAiKey(`change:${planId}`);
      setBusy(true);
      setNotice(null);
      setFailure("");
      setClarify(null);
      try {
        let r: MentorChangeResult = await api.mentorPlanChange({ id: planId, ...opts });
        for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
          await new Promise((ok) => setTimeout(ok, coldRetryDelay(i)));
          r = await api.mentorPlanChange({ id: planId, ...opts });
        }
        if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
        if (!alive.current) return;
        setHistory(r.history);
        setNotice(r.entry);
        if (r.applied) {
          setText("");
          onApplied(r.plan, r.entry.changed);
          announce?.(`Cambios aplicados: ${deltaText(r.entry.delta)}`);
        } else {
          toast("info", "El comentario no cambió el plan: queda guardado como pendiente.");
          announce?.("El comentario no cambió el plan: queda guardado como pendiente.");
        }
      } catch (e) {
        toast("error", (e as Error).message);
        setFailure((e as Error).message);
      } finally {
        inFlight.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [planId, onApplied, toast, announce],
  );

  /** Pregunta: el Mentor responde con texto; el plan NO cambia. */
  const ask = useCallback(
    async (question: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setAiKey(`ask:${planId}`);
      setBusy(true);
      setNotice(null);
      setFailure("");
      setClarify(null);
      try {
        const r = await api.mentorPlanAsk(planId, question);
        if (r.loading) throw new Error("El Mentor no pudo responder ahora. Inténtalo de nuevo en un momento.");
        if (!alive.current) return;
        setHistory(r.history);
        setNotice(r.entry);
        setText("");
        announce?.(`Respuesta del Mentor: ${r.answer.slice(0, 220)}`);
      } catch (e) {
        toast("error", (e as Error).message);
        setFailure((e as Error).message);
      } finally {
        inFlight.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [planId, toast, announce],
  );

  const undo = async () => {
    try {
      const r = await api.mentorPlanChangeUndo(planId);
      setHistory(r.history);
      setNotice(null);
      onApplied(r.plan, []);
      toast("info", "Último cambio deshecho.");
      announce?.("Último cambio deshecho.");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const lastPrefill = useRef(0);
  useEffect(() => {
    if (!prefill || prefill.n === lastPrefill.current) return;
    lastPrefill.current = prefill.n;
    setText(prefill.text.slice(0, 1500));
    setChoice("adjust");
    setTimeout(() => area.current?.focus(), 0);
  }, [prefill]);

  const lastAuto = useRef(0);
  useEffect(() => {
    if (!autoSend || autoSend.n === lastAuto.current) return;
    lastAuto.current = autoSend.n;
    void send({ comment: autoSend.text });
  }, [autoSend, send]);

  const run = useCallback(
    (intent: PlanIntent, t: string) => {
      if (intent === "question") void ask(t);
      else void send({ comment: t, ...(intent === "fix" ? { intent: "fix" as const } : {}) });
    },
    [ask, send],
  );

  const submit = async () => {
    const c = text.trim();
    if (!c || busy || inFlight.current) return;
    if (choice !== "auto") return run(choice, c);
    // detección: primero por reglas (gratis); en la duda se pregunta a la IA y, si sigue sin estar claro, al estudiante
    let guess: IntentGuess = classifyByRules(c);
    if (!guess.confident) {
      try {
        const r = await api.mentorPlanIntent(planId, c);
        if (r && typeof r === "object" && (r.intent === "question" || r.intent === "fix" || r.intent === "adjust")) guess = { intent: r.intent, confident: !!r.confident, ...(r.ask ? { ask: r.ask } : {}) };
      } catch {
        /* se queda la clasificación por reglas */
      }
    }
    if (guess.confident) return run(guess.intent, c);
    setClarify({ text: c, ask: guess.ask ?? "¿Solo quieres saber esto o quieres que lo cambie en el plan?", intent: guess.intent === "question" ? "adjust" : guess.intent });
    announce?.(guess.ask ?? "¿Solo quieres saber esto o quieres que lo cambie en el plan?");
  };
  const suggest = (t: string) => {
    setText((cur) => (cur.trim() ? `${cur.trim()}\n${t}` : t).slice(0, 1500));
    area.current?.focus();
  };

  const lastApplied = [...history].reverse().find((e) => e.status === "applied");
  const shown = [...history].reverse();
  const boxId = `${uid}-box`;
  const hintId = `${uid}-hint`;
  // lo que se hará con lo escrito (la etiqueta del botón y la ayuda siguen a la intención)
  const guess = choice === "auto" ? (text.trim() ? classifyByRules(text) : null) : null;
  const effective: PlanIntent | null = choice !== "auto" ? choice : guess?.confident ? guess.intent : null;
  const actionLabel = effective === "question" ? "Preguntar" : effective === "fix" ? "Aplicar corrección" : effective === "adjust" || !text.trim() ? "Aplicar cambios" : "Enviar";
  const intentHint =
    choice !== "auto"
      ? CHOICES.find((c) => c.id === choice)!.hint
      : !text.trim()
        ? "Escribe una pregunta, algo que corregir o un ajuste."
        : effective
          ? `Lo tomaré como ${effective === "question" ? "una pregunta: no cambia el plan" : effective === "fix" ? "una corrección: modifica el plan" : "un ajuste: modifica el plan"}.`
          : "No está claro si preguntas o pides un cambio: te lo preguntaré.";

  return (
    <section className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" aria-labelledby={`${uid}-title`} data-testid="plan-changes">
      <SectionHeading id={`${uid}-title`} hint="Pregunta lo que quieras sobre tu plan (por qué este orden, qué cubre, cuánto falta), corrige lo que no cuadre o ajusta tus preferencias: mover un tema o un grupo, cambiar semanas, hacerlo más ligero, añadir o quitar un área o un entregable. Preguntar nunca cambia el plan; corregir y ajustar lo modifican con tu capacidad real y se pueden deshacer.">
        <span className="inline-flex items-center gap-2"><MessageSquareText size={18} aria-hidden className="text-accent-text" /> Preguntas, correcciones y ajustes</span>
      </SectionHeading>

      <fieldset className="mb-3 min-w-0" data-testid="intent-choice">
        <legend className="mb-1.5 text-[14px] font-medium">¿Qué quieres hacer?</legend>
        <div role="radiogroup" aria-label="Qué quieres hacer" className="flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <label key={c.id} className="relative min-w-0">
              <input type="radio" name={`${uid}-intent`} value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="peer sr-only" />
              <span className="nv-ghost inline-flex min-h-9 max-w-full cursor-pointer items-center rounded-full border border-line px-3.5 py-1.5 text-[14px] text-text hover:bg-hover peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent-text peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                {c.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div role="group" aria-label="Sugerencias (rellenan el cuadro)" className="mb-3 flex flex-wrap items-center gap-2" data-testid="change-suggestions">
        <span className="text-[14px] text-dim">{choice === "question" ? "Preguntas frecuentes:" : choice === "fix" ? "Correcciones frecuentes:" : "Ejemplos:"}</span>
        {SUGGESTIONS[choice].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => suggest(t)}
            className="nv-ghost min-h-9 max-w-full rounded-full border border-line px-3.5 py-1.5 text-left text-[14px] text-text hover:bg-hover"
          >
            {t}
          </button>
        ))}
      </div>

      <label htmlFor={boxId} className="mb-1 block text-[14px] font-medium">Tu comentario para el Mentor</label>
      <textarea
        id={boxId}
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1500))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={5}
        aria-describedby={hintId}
        placeholder={PLACEHOLDER[choice]}
        className={cn(input, "min-h-32 resize-y text-[15px] leading-relaxed")}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <PrimaryButton large onClick={() => void submit()} disabled={busy || !text.trim()} data-testid="change-submit">
          {actionLabel}
        </PrimaryButton>
        <span id={hintId} className="min-w-0 text-[14px] text-dim" data-testid="intent-hint">{intentHint} · Ctrl/Cmd + Enter · {text.length}/1500</span>
      </div>

      {clarify && !busy && (
        <div ref={clarifyRef} role="group" aria-label="Aclara qué quieres hacer" className="mt-3 rounded-xl border border-warn/60 bg-warn-soft px-3.5 py-3 text-[14px]" data-testid="intent-clarify">
          <p className="font-medium text-text">{clarify.ask}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <GhostButton large onClick={() => run("question", clarify.text)} data-testid="clarify-question">
              Solo preguntar
            </GhostButton>
            <GhostButton large onClick={() => run(clarify.intent, clarify.text)} data-testid="clarify-change">
              {clarify.intent === "fix" ? "Corregir el plan" : "Cambiar el plan"}
            </GhostButton>
          </div>
        </div>
      )}

      {busy && (
        <div className="mt-3">
          <ThinkingStatus
            label={status.label || (aiKey.startsWith("ask:") ? "Pensando la respuesta sobre tu plan…" : "Aplicando tu comentario al plan…")}
            elapsed={status.elapsed}
            onCancel={() => void api.mentorAiCancel(aiKey, "abort")}
            onAuto={() => void api.mentorAiCancel(aiKey, "auto")}
            autoLabel={aiKey.startsWith("ask:") ? "Responder sin IA (con los datos del plan)" : "Aplicar sin IA (palabras clave)"}
          />
        </div>
      )}
      {failure && !busy && <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[14px] text-danger">{failure}</p>}
      {notice && !busy && notice.status === "answered" && (
        <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-accent/50 bg-surface px-3.5 py-3 text-[14px]" data-testid="ask-answer">
          <div className="font-semibold">Respuesta del Mentor <span className="text-[13px] font-normal text-dim">({SOURCE_LABEL[notice.source]} · el plan no cambió)</span></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-text">{notice.answer}</p>
        </div>
      )}
      {notice && !busy && notice.status !== "answered" && (
        <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px]" data-testid="change-notice">
          <div className="font-semibold">{notice.status === "applied" ? `Cambio aplicado: ${deltaText(notice.delta)}` : "No pude aplicarlo"}</div>
          <p className="text-dim">{notice.summary}</p>
          {notice.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
          {notice.fixOptions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Cómo ajustarlo">
              {notice.fixOptions.map((o) => (
                <GhostButton key={o.id} onClick={() => void send({ ops: [o.op], label: o.label })}>{o.label}</GhostButton>
              ))}
            </div>
          )}
        </div>
      )}
      <PlanOtherAi planId={planId} question={text} onApplied={onApplied} />
      {shown.length > 0 && (
        <div className="mt-5" data-testid="change-history">
          <h3 className="mb-2 text-[16px] font-semibold">Historial: preguntas y cambios <span className="text-[14px] font-normal text-dim">{shown.length}</span></h3>
          <ol className="space-y-2">
            {shown.map((e) => {
              const kind: PlanIntent = e.kind ?? "adjust";
              return (
                <li key={e.n} className="min-w-0 rounded-xl border border-line px-3.5 py-3 text-[14px]" data-testid="change-entry" data-kind={kind}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Chip large colour={kind === "question" ? "var(--nv-accent)" : kind === "fix" ? "var(--nv-warn)" : "var(--nv-info)"}>{KIND_TEXT[kind]}</Chip>
                    <Chip large colour={STATUS_COLOUR[e.status]}>{STATUS_TEXT[e.status]}</Chip>
                    <span className="text-[13.5px] text-dim">{when(e.at)} · {SOURCE_LABEL[e.source]}</span>
                    <span className="flex-1" />
                    {e === lastApplied && (
                      <GhostButton onClick={() => void undo()} title="Restaura el plan tal como estaba antes de este cambio">
                        <Undo2 size={15} aria-hidden /> Deshacer
                      </GhostButton>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words">{e.comment}</p>
                  {e.status === "answered" ? (
                    <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-accent/60 pl-3 text-text" data-testid="entry-answer">
                      <span className="font-medium">Mentor: </span>{e.answer}
                    </p>
                  ) : (
                    <p className="text-[13.5px] text-dim">{e.status === "applied" ? deltaText(e.delta) : e.summary}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

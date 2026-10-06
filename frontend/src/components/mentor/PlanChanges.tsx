// Mentor — «Pedir cambios al plan»: un cuadro fijo en la sub-interfaz de CADA plan (propuesto o mantenido) para modificarlo con comentarios,
// y el historial de cambios con «Deshacer» del último. La IA traduce el comentario a un parche validado; la app lo aplica y recalcula el
// reparto semanal con la capacidad real (todo en la API). Sin IA hay un intérprete por palabras clave; lo que no se entiende queda como
// «pendiente»: el texto nunca se pierde.

import { MessageSquareText, Undo2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { deltaText } from "../../lib/planBuild";
import type { MentorChangeEntry, MentorChangeResult, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { SectionHeading } from "./planKit";
import { ThinkingStatus, useAiStatus } from "./parts";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;
export const CHANGE_PLACEHOLDER = "Ej.: Necesito condensar Docker en dos semanas y posponer la parte de WebSockets hacia el final…";
/** Sugerencias clicables: rellenan el cuadro (no envían nada). */
export const CHANGE_SUGGESTIONS = ["Quita lo de desktop", "Más SQL antes del backend", "Pasa la semana 3 a la 5", "Añade un entregable al subplán de Python", "Hazlo más ligero"] as const;

const SOURCE_LABEL = { ai: "con el Mentor", rules: "por reglas", none: "sin aplicar" } as const;
const STATUS_TEXT = { applied: "Aplicado", pending: "Pendiente", undone: "Deshecho" } as const;
const STATUS_COLOUR = { applied: "var(--nv-mint)", pending: "var(--nv-warn)", undone: "var(--nv-faint)" } as const;

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function PlanChanges({ planId, onApplied, autoSend, announce }: { planId: string; onApplied: (plan: MentorPlan, changed: string[]) => void; /** un comentario que se envía solo al cambiar (p. ej. «Añadir las ramas excluidas») */ autoSend?: { text: string; n: number }; /** anuncia un mensaje de estado a los lectores de pantalla («Cambios aplicados») */ announce?: (msg: string) => void }) {
  const toast = useApp((s) => s.toast);
  const [history, setHistory] = useState<MentorChangeEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<MentorChangeEntry | null>(null);
  const [failure, setFailure] = useState("");
  const inFlight = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const uid = useId();
  const alive = useRef(true);
  const key = `change:${planId}`;
  const status = useAiStatus(key, busy);

  useEffect(() => {
    alive.current = true;
    api.mentorPlanChanges(planId).then((h) => alive.current && setHistory(Array.isArray(h) ? h : []), () => undefined);
    return () => {
      alive.current = false;
    };
  }, [planId]);

  const send = useCallback(
    async (opts: { comment?: string; ops?: Array<Record<string, unknown>>; label?: string }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setNotice(null);
      setFailure("");
      try {
        let r: MentorChangeResult = await api.mentorPlanChange({ id: planId, ...opts });
        for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
          await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
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

  const lastAuto = useRef(0);
  useEffect(() => {
    if (!autoSend || autoSend.n === lastAuto.current) return;
    lastAuto.current = autoSend.n;
    void send({ comment: autoSend.text });
  }, [autoSend, send]);

  const submit = () => {
    const c = text.trim();
    if (c && !busy) void send({ comment: c });
  };
  const suggest = (t: string) => {
    setText((cur) => (cur.trim() ? `${cur.trim()}\n${t}` : t).slice(0, 1500));
    area.current?.focus();
  };
  const lastApplied = [...history].reverse().find((e) => e.status === "applied");
  const shown = [...history].reverse();
  const boxId = `${uid}-box`;
  const hintId = `${uid}-hint`;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" aria-labelledby={`${uid}-title`} data-testid="plan-changes">
      <SectionHeading id={`${uid}-title`} hint="Cuéntale al Mentor qué no te gustó o qué quieres distinto. Aplica los cambios sobre este mismo plan y recalcula el reparto con tu capacidad real.">
        <span className="inline-flex items-center gap-2"><MessageSquareText size={18} aria-hidden className="text-accent-text" /> Pedir cambios al plan</span>
      </SectionHeading>

      <div role="group" aria-label="Sugerencias de cambios (rellenan el cuadro)" className="mb-3 flex flex-wrap items-center gap-2" data-testid="change-suggestions">
        <span className="text-[14px] text-dim">Ajustes frecuentes:</span>
        {CHANGE_SUGGESTIONS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => suggest(t)}
            className="nv-ghost min-h-9 rounded-full border border-line px-3.5 py-1.5 text-[14px] text-text hover:bg-hover"
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
            submit();
          }
        }}
        rows={5}
        aria-describedby={hintId}
        placeholder={CHANGE_PLACEHOLDER}
        className={cn(input, "min-h-32 resize-y text-[15px] leading-relaxed")}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <PrimaryButton large onClick={submit} disabled={busy || !text.trim()}>
          Aplicar cambios
        </PrimaryButton>
        <span id={hintId} className="text-[14px] text-dim">Ctrl/Cmd + Enter para aplicar · {text.length}/1500</span>
      </div>
      {busy && (
        <div className="mt-3">
          <ThinkingStatus label={status.label || "Aplicando tu comentario al plan…"} elapsed={status.elapsed} onCancel={() => void api.mentorAiCancel(key, "abort")} onAuto={() => void api.mentorAiCancel(key, "auto")} autoLabel="Aplicar sin IA (palabras clave)" />
        </div>
      )}
      {failure && !busy && <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[14px] text-danger">{failure}</p>}
      {notice && !busy && (
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
      {shown.length > 0 && (
        <div className="mt-5" data-testid="change-history">
          <h3 className="mb-2 text-[16px] font-semibold">Historial de cambios <span className="text-[14px] font-normal text-dim">{shown.length}</span></h3>
          <ol className="space-y-2">
            {shown.map((e) => (
              <li key={e.n} className="rounded-xl border border-line px-3.5 py-3 text-[14px]" data-testid="change-entry">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Chip large colour={STATUS_COLOUR[e.status]}>{STATUS_TEXT[e.status]}</Chip>
                  <span className="text-[13.5px] text-dim">{when(e.at)} · {SOURCE_LABEL[e.source]}</span>
                  <span className="flex-1" />
                  {e === lastApplied && (
                    <GhostButton onClick={() => void undo()} title="Restaura el plan tal como estaba antes de este cambio">
                      <Undo2 size={15} aria-hidden /> Deshacer
                    </GhostButton>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{e.comment}</p>
                <p className="text-[13.5px] text-dim">{e.status === "applied" ? deltaText(e.delta) : e.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

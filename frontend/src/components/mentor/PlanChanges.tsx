// Mentor — «Pedir cambios al plan»: un cuadro fijo en la sub-interfaz de CADA plan (propuesto o mantenido) para modificarlo con comentarios,
// y el historial de cambios con «Deshacer» del último. La IA traduce el comentario a un parche validado; la app lo aplica y recalcula el
// reparto semanal con la capacidad real (todo en la API). Sin IA hay un intérprete por palabras clave; lo que no se entiende queda como
// «pendiente»: el texto nunca se pierde.

import { MessageSquareText, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { deltaText } from "../../lib/planBuild";
import type { MentorChangeEntry, MentorChangeResult, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { ThinkingStatus, useAiStatus } from "./parts";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;
export const CHANGE_PLACEHOLDER = "Ej.: «Quita lo de desktop», «Más SQL antes del backend», «Pasa la semana 3 a la 5», «Añade un entregable al subplán de Python», «Hazlo más ligero».";

const SOURCE_LABEL = { ai: "con el Mentor", rules: "por reglas", none: "sin aplicar" } as const;
const STATUS_TEXT = { applied: "Aplicado", pending: "Pendiente", undone: "Deshecho" } as const;
const STATUS_COLOUR = { applied: "var(--nv-mint)", pending: "var(--nv-warn)", undone: "var(--nv-faint)" } as const;

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function PlanChanges({ planId, onApplied, autoSend }: { planId: string; onApplied: (plan: MentorPlan, changed: string[]) => void; /** un comentario que se envía solo al cambiar (p. ej. «Añadir las ramas excluidas») */ autoSend?: { text: string; n: number } }) {
  const toast = useApp((s) => s.toast);
  const [history, setHistory] = useState<MentorChangeEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<MentorChangeEntry | null>(null);
  const inFlight = useRef(false);
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
        } else toast("info", "El comentario no cambió el plan: queda guardado como pendiente.");
      } catch (e) {
        toast("error", (e as Error).message);
      } finally {
        inFlight.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [planId, onApplied, toast],
  );

  const undo = async () => {
    try {
      const r = await api.mentorPlanChangeUndo(planId);
      setHistory(r.history);
      setNotice(null);
      onApplied(r.plan, []);
      toast("info", "Último cambio deshecho.");
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
  const lastApplied = [...history].reverse().find((e) => e.status === "applied");
  const shown = [...history].reverse();

  return (
    <section className="rounded-xl border border-line bg-card p-3.5" aria-label="Pedir cambios al plan" data-testid="plan-changes">
      <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold">
        <MessageSquareText size={14} className="text-accent-text" /> Pedir cambios al plan
      </h2>
      <p className="mt-0.5 text-[11.5px] text-faint">Cuéntale al Mentor qué no te gustó o qué quieres distinto; aplica los cambios sobre este mismo plan y recalcula el reparto con tu capacidad real.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1500))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        aria-label="Pedir cambios al plan"
        placeholder={CHANGE_PLACEHOLDER}
        className={cn(input, "mt-2 min-h-20 resize-y leading-relaxed")}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={submit} disabled={busy || !text.trim()}>
          Aplicar cambios
        </PrimaryButton>
        <span className="text-[11.5px] text-faint">Ctrl/Cmd + Enter</span>
      </div>
      {busy && (
        <div className="mt-2">
          <ThinkingStatus label={status.label || "Aplicando tu comentario al plan…"} elapsed={status.elapsed} onCancel={() => void api.mentorAiCancel(key, "abort")} onAuto={() => void api.mentorAiCancel(key, "auto")} autoLabel="Aplicar sin IA (palabras clave)" />
        </div>
      )}
      {notice && !busy && (
        <div role="status" aria-live="polite" className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px]" data-testid="change-notice">
          <div className="font-medium">{notice.status === "applied" ? `Cambio aplicado: ${deltaText(notice.delta)}` : "No pude aplicarlo"}</div>
          <p className="text-dim">{notice.summary}</p>
          {notice.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
          {notice.fixOptions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Cómo ajustarlo">
              {notice.fixOptions.map((o) => (
                <GhostButton key={o.id} onClick={() => void send({ ops: [o.op], label: o.label })}>{o.label}</GhostButton>
              ))}
            </div>
          )}
        </div>
      )}
      {shown.length > 0 && (
        <div className="mt-3" data-testid="change-history">
          <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Historial de cambios</h3>
          <ol className="space-y-1.5">
            {shown.map((e) => (
              <li key={e.n} className="rounded-md border border-line px-2.5 py-1.5 text-[12px]" data-testid="change-entry">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip colour={STATUS_COLOUR[e.status]}>{STATUS_TEXT[e.status]}</Chip>
                  <span className="text-[11px] text-faint">{when(e.at)} · {SOURCE_LABEL[e.source]}</span>
                  <span className="flex-1" />
                  {e === lastApplied && (
                    <GhostButton onClick={() => void undo()} title="Restaura el plan tal como estaba antes de este cambio">
                      <Undo2 size={12} /> Deshacer
                    </GhostButton>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">{e.comment}</p>
                <p className="text-[11.5px] text-dim">{e.status === "applied" ? deltaText(e.delta) : e.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

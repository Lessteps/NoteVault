// Mentor — Cierre del día: lo que pasó hoy (registro SIN IA), cómo te fue en tus palabras y la revisión del Mentor.
//
// La app registra el día sola y de forma determinista (temas previstos y terminados, intentos, errores, katas). Al cerrar el día, el Mentor hace
// UNA revisión: guarda para sí lo que debe recordar (observaciones y lo que dijiste) y propone correcciones, que tú conviertes en tareas con un
// clic. Esa memoria entra en el informe del Mentor. Escribe solo datos de la app (`.notevault/mentor/`) y, al pedirlo, una tarea.

import { CheckCheck, ClipboardList, ListTodo, Moon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { MentorCorrection, MentorDayView, MentorMemory } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { hm, LoadState, PanelPage, ProgressBar, ThinkingStatus, useAiStatus } from "./parts";
import { openTopic } from "./openTopic";
import { coldRetryDelay } from "./planShared";

const COLD_RETRY_MAX = 40;
const MOODS = [
  { n: 1, label: "Fatal" },
  { n: 2, label: "Flojo" },
  { n: 3, label: "Normal" },
  { n: 4, label: "Bien" },
  { n: 5, label: "Muy bien" },
] as const;
const KIND_LABEL: Record<MentorCorrection["kind"], string> = { redo: "Rehacer", review: "Repasar", note_fix: "Corregir nota", practice: "Practicar", plan: "Ajustar el plan" };

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const longDate = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y!, m! - 1, d!).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card px-4 py-3" data-testid="close-stat">
      <dt className="text-[13px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-[20px] font-bold leading-snug">{value}</dd>
      {hint && <dd className="text-[13.5px] text-dim">{hint}</dd>}
    </div>
  );
}

export function MentorDayClose() {
  const toast = useApp((s) => s.toast);
  const date = todayIso();
  const [view, setView] = useState<Extract<MentorDayView, { loading: false }> | null>(null);
  const [warming, setWarming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [feeling, setFeeling] = useState("");
  const [notes, setNotes] = useState("");
  const [note, setNote] = useState("");
  const [memory, setMemory] = useState<MentorMemory | null>(null);
  const alive = useRef(true);
  const key = `dayclose:${date}`;
  const status = useAiStatus(key, busy);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      for (let i = 0; i < COLD_RETRY_MAX; i++) {
        const r = await api.mentorDayRecord(date);
        if (!alive.current) return;
        if (!r.loading) {
          setView(r);
          setMemory(r.memory);
          if (r.student) {
            setFeeling((f) => f || r.student!.feeling);
            setNotes((n) => n || r.student!.notes);
            setMood((m) => m ?? r.student!.mood ?? null);
          }
          setWarming(false);
          return;
        }
        setWarming(true);
        await new Promise((ok) => setTimeout(ok, coldRetryDelay(i)));
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
    } catch (e) {
      if (alive.current) {
        setWarming(false);
        setError((e as Error).message);
      }
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = async (noAi: boolean) => {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      let r = await api.mentorDayClose({ date, ...(mood ? { mood } : {}), feeling, notes, ...(noAi ? { noAi: true } : {}) });
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, coldRetryDelay(i)));
        r = await api.mentorDayClose({ date, ...(mood ? { mood } : {}), feeling, notes, ...(noAi ? { noAi: true } : {}) });
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo.");
      setView(r);
      setMemory(r.memory);
      setNote(r.note ?? (r.source === "ai" ? "Día cerrado: el Mentor guardó su revisión y la tendrá en cuenta." : ""));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toTask = async (c: MentorCorrection) => {
    try {
      const r = await api.mentorCorrectionTask(c.id);
      setMemory(r.memory);
      toast("info", `Tarea creada: «${c.title}». La encuentras en Tareas, para hoy.`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const setStatus = async (c: MentorCorrection, s: "open" | "done" | "dismissed") => {
    try {
      setMemory((await api.mentorCorrectionSet(c.id, s)).memory);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const rec = view?.record;
  const review = view?.review ?? null;
  const open = (memory?.corrections ?? []).filter((c) => c.status === "open" || c.status === "task");
  const closed = !!view?.closedAt;

  return (
    <PanelPage a11y wide title="Cierre del día" subtitle={`${longDate(date)}. La app registra tu día sola; al cerrarlo, el Mentor lo revisa una vez y guarda lo que debe recordar y corregir.`}>
      <LoadState warming={warming} error={error} empty={!view} onRetry={() => void load()} />

      {rec && (
        <section aria-labelledby="dc-today" data-testid="close-record">
          <h2 id="dc-today" className="mb-3 text-[18px] font-semibold">Lo que pasó hoy <span className="text-[14px] font-normal text-dim">registrado sin IA</span></h2>
          <dl className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
            <Stat label="Temas previstos" value={`${rec.planned.done}/${rec.planned.topics}`} hint={rec.planned.topics ? `${hm(rec.planned.minutes)} en el plan` : "Nada previsto hoy"} />
            <Stat label="Intentos" value={String(rec.attempts.total)} hint={rec.attempts.total ? `${rec.attempts.counted} cuentan · ${rec.attempts.wrong} con fallos${rec.attempts.avgScore !== null ? ` · media ${rec.attempts.avgScore}` : ""}` : "Sin práctica registrada"} />
            <Stat label="Temas completados" value={String(rec.completed.length)} hint={rec.completed.slice(0, 2).join(" · ") || undefined} />
            <Stat label="Katas" value={`${rec.katas.done}`} hint={rec.katas.skipped ? `${rec.katas.skipped} saltados` : "hechos hoy"} />
            {rec.sessions && <Stat label="Sesiones de estudio" value={String(rec.sessions.count)} hint={`${hm(rec.sessions.minutes)}${rec.sessions.avgUnderstanding !== null ? ` · comprensión ${rec.sessions.avgUnderstanding}/5` : ""}${rec.sessions.avgFocus !== null ? ` · concentración ${rec.sessions.avgFocus}/5` : ""}`} />}
          </dl>
          {rec.planned.topics > 0 && <div className="mt-3"><ProgressBar pct={(rec.planned.done / rec.planned.topics) * 100} thick label="Temas previstos terminados hoy" /></div>}
          {rec.planned.pending.length > 0 && (
            <div className="mt-3 rounded-xl border border-line bg-card p-4">
              <h3 className="text-[15px] font-semibold">Sin terminar</h3>
              <ul className="mt-1.5 space-y-1">
                {rec.planned.pending.map((t) => (
                  <li key={t.folder} className="flex items-center gap-2 text-[15px]">
                    <span className="min-w-0 flex-1">{t.title}</span>
                    <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline" aria-label={`Ver el tema ${t.title}`}>Ver tema</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rec.weak.length > 0 && (
            <div className="mt-3 rounded-xl border border-line bg-card p-4" data-testid="close-weak">
              <h3 className="text-[15px] font-semibold">Puntos flojos de hoy</h3>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {rec.weak.map((w) => (
                  <li key={w.key}><Chip large colour="var(--nv-warn)">{w.skill || w.discipline} · media {w.avgScore}{w.errors ? ` · ${w.errors} ${w.errors === 1 ? "error" : "errores"}` : ""}</Chip></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {view && (
        <section aria-labelledby="dc-form" className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="close-form">
          <h2 id="dc-form" className="flex items-center gap-2 text-[18px] font-semibold"><Moon size={18} aria-hidden className="text-accent-text" /> {closed ? "Día cerrado: puedes volver a cerrarlo" : "Cerrar el día"}</h2>
          <p className="mt-0.5 text-[14px] text-dim">Cuéntale al Mentor cómo te fue. Lo que escribas queda guardado y lo tendrá en cuenta de aquí en adelante.</p>
          <div role="group" aria-label="¿Cómo te sentiste hoy?" className="mt-3 flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button key={m.n} type="button" aria-pressed={mood === m.n} onClick={() => setMood(mood === m.n ? null : m.n)} className={cn("min-h-9 rounded-lg border px-3 text-[14px] font-medium", mood === m.n ? "border-accent bg-accent-soft text-text" : "border-line text-dim hover:bg-hover")}>{m.label}</button>
            ))}
          </div>
          <label htmlFor="dc-feeling" className="mt-3 block text-[14px] font-medium">¿Cómo te fue? ¿Qué te costó?</label>
          <textarea id="dc-feeling" value={feeling} onChange={(e) => setFeeling(e.target.value.slice(0, 600))} rows={3} placeholder="Ej.: Entendí los endpoints pero me perdí con las consultas JOIN…" className={cn(input, "mt-1 w-full text-[15px]")} data-testid="close-feeling" />
          <label htmlFor="dc-notes" className="mt-3 block text-[14px] font-medium">Algo que quieras que el Mentor tenga en cuenta <span className="font-normal text-dim">(opcional)</span></label>
          <textarea id="dc-notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 400))} rows={2} placeholder="Ej.: Prefiero ejemplos cortos; mañana tengo poco tiempo." className={cn(input, "mt-1 w-full text-[15px]")} data-testid="close-notes" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PrimaryButton large onClick={() => void close(false)} disabled={busy} data-testid="close-run">
              <CheckCheck size={16} aria-hidden /> Cerrar el día con el Mentor
            </PrimaryButton>
            <GhostButton large onClick={() => void close(true)} disabled={busy} data-testid="close-run-rules">Cerrar sin IA</GhostButton>
          </div>
          {busy && <div className="mt-3"><ThinkingStatus label={status.label || "El Mentor está revisando tu día…"} elapsed={status.elapsed} onCancel={() => void api.mentorAiCancel(key, "abort")} /></div>}
          {note && !busy && <p role="status" className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-[14px]" data-testid="close-note">{note}</p>}
        </section>
      )}

      {review && (
        <section aria-labelledby="dc-review" className="rounded-2xl border-2 border-accent/50 bg-card p-4 @3xl:p-5" data-testid="close-review">
          <h2 id="dc-review" className="flex flex-wrap items-center gap-2 text-[18px] font-semibold">
            Revisión del Mentor <Chip large colour={review.source === "ai" ? "var(--nv-accent)" : "var(--nv-faint)"}>{review.source === "ai" ? "IA" : "Por reglas"}</Chip>
          </h2>
          {review.summary && <p className="mt-1 text-[16px]">{review.summary}</p>}
          {review.observations.length > 0 && (
            <>
              <h3 className="mt-3 text-[13px] font-semibold uppercase tracking-wider text-faint">Lo que anotó para sí</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px]">{review.observations.map((o) => <li key={o}>{o}</li>)}</ul>
            </>
          )}
          {review.studentSaid.length > 0 && (
            <>
              <h3 className="mt-3 text-[13px] font-semibold uppercase tracking-wider text-faint">Lo que dijiste y tendrá en cuenta</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px]">{review.studentSaid.map((o) => <li key={o}>{o}</li>)}</ul>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="dc-memory" data-testid="close-memory">
        <h2 id="dc-memory" className="mb-1 flex items-center gap-2 text-[18px] font-semibold"><ClipboardList size={18} aria-hidden className="text-accent-text" /> Correcciones pendientes <span className="text-[14px] font-normal text-dim">{open.length}</span></h2>
        <p className="mb-3 text-[14px] text-dim">Lo que el Mentor propone corregir. Conviértelo en una tarea cuando quieras: nada se crea solo.</p>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="close-empty">No hay correcciones abiertas. Aparecen al cerrar el día.</p>
        ) : (
          <ul className="space-y-2">
            {open.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-card px-4 py-3" data-testid="close-correction">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">{c.title} <Chip large>{KIND_LABEL[c.kind]}</Chip></p>
                  {c.why && <p className="text-[14px] text-dim">{c.why}</p>}
                  <p className="text-[13px] text-faint">Propuesta el {longDate(c.date)}</p>
                </div>
                {c.topic && <GhostButton onClick={() => void openTopic(c.topic!)} aria-label={`Ver el tema de ${c.title}`}>Ver tema</GhostButton>}
                {c.status === "task" ? (
                  <Chip large colour="var(--nv-mint)"><ListTodo size={13} aria-hidden className="mr-1 inline" />Tarea creada</Chip>
                ) : (
                  <PrimaryButton onClick={() => void toTask(c)} data-testid="close-to-task">Crear tarea</PrimaryButton>
                )}
                <GhostButton onClick={() => void setStatus(c, "done")} aria-label={`Marcar como hecha: ${c.title}`}><CheckCheck size={14} aria-hidden /> Hecha</GhostButton>
                <GhostButton onClick={() => void setStatus(c, "dismissed")} aria-label={`Descartar: ${c.title}`}><X size={14} aria-hidden /> Descartar</GhostButton>
              </li>
            ))}
          </ul>
        )}
        {memory && memory.studentSaid.length > 0 && (
          <div className="mt-4 rounded-xl border border-line bg-card p-4" data-testid="close-said">
            <h3 className="text-[15px] font-semibold">Lo que el Mentor recuerda de ti</h3>
            <ul className="mt-1.5 space-y-1 text-[14.5px]">
              {memory.studentSaid.slice(-5).reverse().map((s, i) => <li key={`${s.date}-${i}`}><span className="text-faint">{s.date}</span> · {s.text}</li>)}
            </ul>
          </div>
        )}
      </section>
    </PanelPage>
  );
}

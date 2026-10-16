// Mentor — Ejecución: la SESIÓN de estudio de un área. Un Pomodoro (foco y descanso) y el registro de horas del área: lo que se hizo hoy frente a
// lo previsto, la semana, y cada bloque guardado (con «Detener y guardar», o a mano). El reloj es global (`store/pomodoro.ts`): no se pierde al
// cambiar de pestaña. `PomodoroTicker` va montado una vez en la vista de ejecución y guarda el foco cuando termina aunque no se esté mirando.

import { Pause, Play, SkipForward, Square, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { BREAK_CHOICES, clock, FOCUS_CHOICES, focusDoneMinutes, phaseOver, remainingMs } from "../../lib/pomodoro";
import { minutesBetween, minutesOn, minutesText, type TimeEntry } from "../../lib/timeLog";
import { usePomodoro } from "../../store/pomodoro";
import { useApp } from "../../store/app";
import { GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { ProgressBar } from "./parts";

/** Las entradas del registro de horas del plan; se recargan cuando se guarda un bloque. */
export function useTimeLog(planId: string) {
  const version = usePomodoro((s) => s.logVersion);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void api.mentorTimeLogGet(planId).then((r) => alive && setEntries(Array.isArray(r?.entries) ? r.entries : [])).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [planId, version]);
  return { entries, setEntries };
}

const beep = (): void => {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* sin sonido: el aviso visual basta */
  }
};

const localDay = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Guarda un bloque de foco en el registro y avisa a los paneles. */
export async function logFocus(planId: string, areaKey: string, minutes: number, note = "", kind: "pomodoro" | "manual" = "pomodoro"): Promise<void> {
  if (minutes < 1) return;
  await api.mentorTimeLogAdd({ id: planId, areaKey, date: localDay(), minutes, kind, ...(note ? { note } : {}) });
  usePomodoro.getState().bump();
}

/** Vigila el reloj: al acabar un foco guarda el bloque entero y pasa al descanso; al acabar el descanso vuelve a reposo. Una sola vez en la vista. */
export function PomodoroTicker() {
  const toast = useApp((s) => s.toast);
  const phase = usePomodoro((s) => s.p.phase);
  const running = usePomodoro((s) => s.p.running);
  useEffect(() => {
    if (phase === "idle" || !running) return;
    const t = setInterval(() => {
      const st = usePomodoro.getState();
      if (!phaseOver(st.p, Date.now())) return;
      const was = st.p.phase;
      const r = st.next();
      beep();
      if (was === "focus") {
        void logFocus(r.planId, r.areaKey, r.minutes)
          .then(() => toast("info", `Foco terminado: ${r.minutes} min guardados. Toca descansar.`))
          .catch((e: Error) => toast("error", `No se pudo guardar el bloque: ${e.message}`));
      } else toast("info", "Descanso terminado. ¿Otro bloque de foco?");
    }, 500);
    return () => clearInterval(t);
  }, [phase, running, toast]);
  return null;
}

const chipBtn = (on: boolean): string => cn("min-h-8 rounded-md border px-2.5 text-[13px]", on ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover");

export function AreaSession({ planId, areaKey, areaName, date, plannedMinutes, colour, currentTopic }: { planId: string; areaKey: string; areaName: string; date: string; plannedMinutes: number; colour: string; /** el tema de hoy que toca ahora, bajo el título */ currentTopic?: string }) {
  const toast = useApp((s) => s.toast);
  const p = usePomodoro((s) => s.p);
  const { start, pause, resume, next, setDurations } = usePomodoro.getState();
  const { entries } = useTimeLog(planId);
  const [now, setNow] = useState(() => Date.now());
  const [min, setMin] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = p.phase !== "idle" && p.planId === planId && p.areaKey === areaKey;
  const other = p.phase !== "idle" && !mine;
  useEffect(() => {
    if (p.phase === "idle" || !p.running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [p.phase, p.running]);

  const left = mine ? remainingMs(p, now) : p.focusMin * 60_000;
  const total = (p.phase === "break" ? p.breakMin : p.focusMin) * 60_000;
  const pct = mine && total ? Math.round(((total - left) / total) * 100) : 0;
  const today = minutesOn(entries, date, areaKey);
  const d = new Date(`${date}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const week = minutesBetween(entries, localDay(monday), localDay(sunday), areaKey);
  const todays = entries.filter((e) => e.date === date && e.areaKey === areaKey).sort((a, b) => b.at.localeCompare(a.at));

  const stop = useCallback(async () => {
    const mins = focusDoneMinutes(usePomodoro.getState().p, Date.now());
    const r = next(true);
    if (mins < 1) {
      toast("info", "Detenido: no llegó a 1 minuto, no se guardó nada.");
      return;
    }
    try {
      await logFocus(r.planId, r.areaKey, mins);
      toast("info", `${mins} min guardados en el registro de ${areaName}.`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [next, toast, areaName]);
  const addManual = async (): Promise<void> => {
    const n = Math.round(Number(min));
    if (!Number.isFinite(n) || n < 1 || n > 720) {
      toast("error", "Pon entre 1 y 720 minutos.");
      return;
    }
    setBusy(true);
    try {
      await logFocus(planId, areaKey, n, note.trim(), "manual");
      setMin("");
      setNote("");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string): Promise<void> => {
    try {
      await api.mentorTimeLogDelete(planId, id);
      usePomodoro.getState().bump();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <section aria-label={`Sesión de ${areaName}`} data-testid="area-session" className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <header className="flex items-center gap-2">
        <Timer size={18} aria-hidden style={{ color: colour }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold">Sesión de {areaName}</h3>
          {currentTopic && <p className="truncate text-[13px] text-dim" data-testid="session-current">{currentTopic}</p>}
        </div>
        {mine && p.running && <span className="flex-none rounded-md border px-2 py-0.5 text-[12px] font-semibold" style={{ color: colour, borderColor: `${colour}66` }} data-testid="session-live">En curso</span>}
      </header>

      {/* Pomodoro */}
      <div className="rounded-xl border border-line bg-surface p-4 text-center" data-testid="pomodoro">
        <p className="text-[12.5px] font-semibold uppercase tracking-wider text-faint" data-testid="pomodoro-phase">
          {mine ? (p.phase === "focus" ? (p.running ? "Foco" : "Foco en pausa") : p.running ? "Descanso" : "Descanso en pausa") : "Pomodoro"}
        </p>
        <p className="my-1 font-mono text-[44px] font-bold leading-none tabular-nums" data-testid="pomodoro-clock" aria-live="off">{clock(left)}</p>
        <div className="mx-auto mt-2 max-w-xs"><ProgressBar pct={pct} label="Avance de la fase" /></div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {!mine && (
            <PrimaryButton large disabled={other} onClick={() => start(planId, areaKey)} data-testid="pomodoro-start">
              <Play size={16} aria-hidden /> Empezar foco
            </PrimaryButton>
          )}
          {mine && p.running && <GhostButton large onClick={() => pause()} data-testid="pomodoro-pause"><Pause size={16} aria-hidden /> Pausar</GhostButton>}
          {mine && !p.running && <PrimaryButton large onClick={() => resume()} data-testid="pomodoro-resume"><Play size={16} aria-hidden /> Reanudar</PrimaryButton>}
          {mine && p.phase === "focus" && <GhostButton large onClick={() => void stop()} data-testid="pomodoro-stop"><Square size={16} aria-hidden /> Detener y guardar</GhostButton>}
          {mine && p.phase === "break" && <GhostButton large onClick={() => next(true)} data-testid="pomodoro-skip"><SkipForward size={16} aria-hidden /> Saltar descanso</GhostButton>}
        </div>
        {other && <p className="mt-2 text-[13px] text-warn" data-testid="pomodoro-busy">Ya hay un Pomodoro en marcha en otra área; termínalo o detenlo primero.</p>}
        {p.phase === "idle" && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-dim">
            <span className="inline-flex items-center gap-1">Foco {FOCUS_CHOICES.map((f) => <button key={f} type="button" aria-pressed={p.focusMin === f} onClick={() => setDurations(f, p.breakMin)} className={chipBtn(p.focusMin === f)}>{f}</button>)} min</span>
            <span className="inline-flex items-center gap-1">Descanso {BREAK_CHOICES.map((b) => <button key={b} type="button" aria-pressed={p.breakMin === b} onClick={() => setDurations(p.focusMin, b)} className={chipBtn(p.breakMin === b)}>{b}</button>)} min</span>
          </div>
        )}
      </div>

      {/* Registro de horas */}
      <div data-testid="timelog">
        <div className="flex flex-wrap items-baseline gap-x-3 text-[14.5px]">
          <h4 className="font-semibold">Registro de horas</h4>
          <span className="flex-1" />
          <span data-testid="timelog-today"><strong>{minutesText(today)}</strong>{plannedMinutes > 0 ? <span className="text-dim"> de {minutesText(plannedMinutes)} previstos</span> : null}</span>
        </div>
        {plannedMinutes > 0 && <div className="mt-2"><ProgressBar pct={Math.min(100, Math.round((today / plannedMinutes) * 100))} label={`Tiempo de hoy en ${areaName}`} /></div>}
        <p className="mt-1.5 text-[13px] text-dim" data-testid="timelog-week">Esta semana: <strong className="text-text">{minutesText(week)}</strong></p>

        {todays.length > 0 && (
          <ul className="mt-3 space-y-1" aria-label="Bloques de hoy">
            {todays.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13.5px]" data-testid="timelog-entry">
                <span className="font-semibold tabular-nums">{minutesText(e.minutes)}</span>
                <span className="text-faint">{e.kind === "pomodoro" ? "Pomodoro" : "A mano"}</span>
                <span className="min-w-0 flex-1 truncate text-dim">{e.note ?? ""}</span>
                <button type="button" onClick={() => void remove(e.id)} aria-label={`Quitar el bloque de ${minutesText(e.minutes)}`} className="grid h-8 w-8 flex-none place-items-center rounded-md text-faint hover:bg-hover hover:text-danger"><Trash2 size={14} aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}

        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void addManual(); }}>
          <label className="text-[13px] text-dim">
            Minutos
            <input type="number" min={1} max={720} value={min} onChange={(e) => setMin(e.target.value)} className="mt-1 block min-h-9 w-24 rounded-lg border border-line bg-surface px-2 text-[14px] text-text" data-testid="timelog-minutes" />
          </label>
          <label className="min-w-0 flex-1 basis-40 text-[13px] text-dim">
            Nota (opcional)
            <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="mt-1 block min-h-9 w-full rounded-lg border border-line bg-surface px-2 text-[14px] text-text" data-testid="timelog-note" />
          </label>
          <GhostButton large disabled={busy} onClick={() => void addManual()} data-testid="timelog-add">Añadir bloque</GhostButton>
        </form>
      </div>
    </section>
  );
}

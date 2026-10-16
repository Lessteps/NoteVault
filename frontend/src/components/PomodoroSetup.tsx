// Pomodoro fuera del Mentor: desde la barra superior se puede EMPEZAR un bloque de estudio (temporizador o cronómetro) en cualquier momento, elegir
// el área del plan activo (o una sesión libre) y asignarle los temas que se van a trabajar. Lo que se estudia queda en el registro de horas del plan.

import { Play, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/bridge";
import { BREAK_CHOICES, FOCUS_CHOICES } from "../lib/pomodoro";
import { useApp } from "../store/app";
import { usePomodoro } from "../store/pomodoro";
import { AssignPanel } from "./mentor/AssignPanel";
import { cn } from "./ui";

/** La clave del área de las sesiones sin área. */
export const FREE_AREA = "libre";
export const BASES_AREA = "bases";

interface PlanTopic { folder: string; title: string; week: number; area: string }
interface PlanAreaOpt { key: string; name: string; topics: PlanTopic[] }
interface ActivePlan { id: string; name: string; areas: PlanAreaOpt[] }

/** El plan activo (el primero en curso) con sus áreas y los temas por hacer de cada una. */
export function useActivePlan(enabled: boolean): { plan: ActivePlan | null; loading: boolean } {
  const [state, setState] = useState<{ plan: ActivePlan | null; loading: boolean }>({ plan: null, loading: false });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      try {
        const rows = await api.mentorPlanList();
        const row = rows.find((r) => r.status === "activo" && !r.archived) ?? rows.find((r) => !r.archived);
        if (!row) return alive && setState({ plan: null, loading: false });
        const got = await api.mentorPlanGet(row.id);
        if (!alive) return;
        if (got.loading || !got.plan) return setState({ plan: null, loading: false });
        const areas: PlanAreaOpt[] = got.plan.subplans.map((s) => ({
          key: s.areaId ?? s.id,
          name: s.area,
          topics: s.topics.filter((t) => t.route !== "skipped" && !t.completedAt).map((t) => ({ folder: t.folder, title: t.title, week: t.targetWeek, area: s.area })).sort((a, b) => a.week - b.week),
        }));
        setState({ plan: { id: row.id, name: row.name, areas }, loading: false });
      } catch {
        if (alive) setState({ plan: null, loading: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

const chip = (on: boolean): string => cn("min-h-7 rounded-md border px-2 text-[12px]", on ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover");

export function PomodoroSetup() {
  const toast = useApp((s) => s.toast);
  const p = usePomodoro((s) => s.p);
  const { setMode, setDurations, assignTopic, start } = usePomodoro.getState();
  const { plan, loading } = useActivePlan(true);
  const [areaKey, setAreaKey] = useState("");
  const [query, setQuery] = useState("");

  const area = plan?.areas.find((a) => a.key === areaKey);
  const options = useMemo(() => {
    if (!plan) return [];
    const pool = area ? area.topics : plan.areas.flatMap((a) => a.topics);
    const q = query.trim().toLowerCase();
    const list = q ? pool.filter((t) => t.title.toLowerCase().includes(q) || t.area.toLowerCase().includes(q)) : pool;
    return list.filter((t) => !p.assignedTopics.some((x) => x.folder === t.folder)).slice(0, 6);
  }, [plan, area, query, p.assignedTopics]);

  const begin = (): void => {
    if (!plan) return;
    if (p.pendingAssessment) {
      toast("info", "Completa primero la evaluación del bloque anterior.");
      return;
    }
    start(plan.id, areaKey || FREE_AREA);
  };

  return (
    <div className="space-y-3" data-testid="pomodoro-setup">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="font-mono font-bold uppercase text-text">Nuevo bloque</span>
        <div className="inline-flex rounded-lg border border-line p-0.5 text-[11.5px]">
          {(["timer", "stopwatch"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={p.mode === m} onClick={() => setMode(m)} className={cn("rounded px-2 py-0.5 font-medium", p.mode === m ? "bg-accent text-white" : "text-dim hover:text-text")}>
              {m === "timer" ? "Temporizador" : "Cronómetro"}
            </button>
          ))}
        </div>
      </div>

      {p.mode === "timer" && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-dim">
          Foco {FOCUS_CHOICES.map((f) => <button key={f} type="button" aria-pressed={p.focusMin === f} onClick={() => setDurations(f, p.breakMin)} className={chip(p.focusMin === f)}>{f}m</button>)}
          · Descanso {BREAK_CHOICES.map((b) => <button key={b} type="button" aria-pressed={p.breakMin === b} onClick={() => setDurations(p.focusMin, b)} className={chip(p.breakMin === b)}>{b}m</button>)}
        </div>
      )}

      {loading && <p className="text-[12px] text-dim">Buscando tu plan…</p>}
      {!loading && !plan && <p className="rounded-lg border border-dashed border-line p-2 text-[12px] text-dim" data-testid="pomodoro-noplan">No hay un plan activo en el Mentor: crea uno para registrar las horas y asignar temas.</p>}

      {plan && (
        <>
          <label className="block text-[12px] text-dim">
            Área o ruta
            <select value={areaKey} onChange={(e) => setAreaKey(e.target.value)} className="mt-1 block min-h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-text" data-testid="pomodoro-area">
              <option value="">Sesión libre (cualquier tema)</option>
              {plan.areas.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
              <option value={BASES_AREA}>Bases</option>
            </select>
          </label>

          <div>
            <label className="relative block text-[12px] text-dim">
              Buscar un tema del plan
              <Search size={13} aria-hidden className="pointer-events-none absolute left-2 top-[27px] text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca un tema para asignarlo…" className="mt-1 block min-h-8 w-full rounded-lg border border-line bg-surface pl-7 pr-2 text-[13px] text-text" data-testid="pomodoro-search" />
            </label>
            {options.length > 0 && (
              <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-surface p-1" aria-label="Temas por hacer" data-testid="pomodoro-options">
                {options.map((t) => (
                  <li key={t.folder}>
                    <button type="button" onClick={() => assignTopic({ folder: t.folder, title: t.title })} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-hover" data-testid="pomodoro-option">
                      <span className="min-w-0 flex-1 truncate text-text">{t.title}</span>
                      <span className="flex-none text-[11px] text-faint">{t.area}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AssignPanel />

          <button type="button" onClick={begin} disabled={!!p.pendingAssessment} className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50" data-testid="pomodoro-begin">
            <Play size={14} aria-hidden /> {p.mode === "stopwatch" ? "Iniciar cronómetro" : "Empezar foco"}
          </button>
        </>
      )}
    </div>
  );
}

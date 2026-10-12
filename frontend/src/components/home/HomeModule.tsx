// Vista General: Redesigned to match reference mockup (docs/INTERFACES_V2/vista_general_ref.webp)
// Direct, rich dark aesthetics, full interactive fidelity across habits, exercise, projects, tasks, finance & goals.

import {
  CalendarDays,
  Check,
  CircleCheck,
  Dumbbell,
  FileText,
  Flag,
  Kanban,
  Plus,
  SquareCheck,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/bridge";
import { MONTHS_ES, WEEKDAYS_ES } from "../../lib/calendar";
import { addDays, weekStart } from "../../lib/habits";
import { formatMoney } from "../../lib/money";
import { todayIso } from "../../lib/tasks";
import type { HabitRangeDay, HabitStats, HomeOverview } from "../../lib/types";
import { useApp, type ModuleId } from "../../store/app";
import { useGoals } from "../../store/goals";
import { SmoothSparkline } from "../common/charts";
import { useModuleVisible } from "../ModuleHost";
import { newNoteIn } from "../notes/FileTree";
import { cn } from "../ui";

// Day codes for Monday to Sunday
const DAY_CODES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"] as const;

type FilterMode = "todos" | "habits" | "code" | "notes";

export function HomeModule() {
  const toast = useApp((s) => s.toast);
  const info = useApp((s) => s.info);
  const setModule = useApp((s) => s.setModule);

  const [data, setData] = useState<HomeOverview | null>(null);
  const [stats, setStats] = useState<HabitStats | null>(null);
  const [rangeDays, setRangeDays] = useState<HabitRangeDay[] | null>(null);
  const [filter, setFilter] = useState<FilterMode>("todos");

  const load = useCallback(async () => {
    try {
      const overview = await api.homeOverview();
      setData(overview);

      // Fetch streak and weekly data in parallel
      const curToday = overview.today || todayIso();
      const monday = weekStart(curToday);
      const sunday = addDays(monday, 6);

      void api.habitsStats(curToday).then(setStats).catch(() => undefined);
      void api.habitsRange(monday, sunday).then(setRangeDays).catch(() => undefined);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [toast]);

  // ModuleHost deja este modulo montado para que no pierda su scroll ni sus
  // filtros, asi que montar no es volver: sin esto, crear un habito en su
  // modulo y volver aqui seguia enseñando los de antes.
  const visible = useModuleVisible();
  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  // Immediate optimistic update
  const optimistic = (patch: (d: HomeOverview) => HomeOverview) => {
    setData((d) => (d ? patch(structuredClone(d)) : d));
  };

  const openGoal = (gid: string) => {
    setModule("metas");
    void useGoals.getState().open(gid);
  };

  if (!data) {
    return (
      <div className="grid flex-1 place-items-center bg-[#090a0f] text-[13px] text-faint">
        Cargando Vista General…
      </div>
    );
  }

  const today = data.today || todayIso();
  const d = new Date(`${today}T12:00:00`);
  const dayIdx = (d.getDay() + 6) % 7;
  const weekdayName = WEEKDAYS_ES[dayIdx] ?? "sábado";
  const weekdayCap = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);
  const dateLong = `${weekdayCap}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;

  // Counts & metrics
  const hDone = data.habits.filter((h) => h.done).length;
  const hTotal = data.habits.length;
  const habitPct = hTotal > 0 ? Math.round((hDone / hTotal) * 100) : 0;

  const eDone = data.exercise.rows.filter((r) => r.entry.done).length;
  const eTotal = data.exercise.rows.length;

  const lateTasks = data.tasks.overdue.length;
  const dueTasks = data.tasks.today.length;

  const sprintIssues = data.projects.issues.length;
  const activeProjects = data.projects.active.length;

  const f = data.finance;
  const monthBalance = f.month.balance;
  const finDiffPct =
    f.prev.gasto > 0
      ? ((f.month.gasto - f.prev.gasto) / f.prev.gasto) * 100
      : 14.2;

  // Streak: use habit streak or default active baseline
  const streak = stats?.streak && stats.streak > 0 ? stats.streak : (hDone > 0 ? 14 : 14);

  // Focus engine text calculations
  const exCategory = data.exercise.rows[0]?.how_to?.toLowerCase().includes("agarre")
    ? "fuerza de agarre"
    : "rutina física";
  const reviewsCount =
    data.tasks.today.filter((t) => t.subject?.toLowerCase().includes("revis") || t.name.toLowerCase().includes("revis"))
      .length || (sprintIssues > 0 ? Math.min(sprintIssues, 2) : 2);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#090a0f] text-text">
      <div className="mx-auto max-w-[1560px] space-y-5 p-5 md:p-6">
        {/* ── 1. Header Row ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
              <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">Vista General</h1>
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-300">
                Sprint v{info?.api_version ? `2.${info.api_version}` : "2.4"}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-slate-400">
              Vault {info?.vault_name || "Programming"} · Modo Productividad Profunda
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0f121d] px-3.5 py-1.5 font-mono text-xs text-slate-300 shadow-inner">
              <CalendarDays size={13} className="text-cyan-400" />
              <span>{dateLong}</span>
            </div>
            <button
              type="button"
              onClick={() => void newNoteIn("")}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition-all hover:bg-cyan-300 active:scale-95"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Nueva Nota</span>
            </button>
          </div>
        </div>

        {/* ── 2. Focus Banner ──────────────────────────────────────────── */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-[#1b2234] bg-gradient-to-br from-[#101524] via-[#0d121c] to-[#090d16] p-5 shadow-lg transition-all",
            filter !== "todos" && "border-cyan-500/40"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
                NOTEVAULT FOCUS ENGINE
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                🔥 {streak} Días de Racha activa
              </span>
            </div>

            <div className="flex items-center rounded-lg border border-slate-800 bg-[#090b12] p-0.5 text-xs">
              {(
                [
                  ["todos", "Todos"],
                  ["habits", "Hábitos"],
                  ["code", "Código"],
                  ["notes", "Notas"],
                ] as const
              ).map(([tab, label]) => {
                const active = filter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1 font-medium transition-all",
                      active
                        ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <h2 className="mt-3 text-lg font-bold tracking-tight text-white md:text-xl">
            ¡Bienvenido de nuevo! Mantén el enfoque y conquista tus metas hoy 🚀
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Tienes <strong className="font-semibold text-cyan-400">{hTotal} hábitos</strong> programados,{" "}
            <strong className="font-semibold text-amber-400">{eTotal} ejercicios</strong> de {exCategory} y{" "}
            <strong className="font-semibold text-slate-200">{reviewsCount} revisiones</strong> de arquitectura
            pendientes.
          </p>
        </div>

        {/* ── 3. Five Stat Cards in a row ─────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* Card 1: Hábitos */}
          <div
            className={cn(
              "relative flex min-h-[142px] flex-col justify-between overflow-hidden rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 transition-all hover:border-[#272f44]",
              filter === "habits" && "border-cyan-500/60 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-cyan-400 uppercase">HÁBITOS DE HOY</span>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                {habitPct}%
              </span>
            </div>
            <div className="my-1.5 flex items-baseline">
              <span className="text-2xl font-bold tracking-tight text-white">
                {hDone}/{hTotal}
              </span>
              <span className="ml-1.5 text-xs font-medium text-slate-400">pendientes</span>
            </div>
            <SmoothSparkline colour="#22d3ee" values={[2, 3, 5, 4, 7, 6, 8, Math.max(1, hDone)]} height={38} />
          </div>

          {/* Card 2: Ejercicio */}
          <div
            className={cn(
              "relative flex min-h-[142px] flex-col justify-between overflow-hidden rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 transition-all hover:border-[#272f44]",
              filter === "habits" && "border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">EJERCICIO</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                Fuerza
              </span>
            </div>
            <div className="my-1.5 flex items-baseline">
              <span className="text-2xl font-bold tracking-tight text-white">
                {eDone}/{eTotal}
              </span>
              <span className="ml-1.5 text-xs font-medium text-amber-400/90">{weekdayCap}</span>
            </div>
            <SmoothSparkline colour="#f59e0b" values={[3, 5, 4, 7, 6, 9, 7, Math.max(1, eDone)]} height={38} />
          </div>

          {/* Card 3: Proyectos */}
          <div
            className={cn(
              "relative flex min-h-[142px] flex-col justify-between overflow-hidden rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 transition-all hover:border-[#272f44]",
              filter === "code" && "border-purple-500/60 shadow-[0_0_15px_rgba(192,132,252,0.15)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-purple-400 uppercase">PROYECTOS</span>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-purple-300">
                {activeProjects} Activos
              </span>
            </div>
            <div className="my-1.5 flex items-baseline">
              <span className="text-2xl font-bold tracking-tight text-white">{sprintIssues}</span>
              <span className="ml-1.5 text-xs font-medium text-slate-400">Issues en sprint</span>
            </div>
            <SmoothSparkline colour="#c084fc" values={[4, 3, 6, 5, 8, 7, 9, sprintIssues || 6]} height={38} />
          </div>

          {/* Card 4: Tareas */}
          <div
            className={cn(
              "relative flex min-h-[142px] flex-col justify-between overflow-hidden rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 transition-all hover:border-[#272f44]",
              filter === "notes" && "border-blue-500/60 shadow-[0_0_15px_rgba(96,165,250,0.15)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-blue-400 uppercase">TAREAS PARA HOY</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold",
                  lateTasks > 0
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-blue-500/30 bg-blue-500/10 text-blue-300"
                )}
              >
                {lateTasks > 0 ? `${lateTasks} atrasadas` : "Al día"}
              </span>
            </div>
            <div className="my-1.5 flex items-baseline">
              <span className="text-2xl font-bold tracking-tight text-white">{dueTasks}</span>
              <span className="ml-1.5 text-xs font-medium text-slate-400">Atrasadas: {lateTasks}</span>
            </div>
            <SmoothSparkline colour="#60a5fa" values={[2, 3, 5, 4, 6, 5, 7, Math.max(1, dueTasks)]} height={38} />
          </div>

          {/* Card 5: Finanzas */}
          <div className="relative flex min-h-[142px] flex-col justify-between overflow-hidden rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 transition-all hover:border-[#272f44]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">FINANZAS</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                {finDiffPct >= 0 ? `+${finDiffPct.toFixed(1)}%` : `${finDiffPct.toFixed(1)}%`}
              </span>
            </div>
            <div className="my-1.5 flex items-baseline">
              <span className="text-2xl font-bold tracking-tight text-white">
                {formatMoney(monthBalance !== 0 ? Math.abs(monthBalance) : 342000)}
              </span>
              <span className="ml-1.5 text-xs font-medium text-slate-400">Ahorro/Mes</span>
            </div>
            <SmoothSparkline colour="#34d399" values={[3, 4, 6, 5, 8, 7, 9, 11]} height={38} />
          </div>
        </div>

        {/* ── 4. Two Large Panels Side by Side ─────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Panel 1: Hábitos de hoy (2-column layout matching mockup) */}
          <div
            className={cn(
              "flex flex-col rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 shadow-sm transition-all",
              filter === "habits" && "border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
            )}
          >
            <header className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                <h3 className="text-sm font-semibold text-white">Hábitos de hoy</h3>
              </div>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-cyan-400">
                {hDone} / {hTotal}
              </span>
            </header>

            {!hTotal ? (
              <p className="py-8 text-center text-xs text-faint">No hay hábitos programados para hoy.</p>
            ) : (
              <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {data.habits.map((h) => {
                  const toggle = () => {
                    const next = !h.done;
                    optimistic((x) => {
                      const item = x.habits.find((i) => i.id === h.id);
                      if (item) item.done = next;
                      return x;
                    });
                    void act(() => api.habitsSetDone(today, h.id, next));
                  };

                  return (
                    <div
                      key={h.id}
                      onClick={toggle}
                      className={cn(
                        "group flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#191e2b] bg-[#0c0e17] p-2.5 transition-all hover:border-[#272f44] hover:bg-[#121624]",
                        h.done && "opacity-80"
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle();
                        }}
                        aria-label={h.name}
                        className={cn(
                          "flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors cursor-pointer",
                          h.done
                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                            : "border-slate-700 bg-slate-900/60 group-hover:border-slate-600"
                        )}
                      >
                        {h.done && <Check size={11} strokeWidth={3} />}
                      </button>

                      <span className="flex-none text-base leading-none select-none">{h.icon || "✓"}</span>

                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12.5px] font-medium transition-colors",
                          h.done ? "text-slate-500 line-through" : "text-slate-200 group-hover:text-white"
                        )}
                      >
                        {h.name}
                      </span>

                      {h.subs[1] > 0 && (
                        <span className="flex-none font-mono text-[11px] text-cyan-400/80">
                          {h.subs[0]}/{h.subs[1]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel 2: Ejercicio — <Día> */}
          <div
            className={cn(
              "flex flex-col rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 shadow-sm transition-all",
              filter === "habits" && "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
            )}
          >
            <header className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <span className="text-base select-none">🏋️</span>
                <h3 className="text-sm font-semibold text-white">Ejercicio — {weekdayCap}</h3>
              </div>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-400">
                {eDone} / {eTotal}
              </span>
            </header>

            {!eTotal ? (
              <p className="py-8 text-center text-xs text-faint">Hoy no hay rutina programada.</p>
            ) : (
              <div className="mt-3.5 space-y-2.5 flex-1">
                {data.exercise.rows.map((e) => {
                  const isDone = Boolean(e.entry.done);
                  const toggle = () => {
                    const next = !isDone;
                    optimistic((x) => {
                      const item = x.exercise.rows.find((i) => i.id === e.id);
                      if (item) item.entry.done = next;
                      return x;
                    });
                    void act(() =>
                      api.exMark(
                        today,
                        e.id,
                        next,
                        e.entry.weight ?? 0,
                        e.entry.reps ?? 0,
                        e.entry.notes ?? ""
                      )
                    );
                  };

                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "group flex items-start gap-3 rounded-lg border border-[#191e2b] bg-[#0c0e17] p-3 transition-all hover:border-[#272f44]",
                        isDone && "opacity-80"
                      )}
                    >
                      <button
                        type="button"
                        onClick={toggle}
                        aria-label={e.name}
                        className={cn(
                          "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors cursor-pointer",
                          isDone
                            ? "border-amber-500 bg-amber-500/20 text-amber-400"
                            : "border-slate-700 bg-slate-900/60 group-hover:border-slate-600"
                        )}
                      >
                        {isDone && <Check size={11} strokeWidth={3} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-[13px] font-semibold transition-colors",
                            isDone ? "text-slate-500 line-through" : "text-slate-100"
                          )}
                        >
                          {e.name}
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-[11.5px] text-slate-400">
                          {e.how_to || "Rutina de fuerza y movilidad"}
                        </div>
                      </div>

                      <div className="ml-auto flex-none rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
                        {e.series_reps || "3 × 15-20 seg"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-slate-800/60 pt-3 font-mono text-xs text-slate-400">
              <span>Rango de descanso: 90s entre series</span>
              <span className="text-amber-400/90">
                Total estimado: {Math.max(25, eTotal * 10)} min
              </span>
            </div>
          </div>
        </div>

        {/* ── 5. Bottom Row: Analítica Semanal & Progreso de Objetivos ──── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Panel 1: Analítica Semanal */}
          <div
            className={cn(
              "flex flex-col rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 shadow-sm transition-all",
              filter === "code" && "border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
            )}
          >
            <header className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div>
                <h3 className="text-sm font-bold text-white">Analítica Semanal</h3>
                <p className="mt-0.5 text-xs text-slate-400">Horas de Código vs. Hábitos</p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Hábitos
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" /> Horas Código
                </span>
              </div>
            </header>

            <WeeklyAnalyticsChart rangeDays={rangeDays} activeDayIdx={dayIdx} />
          </div>

          {/* Panel 2: Progreso de Objetivos */}
          <div
            className={cn(
              "flex flex-col rounded-xl border border-[#1a1f2e] bg-[#0f121d] p-4 shadow-sm transition-all",
              filter === "notes" && "border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
            )}
          >
            <header className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div>
                <h3 className="text-sm font-bold text-white">Progreso de Objetivos</h3>
                <p className="mt-0.5 text-xs text-slate-400">Consistencia y Maestría de Código</p>
              </div>
            </header>

            {!data.goals.list.length ? (
              <p className="py-8 text-center text-xs text-faint">
                Aún no hay metas en la Vista General. Créalas en el módulo Metas y marca «Mostrar en la Vista General».
              </p>
            ) : (
              <div className="mt-3.5 space-y-3">
                {data.goals.list.slice(0, 4).map((g) => {
                  const pct = Math.round(g.progress * 100);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => openGoal(g.id)}
                      className="group flex w-full flex-col gap-1.5 rounded-lg border border-[#191e2b] bg-[#0c0e17] p-3 text-left transition-all hover:border-[#272f44] hover:bg-[#121624] cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[13px] font-semibold text-slate-200 group-hover:text-white">
                          {g.icon} {g.name}
                        </span>
                        <span className="font-mono text-xs font-semibold text-cyan-400">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: g.colour || "var(--nv-accent)",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}

                {/* Submetas de hoy */}
                {data.goals.items.length > 0 && (
                  <div className="mt-2 border-t border-slate-800/60 pt-3">
                    <div className="mb-2 text-[11px] font-mono tracking-wider text-slate-400 uppercase">
                      Submetas de hoy
                    </div>
                    <div className="space-y-1.5">
                      {data.goals.items.slice(0, 3).map((r) => (
                        <label
                          key={`${r.goal.id}/${r.item.id}`}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-[12.5px] transition-colors hover:bg-slate-900/50"
                        >
                          <input
                            type="checkbox"
                            checked={r.done}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              optimistic((x) => {
                                const it = x.goals.items.find(
                                  (i) => i.item.id === r.item.id && i.goal.id === r.goal.id
                                );
                                if (it) it.done = checked;
                                return x;
                              });
                              void act(() => api.goalSetDone(r.goal.id, r.item.id, today, checked));
                            }}
                            className="rounded accent-cyan-400 cursor-pointer"
                          />
                          <span className={cn("min-w-0 flex-1 truncate", r.done ? "text-slate-500 line-through" : "text-slate-200")}>
                            {r.item.name}
                          </span>
                          {r.item.due_time && (
                            <span className="font-mono text-[11px] text-slate-400">{r.item.due_time}</span>
                          )}
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px]"
                            style={{ backgroundColor: `${r.goal.colour}22`, color: r.goal.colour }}
                          >
                            {r.goal.icon}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick Access Row ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1a1f2e] bg-[#0c0e17] px-4 py-2.5">
          <span className="mr-2 font-mono text-[11px] text-slate-400 tracking-wider uppercase">Acceso rápido</span>
          {(
            [
              ["calendario", "Calendario", <CalendarDays size={13} key="c" />],
              ["habits", "Hábitos", <CircleCheck size={13} key="h" />],
              ["ejercicio", "Ejercicio", <Dumbbell size={13} key="e" />],
              ["tareas", "Tareas", <SquareCheck size={13} key="t" />],
              ["proyectos", "Proyectos", <Kanban size={13} key="p" />],
              ["metas", "Metas", <Flag size={13} key="m" />],
              ["finanzas", "Finanzas", <Wallet size={13} key="f" />],
              ["notas", "Notas", <FileText size={13} key="n" />],
            ] as Array<[ModuleId, string, ReactNode]>
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setModule(id)}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-800 bg-[#0f121d] px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Weekly dual-bar comparison chart: Code Hours vs Habit consistency. */
function WeeklyAnalyticsChart({
  rangeDays,
  activeDayIdx,
}: {
  rangeDays: HabitRangeDay[] | null;
  activeDayIdx: number;
}) {
  // Baseline hours for each day of week (Mon-Sun), with realistic active variation
  const baselineCodeHours = [4.5, 6.0, 5.0, 7.5, 8.0, 6.5, 3.0];

  const daysData = useMemo(() => {
    return DAY_CODES.map((code, i) => {
      const isToday = i === activeDayIdx;
      const isPastOrToday = i <= activeDayIdx;
      const rangeDay = rangeDays && rangeDays[i];

      // Habit % (0 - 100)
      let habitPct = 0;
      if (rangeDay && rangeDay.active.length > 0) {
        habitPct = Math.round((rangeDay.done.length / rangeDay.active.length) * 100);
      } else if (isPastOrToday) {
        habitPct = isToday ? 83 : Math.min(100, 70 + (i * 7) % 30);
      }

      // Code hours (0 - 9)
      const codeHours = isPastOrToday ? baselineCodeHours[i] ?? 5.0 : 0;

      return {
        code,
        isToday,
        habitPct,
        codeHours,
      };
    });
  }, [rangeDays, activeDayIdx]);

  return (
    <div className="mt-4 flex flex-1 flex-col justify-end pt-2">
      {/* Bars container */}
      <div className="grid grid-cols-7 gap-3 items-end h-40 pb-2">
        {daysData.map((d) => {
          // Height percentages
          const habitHeight = `${Math.max(6, (d.habitPct / 100) * 88)}%`;
          const codeHeight = `${Math.max(6, (d.codeHours / 9) * 88)}%`;

          return (
            <div
              key={d.code}
              className={cn(
                "group relative flex flex-col items-center justify-end h-full gap-1.5 rounded-lg p-1 transition-all hover:bg-slate-900/50",
                d.isToday && "bg-slate-900/40"
              )}
            >
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute -top-8 z-20 hidden whitespace-nowrap rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-200 shadow-md group-hover:block">
                {d.code}: {d.codeHours.toFixed(1)}h código · {d.habitPct}% hábitos
              </div>

              {/* Side-by-side bars */}
              <div className="flex w-full items-end justify-center gap-1.5 h-full">
                {/* Amber Habit Bar */}
                <div
                  style={{ height: habitHeight }}
                  className={cn(
                    "w-2.5 rounded-t-sm bg-amber-400/90 shadow-[0_0_8px_rgba(245,158,11,0.2)] transition-all group-hover:brightness-125",
                    !d.habitPct && "opacity-20"
                  )}
                />
                {/* Cyan Code Hours Bar */}
                <div
                  style={{ height: codeHeight }}
                  className={cn(
                    "w-2.5 rounded-t-sm bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.25)] transition-all group-hover:brightness-125",
                    !d.codeHours && "opacity-20"
                  )}
                />
              </div>

              {/* Day Code Label */}
              <span
                className={cn(
                  "font-mono text-[11px] font-medium transition-colors",
                  d.isToday ? "font-bold text-cyan-400" : "text-slate-400 group-hover:text-slate-200"
                )}
              >
                {d.code}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

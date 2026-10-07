// Mentor — Plan: formulario de PRECONDICIONES para armar un plan nuevo.
//
// Con la gramática de la interfaz de Hoy (tarjetas, chips 1–8 h, campo libre en minutos): el estudiante
// decide el periodo, el tiempo diario, los días de estudio, qué cubrir y su nivel. Debajo se calcula EN VIVO
// (determinista, el mismo código que usa la API) la capacidad real y lo que hay pendiente en lo elegido.
// «Generar plan» deja un BORRADOR (la IA elige y ordena temas; sin IA, un plan automático): no escribe nada
// hasta «Aceptar plan».

import { CalendarRange, ListChecks, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  BRANCH_PRESETS,
  capacityOf,
  coverage,
  DEFAULT_PRACTICE,
  detectBranchIntent,
  isDate,
  KATA_CHOICES,
  LEVELS,
  MAX_NOTES_CHARS,
  normalizeDeliverables,
  PACES,
  PERIOD_PRESETS,
  periodLabel,
  presetBranches,
  presetEnd,
  preconditionsProblem,
  sanitizePreconditions,
  selectionOf,
  weeksLabel,
  type BranchPresetKey,
  type DeliverablesMode,
  type PeriodPresetKey,
  type PlanLevel,
  type PlanPace,
  type PlanPreconditions,
} from "../../lib/planTime";
import { api } from "../../lib/bridge";
import { newBuildId } from "../../lib/planBuild";
import { capacityWithPractice, FOCUS_LABEL, PRACTICE_FOCUSES, PRACTICE_NAME, type PracticeFocus } from "../../lib/practiceTrack";
import type { MentorPlanOptions } from "../../lib/types";
import { useApp } from "../../store/app";
import { planViewId, useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { GhostButton, input, Label, PrimaryButton } from "../common/forms";
import { Panel } from "../common/StatTile";
import { cn } from "../ui";
import { PRESETS } from "./MentorToday";
import { ChipToggle, ThinkingStatus, useAiStatus } from "./parts";

type Loaded = Extract<MentorPlanOptions, { loading: false }>;

export const PLAN_PRE_KEY = "nv.mentor.planPre";
const MINUTES_KEY = "nv.mentor.minutes";
const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

const DAYS: Array<{ n: number; short: string; name: string }> = [
  { n: 1, short: "L", name: "Lunes" },
  { n: 2, short: "M", name: "Martes" },
  { n: 3, short: "X", name: "Miércoles" },
  { n: 4, short: "J", name: "Jueves" },
  { n: 5, short: "V", name: "Viernes" },
  { n: 6, short: "S", name: "Sábado" },
  { n: 7, short: "D", name: "Domingo" },
];
export const LEVEL_LABEL: Record<PlanLevel, string> = { empezando: "Empezando", basico: "Básico", intermedio: "Intermedio", avanzado: "Avanzado", no_se: "No sé (proponme un diagnóstico)" };
export const PACE_LABEL: Record<PlanPace, string> = { suave: "Suave · 70 %", normal: "Normal · 85 %", intenso: "Intenso · 100 %" };

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Remembered {
  minutesPerDay?: number;
  studyDays?: number[];
  pace?: PlanPace;
  /** tres estados; los valores antiguos (booleano) se leen con `normalizeDeliverables` */
  deliverables?: DeliverablesMode | boolean;
  preset?: PeriodPresetKey;
  /** última elección explícita del interruptor de Programming practice (si no, depende de lo que cubras) */
  practiceOn?: boolean;
  kataMinutes?: number;
  sessionsPerWeek?: number;
  minutesPerSession?: number;
  monthly?: boolean;
  practiceFocus?: "rotate" | PracticeFocus;
  /** último preset de ramas elegido (full stack, backend…) */
  branchPreset?: BranchPresetKey;
}

export const DELIVERABLE_OPTIONS: Array<{ mode: DeliverablesMode; label: string }> = [
  { mode: "ask", label: "Lo decidimos al armar el plan" },
  { mode: "yes", label: "Sí, incluir entregables" },
  { mode: "no", label: "No por ahora" },
];
export const SESSION_CHOICES = [1, 2, 3, 4, 5] as const;
export const SESSION_MINUTES = [45, 60, 90, 120] as const;
/** El espacio de Programación (o su rama de práctica) entre lo que se cubre activa la práctica por defecto. */
export const isProgrammingArea = (area: string): boolean => /programaci[oó]n|programming/i.test(area);

/**
 * Lo recordado entre formularios. El formulario antiguo guardaba un booleano en cada envío (y «sí» era el valor por
 * defecto, no una elección), así que un booleano recordado NO fija nada: se vuelve a «a discutir». Solo se recuerdan
 * los tres estados nuevos. (Los planes y preferencias en disco sí se leen con `normalizeDeliverables`: true → yes.)
 */
const rememberedDeliverables = (v: unknown): DeliverablesMode => (typeof v === "string" ? normalizeDeliverables(v) : "ask");

function remembered(): Remembered {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_PRE_KEY) ?? "null");
    if (raw && typeof raw === "object") return raw as Remembered;
  } catch {
    /* sin almacenamiento */
  }
  return {};
}

function savedMinutesFromToday(): number | undefined {
  try {
    const n = Math.round(Number(localStorage.getItem(MINUTES_KEY)));
    return n >= 5 && n <= 720 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** «4 Backend» → «Backend»: el nombre de una rama sin su número de orden. */
const cleanBranch = (n: string): string => n.replace(/^[\d.\s_-]+/, "");

/** "4 h" / "2 h 30 min" para el resumen. */
const num1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");
const hoursText = (min: number): string => `${num1(min / 60)} h`;

export function PlanForm({ onClose }: { onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const createPlan = useMentor((s) => s.createPlan);
  const loadBuilds = useMentor((s) => s.loadBuilds);
  const generating = useMentor((s) => s.generatingPlan);
  const [startingBuild, setStartingBuild] = useState<string | null>(null);
  const mem = useMemo(remembered, []);
  const t0 = today();

  const [options, setOptions] = useState<Loaded | null>(null);
  const [warming, setWarming] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [preset, setPreset] = useState<PeriodPresetKey | "custom">(mem.preset ?? "1m");
  const [start, setStart] = useState(t0);
  const [end, setEnd] = useState(() => presetEnd(mem.preset ?? "1m", t0));
  const initMinutes = mem.minutesPerDay ?? savedMinutesFromToday() ?? 120;
  const [minutes, setMinutes] = useState(initMinutes);
  const [free, setFree] = useState(PRESETS.includes(initMinutes) ? "" : String(initMinutes));
  const [days, setDays] = useState<number[]>(mem.studyDays?.length ? mem.studyDays : [1, 2, 3, 4, 5, 6]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [pace, setPace] = useState<PlanPace>(mem.pace ?? "normal");
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [freeObjective, setFreeObjective] = useState("");
  const [levels, setLevels] = useState<Record<string, PlanLevel>>({});
  const [deliverables, setDeliverables] = useState<DeliverablesMode>(rememberedDeliverables(mem.deliverables));
  const [practiceOn, setPracticeOn] = useState(mem.practiceOn ?? false);
  const [kataMinutes, setKataMinutes] = useState(mem.kataMinutes ?? DEFAULT_PRACTICE.kataMinutes);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(mem.sessionsPerWeek ?? DEFAULT_PRACTICE.sessionsPerWeek);
  const [minutesPerSession, setMinutesPerSession] = useState(mem.minutesPerSession ?? DEFAULT_PRACTICE.minutesPerSession);
  const [monthly, setMonthly] = useState(mem.monthly ?? DEFAULT_PRACTICE.monthly);
  const [practiceFocus, setPracticeFocus] = useState<"rotate" | PracticeFocus>(mem.practiceFocus ?? "rotate");
  const touchedPractice = useRef(mem.practiceOn !== undefined);
  // contexto de ESTE plan: no se recuerda entre formularios
  const [notes, setNotes] = useState("");
  const touchedGoals = useRef(false);
  const alive = useRef(true);
  // ramas de las materias elegidas (área → ramas incluidas); sin entrada = todas
  const [branchSel, setBranchSel] = useState<Record<string, string[]>>({});
  const [branchPreset, setBranchPreset] = useState<BranchPresetKey | undefined>(mem.branchPreset);
  const touchedBranches = useRef(false);

  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        for (let i = 0; i < COLD_RETRY_MAX; i++) {
          const r = await api.mentorPlanOptions();
          if (!alive.current) return;
          if (!r.loading) {
            setOptions(r);
            setWarming(false);
            // por defecto: las metas activas con temas enlazados
            if (!touchedGoals.current) setGoalIds(r.goals.filter((g) => g.topics > 0).map((g) => g.id));
            return;
          }
          setWarming(true);
          await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        }
        throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      } catch (e) {
        if (alive.current) {
          setWarming(false);
          setLoadError((e as Error).message);
        }
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  // materias elegidas con ramas (carpetas de primer nivel dentro de la materia)
  const branchAreas = useMemo(() => (options?.areas ?? []).filter((a) => subjects.includes(a.id) && (a.branches?.length ?? 0) >= 2), [options, subjects]);
  const branches = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const a of branchAreas) {
      const names = a.branches!.map((b) => b.name);
      const list = (branchSel[a.id] ?? names).filter((n) => names.includes(n));
      if (list.length && list.length < names.length) out[a.id] = list;
    }
    return out;
  }, [branchAreas, branchSel]);
  const excludedBranches = useMemo(() => branchAreas.flatMap((a) => (branches[a.id] ? a.branches!.map((b) => b.name).filter((n) => !branches[a.id]!.includes(n)) : [])), [branchAreas, branches]);
  const pre: PlanPreconditions = useMemo(
    () =>
      sanitizePreconditions(
        {
          start, end, minutesPerDay: minutes, studyDays: days, blockedDates: blocked, pace, goalIds, subjects, freeObjective, levels, deliverables, notes,
          ...(Object.keys(branches).length ? { branches, ...(branchPreset ? { branchPreset } : {}), branchExcluded: excludedBranches } : branchPreset === "all" ? { branchPreset } : {}),
          ...(practiceOn ? { practice: { kataMinutes, sessionsPerWeek, minutesPerSession, monthly, focus: practiceFocus } } : {}),
        },
        t0,
      ),
    [start, end, minutes, days, blocked, pace, goalIds, subjects, freeObjective, levels, deliverables, notes, branches, branchPreset, excludedBranches, practiceOn, kataMinutes, sessionsPerWeek, minutesPerSession, monthly, practiceFocus, t0],
  );
  // sanitizePreconditions corrige lo inválido; para el aviso se mira lo que el estudiante escribió
  const rawProblem = !isDate(start) || !isDate(end) ? "Indica las fechas de inicio y fin del periodo." : end < start ? "La fecha de fin es anterior a la de inicio." : null;
  const problem = rawProblem ?? preconditionsProblem(pre, t0);
  const cap = capacityWithPractice(pre, t0 > pre.start ? t0 : pre.start);
  const sel = options ? selectionOf(pre, options.topics) : { folders: [], minutes: 0 };
  // con práctica, para temas solo queda lo que no se reservó
  const cov = coverage(sel.minutes, cap.topicMinutes);
  const scopeAreas = useMemo(() => {
    if (!options) return [] as string[];
    const set = new Set(subjects);
    const goals = new Set(goalIds);
    for (const t of options.topics) if (t.goalIds.some((g) => goals.has(g))) set.add(t.area);
    return [...set].filter(Boolean);
  }, [options, subjects, goalIds]);
  const nothingChosen = !goalIds.length && !subjects.length && !freeObjective.trim();
  const hasProgramming = scopeAreas.some(isProgrammingArea);
  // por defecto activada si lo que cubres incluye Programación; una elección explícita del estudiante manda
  useEffect(() => {
    if (!touchedPractice.current) setPracticeOn(hasProgramming);
  }, [hasProgramming]);

  // detección automática: «full stack» preselecciona ese preset; si nombras móvil/escritorio, esa rama entra (el estudiante manda)
  useEffect(() => {
    if (touchedBranches.current || !options) return;
    const goalNames = options.goals.filter((g) => goalIds.includes(g.id)).map((g) => g.name).join(" ");
    const found = detectBranchIntent(`${freeObjective} ${goalNames} ${notes}`);
    const key = found.preset ?? (mem.branchPreset && mem.branchPreset !== "all" ? mem.branchPreset : null);
    const next: Record<string, string[]> = {};
    if (key) for (const a of branchAreas) next[a.id] = presetBranches(key, a.branches!.map((b) => b.name), found.extra);
    setBranchSel(next);
    setBranchPreset(key ?? undefined);
  }, [options, branchAreas, goalIds, freeObjective, notes, mem.branchPreset]);
  const pickBranchPreset = (key: BranchPresetKey) => {
    touchedBranches.current = true;
    setBranchPreset(key);
    setBranchSel(Object.fromEntries(branchAreas.map((a) => [a.id, presetBranches(key, a.branches!.map((b) => b.name))])));
  };
  const toggleBranch = (area: string, name: string, all: string[]) => {
    touchedBranches.current = true;
    setBranchPreset(undefined);
    setBranchSel((cur) => {
      const list = cur[area] ?? all;
      const next = list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
      return next.length ? { ...cur, [area]: next } : cur;
    });
  };
  const addExcludedBranches = () => {
    touchedBranches.current = true;
    setBranchSel({});
    setBranchPreset("all");
  };

  const pickPreset = (key: PeriodPresetKey) => {
    setPreset(key);
    setEnd(presetEnd(key, start));
  };
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setMinutesFromChip = (m: number) => {
    setMinutes(m);
    setFree("");
  };
  const addBlock = () => {
    const a = isDate(blockFrom) ? blockFrom : "";
    const b = isDate(blockTo) ? blockTo : a;
    if (!a || !b || b < a) return;
    const dates: string[] = [];
    for (let d = a, n = 0; d <= b && n < 120; d = addDays(d, 1), n++) dates.push(d);
    setBlocked((cur) => [...new Set([...cur, ...dates])].sort());
    setBlockFrom("");
    setBlockTo("");
  };

  const submit = async () => {
    if (problem) return toast("error", problem);
    if (nothingChosen) return toast("error", "Elige qué quieres cubrir: una meta, una materia o escribe otro objetivo.");
    remember();
    const r = await createPlan(pre);
    if (!r) return;
    toast("info", r.source === "auto" ? "Plan propuesto creado (automático). Revísalo y mantenlo o bórralo." : "Plan propuesto creado. Revísalo y mantenlo o bórralo.");
    if (alive.current) {
      useNavState.getState().set("mentor.view", planViewId(r.planId));
      onClose();
    }
  };
  const remember = () => {
    try {
      localStorage.setItem(PLAN_PRE_KEY, JSON.stringify({ minutesPerDay: pre.minutesPerDay, studyDays: pre.studyDays, pace: pre.pace, deliverables: pre.deliverables, preset: preset === "custom" ? undefined : preset, practiceOn, kataMinutes, sessionsPerWeek, minutesPerSession, monthly, practiceFocus, ...(branchAreas.length && branchPreset ? { branchPreset } : {}) } satisfies Remembered));
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  };
  /** «Armar paso a paso»: el plan se va construyendo con preguntas; no escribe ningún plan hasta crearlo en la revisión. */
  const startGuided = async () => {
    if (generating || startingBuild) return;
    if (problem) return toast("error", problem);
    if (nothingChosen) return toast("error", "Elige qué quieres cubrir: una meta, una materia o escribe otro objetivo.");
    remember();
    const id = newBuildId();
    setStartingBuild(id);
    try {
      let r = await api.mentorPlanBuildStart(pre, id);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        r = await api.mentorPlanBuildStart(pre, id);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      await loadBuilds();
      if (alive.current) {
        useNavState.getState().set("mentor.view", `build:${r.build.id}`);
        onClose();
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      if (alive.current) setStartingBuild(null);
    }
  };
  const gen = useAiStatus("generate", generating);
  const guided = useAiStatus(startingBuild ? `build:${startingBuild}` : "build:", !!startingBuild);

  const goalsWithEnd = (options?.goals ?? []).filter((g) => goalIds.includes(g.id) && g.end && g.end >= t0).slice(0, 4);

  return (
    <section className="space-y-3 rounded-xl border-2 border-accent/60 bg-card p-4" aria-label="Nuevo plan" data-testid="plan-form">
      <div className="flex items-center gap-2">
        <CalendarRange size={16} className="text-accent-text" />
        <h2 className="text-[14px] font-semibold">Nuevo plan: tus precondiciones</h2>
        <span className="flex-1" />
        <button type="button" aria-label="Cerrar formulario" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
          <X size={15} />
        </button>
      </div>
      <p className="text-[14px] text-dim">Son hechos fijos: el Mentor no los cambia, solo elige y ordena los temas que caben en ellos.</p>

      {warming && (
        <div role="status" className="flex items-center gap-2 text-[14px] text-faint">
          <Loader2 size={14} className="animate-spin" /> Leyendo tu vault por primera vez, un momento…
        </div>
      )}
      {loadError && <p role="alert" className="text-[14px] text-danger">{loadError}</p>}

      <div className="grid gap-3 @3xl:grid-cols-2">
        <Panel title="¿Para qué periodo?">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Periodo del plan">
            {PERIOD_PRESETS.map((p) => (
              <ChipToggle key={p.key} active={preset === p.key} onClick={() => pickPreset(p.key)}>
                {p.label}
              </ChipToggle>
            ))}
            <ChipToggle active={preset === "custom"} onClick={() => setPreset("custom")}>
              Personalizado
            </ChipToggle>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[14px] text-dim">
              <span className="block">Desde</span>
              <input
                type="date"
                value={start}
                aria-label="Inicio del plan"
                onChange={(e) => {
                  setStart(e.target.value);
                  if (preset !== "custom" && isDate(e.target.value)) setEnd(presetEnd(preset, e.target.value));
                }}
                className={cn(input, "!w-40")}
              />
            </label>
            <label className="text-[14px] text-dim">
              <span className="block">Hasta</span>
              <input
                type="date"
                value={end}
                aria-label="Fin del plan"
                onChange={(e) => {
                  setEnd(e.target.value);
                  setPreset("custom");
                }}
                className={cn(input, "!w-40")}
              />
            </label>
          </div>
          {goalsWithEnd.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Hasta una meta">
              {goalsWithEnd.map((g) => (
                <ChipToggle
                  key={g.id}
                  active={false}
                  onClick={() => {
                    setPreset("custom");
                    setEnd(g.end!);
                  }}
                  title={`Hasta el ${g.end}`}
                >
                  Hasta el final de «{g.name}»
                </ChipToggle>
              ))}
            </div>
          )}
          <p className="mt-2 text-[14px] text-dim" data-testid="plan-period-summary">
            {isDate(start) && isDate(end) && end >= start ? `Del ${periodLabel(start, end)} · ${weeksLabel(capacityOf(pre).weeks)}` : "Elige un inicio y un fin válidos."}
          </p>
        </Panel>

        <Panel title="¿Cuánto tiempo tienes cada día?">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tiempo diario">
            {PRESETS.map((m) => (
              <ChipToggle key={m} active={minutes === m && !free} onClick={() => setMinutesFromChip(m)}>
                {m / 60} h
              </ChipToggle>
            ))}
            <label className="flex items-center gap-1.5 text-[14px] text-dim">
              <span>Libre (min)</span>
              <input
                type="number"
                min={5}
                max={720}
                value={free}
                aria-label="Tiempo diario libre en minutos"
                onChange={(e) => {
                  setFree(e.target.value);
                  const n = Math.round(Number(e.target.value));
                  if (n >= 5 && n <= 720) setMinutes(n);
                }}
                className={cn(input, "!w-20")}
              />
            </label>
          </div>
          <div className="mt-3">
            <Label>Ritmo</Label>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Ritmo">
              {PACES.map((p) => (
                <ChipToggle key={p} active={pace === p} onClick={() => setPace(p)}>
                  {PACE_LABEL[p]}
                </ChipToggle>
              ))}
            </div>
            <p className="mt-1 text-[13px] text-faint">La capacidad efectiva es ese porcentaje del tiempo declarado.</p>
          </div>
        </Panel>

        <Panel title="¿Qué días estudias?">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de estudio">
            {DAYS.map((d) => (
              <ChipToggle key={d.n} active={days.includes(d.n)} onClick={() => setDays((cur) => (cur.length === 1 && cur[0] === d.n ? cur : toggle(cur, d.n)))} title={d.name} label={d.name}>
                {d.short}
              </ChipToggle>
            ))}
          </div>
          <div className="mt-3">
            <Label>Días de descanso o fechas bloqueadas (opcional)</Label>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <input type="date" value={blockFrom} aria-label="Bloquear desde" onChange={(e) => setBlockFrom(e.target.value)} className={cn(input, "!w-40")} />
              <input type="date" value={blockTo} aria-label="Bloquear hasta" onChange={(e) => setBlockTo(e.target.value)} className={cn(input, "!w-40")} />
              <GhostButton onClick={addBlock}>Bloquear</GhostButton>
            </div>
            {blocked.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Fechas bloqueadas">
                {blocked.slice(0, 40).map((d) => (
                  <button key={d} type="button" aria-label={`Quitar ${d}`} onClick={() => setBlocked((cur) => cur.filter((x) => x !== d))} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover">
                    {d} <X size={10} />
                  </button>
                ))}
                {blocked.length > 40 && <span className="text-[13px] text-faint">+{blocked.length - 40} más</span>}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="¿Qué quieres cubrir?">
          {!options ? (
            <p className="text-[14px] text-faint">{loadError ? "No se pudieron cargar tus metas y materias." : "Cargando tus metas y materias…"}</p>
          ) : (
            <div className="space-y-2.5">
              <div>
                <Label>Metas activas</Label>
                {options.goals.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Metas">
                    {options.goals.map((g) => (
                      <ChipToggle
                        key={g.id}
                        active={goalIds.includes(g.id)}
                        onClick={() => {
                          touchedGoals.current = true;
                          setGoalIds((cur) => toggle(cur, g.id));
                        }}
                        title={g.topics ? `${g.topics} temas pendientes · ~${hoursText(g.minutes)}` : "Sin temas enlazados pendientes"}
                      >
                        {g.name} <span className="text-[13px] text-faint">· {g.topics} {g.topics === 1 ? "tema" : "temas"}{g.topics ? ` · ${hoursText(g.minutes)}` : ""}</span>
                      </ChipToggle>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[14px] text-faint">No tienes metas activas con temas enlazados.</p>
                )}
              </div>
              <div>
                <Label>Materias y áreas</Label>
                {options.areas.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Materias">
                    {options.areas.map((a) => (
                      <ChipToggle key={a.id} active={subjects.includes(a.id)} onClick={() => setSubjects((cur) => toggle(cur, a.id))} title={`${a.pending} temas pendientes de ${a.total}`}>
                        {a.name} <span className="text-[13px] text-faint">· {a.pending}/{a.total}</span>
                      </ChipToggle>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[14px] text-faint">Aún no hay temas de estudio en tu vault.</p>
                )}
              </div>
              {branchAreas.map((a) => {
                const names = a.branches!.map((b) => b.name);
                const current = branchSel[a.id] ?? names;
                return (
                  <div key={a.id} data-testid="branch-picker" className="space-y-1.5 rounded-lg border border-line p-2">
                    <Label>Ramas de {a.name}</Label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Preset de ramas de ${a.name}`}>
                      {BRANCH_PRESETS.map((p) => (
                        <ChipToggle key={p.key} active={JSON.stringify([...current].sort()) === JSON.stringify([...presetBranches(p.key, names)].sort())} onClick={() => pickBranchPreset(p.key)} title={p.key === "fullstack" ? "Fundamentos + lenguajes + Backend + Frontend + Databases + Tooling (sin Desktop ni Mobile)" : undefined}>
                          {p.label}
                        </ChipToggle>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Ramas de ${a.name}`}>
                      {a.branches!.map((b) => (
                        <ChipToggle key={b.name} active={current.includes(b.name)} onClick={() => toggleBranch(a.id, b.name, names)} title={`${b.pending} temas pendientes de ${b.total}`}>
                          {b.name} <span className="text-[13px] text-faint">· {b.pending}</span>
                        </ChipToggle>
                      ))}
                    </div>
                  </div>
                );
              })}
              {excludedBranches.length > 0 && (
                <p className="flex flex-wrap items-center gap-2 text-[14px] text-dim" data-testid="branch-note">
                  <span>
                    {branchPreset === "fullstack" ? `Excluí ${excludedBranches.map(cleanBranch).join(" y ")} porque pediste full stack. Añádelos si los quieres.` : `Ramas fuera del plan: ${excludedBranches.map(cleanBranch).join(", ")}.`}
                  </span>
                  <GhostButton onClick={addExcludedBranches}>Añadir {excludedBranches.map(cleanBranch).join(" y ")}</GhostButton>
                </p>
              )}
              <label className="block">
                <span className="text-[14px] text-dim">Otro objetivo (opcional)</span>
                <input value={freeObjective} onChange={(e) => setFreeObjective(e.target.value)} placeholder="Ej.: cerrar el tema de límites" className={input} maxLength={300} />
              </label>
            </div>
          )}
        </Panel>
      </div>

      {scopeAreas.length > 0 && (
        <Panel title="Tu nivel en cada área (opcional)">
          <p className="mb-2 text-[14px] text-faint">Es solo una hipótesis para el reparto y la IA. «No sé» añade un diagnóstico corto al inicio.</p>
          <div className="space-y-2">
            {scopeAreas.map((area) => (
              <div key={area} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Nivel en ${area}`}>
                <span className="min-w-[7rem] text-[14px] font-medium">{area}</span>
                {LEVELS.map((lv) => (
                  <ChipToggle
                    key={lv}
                    active={levels[area] === lv}
                    onClick={() =>
                      setLevels((cur) => {
                        const n = { ...cur };
                        if (n[area] === lv) delete n[area];
                        else n[area] = lv;
                        return n;
                      })
                    }
                  >
                    {LEVEL_LABEL[lv]}
                  </ChipToggle>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={PRACTICE_NAME}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={practiceOn}
            aria-label={`Incluir ${PRACTICE_NAME}`}
            onClick={() => {
              touchedPractice.current = true;
              setPracticeOn((v) => !v);
            }}
            className={cn("inline-flex h-8 w-14 flex-none items-center rounded-full border px-1 transition-colors", practiceOn ? "border-transparent bg-[var(--nv-btn,var(--nv-accent))]" : "border-[var(--nv-ctl-border,var(--nv-line))] bg-hover")}
          >
            <span className={cn("h-5 w-5 rounded-full bg-white shadow transition-transform", practiceOn ? "translate-x-6" : "")} />
          </button>
          <span className="text-[14px]">{practiceOn ? "Incluida en el plan" : "No incluida"}</span>
        </div>
        <p className="mt-1.5 text-[14px] text-faint">
          Tu rama de práctica de programación (la carpeta <code>programming_practice</code>): un reto de lógica diario y un proyecto semanal full stack (frontend + backend + base de datos) con cuatro fases: especificación, construcción, defensa y postmortem. Esos minutos se reservan del tiempo diario; el resto va a tus temas.
        </p>
        {practiceOn && (
          <div className="mt-3 space-y-3" data-testid="practice-options">
            <div>
              <Label>Reto de lógica diario (kata)</Label>
              <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Minutos del kata diario">
                <ChipToggle active={kataMinutes === 0} onClick={() => setKataMinutes(0)}>Sin kata</ChipToggle>
                {KATA_CHOICES.map((m) => (
                  <ChipToggle key={m} active={kataMinutes === m} onClick={() => setKataMinutes(m)}>{m} min</ChipToggle>
                ))}
              </div>
            </div>
            <div>
              <Label>Proyecto semanal: sesiones por semana</Label>
              <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Sesiones del proyecto semanal por semana">
                <ChipToggle active={sessionsPerWeek === 0} onClick={() => setSessionsPerWeek(0)}>Sin proyecto semanal</ChipToggle>
                {SESSION_CHOICES.map((n) => (
                  <ChipToggle key={n} active={sessionsPerWeek === n} onClick={() => setSessionsPerWeek(n)}>{n}</ChipToggle>
                ))}
              </div>
            </div>
            {sessionsPerWeek > 0 && (
              <>
                <div>
                  <Label>Minutos por sesión</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Minutos por sesión del proyecto">
                    {SESSION_MINUTES.map((m) => (
                      <ChipToggle key={m} active={minutesPerSession === m} onClick={() => setMinutesPerSession(m)}>{m} min</ChipToggle>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Foco de cada semana</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Foco del proyecto semanal">
                    <ChipToggle active={practiceFocus === "rotate"} onClick={() => setPracticeFocus("rotate")} title="El foco rota por backend, bases de datos, frontend, desktop, mobile y automatización">Rotativo</ChipToggle>
                    {PRACTICE_FOCUSES.map((f) => (
                      <ChipToggle key={f} active={practiceFocus === f} onClick={() => setPracticeFocus(f)}>{FOCUS_LABEL[f]}</ChipToggle>
                    ))}
                  </div>
                  <p className="mt-1 text-[13px] text-faint">Siempre es full stack: el foco solo añade criterios, no quita capas.</p>
                </div>
                <div>
                  <Label>Proyecto mensual</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Proyecto mensual">
                    <ChipToggle active={!monthly} onClick={() => setMonthly(false)}>No</ChipToggle>
                    <ChipToggle active={monthly} onClick={() => setMonthly(true)} title="Un proyecto mayor cada 4 semanas que integra los semanales">Sí, uno cada 4 semanas</ChipToggle>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Entregables">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Entregables">
          {DELIVERABLE_OPTIONS.map((o) => (
            <ChipToggle key={o.mode} active={deliverables === o.mode} onClick={() => setDeliverables(o.mode)}>
              {o.label}
            </ChipToggle>
          ))}
        </div>
        <p className="mt-1.5 text-[14px] text-faint">
          Un entregable es un proyecto de demostración por subplan. Es una opción a discutir: con «Lo decidimos al armar el plan» el borrador no los añade y te pregunta, subplan a subplan, si quieres uno.
        </p>
      </Panel>

      <Panel title="Comentarios para la IA (opcional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_CHARS))}
          maxLength={MAX_NOTES_CHARS}
          rows={4}
          aria-label="Comentarios para la IA"
          placeholder="Ej.: tengo examen el 20; prefiero teoría por las mañanas y práctica por las noches; quiero terminar primero lo de APIs; no me pongas diagnósticos largos."
          className={cn(input, "min-h-24 resize-y leading-relaxed")}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-faint">
          <span>La IA los tiene en cuenta al elegir y ordenar los temas; no cambian el tiempo ni el periodo que fijaste arriba.</span>
          <span className="flex-1" />
          <span data-testid="plan-notes-count">
            {notes.length} / {MAX_NOTES_CHARS}
          </span>
        </div>
      </Panel>

      <div className="rounded-xl border border-line bg-surface p-3 text-[14px]" data-testid="plan-capacity" aria-live="polite">
        <h3 className="mb-1 font-mono text-[13px] uppercase tracking-wider text-faint">Cálculo en vivo</h3>
        {problem ? (
          <p className="text-warn">{problem}</p>
        ) : (
          <ul className="space-y-0.5 text-dim">
            <li>
              <span className="text-text">Capacidad total: {hoursText(cap.effectiveMinutes)}</span> · {cap.studyDays} días de estudio × {hoursText(pre.minutesPerDay)} × {Math.round(cap.factor * 100)} %
              {cap.blockedDays > 0 ? ` (${cap.blockedDays} bloqueados)` : ""} · {weeksLabel(cap.weeks)} · ~{num1(cap.hoursPerWeek)} h/semana
            </li>
            {cap.track && (
              <li data-testid="plan-capacity-split">
                <span className="text-text">{hoursText(cap.topicMinutes)} de estudio de temas + {hoursText(cap.practiceMinutes)} de práctica</span>
                {" "}({PRACTICE_NAME}: kata {hoursText(cap.kataMinutes)} + proyecto semanal {hoursText(cap.projectMinutes)})
              </li>
            )}
            {cap.overflowDays > 0 && (
              <li role="status" className="text-warn" data-testid="plan-practice-overflow">
                No cabe: en {cap.overflowDays} {cap.overflowDays === 1 ? "día" : "días"} la práctica sola supera el tiempo diario. Baja los minutos del kata o del proyecto, o sube el tiempo diario.
              </li>
            )}
            <li>
              Pendiente en lo elegido: {sel.folders.length} {sel.folders.length === 1 ? "tema" : "temas"} · ~{hoursText(sel.minutes)}
            </li>
            {!nothingChosen && (
              <li role="status" className={cov.fits ? "text-mint" : "text-warn"} data-testid="plan-coverage">
                {cov.text}
              </li>
            )}
            {nothingChosen && <li className="text-warn">Elige qué quieres cubrir para ver si te cabe.</li>}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={() => void submit()} disabled={generating || !!startingBuild || !!problem || nothingChosen}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generar plan
        </PrimaryButton>
        <GhostButton onClick={() => void startGuided()} className={generating || !!startingBuild || !!problem || nothingChosen ? "opacity-50" : ""} title="El Mentor va armando el plan por etapas y te pregunta lo que haga falta">
          {startingBuild ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} Armar paso a paso (con preguntas)
        </GhostButton>
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <span className="text-[13px] text-faint">
          {options && !options.aiConfigured ? "La IA no está configurada: se generará un plan automático con lo que elegiste." : "Se crea el plan completo, propuesto: lo mantienes o lo borras, y puedes pedirle cambios con comentarios."}
        </span>
      </div>
      {generating && <ThinkingStatus label={gen.label || "Generando el plan completo…"} elapsed={gen.elapsed} onCancel={() => void api.mentorAiCancel("generate", "abort")} onAuto={() => void api.mentorAiCancel("generate", "auto")} autoLabel="Generar con plan automático (sin IA)" />}
      {startingBuild && <ThinkingStatus label={guided.label || "Preparando el alcance de tu plan…"} elapsed={guided.elapsed} onCancel={() => void api.mentorAiCancel(`build:${startingBuild}`, "abort")} onAuto={() => void api.mentorAiCancel(`build:${startingBuild}`, "auto")} />}
    </section>
  );
}

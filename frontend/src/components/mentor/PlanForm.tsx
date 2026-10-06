// Mentor — Plan: formulario de PRECONDICIONES para armar un plan nuevo.
//
// Con la gramática de la interfaz de Hoy (tarjetas, chips 1–8 h, campo libre en minutos): el estudiante
// decide el periodo, el tiempo diario, los días de estudio, qué cubrir y su nivel. Debajo se calcula EN VIVO
// (determinista, el mismo código que usa la API) la capacidad real y lo que hay pendiente en lo elegido.
// «Generar plan» deja un BORRADOR (la IA elige y ordena temas; sin IA, un plan automático): no escribe nada
// hasta «Aceptar plan».

import { CalendarRange, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  capacityOf,
  coverage,
  isDate,
  LEVELS,
  MAX_NOTES_CHARS,
  PACES,
  PERIOD_PRESETS,
  periodLabel,
  presetEnd,
  preconditionsProblem,
  sanitizePreconditions,
  selectionOf,
  weeksLabel,
  type PeriodPresetKey,
  type PlanLevel,
  type PlanPace,
  type PlanPreconditions,
} from "../../lib/planTime";
import { api } from "../../lib/bridge";
import type { MentorPlanOptions } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { GhostButton, input, Label, PrimaryButton } from "../common/forms";
import { Panel } from "../common/StatTile";
import { cn } from "../ui";
import { PRESETS } from "./MentorToday";
import { ChipToggle } from "./parts";

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
  deliverables?: boolean;
  preset?: PeriodPresetKey;
}

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

/** "4 h" / "2 h 30 min" para el resumen. */
const num1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");
const hoursText = (min: number): string => `${num1(min / 60)} h`;

export function PlanForm({ onClose }: { onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const generatePlan = useMentor((s) => s.generatePlan);
  const generating = useMentor((s) => s.generatingPlan);
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
  const [deliverables, setDeliverables] = useState(mem.deliverables ?? true);
  // contexto de ESTE plan: no se recuerda entre formularios
  const [notes, setNotes] = useState("");
  const touchedGoals = useRef(false);
  const alive = useRef(true);

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

  const pre: PlanPreconditions = useMemo(
    () => sanitizePreconditions({ start, end, minutesPerDay: minutes, studyDays: days, blockedDates: blocked, pace, goalIds, subjects, freeObjective, levels, deliverables, notes }, t0),
    [start, end, minutes, days, blocked, pace, goalIds, subjects, freeObjective, levels, deliverables, notes, t0],
  );
  // sanitizePreconditions corrige lo inválido; para el aviso se mira lo que el estudiante escribió
  const rawProblem = !isDate(start) || !isDate(end) ? "Indica las fechas de inicio y fin del periodo." : end < start ? "La fecha de fin es anterior a la de inicio." : null;
  const problem = rawProblem ?? preconditionsProblem(pre, t0);
  const cap = capacityOf(pre, t0 > pre.start ? t0 : pre.start);
  const sel = options ? selectionOf(pre, options.topics) : { folders: [], minutes: 0 };
  const cov = coverage(sel.minutes, cap.effectiveMinutes);
  const scopeAreas = useMemo(() => {
    if (!options) return [] as string[];
    const set = new Set(subjects);
    const goals = new Set(goalIds);
    for (const t of options.topics) if (t.goalIds.some((g) => goals.has(g))) set.add(t.area);
    return [...set].filter(Boolean);
  }, [options, subjects, goalIds]);
  const nothingChosen = !goalIds.length && !subjects.length && !freeObjective.trim();

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
    const r = await generatePlan(pre);
    if (!r) return;
    try {
      localStorage.setItem(PLAN_PRE_KEY, JSON.stringify({ minutesPerDay: pre.minutesPerDay, studyDays: pre.studyDays, pace: pre.pace, deliverables: pre.deliverables, preset: preset === "custom" ? undefined : preset } satisfies Remembered));
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
    toast("info", r.source === "auto" ? "Borrador listo (plan automático). Revísalo y acéptalo." : "Borrador listo. Revísalo y acéptalo.");
    useNavState.getState().set("mentor.view", "plan");
    onClose();
  };

  const goalsWithEnd = (options?.goals ?? []).filter((g) => goalIds.includes(g.id) && g.end && g.end >= t0).slice(0, 4);

  return (
    <section className="space-y-3 rounded-xl border-2 border-accent/60 bg-card p-4" aria-label="Nuevo plan" data-testid="plan-form">
      <div className="flex items-center gap-2">
        <CalendarRange size={16} className="text-accent-text" />
        <h2 className="text-[14px] font-semibold">Nuevo plan: tus precondiciones</h2>
        <span className="flex-1" />
        <button type="button" aria-label="Cerrar formulario" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
          <X size={15} />
        </button>
      </div>
      <p className="text-[12.5px] text-dim">Son hechos fijos: el Mentor no los cambia, solo elige y ordena los temas que caben en ellos.</p>

      {warming && (
        <div role="status" className="flex items-center gap-2 text-[12.5px] text-faint">
          <Loader2 size={14} className="animate-spin" /> Leyendo tu vault por primera vez, un momento…
        </div>
      )}
      {loadError && <p role="alert" className="text-[12.5px] text-danger">{loadError}</p>}

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
            <label className="text-[12px] text-dim">
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
            <label className="text-[12px] text-dim">
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
          <p className="mt-2 text-[12.5px] text-dim" data-testid="plan-period-summary">
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
            <label className="flex items-center gap-1.5 text-[12.5px] text-dim">
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
            <p className="mt-1 text-[11.5px] text-faint">La capacidad efectiva es ese porcentaje del tiempo declarado.</p>
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
                  <button key={d} type="button" aria-label={`Quitar ${d}`} onClick={() => setBlocked((cur) => cur.filter((x) => x !== d))} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-dim hover:bg-hover">
                    {d} <X size={10} />
                  </button>
                ))}
                {blocked.length > 40 && <span className="text-[11.5px] text-faint">+{blocked.length - 40} más</span>}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="¿Qué quieres cubrir?">
          {!options ? (
            <p className="text-[12.5px] text-faint">{loadError ? "No se pudieron cargar tus metas y materias." : "Cargando tus metas y materias…"}</p>
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
                        {g.name} <span className="text-[11px] text-faint">· {g.topics} {g.topics === 1 ? "tema" : "temas"}{g.topics ? ` · ${hoursText(g.minutes)}` : ""}</span>
                      </ChipToggle>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-faint">No tienes metas activas con temas enlazados.</p>
                )}
              </div>
              <div>
                <Label>Materias y áreas</Label>
                {options.areas.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Materias">
                    {options.areas.map((a) => (
                      <ChipToggle key={a.id} active={subjects.includes(a.id)} onClick={() => setSubjects((cur) => toggle(cur, a.id))} title={`${a.pending} temas pendientes de ${a.total}`}>
                        {a.name} <span className="text-[11px] text-faint">· {a.pending}/{a.total}</span>
                      </ChipToggle>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-faint">Aún no hay temas de estudio en tu vault.</p>
                )}
              </div>
              <label className="block">
                <span className="text-[12px] text-dim">Otro objetivo (opcional)</span>
                <input value={freeObjective} onChange={(e) => setFreeObjective(e.target.value)} placeholder="Ej.: cerrar el tema de límites" className={input} maxLength={300} />
              </label>
            </div>
          )}
        </Panel>
      </div>

      {scopeAreas.length > 0 && (
        <Panel title="Tu nivel en cada área (opcional)">
          <p className="mb-2 text-[12px] text-faint">Es solo una hipótesis para el reparto y la IA. «No sé» añade un diagnóstico corto al inicio.</p>
          <div className="space-y-2">
            {scopeAreas.map((area) => (
              <div key={area} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Nivel en ${area}`}>
                <span className="min-w-[7rem] text-[12.5px] font-medium">{area}</span>
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

      <Panel title="Opciones">
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={deliverables} onChange={(e) => setDeliverables(e.target.checked)} aria-label="Incluir entregables" />
          Incluir entregables (un proyecto de demostración por subplan)
        </label>
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
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
          <span>La IA los tiene en cuenta al elegir y ordenar los temas; no cambian el tiempo ni el periodo que fijaste arriba.</span>
          <span className="flex-1" />
          <span data-testid="plan-notes-count">
            {notes.length} / {MAX_NOTES_CHARS}
          </span>
        </div>
      </Panel>

      <div className="rounded-xl border border-line bg-surface p-3 text-[12.5px]" data-testid="plan-capacity" aria-live="polite">
        <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Cálculo en vivo</h3>
        {problem ? (
          <p className="text-warn">{problem}</p>
        ) : (
          <ul className="space-y-0.5 text-dim">
            <li>
              <span className="text-text">Capacidad total: {hoursText(cap.effectiveMinutes)}</span> · {cap.studyDays} días de estudio × {hoursText(pre.minutesPerDay)} × {Math.round(cap.factor * 100)} %
              {cap.blockedDays > 0 ? ` (${cap.blockedDays} bloqueados)` : ""} · {weeksLabel(cap.weeks)} · ~{num1(cap.hoursPerWeek)} h/semana
            </li>
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
        <PrimaryButton onClick={() => void submit()} disabled={generating || !!problem || nothingChosen}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generar plan
        </PrimaryButton>
        <GhostButton onClick={onClose}>Cancelar</GhostButton>
        <span className="text-[11.5px] text-faint">
          {options && !options.aiConfigured ? "La IA no está configurada: se generará un plan automático con lo que elegiste." : "No se escribe nada hasta que aceptes el borrador."}
        </span>
      </div>
    </section>
  );
}

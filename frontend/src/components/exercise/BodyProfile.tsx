// Perfil atlético y registro de peso corporal en Progreso > Cuerpo.
//
// Permite definir para qué estás entrenando (objetivo típico + nota)
// y llevar un historial limpio de pesajes en kg sin estorbar la rutina diaria.

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  HeartPulse,
  Plus,
  Scale,
  ShieldAlert,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { todayIso, shortDate } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import { useApp } from "../../store/app";
import { type ExerciseGoal } from "../../lib/types";
import { cn } from "../ui";
import { GhostButton, PrimaryButton } from "../common/forms";
import { LineChart } from "../common/charts";
import { ORANGE } from "./parts";

const GOAL_OPTIONS: Array<{
  id: ExerciseGoal;
  label: string;
  desc: string;
  icon: string;
}> = [
  {
    id: "hipertrofia",
    label: "Hipertrofia",
    desc: "Ganancia de masa muscular y desarrollo estético",
    icon: "💪",
  },
  {
    id: "fuerza",
    label: "Fuerza / Potencia",
    desc: "Aumentar cargas máximas (1RM) y rendimiento neuromuscular",
    icon: "🏋️",
  },
  {
    id: "definicion",
    label: "Definición / Pérdida de grasa",
    desc: "Reducción de porcentaje graso manteniendo masa magra",
    icon: "🔥",
  },
  {
    id: "resistencia",
    label: "Resistencia / Acondicionamiento",
    desc: "Capacidad cardiovascular, densidad y resistencia a la fatiga",
    icon: "⚡",
  },
  {
    id: "salud",
    label: "Salud general / Mantenimiento",
    desc: "Bienestar postural, longevidad y movilidad funcional",
    icon: "🌿",
  },
];

export function BodyProfile() {
  const toast = useApp((s) => s.toast);
  const profile = useExercise((s) => s.profile);
  const saveProfile = useExercise((s) => s.saveProfile);
  const addWeight = useExercise((s) => s.addWeight);
  const removeWeight = useExercise((s) => s.removeWeight);

  // Formulario de pesaje rápido
  const [weightInput, setWeightInput] = useState<string>("");
  const [dateInput, setDateInput] = useState<string>(() => todayIso());
  const [isSubmittingWeight, setIsSubmittingWeight] = useState(false);

  // Edición de nota de objetivo
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(profile?.goal_note ?? "");

  // Edición de limitaciones de salud
  const [editingLimitations, setEditingLimitations] = useState(false);
  const [limitationsText, setLimitationsText] = useState(profile?.health_limitations ?? "");
  const [savingLimitations, setSavingLimitations] = useState(false);

  // Datos biológicos: edad
  const [ageInput, setAgeInput] = useState<string>(() => (profile?.age ? String(profile.age) : ""));

  useEffect(() => {
    if (!editingLimitations) {
      setLimitationsText(profile?.health_limitations ?? "");
    }
  }, [profile?.health_limitations, editingLimitations]);

  useEffect(() => {
    setAgeInput(profile?.age ? String(profile.age) : "");
  }, [profile?.age]);

  const activeGoal = profile?.goal ?? "salud";
  const history = useMemo(() => {
    return [...(profile?.weight_history ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  }, [profile?.weight_history]);

  const latestRecord = history.length > 0 ? history[history.length - 1] : null;
  const previousRecord = history.length > 1 ? history[history.length - 2] : null;

  const diffWeight =
    latestRecord && previousRecord
      ? Math.round((latestRecord.weight - previousRecord.weight) * 10) / 10
      : null;

  const handleSelectGoal = async (goal: ExerciseGoal) => {
    try {
      await saveProfile({ goal });
      toast("info", "Objetivo actualizado");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const handleSaveNote = async () => {
    try {
      await saveProfile({ goal_note: noteText.trim() });
      setEditingNote(false);
      toast("info", "Nota de objetivo guardada");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const handleSaveLimitations = async () => {
    setSavingLimitations(true);
    try {
      await saveProfile({ health_limitations: limitationsText.trim() });
      setEditingLimitations(false);
      toast("info", "Condiciones de salud y limitaciones actualizadas");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSavingLimitations(false);
    }
  };

  const handleSelectGender = async (gender: "hombre" | "mujer") => {
    const next = profile?.gender === gender ? "" : gender;
    try {
      await saveProfile({ gender: next });
      toast("info", next ? `Sexo configurado: ${next}` : "Sexo restablecido");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const handleSaveAge = async () => {
    const clean = ageInput.trim();
    const val = clean === "" ? null : parseInt(clean, 10);
    if (val !== null && (Number.isNaN(val) || val <= 5 || val > 120)) {
      toast("error", "Ingresá una edad válida en años (ej. 25)");
      return;
    }
    try {
      await saveProfile({ age: val });
      toast("info", val ? `Edad guardada: ${val} años` : "Edad restablecida");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const handleClearLimitations = async () => {
    try {
      await saveProfile({ health_limitations: "" });
      setLimitationsText("");
      setEditingLimitations(false);
      toast("info", "Limitaciones eliminadas");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const handleAddWeight = async () => {
    const val = parseFloat(weightInput.replace(",", "."));
    if (Number.isNaN(val) || val <= 0 || val > 400) {
      toast("error", "Ingresá un peso válido en kg (ej. 75.5)");
      return;
    }
    const targetDate = dateInput || todayIso();
    setIsSubmittingWeight(true);
    try {
      await addWeight(targetDate, val);
      setWeightInput("");
      toast("info", `Peso registrado: ${val} kg`);
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setIsSubmittingWeight(false);
    }
  };

  const handleRemoveWeight = async (date: string) => {
    try {
      await removeWeight(date);
      toast("info", "Pesaje eliminado");
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6" data-body-profile>
      {/* 1. SECCIÓN OBJETIVO */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent">
            <Target size={16} />
          </div>
          <div>
            <h2 className="text-[14.5px] font-semibold text-text">Para qué estás entrenando</h2>
            <p className="text-[11.5px] text-faint">
              Tu enfoque define la pauta de series, repeticiones y descanso de tu programa.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {GOAL_OPTIONS.map((g) => {
            const isSelected = activeGoal === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => void handleSelectGoal(g.id)}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all",
                  isSelected
                    ? "border-accent bg-accent-soft/30 shadow-sm ring-1 ring-accent"
                    : "border-line bg-surface/50 hover:bg-hover hover:border-text/20",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[18px]">{g.icon}</span>
                  {isSelected && (
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-medium text-white">
                      <Check size={11} /> Activo
                    </span>
                  )}
                </div>
                <span className="mt-2 text-[13px] font-semibold text-text">{g.label}</span>
                <span className="mt-1 text-[11px] leading-relaxed text-dim">{g.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Nota libre de objetivo */}
        <div className="mt-4 border-t border-line/60 pt-3.5">
          {!editingNote ? (
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 text-dim">
                <span className="font-medium text-text">Meta específica:</span>
                <span>{profile?.goal_note || "Sin meta particular escrita (ej. llegar a 10 dominadas, 12% grasa)"}</span>
              </div>
              <GhostButton
                onClick={() => {
                  setNoteText(profile?.goal_note ?? "");
                  setEditingNote(true);
                }}
              >
                {profile?.goal_note ? "Editar meta" : "+ Agregar detalle"}
              </GhostButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Ej. Bajar a 74 kg manteniendo fuerza en press banca..."
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <PrimaryButton onClick={() => void handleSaveNote()}>Guardar</PrimaryButton>
              <GhostButton onClick={() => setEditingNote(false)}>Cancelar</GhostButton>
            </div>
          )}
        </div>
      </section>

      {/* 2. SECCIÓN PESO CORPORAL */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent">
              <Scale size={16} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-semibold text-text">Control de peso corporal</h2>
              <p className="text-[11.5px] text-faint">
                Registrá tus pesajes para seguir la tendencia de tu composición física.
              </p>
            </div>
          </div>

          {/* Tarjetas rápidas de estado */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-line bg-surface px-3.5 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wider text-faint">Peso actual</div>
              <div className="font-mono text-[16px] font-bold text-text">
                {latestRecord ? `${latestRecord.weight} kg` : "—"}
              </div>
            </div>

            {diffWeight !== null && (
              <div className="rounded-xl border border-line bg-surface px-3 py-1.5 text-right">
                <div className="text-[10px] uppercase tracking-wider text-faint">Variación</div>
                <div
                  className={cn(
                    "flex items-center justify-end gap-1 font-mono text-[13px] font-semibold",
                    diffWeight > 0 ? "text-danger" : diffWeight < 0 ? "text-mint" : "text-dim",
                  )}
                >
                  {diffWeight > 0 ? <TrendingUp size={13} /> : diffWeight < 0 ? <TrendingDown size={13} /> : null}
                  {diffWeight > 0 ? `+${diffWeight}` : `${diffWeight}`} kg
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fila de Datos Biológicos: Sexo y Edad */}
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-line/60 bg-surface/30 px-3.5 py-2">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium text-dim">Sexo:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleSelectGender("hombre")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  profile?.gender === "hombre"
                    ? "bg-accent text-white"
                    : "border border-line bg-surface text-dim hover:bg-hover hover:text-text",
                )}
              >
                ♂ Hombre
              </button>
              <button
                type="button"
                onClick={() => void handleSelectGender("mujer")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  profile?.gender === "mujer"
                    ? "bg-accent text-white"
                    : "border border-line bg-surface text-dim hover:bg-hover hover:text-text",
                )}
              >
                ♀ Mujer
              </button>
            </div>
          </div>

          <div className="hidden h-4 w-px bg-line/80 sm:block" />

          <div className="flex items-center gap-1.5 text-[12px]">
            <span className="font-medium text-dim">Edad:</span>
            <input
              type="number"
              min={10}
              max={120}
              placeholder="Ej. 25"
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              onBlur={() => void handleSaveAge()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSaveAge();
                }
              }}
              className="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-center font-mono text-[12px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <span className="text-[11.5px] text-faint">años</span>
          </div>

          {(profile?.gender || profile?.age) && (
            <span className="ml-auto hidden text-[11px] text-dim md:inline">
              🛡️ El Coach de IA adapta el gasto calórico y recuperación
            </span>
          )}
        </div>

        {/* Formulario rápido para anotar peso */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddWeight();
          }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-line/60 bg-surface/40 p-3"
        >
          <div className="flex items-center gap-2 text-[12px] text-dim">
            <Calendar size={14} className="text-faint" />
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej. 76.2"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddWeight();
                }
              }}
              className="w-24 rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-[12.5px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <span className="text-[12px] font-medium text-dim">kg</span>
          </div>

          <PrimaryButton
            type="submit"
            onClick={() => void handleAddWeight()}
            disabled={isSubmittingWeight || !weightInput.trim()}
          >
            <Plus size={13} /> Registrar pesaje
          </PrimaryButton>
        </form>

        {/* Gráfico y tabla de historial */}
        {history.length > 1 && (
          <div className="mt-5 border-t border-line/60 pt-4">
            <h3 className="mb-2 text-[12px] font-medium text-dim">Evolución de peso</h3>
            <div className="h-44 w-full">
              <LineChart
                labels={history.map((h) => shortDate(h.date))}
                series={[
                  {
                    name: "Peso corporal",
                    colour: ORANGE,
                    values: history.map((h) => h.weight),
                  },
                ]}
                format={(y) => `${y} kg`}
              />
            </div>
          </div>
        )}

        {/* Listado de pesajes */}
        <div className="mt-5 border-t border-line/60 pt-4">
          <h3 className="mb-2.5 text-[12px] font-medium text-dim">Historial ({history.length})</h3>
          {history.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-faint">
              Aún no tenés pesajes registrados. Ingresá tu peso arriba para comenzar el seguimiento.
            </p>
          ) : (
            <div className="max-h-56 divide-y divide-line/40 overflow-y-auto rounded-xl border border-line bg-surface/30">
              {[...history].reverse().map((h) => (
                <div key={h.date} className="flex items-center justify-between px-3.5 py-2 text-[12.5px]">
                  <div className="flex items-center gap-3">
                    <span className="text-dim">{shortDate(h.date)}</span>
                    <span className="font-mono text-[11px] text-faint">({h.date})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-semibold text-text">{h.weight} kg</span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveWeight(h.date)}
                      title="Eliminar pesaje"
                      className="rounded p-1 text-faint hover:bg-hover hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. SECCIÓN LIMITACIONES Y CONDICIONES DE SALUD */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-danger/10 text-danger">
              <HeartPulse size={16} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-semibold text-text">
                Condiciones de salud y limitaciones físicas
              </h2>
              <p className="text-[11.5px] text-faint">
                Lesiones, dolores articulares, enfermedades o contraindicaciones que el Coach de IA debe respetar.
              </p>
            </div>
          </div>
        </div>

        {!editingLimitations ? (
          <div className="rounded-xl border border-line bg-surface/50 p-4">
            {profile?.health_limitations?.trim() ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={16} className="mt-0.5 flex-none text-danger" />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-[12.5px] text-text leading-relaxed">
                      {profile.health_limitations.trim()}
                    </p>
                    <div className="mt-2 text-[11px] text-dim">
                      🛡️ El Coach de Entrenamiento adaptará automáticamente sus sugerencias para proteger estas zonas y evitar ejercicios lesivos.
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleClearLimitations()}
                    title="Eliminar limitaciones"
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] text-faint hover:bg-danger/10 hover:text-danger transition-colors"
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                  <GhostButton
                    onClick={() => {
                      setLimitationsText(profile?.health_limitations ?? "");
                      setEditingLimitations(true);
                    }}
                  >
                    Editar limitaciones
                  </GhostButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <p className="text-[12.5px] text-dim">
                  No tenés ninguna lesión, enfermedad o limitación física registrada.
                </p>
                <p className="mt-1 text-[11px] text-faint max-w-md">
                  Si tenés molestias en hombros, lumbalgia, asma o cualquier restricción, indicala acá para que el Coach de IA no te proponga ejercicios peligrosos.
                </p>
                <div className="mt-3">
                  <GhostButton
                    onClick={() => {
                      setLimitationsText("");
                      setEditingLimitations(true);
                    }}
                  >
                    + Agregar limitación o condición de salud
                  </GhostButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <textarea
              value={limitationsText}
              onChange={(e) => setLimitationsText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSaveLimitations();
                }
              }}
              placeholder="Ej. Molestia en manguito rotador derecho (evitar press trasnuca), hernia discal lumbar L5-S1 (evitar carga axial pesada), asma en cardio intenso..."
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-panel p-2.5 text-[12.5px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-faint">
                Enter para guardar · Shift+Enter para salto de línea · El Coach de IA lo leerá automáticamente.
              </span>
              <div className="flex items-center gap-2">
                <GhostButton onClick={() => setEditingLimitations(false)}>
                  Cancelar
                </GhostButton>
                <PrimaryButton onClick={() => void handleSaveLimitations()}>
                  {savingLimitations ? "Guardando…" : "Guardar condiciones"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

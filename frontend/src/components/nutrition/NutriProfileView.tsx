import { useState, useEffect } from "react";
import {
  Scale,
  Target,
  ShieldAlert,
  Sparkles,
  Check,
  User,
  AlertTriangle,
} from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { PrimaryButton, GhostButton, inputBase } from "../common/forms";
import type { NutriGoal } from "../../lib/nutritionTypes";

const GOAL_OPTIONS: Array<{
  id: NutriGoal;
  title: string;
  badge: string;
  desc: string;
  icon: string;
}> = [
  {
    id: "perdida_grasa",
    title: "Pérdida de peso / Grasa corporal",
    badge: "Déficit calórico",
    desc: "Consumir menos calorías de las que gastas, con alta saciedad, vegetales y volumen de alimentos.",
    icon: "🥗",
  },
  {
    id: "aumento_masa",
    title: "Aumento de peso / Masa corporal",
    badge: "Superávit calórico",
    desc: "Consumir un superávit energético controlado y suficiente proteína para subir de peso saludablemente.",
    icon: "🥑",
  },
  {
    id: "mantenimiento",
    title: "Mantenimiento y Estabilidad",
    badge: "Balance normocalórico",
    desc: "Mantener tu peso estable equilibrando exactamente la energía consumida con el gasto diario.",
    icon: "⚖️",
  },
  {
    id: "salud_general",
    title: "Alimentación Saludable y Bienestar",
    badge: "Densidad nutricional",
    desc: "Priorizar comida real, variedad de colores, fibra y micronutrientes para bienestar y longevidad.",
    icon: "🍎",
  },
  {
    id: "energia_vitalidad",
    title: "Energía y Vitalidad diaria",
    badge: "Rendimiento diario",
    desc: "Optimizar carbohidratos complejos, micronutrientes e hidratación constante para energía sostenida.",
    icon: "⚡",
  },
];

export function NutriProfileView() {
  const profile = useNutrition((s) => s.profile);
  const loadProfile = useNutrition((s) => s.loadProfile);
  const saveProfile = useNutrition((s) => s.saveProfile);
  const applySuggestedTargets = useNutrition((s) => s.applySuggestedTargets);

  const [weight, setWeight] = useState<number | "">("");
  const [goal, setGoal] = useState<NutriGoal>("salud_general");
  const [goalNote, setGoalNote] = useState("");
  const [hasRestrictions, setHasRestrictions] = useState(false);
  const [restrictionsComment, setRestrictionsComment] = useState("");
  const [gender, setGender] = useState<"hombre" | "mujer" | "">("");
  const [age, setAge] = useState<number | "">("");
  const [heightCm, setHeightCm] = useState<number | "">("");

  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile) {
      setWeight(profile.weight ?? "");
      setGoal(profile.goal || "salud_general");
      setGoalNote(profile.goal_note || "");
      const r = profile.dietary_restrictions || "Ninguno";
      const isEnabled = r.trim().toLowerCase() !== "ninguno" && r.trim().length > 0;
      setHasRestrictions(isEnabled);
      setRestrictionsComment(isEnabled ? r : "");
      setGender(profile.gender || "");
      setAge(profile.age ?? "");
      setHeightCm(profile.height_cm ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalRestrictions = hasRestrictions && restrictionsComment.trim()
        ? restrictionsComment.trim()
        : "Ninguno";

      await saveProfile({
        weight: weight === "" ? null : Number(weight),
        goal,
        goal_note: goalNote.trim(),
        dietary_restrictions: finalRestrictions,
        gender,
        age: age === "" ? null : Number(age),
        height_cm: heightCm === "" ? null : Number(heightCm),
      });
      setSavedStatus("Perfil guardado con éxito. La IA ya está actualizada.");
      setTimeout(() => setSavedStatus(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateTargets = async () => {
    await handleSave();
    const res = await applySuggestedTargets();
    if (res) {
      setSavedStatus(`Metas recalculadas para ${res.weight} kg con objetivo ${res.goal}.`);
      setTimeout(() => setSavedStatus(null), 4000);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto text-main" data-testid="nutri-profile-view">
      {/* Encabezado */}
      <div>
        <h2 className="text-lg font-bold text-main flex items-center gap-2">
          <User size={20} className="text-emerald-500" />
          <span>Perfil del Usuario y Preferencias</span>
        </h2>
        <p className="text-[12px] text-faint mt-1">
          Configura tu peso, objetivo y los alimentos que te hacen daño. El Asesor Nutricional IA leerá esta información con máxima prioridad para no recomendarte comidas perjudiciales.
        </p>
      </div>

      {savedStatus && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[12.5px] font-medium text-emerald-400">
          <Check size={16} />
          <span>{savedStatus}</span>
        </div>
      )}

      {/* 1. Peso y Biometría */}
      <div className="rounded-xl border border-line bg-card/60 p-4 space-y-3">
        <h3 className="text-[13px] font-semibold text-main flex items-center gap-2">
          <Scale size={16} className="text-cyan-400" />
          <span>Peso corporal y Biometría</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-dim">Peso actual (kg):</label>
            <input
              type="number"
              step="0.1"
              min="30"
              max="250"
              value={weight}
              onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ej: 78.5"
              className={`${inputBase} font-bold text-main`}
              data-testid="input-weight"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-dim">Altura (cm):</label>
            <input
              type="number"
              min="100"
              max="240"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ej: 178"
              className={`${inputBase} text-main`}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-dim">Edad (años):</label>
            <input
              type="number"
              min="10"
              max="100"
              value={age}
              onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ej: 27"
              className={`${inputBase} text-main`}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-dim">Sexo biológico:</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as "hombre" | "mujer" | "")}
              className={`${inputBase} text-main text-[12px]`}
            >
              <option value="">Seleccionar</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Objetivo Nutricional */}
      <div className="rounded-xl border border-line bg-card/60 p-4 space-y-3">
        <h3 className="text-[13px] font-semibold text-main flex items-center gap-2">
          <Target size={16} className="text-amber-400" />
          <span>Objetivo Nutricional</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {GOAL_OPTIONS.map((opt) => {
            const isSel = goal === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGoal(opt.id)}
                className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                  isSel
                    ? "border-accent bg-accent/10 shadow-xs"
                    : "border-line bg-card/40 hover:bg-elevated/40 text-dim"
                }`}
                data-testid={`goal-option-${opt.id}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-main text-[13px] flex items-center gap-1.5">
                    <span>{opt.icon}</span> {opt.title}
                  </span>
                  <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-elevated text-faint">
                    {opt.badge}
                  </span>
                </div>
                <p className="text-[11.5px] text-faint mt-1.5 leading-snug">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-dim">
            Detalles o metas personales del objetivo:
          </label>
          <input
            type="text"
            value={goalNote}
            onChange={(e) => setGoalNote(e.target.value)}
            placeholder="Ej: Quiero llegar a 75kg antes de diciembre manteniendo fuerza en sentadilla"
            className={`${inputBase} text-[12.5px]`}
            data-testid="input-goal-note"
          />
        </div>
      </div>

      {/* 3. Alimentos que hacen daño / Restricciones alimentarias */}
      <div
        className={`rounded-xl border p-4 space-y-3 transition-colors ${
          hasRestrictions ? "border-rose-500/40 bg-rose-500/5" : "border-line bg-card/60"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={18} className={hasRestrictions ? "text-rose-400" : "text-faint"} />
            <div>
              <h3 className="text-[13px] font-semibold text-main">
                Alimentos que te hacen daño o restricciones alimentarias
              </h3>
              <p className="text-[11px] text-faint">
                {hasRestrictions
                  ? "Opción habilitada: indica abajo los ingredientes que la IA debe excluir estrictamente."
                  : "Activa esta opción si tienes intolerancias, alergias o alimentos que debes evitar."}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none flex-none rounded-lg border border-line/80 bg-card/60 px-2.5 py-1.5 transition-colors hover:border-line-strong">
            <input
              type="checkbox"
              checked={hasRestrictions}
              onChange={(e) => {
                const enabled = e.target.checked;
                setHasRestrictions(enabled);
                if (!enabled) setRestrictionsComment("");
              }}
              className="h-4 w-4 rounded border-line accent-rose-500"
              data-testid="toggle-restrictions"
            />
            <span className="text-[12px] font-medium text-main">
              Tengo restricciones
            </span>
          </label>
        </div>

        {hasRestrictions && (
          <div className="pt-2 space-y-2.5 border-t border-line/40">
            <label className="block text-[11.5px] font-medium text-dim">
              Comentario detallado de alimentos o ingredientes a evitar:
            </label>
            <textarea
              value={restrictionsComment}
              onChange={(e) => setRestrictionsComment(e.target.value)}
              rows={3}
              placeholder="Ej: Soy intolerante a la lactosa, me cae mal la comida picante o muy frita, no puedo comer mariscos ni maní..."
              className={`${inputBase} text-[12.5px] resize-none border-rose-500/30 focus-within:border-rose-500`}
              data-testid="input-dietary-restrictions"
              autoFocus
            />

            <div className="flex items-start gap-2 rounded-lg bg-card/80 p-2.5 text-[11px] text-dim border border-line/60">
              <AlertTriangle size={15} className="text-amber-400 flex-none mt-0.5" />
              <span>
                <strong>Regla estricta para la IA:</strong> El Asesor Nutricional leerá este comentario y tiene prohibido recomendarte platos o ingredientes que contengan lo que describas aquí.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <GhostButton
          onClick={() => void handleRecalculateTargets()}
          className="flex items-center gap-1.5 text-accent text-[12.5px]"
          data-testid="recalculate-targets-btn"
        >
          <Sparkles size={14} /> Recalcular mis metas calóricas con estos datos
        </GhostButton>

        <PrimaryButton
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-6 py-2 text-[13px]"
          data-testid="save-profile-btn"
        >
          {saving ? "Guardando…" : "Guardar Perfil"}
        </PrimaryButton>
      </div>
    </div>
  );
}

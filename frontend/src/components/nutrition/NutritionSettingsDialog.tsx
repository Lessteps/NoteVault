import { useState, useEffect } from "react";
import { Sparkles, Droplets, Flame, Check, Clock } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { Modal, PrimaryButton, GhostButton, inputBase } from "../common/forms";
import { NUTRI_MEALS, type NutriMealType } from "../../lib/nutritionTypes";

export function NutritionSettingsDialog() {
  const settingsOpen = useNutrition((s) => s.settingsOpen);
  const setSettingsOpen = useNutrition((s) => s.setSettingsOpen);
  const targets = useNutrition((s) => s.targets);
  const saveTargets = useNutrition((s) => s.saveTargets);
  const applySuggestedTargets = useNutrition((s) => s.applySuggestedTargets);

  const [calories, setCalories] = useState<number>(2200);
  const [protein, setProtein] = useState<number>(150);
  const [carbs, setCarbs] = useState<number>(240);
  const [fat, setFat] = useState<number>(65);
  const [water, setWater] = useState<number>(2500);

  // Distribución por turnos
  const [mealDist, setMealDist] = useState<Record<NutriMealType, number>>({
    desayuno: 25,
    almuerzo: 35,
    merienda: 15,
    cena: 20,
    snacks: 5,
  });

  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    if (targets) {
      setCalories(targets.calories);
      setProtein(targets.protein_g);
      setCarbs(targets.carbs_g);
      setFat(targets.fat_g);
      setWater(targets.water_ml);
      if (targets.meal_distribution) {
        setMealDist({
          desayuno: targets.meal_distribution.desayuno ?? 25,
          almuerzo: targets.meal_distribution.almuerzo ?? 35,
          merienda: targets.meal_distribution.merienda ?? 15,
          cena: targets.meal_distribution.cena ?? 20,
          snacks: targets.meal_distribution.snacks ?? 5,
        });
      }
    }
  }, [targets, settingsOpen]);

  if (!settingsOpen) return null;

  const handleSyncWithExercise = async () => {
    const res = await applySuggestedTargets();
    if (res) {
      setSyncStatus(`Metas calculadas para ${res.weight} kg (${res.goal})`);
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  const totalPct = Object.values(mealDist).reduce((sum, n) => sum + n, 0);

  const handleSave = async () => {
    await saveTargets({
      calories: Math.max(0, calories),
      protein_g: Math.max(0, protein),
      carbs_g: Math.max(0, carbs),
      fat_g: Math.max(0, fat),
      water_ml: Math.max(0, water),
      meal_distribution: mealDist,
    });
    setSettingsOpen(false);
  };

  return (
    <Modal title="Metas Nutricionales y Timing por Turnos" onClose={() => setSettingsOpen(false)} width={540}>
      <div className="space-y-4 text-main" data-testid="nutrition-settings-dialog">
        <p className="text-[12px] text-faint">
          Establece tus objetivos diarios de energía, macronutrientes y cómo deseas repartir las calorías a lo largo del día.
        </p>

        {/* Botón de sincronización con Ejercicio */}
        <div className="rounded-xl border border-line bg-card/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-main">
              <Sparkles size={15} className="text-amber-400" />
              <span>Sugerencia según tu entrenamiento</span>
            </div>
            <GhostButton
              onClick={() => void handleSyncWithExercise()}
              className="flex items-center gap-1.5 text-[11.5px] text-accent font-medium hover:text-accent/80"
              data-testid="sync-exercise-btn"
            >
              Calcular ahora
            </GhostButton>
          </div>
          <p className="text-[11px] text-faint">
            Usa tu peso corporal, edad, sexo y objetivo (hipertrofia/definición/mantenimiento) del módulo de Ejercicio.
          </p>
          {syncStatus && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
              <Check size={12} /> {syncStatus}
            </div>
          )}
        </div>

        {/* Inputs de Metas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-dim">
              <span className="flex items-center gap-1">
                <Flame size={13} className="text-orange-400" /> Calorías diarias (kcal):
              </span>
            </label>
            <input
              type="number"
              min="500"
              max="10000"
              value={calories}
              onChange={(e) => setCalories(Number(e.target.value) || 0)}
              className={`${inputBase} font-bold text-main`}
              data-testid="input-calories-target"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-dim">
              <span className="flex items-center gap-1">
                <Droplets size={13} className="text-cyan-400" /> Agua diaria (ml):
              </span>
            </label>
            <input
              type="number"
              min="500"
              step="250"
              value={water}
              onChange={(e) => setWater(Number(e.target.value) || 0)}
              className={`${inputBase} text-cyan-400 font-semibold`}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-dim">Proteínas (g):</label>
            <input
              type="number"
              min="10"
              value={protein}
              onChange={(e) => setProtein(Number(e.target.value) || 0)}
              className={`${inputBase} text-indigo-400 font-semibold`}
              data-testid="input-protein-target"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-dim">Carbos (g):</label>
            <input
              type="number"
              min="10"
              value={carbs}
              onChange={(e) => setCarbs(Number(e.target.value) || 0)}
              className={`${inputBase} text-amber-400 font-semibold`}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-dim">Grasas (g):</label>
            <input
              type="number"
              min="10"
              value={fat}
              onChange={(e) => setFat(Number(e.target.value) || 0)}
              className={`${inputBase} text-rose-400 font-semibold`}
            />
          </div>
        </div>

        {/* Distribución por Turnos / Timing Nutricional */}
        <div className="rounded-xl border border-line bg-card/60 p-3.5 space-y-3" data-testid="meal-distribution-container">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-main">
              <Clock size={15} className="text-accent" />
              <span>Distribución por Turnos (Timing Nutricional)</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                totalPct === 100
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              Total: {totalPct}%
            </span>
          </div>

          <p className="text-[11px] text-faint">
            Ajusta el porcentaje de calorías asignado a cada comida del día.
          </p>

          <div className="grid grid-cols-5 gap-2 text-center">
            {NUTRI_MEALS.map((m) => {
              const pct = mealDist[m.id] ?? 0;
              const expectedKcal = Math.round((calories * pct) / 100);
              return (
                <div key={m.id} className="rounded-lg border border-line/60 bg-elevated/40 p-2">
                  <div className="text-[11px] font-medium text-main truncate" title={m.label}>
                    {m.label.split(" ")[0]}
                  </div>
                  <div className="flex items-center justify-center gap-0.5 my-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={pct}
                      onChange={(e) =>
                        setMealDist({
                          ...mealDist,
                          [m.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-12 rounded border border-line bg-card py-0.5 text-center text-[12px] font-bold text-main"
                      data-testid={`input-dist-${m.id}`}
                    />
                    <span className="text-[10.5px] text-faint">%</span>
                  </div>
                  <div className="text-[10px] text-accent font-medium">~{expectedKcal} kcal</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-2">
          <PrimaryButton onClick={handleSave} className="w-full justify-center" data-testid="save-targets-btn">
            Guardar metas y distribución
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

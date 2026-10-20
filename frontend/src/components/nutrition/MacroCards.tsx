import { Flame, Droplets, Plus, Minus } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { GhostButton } from "../common/forms";

export function MacroCards() {
  const summary = useNutrition((s) => s.summary);
  const targets = useNutrition((s) => s.targets);
  const setWater = useNutrition((s) => s.setWater);

  if (!summary || !targets) return null;

  const { totals } = summary;
  const calPercent = Math.min(100, Math.round((totals.calories / Math.max(1, targets.calories)) * 100));
  const protPercent = Math.min(100, Math.round((totals.protein / Math.max(1, targets.protein_g)) * 100));
  const carbsPercent = Math.min(100, Math.round((totals.carbs / Math.max(1, targets.carbs_g)) * 100));
  const fatPercent = Math.min(100, Math.round((totals.fat / Math.max(1, targets.fat_g)) * 100));
  const waterPercent = Math.min(100, Math.round((totals.water_ml / Math.max(1, targets.water_ml)) * 100));

  const calRemaining = targets.calories - totals.calories;

  // Distribución calórica real según macronutrientes (4 kcal/g P, 4 kcal/g C, 9 kcal/g G)
  const protKcal = Math.round(totals.protein * 4);
  const carbsKcal = Math.round(totals.carbs * 4);
  const fatKcal = Math.round(totals.fat * 9);
  const totalMacroKcal = protKcal + carbsKcal + fatKcal;

  const protRatio = totalMacroKcal > 0 ? Math.round((protKcal / totalMacroKcal) * 100) : 0;
  const carbsRatio = totalMacroKcal > 0 ? Math.round((carbsKcal / totalMacroKcal) * 100) : 0;
  const fatRatio = totalMacroKcal > 0 ? Math.max(0, 100 - protRatio - carbsRatio) : 0;

  const handleWaterDelta = (delta: number) => {
    const current = totals.water_ml || 0;
    const next = Math.max(0, current + delta);
    void setWater(next);
  };

  return (
    <div className="space-y-3" data-testid="macro-cards-container">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="macro-cards">
      {/* Calorías */}
      <div className="flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-dim">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-main">
            <Flame size={15} className="text-orange-400" />
            <span>Calorías</span>
          </div>
          <span className="text-[11px] text-faint">
            {calRemaining >= 0 ? `${calRemaining} restantes` : `${Math.abs(calRemaining)} de más`}
          </span>
        </div>
        <div className="my-2 flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-main">{totals.calories}</span>
          <span className="text-[12px] text-faint">/ {targets.calories} kcal</span>
        </div>
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
            <div
              className={`h-full transition-all duration-300 ${
                calRemaining < 0 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${calPercent}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-faint">{calPercent}%</div>
        </div>
      </div>

      {/* Proteínas */}
      <div className="flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-dim">
          <span className="text-[12px] font-medium text-main">🥩 Proteínas</span>
          <span className="text-[11px] text-faint">{totals.protein}g</span>
        </div>
        <div className="my-2 flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-main">{totals.protein}</span>
          <span className="text-[12px] text-faint">/ {targets.protein_g}g</span>
        </div>
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${protPercent}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-faint">{protPercent}%</div>
        </div>
      </div>

      {/* Carbohidratos */}
      <div className="flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-dim">
          <span className="text-[12px] font-medium text-main">🍚 Carbos</span>
          <span className="text-[11px] text-faint">{totals.carbs}g</span>
        </div>
        <div className="my-2 flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-main">{totals.carbs}</span>
          <span className="text-[12px] text-faint">/ {targets.carbs_g}g</span>
        </div>
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${carbsPercent}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-faint">{carbsPercent}%</div>
        </div>
      </div>

      {/* Grasas */}
      <div className="flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-dim">
          <span className="text-[12px] font-medium text-main">🥑 Grasas</span>
          <span className="text-[11px] text-faint">{totals.fat}g</span>
        </div>
        <div className="my-2 flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-main">{totals.fat}</span>
          <span className="text-[12px] text-faint">/ {targets.fat_g}g</span>
        </div>
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
            <div
              className="h-full bg-rose-400 transition-all duration-300"
              style={{ width: `${fatPercent}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-faint">{fatPercent}%</div>
        </div>
      </div>

      {/* Agua */}
      <div className="flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-dim">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-main">
            <Droplets size={15} className="text-cyan-400" />
            <span>Agua</span>
          </div>
          <span className="text-[11px] text-faint">
            {(totals.water_ml / 1000).toFixed(1)} / {(targets.water_ml / 1000).toFixed(1)} L
          </span>
        </div>
        <div className="my-1.5 flex items-center justify-between">
          <span className="text-2xl font-bold tracking-tight text-main">{totals.water_ml} <span className="text-[12px] font-normal text-faint">ml</span></span>
          <div className="flex items-center gap-1">
            <GhostButton
              title="Restar 250ml"
              onClick={() => handleWaterDelta(-250)}
              className="h-6 w-6 p-0 text-faint hover:text-main"
            >
              <Minus size={12} />
            </GhostButton>
            <GhostButton
              title="Sumar 250ml (1 vaso)"
              onClick={() => handleWaterDelta(250)}
              className="h-6 w-6 p-0 text-cyan-400 hover:text-cyan-300"
            >
              <Plus size={12} />
            </GhostButton>
          </div>
        </div>
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${waterPercent}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-faint">{waterPercent}%</div>
        </div>
      </div>
    </div>

    {/* Barra de distribución calórica */}
    <div className="rounded-xl border border-line bg-card/40 px-4 py-2.5 shadow-xs" data-testid="macro-ratio-bar">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <span className="font-medium text-dim">Distribución calórica (% kcal de macros):</span>
        {totalMacroKcal > 0 ? (
          <div className="flex items-center gap-3 font-medium">
            <span className="text-indigo-400">🥩 Proteínas: {protRatio}%</span>
            <span className="text-amber-400">🍚 Carbos: {carbsRatio}%</span>
            <span className="text-rose-400">🥑 Grasas: {fatRatio}%</span>
          </div>
        ) : (
          <span className="text-faint">Sin alimentos registrados hoy</span>
        )}
      </div>

      {totalMacroKcal > 0 && (
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-elevated/70">
          <div
            className="bg-indigo-500 transition-all duration-300"
            style={{ width: `${protRatio}%` }}
            title={`Proteínas: ${protRatio}% (${protKcal} kcal)`}
          />
          <div
            className="bg-amber-400 transition-all duration-300"
            style={{ width: `${carbsRatio}%` }}
            title={`Carbohidratos: ${carbsRatio}% (${carbsKcal} kcal)`}
          />
          <div
            className="bg-rose-400 transition-all duration-300"
            style={{ width: `${fatRatio}%` }}
            title={`Grasas: ${fatRatio}% (${fatKcal} kcal)`}
          />
        </div>
      )}
    </div>
  </div>
  );
}

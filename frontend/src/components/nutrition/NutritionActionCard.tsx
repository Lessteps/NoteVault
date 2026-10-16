// Tarjeta de acción interactiva del Asesor Nutricional IA.
//
// Permite al usuario confirmar y aplicar en el vault con un solo clic:
// - Registrar alimentos en un turno de comida (`add_meal_item`)
// - Actualizar el consumo de agua (`set_water`)
// - Guardar nuevos alimentos en la despensa (`add_food_to_pantry`)

import { useState } from "react";
import { Check, Droplets, Loader2, Plus, Utensils, X, BookOpen } from "lucide-react";
import type { NutritionAction } from "../../lib/nutritionCoachActions";
import { NUTRI_MEALS } from "../../lib/nutritionTypes";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useNutrition } from "../../store/nutrition";

export function NutritionActionCard({
  action,
  onApplied,
}: {
  action: NutritionAction;
  onApplied?: () => void;
}) {
  const toast = useApp((s) => s.toast);
  const selectedDate = useNutrition((s) => s.selectedDate);
  const loadDay = useNutrition((s) => s.loadDay);
  const loadFoods = useNutrition((s) => s.loadFoods);

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  const handleApply = async () => {
    if (applying || applied || discarded) return;
    setApplying(true);

    try {
      if (action.action === "add_meal_item") {
        await api.nutriItemAdd(selectedDate, action.meal, action.item);
        await loadDay(selectedDate);
        toast("info", `${action.item.name} añadido a ${action.meal}`);
      } else if (action.action === "set_water") {
        await api.nutriWaterSet(selectedDate, action.water_ml);
        await loadDay(selectedDate);
        toast("info", `Agua actualizada a ${action.water_ml} ml`);
      } else if (action.action === "add_food_to_pantry") {
        await api.nutriFoodSave(action.entry);
        await loadFoods();
        toast("info", `${action.entry.name} guardado en tu despensa`);
      }

      setApplied(true);
      onApplied?.();
    } catch (e) {
      toast("error", `No se pudo aplicar la acción: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  if (discarded) return null;

  if (applied) {
    return (
      <div
        className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-400"
        data-testid="nutrition-action-applied"
      >
        <Check size={15} />
        <span>
          {action.action === "add_meal_item" && `Registrado en ${action.meal}`}
          {action.action === "set_water" && `Agua actualizada (${action.water_ml} ml)`}
          {action.action === "add_food_to_pantry" && "Guardado en tu despensa"}
        </span>
      </div>
    );
  }

  // 1. Registrar alimento en comida
  if (action.action === "add_meal_item") {
    const mealMeta = NUTRI_MEALS.find((m) => m.id === action.meal);
    const mealLabel = mealMeta?.label || action.meal;
    const { item } = action;

    return (
      <div
        className="mt-2.5 overflow-hidden rounded-xl border border-emerald-500/40 bg-card/90 shadow-md transition-all text-main"
        data-testid="nutrition-action-card"
      >
        <div className="flex items-center justify-between border-b border-line/60 bg-emerald-500/10 px-3.5 py-2 text-[12px] font-medium text-emerald-400">
          <span className="flex items-center gap-1.5">
            <Utensils size={13} /> Propuesta para {mealLabel}
          </span>
          <button
            type="button"
            onClick={() => setDiscarded(true)}
            className="text-faint hover:text-dim"
            title="Descartar propuesta"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-main text-[13.5px]">{item.name}</div>
              <div className="text-[11.5px] text-faint">
                Porción: {item.amount || 1} {item.unit || "porción"}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[13px] font-bold text-main">{item.calories || 0} kcal</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1 text-[11.5px] border-t border-line/40">
            <span className="text-indigo-400 font-medium">🥩 {item.protein || 0}g P</span>
            <span className="text-amber-400 font-medium">🍚 {item.carbs || 0}g C</span>
            <span className="text-rose-400 font-medium">🥑 {item.fat || 0}g G</span>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/20 py-2 text-[12.5px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
              data-testid="apply-action-btn"
            >
              {applying ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <span>Registrar en {mealLabel}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Actualizar agua
  if (action.action === "set_water") {
    return (
      <div
        className="mt-2.5 overflow-hidden rounded-xl border border-cyan-500/40 bg-card/90 shadow-md transition-all text-main"
        data-testid="nutrition-action-card"
      >
        <div className="flex items-center justify-between border-b border-line/60 bg-cyan-500/10 px-3.5 py-2 text-[12px] font-medium text-cyan-400">
          <span className="flex items-center gap-1.5">
            <Droplets size={13} /> Actualización de hidratación
          </span>
          <button
            type="button"
            onClick={() => setDiscarded(true)}
            className="text-faint hover:text-dim"
            title="Descartar propuesta"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-dim">Consumo de agua para hoy:</span>
            <span className="text-base font-bold text-main">{action.water_ml} ml</span>
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-500/20 py-2 text-[12.5px] font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/30 disabled:opacity-50"
            data-testid="apply-action-btn"
          >
            {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span>Fijar agua en {action.water_ml} ml</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Guardar en despensa
  if (action.action === "add_food_to_pantry") {
    const { entry } = action;
    return (
      <div
        className="mt-2.5 overflow-hidden rounded-xl border border-purple-500/40 bg-card/90 shadow-md transition-all text-main"
        data-testid="nutrition-action-card"
      >
        <div className="flex items-center justify-between border-b border-line/60 bg-purple-500/10 px-3.5 py-2 text-[12px] font-medium text-purple-400">
          <span className="flex items-center gap-1.5">
            <BookOpen size={13} /> Guardar en Despensa
          </span>
          <button
            type="button"
            onClick={() => setDiscarded(true)}
            className="text-faint hover:text-dim"
            title="Descartar propuesta"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-main text-[13.5px]">{entry.name}</div>
              <div className="text-[11.5px] text-faint">
                Porción base: {entry.serving_size || 100} {entry.serving_unit || "g"}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[13px] font-bold text-main">{entry.calories || 0} kcal</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1 text-[11.5px] border-t border-line/40">
            <span className="text-indigo-400 font-medium">🥩 {entry.protein || 0}g P</span>
            <span className="text-amber-400 font-medium">🍚 {entry.carbs || 0}g C</span>
            <span className="text-rose-400 font-medium">🥑 {entry.fat || 0}g G</span>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-500/20 py-2 text-[12.5px] font-semibold text-purple-400 transition-colors hover:bg-purple-500/30 disabled:opacity-50"
              data-testid="apply-action-btn"
            >
              {applying ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <span>Guardar en Despensa</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

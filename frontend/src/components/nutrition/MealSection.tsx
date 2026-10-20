import { useState } from "react";
import { Coffee, Utensils, Cookie, Moon, Apple, Plus, Trash2, Edit3, RotateCcw } from "lucide-react";
import type { NutriMealType, NutriFoodItem } from "../../lib/nutritionTypes";
import { NUTRI_MEALS } from "../../lib/nutritionTypes";
import { useNutrition } from "../../store/nutrition";
import { useApp } from "../../store/app";
import { GhostButton, Modal, PrimaryButton, inputBase } from "../common/forms";

const ICONS: Record<NutriMealType, typeof Coffee> = {
  desayuno: Coffee,
  almuerzo: Utensils,
  merienda: Cookie,
  cena: Moon,
  snacks: Apple,
};

export function MealSection({ meal }: { meal: NutriMealType }) {
  const toast = useApp((s) => s.toast);
  const summary = useNutrition((s) => s.summary);
  const openAddMeal = useNutrition((s) => s.openAddMeal);
  const removeFoodFromMeal = useNutrition((s) => s.removeFoodFromMeal);
  const updateFoodInMeal = useNutrition((s) => s.updateFoodInMeal);
  const copyMealFromYesterday = useNutrition((s) => s.copyMealFromYesterday);
  const targets = useNutrition((s) => s.targets);

  const [editingItem, setEditingItem] = useState<NutriFoodItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState<number>(1);
  const [editUnit, setEditUnit] = useState("g");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);

  if (!summary) return null;

  const items = summary.log.meals[meal] || [];
  const mealTotals = summary.byMeal[meal] || { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 };
  const meta = NUTRI_MEALS.find((m) => m.id === meal);
  const Icon = ICONS[meal] || Utensils;

  // Meta asignada según timing nutricional
  const distPct = targets?.meal_distribution?.[meal];
  const targetKcalForMeal = (distPct !== undefined && targets?.calories)
    ? Math.round((targets.calories * distPct) / 100)
    : null;

  const handleDelete = (id: string) => {
    void removeFoodFromMeal(meal, id);
  };

  const handleCopyYesterday = async () => {
    try {
      const copied = await copyMealFromYesterday(meal);
      if (copied) {
        toast("info", `${meta?.label || meal} copiado del día de ayer`);
      } else {
        toast("info", `Ayer no registraste alimentos en ${meta?.label?.toLowerCase() || meal}`);
      }
    } catch (e) {
      toast("error", `Error al copiar: ${(e as Error).message}`);
    }
  };

  const handleStartEdit = (it: NutriFoodItem) => {
    setEditingItem(it);
    setEditName(it.name);
    setEditAmount(it.amount);
    setEditUnit(it.unit);
    setEditCalories(it.calories);
    setEditProtein(it.protein);
    setEditCarbs(it.carbs);
    setEditFat(it.fat);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editName.trim()) return;
    await updateFoodInMeal(meal, editingItem.id, {
      name: editName.trim(),
      amount: editAmount,
      unit: editUnit.trim() || "g",
      calories: Math.max(0, Math.round(editCalories)),
      protein: Math.max(0, editProtein),
      carbs: Math.max(0, editCarbs),
      fat: Math.max(0, editFat),
    });
    setEditingItem(null);
  };

  return (
    <div
      className="rounded-xl border border-line bg-card/50 p-4 shadow-sm transition-colors hover:border-line/80"
      data-testid={`meal-section-${meal}`}
    >
      {/* Header del Turno */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-elevated/80 text-accent">
            <Icon size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[13.5px] font-semibold text-main">{meta?.label || meal}</h3>
              {targetKcalForMeal !== null && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-elevated/80 text-faint border border-line/40">
                  Meta: ~{targetKcalForMeal} kcal ({distPct}%)
                </span>
              )}
            </div>
            <span className="text-[11px] text-faint">
              {mealTotals.calories} kcal · {mealTotals.protein}g P · {mealTotals.carbs}g C · {mealTotals.fat}g G
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <GhostButton
            onClick={handleCopyYesterday}
            className="flex items-center gap-1 text-[11.5px] text-faint hover:text-dim"
            title={`Copiar ${meta?.label?.toLowerCase() || meal} del día de ayer`}
            data-testid={`copy-yesterday-btn-${meal}`}
          >
            <RotateCcw size={12} /> Copiar de ayer
          </GhostButton>

          <GhostButton
            onClick={() => openAddMeal(meal)}
            className="flex items-center gap-1.5 text-[12px] text-accent hover:text-accent/80 font-medium"
            data-testid={`add-food-btn-${meal}`}
          >
            <Plus size={13} /> Añadir alimento
          </GhostButton>
        </div>
      </div>

      {/* Lista de alimentos */}
      <div className="mt-2.5 divide-y divide-line/40">
        {items.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-faint">
            Sin alimentos registrados en este turno
          </div>
        ) : (
          items.map((it: NutriFoodItem) => (
            <div
              key={it.id}
              className="group flex items-center justify-between py-2 text-[12.5px] transition-colors hover:bg-elevated/30 px-2 rounded-lg"
              data-testid={`food-item-${it.id}`}
            >
              <div className="flex flex-col">
                <span className="font-medium text-main">{it.name}</span>
                <span className="text-[11px] text-faint">
                  {it.amount} {it.unit}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[11.5px] text-dim">
                  <span className="font-medium text-main">{it.calories} kcal</span>
                  <span className="text-indigo-400/90">{it.protein}g P</span>
                  <span className="text-amber-400/90">{it.carbs}g C</span>
                  <span className="text-rose-400/90">{it.fat}g G</span>
                </div>

                <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <GhostButton
                    onClick={() => handleStartEdit(it)}
                    className="h-6 w-6 p-0 text-faint hover:text-main"
                    title="Editar alimento"
                    data-testid={`edit-food-btn-${it.id}`}
                  >
                    <Edit3 size={12} />
                  </GhostButton>
                  <GhostButton
                    onClick={() => handleDelete(it.id)}
                    className="h-6 w-6 p-0 text-faint hover:text-rose-400"
                    title="Eliminar alimento"
                    data-testid={`delete-food-btn-${it.id}`}
                  >
                    <Trash2 size={12} />
                  </GhostButton>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de edición de alimento consumido */}
      {editingItem && (
        <Modal
          title={`Editar alimento en ${meta?.label || meal}`}
          onClose={() => setEditingItem(null)}
          width={480}
        >
          <div className="space-y-3.5 text-main" data-testid={`edit-meal-modal-${editingItem.id}`}>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-dim">Nombre del alimento:</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={`${inputBase} text-[13px]`}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-dim">Cantidad:</label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
                  className={`${inputBase} text-[12.5px]`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Unidad:</label>
                <input
                  type="text"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className={`${inputBase} text-[12.5px]`}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-dim">Calorías:</label>
                <input
                  type="number"
                  min="0"
                  value={editCalories}
                  onChange={(e) => setEditCalories(Number(e.target.value) || 0)}
                  className={`${inputBase} text-[12.5px] font-bold text-main`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Proteínas (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editProtein}
                  onChange={(e) => setEditProtein(Number(e.target.value) || 0)}
                  className={`${inputBase} text-[12.5px] text-indigo-400`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Carbos (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editCarbs}
                  onChange={(e) => setEditCarbs(Number(e.target.value) || 0)}
                  className={`${inputBase} text-[12.5px] text-amber-400`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Grasas (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editFat}
                  onChange={(e) => setEditFat(Number(e.target.value) || 0)}
                  className={`${inputBase} text-[12.5px] text-rose-400`}
                />
              </div>
            </div>

            <div className="pt-2">
              <PrimaryButton onClick={handleSaveEdit} disabled={!editName.trim()} className="w-full justify-center">
                Guardar cambios
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

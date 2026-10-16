import { useState } from "react";
import { Plus, Search, Trash2, Edit3, Utensils } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { useApp } from "../../store/app";
import { GhostButton, PrimaryButton, Modal, inputBase } from "../common/forms";
import { openMenu } from "../ui";
import type { NutriFoodLibraryEntry } from "../../lib/nutritionTypes";
import { NUTRI_MEALS } from "../../lib/nutritionTypes";

const CATEGORIES = [
  "Todas",
  "Proteínas",
  "Carbohidratos",
  "Grasas",
  "Frutas y Verduras",
  "Lácteos",
  "Snacks",
];

export function FoodLibraryView() {
  const toast = useApp((s) => s.toast);
  const foods = useNutrition((s) => s.foods);
  const saveFoodToLibrary = useNutrition((s) => s.saveFoodToLibrary);
  const deleteFoodFromLibrary = useNutrition((s) => s.deleteFoodFromLibrary);
  const quickConsumeFood = useNutrition((s) => s.quickConsumeFood);

  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("Todas");
  const [isEditing, setIsEditing] = useState(false);

  // Formulario de creación/edición
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [servingSize, setServingSize] = useState<number>(100);
  const [servingUnit, setServingUnit] = useState("g");
  const [calories, setCalories] = useState<number>(0);
  const [protein, setProtein] = useState<number>(0);
  const [carbs, setCarbs] = useState<number>(0);
  const [fat, setFat] = useState<number>(0);
  const [category, setCategory] = useState("Proteínas");

  const openNew = () => {
    setEditId(undefined);
    setName("");
    setServingSize(100);
    setServingUnit("g");
    setCalories(100);
    setProtein(10);
    setCarbs(10);
    setFat(2);
    setCategory("Proteínas");
    setIsEditing(true);
  };

  const openEdit = (f: NutriFoodLibraryEntry) => {
    setEditId(f.id);
    setName(f.name);
    setServingSize(f.serving_size);
    setServingUnit(f.serving_unit);
    setCalories(f.calories);
    setProtein(f.protein);
    setCarbs(f.carbs);
    setFat(f.fat);
    setCategory(f.category || "Proteínas");
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await saveFoodToLibrary({
      id: editId,
      name: name.trim(),
      serving_size: servingSize,
      serving_unit: servingUnit.trim() || "g",
      calories,
      protein,
      carbs,
      fat,
      category,
    });
    setIsEditing(false);
  };

  const handleDelete = async (id: string) => {
    await deleteFoodFromLibrary(id);
  };

  const handleOpenQuickConsume = (e: React.MouseEvent, f: NutriFoodLibraryEntry) => {
    openMenu(e, [
      ...NUTRI_MEALS.map((m) => ({
        label: `Registrar en ${m.label}`,
        onSelect: () => {
          void (async () => {
            try {
              await quickConsumeFood(f, m.id, 1);
              toast("info", `${f.name} añadido a ${m.label}`);
            } catch (err) {
              toast("error", (err as Error).message);
            }
          })();
        },
      })),
    ]);
  };

  const filtered = foods.filter((f) => {
    const matchSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.category && f.category.toLowerCase().includes(search.toLowerCase()));
    const matchCat = selectedCat === "Todas" || f.category === selectedCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-4" data-testid="food-library-view">
      {/* Controles de búsqueda y filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 sm:max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-2.5 text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en tu despensa..."
              className={`${inputBase} pl-9 text-[13px]`}
            />
          </div>
        </div>

        <PrimaryButton onClick={openNew} className="flex items-center gap-1.5 text-[12.5px]" data-testid="new-food-btn">
          <Plus size={14} /> Nuevo alimento
        </PrimaryButton>
      </div>

      {/* Categorías chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCat(cat)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              selectedCat === cat
                ? "bg-accent text-white"
                : "border border-line bg-card/60 text-faint hover:text-dim"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid de alimentos de la despensa */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-[13px] text-faint">
            No se encontraron alimentos en la despensa con ese filtro.
          </div>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              className="group flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-xs transition-colors hover:border-line-strong"
              data-testid={`library-card-${f.id}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-main text-[13.5px] leading-snug">{f.name}</div>
                  <span className="rounded-full bg-elevated/80 px-2 py-0.5 text-[10px] font-medium text-faint">
                    {f.category || "General"}
                  </span>
                </div>
                <span className="text-[11px] text-faint">
                  Porción: {f.serving_size} {f.serving_unit}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line/40 pt-2.5">
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <span className="font-bold text-main">{f.calories} kcal</span>
                  <span className="text-indigo-400 font-medium">{f.protein}g P</span>
                  <span className="text-amber-400 font-medium">{f.carbs}g C</span>
                  <span className="text-rose-400 font-medium">{f.fat}g G</span>
                </div>

                <div className="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => handleOpenQuickConsume(e, f)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                    title={`Registrar 1 porción (${f.serving_size} ${f.serving_unit})`}
                    data-testid={`quick-consume-btn-${f.id}`}
                  >
                    <Utensils size={11} /> Consumir
                  </button>
                  <GhostButton
                    onClick={() => openEdit(f)}
                    className="h-6 w-6 p-0 text-faint hover:text-main"
                    title="Editar alimento"
                  >
                    <Edit3 size={12} />
                  </GhostButton>
                  <GhostButton
                    onClick={() => void handleDelete(f.id)}
                    className="h-6 w-6 p-0 text-faint hover:text-rose-400"
                    title="Eliminar alimento"
                  >
                    <Trash2 size={12} />
                  </GhostButton>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Creación / Edición */}
      {isEditing && (
        <Modal
          title={editId ? "Editar alimento de la despensa" : "Nuevo alimento para tu despensa"}
          onClose={() => setIsEditing(false)}
          width={520}
        >
          <div className="space-y-3.5 text-main">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-dim">Nombre del alimento:</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Pechuga de pavo"
                className={`${inputBase} text-[13px]`}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-dim">Tamaño de porción base:</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={servingSize}
                  onChange={(e) => setServingSize(Math.max(1, Number(e.target.value) || 0))}
                  className={`${inputBase} text-[12.5px]`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Unidad de medida:</label>
                <input
                  type="text"
                  value={servingUnit}
                  onChange={(e) => setServingUnit(e.target.value)}
                  placeholder="ej: g, ml, unidad"
                  className={`${inputBase} text-[12.5px]`}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-dim">Categoría:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`${inputBase} text-[12.5px]`}
              >
                {CATEGORIES.filter((c) => c !== "Todas").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-dim">Calorías:</label>
                <input
                  type="number"
                  min="0"
                  value={calories}
                  onChange={(e) => setCalories(Math.max(0, Number(e.target.value) || 0))}
                  className={`${inputBase} text-[12.5px] font-bold text-main`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Proteínas (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={protein}
                  onChange={(e) => setProtein(Math.max(0, Number(e.target.value) || 0))}
                  className={`${inputBase} text-[12.5px] text-indigo-400`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Carbos (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={carbs}
                  onChange={(e) => setCarbs(Math.max(0, Number(e.target.value) || 0))}
                  className={`${inputBase} text-[12.5px] text-amber-400`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Grasas (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={fat}
                  onChange={(e) => setFat(Math.max(0, Number(e.target.value) || 0))}
                  className={`${inputBase} text-[12.5px] text-rose-400`}
                />
              </div>
            </div>

            <div className="pt-2">
              <PrimaryButton onClick={handleSave} disabled={!name.trim()} className="w-full justify-center">
                {editId ? "Guardar cambios" : "Añadir a mi despensa"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

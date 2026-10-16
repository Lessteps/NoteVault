import { useState } from "react";
import { Plus, Search, Trash2, Edit3, Utensils, BookOpen, ChefHat } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { useApp } from "../../store/app";
import { GhostButton, PrimaryButton, Modal, inputBase } from "../common/forms";
import { openMenu } from "../ui";
import { RecipeModal } from "./RecipeModal";
import type { NutriFoodLibraryEntry, NutriRecipe } from "../../lib/nutritionTypes";
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
  const recipes = useNutrition((s) => s.recipes);
  const saveFoodToLibrary = useNutrition((s) => s.saveFoodToLibrary);
  const deleteFoodFromLibrary = useNutrition((s) => s.deleteFoodFromLibrary);
  const deleteRecipe = useNutrition((s) => s.deleteRecipe);
  const quickConsumeFood = useNutrition((s) => s.quickConsumeFood);
  const quickConsumeRecipe = useNutrition((s) => s.quickConsumeRecipe);
  const setRecipeModalOpen = useNutrition((s) => s.setRecipeModalOpen);
  const setEditingRecipe = useNutrition((s) => s.setEditingRecipe);

  const [subTab, setSubTab] = useState<"foods" | "recipes">("foods");
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("Todas");
  const [isEditing, setIsEditing] = useState(false);

  // Formulario de creación/edición de alimento
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

  const handleOpenQuickConsumeRecipe = (e: React.MouseEvent, r: NutriRecipe) => {
    openMenu(e, [
      ...NUTRI_MEALS.map((m) => ({
        label: `1 ración en ${m.label} (${r.per_serving.calories} kcal)`,
        onSelect: () => {
          void (async () => {
            try {
              await quickConsumeRecipe(r.id, m.id, 1);
              toast("info", `1 ración de ${r.name} añadida a ${m.label}`);
            } catch (err) {
              toast("error", (err as Error).message);
            }
          })();
        },
      })),
      ...NUTRI_MEALS.map((m) => ({
        label: `0.5 ración en ${m.label} (${Math.round(r.per_serving.calories * 0.5)} kcal)`,
        onSelect: () => {
          void (async () => {
            try {
              await quickConsumeRecipe(r.id, m.id, 0.5);
              toast("info", `Media ración de ${r.name} añadida a ${m.label}`);
            } catch (err) {
              toast("error", (err as Error).message);
            }
          })();
        },
      })),
    ]);
  };

  const filteredFoods = foods.filter((f) => {
    const matchSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.category && f.category.toLowerCase().includes(search.toLowerCase()));
    const matchCat = selectedCat === "Todas" || f.category === selectedCat;
    return matchSearch && matchCat;
  });

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(search.toLowerCase())) ||
    r.ingredients.some((ing) => ing.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4" data-testid="food-library-view">
      {/* Selector superior entre Alimentos Individuales y Recetas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex rounded-lg border border-line bg-elevated/40 p-0.5 text-[12.5px]">
          <button
            type="button"
            onClick={() => setSubTab("foods")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors ${
              subTab === "foods" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
            }`}
            data-testid="subtab-foods"
          >
            <BookOpen size={14} /> Alimentos ({foods.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("recipes")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors ${
              subTab === "recipes" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
            }`}
            data-testid="subtab-recipes"
          >
            <ChefHat size={14} /> Recetas / Platos ({recipes.length})
          </button>
        </div>

        {subTab === "foods" ? (
          <PrimaryButton onClick={openNew} className="flex items-center gap-1.5 text-[12.5px]" data-testid="new-food-btn">
            <Plus size={14} /> Nuevo alimento
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => {
              setEditingRecipe(null);
              setRecipeModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-[12.5px]"
            data-testid="new-recipe-btn"
          >
            <Plus size={14} /> Nueva receta
          </PrimaryButton>
        )}
      </div>

      {/* Controles de búsqueda y filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 sm:max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-2.5 text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={subTab === "foods" ? "Buscar en tu despensa..." : "Buscar recetas o ingredientes..."}
              className={`${inputBase} pl-9 text-[13px]`}
            />
          </div>
        </div>

        {subTab === "foods" && (
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
        )}
      </div>

      {/* Vista de Alimentos Individuales */}
      {subTab === "foods" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFoods.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[13px] text-faint">
              No se encontraron alimentos en la despensa con ese filtro.
            </div>
          ) : (
            filteredFoods.map((f) => (
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
      )}

      {/* Vista de Recetas y Platos Compuestos */}
      {subTab === "recipes" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="recipes-grid">
          {filteredRecipes.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[13px] text-faint">
              No tienes recetas creadas todavía. Crea una con el botón «Nueva receta» combinando tus ingredientes de la despensa.
            </div>
          ) : (
            filteredRecipes.map((r) => (
              <div
                key={r.id}
                className="group flex flex-col justify-between rounded-xl border border-line bg-card/60 p-3.5 shadow-xs transition-colors hover:border-line-strong"
                data-testid={`recipe-card-${r.id}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-main text-[14px] leading-snug">{r.name}</div>
                    <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[10.5px] font-semibold">
                      {r.servings} {r.servings === 1 ? "ración" : "raciones"}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-[11.5px] text-dim line-clamp-2 mt-1">
                      {r.description}
                    </p>
                  )}
                  <div className="mt-2 text-[11px] text-faint">
                    <strong>{r.ingredients.length} ingredientes:</strong>{" "}
                    {r.ingredients.map((ing) => ing.name).join(", ")}
                  </div>
                </div>

                <div className="mt-3.5 border-t border-line/40 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[11px] text-faint">Por ración:</span>
                    <span className="font-bold text-main">
                      {r.per_serving.calories} kcal · {r.per_serving.protein}g P
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10.5px] text-faint">
                      Total prep: {r.total_calories} kcal
                    </span>

                    <div className="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => handleOpenQuickConsumeRecipe(e, r)}
                        className="flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                        title="Registrar en un turno de hoy"
                        data-testid={`quick-consume-recipe-btn-${r.id}`}
                      >
                        <Utensils size={11} /> Consumir
                      </button>
                      <GhostButton
                        onClick={() => {
                          setEditingRecipe(r);
                          setRecipeModalOpen(true);
                        }}
                        className="h-6 w-6 p-0 text-faint hover:text-main"
                        title="Editar receta"
                      >
                        <Edit3 size={12} />
                      </GhostButton>
                      <GhostButton
                        onClick={() => void deleteRecipe(r.id)}
                        className="h-6 w-6 p-0 text-faint hover:text-rose-400"
                        title="Eliminar receta"
                      >
                        <Trash2 size={12} />
                      </GhostButton>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal de Recetas */}
      <RecipeModal />

      {/* Modal de Creación / Edición de Alimento Individual */}
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

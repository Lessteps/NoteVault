import { useState, useEffect } from "react";
import { Plus, Trash2, Search, Utensils } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { Modal, PrimaryButton, GhostButton, inputBase } from "../common/forms";
import type { NutriRecipeIngredient } from "../../lib/nutritionTypes";

export function RecipeModal() {
  const recipeModalOpen = useNutrition((s) => s.recipeModalOpen);
  const editingRecipe = useNutrition((s) => s.editingRecipe);
  const setRecipeModalOpen = useNutrition((s) => s.setRecipeModalOpen);
  const setEditingRecipe = useNutrition((s) => s.setEditingRecipe);
  const foods = useNutrition((s) => s.foods);
  const loadFoods = useNutrition((s) => s.loadFoods);
  const saveRecipe = useNutrition((s) => s.saveRecipe);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState<number>(1);
  const [ingredients, setIngredients] = useState<NutriRecipeIngredient[]>([]);

  // Estado para selector de ingrediente desde despensa
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [ingAmount, setIngAmount] = useState<number>(100);

  useEffect(() => {
    if (recipeModalOpen) {
      void loadFoods();
      if (editingRecipe) {
        setName(editingRecipe.name);
        setDescription(editingRecipe.description || "");
        setServings(editingRecipe.servings || 1);
        setIngredients(editingRecipe.ingredients || []);
      } else {
        setName("");
        setDescription("");
        setServings(1);
        setIngredients([]);
      }
      setIsAddingIngredient(false);
      setFoodSearch("");
      setSelectedFoodId("");
      setIngAmount(100);
    }
  }, [recipeModalOpen, editingRecipe, loadFoods]);

  if (!recipeModalOpen) return null;

  const handleClose = () => {
    setRecipeModalOpen(false);
    setEditingRecipe(null);
  };

  const selectedFood = foods.find((f) => f.id === selectedFoodId);

  const handleAddIngredient = () => {
    if (!selectedFood) return;
    const ratio = ingAmount / Math.max(1, selectedFood.serving_size);
    const newIng: NutriRecipeIngredient = {
      food_id: selectedFood.id,
      name: selectedFood.name,
      amount: ingAmount,
      unit: selectedFood.serving_unit,
      calories: Math.round(selectedFood.calories * ratio),
      protein: Number((selectedFood.protein * ratio).toFixed(1)),
      carbs: Number((selectedFood.carbs * ratio).toFixed(1)),
      fat: Number((selectedFood.fat * ratio).toFixed(1)),
    };
    setIngredients([...ingredients, newIng]);
    setIsAddingIngredient(false);
    setSelectedFoodId("");
    setFoodSearch("");
    setIngAmount(100);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  // Cálculo en vivo de totales
  const totalCal = ingredients.reduce((sum, i) => sum + i.calories, 0);
  const totalProt = Number(ingredients.reduce((sum, i) => sum + i.protein, 0).toFixed(1));
  const totalCarbs = Number(ingredients.reduce((sum, i) => sum + i.carbs, 0).toFixed(1));
  const totalFat = Number(ingredients.reduce((sum, i) => sum + i.fat, 0).toFixed(1));

  const validServings = Math.max(0.1, servings || 1);
  const perCal = Math.round(totalCal / validServings);
  const perProt = Number((totalProt / validServings).toFixed(1));
  const perCarbs = Number((totalCarbs / validServings).toFixed(1));
  const perFat = Number((totalFat / validServings).toFixed(1));

  const handleSave = async () => {
    if (!name.trim()) return;
    await saveRecipe({
      id: editingRecipe?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      servings: validServings,
      ingredients,
    });
    handleClose();
  };

  const filteredFoods = foods.filter((f) =>
    f.name.toLowerCase().includes(foodSearch.toLowerCase()) ||
    (f.category && f.category.toLowerCase().includes(foodSearch.toLowerCase()))
  );

  return (
    <Modal
      title={editingRecipe ? "Editar Receta / Plato Compuesto" : "Nueva Receta o Plato Compuesto"}
      onClose={handleClose}
      width={640}
    >
      <div className="space-y-4 text-main" data-testid="recipe-modal">
        {/* Cabecera del plato */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11.5px] font-medium text-dim">Nombre del plato o receta:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Ensalada completa de pollo y arroz"
              className={`${inputBase} text-[13px] font-medium`}
              data-testid="input-recipe-name"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-dim">Raciones que rinde:</label>
            <input
              type="number"
              step="any"
              min="0.5"
              value={servings}
              onChange={(e) => setServings(Math.max(0.1, Number(e.target.value) || 1))}
              className={`${inputBase} text-[13px] font-bold text-main`}
              data-testid="input-recipe-servings"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-dim">Descripción o instrucciones (opcional):</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Saltear la pechuga y mezclar todo frío con aceite"
            className={`${inputBase} text-[12px]`}
            data-testid="input-recipe-desc"
          />
        </div>

        {/* Sección de Ingredientes */}
        <div className="space-y-2 border-t border-line/60 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-main flex items-center gap-1.5">
              <Utensils size={14} className="text-accent" />
              <span>Ingredientes ({ingredients.length})</span>
            </span>
            {!isAddingIngredient && (
              <GhostButton
                onClick={() => setIsAddingIngredient(true)}
                className="flex items-center gap-1 text-[11.5px] text-accent font-medium"
                data-testid="add-ingredient-btn"
              >
                <Plus size={12} /> Agregar ingrediente
              </GhostButton>
            )}
          </div>

          {/* Selector de nuevo ingrediente */}
          {isAddingIngredient && (
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 space-y-3" data-testid="add-ingredient-panel">
              <div className="flex items-center justify-between text-[12px] font-medium text-main">
                <span>Seleccionar de la Despensa:</span>
                <button
                  type="button"
                  onClick={() => setIsAddingIngredient(false)}
                  className="text-faint hover:text-dim text-[11px]"
                >
                  Cancelar
                </button>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-faint" />
                <input
                  type="text"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder="Buscar alimento en despensa..."
                  className={`${inputBase} pl-8 py-1 text-[12px]`}
                  autoFocus
                />
              </div>

              <div className="max-h-36 overflow-y-auto divide-y divide-line/40 rounded-lg border border-line bg-card/60 p-1">
                {filteredFoods.length === 0 ? (
                  <div className="py-3 text-center text-[11.5px] text-faint">
                    No se encontraron alimentos en la despensa
                  </div>
                ) : (
                  filteredFoods.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedFoodId(f.id);
                        setIngAmount(f.serving_size);
                      }}
                      className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] rounded-md transition-colors ${
                        selectedFoodId === f.id
                          ? "bg-accent/20 text-main font-semibold"
                          : "hover:bg-elevated/40 text-dim"
                      }`}
                      data-testid={`select-food-${f.id}`}
                    >
                      <span>{f.name}</span>
                      <span className="text-[10.5px] text-faint">{f.calories} kcal / {f.serving_size} {f.serving_unit}</span>
                    </button>
                  ))
                )}
              </div>

              {selectedFood && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line/40">
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-dim">Cantidad:</span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={ingAmount}
                      onChange={(e) => setIngAmount(Math.max(1, Number(e.target.value) || 0))}
                      className={`${inputBase} w-20 py-0.5 text-center font-bold text-main`}
                      data-testid="input-ingredient-amount"
                    />
                    <span className="text-faint">{selectedFood.serving_unit}</span>
                  </div>

                  <PrimaryButton onClick={handleAddIngredient} className="text-[11.5px] py-1 px-3" data-testid="confirm-add-ingredient-btn">
                    Confirmar ingrediente
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}

          {/* Lista de ingredientes agregados */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {ingredients.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-faint border border-dashed border-line rounded-lg">
                Agrega los ingredientes que componen esta receta desde tu despensa.
              </div>
            ) : (
              ingredients.map((ing, idx) => (
                <div
                  key={`${ing.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-line bg-card/60 px-3 py-1.5 text-[12px]"
                  data-testid={`recipe-ingredient-row-${idx}`}
                >
                  <div>
                    <span className="font-medium text-main">{ing.name}</span>
                    <span className="text-[11px] text-faint ml-2">
                      ({ing.amount} {ing.unit})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-main">{ing.calories} kcal</span>
                    <span className="text-faint text-[10.5px] hidden sm:inline">
                      {ing.protein}g P · {ing.carbs}g C · {ing.fat}g G
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      className="text-faint hover:text-rose-400 p-0.5"
                      title="Eliminar ingrediente"
                      data-testid={`remove-ingredient-btn-${idx}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Resumen de Macros y Ración */}
        <div className="rounded-xl border border-line bg-elevated/40 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] text-dim">
            <span>Preparación total:</span>
            <span className="font-bold text-main">
              {totalCal} kcal · {totalProt}g P · {totalCarbs}g C · {totalFat}g G
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-line/40 pt-2 text-[12.5px]">
            <span className="font-semibold text-accent">Por 1 ración ({validServings} total):</span>
            <span className="font-bold text-main">
              {perCal} kcal · {perProt}g P · {perCarbs}g C · {perFat}g G
            </span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <GhostButton onClick={handleClose} className="text-[12.5px]">
            Cancelar
          </GhostButton>
          <PrimaryButton
            onClick={handleSave}
            disabled={!name.trim() || ingredients.length === 0}
            className="text-[12.5px] px-5"
            data-testid="save-recipe-btn"
          >
            {editingRecipe ? "Guardar receta" : "Crear receta"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

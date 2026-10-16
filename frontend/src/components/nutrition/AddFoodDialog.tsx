import { useState, useEffect } from "react";
import { Search, Sparkles, BookOpen, ChefHat, Wand2, Loader2, Check } from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { Modal, PrimaryButton, inputBase } from "../common/forms";
import type { NutriFoodLibraryEntry, NutriRecipe, EstimatedDishResult } from "../../lib/nutritionTypes";
import { NUTRI_MEALS } from "../../lib/nutritionTypes";

export function AddFoodDialog() {
  const addingMeal = useNutrition((s) => s.addingMeal);
  const closeAddMeal = useNutrition((s) => s.closeAddMeal);
  const foods = useNutrition((s) => s.foods);
  const recipes = useNutrition((s) => s.recipes);
  const loadFoods = useNutrition((s) => s.loadFoods);
  const loadRecipes = useNutrition((s) => s.loadRecipes);
  const addFoodToMeal = useNutrition((s) => s.addFoodToMeal);
  const saveFoodToLibrary = useNutrition((s) => s.saveFoodToLibrary);
  const quickConsumeRecipe = useNutrition((s) => s.quickConsumeRecipe);
  const estimateDish = useNutrition((s) => s.estimateDish);

  const [tab, setTab] = useState<"pantry" | "recipes" | "ai" | "manual">("pantry");
  const [search, setSearch] = useState("");
  const [selectedFood, setSelectedFood] = useState<NutriFoodLibraryEntry | null>(null);
  const [amount, setAmount] = useState<number>(100);

  // Selector de Receta
  const [selectedRecipe, setSelectedRecipe] = useState<NutriRecipe | null>(null);
  const [recipeServings, setRecipeServings] = useState<number>(1);

  // Estimador IA
  const [aiPrompt, setAiPrompt] = useState("");
  const [isEstimating, setIsEstimating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [estimatedResult, setEstimatedResult] = useState<EstimatedDishResult | null>(null);

  // Manual inputs
  const [manualName, setManualName] = useState("");
  const [manualAmount, setManualAmount] = useState(1);
  const [manualUnit, setManualUnit] = useState("porción");
  const [manualCalories, setManualCalories] = useState<number | "">("");
  const [manualProtein, setManualProtein] = useState<number | "">("");
  const [manualCarbs, setManualCarbs] = useState<number | "">("");
  const [manualFat, setManualFat] = useState<number | "">("");
  const [saveToPantry, setSaveToPantry] = useState(false);

  useEffect(() => {
    if (addingMeal) {
      void loadFoods();
      void loadRecipes();
      setSearch("");
      setSelectedFood(null);
      setSelectedRecipe(null);
      setRecipeServings(1);
      setAiPrompt("");
      setIsEstimating(false);
      setAiError(null);
      setEstimatedResult(null);
      setManualName("");
      setManualCalories("");
      setManualProtein("");
      setManualCarbs("");
      setManualFat("");
      setSaveToPantry(false);
    }
  }, [addingMeal, loadFoods, loadRecipes]);

  useEffect(() => {
    if (selectedFood) {
      setAmount(selectedFood.serving_size || 100);
    }
  }, [selectedFood]);

  if (!addingMeal) return null;

  const mealMeta = NUTRI_MEALS.find((m) => m.id === addingMeal);
  const mealTitle = mealMeta?.label || addingMeal;

  const filteredFoods = foods.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.category && f.category.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(search.toLowerCase()))
  );

  // Cálculo escalado de macros para alimento seleccionado
  const ratio = selectedFood ? amount / Math.max(1, selectedFood.serving_size) : 1;
  const scaledCalories = selectedFood ? Math.round(selectedFood.calories * ratio) : 0;
  const scaledProtein = selectedFood ? Number((selectedFood.protein * ratio).toFixed(1)) : 0;
  const scaledCarbs = selectedFood ? Number((selectedFood.carbs * ratio).toFixed(1)) : 0;
  const scaledFat = selectedFood ? Number((selectedFood.fat * ratio).toFixed(1)) : 0;

  // Cálculo de receta según raciones
  const recRatio = Math.max(0.1, recipeServings || 1);
  const recCalories = selectedRecipe ? Math.round(selectedRecipe.per_serving.calories * recRatio) : 0;
  const recProtein = selectedRecipe ? Number((selectedRecipe.per_serving.protein * recRatio).toFixed(1)) : 0;
  const recCarbs = selectedRecipe ? Number((selectedRecipe.per_serving.carbs * recRatio).toFixed(1)) : 0;
  const recFat = selectedRecipe ? Number((selectedRecipe.per_serving.fat * recRatio).toFixed(1)) : 0;

  const handleAddFromPantry = async () => {
    if (!selectedFood) return;
    await addFoodToMeal(addingMeal, {
      name: selectedFood.name,
      amount,
      unit: selectedFood.serving_unit,
      calories: scaledCalories,
      protein: scaledProtein,
      carbs: scaledCarbs,
      fat: scaledFat,
      food_id: selectedFood.id,
    });
    closeAddMeal();
  };

  const handleAddRecipe = async () => {
    if (!selectedRecipe) return;
    await quickConsumeRecipe(selectedRecipe.id, addingMeal, recRatio);
    closeAddMeal();
  };

  const handleRunAiEstimate = async () => {
    if (!aiPrompt.trim()) return;
    setIsEstimating(true);
    setAiError(null);
    try {
      const res = await estimateDish(aiPrompt.trim());
      setEstimatedResult(res);
      // Prellenar inputs manuales por si el usuario desea editarlos
      setManualName(res.dish_name);
      setManualCalories(res.total_calories);
      setManualProtein(res.total_protein);
      setManualCarbs(res.total_carbs);
      setManualFat(res.total_fat);
      setManualAmount(1);
      setManualUnit("plato");
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleAddEstimatedDish = async () => {
    if (!manualName.trim()) return;
    const cal = Math.max(0, Number(manualCalories) || 0);
    const p = Math.max(0, Number(manualProtein) || 0);
    const c = Math.max(0, Number(manualCarbs) || 0);
    const f = Math.max(0, Number(manualFat) || 0);

    await addFoodToMeal(addingMeal, {
      name: manualName.trim(),
      amount: manualAmount,
      unit: manualUnit.trim() || "plato",
      calories: cal,
      protein: p,
      carbs: c,
      fat: f,
    });

    if (saveToPantry) {
      await saveFoodToLibrary({
        name: manualName.trim(),
        serving_size: manualAmount,
        serving_unit: manualUnit.trim() || "plato",
        calories: cal,
        protein: p,
        carbs: c,
        fat: f,
      });
    }

    closeAddMeal();
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) return;
    const cal = Math.max(0, Number(manualCalories) || 0);
    const p = Math.max(0, Number(manualProtein) || 0);
    const c = Math.max(0, Number(manualCarbs) || 0);
    const f = Math.max(0, Number(manualFat) || 0);

    await addFoodToMeal(addingMeal, {
      name: manualName.trim(),
      amount: manualAmount,
      unit: manualUnit.trim() || "porción",
      calories: cal,
      protein: p,
      carbs: c,
      fat: f,
    });

    if (saveToPantry) {
      await saveFoodToLibrary({
        name: manualName.trim(),
        serving_size: manualAmount,
        serving_unit: manualUnit.trim() || "porción",
        calories: cal,
        protein: p,
        carbs: c,
        fat: f,
      });
    }

    closeAddMeal();
  };

  return (
    <Modal title={`Añadir alimento a ${mealTitle}`} onClose={closeAddMeal} width={600}>
      <div className="space-y-4 text-main">
        {/* Selector de modo */}
        <div className="flex rounded-lg border border-line bg-elevated/40 p-1">
          <button
            type="button"
            onClick={() => setTab("pantry")}
            className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-medium transition-colors ${
              tab === "pantry" ? "bg-card text-main shadow-xs font-semibold" : "text-faint hover:text-dim"
            }`}
            data-testid="tab-modal-pantry"
          >
            <span className="flex items-center justify-center gap-1.5">
              <BookOpen size={13} /> De mi Despensa
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("recipes")}
            className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-medium transition-colors ${
              tab === "recipes" ? "bg-card text-main shadow-xs font-semibold" : "text-faint hover:text-dim"
            }`}
            data-testid="tab-modal-recipes"
          >
            <span className="flex items-center justify-center gap-1.5">
              <ChefHat size={13} /> Mis Recetas ({recipes.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("ai")}
            className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-medium transition-colors ${
              tab === "ai" ? "bg-card text-accent shadow-xs font-semibold" : "text-faint hover:text-dim"
            }`}
            data-testid="tab-modal-ai"
          >
            <span className="flex items-center justify-center gap-1.5">
              <Wand2 size={13} className="text-accent" /> Estimar con IA
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-medium transition-colors ${
              tab === "manual" ? "bg-card text-main shadow-xs font-semibold" : "text-faint hover:text-dim"
            }`}
            data-testid="tab-modal-manual"
          >
            <span className="flex items-center justify-center gap-1.5">
              <Sparkles size={13} /> Carga Manual
            </span>
          </button>
        </div>

        {/* 1. De mi Despensa */}
        {tab === "pantry" && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar alimento en tu despensa..."
                className={`${inputBase} pl-9 text-[13px]`}
                autoFocus
              />
            </div>

            <div className="max-h-56 divide-y divide-line/40 overflow-y-auto rounded-lg border border-line bg-card/40 p-1">
              {filteredFoods.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-faint">
                  No se encontraron alimentos en tu despensa. Podés crearlo en la pestaña de Carga Rápida o Estimar con IA.
                </div>
              ) : (
                filteredFoods.map((f) => {
                  const isSel = selectedFood?.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFood(f)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition-colors rounded-md ${
                        isSel ? "bg-accent/15 text-main font-medium border border-accent/40" : "hover:bg-elevated/40 text-dim"
                      }`}
                      data-testid={`pantry-food-item-${f.id}`}
                    >
                      <div>
                        <div className="text-main font-medium">{f.name}</div>
                        <div className="text-[11px] text-faint">
                          Porción base: {f.serving_size} {f.serving_unit}
                        </div>
                      </div>
                      <div className="text-right text-[11.5px]">
                        <div className="font-semibold text-main">{f.calories} kcal</div>
                        <div className="text-[10.5px] text-faint">
                          {f.protein}g P · {f.carbs}g C · {f.fat}g G
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedFood && (
              <div className="rounded-lg border border-line bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-main">Cantidad consumida:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
                      className={`${inputBase} w-24 py-1 text-center font-bold text-main`}
                    />
                    <span className="text-[12px] text-faint">{selectedFood.serving_unit}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[12px] text-dim border-t border-line/40">
                  <span>Valores calculados:</span>
                  <span className="font-medium text-main">
                    {scaledCalories} kcal · {scaledProtein}g P · {scaledCarbs}g C · {scaledFat}g G
                  </span>
                </div>

                <div className="pt-2">
                  <PrimaryButton onClick={handleAddFromPantry} className="w-full justify-center">
                    Agregar a {mealTitle}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Mis Recetas */}
        {tab === "recipes" && (
          <div className="space-y-3" data-testid="modal-recipes-container">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en tus recetas o ingredientes..."
                className={`${inputBase} pl-9 text-[13px]`}
                autoFocus
              />
            </div>

            <div className="max-h-56 divide-y divide-line/40 overflow-y-auto rounded-lg border border-line bg-card/40 p-1">
              {filteredRecipes.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-faint">
                  No se encontraron recetas compuestas. Podés crear una en la pestaña «Despensa / Recetas».
                </div>
              ) : (
                filteredRecipes.map((r) => {
                  const isSel = selectedRecipe?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRecipe(r)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition-colors rounded-md ${
                        isSel ? "bg-accent/15 text-main font-medium border border-accent/40" : "hover:bg-elevated/40 text-dim"
                      }`}
                      data-testid={`select-recipe-item-${r.id}`}
                    >
                      <div>
                        <div className="text-main font-medium">{r.name}</div>
                        <div className="text-[11px] text-faint">
                          Rinde {r.servings} raciones · {r.ingredients.length} ingredientes
                        </div>
                      </div>
                      <div className="text-right text-[11.5px]">
                        <div className="font-semibold text-main">{r.per_serving.calories} kcal/ración</div>
                        <div className="text-[10.5px] text-faint">
                          {r.per_serving.protein}g P · {r.per_serving.carbs}g C · {r.per_serving.fat}g G
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedRecipe && (
              <div className="rounded-lg border border-line bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-main">Raciones a consumir:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={recipeServings}
                      onChange={(e) => setRecipeServings(Math.max(0.1, Number(e.target.value) || 1))}
                      className={`${inputBase} w-24 py-1 text-center font-bold text-main`}
                      data-testid="input-recipe-consume-servings"
                    />
                    <span className="text-[12px] text-faint">ración/es</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[12px] text-dim border-t border-line/40">
                  <span>Aporte calculado ({recipeServings} ración):</span>
                  <span className="font-medium text-main">
                    {recCalories} kcal · {recProtein}g P · {recCarbs}g C · {recFat}g G
                  </span>
                </div>

                <div className="pt-2">
                  <PrimaryButton
                    onClick={handleAddRecipe}
                    className="w-full justify-center"
                    data-testid="confirm-add-recipe-to-meal-btn"
                  >
                    Agregar {selectedRecipe.name} a {mealTitle}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Estimar con IA */}
        {tab === "ai" && (
          <div className="space-y-3.5" data-testid="ai-estimator-container">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-dim">
                Describe lo que comiste en lenguaje natural:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isEstimating && aiPrompt.trim()) {
                      void handleRunAiEstimate();
                    }
                  }}
                  placeholder="Ej: Milanesa de pollo con puré de papas y un huevo frito"
                  className={`${inputBase} text-[13px] flex-1`}
                  data-testid="input-ai-prompt"
                  autoFocus
                />
                <PrimaryButton
                  onClick={handleRunAiEstimate}
                  disabled={isEstimating || !aiPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 text-[12.5px] flex-none"
                  data-testid="run-estimate-btn"
                >
                  {isEstimating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Estimando…</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} />
                      <span>Estimar</span>
                    </>
                  )}
                </PrimaryButton>
              </div>
              <p className="text-[11px] text-faint mt-1">
                La IA desglosará los ingredientes y calculará calorías, proteínas, carbohidratos y grasas razonables.
              </p>
            </div>

            {aiError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-400">
                {aiError}
              </div>
            )}

            {/* Resultado estimado */}
            {estimatedResult && (
              <div className="rounded-xl border border-accent/40 bg-card/60 p-3.5 space-y-3" data-testid="ai-result-panel">
                <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-2">
                  <div>
                    <div className="font-semibold text-main text-[13.5px] flex items-center gap-1.5">
                      <Check size={15} className="text-emerald-400" />
                      <span>{estimatedResult.dish_name}</span>
                    </div>
                    {estimatedResult.summary && (
                      <span className="text-[11px] text-dim">{estimatedResult.summary}</span>
                    )}
                  </div>
                  <span className="text-[10.5px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                    Confianza {estimatedResult.confidence}
                  </span>
                </div>

                {/* Desglose de ingredientes detectados */}
                {estimatedResult.ingredients.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    <span className="text-[11px] font-semibold text-faint uppercase">Ingredientes estimados:</span>
                    {estimatedResult.ingredients.map((ing, i) => (
                      <div key={i} className="flex items-center justify-between text-[11.5px] py-1 border-b border-line/30">
                        <span className="text-main">
                          {ing.name} ({ing.amount} {ing.unit})
                        </span>
                        <span className="text-dim">
                          {ing.calories} kcal · {ing.protein}g P
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totales editables */}
                <div className="grid grid-cols-4 gap-2 pt-1 border-t border-line/40">
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Calorías:</label>
                    <input
                      type="number"
                      min="0"
                      value={manualCalories}
                      onChange={(e) => setManualCalories(e.target.value === "" ? "" : Number(e.target.value))}
                      className={`${inputBase} text-[12px] font-bold text-main py-0.5`}
                      data-testid="input-ai-calories"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Proteínas (g):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={manualProtein}
                      onChange={(e) => setManualProtein(e.target.value === "" ? "" : Number(e.target.value))}
                      className={`${inputBase} text-[12px] text-indigo-400 py-0.5`}
                      data-testid="input-ai-protein"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Carbos (g):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={manualCarbs}
                      onChange={(e) => setManualCarbs(e.target.value === "" ? "" : Number(e.target.value))}
                      className={`${inputBase} text-[12px] text-amber-400 py-0.5`}
                      data-testid="input-ai-carbs"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10.5px] text-dim">Grasas (g):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={manualFat}
                      onChange={(e) => setManualFat(e.target.value === "" ? "" : Number(e.target.value))}
                      className={`${inputBase} text-[12px] text-rose-400 py-0.5`}
                      data-testid="input-ai-fat"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 pt-1 text-[11.5px] text-faint hover:text-dim">
                  <input
                    type="checkbox"
                    checked={saveToPantry}
                    onChange={(e) => setSaveToPantry(e.target.checked)}
                    className="rounded border-line"
                  />
                  Guardar también en mi despensa para reutilizar en el futuro
                </label>

                <div className="pt-1">
                  <PrimaryButton
                    onClick={handleAddEstimatedDish}
                    className="w-full justify-center text-[12.5px]"
                    data-testid="confirm-add-estimated-dish-btn"
                  >
                    Aceptar y agregar a {mealTitle}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Carga Manual */}
        {tab === "manual" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-dim">Nombre del alimento / plato:</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Ej. Pechuga con arroz y palta"
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
                  value={manualAmount}
                  onChange={(e) => setManualAmount(Number(e.target.value) || 1)}
                  className={`${inputBase} text-[12.5px]`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Unidad:</label>
                <input
                  type="text"
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  placeholder="ej: g, plato, vaso"
                  className={`${inputBase} text-[12.5px]`}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-dim">Calorías (kcal):</label>
                <input
                  type="number"
                  min="0"
                  value={manualCalories}
                  onChange={(e) => setManualCalories(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className={`${inputBase} text-[12.5px] font-semibold text-main`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Proteínas (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={manualProtein}
                  onChange={(e) => setManualProtein(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className={`${inputBase} text-[12.5px] text-indigo-400`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Carbos (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={manualCarbs}
                  onChange={(e) => setManualCarbs(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className={`${inputBase} text-[12.5px] text-amber-400`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-dim">Grasas (g):</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={manualFat}
                  onChange={(e) => setManualFat(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className={`${inputBase} text-[12.5px] text-rose-400`}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 text-[12px] text-faint hover:text-dim">
              <input
                type="checkbox"
                checked={saveToPantry}
                onChange={(e) => setSaveToPantry(e.target.checked)}
                className="rounded border-line"
              />
              Guardar también en mi despensa para reutilizar
            </label>

            <div className="pt-2">
              <PrimaryButton
                onClick={handleAddManual}
                disabled={!manualName.trim()}
                className="w-full justify-center"
              >
                Agregar a {mealTitle}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

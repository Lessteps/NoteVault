import { useState, useEffect } from "react";
import {
  Apple,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sliders,
  BookOpen,
  CalendarDays,
  FileText,
  User,
  TrendingUp,
} from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { GhostButton, inputBase } from "../common/forms";
import { MacroCards } from "./MacroCards";
import { MealSection } from "./MealSection";
import { AddFoodDialog } from "./AddFoodDialog";
import { FoodLibraryView } from "./FoodLibraryView";
import { NutritionSettingsDialog } from "./NutritionSettingsDialog";
import { NutriProfileView } from "./NutriProfileView";
import { NutritionTrendsView } from "./NutritionTrendsView";
import { NUTRI_MEALS } from "../../lib/nutritionTypes";

function formatDateHuman(iso: string): string {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return iso;
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  const formatted = d.toLocaleDateString("es-ES", options);
  return isToday ? `Hoy, ${formatted}` : formatted;
}

function DailyNotesCard() {
  const summary = useNutrition((s) => s.summary);
  const setNotes = useNutrition((s) => s.setNotes);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(summary?.log.notes || "");
  }, [summary?.date, summary?.log.notes]);

  const handleSave = async () => {
    if (text !== (summary?.log.notes || "")) {
      await setNotes(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-card/50 p-4 shadow-sm" data-testid="daily-notes-card">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-main">
          <FileText size={15} className="text-accent" />
          <span>Notas y observaciones del día</span>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[11px] font-medium text-emerald-400">Guardado</span>
          )}
          <GhostButton
            onClick={() => void handleSave()}
            className="text-[11px] font-medium text-accent hover:text-accent/80"
            data-testid="save-notes-btn"
          >
            Guardar nota
          </GhostButton>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void handleSave()}
        rows={2}
        placeholder="Sensaciones, digestión, comidas fuera de casa o notas del plan..."
        className={`${inputBase} resize-y text-[12.5px] leading-relaxed`}
        data-testid="daily-notes-textarea"
      />
    </div>
  );
}

export function NutritionModule() {
  const selectedDate = useNutrition((s) => s.selectedDate);
  const activeTab = useNutrition((s) => s.activeTab);
  const error = useNutrition((s) => s.error);
  const targets = useNutrition((s) => s.targets);

  const prevDay = useNutrition((s) => s.prevDay);
  const nextDay = useNutrition((s) => s.nextDay);
  const goToday = useNutrition((s) => s.goToday);
  const setActiveTab = useNutrition((s) => s.setActiveTab);
  const loadDay = useNutrition((s) => s.loadDay);
  const loadFoods = useNutrition((s) => s.loadFoods);
  const loadSettings = useNutrition((s) => s.loadSettings);
  const setSettingsOpen = useNutrition((s) => s.setSettingsOpen);

  useEffect(() => {
    void loadDay();
    void loadFoods();
    void loadSettings();
  }, [loadDay, loadFoods, loadSettings]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background text-main" data-testid="nutrition-module">
      {/* Barra superior del módulo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card/40 px-5 py-3">
        {/* Título y navegación de fecha */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Apple size={18} />
            </div>
            <h1 className="text-base font-semibold text-main">Alimentación</h1>
          </div>

          {activeTab === "diario" && (
            <div className="flex items-center gap-1 rounded-lg border border-line bg-elevated/40 p-0.5">
              <GhostButton
                onClick={() => void prevDay()}
                className="h-7 w-7 p-0 text-faint hover:text-main"
                title="Día anterior"
                data-testid="prev-day-btn"
              >
                <ChevronLeft size={14} />
              </GhostButton>

              <button
                type="button"
                onClick={() => void goToday()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-main transition-colors hover:text-dim"
                title="Ir a hoy"
                data-testid="current-date-btn"
              >
                <Calendar size={13} className="text-faint" />
                <span>{formatDateHuman(selectedDate)}</span>
              </button>

              <GhostButton
                onClick={() => void nextDay()}
                className="h-7 w-7 p-0 text-faint hover:text-main"
                title="Día siguiente"
                data-testid="next-day-btn"
              >
                <ChevronRight size={14} />
              </GhostButton>
            </div>
          )}
        </div>

        {/* Pestañas y Ajustes */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-elevated/40 p-0.5 text-[12.5px]">
            <button
              type="button"
              onClick={() => setActiveTab("diario")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeTab === "diario" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
              }`}
              data-testid="tab-diario"
            >
              <CalendarDays size={13} /> Diario
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tendencias")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeTab === "tendencias" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
              }`}
              data-testid="tab-tendencias"
            >
              <TrendingUp size={13} /> Tendencias
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("alimentos")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeTab === "alimentos" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
              }`}
              data-testid="tab-alimentos"
            >
              <BookOpen size={13} /> Despensa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("perfil")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeTab === "perfil" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
              }`}
              data-testid="tab-perfil"
            >
              <User size={13} /> Perfil
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("metas")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeTab === "metas" ? "bg-card text-main shadow-xs" : "text-faint hover:text-dim"
              }`}
              data-testid="tab-metas"
            >
              <Sliders size={13} /> Metas
            </button>
          </div>

          <GhostButton
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 text-[12px] text-faint hover:text-main"
            title="Ajustar metas diarias de macros y agua"
            data-testid="open-settings-btn"
          >
            <Sliders size={13} />
            <span className="hidden sm:inline">Metas</span>
          </GhostButton>
        </div>
      </div>

      {/* Contenido principal scrolleable */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-6">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12.5px] text-rose-400">
              {error}
            </div>
          )}

          {activeTab === "diario" && (
            <>
              {/* Tarjetas de progreso macro */}
              <MacroCards />

              {/* Turnos de comida */}
              <div className="space-y-3.5">
                {NUTRI_MEALS.map((m) => (
                  <MealSection key={m.id} meal={m.id} />
                ))}
              </div>

              {/* Notas del día */}
              <DailyNotesCard />
            </>
          )}

          {activeTab === "tendencias" && <NutritionTrendsView />}

          {activeTab === "alimentos" && <FoodLibraryView />}

          {activeTab === "perfil" && <NutriProfileView />}

          {activeTab === "metas" && (
            <div className="rounded-xl border border-line bg-card/60 p-6">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <h2 className="text-base font-semibold text-main">Metas Nutricionales y de Hidratación</h2>
                  <p className="text-[12px] text-faint">
                    Configura tus calorías diarias y distribución de macronutrientes o sincronízalas con tu peso de Ejercicio.
                  </p>
                </div>
                <GhostButton
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-1.5 text-accent"
                >
                  <Sliders size={13} /> Modificar metas
                </GhostButton>
              </div>

              {targets && (
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
                  <div className="rounded-lg border border-line bg-card p-3">
                    <span className="text-[11px] text-faint">Calorías meta</span>
                    <div className="mt-1 text-xl font-bold text-main">{targets.calories} kcal</div>
                  </div>
                  <div className="rounded-lg border border-line bg-card p-3">
                    <span className="text-[11px] text-faint">Proteínas meta</span>
                    <div className="mt-1 text-xl font-bold text-indigo-400">{targets.protein_g}g</div>
                  </div>
                  <div className="rounded-lg border border-line bg-card p-3">
                    <span className="text-[11px] text-faint">Carbohidratos</span>
                    <div className="mt-1 text-xl font-bold text-amber-400">{targets.carbs_g}g</div>
                  </div>
                  <div className="rounded-lg border border-line bg-card p-3">
                    <span className="text-[11px] text-faint">Grasas</span>
                    <div className="mt-1 text-xl font-bold text-rose-400">{targets.fat_g}g</div>
                  </div>
                  <div className="rounded-lg border border-line bg-card p-3">
                    <span className="text-[11px] text-faint">Agua diaria</span>
                    <div className="mt-1 text-xl font-bold text-cyan-400">{(targets.water_ml / 1000).toFixed(1)} L</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modales integrados */}
      <AddFoodDialog />
      <NutritionSettingsDialog />
    </div>
  );
}

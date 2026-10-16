import { useEffect, useState } from "react";
import {
  TrendingUp,
  Flame,
  Droplets,
  Target,
  Utensils,
  Calendar,
  Download,
} from "lucide-react";
import { useNutrition } from "../../store/nutrition";
import { GhostButton } from "../common/forms";
import { ExportNutritionDialog } from "./ExportNutritionDialog";
import type { NutriTrendDay } from "../../lib/nutritionTypes";

export function NutritionTrendsView() {
  const trends = useNutrition((s) => s.trends);
  const trendsDays = useNutrition((s) => s.trendsDays);
  const loadTrends = useNutrition((s) => s.loadTrends);
  const setTrendsDays = useNutrition((s) => s.setTrendsDays);
  const setExportModalOpen = useNutrition((s) => s.setExportModalOpen);

  const [hoveredDay, setHoveredDay] = useState<NutriTrendDay | null>(null);

  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);

  if (!trends) {
    return (
      <div className="py-12 text-center text-[13px] text-faint" data-testid="trends-loading">
        Cargando analítica de tendencias y promedios…
      </div>
    );
  }

  const { averages, targets, adherence, days, topFoods } = trends;
  const calDelta = averages.caloriesPerDay - targets.calories;
  const maxCaloriesInView = Math.max(
    targets.calories * 1.3,
    ...days.map((d) => d.calories),
    1000,
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-main" data-testid="nutrition-trends-view">
      {/* Encabezado y Selector de Rango */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-lg font-bold text-main flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" />
            <span>Analítica de Adherencia y Tendencias</span>
          </h2>
          <p className="text-[12px] text-faint mt-0.5">
            Evaluación semanal del balance calórico, ingesta proteica y alimentos más frecuentes.
          </p>
        </div>

        {/* Selector de días y botón exportar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card/60 p-1 text-[12px] font-medium">
            {[7, 14, 30].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => void setTrendsDays(num)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  trendsDays === num
                    ? "bg-accent text-white shadow-xs font-semibold"
                    : "text-faint hover:text-dim"
                }`}
                data-testid={`range-btn-${num}`}
              >
                {num} días
              </button>
            ))}
          </div>

          <GhostButton
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-main border border-line bg-card/60 px-3 py-1.5 hover:border-accent hover:text-accent transition-colors"
            title="Exportar reporte en Markdown o CSV"
            data-testid="open-export-btn"
          >
            <Download size={13} />
            <span>Exportar</span>
          </GhostButton>
        </div>
      </div>

      {/* 4 KPIs Clave */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Promedio Calórico */}
        <div className="rounded-xl border border-line bg-card/60 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-dim">
            <span className="text-[12px] font-medium flex items-center gap-1.5 text-main">
              <Flame size={15} className="text-orange-400" /> Promedio Calórico
            </span>
            <span
              className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                Math.abs(calDelta) <= targets.calories * 0.1
                  ? "bg-emerald-500/15 text-emerald-400"
                  : calDelta > 0
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-cyan-500/15 text-cyan-400"
              }`}
            >
              {calDelta > 0 ? `+${calDelta} kcal` : `${calDelta} kcal`}
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-main">
              {averages.caloriesPerDay}{" "}
              <span className="text-[12.5px] font-normal text-faint">kcal/día</span>
            </div>
            <p className="text-[11px] text-faint mt-0.5">
              Meta: {targets.calories} kcal/día
            </p>
          </div>

          <div className="text-[11px] text-dim border-t border-line/40 pt-2">
            {calDelta >= -50 && calDelta <= 50
              ? "🎯 En perfecto balance con tu objetivo"
              : calDelta > 50
                ? "📈 Superávit promedio en este período"
                : "📉 Déficit promedio en este período"}
          </div>
        </div>

        {/* Promedio Proteico */}
        <div className="rounded-xl border border-line bg-card/60 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-dim">
            <span className="text-[12px] font-medium text-main">🥩 Proteína Promedio</span>
            <span className="text-[11px] text-faint">Meta: {targets.protein_g}g</span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-indigo-400">
              {averages.proteinPerDay}{" "}
              <span className="text-[12.5px] font-normal text-faint">g/día</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((averages.proteinPerDay / Math.max(1, targets.protein_g)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="text-[11px] text-faint border-t border-line/40 pt-2">
            {averages.proteinPerDay >= targets.protein_g
              ? "✅ Objetivo de proteína alcanzado"
              : `Faltan ~${Math.round(targets.protein_g - averages.proteinPerDay)}g para la meta diaria`}
          </div>
        </div>

        {/* Hidratación Promedio */}
        <div className="rounded-xl border border-line bg-card/60 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-dim">
            <span className="text-[12px] font-medium flex items-center gap-1.5 text-main">
              <Droplets size={15} className="text-cyan-400" /> Hidratación
            </span>
            <span className="text-[11px] text-faint">
              Meta: {(targets.water_ml / 1000).toFixed(1)} L
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-cyan-400">
              {(averages.waterMlPerDay / 1000).toFixed(1)}{" "}
              <span className="text-[12.5px] font-normal text-faint">L/día</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
              <div
                className="h-full bg-cyan-400 transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((averages.waterMlPerDay / Math.max(1, targets.water_ml)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="text-[11px] text-faint border-t border-line/40 pt-2">
            {averages.waterMlPerDay >= targets.water_ml
              ? "💧 Excelente nivel de hidratación"
              : "Recomendado beber 1-2 vasos más al día"}
          </div>
        </div>

        {/* Tasa de Adherencia */}
        <div className="rounded-xl border border-line bg-card/60 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-dim">
            <span className="text-[12px] font-medium flex items-center gap-1.5 text-main">
              <Target size={15} className="text-emerald-400" /> Adherencia
            </span>
            <span className="text-[11px] text-faint">
              {adherence.loggedDays} de {adherence.totalDays} reg.
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-emerald-400">
              {adherence.compliancePct}%
            </div>
            <p className="text-[11.5px] text-dim mt-0.5">
              {adherence.compliantDays} de {adherence.totalDays} días en rango meta
            </p>
          </div>

          <div className="text-[11px] text-faint border-t border-line/40 pt-2">
            Constancia evaluada en los últimos {trendsDays} días
          </div>
        </div>
      </div>

      {/* Gráfica de Barras de Calorías vs Meta */}
      <div className="rounded-2xl border border-line bg-card/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-main flex items-center gap-2">
              <Calendar size={16} className="text-accent" />
              <span>Calorías Diarias vs Meta ({targets.calories} kcal)</span>
            </h3>
            <p className="text-[11.5px] text-faint mt-0.5">
              Pasa el cursor sobre cualquier barra para ver el desglose de macronutrientes de ese día.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-dim">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> En rango meta
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Superávit / Excedido
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> Déficit / Por debajo
            </span>
          </div>
        </div>

        {/* Área del gráfico */}
        <div className="relative pt-6 pb-2">
          {/* Línea horizontal de meta */}
          <div
            className="absolute left-0 right-0 z-10 border-b-2 border-dashed border-accent/60 pointer-events-none"
            style={{
              bottom: `${Math.round((targets.calories / maxCaloriesInView) * 160) + 28}px`,
            }}
          >
            <span className="absolute -top-4 right-0 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold text-accent border border-accent/40 shadow-xs">
              Meta {targets.calories} kcal
            </span>
          </div>

          {/* Barras de los días */}
          <div className="flex items-end justify-between gap-1.5 sm:gap-2.5 h-[190px] px-2">
            {days.map((d) => {
              const barHeightPx = Math.max(
                4,
                Math.round((d.calories / maxCaloriesInView) * 160),
              );

              const colorClass =
                d.adherence === "compliant"
                  ? "bg-emerald-500 hover:bg-emerald-400"
                  : d.adherence === "over"
                    ? "bg-amber-400 hover:bg-amber-300"
                    : d.adherence === "under"
                      ? "bg-cyan-400 hover:bg-cyan-300"
                      : "bg-elevated/60 border border-dashed border-line";

              return (
                <div
                  key={d.date}
                  className="group relative flex flex-1 flex-col items-center"
                  onMouseEnter={() => setHoveredDay(d)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  {/* Barra */}
                  <div
                    className={`w-full max-w-[36px] rounded-t-md transition-all duration-200 cursor-pointer ${colorClass}`}
                    style={{ height: `${barHeightPx}px` }}
                  />

                  {/* Label fecha */}
                  <span className="mt-2 text-[10.5px] font-medium text-faint truncate max-w-full">
                    {d.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detalle flotante o informativo del día inspeccionado */}
        <div className="rounded-xl border border-line bg-card/90 p-3 text-[12px] transition-all">
          {hoveredDay && hoveredDay.itemsCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-main">{hoveredDay.dayLabel} ({hoveredDay.date}):</span>
                <span className="font-bold text-main">{hoveredDay.calories} kcal</span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    hoveredDay.adherence === "compliant"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : hoveredDay.adherence === "over"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-cyan-500/15 text-cyan-400"
                  }`}
                >
                  {hoveredDay.adherence === "compliant" && "Cumplido"}
                  {hoveredDay.adherence === "over" && "Exceso"}
                  {hoveredDay.adherence === "under" && "Déficit"}
                </span>
              </div>

              <div className="flex items-center gap-4 text-dim text-[11.5px]">
                <span className="text-indigo-400">🥩 {hoveredDay.protein}g P</span>
                <span className="text-amber-400">🍚 {hoveredDay.carbs}g C</span>
                <span className="text-rose-400">🥑 {hoveredDay.fat}g G</span>
                <span className="text-cyan-400">💧 {(hoveredDay.water_ml / 1000).toFixed(1)} L</span>
              </div>
            </div>
          ) : (
            <div className="text-faint text-center text-[11.5px]">
              {hoveredDay && hoveredDay.itemsCount === 0
                ? `${hoveredDay.dayLabel}: Sin alimentos registrados`
                : `Resumen de período: ${adherence.loggedDays} días registrados con un promedio de ${averages.caloriesPerDay} kcal y ${averages.proteinPerDay}g de proteína al día.`}
            </div>
          )}
        </div>
      </div>

      {/* Top Alimentos más consumidos */}
      <div className="rounded-2xl border border-line bg-card/60 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Utensils size={18} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-main">
              Alimentos más consumidos en los últimos {trendsDays} días
            </h3>
          </div>
          <span className="text-[11px] text-faint">Frecuencia y aporte nutricional acumulado</span>
        </div>

        {topFoods.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-faint">
            Aún no hay alimentos registrados en este período para generar el ranking.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {topFoods.map((f, idx) => {
              const maxCount = topFoods[0]?.count || 1;
              const barWidthPct = Math.round((f.count / maxCount) * 100);

              return (
                <div
                  key={f.name}
                  className="rounded-xl border border-line bg-card/80 p-3 space-y-1.5 shadow-xs transition-colors hover:border-line-strong"
                  data-testid={`top-food-${idx}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-elevated text-[10.5px] font-bold text-dim">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-[13px] text-main truncate" title={f.name}>
                        {f.name}
                      </span>
                    </div>

                    <span className="text-[11px] font-semibold text-accent flex-none">
                      {f.count} {f.count === 1 ? "vez" : "veces"}
                    </span>
                  </div>

                  {/* Barra de frecuencia */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/70">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${barWidthPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-faint pt-0.5">
                    <span>Total: {f.totalAmount} {f.unit}</span>
                    <span className="text-dim">
                      {f.totalCalories} kcal · <strong className="text-indigo-400">{f.totalProtein}g P</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Exportación */}
      <ExportNutritionDialog />
    </div>
  );
}

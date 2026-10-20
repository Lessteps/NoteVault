/**
 * Generador de Reportes y Resúmenes Nutricionales
 *
 * Exporta analítica semanal o mensual a formatos:
 * - Markdown enriquecido (ideal para guardar en el Vault o compartir con nutricionista)
 * - Filas CSV (para hojas de cálculo)
 */

import type { NutriTrendsData, NutriProfile } from "../lib/nutritionTypes";
import { NUTRI_MEALS } from "../lib/nutritionTypes";

export function generateNutritionMarkdownReport(
  trends: NutriTrendsData,
  profile?: NutriProfile | null,
): string {
  const { startDate, endDate, daysCount, averages, targets, adherence, topFoods, days } = trends;

  const lines: string[] = [];
  lines.push(`# Reporte Nutricional — NoteVault`);
  lines.push(`**Período:** ${startDate} al ${endDate} (${daysCount} días)`);
  lines.push(`**Generado:** ${new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n`);

  if (profile) {
    lines.push(`## Perfil Nutricional`);
    if (profile.weight) lines.push(`- **Peso registrado:** ${profile.weight} kg`);
    if (profile.goal) lines.push(`- **Objetivo:** ${profile.goal}`);
    if (profile.dietary_restrictions && profile.dietary_restrictions !== "Ninguno") {
      lines.push(`- **Restricciones / Contraindicaciones:** ${profile.dietary_restrictions}`);
    }
    lines.push("");
  }

  lines.push(`## 1. Resumen y Promedios Diarios`);
  lines.push(`| Métrica | Promedio Real | Meta Diaria | Balance / Estado |`);
  lines.push(`| :--- | :---: | :---: | :---: |`);

  const calDelta = averages.caloriesPerDay - targets.calories;
  const calDeltaStr = calDelta > 0 ? `+${calDelta} kcal (Superávit)` : `${calDelta} kcal (Déficit)`;
  lines.push(`| **Calorías** | ${averages.caloriesPerDay} kcal | ${targets.calories} kcal | ${calDeltaStr} |`);

  const protDelta = Number((averages.proteinPerDay - targets.protein_g).toFixed(1));
  const protDeltaStr = protDelta >= 0 ? `+${protDelta}g (Alcanzado)` : `${protDelta}g`;
  lines.push(`| **Proteínas** | ${averages.proteinPerDay}g | ${targets.protein_g}g | ${protDeltaStr} |`);
  lines.push(`| **Carbohidratos** | ${averages.carbsPerDay}g | ${targets.carbs_g}g | - |`);
  lines.push(`| **Grasas** | ${averages.fatPerDay}g | ${targets.fat_g}g | - |`);
  lines.push(`| **Agua** | ${(averages.waterMlPerDay / 1000).toFixed(1)} L | ${(targets.water_ml / 1000).toFixed(1)} L | ${averages.waterMlPerDay >= targets.water_ml ? "Óptimo" : "Mejorable"} |\n`);

  lines.push(`## 2. Adherencia y Constancia`);
  lines.push(`- **Días con registro activo:** ${adherence.loggedDays} de ${adherence.totalDays} días`);
  lines.push(`- **Días en rango calórico meta:** ${adherence.compliantDays} de ${adherence.totalDays} días`);
  lines.push(`- **Tasa de cumplimiento:** ${adherence.compliancePct}%\n`);

  if (targets.meal_distribution) {
    lines.push(`## 3. Distribución por Turnos (Timing Nutricional)`);
    lines.push(`| Turno | % Calórico Asignado | Calorías Meta |`);
    lines.push(`| :--- | :---: | :---: |`);
    for (const m of NUTRI_MEALS) {
      const pct = targets.meal_distribution[m.id] ?? 0;
      const mealCal = Math.round((targets.calories * pct) / 100);
      lines.push(`| ${m.label} | ${pct}% | ~${mealCal} kcal |`);
    }
    lines.push("");
  }

  if (topFoods.length > 0) {
    lines.push(`## 4. Alimentos Más Frecuentes`);
    lines.push(`| Alimento | Frecuencia | Total Aportado |`);
    lines.push(`| :--- | :---: | :---: |`);
    for (const f of topFoods.slice(0, 8)) {
      lines.push(`| **${f.name}** | ${f.count} veces | ${f.totalCalories} kcal · ${f.totalProtein}g P |`);
    }
    lines.push("");
  }

  lines.push(`## 5. Detalle Día por Día`);
  lines.push(`| Fecha | Día | Calorías | Proteínas | Carbos | Grasas | Agua | Estado |`);
  lines.push(`| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`);
  for (const d of days) {
    const estado = d.adherence === "compliant" ? "En meta" : d.adherence === "over" ? "Superávit" : d.adherence === "under" ? "Déficit" : "Sin registro";
    lines.push(`| ${d.date} | ${d.dayLabel} | ${d.calories} kcal | ${d.protein}g | ${d.carbs}g | ${d.fat}g | ${d.water_ml} ml | ${estado} |`);
  }

  return lines.join("\n") + "\n";
}

export function generateNutritionCsvData(trends: NutriTrendsData): { header: string[]; rows: Array<Array<string | number>> } {
  const header = ["Fecha", "Dia", "Calorias", "Proteinas_g", "Carbos_g", "Grasas_g", "Agua_ml", "Meta_Calorias", "Estado"];
  const rows = trends.days.map((d) => [
    d.date,
    d.dayLabel,
    d.calories,
    d.protein,
    d.carbs,
    d.fat,
    d.water_ml,
    d.targetCalories,
    d.adherence,
  ]);
  return { header, rows };
}

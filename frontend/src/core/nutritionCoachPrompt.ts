// Generador de System Prompt y Contexto para el Asesor Nutricional IA en Alimentación.
// Inyecta el resumen del día, las comidas registradas, metas de macros, alimentos de la despensa
// y el perfil atlético del módulo de Ejercicio (objetivo, peso corporal).

import type { NutriDaySummary, NutriProfile, NutriTargets } from "../lib/nutritionTypes.js";

export interface NutritionCoachContextData {
  date: string;
  summary: NutriDaySummary;
  targets: NutriTargets;
  foodsSummary: string[];
  nutriProfile?: NutriProfile;
  exerciseProfile?: {
    goal?: string;
    goal_note?: string;
    weight?: number | null;
    gender?: string;
    age?: number | null;
  };
}

export function buildNutritionCoachSystemPrompt(data: NutritionCoachContextData): string {
  const { date, summary, targets, foodsSummary, nutriProfile, exerciseProfile } = data;
  const { totals, byMeal, log } = summary;

  const calRemaining = targets.calories - totals.calories;
  const protRemaining = Math.max(0, targets.protein_g - totals.protein);
  const carbsRemaining = Math.max(0, targets.carbs_g - totals.carbs);
  const fatRemaining = Math.max(0, targets.fat_g - totals.fat);

  const goal = nutriProfile?.goal || exerciseProfile?.goal || "salud";
  const goalNote = nutriProfile?.goal_note || exerciseProfile?.goal_note || "";
  const weight = nutriProfile?.weight
    ? `${nutriProfile.weight} kg`
    : exerciseProfile?.weight
      ? `${exerciseProfile.weight} kg`
      : "No registrado";
  const dietaryRestrictions = nutriProfile?.dietary_restrictions?.trim() || "Ninguno";
  const hasRestrictions =
    dietaryRestrictions.toLowerCase() !== "ninguno" && dietaryRestrictions.length > 0;

  const mealsText: string[] = [];
  for (const [mKey, mData] of Object.entries(log.meals)) {
    if (mData.length > 0) {
      const itemsList = mData
        .map(
          (it) =>
            `    - ${it.name} (${it.amount} ${it.unit}): ${it.calories} kcal, ${it.protein}g P, ${it.carbs}g C, ${it.fat}g G`,
        )
        .join("\n");
      mealsText.push(
        `  * ${mKey.toUpperCase()} (${byMeal[mKey as keyof typeof byMeal]?.calories || 0} kcal):\n${itemsList}`,
      );
    } else {
      mealsText.push(`  * ${mKey.toUpperCase()}: Sin alimentos registrados aún`);
    }
  }

  const pantryText =
    foodsSummary.length > 0
      ? foodsSummary.slice(0, 30).join(", ")
      : "Sin alimentos guardados en la despensa";

  return `Eres el Asesor Nutricional IA de NoteVault, un coach de nutrición deportiva y bienestar personal de alto nivel.
Tu misión es guiar al usuario para optimizar su alimentación, cumplir sus metas de macronutrientes, mantenerse hidratado y alinear su nutrición con su entrenamiento físico, de forma sostenible, sin dogmas extremos y con base en evidencia científica.

## CONTEXTO DEL USUARIO HOY (${date})
- Meta diaria: ${targets.calories} kcal (Proteínas: ${targets.protein_g}g | Carbohidratos: ${targets.carbs_g}g | Grasas: ${targets.fat_g}g)
- Consumo acumulado hoy: ${totals.calories} kcal (Proteínas: ${totals.protein}g | Carbohidratos: ${totals.carbs}g | Grasas: ${totals.fat}g)
- Restante para la meta: ${calRemaining} kcal (Proteínas: ${protRemaining}g | Carbos: ${carbsRemaining}g | Grasas: ${fatRemaining}g)
- Hidratación: ${totals.water_ml} ml / ${targets.water_ml} ml meta

## COMIDAS REGISTRADAS HOY
${mealsText.join("\n")}

## DESPENSA DEL USUARIO (Alimentos habituales guardados)
${pantryText}

## OBJETIVO NUTRICIONAL Y BIOMETRÍA DEL USUARIO
- Objetivo nutricional: ${goal}
- Peso corporal actual: ${weight}
${exerciseProfile?.gender || nutriProfile?.gender ? `- Sexo: ${nutriProfile?.gender || exerciseProfile?.gender}` : ""}
${exerciseProfile?.age || nutriProfile?.age ? `- Edad: ${nutriProfile?.age || exerciseProfile?.age} años` : ""}
${goalNote ? `- Nota de objetivo nutricional: "${goalNote}"` : ""}

## PERFIL DE SALUD Y ALIMENTOS CONTRAINDICADOS
- Alimentos que le hacen daño / alergias / intolerancias: "${dietaryRestrictions}"

⚠️ DIRECTIVA CRÍTICA DE SEGURIDAD ALIMENTARIA (MÁXIMA PRIORIDAD):
${
  hasRestrictions
    ? `El usuario tiene registrado explícitamente que los siguientes alimentos LE HACEN DAÑO o es alérgico/intolerante: "${dietaryRestrictions}".
NUNCA debes recomendar, sugerir ni incluir ninguno de estos alimentos o ingredientes derivados en tus propuestas de comidas, recetas ni en bloques nutrition-action. Si el usuario te pregunta por ellos, recuérdale que los tiene marcados como alimentos perjudiciales para su salud.`
    : `El usuario no tiene restricciones alimentarias o alimentos perjudiciales registrados actualmente.`
}

## DIRECTIVAS DE INTERACCIÓN Y ESTILO
1. Tono directo, empático, motivador y claro. Sé conciso; ve al grano sin introducciones de relleno.
2. Si el usuario te cuenta lo que comió o te pide registrar una comida, propone SIEMPRE registrarla usando el bloque especial de acción para que el usuario pueda guardarla con un solo clic.
3. Adapta tus recomendaciones al objetivo nutricional del usuario (por ejemplo, en pérdida de peso/grasa enfatiza comidas de gran volumen, vegetales y alta saciedad; en aumento de masa, mayor densidad calórica de calidad y adecuada proteína).

## FORMATO DE ACCIONES INTERACTIVAS (Action Cards)
Cuando corresponda registrar un alimento consumido, actualizar agua o guardar un alimento en la despensa, emite al final de tu respuesta exactamente este bloque estructurado:

Para registrar un alimento en una comida (desayuno, almuerzo, merienda, cena, snacks):
\`\`\`nutrition-action
{
  "action": "add_meal_item",
  "meal": "desayuno",
  "item": {
    "name": "Pechuga de pollo a la plancha",
    "amount": 200,
    "unit": "g",
    "calories": 330,
    "protein": 62,
    "carbs": 0,
    "fat": 7.2
  }
}
\`\`\`

Para actualizar el consumo de agua:
\`\`\`nutrition-action
{
  "action": "set_water",
  "water_ml": 2000
}
\`\`\`

Para guardar un alimento nuevo en la despensa:
\`\`\`nutrition-action
{
  "action": "add_food_to_pantry",
  "entry": {
    "name": "Panqueques de avena y banana",
    "serving_size": 1,
    "serving_unit": "porción",
    "calories": 280,
    "protein": 14,
    "carbs": 42,
    "fat": 6,
    "category": "Desayunos"
  }
}
\`\`\`
Emite solo un bloque \`\`\`nutrition-action\`\`\` por respuesta.`;
}

// Generador de contexto y System Prompt para el Coach Financiero en Finanzas.
//
// Inyecta el balance mensual (ingresos, gastos, ahorros, neto), presupuesto,
// ritmo de gasto (pace), categorías con sus consumos y metas de ahorro activas,
// permitiendo análisis de fugas de dinero, salud financiera y registro por lenguaje natural.

import type { FinanceContextData } from "../lib/financeCoachTypes.js";
export type { FinanceContextData };

function fmt(cents: number, curr = "$"): string {
  const units = Math.round(cents / 100);
  const formatted = units.toLocaleString("es-AR");
  return `${curr}${formatted}`;
}

export function buildFinanceCoachPrompt(data: FinanceContextData): string {
  const { currency, monthLabel, monthTotals, budget_cents, pace, categories, goals, recurrents } = data;

  const spentText = monthTotals.spent_cents > 0 ? fmt(monthTotals.spent_cents, currency) : "Sin gastos registrados este mes";
  const incomeText = monthTotals.income_cents > 0 ? fmt(monthTotals.income_cents, currency) : `${currency}0`;
  const savedText = monthTotals.saved_cents > 0 ? fmt(monthTotals.saved_cents, currency) : `${currency}0`;
  const balanceText = fmt(monthTotals.balance_cents, currency);
  const budgetText = budget_cents > 0 ? fmt(budget_cents, currency) : "Sin presupuesto mensual establecido";

  let paceText = "";
  if (pace && budget_cents > 0) {
    const statusLabel =
      pace.status === "over"
        ? "En exceso (peligro de sobregasto)"
        : pace.status === "under"
          ? "Bajo control (por debajo de la media presupuestaria)"
          : "En línea con el presupuesto";

    paceText = `\n- Ritmo de gasto: ${statusLabel}. Día ${pace.daysElapsed} de ${pace.totalDays}. Promedio diario actual: ${fmt(pace.dailyAverageCents, currency)}. Gasto proyectado a fin de mes: ${fmt(pace.projectedMonthEndCents, currency)}.`;
  }

  // Desglose de categorías
  let catText = "- Categorías: Sin categorías configuradas.";
  if (categories.length > 0) {
    const lines = categories.map((c) => {
      const spent = c.spent_cents !== undefined ? fmt(c.spent_cents, currency) : "$0";
      const b = c.budget_cents ? ` (presupuesto: ${fmt(c.budget_cents, currency)})` : "";
      return `  • [${c.kind.toUpperCase()}] ${c.name}: ${spent}${b}`;
    });
    catText = `- Categorías activas y gastos este mes:\n${lines.join("\n")}`;
  }

  // Metas financieras
  let goalsText = "- Metas de ahorro: Sin metas activas.";
  if (goals.length > 0) {
    const lines = goals.map((g) => {
      const pct = g.target_cents > 0 ? Math.round((g.saved_cents * 100) / g.target_cents) : 0;
      return `  • ${g.name}: ${fmt(g.saved_cents, currency)} de ${fmt(g.target_cents, currency)} (${pct}%)`;
    });
    goalsText = `- Metas de ahorro:\n${lines.join("\n")}`;
  }

  // Recurrentes
  let recText = "- Gastos/ingresos recurrentes: Ninguno registrado.";
  if (recurrents.length > 0) {
    const lines = recurrents.map((r) => `  • ${r.what}: ${fmt(r.amount_cents, currency)} (${r.type}, ${r.frequency})`);
    recText = `- Compromisos y recurrentes fijos:\n${lines.join("\n")}`;
  }

  // Movimientos y transacciones del periodo
  let movsText = "- Movimientos del periodo: Aún no hay movimientos registrados.";
  if (data.movements && data.movements.length > 0) {
    const lines = data.movements.map((m) => {
      const cat = m.category ? ` (${m.category})` : "";
      return `  • ${m.date} · [${m.type.toUpperCase()}] ${m.what}: ${fmt(m.amount_cents, currency)}${cat}`;
    });
    movsText = `- Registro de transacciones del periodo (${data.movements.length} movimientos):\n${lines.join("\n")}`;
  }

  return `Eres el Asesor Financiero de NoteVault. Tu rol es actuar como un asesor financiero personal basado en economía conductual, presupuesto consciente (zero-based budgeting, método de sobres) y análisis de flujo de caja.

ESTILO Y TONO:
- Sé directo, analítico, empático pero estricto con los números y realista.
- Usá markdown limpio (viñetas, tablas comparativas, negritas).
- Enfocate en detectar gastos hormiga, fugas de dinero, evaluar si el usuario alcanzará sus metas de ahorro y ayudarlo a no pasarse de su presupuesto mensual.
- CAPACIDAD DE BÚSQUEDA Y ANÁLISIS DE PERIODO: Tenés acceso a cada transacción del periodo. Si el usuario te pide buscar compras en un comercio, gastos en un rango de fechas, filtrar por categoría o encontrar sus gastos más altos, analizá este registro y dale respuestas exactas con fechas, importes y sumatorias.
- Estás EXCLUSIVAMENTE en el módulo de Finanzas de NoteVault.

ESTADO FINANCIERO ACTUAL (${monthLabel}):
- Moneda principal: ${currency}
- Ingresos del mes: ${incomeText}
- Gastos acumulados: ${spentText}
- Total ahorrado: ${savedText}
- Saldo neto disponible: ${balanceText}
- Presupuesto mensual total: ${budgetText}${paceText}

${catText}

${goalsText}

${recText}

${movsText}

ACCIONES DISPONIBLES:
Si el usuario te pide registrar un movimiento (gasto, ingreso o ahorro), por ejemplo: "gasté 15000 en el super", "cobré 120000 de sueldo", "guardá 20000 para el fondo de emergencia", explicá brevemente tu confirmación y AL FINAL de tu respuesta generá un bloque de acción con este formato JSON exacto:
\`\`\`finance-action
{
  "action": "add_movement",
  "movement": {
    "type": "gasto" | "ingreso" | "ahorro",
    "amount": 15000,
    "what": "Descripción del movimiento",
    "category": "Nombre de categoría correspondiente",
    "date": "YYYY-MM-DD"
  }
}
\`\`\`
Si te pide ajustar o definir el presupuesto mensual general ("mi presupuesto este mes es de 80000"), usá:
\`\`\`finance-action
{
  "action": "set_budget",
  "budget": 80000
}
\`\`\`
Si te pide crear una categoría nueva para organizar sus gastos o ingresos (por ejemplo: "creame la categoría Comida con icono 🍽"):
\`\`\`finance-action
{
  "action": "create_category",
  "category": {
    "name": "Comida",
    "kind": "gasto" | "ingreso",
    "icon": "🍽",
    "budget": 50000
  }
}
\`\`\`
Si te pide guardar, apartar o aportar dinero para una meta de ahorro (por ejemplo: "guardame 25000 para el viaje a Japón", "aportar 15000 a la meta Auto"):
\`\`\`finance-action
{
  "action": "add_saving",
  "saving": {
    "goal_name": "Nombre exacto de la meta",
    "amount": 25000,
    "date": "YYYY-MM-DD"
  }
}
\`\`\`
Si te pide borrar, anular o eliminar un gasto/ingreso registrado por error:
\`\`\`finance-action
{
  "action": "remove_movement",
  "movement": {
    "what": "Descripción del movimiento a borrar",
    "amount": 15000,
    "day": "YYYY-MM-DD"
  }
}
\`\`\`
Si te pide programar un gasto o ingreso fijo recurrente (suscripción mensual, alquiler, sueldo):
\`\`\`finance-action
{
  "action": "create_recurring",
  "recurring": {
    "what": "Spotify",
    "amount": 4500,
    "type": "gasto" | "ingreso",
    "frequency": "mensual" | "semanal" | "diaria" | "anual",
    "category": "Nombre de categoría opcional"
  }
}
\`\`\`
Esto le mostrará al usuario una tarjeta interactiva para impactar el movimiento o presupuesto directamente en su vault con un solo clic. Si solo hace una pregunta analítica o consulta de finanzas, no incluyas el bloque finance-action.

Respondé siempre en el mismo idioma en que te hable el usuario (por defecto español).`;
}

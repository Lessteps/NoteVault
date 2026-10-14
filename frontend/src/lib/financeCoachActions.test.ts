import { describe, expect, it } from "vitest";
import { splitFinanceAction } from "./financeCoachActions.js";

describe("financeCoachActions", () => {
  it("extrae una acción add_movement de un mensaje", () => {
    const raw = `Te sugiero registrar este gasto para que quede computado:

\`\`\`finance-action
{
  "action": "add_movement",
  "movement": {
    "type": "gasto",
    "amount": 15000,
    "what": "Supermercado Coto",
    "category": "Alimentación",
    "date": "2026-10-13"
  }
}
\`\`\`

¡Cuidemos no pasarnos del tope semanal!`;

    const res = splitFinanceAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("add_movement");
    if (res.action?.action === "add_movement") {
      expect(res.action.movement.type).toBe("gasto");
      expect(res.action.movement.amount).toBe(15000);
      expect(res.action.movement.what).toBe("Supermercado Coto");
      expect(res.action.movement.category).toBe("Alimentación");
      expect(res.action.movement.date).toBe("2026-10-13");
    }
    expect(res.text).toContain("Te sugiero registrar este gasto");
    expect(res.text).toContain("¡Cuidemos no pasarnos del tope semanal!");
    expect(res.text).not.toContain("```finance-action");
  });

  it("extrae una acción set_budget de un mensaje", () => {
    const raw = `Vamos a fijar tu presupuesto mensual para este mes:

\`\`\`finance-action
{
  "action": "set_budget",
  "budget": 85000
}
\`\`\`

Con este límite podremos ahorrar $35.000 a fin de mes.`;

    const res = splitFinanceAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("set_budget");
    if (res.action?.action === "set_budget") {
      expect(res.action.budget).toBe(85000);
    }
    expect(res.text).toContain("Vamos a fijar tu presupuesto mensual");
    expect(res.text).not.toContain("```finance-action");
  });

  it("extrae una acción create_category de un mensaje", () => {
    const raw = `Te sugiero crear esta categoría para controlar tus gastos de comida:

\`\`\`finance-action
{
  "action": "create_category",
  "category": {
    "name": "Comida y Super",
    "kind": "gasto",
    "icon": "🛒",
    "budget": 60000
  }
}
\`\`\`

¡Quedará lista para registrar tus compras!`;

    const res = splitFinanceAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("create_category");
    if (res.action?.action === "create_category") {
      expect(res.action.category.name).toBe("Comida y Super");
      expect(res.action.category.kind).toBe("gasto");
      expect(res.action.category.icon).toBe("🛒");
      expect(res.action.category.budget).toBe(60000);
    }
    expect(res.text).toContain("Te sugiero crear esta categoría");
    expect(res.text).not.toContain("```finance-action");
  });

  it("extrae una acción add_saving de un mensaje", () => {
    const raw = `Te preparé el aporte para tu meta:

\`\`\`finance-action
{
  "action": "add_saving",
  "saving": {
    "goal_name": "Fondo de emergencia",
    "amount": 25000,
    "date": "2026-10-14"
  }
}
\`\`\`

¡Cada aporte te acerca a tu objetivo!`;

    const res = splitFinanceAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("add_saving");
    if (res.action?.action === "add_saving") {
      expect(res.action.saving.goal_name).toBe("Fondo de emergencia");
      expect(res.action.saving.amount).toBe(25000);
      expect(res.action.saving.date).toBe("2026-10-14");
    }
    expect(res.text).toContain("Te preparé el aporte para tu meta:");
    expect(res.text).not.toContain("```finance-action");
  });

  it("extrae una acción remove_movement de un mensaje", () => {
    const raw = `Te preparé la tarjeta para eliminar ese movimiento erróneo:

\`\`\`finance-action
{
  "action": "remove_movement",
  "movement": {
    "what": "Cena restaurante",
    "amount": 18000,
    "day": "2026-10-13"
  }
}
\`\`\`

Haz clic para confirmar el borrado.`;

    const res = splitFinanceAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("remove_movement");
    if (res.action?.action === "remove_movement") {
      expect(res.action.movement.what).toBe("Cena restaurante");
      expect(res.action.movement.amount).toBe(18000);
      expect(res.action.movement.day).toBe("2026-10-13");
    }
    expect(res.text).toContain("Te preparé la tarjeta para eliminar");
    expect(res.text).not.toContain("```finance-action");
  });

  it("extrae una acción create_recurring de un mensaje", () => {
    const raw = `Te configuré la regla para registrar tu suscripción:

\`\`\`finance-action
{
  "action": "create_recurring",
  "recurring": {
    "what": "Spotify Premium",
    "amount": 4500,
    "type": "gasto",
    "frequency": "mensual",
    "category": "Ocio"
  }
}
\`\`\`

Se ejecutará periódicamente.`;

    const res = splitFinanceAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("create_recurring");
    if (res.action?.action === "create_recurring") {
      expect(res.action.recurring.what).toBe("Spotify Premium");
      expect(res.action.recurring.amount).toBe(4500);
      expect(res.action.recurring.frequency).toBe("mensual");
      expect(res.action.recurring.category).toBe("Ocio");
    }
    expect(res.text).toContain("Te configuré la regla para registrar");
    expect(res.text).not.toContain("```finance-action");
  });

  it("devuelve null cuando no hay bloque de acción", () => {
    const raw = "Tu presupuesto va muy bien este mes, venís un 12% por debajo de la media.";
    const res = splitFinanceAction(raw);
    expect(res.action).toBeNull();
    expect(res.text).toBe(raw);
  });
});

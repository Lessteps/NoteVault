// Parser y tipos para acciones ejecutables del Coach Financiero.
//
// Permite que el modelo sugiera registros de gastos/ingresos o ajustes de presupuesto
// mediante bloques estructurados ```finance-action { ... } ``` que la UI transforma
// en tarjetas interactivas de un solo clic.

export type FinanceMovementType = "gasto" | "ingreso" | "ahorro" | "retiro";

export interface CoachMovementItem {
  type: FinanceMovementType;
  amount: number;
  what: string;
  category?: string;
  date?: string;
  goal?: string;
}

export interface FinanceActionAddMovement {
  action: "add_movement";
  movement: CoachMovementItem;
}

export interface FinanceActionSetBudget {
  action: "set_budget";
  budget: number;
}

export interface FinanceActionCreateCategory {
  action: "create_category";
  category: {
    name: string;
    kind: "gasto" | "ingreso";
    icon?: string;
    colour?: string;
    budget?: number;
  };
}

export interface CoachSavingItem {
  goal_name: string;
  amount: number;
  date?: string;
  goal_id?: string;
}

export interface FinanceActionAddSaving {
  action: "add_saving";
  saving: CoachSavingItem;
}

export interface CoachRemoveMovementItem {
  movement_id?: string;
  day?: string;
  what?: string;
  amount?: number;
}

export interface FinanceActionRemoveMovement {
  action: "remove_movement";
  movement: CoachRemoveMovementItem;
}

export interface CoachRecurringItem {
  what: string;
  amount: number;
  type?: "gasto" | "ingreso";
  frequency?: "diaria" | "semanal" | "mensual" | "anual";
  category?: string;
  dayOfMonth?: number;
}

export interface FinanceActionCreateRecurring {
  action: "create_recurring";
  recurring: CoachRecurringItem;
}

export type FinanceAction =
  | FinanceActionAddMovement
  | FinanceActionSetBudget
  | FinanceActionCreateCategory
  | FinanceActionAddSaving
  | FinanceActionRemoveMovement
  | FinanceActionCreateRecurring;

export interface SplitFinanceActionResult {
  text: string;
  action: FinanceAction | null;
}

const FINANCE_ACTION_RE = /```finance-action\s*([\s\S]*?)\s*```/;

export function splitFinanceAction(content: string): SplitFinanceActionResult {
  if (!content || typeof content !== "string") {
    return { text: "", action: null };
  }

  const match = FINANCE_ACTION_RE.exec(content);
  if (!match || !match[1]) {
    return { text: content, action: null };
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === "object") {
      if (parsed.action === "add_movement" && parsed.movement && typeof parsed.movement === "object") {
        const rawM = parsed.movement;
        const validTypes: FinanceMovementType[] = ["gasto", "ingreso", "ahorro", "retiro"];
        const type = validTypes.includes(rawM.type) ? (rawM.type as FinanceMovementType) : "gasto";
        const amount = Number(rawM.amount);

        if (!Number.isNaN(amount) && amount > 0) {
          const textWithoutBlock = content.replace(FINANCE_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "add_movement",
              movement: {
                type,
                amount,
                what: String(rawM.what || "Movimiento").trim(),
                category: rawM.category ? String(rawM.category).trim() : undefined,
                date: rawM.date ? String(rawM.date).trim() : undefined,
                goal: rawM.goal ? String(rawM.goal).trim() : undefined,
              },
            },
          };
        }
      } else if (parsed.action === "set_budget") {
        const budget = Number(parsed.budget);
        if (!Number.isNaN(budget) && budget > 0) {
          const textWithoutBlock = content.replace(FINANCE_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "set_budget",
              budget,
            },
          };
        }
      } else if (parsed.action === "create_category" && parsed.category && typeof parsed.category === "object") {
        const rawC = parsed.category;
        const name = String(rawC.name || "").trim();
        const kind = rawC.kind === "ingreso" ? "ingreso" : "gasto";
        if (name) {
          const textWithoutBlock = content.replace(FINANCE_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "create_category",
              category: {
                name,
                kind,
                icon: rawC.icon ? String(rawC.icon).trim() : undefined,
                colour: rawC.colour ? String(rawC.colour).trim() : undefined,
                budget: rawC.budget ? Number(rawC.budget) : undefined,
              },
            },
          };
        }
      } else if (parsed.action === "add_saving" && parsed.saving && typeof parsed.saving === "object") {
        const rawS = parsed.saving;
        const amount = Number(rawS.amount);
        const name = String(rawS.goal_name || rawS.goal || "").trim();
        if (name && !Number.isNaN(amount) && amount > 0) {
          const textWithoutBlock = content.replace(FINANCE_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "add_saving",
              saving: {
                goal_name: name,
                amount,
                date: rawS.date ? String(rawS.date).trim() : undefined,
                goal_id: rawS.goal_id ? String(rawS.goal_id).trim() : undefined,
              },
            },
          };
        }
      } else if (parsed.action === "remove_movement" && parsed.movement && typeof parsed.movement === "object") {
        const rawM = parsed.movement;
        const textWithoutBlock = content.replace(FINANCE_ACTION_RE, "").trim();
        return {
          text: textWithoutBlock,
          action: {
            action: "remove_movement",
            movement: {
              movement_id: rawM.movement_id ? String(rawM.movement_id).trim() : undefined,
              day: rawM.day ? String(rawM.day).trim() : undefined,
              what: rawM.what ? String(rawM.what).trim() : undefined,
              amount: rawM.amount ? Number(rawM.amount) : undefined,
            },
          },
        };
      } else if (parsed.action === "create_recurring" && parsed.recurring && typeof parsed.recurring === "object") {
        const rawR = parsed.recurring;
        const what = String(rawR.what || "").trim();
        const amount = Number(rawR.amount);
        if (what && !Number.isNaN(amount) && amount > 0) {
          const textWithoutBlock = content.replace(FINANCE_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "create_recurring",
              recurring: {
                what,
                amount,
                type: rawR.type === "ingreso" ? "ingreso" : "gasto",
                frequency: rawR.frequency || "mensual",
                category: rawR.category ? String(rawR.category).trim() : undefined,
                dayOfMonth: rawR.dayOfMonth ? Number(rawR.dayOfMonth) : undefined,
              },
            },
          };
        }
      }
    }
  } catch {
    /* JSON malformado durante streaming; se muestra como texto regular */
  }

  return { text: content, action: null };
}

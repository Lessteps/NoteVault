// Tipos compartidos entre Main (src/core/ y src/api/) y Renderer (src/store/ y src/components/)
// para el Coach Financiero IA, en un archivo aparte sin dependencias externas.

export interface FinanceMovementSummary {
  date: string;
  type: string;
  what: string;
  amount_cents: number;
  category?: string;
}

export interface FinanceContextData {
  currency: string;
  monthLabel: string;
  monthTotals: {
    spent_cents: number;
    income_cents: number;
    saved_cents: number;
    balance_cents: number;
  };
  budget_cents: number;
  pace?: {
    daysElapsed: number;
    totalDays: number;
    dailyAverageCents: number;
    projectedMonthEndCents: number;
    status: "under" | "over" | "on_track";
  };
  categories: Array<{
    name: string;
    kind: "gasto" | "ingreso";
    budget_cents?: number;
    spent_cents?: number;
  }>;
  goals: Array<{
    name: string;
    target_cents: number;
    saved_cents: number;
  }>;
  recurrents: Array<{
    what: string;
    amount_cents: number;
    type: string;
    frequency: string;
  }>;
  movements?: FinanceMovementSummary[];
}

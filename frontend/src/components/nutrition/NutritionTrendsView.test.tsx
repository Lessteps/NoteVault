// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNutrition } from "../../store/nutrition";
import { NutritionTrendsView } from "./NutritionTrendsView";
import type { NutriTrendsData } from "../../lib/nutritionTypes";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const MOCK_TRENDS: NutriTrendsData = {
  daysCount: 7,
  startDate: "2026-10-10",
  endDate: "2026-10-16",
  days: [
    {
      date: "2026-10-15",
      dayLabel: "Jue 15",
      calories: 2150,
      protein: 155,
      carbs: 230,
      fat: 60,
      water_ml: 2500,
      targetCalories: 2200,
      targetProtein: 150,
      adherence: "compliant",
      itemsCount: 4,
    },
    {
      date: "2026-10-16",
      dayLabel: "Vie 16",
      calories: 2210,
      protein: 148,
      carbs: 245,
      fat: 62,
      water_ml: 2000,
      targetCalories: 2200,
      targetProtein: 150,
      adherence: "compliant",
      itemsCount: 5,
    },
  ],
  averages: {
    caloriesPerDay: 2180,
    proteinPerDay: 151.5,
    carbsPerDay: 237.5,
    fatPerDay: 61,
    waterMlPerDay: 2250,
  },
  targets: {
    calories: 2200,
    protein_g: 150,
    carbs_g: 240,
    fat_g: 65,
    water_ml: 2500,
  },
  adherence: {
    loggedDays: 2,
    compliantDays: 2,
    totalDays: 7,
    compliancePct: 100,
  },
  topFoods: [
    {
      name: "Pechuga de pollo",
      count: 4,
      totalAmount: 800,
      totalCalories: 1320,
      totalProtein: 248,
      unit: "g",
    },
    {
      name: "Arroz blanco",
      count: 3,
      totalAmount: 450,
      totalCalories: 585,
      totalProtein: 12.2,
      unit: "g",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  useNutrition.setState({
    trends: MOCK_TRENDS,
    trendsDays: 7,
    loadTrends: vi.fn(),
    setTrendsDays: vi.fn(),
  });
});

afterEach(() => {
  if (root && host) {
    act(() => {
      root!.unmount();
    });
    host.remove();
  }
  host = null;
  root = null;
});

describe("NutritionTrendsView component", () => {
  it("renderiza los 4 KPIs principales de promedio calórico, proteínas, hidratación y adherencia", async () => {
    await act(async () => {
      root!.render(<NutritionTrendsView />);
    });

    expect(host!.textContent).toContain("Analítica de Adherencia y Tendencias");
    expect(host!.textContent).toContain("2180");
    expect(host!.textContent).toContain("kcal/día");
    expect(host!.textContent).toContain("151.5");
    expect(host!.textContent).toContain("g/día");
    expect(host!.textContent).toContain("2.3");
    expect(host!.textContent).toContain("L/día");
    expect(host!.textContent).toContain("100%");
  });

  it("renderiza el gráfico de barras y la meta calórica", async () => {
    await act(async () => {
      root!.render(<NutritionTrendsView />);
    });

    expect(host!.textContent).toContain("Calorías Diarias vs Meta (2200 kcal)");
    expect(host!.textContent).toContain("Meta 2200 kcal");
    expect(host!.textContent).toContain("Jue 15");
    expect(host!.textContent).toContain("Vie 16");
  });

  it("renderiza el ranking de alimentos más consumidos", async () => {
    await act(async () => {
      root!.render(<NutritionTrendsView />);
    });

    expect(host!.textContent).toContain("Alimentos más consumidos en los últimos 7 días");
    expect(host!.textContent).toContain("Pechuga de pollo");
    expect(host!.textContent).toContain("4 veces");
    expect(host!.textContent).toContain("Arroz blanco");
    expect(host!.textContent).toContain("3 veces");
  });

  it("permite cambiar el rango de días llamando a setTrendsDays", async () => {
    const setDaysSpy = vi.fn();
    useNutrition.setState({ setTrendsDays: setDaysSpy });

    await act(async () => {
      root!.render(<NutritionTrendsView />);
    });

    const btn14 = host!.querySelector('[data-testid="range-btn-14"]') as HTMLButtonElement;
    expect(btn14).toBeTruthy();

    await act(async () => {
      btn14.click();
    });

    expect(setDaysSpy).toHaveBeenCalledWith(14);
  });
});

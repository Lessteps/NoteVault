// @vitest-environment jsdom

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/bridge";
import type { MentorPlan } from "../../lib/types";
import { AddToPlanDialog } from "./AddToPlanDialog";

const plan: MentorPlan = {
  id: "2026-10-06_2027-04-05",
  start: "2026-10-06",
  end: "2027-04-05",
  hoursPerWeek: 15,
  structure: "areas",
  areaMode: "phased",
  subplans: [
    {
      id: "s1",
      area: "Frontend",
      areaId: "frontend",
      objective: "UI",
      weeks: [],
      requiredGoals: [],
      groups: [],
      topics: [],
    },
  ],
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z",
};

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });

describe("AddToPlanDialog: flujo de 3 pasos", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    vi.spyOn(api, "mentorPlanFolderCandidates").mockResolvedValue({
      candidates: [
        {
          folder: "Programación/DevOps",
          label: "DevOps",
          role: "area",
          topicCount: 4,
          estMinutes: 240,
        },
      ],
    });

    vi.spyOn(api, "mentorPlanFolderPreview").mockResolvedValue({
      preview: {
        duplicates: [],
        impact: {
          addedTopics: 4,
          addedMinutes: 240,
          weeklyMinutesBefore: 600,
          weeklyMinutesAfter: 720,
          fits: true,
          endDate: "2027-04-05",
          fixOptions: [],
        },
        warnings: [],
        fits: true,
      },
    });

    vi.spyOn(api, "mentorPlanFolderAdd").mockResolvedValue({
      plan,
      review: {
        id: "rev-1",
        kind: "area",
        subplanId: "x-devops",
        subplanName: "DevOps",
        folder: "Programación/DevOps",
        objective: "Dominar DevOps",
        source: "manual",
        addedAt: new Date().toISOString(),
        state: "pending",
        added: [],
        duplicates: [],
        impact: {} as any,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => { root.unmount(); });
    host.remove();
  });

  it("renderiza el diálogo en el paso 1 y lista sugerencias", async () => {
    await act(async () => {
      root.render(<AddToPlanDialog plan={plan} open={true} onClose={vi.fn()} onAdded={vi.fn()} />);
    });
    await flush();

    expect(host.textContent).toContain("Añadir al plan");
    expect(host.textContent).toContain("1. Carpeta");
    expect(host.textContent).toContain("Programación/DevOps");
  });

  it("permite avanzar al paso 2 y luego al paso 3 con cálculo de impacto", async () => {
    const onAdded = vi.fn();
    await act(async () => {
      root.render(
        <AddToPlanDialog
          plan={plan}
          open={true}
          initialFolder="Programación/DevOps"
          onClose={vi.fn()}
          onAdded={onAdded}
        />,
      );
    });
    await flush();

    // Seleccionar y avanzar a paso 2
    const nextBtn = host.querySelector("[data-testid='btn-next-step']") as HTMLButtonElement;
    expect(nextBtn).toBeDefined();
    await act(async () => {
      nextBtn.click();
    });
    await flush();

    expect(host.textContent).toContain("¿Qué es esta carpeta?");
    expect(host.textContent).toContain("Para qué la añado");

    // Calcular impacto -> avanzar a paso 3
    const impactBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Calcular impacto"));
    expect(impactBtn).toBeDefined();

    await act(async () => {
      impactBtn?.click();
    });
    await flush();

    expect(host.textContent).toContain("Impacto en tu ritmo");
    expect(host.textContent).toContain("Suma 4 temas (4 h)");

    // Confirmar adición
    const confirmBtn = host.querySelector("[data-testid='btn-confirm-add']") as HTMLButtonElement;
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn.click();
    });
    await flush();

    expect(api.mentorPlanFolderAdd).toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalled();
  });
});

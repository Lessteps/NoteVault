// @vitest-environment jsdom

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/bridge";
import type { PlanReview, MentorPlan } from "../../lib/types";
import { PlanReviewScreen } from "./PlanReviewScreen";

const plan: MentorPlan = {
  id: "2026-10-06_2027-04-05",
  start: "2026-10-06",
  end: "2027-04-05",
  hoursPerWeek: 15,
  structure: "areas",
  areaMode: "phased",
  subplans: [
    {
      id: "x-devops",
      area: "DevOps",
      areaId: "x-devops",
      objective: "Aprender DevOps",
      weeks: [],
      requiredGoals: [],
      groups: [],
      topics: [],
    },
  ],
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z",
};

const sampleReview: PlanReview = {
  id: "rev-1",
  kind: "area",
  subplanId: "x-devops",
  subplanName: "DevOps",
  folder: "Programación/DevOps",
  objective: "Aprender DevOps",
  source: "auto",
  addedAt: "2026-10-27T00:00:00Z",
  state: "pending",
  added: ["Programación/DevOps/Docker/01 Intro"],
  duplicates: [
    {
      addedTopic: "Programación/DevOps/Docker/01 Intro",
      matchedTopic: "Programación/4 Backend/Docker Intro",
      title: "Docker Intro",
    },
  ],
  impact: {
    addedTopics: 1,
    addedMinutes: 60,
    weeklyMinutesBefore: 600,
    weeklyMinutesAfter: 660,
    fits: true,
    endDate: "2027-04-05",
    fixOptions: [],
  },
};

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });

describe("PlanReviewScreen: pantalla de revisión con 3 salidas", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    vi.spyOn(api, "mentorPlanReviewResolve").mockResolvedValue({
      resolved: true,
      plan,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => { root.unmount(); });
    host.remove();
  });

  it("renderiza objetivo, duplicados e impacto en el ritmo", async () => {
    await act(async () => {
      root.render(
        <PlanReviewScreen
          plan={plan}
          review={sampleReview}
          onResolved={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });
    await flush();

    expect(host.textContent).toContain("Revisar nueva área");
    expect(host.textContent).toContain("DevOps");
    expect(host.textContent).toContain("Impacto en tu ritmo");
    expect(host.textContent).toContain("Posibles temas duplicados detectados");
  });

  it("permite conservar la revisión con el botón 'Conservar'", async () => {
    const onResolved = vi.fn();
    await act(async () => {
      root.render(
        <PlanReviewScreen
          plan={plan}
          review={sampleReview}
          onResolved={onResolved}
          onClose={vi.fn()}
        />,
      );
    });
    await flush();

    const keepBtn = host.querySelector("[data-testid='btn-keep-review']") as HTMLButtonElement;
    expect(keepBtn).toBeDefined();

    await act(async () => {
      keepBtn.click();
    });
    await flush();

    expect(api.mentorPlanReviewResolve).toHaveBeenCalledWith({
      planId: plan.id,
      reviewId: sampleReview.id,
      action: "keep",
      objective: "Aprender DevOps",
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it("permite quitar la revisión del plan tras confirmar", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onResolved = vi.fn();

    await act(async () => {
      root.render(
        <PlanReviewScreen
          plan={plan}
          review={sampleReview}
          onResolved={onResolved}
          onClose={vi.fn()}
        />,
      );
    });
    await flush();

    const removeBtn = host.querySelector("[data-testid='btn-remove-review']") as HTMLButtonElement;
    expect(removeBtn).toBeDefined();

    await act(async () => {
      removeBtn.click();
    });
    await flush();

    expect(window.confirm).toHaveBeenCalled();
    expect(api.mentorPlanReviewResolve).toHaveBeenCalledWith({
      planId: plan.id,
      reviewId: sampleReview.id,
      action: "remove",
    });
    expect(onResolved).toHaveBeenCalled();
  });
});

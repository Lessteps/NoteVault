// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TODAY = "2026-09-30";
const item = (path: string, topic: string, next: string, inDays: number, level = 1) => ({
  path, topic, topicPath: `M/A/${topic}`, subject: "mathematics", subjectFolder: "M",
  next, last: "2026-09-29", level, inDays, skills: ["solve"], practicedDays: 2,
  upcoming: [
    { date: next, interval: 3, level },
    { date: "2026-10-21", interval: 7, level: level + 1 },
    { date: "2026-11-04", interval: 14, level: level + 2 },
    { date: "2026-12-04", interval: 30, level: level + 3 },
  ],
});
const ITEMS = [item("M/Repaso/1.1.md", "1.1 Naturales", "2026-09-30", 0), item("M/Repaso/1.2.md", "1.2 Suma", "2026-10-14", 14)];

const invoke = vi.fn(async (method: string, ..._args: unknown[]) => {
  if (method === "study_reviews_list") return { today: TODAY, items: ITEMS };
  if (method === "study_review_settings") return { enabled: true, hour: 9 };
  if (method === "study_review_reschedule") return ITEMS[0];
  if (method === "study_review_notify_test") return { supported: true, due: 1 };
  return {};
});
(window as unknown as { nv: unknown }).nv = { invoke: (m: string, a: unknown[]) => invoke(m, ...(a ?? [])) };

import { ReviewCalendar, useReviewCalendar } from "./ReviewCalendar";

let container: HTMLDivElement;
let root: Root;
const flush = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  invoke.mockClear();
  act(() => root.render(<ReviewCalendar />));
  act(() => useReviewCalendar.getState().set(true));
  await flush();
});
afterEach(() => {
  act(() => useReviewCalendar.getState().set(false));
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Repaso calendar", () => {
  it("shows every topic with its date, its level and the reviews that follow", () => {
    const text = document.body.textContent ?? "";
    expect(text).toContain("1.1 Naturales");
    expect(text).toContain("1.2 Suma");
    expect(text).toContain("hoy");
    expect(text).toContain("en 14 días");
    expect(text).toContain("Después:");
    expect(text).toContain("21 oct");
    expect(text).toContain("(+7)");
  });

  it("puts the review of each topic on its day in the month grid (the topic number as a chip)", () => {
    const chips = [...document.querySelectorAll("span[draggable=true]")].map((c) => c.textContent);
    expect(chips).toContain("1.1");
  });

  it("moves a review when its date is nudged, and reads the date from the box", async () => {
    const plus = [...document.querySelectorAll("button")].find((b) => b.textContent === "+1 d")!;
    await act(async () => plus.click());
    expect(invoke).toHaveBeenCalledWith("study_review_reschedule", "M/Repaso/1.1.md", "2026-10-01");
    const input = document.querySelector('input[aria-label^="Fecha del repaso"]') as HTMLInputElement;
    expect(input.value).toBe("2026-09-30");
  });

  it("lets you try the Windows notification", async () => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Probar notificación")!;
    await act(async () => btn.click());
    expect(invoke).toHaveBeenCalledWith("study_review_notify_test");
  });
});

import { describe, expect, it } from "vitest";
import type { Issue } from "../../lib/types";
import { planForDay } from "./ProjectToday";

const issue = (o: Partial<Issue>): Issue => ({
  id: o.id ?? "x", number: 1, key: "P-1", type: "Tarea", icon: "", type_colour: "", parent: "", title: "t", status: "Por hacer",
  priority: 2, order: 0, estimate_min: null, labels: [], created: null, start: null, due: null, due_time: "", repeat: "",
  repeat_until: null, in_calendar: false, reminder: null, done_at: null, attachments: [], updated: null, description: "",
  children: [], done: false, overdue: false, linked_folder: "", linked_notes: [], ...o,
});

describe("planForDay", () => {
  const today = "2026-10-05";
  const issues = [
    issue({ id: "late", due: "2026-10-01", overdue: true }),
    issue({ id: "today", due: today }),
    issue({ id: "span", start: "2026-10-04", due: "2026-10-08" }),
    issue({ id: "doing", status: "En progreso" }),
    issue({ id: "later", due: "2026-10-20" }),
    issue({ id: "done", done: true, done_at: `${today}T09:00`, status: "Hecho" }),
    issue({ id: "group", type: "Submeta", children: ["today"] }),
  ];

  it("splits today into overdue, due, under way and done", () => {
    const p = planForDay(issues, today, today, "Por hacer");
    expect(p.overdue.map((i) => i.id)).toEqual(["late"]);
    expect(p.due.map((i) => i.id)).toEqual(["today", "span"]);
    expect(p.underway.map((i) => i.id)).toEqual(["doing"]);
    expect(p.doneOnDay.map((i) => i.id)).toEqual(["done"]);
  });

  it("does not list a submeta that only groups tasks, nor future work", () => {
    const ids = Object.values(planForDay(issues, today, today, "Por hacer")).flat().map((i) => i.id);
    expect(ids).not.toContain("group");
    expect(ids).not.toContain("later");
  });

  it("another day shows only what is dated for it", () => {
    const p = planForDay(issues, "2026-10-20", today, "Por hacer");
    expect(p.due.map((i) => i.id)).toEqual(["later"]);
    expect(p.overdue).toEqual([]);
    expect(p.underway).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { bucketReviews, daysToSunday, dueText, reviewsOfTopics, type ReviewItemLike } from "./planReviews";

const item = (o: Partial<ReviewItemLike> & { topicPath: string; inDays: number }): ReviewItemLike => ({ path: `${o.topicPath}.md`, topic: o.topicPath.split("/").pop()!, next: "2026-10-16", level: 1, skills: ["explain"], ...o });
const topics = [{ folder: "P/4/4.1 HTTP", title: "4.1 HTTP" }, { folder: "P/4/4.2 REST", title: "4.2 REST" }];

describe("repasos del plan", () => {
  it("días hasta el domingo (viernes 16 de octubre → 2)", () => {
    expect(daysToSunday("2026-10-16")).toBe(2);
    expect(daysToSunday("2026-10-18")).toBe(0);
    expect(daysToSunday("2026-10-12")).toBe(6);
  });

  it("une los repasos con los temas del plan, ignora el vocabulario y lo que no es del plan, y ordena por fecha", () => {
    const rows = reviewsOfTopics(topics, [
      item({ topicPath: "P/4/4.2 REST", inDays: 3, next: "2026-10-19" }),
      item({ topicPath: "P/4/4.1 HTTP/sub", inDays: -2, next: "2026-10-14" }),
      item({ topicPath: "P/9/9.9 Otro", inDays: 0 }),
      item({ topicPath: "P/4/4.1 HTTP", inDays: 0, kind: "vocab", path: "voc.md" }),
    ]);
    expect(rows.map((r) => [r.title, r.inDays])).toEqual([["4.1 HTTP", -2], ["4.2 REST", 3]]);
    expect(rows[0]!.folder).toBe("P/4/4.1 HTTP");
  });

  it("reparte en vencidos u hoy, esta semana, la próxima y después", () => {
    const mk = (inDays: number) => ({ path: `${inDays}.md`, folder: "f", title: `t${inDays}`, next: "", inDays, level: 1, skills: [] });
    const b = bucketReviews([mk(-5), mk(0), mk(1), mk(2), mk(3), mk(9), mk(10), mk(30)], "2026-10-16");
    expect(b.today.map((r) => r.inDays)).toEqual([-5, 0]);
    expect(b.week.map((r) => r.inDays)).toEqual([1, 2]);
    expect(b.nextWeek.map((r) => r.inDays)).toEqual([3, 9]);
    expect(b.later.map((r) => r.inDays)).toEqual([10, 30]);
  });

  it("escribe cuándo toca", () => {
    expect(dueText(-3)).toBe("Vencido hace 3 días");
    expect(dueText(-1)).toBe("Vencido desde ayer");
    expect(dueText(0)).toBe("Hoy");
    expect(dueText(1)).toBe("Mañana");
    expect(dueText(4)).toBe("En 4 días");
  });
});

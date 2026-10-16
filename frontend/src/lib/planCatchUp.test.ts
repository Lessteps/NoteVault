import { describe, expect, it } from "vitest";
import { catchUpOf } from "./planCatchUp";
import { planGateByArea } from "./planGate";

const t = (folder: string, done = false, subplanId = "be") => ({ folder, done, subplanId });

describe("planGateByArea: cada área avanza por su ruta", () => {
  it("un día pendiente de Frontend no bloquea Backend", () => {
    const g = planGateByArea([
      { date: "2026-10-06", topics: [t("fe1", false, "fe")] },
      { date: "2026-10-07", topics: [t("be1", false, "be"), t("fe2", false, "fe")] },
      { date: "2026-10-08", topics: [t("be2", false, "be")] },
    ]);
    expect(g.frontier).toBe("2026-10-06");
    expect(g.locked.has("be1")).toBe(false);
    expect(g.locked.has("be2")).toBe(true);
    expect(g.locked.get("fe2")).toBe("2026-10-06");
  });

  it("los primeros temas del área quedan abiertos aunque el calendario ya vaya por otro día", () => {
    const g = planGateByArea([
      { date: "2026-10-06", topics: [t("a")] },
      { date: "2026-10-16", topics: [t("z")] },
    ]);
    expect(g.byArea.get("be")!.frontier).toBe("2026-10-06");
    expect([...g.locked.keys()]).toEqual(["z"]);
  });

  it("un tema repartido en varias áreas solo se bloquea si lo está en todas", () => {
    const g = planGateByArea([
      { date: "2026-10-06", topics: [t("x", false, "be")] },
      { date: "2026-10-07", topics: [t("base", false, "be"), t("base", false, "fe"), t("y", false, "fe")] },
    ]);
    expect(g.locked.has("base")).toBe(false);
    expect(g.locked.has("y")).toBe(false);
  });
});

describe("catchUpOf: aviso de constancia", () => {
  const d = (date: string, ...topics: Array<[string, boolean]>) => ({ date, study: true, topics: topics.map(([folder, done]) => ({ folder, title: folder, minutes: 60, done, area: "Backend" })) });
  it("cuenta lo atrasado y el ritmo necesario", () => {
    const c = catchUpOf([d("2026-10-06", ["a", true]), d("2026-10-07", ["b", false]), d("2026-10-08", ["c", false]), d("2026-10-09", ["d", false]), d("2026-10-10", ["e", false])], "2026-10-08", "2026-10-10");
    expect(c.late.map((x) => x.folder)).toEqual(["b"]);
    expect(c.remaining).toBe(4);
    expect(c.daysLeft).toBe(3);
    expect(c.perDay).toBe(1.3);
    expect(c.minutesPerDay).toBe(80);
  });
  it("sin atraso no hay temas tarde", () => {
    const c = catchUpOf([d("2026-10-06", ["a", false])], "2026-10-06", "2026-10-30");
    expect(c.late).toEqual([]);
  });
});

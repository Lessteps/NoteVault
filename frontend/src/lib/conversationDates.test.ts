import { describe, expect, it } from "vitest";
import { groupByDate, matchesQuery, parseLocal, whenLabel } from "./conversationDates";

const now = new Date(2026, 8, 28, 15, 0, 0); // Monday 28 Sep 2026, 15:00 local
const item = (id: string, updated_at: string) => ({ id, updated_at });

describe("history date groups", () => {
  it("splits today, yesterday, last week and older", () => {
    const groups = groupByDate(
      [
        item("hoy", "2026-09-28T09:30:00"),
        item("ayer", "2026-09-27T22:10:00"),
        item("finde", "2026-09-22T11:00:00"),
        item("viejo", "2026-08-30T11:00:00"),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["Hoy", "Ayer", "Semana pasada", "Anteriores"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["hoy"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["ayer"]);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(["finde"]);
    expect(groups[3]!.items.map((i) => i.id)).toEqual(["viejo"]);
  });

  it("drops empty groups and keeps the incoming order", () => {
    const groups = groupByDate([item("b", "2026-09-28T14:00:00"), item("a", "2026-09-28T08:00:00")], now);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Hoy");
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("puts an unparseable stamp in Anteriores instead of dropping it", () => {
    const groups = groupByDate([item("raro", "")], now);
    expect(groups[0]!.label).toBe("Anteriores");
    expect(groups[0]!.items).toHaveLength(1);
  });
});

describe("history labels", () => {
  it("shows the time today, 'ayer HH:MM' and dd/mm before that", () => {
    expect(whenLabel("2026-09-28T09:05:00", now)).toBe("09:05");
    expect(whenLabel("2026-09-27T21:07:00", now)).toBe("ayer 21:07");
    expect(whenLabel("2026-08-30T11:00:00", now)).toBe("30/08");
    expect(whenLabel("basura", now)).toBe("");
  });

  it("parses the local stamp the app writes", () => {
    const d = parseLocal("2026-09-28T03:22:11");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(28);
    expect(d?.getHours()).toBe(3);
    expect(parseLocal("")).toBeNull();
  });
});

describe("history search", () => {
  it("matches without accents or case", () => {
    expect(matchesQuery("Derivadas y regla de la cadena", "cadena")).toBe(true);
    expect(matchesQuery("Funciones trigonométricas", "trigonometricas")).toBe(true);
    expect(matchesQuery("Derivadas", "integrales")).toBe(false);
    expect(matchesQuery("cualquiera", "   ")).toBe(true);
  });
});

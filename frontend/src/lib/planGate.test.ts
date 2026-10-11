import { describe, expect, it } from "vitest";
import { planGate } from "./planGate";

const day = (date: string, ...topics: Array<[string, boolean]>) => ({ date, topics: topics.map(([folder, done]) => ({ folder, done })) });

describe("planGate: la ruta no avanza sin cerrar el día pendiente", () => {
  it("con todo hecho no hay frente ni bloqueos", () => {
    const g = planGate([day("2026-10-06", ["a", true]), day("2026-10-07", ["b", true])]);
    expect(g.frontier).toBeNull();
    expect(g.locked.size).toBe(0);
  });

  it("un día a medias bloquea todo lo repartido después", () => {
    const g = planGate([day("2026-10-06", ["a", true], ["b", false]), day("2026-10-07", ["c", false]), day("2026-10-08", ["d", false])]);
    expect(g.frontier).toBe("2026-10-06");
    expect(g.blockers).toEqual(["b"]);
    expect([...g.locked.keys()]).toEqual(["c", "d"]);
    expect(g.locked.get("c")).toBe("2026-10-06");
  });

  it("al terminar el día se desbloquea el siguiente, y solo ese", () => {
    const g = planGate([day("2026-10-06", ["a", true], ["b", true]), day("2026-10-07", ["c", false]), day("2026-10-08", ["d", false])]);
    expect(g.frontier).toBe("2026-10-07");
    expect([...g.locked.keys()]).toEqual(["d"]);
  });

  it("un tema que se parte en varios días no se bloquea a sí mismo y el estado en vivo cuenta", () => {
    const g = planGate([day("2026-10-06", ["a", false]), day("2026-10-07", ["a", false], ["b", false])], (f) => f === "b");
    expect(g.frontier).toBe("2026-10-06");
    expect(g.locked.size).toBe(0);
  });

  it("no depende del orden de entrada de los días", () => {
    const g = planGate([day("2026-10-08", ["d", false]), day("2026-10-06", ["a", false])]);
    expect(g.frontier).toBe("2026-10-06");
    expect(g.locked.has("d")).toBe(true);
  });
});

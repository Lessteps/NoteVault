import { describe, expect, it } from "vitest";
import { blockMessage, confirmMessage, impactedPlans, planImpact, structuralOfAction, structureBadge, STRUCTURE_BADGE, type PlanLike } from "./planImpact";

const topics = (...f: string[]) => f.map((folder) => ({ folder }));
const plan = (over: Partial<PlanLike> = {}): PlanLike => ({
  id: "p1",
  name: "Full stack",
  subplans: [
    { id: "s1", area: "Backend", topics: topics("Programación/1 Fundamentals/1.1 A", "Programación/1 Fundamentals/1.2 B", "Programación/3 API/3.1 C") },
    { id: "s2", area: "Databases", topics: topics("Programación/6 Databases/6.1 D") },
  ],
  ...over,
});

describe("planImpact", () => {
  it("cuenta planes, áreas y temas dentro del objetivo", () => {
    const [i] = impactedPlans({ space: "Programación", area: "1 Fundamentals" }, [plan()]);
    expect(i).toMatchObject({ planId: "p1", planName: "Full stack", topics: 2, areas: [{ subplanId: "s1", area: "Backend", topics: 2 }] });
    const [whole] = impactedPlans({ space: "Programación" }, [plan()]);
    expect(whole!.topics).toBe(4);
    expect(whole!.areas.map((a) => a.area)).toEqual(["Backend", "Databases"]);
  });

  it("no hay impacto si el objetivo no está en ninguna ruta", () => {
    expect(planImpact("add_topics", { space: "Inglés" }, [plan()])).toEqual({ impacted: [], blocked: false, reason: "" });
    expect(planImpact("add_space", { space: "Programación 2" }, [plan()]).impacted).toEqual([]);
    // un prefijo parecido no cuenta
    expect(impactedPlans({ space: "Programación", area: "1 Fund" }, [plan()])).toEqual([]);
  });

  it("ignora planes archivados, terminados o propuestos", () => {
    const plans = [plan({ archived: true }), plan({ id: "p2", status: "terminado" }), plan({ id: "p3", status: "propuesto" }), plan({ id: "p4", status: "activo" })];
    expect(impactedPlans({ space: "Programación" }, plans).map((i) => i.planId)).toEqual(["p4"]);
  });

  it("añadir solo avisa; renombrar, quitar o mover un tema de la ruta se bloquea", () => {
    const target = { space: "Programación", area: "1 Fundamentals", topic: "1.1 A" };
    expect(planImpact("add_topics", target, [plan()]).blocked).toBe(false);
    for (const kind of ["rename_topic", "remove_topic", "move_topic"] as const) {
      const r = planImpact(kind, target, [plan()]);
      expect(r.blocked).toBe(true);
      expect(r.reason).toContain("está en el plan «Full stack»");
      expect(r.reason).toContain("ajústalo desde el Mentor");
    }
    // un tema que no está en ninguna ruta se puede renombrar
    expect(planImpact("rename_topic", { space: "Programación", area: "9 Otra", topic: "9.1" }, [plan()]).blocked).toBe(false);
  });

  it("redacta la confirmación con el plan, el área y los temas", () => {
    const r = planImpact("add_topics", { space: "Programación", area: "1 Fundamentals" }, [plan()]);
    expect(confirmMessage("add_topics", r.impacted)).toBe(
      "Esta acción cambia la ruta del plan «Full stack» (área Backend, 2 temas): los temas nuevos entran al final de la ruta del área, " +
        "el cronograma se recalcula solo según tu progreso y nada de lo ya hecho cambia.",
    );
    expect(blockMessage("remove_topic", { space: "P", area: "A", topic: "T" }, r.impacted)).toContain("No se puede quitar «T»");
  });

  it("reconoce las acciones del chat que añaden temas", () => {
    expect(structuralOfAction({ action: "create_syllabus", args: { subject: "Programación" } })).toMatchObject({ kind: "add_topics", target: { space: "Programación" } });
    expect(structuralOfAction({ action: "create_topic", args: { area: "Programación/1 Fundamentals", topic: { name: "1.9 X" } } })).toMatchObject({
      kind: "add_topics",
      target: { space: "Programación", area: "1 Fundamentals" },
    });
    expect(structuralOfAction({ action: "create_canvas", args: {} })).toBeNull();
    expect(structuralOfAction({ action: "set_practice_plan", args: { topic: "A/B/C" } })).toBeNull();
  });

  it("la etiqueta del menú avisa solo cuando hay un plan afectado", () => {
    expect(structureBadge(null)).toBe(STRUCTURE_BADGE);
    expect(structureBadge([])).toBe(STRUCTURE_BADGE);
    expect(structureBadge(impactedPlans({ space: "Programación" }, [plan()]))).toBe("Cambia la ruta · Afecta al plan «Full stack»");
  });
});

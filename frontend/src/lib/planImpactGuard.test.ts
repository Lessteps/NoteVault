// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDialog } from "../components/ui";
import { defaultGuardDeps, guardStructural, type GuardDeps } from "./planImpactGuard";
import type { PlanLike } from "./planImpact";

const plans: PlanLike[] = [{ id: "p1", name: "Full stack", subplans: [{ id: "s1", area: "Backend", topics: [{ folder: "Prog/1 Fund/1.1 A" }, { folder: "Prog/1 Fund/1.2 B" }] }] }];
const deps = (over: Partial<GuardDeps> = {}): GuardDeps => ({
  ...defaultGuardDeps,
  loadPlans: async () => plans,
  note: vi.fn(async () => undefined),
  bump: vi.fn(),
  toast: vi.fn(),
  ...over,
});
const tick = () => new Promise((ok) => setTimeout(ok, 0));

beforeEach(() => useDialog.getState().set(null));

describe("guardStructural", () => {
  it("sin planes afectados deja pasar sin preguntar", async () => {
    const d = deps();
    const g = await guardStructural("add_topics", { space: "Inglés" }, "x", d);
    expect(g.ok).toBe(true);
    expect(useDialog.getState().req).toBeNull();
    await g.commit();
    expect(d.note).not.toHaveBeenCalled();
    expect(d.bump).not.toHaveBeenCalled();
  });

  it("muestra el diálogo y solo sigue con «Continuar»", async () => {
    const d = deps();
    const pending = guardStructural("add_topics", { space: "Prog", area: "1 Fund" }, "Temario de Prog", d);
    await tick();
    const req = useDialog.getState().req!;
    expect(req.kind).toBe("confirm");
    expect(req.confirmLabel).toBe("Continuar");
    expect(req.message).toContain("Esta acción cambia la ruta del plan «Full stack» (área Backend, 2 temas)");
    req.resolve(false);
    const g = await pending;
    expect(g.ok).toBe(false);
    await g.commit();
    expect(d.note).not.toHaveBeenCalled();
    expect(d.bump).not.toHaveBeenCalled();
  });

  it("al continuar, commit anota en la bitácora del plan y sube planVersion", async () => {
    const d = deps();
    const pending = guardStructural("add_topics", { space: "Prog" }, "Temario de Prog", d);
    await tick();
    useDialog.getState().req!.resolve(true);
    const g = await pending;
    expect(g.ok).toBe(true);
    expect(d.note).not.toHaveBeenCalled(); // todavía no: la acción no se ha hecho
    await g.commit();
    expect(d.note).toHaveBeenCalledWith("p1", "Chat de notas: Temario de Prog", expect.stringContaining("área Backend, 2 temas"));
    expect(d.bump).toHaveBeenCalledTimes(1);
  });

  it("bloquea renombrar o quitar un tema de la ruta, sin diálogo", async () => {
    const d = deps();
    for (const kind of ["rename_topic", "remove_topic"] as const) {
      const g = await guardStructural(kind, { space: "Prog", area: "1 Fund", topic: "1.1 A" }, "x", d);
      expect(g.ok).toBe(false);
    }
    expect(useDialog.getState().req).toBeNull();
    expect(d.toast).toHaveBeenCalledWith("error", expect.stringContaining("ajústalo desde el Mentor"));
  });

  it("si no se pueden leer los planes no estorba", async () => {
    const g = await guardStructural("add_topics", { space: "Prog" }, "x", deps({ loadPlans: async () => Promise.reject(new Error("x")) }));
    expect(g.ok).toBe(true);
  });
});

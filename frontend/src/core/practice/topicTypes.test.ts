// Fase 1 · el plan de tipos de tema sobre el vault real (dry run por defecto):
//
//   NV_VAULT="C:/PROGRAMMING" npx vitest run src/core/practice/topicTypes.test.ts
//   NV_VAULT="C:/PROGRAMMING" NV_APPLY=1 npx vitest run src/core/practice/topicTypes.test.ts
//
// Imprime la tabla (tema · tipo · de dónde sale · skills antes → después) y comprueba
// lo que pidió el usuario: ningún tema teórico se queda con cálculo rápido.

import { describe, expect, it } from "vitest";
import { applyTopicTypes } from "../../../tools/study_topic_types.js";

const vault = process.env.NV_VAULT ?? "";
const apply = process.env.NV_APPLY === "1";

(vault ? describe : describe.skip)("tipos de tema · vault real", () => {
  it("planifica, aplica y deja el vault idempotente", () => {
    const first = applyTopicTypes(vault, apply);
    process.stdout.write(`\nplanes: ${first.plan.length} · escritos: ${first.written.length}${apply ? "" : " (dry run)"}\n`);
    for (const item of first.plan) {
      const delta = item.action === "none" ? "sin cambios" : `${item.skillsBefore.length} → ${item.skillsAfter.length} skills`;
      process.stdout.write(
        `  ${item.type.padEnd(12)} ${item.action.padEnd(18)} ${delta.padEnd(20)} ${item.title}  [${item.source}: ${item.why}]\n`,
      );
    }

    expect(first.plan.length).toBeGreaterThan(0);
    for (const item of first.plan) {
      expect(["theoretical", "procedural", "mixed"]).toContain(item.type);
      // Un tema teórico nunca ofrece cálculo rápido.
      if (item.type === "theoretical") expect(item.skillsAfter).not.toContain("drill");
      if (item.type === "procedural") expect(item.skillsAfter).not.toContain("prove");
    }

    // La segunda pasada no tiene nada que hacer (idempotencia).
    const second = applyTopicTypes(vault, false);
    const pending = second.plan.filter((p) => p.action !== "none");
    process.stdout.write(`pendientes tras la primera pasada: ${pending.length}\n`);
    if (apply) expect(pending).toEqual([]);
  }, 300_000);
});

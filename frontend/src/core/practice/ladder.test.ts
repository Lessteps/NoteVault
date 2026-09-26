import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  availableLevels,
  buildLadderMessages,
  checkOrder,
  hiddenSteps,
  isProofFrontmatter,
  ladderNote,
  ladderState,
  localOrderResult,
  nextLevel,
  parseProof,
  PASS_SCORE,
  passed,
  proofMarkdown,
  rubricFor,
  shuffledOrder,
} from "./ladder.js";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const PROOFS_DIR = path.join(
  REPO_ROOT,
  "docs/knowledge_base/examples/Matemáticas/1 Lógica y demostración/1.10 Inducción matemática/Demostraciones"
);

function getProofPaths(): string[] {
  return fs
    .readdirSync(PROOFS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => path.join(PROOFS_DIR, f));
}

describe("ladder - proof parsing", () => {
  it("parses example proof notes", () => {
    const paths = getProofPaths();
    expect(paths.length).toBeGreaterThanOrEqual(2);

    for (const p of paths) {
      const text = fs.readFileSync(p, "utf-8");
      const proof = parseProof(text, p);
      expect(isProofFrontmatter(proof.frontmatter)).toBe(true);
      expect(proof.note_id.startsWith("mat.logica.induccion.t")).toBe(true);
      expect(proof.statement).toBeTruthy();
      expect(proof.strategy).toBeTruthy();
      expect(proof.key_idea).toBeTruthy();
      expect(proof.hypotheses.length).toBeGreaterThanOrEqual(1);
      expect(proof.steps.length).toBeGreaterThanOrEqual(3);

      for (const step of proof.steps) {
        expect(step.text).toBeTruthy();
        expect(step.why).toBeTruthy();
        expect(step.text).not.toContain("**Paso");
        expect(step.text).not.toContain("Por qué");
      }

      expect(proof.variants.length).toBeGreaterThanOrEqual(2);
      expect(ladderNote(text, p)).not.toBeNull();
      expect(availableLevels(proof)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it("checks first proof details", () => {
    const paths = getProofPaths();
    const t01Path = paths.find((p) => p.includes("T01"))!;
    const proof = parseProof(fs.readFileSync(t01Path, "utf-8"), t01Path);

    expect(proof.steps.length).toBe(6);
    expect(proof.steps[1]!.text).toContain("P(1)");
    expect(proof.steps[1]!.why).toContain("caso base");
    expect(proof.variants.length).toBe(3);
  });

  it("handles tolerant formats", () => {
    const text =
      "---\ntype: theorem\nid: t.x\n---\n# T\n## Enunciado\nA.\n## Prueba\n" +
      "1. Primer paso. *Por qué:* uno.\n2. **Paso 2**: segundo.\n   Justificación: dos.\n" +
      "3. Tercero sin justificación.\n";
    const proof = parseProof(text);
    expect(proof.steps.map((s) => s.text)).toEqual([
      "Primer paso.",
      "segundo.",
      "Tercero sin justificación.",
    ]);
    expect(proof.steps.map((s) => s.why)).toEqual(["uno.", "dos.", ""]);
    expect(availableLevels(proof)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns null for unparseable or other notes", () => {
    expect(ladderNote("---\ntype: theorem\n---\n## Demostración\nTexto.\n")).toBeNull();
    expect(ladderNote("---\ntype: concept\n---\n## Demostración\n1. a\n2. b\n")).toBeNull();
    expect(ladderNote("# sin frontmatter\n1. a\n2. b\n")).toBeNull();
  });
});

describe("ladder - logic and progression", () => {
  it("checks local order", () => {
    const n = 6;
    const identity = Array.from({ length: n }, (_, i) => i);
    expect(checkOrder(identity)).toEqual([true, true, true, true, true, true]);

    const good = localOrderResult(identity);
    expect(good.score).toBe(100);
    expect(passed(good.score)).toBe(true);

    const swapped = [0, 1, 3, 2, 4, 5];
    expect(checkOrder(swapped)).toEqual([true, true, false, false, true, true]);

    const bad = localOrderResult(swapped);
    expect(bad.score).toBeLessThan(PASS_SCORE);
    expect(passed(bad.score)).toBe(false);
    expect(bad.errors[0]!.category).toBe("logical");
  });

  it("ensures shuffle is never identity and selects hidden steps", () => {
    for (let seed = 0; seed < 30; seed++) {
      const order = shuffledOrder(6, seed);
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(order).not.toEqual([0, 1, 2, 3, 4, 5]);

      const hidden = hiddenSteps(6, seed);
      expect(hidden.length).toBe(3);
      expect(hidden.every((i) => i >= 0 && i < 6)).toBe(true);
    }
  });

  it("handles unlock and drop progression", () => {
    expect(nextLevel(1, 1, true, 6)).toBe(2);
    expect(nextLevel(3, 3, true, 6)).toBe(4);
    expect(nextLevel(6, 6, true, 6)).toBe(6);
    expect(nextLevel(4, 2, true, 6)).toBe(4);
    expect(nextLevel(4, 4, false, 6)).toBe(3);
    expect(nextLevel(1, 1, false, 6)).toBe(1);
    expect(nextLevel(5, 2, false, 6)).toBe(1);
  });

  it("replays attempts in ladder state", () => {
    const atts = [
      { mode: "proof_L1", score: 90 },
      { mode: "proof_L2", score: 100 },
      { mode: "proof_L3", score: 80 },
      { mode: "proof_L4", score: 30 },
      { mode: "prove", score: 100 },
    ];
    const state = ladderState(atts, 6);
    expect(state.current).toBe(3);
    expect(Array.from(state.passed).sort()).toEqual([1, 2, 3]);
    expect(state.unlocked(3)).toBe(true);
    expect(state.unlocked(4)).toBe(false);
    expect(state.count[4]).toBe(1);

    const seen = ladderState([{ mode: "proof_L1", score: 100, solution_seen: true }], 5);
    expect(seen.current).toBe(1);
  });

  it("builds ladder messages carrying proof as model", () => {
    const paths = getProofPaths();
    const proof = parseProof(fs.readFileSync(paths[0]!, "utf-8"), paths[0]!);
    const rubric = rubricFor(proof, 4);
    expect(rubric.length).toBe(proof.steps.length);

    const msgs = buildLadderMessages(proof, 4, "respuesta", {
      rubric,
      shown: proofMarkdown(proof, false),
      seconds: 65,
      solution_seen: false,
      recent_errors: [],
    });
    expect(msgs[0]!.content).toContain("JSON");
    expect(msgs[1]!.content).toContain(proof.steps[1]!.why);
    expect(msgs[1]!.content).toContain("respuesta");
  });
});

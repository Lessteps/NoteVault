import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outdatedByFolder } from "./skillFreshness.js";

let root: string;
const put = (rel: string, text: string, ageMs = 0): void => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(abs, t, t);
};
const TOPIC = "Matemáticas/4 Backend/4.1 What the backend is";
const DAY = 86_400_000;

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "nv-skill-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("outdatedByFolder", () => {
  it("marca la pieza hecha antes del último cambio de su skill, y solo esa", () => {
    put("Matemáticas/_skills/resumen_teorico_skill.md", "v1", DAY);
    put("Matemáticas/_skills/mapa_skill.md", "v1", 3 * DAY);
    put(`${TOPIC}/4.1 What the backend is.md`, "nota", 2 * DAY);
    put(`${TOPIC}/4.1 What the backend is — mapa.canvas`, "{}", DAY / 2);
    expect(outdatedByFolder(root, [TOPIC]).get(TOPIC)).toEqual({ theory: true });
  });

  it("ve cuando cambia el texto de la skill y se quita al regenerar la pieza", () => {
    put("Matemáticas/_skills/resumen_teorico_skill.md", "v1", 5 * DAY);
    put(`${TOPIC}/4.1 What the backend is.md`, "nota", 4 * DAY);
    expect(outdatedByFolder(root, [TOPIC]).size).toBe(0);
    put("Matemáticas/_skills/resumen_teorico_skill.md", "v2");
    expect(outdatedByFolder(root, [TOPIC]).get(TOPIC)).toEqual({ theory: true });
    put(`${TOPIC}/4.1 What the backend is.md`, "nota nueva");
    expect(outdatedByFolder(root, [TOPIC]).size).toBe(0);
  });

  it("tocar la skill sin cambiar su texto no marca nada", () => {
    put("Matemáticas/_skills/resumen_teorico_skill.md", "v1", 5 * DAY);
    put(`${TOPIC}/4.1 What the backend is.md`, "nota", DAY);
    outdatedByFolder(root, [TOPIC]);
    put("Matemáticas/_skills/resumen_teorico_skill.md", "v1");
    expect(outdatedByFolder(root, [TOPIC]).size).toBe(0);
  });
});

describe("notas demasiado pesadas", () => {
  const body = (n: number): string => `# 2.1.1 X\n\n## Requires\n*No prerequisites.*\n\n## Explanation\n\n### What it is\n**In one sentence.** ${"word ".repeat(n)}\n\n### Mental model\n**In the practice:** x\n\n## Examples\n**How you will apply it:** x\n\n## Common mistakes\nx\n`;
  it("una nota de Programación con la explicación pasada del límite sale como desactualizada; una corta, no", () => {
    const heavy = "Programación/2.1 Python/2.1.1 X", light = "Programación/2.1 Python/2.1.2 Y";
    put(`${heavy}/2.1.1 X.md`, body(700));
    put(`${light}/2.1.2 Y.md`, body(100));
    const out = outdatedByFolder(root, [heavy, light]);
    expect(out.get(heavy)).toMatchObject({ theory: true });
    expect(out.has(light)).toBe(false);
  });
});

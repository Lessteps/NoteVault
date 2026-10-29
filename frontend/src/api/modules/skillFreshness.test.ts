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

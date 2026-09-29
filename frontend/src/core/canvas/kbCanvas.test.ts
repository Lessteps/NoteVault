// Knowledge-base concept maps (tools/kb_canvas.ts).
//
// The map of a concept has exactly four panels and none of the old defects:
// panels sized to their whole text, no group overlapping another, every arrow
// labelled, and a manifest that protects a canvas the user edited.
//
// Set KB_CANVAS_FOLDER to a real concept folder to generate it from a test run:
//
//   KB_CANVAS_FOLDER="C:/PROGRAMMING/Matemáticas/<area>/<concept>" \
//     npx vitest run src/core/canvas/kbCanvas.test.ts

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildConceptCanvas,
  findConceptFolders,
  findNote,
  findVaultRoot,
  generateAll,
  generateConcept,
  readConcept,
  verifyCanvas,
  writeGenerated,
} from "../../../tools/kb_canvas";
import { requiredTextHeight } from "./boxSizing";

const tmpRoots: string[] = [];
afterAll(() => {
  for (const r of tmpRoots) fs.rmSync(r, { recursive: true, force: true });
});

const CONCEPT_NOTE = `---
id: mat.prueba
title: Concepto de prueba
number: "1.9"
area: "1 Aritmética elemental y operativa"
subject: mathematics
prerequisites: []
status: draft
---

# 1.9 Concepto de prueba

## Requiere
- [[1.2 Suma y resta de enteros]] — operar respetando signos

## Explicación

### Qué es
Definición formal del concepto de prueba, con su notación.

### Modelo mental
La recta numérica como cinta métrica: cada paso a la derecha suma uno.

## Ejemplos

### Ejemplo 1 — Caso sencillo
- **Contexto:** partir de dos valores conocidos.
- **Caso:** comparar los dos valores.
- **Resultado esperado:** el menor es el que está más a la izquierda.
- **Por qué funciona:** el orden se decide con el signo de la diferencia.

### Ejemplo 2 — Caso con negativos
- **Contexto:** una deuda frente a un saldo.
- **Caso:** comparar -8 con -3.
- **Resultado esperado:** -8 < -3.
- **Por qué funciona:** la diferencia es positiva.

## Errores comunes

### Error 1 — Confundir magnitud con orden
- **Error:** escribir -10 > -2.
- **Síntoma:** los negativos salen al revés.
- **Causa:** se aplica la regla de los positivos.
- **Solución:** mirar la recta numérica.

## Tarjetas

### T1 · definicion
**P:** ¿Qué es el concepto de prueba?
**R:** Una definición.
`;

/** Temp vault with a prerequisite note and a concept note. */
function makeVault(conceptNote = CONCEPT_NOTE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kbcanvas-"));
  tmpRoots.push(root);
  fs.mkdirSync(path.join(root, ".notevault", "estudio"), { recursive: true });
  const concepto = path.join(root, "Matemáticas", "1 Aritmética elemental y operativa", "1.9 Concepto de prueba");
  const prereq = path.join(root, "Matemáticas", "1 Aritmética elemental y operativa", "1.2 Suma y resta de enteros");
  fs.mkdirSync(concepto, { recursive: true });
  fs.mkdirSync(prereq, { recursive: true });
  fs.writeFileSync(path.join(concepto, "1.9 Concepto de prueba.md"), conceptNote, "utf-8");
  fs.writeFileSync(path.join(prereq, "1.2 Suma y resta de enteros.md"), "---\nnumber: \"1.2\"\n---\n\n# 1.2\n", "utf-8");
  return { root, concepto, prereq };
}

describe("readConcept", () => {
  it("reads the four panels of the new note schema", () => {
    const { root, concepto } = makeVault();
    const c = readConcept(concepto, root);
    expect(c.number).toBe("1.9");
    expect(c.prerequisites).toHaveLength(1);
    expect(c.prerequisites[0]?.reason).toBe("operar respetando signos");
    expect(c.prerequisites[0]?.note).toBe("Matemáticas/1 Aritmética elemental y operativa/1.2 Suma y resta de enteros/1.2 Suma y resta de enteros.md");
    expect(c.queEs).toContain("Definición formal");
    expect(c.modeloMental).toContain("cinta métrica");
    expect(c.examples).toHaveLength(2);
    expect(c.examples[0]?.fields.map((f) => f.label)).toEqual(["Contexto", "Caso", "Resultado esperado", "Por qué funciona"]);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]?.fields.map((f) => f.label)).toEqual(["Error", "Síntoma", "Causa", "Solución"]);
    expect(c.warnings).toEqual([]);
  });

  it("warns when the mandatory sections are missing", () => {
    const { root, concepto } = makeVault("---\nnumber: \"1.9\"\n---\n\n# 1.9\n\n## Otra cosa\nnada\n");
    const c = readConcept(concepto, root);
    expect(c.warnings.join(" | ")).toContain('falta la sección "## Requiere"');
    expect(c.warnings.join(" | ")).toContain('falta "### Modelo mental"');
  });

  it("accepts an explicit 'Sin prerrequisitos'", () => {
    const note = CONCEPT_NOTE.replace(
      "- [[1.2 Suma y resta de enteros]] — operar respetando signos",
      "*Sin prerrequisitos.*",
    );
    const { root, concepto } = makeVault(note);
    const c = readConcept(concepto, root);
    expect(c.prerequisites).toEqual([]);
    expect(c.warnings).toEqual([]);
  });
});

describe("buildConceptCanvas", () => {
  it("produces a canvas with no geometric problem at all", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    expect(verifyCanvas(doc)).toEqual([]);
  });

  it("gives the four panels their own groups and one panel per example and error", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    const labels = doc.nodes.filter((n) => n.type === "group").map((g) => g.label);
    expect(labels).toContain("Requiere");
    expect(labels).toContain("Explicación");
    expect(labels).toContain("Ejemplos");
    expect(labels).toContain("Errores comunes");
    expect(labels).toContain("Ejemplo 1 — Caso sencillo");
    expect(labels).toContain("Error 1 — Confundir magnitud con orden");
    // one panel per example field (8 with two examples), one panel per error
    expect(doc.nodes.filter((n) => n.type === "text" && (n.text ?? "").startsWith("### ")).length).toBe(8);
    const errorPanel = doc.nodes.find((n) => n.type === "text" && (n.text ?? "").includes("- **Solución:**"));
    expect(errorPanel).toBeDefined();
    expect(errorPanel?.text).toContain("- **Error:**");
  });

  it("sizes every panel to its whole text", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    for (const n of doc.nodes.filter((x) => x.type === "text")) {
      expect(n.height).toBeGreaterThanOrEqual(Math.ceil(requiredTextHeight(n.text ?? "", n.width)) - 1);
    }
  });

  it("labels every arrow with a reason, never with an empty string", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    expect(doc.edges.length).toBeGreaterThan(4);
    for (const e of doc.edges) expect(e.label.trim().length).toBeGreaterThan(2);
  });

  it("keeps every label clear of the cards, and no two labels on top of each other", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    const problems = verifyCanvas(doc);
    expect(problems.filter((p) => p.includes("pisa") || p.includes("se pisan"))).toEqual([]);
  });

  it("catches a label that lands on top of a card", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    expect(verifyCanvas(doc)).toEqual([]);
    const card = doc.nodes.find((n) => (n.text ?? "").startsWith("### Caso"));
    expect(card).toBeDefined();
    if (card) card.y -= 80; // squeeze the gap so the arrow label no longer fits
    expect(verifyCanvas(doc).some((p) => p.includes("pisa la tarjeta"))).toBe(true);
  });

  it("survives a concept with many examples and errors without crowding the labels", () => {
    const extraExamples = Array.from({ length: 4 }, (_, i) => `
### Ejemplo ${i + 3} — Caso extra ${i}
- **Contexto:** situación de prueba número ${i}.
- **Caso:** el caso concreto del ejemplo extra ${i}.
- **Resultado esperado:** un resultado comprobable ${i}.
- **Por qué funciona:** porque la regla aplicada lo garantiza.
`).join("");
    const extraErrors = Array.from({ length: 4 }, (_, i) => `
### Error ${i + 2} — Error extra ${i}
- **Error:** se escribe mal el caso ${i}.
- **Síntoma:** el resultado sale invertido.
- **Causa:** se aplica la regla contraria.
- **Solución:** comprobar la definición antes de operar.
`).join("");
    // The extras must land *inside* their section, not after `## Tarjetas`.
    const many = CONCEPT_NOTE
      .replace("## Errores comunes", `${extraExamples}\n## Errores comunes`)
      .replace("## Tarjetas", `${extraErrors}\n## Tarjetas`);
    const { root, concepto } = makeVault(many);
    const c = readConcept(concepto, root);
    expect(c.examples).toHaveLength(6);
    expect(c.errors).toHaveLength(5);
    const doc = buildConceptCanvas(c);
    const problems = verifyCanvas(doc);
    for (const p of problems) process.stdout.write(`problem: ${p}\n`);
    expect(problems).toEqual([]);
  });

  it("draws the Requiere panel even when the concept has no prerequisites", () => {
    const note = CONCEPT_NOTE.replace(
      "- [[1.2 Suma y resta de enteros]] — operar respetando signos",
      "*Sin prerrequisitos.*",
    );
    const { root, concepto } = makeVault(note);
    const doc = buildConceptCanvas(readConcept(concepto, root));
    expect(doc.nodes.some((n) => n.type === "group" && n.label === "Requiere")).toBe(true);
    expect(doc.nodes.some((n) => (n.text ?? "").includes("Sin prerrequisitos"))).toBe(true);
    expect(verifyCanvas(doc)).toEqual([]);
  });
});

describe("writeGenerated", () => {
  it("rewrites its own canvas but never an edited one", () => {
    const { root, concepto } = makeVault();
    const doc = buildConceptCanvas(readConcept(concepto, root));
    const target = path.join(concepto, "1.9 Concepto de prueba — mapa.canvas");

    expect(writeGenerated(target, doc, root)).toContain("written");
    expect(fs.existsSync(target)).toBe(true);
    // Idempotent: the second pass overwrites its own output and leaves no copy.
    expect(writeGenerated(target, doc, root)).toContain("written");
    expect(fs.existsSync(target.replace(/\.canvas$/, ".nuevo.canvas"))).toBe(false);

    // The user edits it → the next pass writes .nuevo.canvas and keeps the original.
    fs.appendFileSync(target, "\n", "utf-8");
    const edited = fs.readFileSync(target, "utf-8");
    expect(writeGenerated(target, doc, root)).toContain("kept (user-edited)");
    expect(fs.readFileSync(target, "utf-8")).toBe(edited);
    expect(fs.existsSync(target.replace(/\.canvas$/, ".nuevo.canvas"))).toBe(true);
  });
});

describe("generateConcept", () => {
  it("finds the vault root and the prerequisite note", () => {
    const { root, concepto } = makeVault();
    expect(findVaultRoot(concepto)).toBe(root);
    expect(findNote("1.2 Suma y resta de enteros", root)).toContain("1.2 Suma y resta de enteros.md");
  });

  const real = process.env.KB_CANVAS_FOLDER;
  (real ? it : it.skip)("generates the real concept canvas and verifies it", () => {
    const dryRun = process.env.KB_CANVAS_DRY === "1";
    const r = generateConcept(real as string, { dryRun });
    for (const line of r.lines) process.stdout.write(`${line}\n`);
    for (const w of r.warnings) process.stdout.write(`warning: ${w}\n`);
    for (const p of r.problems) process.stdout.write(`problem: ${p}\n`);
    process.stdout.write(`${r.written}\n`);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  const all = process.env.KB_CANVAS_ALL;
  (all ? it : it.skip)("generates every concept map under KB_CANVAS_ALL", () => {
    const r = generateAll(all as string, { dryRun: process.env.KB_CANVAS_DRY === "1" });
    for (const line of r.lines) process.stdout.write(`${line}\n`);
    for (const w of r.warnings) process.stdout.write(`warning: ${w}\n`);
    process.stdout.write(
      `conceptos: ${r.folders} · escritos: ${r.written} · conservados: ${r.kept} · `
      + `bloqueados: ${r.blocked.length} · avisos: ${r.warnings.length}\n`,
    );
    expect(r.blocked).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("findConceptFolders", () => {
  const root = process.env.KB_CANVAS_ALL;
  (root ? it : it.skip)("finds every concept folder of a knowledge base", () => {
    const folders = findConceptFolders(root as string);
    expect(folders.length).toBeGreaterThan(0);
    for (const f of folders) {
      expect(fs.existsSync(path.join(f, `${path.basename(f)}.md`))).toBe(true);
    }
    process.stdout.write(`carpetas de concepto: ${folders.length}\n`);
  });
});

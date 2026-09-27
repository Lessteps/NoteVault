// Reform of the concept notes: drop Intuición/Práctica, merge the counterexample
// and error sections, keep everything else (frontmatter, Tarjetas).

import { describe, expect, it } from "vitest";
import { reformConceptNoteText } from "../../../tools/reform_concept_notes";

const NOTE = `---
id: mat.x
title: "1.1 X"
type: concept
---

# 1.1 X

## Idea en una frase
Una frase.

## Intuición
Todo el párrafo de intuición que deja de existir.

## Definición formal
**X.** Definición.

## Notación
- $x$: la incógnita.

## Ejemplos
### Ejemplo 1 — básico
Sirve porque cumple la definición.

## No-ejemplos
### No-ejemplo 1 — parece pero no
Falla en la parte 2.

## Resultados clave
- [[1.1-T01]] — lo que dice.

## Errores comunes
- Confundir X con Y.
- Aplicar fuera del dominio.

## Conexiones
- **Requiere** [[0.1 Base]] — por qué.

## Tarjetas
### T1 · definicion
**P:** ¿Qué es X?
**R:** Es X.

## Práctica
- Ejercicios: [[1.1-E01]], [[1.1-E02]]
`;

describe("reformConceptNoteText", () => {
  it("drops Intuición and Práctica, merges counterexamples with common errors", () => {
    const { text, result } = reformConceptNoteText(NOTE);

    expect(result.dropped.sort()).toEqual(["Intuición", "Práctica"]);
    expect(result.merged).toBe(true);

    expect(text).not.toContain("## Intuición");
    expect(text).not.toContain("## Práctica");
    expect(text).not.toContain("Todo el párrafo de intuición");
    expect(text).not.toContain("## No-ejemplos");
    expect(text).not.toContain("## Errores comunes");

    expect(text).toContain("## Contraejemplos y errores comunes");
    expect(text).toContain("### No-ejemplo 1 — parece pero no");
    expect(text).toContain("Falla en la parte 2.");
    expect(text).toContain("Confundir X con Y.");

    // Everything else survives, and the order is the reading order.
    for (const kept of ["## Idea en una frase", "## Definición formal", "## Notación", "## Ejemplos", "## Resultados clave", "## Conexiones", "## Tarjetas"]) {
      expect(text, `missing ${kept}`).toContain(kept);
    }
    const order = ["## Ejemplos", "## Contraejemplos y errores comunes", "## Resultados clave"]
      .map((h) => text.indexOf(h));
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);

    // The frontmatter is intact.
    expect(text.startsWith("---\nid: mat.x\n")).toBe(true);
  });

  it("is idempotent", () => {
    const once = reformConceptNoteText(NOTE).text;
    const twice = reformConceptNoteText(once);
    expect(twice.result.changed).toBe(false);
    expect(twice.text).toBe(once);
  });

  it("leaves a note that already follows the structure untouched", () => {
    const reformed = reformConceptNoteText(NOTE).text;
    expect(reformConceptNoteText(reformed).result.dropped).toEqual([]);
  });

  it("does not invent a merged section when there is nothing to merge", () => {
    const note = `---\ntype: concept\n---\n\n## Intuición\nsolo intuición\n`;
    const { text, result } = reformConceptNoteText(note);
    expect(result.merged).toBe(false);
    expect(text).not.toContain("Contraejemplos y errores comunes");
    expect(text).not.toContain("solo intuición");
  });
});

// La vista indexada del editor: qué se oculta de cada línea y qué se sustituye.
// Es la regla que hace que `# hello` se lea «hello» con formato de título.

import { describe, expect, it } from "vitest";
import { linePreview } from "./mdPreview";

/** The text as it will be read, with the hidden ranges removed. */
function rendered(text: string, plain = false): string {
  const p = linePreview(text, plain);
  const cuts = [...p.hide, ...p.replace.map((r) => ({ from: r.from, to: r.to }))].sort((a, b) => b.from - a.from);
  let out = text;
  for (const cut of cuts) out = out.slice(0, cut.from) + out.slice(cut.to);
  for (const r of p.replace) {
    // Applying replacements after removals only works because both indexes come
    // from the original line.
    const shift = p.hide.filter((h) => h.to <= r.from).reduce((a, h) => a + (h.to - h.from), 0);
    out = out.slice(0, r.from - shift) + r.text + out.slice(r.from - shift);
  }
  return out;
}

describe("vista indexada", () => {
  it("quita los almohadillas del título y deja el texto", () => {
    expect(rendered("# hello")).toBe("hello");
    expect(rendered("### Tres")).toBe("Tres");
    expect(rendered("###### Seis")).toBe("Seis");
  });

  it("no toca una línea que no lleva marcas", () => {
    expect(rendered("Una frase normal, con comas.")).toBe("Una frase normal, con comas.");
  });

  it("esconde los delimitadores de negrita, cursiva y tachado", () => {
    expect(rendered("Esto es **importante** de verdad")).toBe("Esto es importante de verdad");
    expect(rendered("Esto es *suave* aquí")).toBe("Esto es suave aquí");
    expect(rendered("Esto está ~~obsoleto~~ ya")).toBe("Esto está obsoleto ya");
    expect(rendered("Esto es __fuerte__ también")).toBe("Esto es fuerte también");
    // …pero no se toca un nombre con guiones bajos.
    expect(rendered("la variable snake_case_with_underscores")).toBe("la variable snake_case_with_underscores");
  });

  it("deja el texto de un código en línea, sin backticks", () => {
    expect(rendered("Usa `npm run test` aquí")).toBe("Usa npm run test aquí");
    // Dentro de un código, las marcas son literales.
    expect(rendered("Mira `**esto**` dentro")).toBe("Mira **esto** dentro");
    const p = linePreview("Usa `npm run test` aquí");
    expect(p.marks).toEqual([{ from: 5, to: 17, kind: "code" }]);
  });

  it("deja el texto de un enlace y esconde la URL", () => {
    expect(rendered("Ver [la guía](https://x.dev/g) ahora")).toBe("Ver la guía ahora");
    const p = linePreview("Ver [la guía](https://x.dev/g) ahora");
    expect(p.marks).toEqual([{ from: 5, to: 12, kind: "link" }]);
  });

  it("deja el nombre de un wikilink", () => {
    expect(rendered("Ver [[Otra nota]] aquí")).toBe("Ver Otra nota aquí");
  });

  it("cambia el guion de una viñeta por un punto", () => {
    expect(rendered("- primero")).toBe("• primero");
    expect(rendered("  * anidada")).toBe("  • anidada");
    const p = linePreview("- primero");
    expect(p.replace).toEqual([{ from: 0, to: 1, text: "•" }]);
  });

  it("no indexa la línea del cursor, ni las tablas ni las vallas", () => {
    expect(rendered("# hello", true)).toBe("# hello");
    expect(rendered("| a | b |")).toBe("| a | b |");
    expect(rendered("```ts")).toBe("```ts");
    expect(linePreview("   ")).toEqual({ hide: [], replace: [], marks: [], math: [] });
  });

  it("devuelve desplazamientos dentro de la línea", () => {
    const p = linePreview("## Título con **fuerza**");
    // "#" "+espacio" al principio, y los dos asteriscos de cada lado.
    expect(p.hide).toContainEqual({ from: 0, to: 3 });
    expect(p.hide.some((h) => h.to - h.from === 2)).toBe(true);
    for (const h of p.hide) {
      expect(h.from).toBeGreaterThanOrEqual(0);
      expect(h.to).toBeLessThanOrEqual("## Título con **fuerza**".length);
      expect(h.to).toBeGreaterThan(h.from);
    }
  });
});

describe("vista indexada: fórmulas en línea", () => {
  it("reports $..$ spans and keeps their contents literal", () => {
    const p = linePreview("Sea $a*b*c$ y $|x|$ dos casos");
    expect(p.math.map((m) => m.tex)).toEqual(["a*b*c", "|x|"]);
    // The asterisks inside the formula are not emphasis.
    expect(p.hide).toEqual([]);
  });

  it("ignores prices and escaped dollars", () => {
    expect(linePreview("Cuesta $5 y $ 6 $ o \$x\$").math).toEqual([]);
  });

  it("gives the cursor's line back untouched", () => {
    expect(linePreview("$x$", true).math).toEqual([]);
  });
});

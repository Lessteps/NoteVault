// @vitest-environment jsdom
//
// El editor con la vista indexada puesto: el plugin tiene que decorar sin
// romperse (los rangos de un RangeSetBuilder deben ir ordenados y sin solaparse,
// y una excepción ahí deja el editor sin montar).

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { livePreview } from "./livePreview";

const DOC = [
  "---",
  "title: Prueba",
  "---",
  "",
  "## Sección uno",
  "",
  "Un párrafo con **negrita**, *cursiva*, `código` y [enlace](https://x.dev/1).",
  "",
  "- punto uno",
  "  * anidada",
  "- [ ] tarea pendiente",
  "",
  "> una cita con **fuerza**",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```ts",
  "const x = **no es negrita**;",
  "```",
  "",
  "Esto es __fuerte__ y ~~viejo~~ y [[un enlace interno]].",
  "",
  "# Título 1",
  "### Título 3",
  "###### Título 6",
  "",
  "Texto final.",
].join("\n");

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function mount(doc = DOC): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [livePreview] }),
    parent: host,
  });
  return view;
}

describe("vista indexada en el editor", () => {
  it("monta sin lanzar", () => {
    expect(() => mount()).not.toThrow();
  });

  it("esconde las marcas de la línea que no toca el cursor", () => {
    const v = mount();
    // El cursor está al principio (línea 1: el frontmatter), así que el título
    // de la línea 5 se lee sin almohadillas.
    const lines = [...v.dom.querySelectorAll(".cm-line")].map((l) => l.textContent);
    expect(lines.some((t) => t === "Sección uno")).toBe(true);
    expect(lines.some((t) => t.includes("**negrita**"))).toBe(false);
    expect(lines.some((t) => t.includes("•"))).toBe(true);
  });

  it("deja la marca a la vista en la línea del cursor", () => {
    const v = mount();
    // Cursor dentro del título: ahí sí se ve el Markdown, para poder editarlo.
    const pos = v.state.doc.toString().indexOf("## Sección uno") + 3;
    v.dispatch({ selection: { anchor: pos } });
    const lines = [...v.dom.querySelectorAll(".cm-line")].map((l) => l.textContent);
    expect(lines.some((t) => t.includes("## Sección uno"))).toBe(true);
  });

  it("no se rompe con un documento vacío ni con líneas raras", () => {
    for (const doc of ["", "\n\n\n", "**", "###", "- ", "|a|", "```", "[]()", "****"]) {
      document.body.innerHTML = "";
      view?.destroy();
      view = null;
      expect(() => mount(doc), `doc: ${JSON.stringify(doc)}`).not.toThrow();
    }
  });
});

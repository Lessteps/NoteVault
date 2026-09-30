// @vitest-environment jsdom
//
// Los comandos del editor markdown: negrita, titulos, listas, checklist y
// tablas. Son el atajo de teclado y la paleta de comandos, asi que un error
// aqui no se ve en ningun sitio hasta que alguien escribe.
//
// Con un EditorView de verdad en jsdom, porque casi todo el trabajo es
// calcular rangos: un mock con state.sliceDoc falseo justo lo que importa.

import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatAllTables,
  heading,
  indentLines,
  insertBlock,
  insertCodeBlock,
  insertLink,
  insertRule,
  insertTable,
  insertWikilink,
  numberedList,
  subTask,
  tableOp,
  togglePrefix,
  toggleTask,
  wrap,
} from "./editorCommands";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

/** Monta un editor con `doc` y el cursor (o la seleccion) donde se le pase. */
function mount(doc: string, at?: number | [number, number]): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const state = EditorState.create({ doc });
  const v = new EditorView({ state, parent: host });
  view = v;
  if (Array.isArray(at)) {
    v.dispatch({ selection: EditorSelection.range(at[0], at[1]) });
  } else if (typeof at === "number") {
    v.dispatch({ selection: EditorSelection.cursor(at) });
  }
  return v;
}

const doc = (v: EditorView) => v.state.doc.toString();
/** The text the selection covers right now. */
const selected = (v: EditorView) => {
  const { from, to } = v.state.selection.main;
  return v.state.sliceDoc(from, to);
};

describe("wrap", () => {
  it("envuelve la seleccion y deja el cursor sobre el texto", () => {
    const v = mount("hola mundo", [0, 4]);
    wrap(v, "**");
    expect(doc(v)).toBe("**hola** mundo");
    expect(selected(v)).toBe("hola");
  });

  it("sin seleccion inserta el marcador de posicion y la selecciona", () => {
    const v = mount("", 0);
    wrap(v, "**");
    expect(doc(v)).toBe("**texto**");
    expect(selected(v)).toBe("texto");
  });

  it("desenvuelve cuando ya estaba envuelto, sin duplicar marcas", () => {
    const v = mount("**hola**", [2, 6]);
    wrap(v, "**");
    expect(doc(v)).toBe("hola");
  });

  it("asimetrico: abre y cierra distinto", () => {
    const v = mount("texto", [0, 5]);
    wrap(v, "[[", "]]", "Nota");
    expect(doc(v)).toBe("[[texto]]");
  });

  it("si solo abre por un lado, no intenta desenvolver", () => {
    const v = mount("**hola", [2, 6]);
    wrap(v, "**");
    // Falta la marca de cierre, asi que envuelve lo seleccionado: lo que ya
    // habia se queda y la palabra queda entre las cuatro marcas.
    expect(doc(v)).toBe("****hola**");
  });
});

describe("heading", () => {
  it("fija el nivel quitando el anterior", () => {
    const v = mount("## Sección");
    heading(v, 3);
    expect(doc(v)).toBe("### Sección");
  });

  it("nivel 0 quita el titulo y deja el texto", () => {
    const v = mount("### Sección");
    heading(v, 0);
    expect(doc(v)).toBe("Sección");
  });

  it("aplica a todas las lineas seleccionadas", () => {
    const v = mount("uno\ndos\ntres", [0, 12]);
    heading(v, 2);
    expect(doc(v)).toBe("## uno\n## dos\n## tres");
  });

  it("convertir un punto de lista en titulo quita la viñeta, no la deja dentro", () => {
    const v = mount("  - anidada");
    heading(v, 2);
    expect(doc(v)).toBe("## anidada");
  });
});

describe("togglePrefix", () => {
  it("pone la marca si no esta", () => {
    const v = mount("cita");
    togglePrefix(v, "> ");
    expect(doc(v)).toBe("> cita");
  });

  it("la quita si todas las lineas la tienen", () => {
    const v = mount("> uno\n> dos", [0, 11]);
    togglePrefix(v, "> ");
    expect(doc(v)).toBe("uno\ndos");
  });

  it("si solo algunas la tienen, las pone todas sin desdoblar las que ya", () => {
    const v = mount("> uno\ndos", [0, 8]);
    togglePrefix(v, "> ");
    expect(doc(v)).toBe("> uno\n> dos");
  });

  it("al ponerla quita la marca de lista que hubiera", () => {
    const v = mount("- punto");
    togglePrefix(v, "> ");
    expect(doc(v)).toBe("> punto");
  });
});

describe("listas", () => {
  it("numerada numera en orden desde 1", () => {
    const v = mount("uno\ndos\ntres", [0, 12]);
    numberedList(v);
    expect(doc(v)).toBe("1. uno\n2. dos\n3. tres");
  });

  it("numerada quita los numeros si ya estaban", () => {
    const v = mount("1. uno\n2. dos", [0, 11]);
    numberedList(v);
    expect(doc(v)).toBe("uno\ndos");
  });

  it("la sangria se respeta en la lista numerada", () => {
    const v = mount("    - anidada");
    numberedList(v);
    expect(doc(v)).toBe("    1. anidada");
  });
});

describe("checklist", () => {
  it("una linea normal se vuelve pendiente", () => {
    const v = mount("comprar pan");
    toggleTask(v);
    expect(doc(v)).toBe("- [ ] comprar pan");
  });

  it("pendiente pasa a hecha y hecha vuelve a pendiente", () => {
    const v = mount("- [ ] comprar pan");
    toggleTask(v);
    expect(doc(v)).toBe("- [x] comprar pan");
    toggleTask(v);
    expect(doc(v)).toBe("- [ ] comprar pan");
  });

  it("una lista numerada se convierte en checklist sin el numero", () => {
    const v = mount("1. comprar pan");
    toggleTask(v);
    expect(doc(v)).toBe("- [ ] comprar pan");
  });

  it("subTask anade una casilla debajo de la linea del cursor", () => {
    const v = mount("primera\nsegunda", 3);
    subTask(v);
    expect(doc(v)).toBe("primera\n    - [ ] \nsegunda");
  });

  it("subTask hereda la sangria de la linea", () => {
    const v = mount("    - anidada", 6);
    subTask(v);
    expect(doc(v)).toBe("    - anidada\n        - [ ] ");
  });
});

describe("sangrar", () => {
  it("sangrar a la derecha anade cuatro espacios", () => {
    const v = mount("punto");
    indentLines(v, 1);
    expect(doc(v)).toBe("    punto");
  });

  it("sangrar a la izquierda quita hasta cuatro", () => {
    const v = mount("        punto");
    indentLines(v, -1);
    expect(doc(v)).toBe("    punto");
  });

  it("sangrar a la izquierda en una linea sin sangria no hace nada", () => {
    const v = mount("punto");
    indentLines(v, -1);
    expect(doc(v)).toBe("punto");
  });
});

describe("insertar bloques", () => {
  it("en medio de un parrafo abre linea antes y despues", () => {
    const v = mount("primera\nsegunda", 3);
    insertBlock(v, "---");
    expect(doc(v)).toBe("primera\n\n---\n\nsegunda");
  });

  it("en una linea vacia no mete lineas en blanco de mas", () => {
    const v = mount("primera\n\ntercera", 8); // la linea en blanco de en medio
    insertBlock(v, "---");
    expect(doc(v)).toBe("primera\n\n---\n\ntercera");
  });

  it("insertRule es una linea de guiones", () => {
    const v = mount("", 0);
    insertRule(v);
    expect(doc(v)).toBe("---\n");
  });

  it("bloque de codigo con seleccion envuelve lo elegido", () => {
    const v = mount("const x = 1", [0, 11]);
    insertCodeBlock(v);
    expect(doc(v)).toBe("```\nconst x = 1\n```");
  });

  it("bloque de codigo sin seleccion inserta el esqueleto", () => {
    const v = mount("", 0);
    insertCodeBlock(v);
    expect(doc(v)).toBe("```\n\n```\n");
  });
});

describe("enlaces", () => {
  it("inserta un enlace y deja la url seleccionada para escribirla", () => {
    const v = mount("", 0);
    insertLink(v);
    expect(doc(v)).toBe("[texto](url)");
    expect(selected(v)).toBe("url");
  });

  it("enlaza el texto seleccionado en vez del marcador", () => {
    const v = mount("Qt docs", [0, 7]);
    insertLink(v);
    expect(doc(v)).toBe("[Qt docs](url)");
  });

  it("wikilink con lo seleccionado", () => {
    const v = mount("Tema", [0, 4]);
    insertWikilink(v);
    expect(doc(v)).toBe("[[Tema]]");
  });

  it("wikilink sin seleccion pone Nota", () => {
    const v = mount("", 0);
    insertWikilink(v);
    expect(doc(v)).toBe("[[Nota]]");
  });
});

describe("tablas", () => {
  const TABLA = ["intro", "", "| a | b |", "| - | - |", "| 1 | 2 |", "", "fin"].join("\n");

  it("insertTable pone una rejilla con sus cabeceras", () => {
    const v = mount("", 0);
    insertTable(v, 2, 3);
    expect(doc(v)).toContain("Columna 1");
    expect(doc(v)).toContain("Columna 3");
    // El separador sale con guiones, del ancho de cada columna.
    expect(doc(v)).toContain("---------");
  });

  it("anade una fila en blanco debajo de la del cursor", () => {
    const v = mount(TABLA, 30); // dentro de la primera fila de datos
    expect(tableOp(v, "row-below")).toBe(true);
    // Cabecera, separador, la fila con 1 y la nueva vacia.
    expect(doc(v).split("\n").filter((l) => l.startsWith("|")).length).toBe(4);
  });

  it("quita la fila del cursor", () => {
    const v = mount(TABLA, 30);
    expect(tableOp(v, "row-delete")).toBe(true);
    expect(doc(v).split("\n").filter((l) => l.startsWith("|"))).toHaveLength(2);
  });

  it("anade una columna vacia a la derecha de la del cursor", () => {
    const v = mount(TABLA, 30);
    tableOp(v, "col-right");
    // La columna entra en blanco: el nombre lo pone quien la escribe.
    const cabecera = doc(v).split("\n").find((l) => l.startsWith("| a"))!;
    expect(cabecera.split("|").length - 2).toBe(3);
  });

  it("borra la tabla entera", () => {
    const v = mount(TABLA, 30);
    expect(tableOp(v, "delete")).toBe(true);
    expect(doc(v)).not.toContain("| a | b |");
  });

  it("fuera de una tabla devuelve false y no toca el documento", () => {
    const v = mount("solo un parrafo");
    expect(tableOp(v, "row-below")).toBe(false);
    expect(doc(v)).toBe("solo un parrafo");
  });

  it("un header sin separador no es una tabla", () => {
    const v = mount("| a | b |\n| 1 | 2 |", 3);
    expect(tableOp(v, "row-below")).toBe(false);
  });

  it("formatAllTables reformatea todas y avisa de que habia trabajo", () => {
    const dos = ["una", "", "|a|b|", "|-|-|", "|1|2|", "", "dos", "", "|c|d|", "|-|-|", "|3|4|"].join("\n");
    const v = mount(dos);
    expect(formatAllTables(v)).toBe(true);
    // Se reescriben con el relleno que las hace legibles: "| a   | b   |".
    expect(doc(v)).toContain("| a   | b   |");
    expect(doc(v)).toContain("| c   | d   |");
  });

  it("formatAllTables sin tablas devuelve false", () => {
    const v = mount("nada que formatear");
    expect(formatAllTables(v)).toBe(false);
  });
});

describe("varias lineas y selecciones", () => {
  it("una linea tocada por la seleccion cuenta entera", () => {
    const v = mount("uno\ndos\ntres", [2, 6]); // del final de "uno" a mitad de "dos"
    heading(v, 1);
    expect(doc(v)).toBe("# uno\n# dos\ntres");
  });

  it("no toca lineas fuera de la seleccion", () => {
    const v = mount("antes\ndentro\ndespues", [6, 12]);
    heading(v, 2);
    expect(doc(v)).toBe("antes\n## dentro\ndespues");
  });
});

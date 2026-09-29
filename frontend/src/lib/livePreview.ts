// El plugin de CodeMirror de la "vista indexada": convierte lo que decide
// `mdPreview` (qué marcas se ocultan, qué se sustituye, qué se marca) en
// decoraciones reales.
//
// Vive aparte del componente para poder probarlo sin montar la interfaz.

import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { linePreview } from "./mdPreview";

/** El punto que sustituye al "- " de una viñeta. */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = "•";
    span.className = "cm-nv-bullet";
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

const HIDDEN = Decoration.replace({});
const BULLET = Decoration.replace({ widget: new BulletWidget() });
const MARK = {
  code: Decoration.mark({ class: "cm-nv-code" }),
  link: Decoration.mark({ class: "cm-nv-link" }),
};

/** True when the selection (or the cursor) touches that line. */
function touched(state: EditorState, lineNumber: number): boolean {
  return state.selection.ranges.some((r) => {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    return lineNumber >= a && lineNumber <= b;
  });
}

/**
 * "Vista indexada": la nota se lee como se lee. Las marcas se esconden en todas
 * las líneas menos en la que está el cursor, que conserva su Markdown para poder
 * editarla. Solo se decoran los rangos visibles, así que el coste no crece con el
 * tamaño de la nota.
 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = this.build(u.view);
      }
    }
    build(view: EditorView): DecorationSet {
      try {
        return this.buildRanges(view);
      } catch (e) {
        // Un juego de decoraciones imposible (dos rangos que se solapan) tiraba el
        // editor entero al montar. Sin marcas la nota sigue abriéndose y se puede
        // editar; solo se ve el Markdown tal cual.
        console.warn("[NoteVault] la vista indexada falló; la nota se muestra sin ocultar marcas:", e);
        return Decoration.none;
      }
    }
    buildRanges(view: EditorView): DecorationSet {
      const out: Array<{ from: number; to: number; deco: Decoration }> = [];
      const last = view.state.doc.lines;
      for (const range of view.visibleRanges) {
        let number = view.state.doc.lineAt(range.from).number;
        const endLine = view.state.doc.lineAt(range.to).number;
        for (; number <= endLine && number <= last; number += 1) {
          const line = view.state.doc.line(number);
          const p = linePreview(line.text, touched(view.state, number));
          for (const h of p.hide) {
            if (h.to > h.from) out.push({ from: line.from + h.from, to: line.from + h.to, deco: HIDDEN });
          }
          for (const r of p.replace) {
            out.push({ from: line.from + r.from, to: line.from + r.to, deco: BULLET });
          }
          for (const m of p.marks) {
            if (m.to > m.from) {
              out.push({ from: line.from + m.from, to: line.from + m.to, deco: MARK[m.kind === "code" ? "code" : "link"] });
            }
          }
        }
      }
      // Nada se solapa: primero las marcas (más largas) y luego los reemplazos
      // cortos que van dentro, cada uno en su rango.
      out.sort((a, b) => a.from - b.from || b.to - a.to);
      const builder = new RangeSetBuilder<Decoration>();
      let lastTo = -1;
      let lastFrom = -1;
      for (const d of out) {
        if (d.from < lastTo || (d.from === lastFrom && d.to <= lastTo)) continue;
        builder.add(d.from, d.to, d.deco);
        lastFrom = d.from;
        lastTo = Math.max(lastTo, d.to);
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

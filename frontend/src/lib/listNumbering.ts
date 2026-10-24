// Numeración jerárquica de las listas numeradas del canvas: 1. / 1.1 / 1.1.1 … hasta
// cinco niveles. En el archivo la lista sigue siendo Markdown normal ("1." sangrado);
// lo jerárquico solo se dibuja (aquí, en el editor; en la lectura lo hace el CSS).

import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

export const MAX_NUMBER_LEVELS = 5;

const ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])(\s+)/;

export interface NumberedLine {
  /** Where the typed marker ("1.") starts and ends in the line. */
  from: number;
  to: number;
  /** "1." at the top level, "1.2" / "1.2.3" below, up to MAX_NUMBER_LEVELS numbers. */
  label: string;
}

const indentWidth = (s: string): number => s.replace(/\t/g, "    ").length;

/**
 * The hierarchical label of every ordered-list line (null for any other line). Nesting follows the indentation; a line that
 * is not a list item and not indented ends the list. Bullets nest too, but they carry no number, and a numbered item under a
 * bullet starts over.
 */
export function numberLines(lines: readonly string[]): Array<NumberedLine | null> {
  type Frame = { indent: number; ordered: boolean; count: number; label: string };
  const stack: Frame[] = [];
  const out: Array<NumberedLine | null> = [];
  for (const text of lines) {
    if (!text.trim()) {
      out.push(null);
      continue;
    }
    const m = ITEM.exec(text);
    if (!m) {
      // Prose that is not indented closes the list; an indented line is a continuation of the open item.
      if (indentWidth(/^\s*/.exec(text)![0]) === 0) stack.length = 0;
      out.push(null);
      continue;
    }
    const indent = indentWidth(m[1]!);
    while (stack.length && stack[stack.length - 1]!.indent > indent) stack.pop();
    const top = stack[stack.length - 1];
    if (m[2]) {
      // A bullet.
      if (top && top.indent === indent) stack.pop();
      stack.push({ indent, ordered: false, count: 0, label: "" });
      out.push(null);
      continue;
    }
    const typed = Number(m[3]);
    let frame: Frame;
    if (top && top.indent === indent && top.ordered) {
      frame = top;
      frame.count += 1;
    } else {
      if (top && top.indent === indent) stack.pop();
      frame = { indent, ordered: true, count: typed, label: "" };
      stack.push(frame);
    }
    const parent = stack.length >= 2 ? stack[stack.length - 2]! : null;
    const parentNumbers = parent && parent.ordered ? parent.label.split(".").filter(Boolean) : [];
    const numbers = [...parentNumbers, String(frame.count)];
    frame.label = numbers.join(".");
    const shown = numbers.length > MAX_NUMBER_LEVELS ? String(frame.count) : frame.label;
    const start = m[1]!.length;
    out.push({ from: start, to: m[0].length - m[4]!.length, label: numbers.length === 1 ? `${shown}.` : shown });
  }
  return out;
}

class NumberWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(o: NumberWidget): boolean {
    return o.label === this.label;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.label;
    span.className = "cm-nv-number";
    return span;
  }
}

function touched(state: EditorState, lineNumber: number): boolean {
  return state.selection.ranges.some((r) => {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    return lineNumber >= a && lineNumber <= b;
  });
}

/** CodeMirror extension: draws the hierarchical number in place of "1." on every line the cursor is not on. */
export const hierarchicalNumbers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      try {
        const doc = view.state.doc;
        const lines: string[] = [];
        for (let i = 1; i <= doc.lines; i += 1) lines.push(doc.line(i).text);
        const labels = numberLines(lines);
        const builder = new RangeSetBuilder<Decoration>();
        labels.forEach((l, i) => {
          if (!l || touched(view.state, i + 1)) return;
          const line = doc.line(i + 1);
          builder.add(line.from + l.from, line.from + l.to, Decoration.replace({ widget: new NumberWidget(l.label) }));
        });
        return builder.finish();
      } catch (e) {
        console.warn("[NoteVault] la numeración jerárquica falló; se muestran los números escritos:", e);
        return Decoration.none;
      }
    }
  },
  { decorations: (v) => v.decorations },
);

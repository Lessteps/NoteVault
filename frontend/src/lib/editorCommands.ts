// Editing commands for the markdown source editor (bold, headings,
// checklists, tables…), shared by the command palette and the keymap.

import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { columnAt, editTable, formatTable, newTable, parseTable, tableBounds, type TableOp } from "./mdTable";

/** Wrap the selection (or a placeholder) in `left`…`right`; toggles off when
 * it is already wrapped. */
export function wrap(view: EditorView, left: string, right = left, placeholder = "texto"): boolean {
  const { state } = view;
  view.dispatch(state.changeByRange((range) => {
    const before = state.sliceDoc(range.from - left.length, range.from);
    const after = state.sliceDoc(range.to, range.to + right.length);
    if (before === left && after === right) {
      return {
        changes: [
          { from: range.from - left.length, to: range.from, insert: "" },
          { from: range.to, to: range.to + right.length, insert: "" },
        ],
        range: EditorSelection.range(range.from - left.length, range.to - left.length),
      };
    }
    const text = range.empty ? placeholder : state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: left + text + right },
      range: EditorSelection.range(range.from + left.length, range.from + left.length + text.length),
    };
  }));
  view.focus();
  return true;
}

function selectedLines(state: EditorState) {
  const seen = new Set<number>();
  const out = [];
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(state.doc.line(n));
      }
    }
  }
  return out;
}

/** Replace each selected line through `fn(text)`. */
function mapLines(view: EditorView, fn: (text: string) => string): boolean {
  const changes = selectedLines(view.state).map((l) => ({ from: l.from, to: l.to, insert: fn(l.text) }));
  view.dispatch({ changes });
  view.focus();
  return true;
}

const INDENT = /^(\s*)/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

/** "# " … "###### ": set the heading level (0 removes it). */
export function heading(view: EditorView, level: number): boolean {
  return mapLines(view, (t) => {
    // Drop the old heading and the old list marker alike: turning a list item
    // into a heading should keep its text, not render as "## - punto".
    const body = t.replace(/^\s*#{1,6}\s+/, "");
    return level > 0 ? `${"#".repeat(level)} ${body.replace(LIST, "")}` : body;
  });
}

/** Toggle a line prefix such as "> " or "- ". */
export function togglePrefix(view: EditorView, prefix: string): boolean {
  const lines = selectedLines(view.state);
  const all = lines.every((l) => l.text.trimStart().startsWith(prefix));
  return mapLines(view, (t) => {
    const [ind] = t.match(INDENT)!;
    const rest = t.slice(ind.length);
    if (all) return ind + rest.slice(prefix.length);
    // Not every line had it, so the command turns it on: a line that already
    // carries the mark stays as it is (otherwise "> uno" became "> > uno").
    if (rest.startsWith(prefix)) return t;
    return ind + prefix + rest.replace(LIST, "");
  });
}

export function numberedList(view: EditorView): boolean {
  let n = 0;
  const all = selectedLines(view.state).every((l) => /^\s*\d+[.)]\s/.test(l.text));
  return mapLines(view, (t) => {
    const [ind] = t.match(INDENT)!;
    const rest = t.slice(ind.length).replace(LIST, "");
    return all ? ind + rest : `${ind}${++n}. ${rest}`;
  });
}

/** Ctrl+L: plain line → "- [ ] ", open → done, done → open. */
export function toggleTask(view: EditorView): boolean {
  return mapLines(view, (t) => {
    if (/^\s*[-*+] \[ \]/.test(t)) return t.replace("[ ]", "[x]");
    if (/^\s*[-*+] \[[xX]\]/.test(t)) return t.replace(/\[[xX]\]/, "[ ]");
    const [ind] = t.match(INDENT)!;
    const rest = t.slice(ind.length).replace(/^([-*+]|\d+[.)])\s+/, "");
    return `${ind}- [ ] ${rest}`;
  });
}

/** A checkbox nested under the current line. */
export function subTask(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const [ind] = line.text.match(INDENT)!;
  const insert = `\n${ind}    - [ ] `;
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length } });
  view.focus();
  return true;
}

export function indentLines(view: EditorView, dir: 1 | -1): boolean {
  return mapLines(view, (t) => (dir > 0 ? "    " + t : t.replace(/^( {1,4}|\t)/, "")));
}

/** Insert a block on its own lines at the cursor. */
export function insertBlock(view: EditorView, text: string, cursorOffset = text.length): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const lead = line.text.trim() ? "\n\n" : line.number > 1 && state.doc.line(line.number - 1).text.trim() ? "\n" : "";
  const from = line.to;
  const insert = lead + text + "\n";
  view.dispatch({
    changes: { from, insert },
    selection: { anchor: from + lead.length + cursorOffset },
  });
  view.focus();
  return true;
}

export function insertRule(view: EditorView): boolean {
  return insertBlock(view, "---");
}

export function insertCodeBlock(view: EditorView): boolean {
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  if (sel) return wrap(view, "```\n", "\n```");
  return insertBlock(view, "```\n\n```", 4);
}

export function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to) || "texto";
  const insert = `[${text}](url)`;
  const urlAt = from + text.length + 3;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: urlAt, head: urlAt + 3 } });
  view.focus();
  return true;
}

export function insertWikilink(view: EditorView): boolean {
  return wrap(view, "[[", "]]", "Nota");
}

export function insertTable(view: EditorView, rows = 2, cols = 3): boolean {
  const lines = newTable(rows, cols);
  // Cursor on the first header cell, "Columna 1" selected by the user next.
  return insertBlock(view, lines.join("\n"), 2);
}

/** Run a table edit on the table under the cursor; false when there is none. */
export function tableOp(view: EditorView, op: TableOp): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const cur = state.doc.lineAt(head);
  const lines = state.doc.toString().split(state.lineBreak);
  const bounds = tableBounds(lines, cur.number - 1);
  if (!bounds) return false;
  const [a, b] = bounds;
  const row = cur.number - 1 - a;
  const col = columnAt(cur.text, head - cur.from);
  const edited = editTable(parseTable(lines.slice(a, b + 1)), op, row, col);
  const from = state.doc.line(a + 1).from;
  const to = state.doc.line(b + 1).to;
  const insert = edited ? formatTable(edited).join(state.lineBreak) : "";
  // Keep the cursor on the same table line when possible.
  const newLines = insert.split(state.lineBreak);
  const targetRow = Math.min(op === "row-below" && row >= 1 ? row + 1 : row, newLines.length - 1);
  let anchor = from;
  for (let i = 0; i < targetRow; i++) anchor += newLines[i]!.length + state.lineBreak.length;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: Math.min(anchor + 2, from + insert.length) } });
  view.focus();
  return true;
}

/** Format every table in the note. */
export function formatAllTables(view: EditorView): boolean {
  const { state } = view;
  const lines = state.doc.toString().split(state.lineBreak);
  const changes = [];
  for (let i = 0; i < lines.length; i++) {
    const b = tableBounds(lines, i);
    if (!b) continue;
    const insert = formatTable(parseTable(lines.slice(b[0], b[1] + 1))).join(state.lineBreak);
    changes.push({ from: state.doc.line(b[0] + 1).from, to: state.doc.line(b[1] + 1).to, insert });
    i = b[1];
  }
  if (changes.length) view.dispatch({ changes });
  return changes.length > 0;
}

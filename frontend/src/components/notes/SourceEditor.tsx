// CodeMirror 6: the markdown source editor.

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { insertTable, toggleTask, wrap } from "../../lib/editorCommands";

// Markdown shortcuts (the Qt editor's Ctrl+B / Ctrl+I / Ctrl+L / Ctrl+Shift+T).
const mdKeymap = keymap.of([
  { key: "Mod-b", run: (v) => wrap(v, "**") },
  { key: "Mod-i", run: (v) => wrap(v, "*") },
  { key: "Mod-l", run: toggleTask },
  { key: "Mod-Shift-t", run: (v) => insertTable(v) },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--nv-text)",
    backgroundColor: "transparent",
    fontSize: "14.5px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    lineHeight: "1.75",
    padding: "20px 0 120px",
  },
  ".cm-content": { maxWidth: "860px", caretColor: "var(--nv-accent)", paddingRight: "32px" },
  ".cm-code .cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "13px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--nv-accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--nv-accent-soft) !important",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--nv-hover) 55%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--nv-faint)",
    border: "none",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    paddingLeft: "12px",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--nv-dim)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 14px 0 4px", minWidth: "36px" },
  ".cm-panels": { backgroundColor: "var(--nv-card)", color: "var(--nv-text)" },
  ".cm-searchMatch": { backgroundColor: "var(--nv-warn-soft)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--nv-accent-soft)" },
  ".cm-selectionMatch": { backgroundColor: "var(--nv-accent-soft)" },
});

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.55em", fontWeight: "700", color: "var(--nv-text)" },
  { tag: t.heading2, fontSize: "1.3em", fontWeight: "700", color: "var(--nv-text)" },
  { tag: t.heading3, fontSize: "1.12em", fontWeight: "700", color: "var(--nv-text)" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--nv-faint)" },
  { tag: [t.link, t.url], color: "var(--nv-accent-text)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", color: "var(--nv-accent-text)", fontSize: "0.9em" },
  { tag: t.quote, color: "var(--nv-dim)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: "var(--nv-faint)" },
  { tag: t.list, color: "var(--nv-accent-text)" },
  { tag: t.meta, color: "var(--nv-faint)" },
]);

/** The editor on screen, for tools that act on the selection or cursor
 * (the assistant inserting an answer, study actions on the selected text). */
export const activeEditor: { view: EditorView | null } = { view: null };

export function editorSelection(): string {
  const v = activeEditor.view;
  if (v) {
    const { from, to } = v.state.selection.main;
    if (to > from) return v.state.sliceDoc(from, to);
  }
  return window.getSelection()?.toString() ?? "";
}

/** Insert text at the cursor of the editor; false when no editor is open. */
export function insertAtCursor(text: string): boolean {
  const v = activeEditor.view;
  if (!v) return false;
  const { from, to } = v.state.selection.main;
  v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  v.focus();
  return true;
}

export function SourceEditor({
  value, eol, code, onChange, onCursor, revealLine, onRevealed,
}: {
  value: string;
  eol: "\n" | "\r\n";
  code: boolean;
  onChange: (raw: string) => void;
  onCursor?: (line: number, col: number) => void;
  revealLine?: number;
  onRevealed?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Latest callbacks without rebuilding the editor on every render.
  const cb = useRef({ onChange, onCursor });
  cb.current = { onChange, onCursor };

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        // Keep the file's own line endings on the way out.
        EditorState.lineSeparator.of(eol),
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        ...(code ? [] : [mdKeymap]),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        // The YAML block on top is YAML, not markdown (else "key: v\n---"
        // reads as a setext heading).
        ...(code ? [] : [yamlFrontmatter({ content: markdown() }), syntaxHighlighting(mdHighlight)]),
        theme,
        EditorView.editorAttributes.of({ class: code ? "cm-code" : "" }),
        EditorView.contentAttributes.of({ spellcheck: code ? "false" : "true", lang: "es" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cb.current.onChange(u.state.sliceDoc());
          if (u.docChanged || u.selectionSet) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            cb.current.onCursor?.(line.number, head - line.from + 1);
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    activeEditor.view = v;
    v.focus();
    return () => {
      if (activeEditor.view === v) activeEditor.view = null;
      v.destroy();
      view.current = null;
    };
    // The editor is rebuilt only when the file identity changes; value
    // updates from outside are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eol, code]);

  // Outside changes (reload from disk, a task ticked in the preview).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.sliceDoc();
    if (cur !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v || revealLine === undefined) return;
    const n = Math.min(Math.max(1, revealLine), v.state.doc.lines);
    const line = v.state.doc.line(n);
    v.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    v.focus();
    onRevealed?.();
  }, [revealLine, onRevealed]);

  return <div ref={host} className="h-full min-h-0 select-text" />;
}

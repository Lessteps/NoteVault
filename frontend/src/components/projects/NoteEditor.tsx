// The visual Markdown editor of the Notas tab: Milkdown over a ProseMirror
// document, so headings, bold, lists and tables are rendered while writing and
// the file on disk stays plain Markdown.
//
// Two invariants from the brief:
//   · opening a file and closing it without touching anything must not repaint it
//     (so the markdown is only reported upwards after a real edit — `touched`);
//   · the toolbar and the shortcuts cover exactly what Markdown expresses: no
//     underline, no colours, no alignment.

import {
  commonmark, createCodeBlockCommand, insertHrCommand, insertImageCommand, toggleEmphasisCommand,
  toggleInlineCodeCommand, toggleLinkCommand, toggleStrongCommand, turnIntoTextCommand,
  wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInHeadingCommand, wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { defaultValueCtx, editorViewOptionsCtx, Editor, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { gfm, insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { history, redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { callCommand } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import {
  Bold, Code, Heading1, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List,
  ListChecks, ListOrdered, Minus, Quote, Redo2, SquareCode, Strikethrough, Table as TableIcon,
  Type, Undo2,
} from "lucide-react";
import { useRef } from "react";
import { askText, cn } from "../ui";

/** The little of ProseMirror we touch for the checklist. */
interface NodeLike { type: { name: string }; attrs: Record<string, unknown> }
interface DocLike { nodesBetween: (a: number, b: number, cb: (n: NodeLike, pos: number) => void) => void }
interface TrLike {
  doc: DocLike;
  docChanged: boolean;
  setNodeMarkup: (pos: number, type: undefined, attrs: Record<string, unknown>) => void;
}
interface ViewLike {
  state: { selection: { from: number; to: number }; doc: DocLike; tr: TrLike };
  dispatch: (tr: TrLike) => void;
}

/** A milkdown command: we only need its registry key. */
type Cmd = { key: unknown };

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      // Keep the editor focused (and its selection alive) while the button is used.
      onMouseDown={(e) => e.preventDefault()}
      className="grid h-7 w-7 flex-none place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
      {children}
    </button>
  );
}

export function NoteEditor({ initial, revision, readOnly, onMarkdown, onSave }: {
  /** The markdown on disk: the editor starts from it and is rebuilt when it changes. */
  initial: string;
  /** Bump to force a rebuild (another file, or a reload from disk). */
  revision: number;
  readOnly?: boolean;
  onMarkdown: (markdown: string) => void;
  onSave: () => void;
}) {
  return (
    <MilkdownProvider>
      <EditorShell initial={initial} revision={revision} readOnly={readOnly} onMarkdown={onMarkdown} onSave={onSave} />
    </MilkdownProvider>
  );
}

function EditorShell({ initial, revision, readOnly, onMarkdown, onSave }: {
  initial: string;
  revision: number;
  readOnly?: boolean;
  onMarkdown: (markdown: string) => void;
  onSave: () => void;
}) {
  /** Nothing is written back until the user actually touches the document. */
  const touched = useRef(false);
  // Two ways to reach the live editor: the instance the provider creates (from the
  // factory) and the context handed over on mount. Commands go through the context,
  // which is the editor's own, so no toolbar ever talks to a stale instance.
  const editorRef = useRef<unknown>(null);
  const ctxRef = useRef<unknown>(null);

  const { get } = useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initial);
        ctx.update(editorViewOptionsCtx, (prev) => ({ ...prev, editable: () => !readOnly }));
        ctx.get(listenerCtx)
          .mounted((inner) => { ctxRef.current = inner; })
          .destroy(() => { ctxRef.current = null; })
          .markdownUpdated((_inner, markdown) => {
            if (touched.current) onMarkdown(markdown);
          });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener);
    editorRef.current = editor;
    return editor;
  }, [initial, revision, readOnly]);

  /** Runs `fn` with the editor's live context. */
  const withCtx = (fn: (ctx: unknown) => void) => {
    if (ctxRef.current) {
      fn(ctxRef.current);
      return;
    }
    const editor = editorRef.current ?? get();
    if (editor) (editor as { action: (f: (ctx: unknown) => void) => void }).action(fn);
  };

  const run = (command: Cmd, payload?: unknown) => {
    touched.current = true;
    withCtx((ctx) => { callCommand(command.key as never, payload as never)(ctx as never); });
  };

  const insertLink = async () => {
    const href = await askText("Enlace", "https://", "Insertar");
    if (href) run(toggleLinkCommand, { href });
  };

  const insertImage = async () => {
    const src = await askText("Imagen (ruta o URL)", "", "Insertar");
    if (src) run(insertImageCommand, { src, alt: "" });
  };

  /** Checklist: the GFM list item carries the `checked` attribute. */
  const toggleChecklist = () => {
    touched.current = true;
    withCtx((rawCtx) => {
      const ctx = rawCtx as { get: (slice: unknown) => unknown };
      const view = ctx.get(editorViewCtx) as ViewLike;
      const { state } = view;
      const { from, to } = state.selection;
      const items: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === "list_item") items.push({ pos, attrs: { ...node.attrs } });
      });
      if (!items.length) {
        // Not in a list yet: make one, then turn its items into tasks.
        callCommand(wrapInBulletListCommand.key as never)(ctx as never);
        const after = view.state;
        const tr = after.tr;
        const found: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
        after.doc.nodesBetween(after.selection.from, after.selection.to, (node, pos) => {
          if (node.type.name === "list_item") found.push({ pos, attrs: { ...node.attrs } });
        });
        for (const it of found) tr.setNodeMarkup(it.pos, undefined, { ...it.attrs, checked: false });
        if (tr.docChanged) view.dispatch(tr);
        return;
      }
      const anyTask = items.some((it) => it.attrs.checked !== null && it.attrs.checked !== undefined);
      const tr = state.tr;
      for (const it of items) tr.setNodeMarkup(it.pos, undefined, { ...it.attrs, checked: anyTask ? null : false });
      view.dispatch(tr);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      touched.current = true;
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "1" || k === "2" || k === "3") {
      e.preventDefault();
      run(wrapInHeadingCommand, Number(k));
      return;
    }
    if (k === "k") {
      e.preventDefault();
      void insertLink();
      return;
    }
    if (k === "s") {
      e.preventDefault();
      onSave();
      return;
    }
    touched.current = true; // Ctrl+B/I/Z/Y are ProseMirror's own
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} onPaste={() => (touched.current = true)}
      onCut={() => (touched.current = true)}>
      <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-line px-2 py-1">
        <ToolButton title="Título 1 (Ctrl+1)" onClick={() => run(wrapInHeadingCommand, 1)}><Heading1 size={15} /></ToolButton>
        <ToolButton title="Título 2 (Ctrl+2)" onClick={() => run(wrapInHeadingCommand, 2)}><Heading2 size={15} /></ToolButton>
        <ToolButton title="Título 3 (Ctrl+3)" onClick={() => run(wrapInHeadingCommand, 3)}><Heading3 size={15} /></ToolButton>
        <ToolButton title="Texto normal" onClick={() => run(turnIntoTextCommand)}><Type size={15} /></ToolButton>
        <span className="mx-1 h-4 w-px flex-none bg-line" />
        <ToolButton title="Negrita (Ctrl+B)" onClick={() => run(toggleStrongCommand)}><Bold size={15} /></ToolButton>
        <ToolButton title="Cursiva (Ctrl+I)" onClick={() => run(toggleEmphasisCommand)}><Italic size={15} /></ToolButton>
        <ToolButton title="Tachado" onClick={() => run(toggleStrikethroughCommand)}><Strikethrough size={15} /></ToolButton>
        <ToolButton title="Código en línea" onClick={() => run(toggleInlineCodeCommand)}><Code size={15} /></ToolButton>
        <ToolButton title="Bloque de código" onClick={() => run(createCodeBlockCommand)}><SquareCode size={15} /></ToolButton>
        <span className="mx-1 h-4 w-px flex-none bg-line" />
        <ToolButton title="Lista con viñetas" onClick={() => run(wrapInBulletListCommand)}><List size={15} /></ToolButton>
        <ToolButton title="Lista numerada" onClick={() => run(wrapInOrderedListCommand)}><ListOrdered size={15} /></ToolButton>
        <ToolButton title="Checklist" onClick={toggleChecklist}><ListChecks size={15} /></ToolButton>
        <ToolButton title="Cita" onClick={() => run(wrapInBlockquoteCommand)}><Quote size={15} /></ToolButton>
        <span className="mx-1 h-4 w-px flex-none bg-line" />
        <ToolButton title="Enlace (Ctrl+K)" onClick={() => void insertLink()}><Link2 size={15} /></ToolButton>
        <ToolButton title="Tabla" onClick={() => run(insertTableCommand, { row: 3, col: 3 })}><TableIcon size={15} /></ToolButton>
        <ToolButton title="Imagen" onClick={() => void insertImage()}><ImageIcon size={15} /></ToolButton>
        <ToolButton title="Línea divisora" onClick={() => run(insertHrCommand)}><Minus size={15} /></ToolButton>
        <span className="mx-1 h-4 w-px flex-none bg-line" />
        <ToolButton title="Deshacer (Ctrl+Z)" onClick={() => run(undoCommand)}><Undo2 size={15} /></ToolButton>
        <ToolButton title="Rehacer (Ctrl+Y)" onClick={() => run(redoCommand)}><Redo2 size={15} /></ToolButton>
      </div>
      <div className={cn("nv-editor nv-prose min-h-0 flex-1 overflow-y-auto", readOnly && "opacity-90")}>
        <Milkdown />
      </div>
    </div>
  );
}

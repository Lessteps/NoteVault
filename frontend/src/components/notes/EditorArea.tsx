import {
  ArrowLeftRight,
  AlertTriangle, ArrowUp, BookOpen, Bookmark, ChevronDown, ChevronRight, Columns2, FileText, Folder,
  Link2, PenLine, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { Mentions, SearchHit } from "../../lib/types";
import { useVirtualList } from "../../lib/useVirtualList";
import { useApp, type OpenNote, type ViewMode } from "../../store/app";
import { cn, IconButton, Kbd, openMenu, type MenuItem } from "../ui";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { newNoteIn } from "./FileTree";
import { ReadView } from "./ReadView";
import { PracticeView } from "../practice/PracticeView";
import { ExerciseFolderView } from "../practice/ExerciseFolderView";
import { InkPad } from "../practice/InkPad";
import { ResumenView } from "../study/ResumenView";
import { TeoricaView } from "../study/TeoricaView";
import { TopicFileView } from "../study/TopicFileView";
import { viewFileKind } from "../../lib/viewFiles";
import { isProofNote, LadderView, useLadder } from "../practice/LadderView";
import { SourceEditor } from "./SourceEditor";
import { FormatBar } from "./FormatBar";


const MODES: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
  { id: "read", label: "Lectura", icon: <BookOpen size={13} /> },
  { id: "edit", label: "Editar", icon: <PenLine size={13} /> },
  { id: "split", label: "Dividido", icon: <Columns2 size={13} /> },
];

/**
 * The contents of a folder as a menu, like walking the file explorer from the path bar:
 * a folder drills down, a file opens, and the first entry goes one level up.
 */
function browseFolder(dir: string, at: { clientX: number; clientY: number }): void {
  void api.listDir(dir).then((entries) => {
    const s = useApp.getState();
    const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
    const items: MenuItem[] = [];
    if (dir) {
      items.push(
        { label: `Subir a ${parent ? parent.split("/").pop() : "la raíz del vault"}`, icon: <ArrowUp />, onSelect: () => browseFolder(parent, at) },
        { separator: true },
      );
    }
    const sorted = [...entries].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "es", { numeric: true }) : a.type === "folder" ? -1 : 1));
    for (const e of sorted.slice(0, 80)) {
      items.push(
        e.type === "folder"
          ? { label: e.name, icon: <Folder />, hint: "›", onSelect: () => browseFolder(e.path, at) }
          : {
              label: e.name,
              icon: <FileText />,
              onSelect: () => (e.kind === "canvas" ? s.openTab({ kind: "canvas", path: e.path }) : void s.openNote(e.path)),
            },
      );
    }
    if (!sorted.length) items.push({ label: "Carpeta vacía", disabled: true });
    openMenu({ clientX: at.clientX, clientY: at.clientY, preventDefault: () => undefined }, items);
  }).catch((e: Error) => useApp.getState().toast("error", e.message));
}

function NoteHeader({ note }: { note: OpenNote }) {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const toggleBookmark = useApp((s) => s.toggleBookmark);
  const parts = note.path.split("/");
  const { openSide } = useApp.getState();
  return (
    <div className="flex h-11 flex-none items-center gap-2 border-b border-line bg-surface px-3">
      <nav className="flex min-w-0 items-center gap-1 font-mono text-[11.5px]" aria-label="Ruta del archivo">
        {parts.map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span className="text-faint">/</span>}
            {/* Every part of the path is a door: it lists that folder (the last one, its own) so you can walk back. */}
            <button
              type="button"
              title={i === parts.length - 1 ? "Ver la carpeta de este archivo" : `Explorar ${p}`}
              onClick={(e) => browseFolder(parts.slice(0, Math.min(i + 1, parts.length - 1)).join("/"), e)}
              className={cn("truncate rounded px-0.5 hover:bg-hover hover:text-text", i === parts.length - 1 ? "font-semibold text-text" : "text-dim")}
            >
              {p}
            </button>
          </span>
        ))}
      </nav>
      <div className="flex-1" />
      <IconButton
        title={note.bookmarked ? "Quitar marcador" : "Añadir marcador"}
        onClick={() => void toggleBookmark(note.path)}
        active={note.bookmarked}
      >
        <Bookmark size={15} fill={note.bookmarked ? "currentColor" : "none"} />
      </IconButton>
      {/* Open-to-the-right button */}
      <button
        type="button"
        title="Abrir a la derecha"
        onClick={() => void openSide(note.path)}
        className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-hover hover:text-text"
      >
        <Columns2 size={14} />
      </button>
      <div className="flex rounded-lg border border-line bg-panel p-0.5" role="tablist" aria-label="Modo">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors",
              mode === m.id ? "bg-accent text-white" : "text-dim hover:text-text",
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConflictBanner({ note }: { note: OpenNote }) {
  const reload = useApp((s) => s.reload);
  const save = useApp((s) => s.save);
  return (
    <div className="flex flex-none items-center gap-3 border-b border-warn/30 bg-warn-soft px-4 py-2 text-[12.5px] text-text">
      <AlertTriangle size={15} className="flex-none text-warn" />
      <span className="flex-1">
        Este archivo cambió fuera de NoteVault mientras lo editabas. Elige qué versión conservar.
      </span>
      <button
        type="button"
        onClick={() => void reload(note.path)}
        className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] hover:bg-hover"
      >
        Usar la del disco
      </button>
      <button
        type="button"
        onClick={() => void save(note.path, { force: true })}
        className="rounded-md bg-warn px-2.5 py-1 text-[12px] font-semibold text-black hover:opacity-90"
      >
        Conservar la mía
      </button>
    </div>
  );
}

function BacklinksBar({ note }: { note: OpenNote }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Mentions | null>(null);
  const openNote = useApp((s) => s.openNote);

  useEffect(() => {
    setData(null);
    if (note.kind !== "note") return;
    let alive = true;
    const t = setTimeout(() => {
      api.mentions(note.path)
        .then((m) => alive && setData(m))
        .catch(() => alive && setData({ linked: [], unlinked: [] }));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [note.path, note.kind]);

  if (note.kind !== "note") return null;
  const count = data?.linked.length;
  return (
    <div className="flex-none border-t border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 px-4 text-left"
      >
        {open ? <ChevronDown size={14} className="text-faint" /> : <ChevronRight size={14} className="text-faint" />}
        <Link2 size={14} className="text-dim" />
        <span className="text-[12.5px] font-semibold text-text">Backlinks &amp; Menciones</span>
        <span className="rounded-md border border-accent/30 bg-accent-soft px-2 font-mono text-[10.5px] text-accent-text">
          {count === undefined ? "…" : `${count} referenciados`}
        </span>
        {data && data.unlinked.length > 0 && (
          <span className="font-mono text-[10.5px] text-faint">· {data.unlinked.length} sin enlazar</span>
        )}
      </button>
      {open && data && (
        <div className="grid max-h-56 grid-cols-2 gap-4 px-4 pb-3">
          <MentionsColumn
            label="Menciones enlazadas"
            list={data.linked}
            onSelect={(path, line) => void openNote(path, { line })}
          />
          <MentionsColumn
            label="Menciones sin enlazar"
            list={data.unlinked}
            onSelect={(path, line) => void openNote(path, { line })}
          />
        </div>
      )}
    </div>
  );
}

function MentionsColumn({
  label,
  list,
  onSelect,
}: {
  label: string;
  list: SearchHit[];
  onSelect: (path: string, line: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualList({
    itemCount: list.length,
    itemHeight: 46,
    containerRef,
    overscan: 4,
  });

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1 flex-none font-mono text-[10.5px] uppercase tracking-wider text-faint">
        {label} ({list.length})
      </div>
      {list.length === 0 ? (
        <div className="text-[12px] text-faint">Nada todavía.</div>
      ) : (
        <div ref={containerRef} className="max-h-48 overflow-y-auto pr-1">
          <div style={{ height: virtual.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${virtual.startOffset}px)` }}>
              {list.slice(virtual.startIndex, virtual.endIndex).map((m) => (
                <button
                  key={`${m.path}:${m.line_no}`}
                  type="button"
                  onClick={() => onSelect(m.path, m.line_no)}
                  className="nv-backlink-item block h-[46px] w-full rounded-md px-2 py-1 text-left hover:bg-hover"
                >
                  <div className="flex items-center justify-between gap-2 text-[12.5px] text-text">
                    <span className="truncate">{m.title}</span>
                    <span className="flex-none font-mono text-[10px] text-faint">ln {m.line_no}</span>
                  </div>
                  <div className="truncate text-[11.5px] text-dim">{m.line}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Editor({ note }: { note: OpenNote }) {
  const editRaw = useApp((s) => s.editRaw);
  const setCursor = useApp((s) => s.setCursor);
  const clearReveal = useApp((s) => s.clearReveal);
  const onChange = useCallback((raw: string) => editRaw(note.path, raw), [editRaw, note.path]);
  const onRevealed = useCallback(() => clearReveal(note.path), [clearReveal, note.path]);
  return (
    <SourceEditor
      key={note.path}
      value={note.raw}
      eol={note.eol}
      code={note.kind === "code"}
      onChange={onChange}
      onCursor={(line, col) => setCursor({ line, col })}
      revealLine={note.revealLine}
      onRevealed={onRevealed}
    />
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line bg-surface px-3">
        <span className="text-[12px] text-faint">Notas</span>
      </div>
      <div className="grid flex-1 place-items-center bg-surface">
        <div className="max-w-sm text-center">
          <div className="text-[16px] font-semibold text-text">Sin nota abierta</div>
          <p className="mt-2 text-[13px] leading-relaxed text-dim">
            Elige una nota en el explorador, o busca y crea con <Kbd>Ctrl P</Kbd>.
          </p>
          <button
            type="button"
            onClick={() => void newNoteIn("")}
            className="mt-5 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-strong"
          >
            Nueva nota
          </button>
        </div>
      </div>
    </div>
  );
}

/** Exercise notes (type: exercise) open in the practice view to be read. */
function isExercise(note: { kind: string; frontmatter: Record<string, unknown> }): boolean {
  return note.kind === "note" && String(note.frontmatter?.type ?? "").trim().toLowerCase() === "exercise";
}

/**
 * View files (`type: practica` / `teorica` / `resumen`) open their own
 * full-screen surface instead of the markdown editor, the same way an exercise
 * note opens the practice view. See lib/viewFiles.ts (core mirrors it).
 */
function isViewFile(note: { kind: string; frontmatter: Record<string, unknown> }, kind: string): boolean {
  return note.kind === "note" && viewFileKind(note.frontmatter) === kind;
}

export function EditorArea() {
  const note = useApp((s) => (s.active ? s.notes[s.active] : undefined));
  const side = useApp((s) => (s.side && s.side !== s.active ? s.notes[s.side] : undefined));
  const inkDraft = useApp((s) => s.inkDraft);
  const mode = useApp((s) => s.mode);
  const ladderOn = useLadder((s) => (note ? s.open.has(note.path) : false));
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {!note ? (
            <EmptyState />
          ) : (
            <>
              <NoteHeader note={note} />
              {/* La barra de formato vive justo debajo de Lectura / Editar: en
                  modo lectura no hay nada que formatear. */}
              {mode !== "read" && note.kind === "note" && <FormatBar />}
              {note.conflict && <ConflictBanner note={note} />}
              {/* Una nota que rompe su vista no puede llevarse la ventana: la red
                  muestra qué pasó y la nota se sigue pudiendo editar. */}
              <ErrorBoundary key={note.path} path={note.path} what="La vista de la nota">
              <div className="flex min-h-0 flex-1">
                {mode !== "read" && (
                  <div className={cn("min-h-0 min-w-0", mode === "split" ? "w-1/2 border-r border-line" : "flex-1")}>
                    <Editor note={note} />
                  </div>
                )}
                {mode !== "edit" && (
                  <div className={cn("min-h-0 min-w-0", mode === "split" ? "w-1/2" : "flex-1")}>
                    {mode === "read" && isViewFile(note, "practica") ? <TopicFileView note={note} />
                      : mode === "read" && isViewFile(note, "teorica") ? <TeoricaView note={note} />
                        : mode === "read" && isViewFile(note, "resumen") ? <ResumenView note={note} />
                        : mode === "read" && isViewFile(note, "ejercicios") ? <ExerciseFolderView note={note} />
                        : mode === "read" && isViewFile(note, "dibujo") ? <InkPad note={note} />
                        : mode === "read" && isExercise(note) ? <PracticeView note={note} />
                      : mode === "read" && ladderOn ? <LadderView path={note.path} onExit={() => useLadder.getState().set(note.path, false)} />
                        : (
                          <div className="flex h-full flex-col">
                            {mode === "read" && note.kind === "note" && isProofNote(note.frontmatter) && (
                              <div className="flex flex-none items-center gap-3 border-b border-line bg-accent-soft px-5 py-2 text-[12.5px] text-text">
                                Esta nota es una demostración.
                                <button type="button" onClick={() => useLadder.getState().set(note.path, true)}
                                  className="rounded-md bg-accent px-2.5 py-1 font-semibold text-white hover:bg-accent-strong">
                                  ▶ Practicar demostración
                                </button>
                              </div>
                            )}
                            <div className="min-h-0 flex-1"><ReadView note={note} /></div>
                          </div>
                        )}
                  </div>
                )}
              </div>
              </ErrorBoundary>
              <BacklinksBar note={note} />
            </>
          )}
        </div>
        {side && (
          <ErrorBoundary key={`side:${side.path}`} path={side.path} what="La vista del panel derecho">
            <SidePane note={side} />
          </ErrorBoundary>
        )}
        {inkDraft && (
          <section aria-label="Dibujo LaTeX" className="flex w-1/2 min-w-0 flex-none flex-col border-l border-line-strong">
            <InkPad folder={inkDraft.folder} />
          </section>
        )}
      </div>
    </main>
  );
}

/** The second note of the split view: read or edited on its own. */
function SidePane({ note }: { note: OpenNote }) {
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label="Panel derecho" className="flex w-1/2 min-w-0 flex-none flex-col border-l border-line-strong">
      <div className="flex h-10 flex-none items-center gap-2 border-b border-line bg-panel px-3">
        <FileText size={14} className="flex-none text-accent-text" />
        <span className="truncate text-[12.5px] font-semibold text-text" title={note.path}>{note.title}</span>
        {note.dirty && <span className="h-2 w-2 flex-none rounded-full bg-accent" title="Sin guardar" />}
        <div className="flex-1" />
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {([[false, "Lectura"], [true, "Editar"]] as const).map(([on, label]) => (
            <button key={label} type="button" onClick={() => setEditing(on)}
              className={cn("h-6 rounded-md px-2 text-[11px]", editing === on ? "bg-accent text-white" : "text-dim hover:text-text")}>
              {label}
            </button>
          ))}
        </div>
        <IconButton title="Hacerla la nota principal" onClick={() => useApp.getState().setActive(note.path)}><ArrowLeftRight size={14} /></IconButton>
        <IconButton title="Cerrar panel derecho" onClick={() => void useApp.getState().openSide(null)}><X size={14} /></IconButton>
      </div>
      <div className="min-h-0 flex-1">{editing ? <Editor note={note} /> : isViewFile(note, "dibujo") ? <InkPad note={note} /> : <ReadView note={note} />}</div>
    </section>
  );
}

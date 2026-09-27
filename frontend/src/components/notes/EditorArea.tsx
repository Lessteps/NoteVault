import {
  ArrowLeftRight,
  AlertTriangle, BookOpen, Bookmark, ChevronDown, ChevronRight, Columns2, FileCode2, FileText,
  Globe, Link2, PanelLeft, PanelRight, PenLine, Plus, Sparkles, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { Mentions, SearchHit } from "../../lib/types";
import { useVirtualList } from "../../lib/useVirtualList";
import { useApp, type OpenNote, type ViewMode } from "../../store/app";
import { cn, IconButton, Kbd, openMenu } from "../ui";
import { newNoteIn } from "./FileTree";
import { ReadView } from "./ReadView";
import { PracticeView } from "../practice/PracticeView";
import { isProofNote, LadderView, useLadder } from "../practice/LadderView";
import { SourceEditor } from "./SourceEditor";
import { StudyBar } from "./StudyBar";
import { useAssistant } from "../../store/assistant";

function TabBar() {
  const tabs = useApp((s) => s.tabs);
  const active = useApp((s) => s.active);
  const notes = useApp((s) => s.notes);
  const setActive = useApp((s) => s.setActive);
  const closeTab = useApp((s) => s.closeTab);
  return (
    <div className="flex h-10 flex-none items-end overflow-x-auto border-b border-line bg-panel">
      {tabs.map((path) => {
        const n = notes[path];
        if (!n) return null;
        const on = path === active;
        return (
          <div
            key={path}
            role="tab"
            aria-selected={on}
            title={path}
            onClick={() => setActive(path)}
            onAuxClick={(e) => e.button === 1 && void closeTab(path)}
            onContextMenu={(e) => openMenu(e, [
              { label: "Abrir a la derecha", icon: <Columns2 />, onSelect: () => void useApp.getState().openSide(path) },
              { label: "Cerrar", icon: <X />, onSelect: () => void closeTab(path) },
              { label: "Cerrar las demás", onSelect: () => {
                for (const t of useApp.getState().tabs) if (t !== path) void closeTab(t);
              } },
            ])}
            className={cn(
              "group flex h-full max-w-[240px] flex-none cursor-pointer items-center gap-2 border-r border-line px-3 text-[12.5px]",
              on
                ? "bg-surface text-text shadow-[inset_0_2px_0_var(--nv-accent)]"
                : "text-dim hover:bg-hover hover:text-text",
            )}
          >
            {n.kind === "code"
              ? <FileCode2 size={14} className="flex-none text-mint" />
              : <FileText size={14} className="flex-none text-accent-text" />}
            <span className="truncate">{n.title}</span>
            <button
              type="button"
              title="Cerrar (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(path);
              }}
              className="relative grid h-5 w-5 flex-none place-items-center rounded text-faint hover:bg-hover hover:text-text"
            >
              {n.dirty || n.saving ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-accent group-hover:hidden" />
                  <X size={13} className="hidden group-hover:block" />
                </>
              ) : (
                <X size={13} className={on ? "" : "opacity-0 group-hover:opacity-100"} />
              )}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        title="Nueva nota"
        onClick={() => void newNoteIn("")}
        className="mb-1.5 ml-1 grid h-7 w-7 flex-none place-items-center rounded-md text-faint hover:bg-hover hover:text-text"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

const MODES: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
  { id: "read", label: "Lectura", icon: <BookOpen size={13} /> },
  { id: "edit", label: "Editar", icon: <PenLine size={13} /> },
  { id: "split", label: "Dividido", icon: <Columns2 size={13} /> },
];

function NoteHeader({ note }: { note: OpenNote }) {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const toggleBookmark = useApp((s) => s.toggleBookmark);
  const toggleExplorer = useApp((s) => s.toggleExplorer);
  const toggleInspector = useApp((s) => s.toggleInspector);
  const explorerOpen = useApp((s) => s.explorerOpen);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const assistantOpen = useAssistant((s) => s.open);
  const parts = note.path.split("/");
  return (
    <div className="flex h-11 flex-none items-center gap-2 border-b border-line bg-surface px-3">
      <IconButton title="Explorador (Ctrl+\)" onClick={toggleExplorer} active={explorerOpen}>
        <PanelLeft size={15} />
      </IconButton>
      <nav className="flex min-w-0 items-center gap-1 font-mono text-[11.5px]">
        {parts.map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span className="text-faint">/</span>}
            <span className={cn("truncate", i === parts.length - 1 ? "font-semibold text-text" : "text-dim")}>{p}</span>
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
      <IconButton title="Asistente IA" onClick={() => useAssistant.getState().setOpen(!useAssistant.getState().open)} active={assistantOpen}>
        <Sparkles size={15} />
      </IconButton>
      <IconButton title="Navegador web" onClick={() => useApp.getState().setModule("web")}>
        <Globe size={15} />
      </IconButton>
      <IconButton title="Panel lateral" onClick={() => {
        if (assistantOpen) {
          useAssistant.getState().setOpen(false);
          if (!inspectorOpen) toggleInspector();
        } else toggleInspector();
      }} active={inspectorOpen && !assistantOpen}>
        <PanelRight size={15} />
      </IconButton>
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
  const toggleExplorer = useApp((s) => s.toggleExplorer);
  const toggleInspector = useApp((s) => s.toggleInspector);
  const explorerOpen = useApp((s) => s.explorerOpen);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const assistantOpen = useAssistant((s) => s.open);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line bg-surface px-3">
        <IconButton title="Explorador (Ctrl+\)" onClick={toggleExplorer} active={explorerOpen}>
          <PanelLeft size={15} />
        </IconButton>
        <span className="text-[12px] text-faint">Notas</span>
        <div className="flex-1" />
        <IconButton title="Asistente IA" onClick={() => useAssistant.getState().setOpen(!useAssistant.getState().open)} active={assistantOpen}>
          <Sparkles size={15} />
        </IconButton>
        <IconButton
          title="Navegador web"
          onClick={() => useApp.getState().setModule("web")}
        >
          <Globe size={15} />
        </IconButton>
        <IconButton
          title="Panel lateral"
          onClick={() => {
            if (assistantOpen) {
              useAssistant.getState().setOpen(false);
              if (!inspectorOpen) toggleInspector();
            } else toggleInspector();
          }}
          active={inspectorOpen && !assistantOpen}
        >
          <PanelRight size={15} />
        </IconButton>
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

export function EditorArea() {
  const note = useApp((s) => (s.active ? s.notes[s.active] : undefined));
  const side = useApp((s) => (s.side && s.side !== s.active ? s.notes[s.side] : undefined));
  const mode = useApp((s) => s.mode);
  const hasTabs = useApp((s) => s.tabs.length > 0);
  const ladderOn = useLadder((s) => (note ? s.open.has(note.path) : false));
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface">
      {hasTabs && <TabBar />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {!note ? (
            <EmptyState />
          ) : (
            <>
              <NoteHeader note={note} />
              {note.kind === "note" && <StudyBar note={note} />}
              {note.conflict && <ConflictBanner note={note} />}
              <div className="flex min-h-0 flex-1">
                {mode !== "read" && (
                  <div className={cn("min-h-0 min-w-0", mode === "split" ? "w-1/2 border-r border-line" : "flex-1")}>
                    <Editor note={note} />
                  </div>
                )}
                {mode !== "edit" && (
                  <div className={cn("min-h-0 min-w-0", mode === "split" ? "w-1/2" : "flex-1")}>
                    {mode === "read" && isExercise(note) ? <PracticeView note={note} />
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
              <BacklinksBar note={note} />
            </>
          )}
        </div>
        {side && <SidePane note={side} />}
      </div>
    </main>
  );
}

/** The second note of the split view: read or edited on its own. */
function SidePane({ note }: { note: OpenNote }) {
  const [editing, setEditing] = useState(false);
  const s = useApp.getState();
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
        <IconButton title="Hacerla la nota principal" onClick={() => s.setActive(note.path)}><ArrowLeftRight size={14} /></IconButton>
        <IconButton title="Cerrar panel derecho" onClick={() => void s.openSide(null)}><X size={14} /></IconButton>
      </div>
      <div className="min-h-0 flex-1">{editing ? <Editor note={note} /> : <ReadView note={note} />}</div>
    </section>
  );
}

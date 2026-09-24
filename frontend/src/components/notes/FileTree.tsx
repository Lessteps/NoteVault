import {
  Bookmark, ChevronRight, FileCode2, FilePlus, FileText, Folder, FolderOpen, FolderPlus,
  LayoutDashboard, Pencil, SquareArrowOutUpRight, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { api } from "../../lib/bridge";
import type { IndexEntry, TreeEntry } from "../../lib/types";
import { useApp } from "../../store/app";
import { useCanvas } from "../../store/canvas";
import { askText, cn, confirmAction, openMenu } from "../ui";

const EXPANDED_KEY = "nv.tree.expanded";
export const DRAG_MIME = "application/x-notevault-path";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export async function newNoteIn(folder: string): Promise<void> {
  const title = await askText("Nueva nota", "", "Crear");
  if (!title) return;
  const s = useApp.getState();
  try {
    const { path } = await api.createNote(title, folder);
    s.refreshTree();
    await s.openNote(path);
    s.setMode("edit");
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

export async function newCanvasIn(folder: string): Promise<void> {
  const title = await askText("Nuevo canvas", "", "Crear");
  if (!title) return;
  const s = useApp.getState();
  try {
    const { path } = await api.canvasCreate(title, folder);
    s.refreshTree();
    s.setModule("notas");
    await useCanvas.getState().open(path);
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

export async function newFolderIn(parent: string): Promise<void> {
  const name = await askText("Nueva carpeta", "", "Crear");
  if (!name) return;
  const s = useApp.getState();
  try {
    await api.createFolder(name, parent);
    s.refreshTree();
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

async function renameEntry(entry: TreeEntry) {
  const current = entry.type === "note" && entry.kind === "note" ? entry.name : entry.path.split("/").pop()!;
  const name = await askText("Renombrar", current, "Renombrar");
  if (!name || name === current) return;
  const s = useApp.getState();
  try {
    const { path } = await api.rename(entry.path, name);
    s.pathRenamed(entry.path, path);
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

async function trashEntry(entry: TreeEntry) {
  const ok = await confirmAction(
    "Mover a la papelera",
    `«${entry.name}» se moverá a la carpeta .trash del vault. Puedes recuperarlo desde ahí.`,
    "Mover a la papelera",
    true,
  );
  if (!ok) return;
  const s = useApp.getState();
  try {
    await api.remove(entry.path);
    s.pathDeleted(entry.path);
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

async function moveInto(src: string, destFolder: string) {
  if (!src || parentOf(src) === destFolder || src === destFolder) return;
  const s = useApp.getState();
  try {
    const { path } = await api.move(src, destFolder);
    s.pathRenamed(src, path);
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

function openEntry(entry: TreeEntry) {
  const s = useApp.getState();
  if (entry.kind === "canvas") {
    void useCanvas.getState().open(entry.path);
    return;
  }
  void s.openNote(entry.path);
}

function EntryIcon({ entry, open }: { entry: TreeEntry; open: boolean }) {
  const cls = "h-4 w-4 flex-none";
  if (entry.type === "folder") {
    return open ? <FolderOpen className={cn(cls, "text-dim")} strokeWidth={1.7} />
      : <Folder className={cn(cls, "text-dim")} strokeWidth={1.7} />;
  }
  if (entry.kind === "code") return <FileCode2 className={cn(cls, "text-mint")} strokeWidth={1.7} />;
  if (entry.kind === "canvas") return <LayoutDashboard className={cn(cls, "text-warn")} strokeWidth={1.7} />;
  return <FileText className={cn(cls, "text-accent-text")} strokeWidth={1.7} />;
}

export function FileTree({ filter }: { filter: string }) {
  const version = useApp((s) => s.treeVersion);
  const active = useApp((s) => s.active);
  const [children, setChildren] = useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    try {
      const entries = await api.listDir(path);
      setChildren((c) => ({ ...c, [path]: entries }));
    } catch {
      // A folder that vanished: drop it from the expanded set.
      setExpanded((ex) => {
        const next = new Set(ex);
        next.delete(path);
        return next;
      });
    }
  }, []);

  // (Re)load the root and every open folder whenever the tree changes.
  useEffect(() => {
    void load("");
    for (const p of loadExpanded()) void load(p);
    setIndex(null);
  }, [version, load]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  // The filter searches every note, not just the folders already opened.
  useEffect(() => {
    if (filter && index === null) {
      api.noteIndex().then(setIndex).catch(() => setIndex([]));
    }
  }, [filter, index]);

  const toggle = (path: string) => {
    setExpanded((ex) => {
      const next = new Set(ex);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        if (!children[path]) void load(path);
      }
      return next;
    });
  };

  const onDragStart = (e: DragEvent, path: string) => {
    e.dataTransfer.setData(DRAG_MIME, path);
    e.dataTransfer.effectAllowed = "move";
  };
  const dropProps = (folder: string) => ({
    "data-dropzone": "1",
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget((t) => (t === folder ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      void moveInto(e.dataTransfer.getData(DRAG_MIME), folder);
    },
  });

  const menuFor = (entry: TreeEntry) => (e: React.MouseEvent) => {
    const s = useApp.getState();
    const items = entry.type === "folder"
      ? [
        { label: "Nueva nota aquí", icon: <FilePlus />, onSelect: () => void newNoteIn(entry.path) },
        { label: "Nueva carpeta aquí", icon: <FolderPlus />, onSelect: () => void newFolderIn(entry.path) },
        { label: "Nuevo canvas aquí", icon: <LayoutDashboard />, onSelect: () => void newCanvasIn(entry.path) },
        { label: "Renombrar", icon: <Pencil />, onSelect: () => void renameEntry(entry) },
        { label: "Mover a la papelera", icon: <Trash2 />, danger: true, onSelect: () => void trashEntry(entry) },
      ]
      : [
        { label: "Abrir", icon: <SquareArrowOutUpRight />, onSelect: () => openEntry(entry) },
        { label: "Marcador", icon: <Bookmark />, onSelect: () => void s.toggleBookmark(entry.path) },
        { label: "Renombrar", icon: <Pencil />, onSelect: () => void renameEntry(entry) },
        { label: "Mover a la papelera", icon: <Trash2 />, danger: true, onSelect: () => void trashEntry(entry) },
      ];
    openMenu(e, items);
  };

  const renderEntries = (entries: TreeEntry[] | undefined, depth: number) =>
    entries?.map((entry) => {
      const isFolder = entry.type === "folder";
      const open = isFolder && expanded.has(entry.path);
      return (
        <div key={entry.path}>
          <div
            role="treeitem"
            aria-expanded={isFolder ? open : undefined}
            draggable
            onDragStart={(e) => onDragStart(e, entry.path)}
            {...(isFolder ? dropProps(entry.path) : {})}
            onClick={() => (isFolder ? toggle(entry.path) : openEntry(entry))}
            onAuxClick={(e) => e.button === 1 && !isFolder && openEntry(entry)}
            onContextMenu={menuFor(entry)}
            className={cn(
              "group flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md pr-2 text-[13px]",
              active === entry.path
                ? "bg-accent-soft text-text"
                : "text-dim hover:bg-hover hover:text-text",
              dropTarget === entry.path && "outline outline-1 outline-accent",
            )}
            style={{ paddingLeft: 6 + depth * 14 }}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 flex-none text-faint transition-transform",
                !isFolder || entry.has_children === false ? "invisible" : "",
                open && "rotate-90",
              )}
            />
            <EntryIcon entry={entry} open={open} />
            <span className="truncate">{entry.name}</span>
          </div>
          {open && renderEntries(children[entry.path], depth + 1)}
        </div>
      );
    });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !index) return null;
    return index
      .filter((n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
      .slice(0, 200);
  }, [filter, index]);

  if (filtered) {
    return (
      <div className="flex flex-col gap-px px-2 py-1">
        {filtered.length === 0 && <div className="px-2 py-3 text-[12px] text-faint">Sin coincidencias.</div>}
        {filtered.map((n) => (
          <button
            key={n.path}
            type="button"
            onClick={() => void useApp.getState().openNote(n.path)}
            className={cn(
              "flex flex-col items-start rounded-md px-2 py-1.5 text-left",
              active === n.path ? "bg-accent-soft" : "hover:bg-hover",
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] text-text">
              <FileText className="h-3.5 w-3.5 text-accent-text" /> {n.title}
            </span>
            <span className="truncate pl-5 font-mono text-[10.5px] text-faint">{parentOf(n.path) || "/"}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="tree" className="min-h-full px-2 py-1" {...dropProps("")}>
      {renderEntries(children[""], 0)}
      {children[""]?.length === 0 && (
        <div className="px-2 py-3 text-[12px] text-faint">El vault está vacío. Crea tu primera nota.</div>
      )}
    </div>
  );
}

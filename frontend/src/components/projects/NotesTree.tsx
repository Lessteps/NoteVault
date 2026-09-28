// Notas · the explorer: every linked Windows folder as a root, with the file
// operations the brief asks for (create, rename, delete to the recycle bin, drag
// & drop, context menu, search). All of it goes through the API module, which is
// the only thing allowed to touch the disk.

import {
  ChevronDown, ChevronRight, File as FileIcon, FileCode, FilePlus, FileText, Folder,
  FolderOpen, FolderPlus, Image as ImageIcon, RefreshCw, Search, Star, Trash2, Unlink,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import type { FolderEntry, ProjectFolder } from "../../lib/types";
import { useApp } from "../../store/app";
import { askText, cn, confirmAction, IconButton, openMenu, type MenuItem } from "../ui";

export interface OpenTarget {
  folderId: string;
  rel: string;
}

interface Node {
  entry: FolderEntry;
  children: Node[];
}

/** The flat list the API returns, nested by path and sorted folders-first. */
function buildTree(entries: FolderEntry[]): Node[] {
  const byRel = new Map<string, Node>();
  for (const e of entries) byRel.set(e.rel, { entry: e, children: [] });
  const roots: Node[] = [];
  for (const node of byRel.values()) {
    const cut = node.entry.rel.lastIndexOf("/");
    const parentRel = cut < 0 ? "" : node.entry.rel.slice(0, cut);
    const parent = parentRel ? byRel.get(parentRel) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: Node[]): void => {
    nodes.sort((a, b) => (a.entry.dir !== b.entry.dir ? (a.entry.dir ? -1 : 1) : a.entry.name.localeCompare(b.entry.name, "es")));
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

function iconFor(entry: FolderEntry) {
  if (entry.dir) return <Folder size={13} className="flex-none text-warn" />;
  const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"].includes(ext)) {
    return <ImageIcon size={13} className="flex-none text-info" />;
  }
  if ([".md", ".markdown"].includes(ext)) return <FileText size={13} className="flex-none text-accent-text" />;
  if ([".json", ".yml", ".yaml", ".csv", ".txt"].includes(ext)) return <FileCode size={13} className="flex-none text-mint" />;
  if (ext === ".pdf") return <FileText size={13} className="flex-none text-danger" />;
  return <FileIcon size={13} className="flex-none text-faint" />;
}

export function NotesTree({ pid, folders, active, onOpen, onFolders, className }: {
  pid: string;
  folders: ProjectFolder[];
  active: OpenTarget | null;
  onOpen: (t: OpenTarget) => void;
  /** The project's folder list changed (linked, unlinked, destination moved). */
  onFolders: () => void;
  className?: string;
}) {
  const toast = useApp((s) => s.toast);
  const [trees, setTrees] = useState<Record<string, FolderEntry[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const fail = (e: unknown) => toast("error", (e as Error).message);
  const keyOf = (folderId: string, rel: string) => `${folderId}:${rel}`;
  const folderIds = folders.map((f) => f.id).join(",");

  /** Reads the tree of one folder, or of every linked folder. */
  const reload = async (folderId?: string) => {
    const list = folderId ? folders.filter((f) => f.id === folderId) : folders;
    if (!pid) return;
    await Promise.all(list.map(async (f) => {
      if (f.missing) return;
      try {
        const r = await api.projectFolderTree(pid, f.id);
        setTrees((t) => ({ ...t, [f.id]: r.entries }));
      } catch (e) {
        fail(e);
      }
    }));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, folderIds]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out = new Set<string>();
    for (const [folderId, entries] of Object.entries(trees)) {
      for (const e of entries) if (e.name.toLowerCase().includes(q)) out.add(keyOf(folderId, e.rel));
    }
    return out;
  }, [query, trees]);

  const create = async (folder: ProjectFolder, rel: string, isFolder: boolean) => {
    const name = await askText(isFolder ? "Nueva carpeta" : "Nuevo archivo", "", "Crear");
    if (!name) return;
    try {
      const r = await api.projectFileCreate(pid, folder.id, rel, name, isFolder);
      await reload(folder.id);
      if (!isFolder) onOpen({ folderId: folder.id, rel: r.entry.rel });
    } catch (e) {
      fail(e);
    }
  };

  const rename = async (folder: ProjectFolder, entry: FolderEntry) => {
    const name = await askText("Renombrar", entry.name, "Renombrar");
    if (!name || name === entry.name) return;
    try {
      await api.projectFileRename(pid, folder.id, entry.rel, name);
      await reload(folder.id);
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (folder: ProjectFolder, entry: FolderEntry) => {
    const what = entry.dir ? "la carpeta y todo su contenido" : "el archivo";
    if (!(await confirmAction("Eliminar", `¿Enviar ${what} «${entry.name}» a la papelera de Windows?`, "A la papelera", true))) return;
    try {
      await api.projectFileDelete(pid, folder.id, entry.rel);
      await reload(folder.id);
    } catch (e) {
      fail(e);
    }
  };

  const move = async (from: { folder: ProjectFolder; entry: FolderEntry }, to: { folder: ProjectFolder; rel: string }) => {
    if (from.folder.id === to.folder.id && (from.entry.rel === to.rel || from.entry.rel.startsWith(`${to.rel}/`))) return;
    try {
      await api.projectFileMove(pid, from.folder.id, from.entry.rel, to.rel, to.folder.id === from.folder.id ? "" : to.folder.id);
      await reload(from.folder.id);
      if (to.folder.id !== from.folder.id) await reload(to.folder.id);
    } catch (e) {
      fail(e);
    }
  };

  /** The payload of the node being dragged, or null. */
  const dragged = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("text/nv-node");
    if (!raw) return null;
    const from = JSON.parse(raw) as { folderId: string; rel: string };
    const fromFolder = folders.find((f) => f.id === from.folderId);
    const entry = (trees[from.folderId] ?? []).find((x) => x.rel === from.rel);
    return fromFolder && entry ? { folder: fromFolder, entry } : null;
  };

  const menuFor = (e: React.MouseEvent, folder: ProjectFolder, entry?: FolderEntry) => {
    const dir = entry ? entry.dir : true;
    const rel = entry ? entry.rel : "";
    const items: MenuItem[] = [];
    if (entry && !entry.dir) {
      items.push({ label: "Abrir", icon: <FileText size={13} />, onSelect: () => onOpen({ folderId: folder.id, rel: entry.rel }) });
      items.push({ label: "Abrir con el programa predeterminado", onSelect: () => void api.projectFileOpen(pid, folder.id, entry.rel).catch(fail) });
      items.push({ separator: true });
    }
    if (dir) {
      items.push({ label: "Nuevo archivo…", icon: <FilePlus size={13} />, onSelect: () => void create(folder, rel, false) });
      items.push({ label: "Nueva carpeta…", icon: <FolderPlus size={13} />, onSelect: () => void create(folder, rel, true) });
      items.push({ separator: true });
    }
    if (entry) {
      items.push({ label: "Renombrar…", onSelect: () => void rename(folder, entry) });
      items.push({ label: "Mostrar en el Explorador", onSelect: () => void api.projectFileOpen(pid, folder.id, entry.rel, "reveal").catch(fail) });
      items.push({ label: "A la papelera", icon: <Trash2 size={13} />, danger: true, onSelect: () => void remove(folder, entry) });
      items.push({ separator: true });
    }
    if (!entry) {
      items.push({
        label: folder.target ? "Ya es la carpeta destino" : "Marcar como carpeta destino",
        icon: <Star size={13} />,
        disabled: folder.target,
        onSelect: async () => {
          try {
            await api.projectFolderTarget(pid, folder.id);
            onFolders();
          } catch (err) {
            fail(err);
          }
        },
      });
      items.push({
        label: "Migrar las notas antiguas aquí",
        onSelect: async () => {
          try {
            const r = await api.projectNotesMigrate(pid, folder.id);
            toast("info", r.moved.length ? `${r.moved.length} nota(s) copiadas a la carpeta.` : "No había notas antiguas que copiar.");
            await reload(folder.id);
          } catch (err) {
            fail(err);
          }
        },
      });
      items.push({ separator: true });
      items.push({
        label: "Desvincular carpeta",
        icon: <Unlink size={13} />,
        danger: true,
        onSelect: async () => {
          if (!(await confirmAction("Desvincular", `¿Dejar de ver «${folder.name}» desde NoteVault? No se borra nada en disco.`, "Desvincular", true))) return;
          try {
            await api.projectFolderUnlink(pid, folder.id);
            onFolders();
          } catch (err) {
            fail(err);
          }
        },
      });
    }
    openMenu(e, items);
  };

  const rows = (folder: ProjectFolder, nodes: Node[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const key = keyOf(folder.id, node.entry.rel);
      if (hits && !hits.has(key)) return null;
      const isOpen = open[key] ?? false;
      const selected = Boolean(active && active.folderId === folder.id && active.rel === node.entry.rel);
      return (
        <div key={key}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/nv-node", JSON.stringify({ folderId: folder.id, rel: node.entry.rel }));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!node.entry.dir || !e.dataTransfer.types.includes("text/nv-node")) return;
              e.preventDefault();
              setDragOver(key);
            }}
            onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
            onDrop={(e) => {
              if (!node.entry.dir || !e.dataTransfer.types.includes("text/nv-node")) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOver(null);
              const from = dragged(e);
              if (from) void move(from, { folder, rel: node.entry.rel });
            }}
            onContextMenu={(e) => menuFor(e, folder, node.entry)}
            style={{ paddingLeft: 8 + depth * 14 }}
            className={cn("group flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-1 text-[12.5px]",
              selected ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text",
              dragOver === key && "ring-1 ring-accent")}
          >
            {node.entry.dir ? (
              <button type="button" title={isOpen ? "Contraer" : "Expandir"} onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                className="flex-none text-faint">
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="w-3 flex-none" />}
            {iconFor(node.entry)}
            <button type="button" title={node.entry.rel}
              onClick={() => (node.entry.dir ? setOpen((o) => ({ ...o, [key]: !isOpen })) : onOpen({ folderId: folder.id, rel: node.entry.rel }))}
              className="min-w-0 flex-1 truncate text-left">
              {node.entry.name}
            </button>
          </div>
          {node.entry.dir && isOpen && rows(folder, node.children, depth + 1)}
        </div>
      );
    });

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
        <Search size={12} className="flex-none text-faint" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre…"
          aria-label="Buscar en las carpetas vinculadas"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-faint" />
        <IconButton title="Actualizar" className="h-6 w-6" onClick={() => void reload()}><RefreshCw size={12} /></IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!folders.length && (
          <p className="p-3 text-[12px] leading-relaxed text-faint">
            Todavía no hay carpetas vinculadas. Usa «Vincular carpeta» para trabajar aquí sobre una carpeta de Windows.
          </p>
        )}
        {folders.map((folder) => {
          const entries = trees[folder.id];
          const isOpen = open[folder.id] ?? true;
          return (
            <div key={folder.id} className="mb-0.5">
              <div
                onContextMenu={(e) => menuFor(e, folder)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("text/nv-node")) return;
                  e.preventDefault();
                  setDragOver(folder.id);
                }}
                onDragLeave={() => setDragOver((k) => (k === folder.id ? null : k))}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes("text/nv-node")) return;
                  e.preventDefault();
                  setDragOver(null);
                  const from = dragged(e);
                  if (from) void move(from, { folder, rel: "" });
                }}
                className={cn("group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover",
                  dragOver === folder.id && "ring-1 ring-accent")}
              >
                <button type="button" title={isOpen ? "Contraer" : "Expandir"} onClick={() => setOpen((o) => ({ ...o, [folder.id]: !isOpen }))}
                  className="flex-none text-faint">
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {isOpen ? <FolderOpen size={14} className="flex-none text-warn" /> : <Folder size={14} className="flex-none text-warn" />}
                <button type="button" title={folder.path} onClick={() => setOpen((o) => ({ ...o, [folder.id]: !isOpen }))}
                  className={cn("min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold", folder.missing ? "text-danger" : "text-text")}>
                  {folder.name}
                </button>
                {folder.target && (
                  <span title="Carpeta destino: aquí se crean las notas nuevas"
                    className="flex flex-none items-center gap-1 rounded-md bg-accent-soft px-1.5 py-px text-[10px] text-accent-text">
                    <Star size={9} /> destino
                  </span>
                )}
                {folder.missing && <span className="flex-none text-[10px] text-danger">no encontrada</span>}
                <IconButton title="Nuevo archivo" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => void create(folder, "", false)}>
                  <FilePlus size={12} />
                </IconButton>
              </div>
              {isOpen && (
                entries
                  ? (entries.length
                    ? rows(folder, buildTree(entries), 1)
                    : <p className="px-3 py-1 text-[11.5px] text-faint">Carpeta vacía.</p>)
                  : <p className="px-3 py-1 text-[11.5px] text-faint">{folder.missing ? "No se encuentra en el disco." : "…"}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-none items-center gap-1 border-t border-line px-2 py-1">
        <span className="text-[10.5px] text-faint">{folders.length} carpeta(s) vinculada(s)</span>
      </div>
    </div>
  );
}

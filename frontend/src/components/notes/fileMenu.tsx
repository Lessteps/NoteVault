// The right-click menu of a file or folder in the explorer.
//
// It is built here, away from the tree, for two reasons: the groups are part of
// the design (open / file / path / history / system / destructive) and this is
// the only place that knows how to spell a path in the three flavours the menu
// offers. Everything it does is handed in, so the menu can be tested without a
// tree, a vault or Electron.

import {
  AppWindow,
  Bookmark,
  BookmarkMinus,
  Clock,
  Columns2,
  Copy,
  ExternalLink,
  FilePlus,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutDashboard,
  Link2,
  MessageSquarePlus,
  Pencil,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import type { MenuItem } from "../ui";
import type { TreeEntry } from "../../lib/types";

export type PathFlavor = "obsidian" | "vault" | "system";

/** Join a vault root and a vault-relative path using the root's own separator. */
function joinVault(root: string, rel: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const trimmed = root.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${rel.split("/").join(sep)}`;
}

/**
 * The same file, spelled the three ways the menu offers:
 * an Obsidian link (`obsidian://open?vault=…&file=…`, no extension), the path
 * inside the vault, and the path on this machine.
 */
export function pathFlavors(rel: string, vaultRoot: string, vaultName: string): Record<PathFlavor, string> {
  const stem = rel.replace(/\.md$/i, "");
  return {
    obsidian: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(stem)}`,
    vault: rel,
    system: joinVault(vaultRoot, rel),
  };
}

export interface FileMenuActions {
  openInNewTab: () => void;
  openToTheRight: () => void;
  openInNewWindow: () => void;
  makeCopy: () => void;
  moveToFolder: () => void;
  toggleBookmark: () => void;
  copyPath: (flavor: PathFlavor) => void;
  versionHistory: () => void;
  openInDefaultApp: () => void;
  revealInExplorer: () => void;
  rename: () => void;
  trash: () => void;
  /** Folders only. */
  newNoteHere?: () => void;
  newFolderHere?: () => void;
  newCanvasHere?: () => void;
  /** Folders only: point the AI chat at this folder / build the topic in it. */
  addToChat?: () => void;
  generateTopic?: () => void;
}

export interface FileMenuOptions {
  entry: Pick<TreeEntry, "type" | "path" | "kind">;
  /** Known bookmark state, when the app has the note loaded. */
  bookmarked?: boolean;
  /** Whether the file can be copied (only files are duplicated). */
  canCopy?: boolean;
  /** The folder is already selected in the chat. */
  inChat?: boolean;
}

export function fileMenuItems(opts: FileMenuOptions, a: FileMenuActions): MenuItem[] {
  const folder = opts.entry.type === "folder";
  const items: MenuItem[] = [];

  if (folder) {
    items.push(
      { label: "Nueva nota aquí", icon: <FilePlus />, onSelect: () => a.newNoteHere?.() },
      { label: "Nueva carpeta aquí", icon: <FolderPlus />, onSelect: () => a.newFolderHere?.() },
      { label: "Nuevo canvas aquí", icon: <LayoutDashboard />, onSelect: () => a.newCanvasHere?.() },
      { separator: true },
      {
        label: opts.inChat ? "Quitar del chat de IA" : "Añadir al chat de IA",
        icon: <MessageSquarePlus />,
        onSelect: () => a.addToChat?.(),
      },
    );
    // Space / Area / Topic: only a topic folder can be built by the AI.
    if (opts.entry.path.split("/").length === 3) {
      items.push({ label: "Generar tema con IA", description: "Teoría, mapa, práctica y competencias", icon: <Sparkles />, onSelect: () => a.generateTopic?.() });
    }
  } else {
    items.push({ label: "Abrir en una pestaña nueva", icon: <SquareArrowOutUpRight />, onSelect: a.openInNewTab });
    // A canvas fills its pane, so it has no second half to show.
    if (opts.entry.kind !== "canvas") {
      items.push({ label: "Abrir a la derecha", icon: <Columns2 />, onSelect: a.openToTheRight });
    }
    items.push({ label: "Abrir en una ventana nueva", icon: <AppWindow />, onSelect: a.openInNewWindow });
  }

  items.push({ separator: true });
  if (!folder && opts.canCopy !== false) {
    items.push({ label: "Hacer una copia", icon: <Copy />, onSelect: a.makeCopy });
  }
  items.push(
    { label: "Mover a otra carpeta…", icon: <FolderInput />, onSelect: a.moveToFolder },
    {
      label: opts.bookmarked ? "Quitar marcador" : "Marcador",
      icon: opts.bookmarked ? <BookmarkMinus /> : <Bookmark />,
      onSelect: a.toggleBookmark,
    },
  );

  items.push(
    { separator: true },
    {
      label: "Copiar ruta",
      icon: <Link2 />,
      items: [
        { label: "como URL de Obsidian", icon: <Link2 />, onSelect: () => a.copyPath("obsidian") },
        { label: "desde la carpeta del vault", icon: <FolderOpen />, onSelect: () => a.copyPath("vault") },
        { label: "desde la raíz del sistema", icon: <HardDrive />, onSelect: () => a.copyPath("system") },
      ],
    },
    { separator: true },
    { label: "Ver el historial de versiones", icon: <Clock />, onSelect: a.versionHistory },
    { separator: true },
    { label: "Abrir con la aplicación predeterminada", icon: <ExternalLink />, onSelect: a.openInDefaultApp },
    { label: "Mostrar en el Explorador de archivos", icon: <ExternalLink />, onSelect: a.revealInExplorer },
    { separator: true },
    { label: "Renombrar…", icon: <Pencil />, onSelect: a.rename },
    { label: "Mover a la papelera", icon: <Trash2 />, danger: true, onSelect: a.trash },
  );

  return items;
}

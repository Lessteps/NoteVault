import {
  Bookmark, ChevronsDownUp, Database, FilePlus, Files, FolderPlus, Network, RefreshCw, Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../lib/bridge";
import type { Bookmark as BookmarkT, SearchHit } from "../../lib/types";
import { useApp, type ExplorerTab } from "../../store/app";
import { cn, IconButton } from "../ui";
import { FileTree, newFolderIn, newNoteIn } from "./FileTree";
import { GraphPanel } from "./GraphPanel";

const TABS: Array<{ id: ExplorerTab; label: string; icon: ReactNode }> = [
  { id: "files", label: "Files", icon: <Files size={14} /> },
  { id: "search", label: "Search", icon: <Search size={14} /> },
  { id: "bookmarks", label: "Bookmarks", icon: <Bookmark size={14} /> },
  { id: "graph", label: "Grafo", icon: <Network size={14} /> },
];

export function Explorer({ width }: { width: number }) {
  const tab = useApp((s) => s.explorerTab);
  const setTab = useApp((s) => s.setExplorerTab);
  const info = useApp((s) => s.info);
  return (
    <aside className="flex flex-none flex-col border-r border-line bg-panel" style={{ width }}>
      <div className="flex h-10 flex-none items-center gap-1 overflow-hidden border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-7 flex-none items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
              tab === t.id ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text",
            )}
          >
            {t.icon}
            {tab === t.id && t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "files" && <FilesPanel />}
        {tab === "search" && <SearchPanel />}
        {tab === "bookmarks" && <BookmarksPanel />}
        {tab === "graph" && <GraphPanel />}
      </div>

      <div className="m-2 flex flex-none items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
        <Database size={14} className="text-dim" />
        <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-text">
          {info?.vault_name ?? "…"}
        </span>
      </div>
    </aside>
  );
}

function FilesPanel() {
  const [filter, setFilter] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const version = useApp((s) => s.treeVersion);
  const refreshTree = useApp((s) => s.refreshTree);
  const active = useApp((s) => s.active);
  const folderOfActive = active && active.includes("/") ? active.slice(0, active.lastIndexOf("/")) : "";

  useEffect(() => {
    api.stats().then((s) => setCount(s.notes)).catch(() => setCount(null));
  }, [version]);

  const collapseAll = () => {
    localStorage.setItem("nv.tree.expanded", "[]");
    refreshTree();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 flex-none items-center gap-0.5 px-2">
        <IconButton title="Nueva nota" onClick={() => void newNoteIn(folderOfActive)}>
          <FilePlus size={15} />
        </IconButton>
        <IconButton title="Nueva carpeta" onClick={() => void newFolderIn(folderOfActive)}>
          <FolderPlus size={15} />
        </IconButton>
        <div className="flex-1" />
        <IconButton title="Recargar" onClick={refreshTree}>
          <RefreshCw size={14} />
        </IconButton>
        <IconButton title="Colapsar carpetas" onClick={collapseAll}>
          <ChevronsDownUp size={15} />
        </IconButton>
      </div>
      <div className="flex-none px-2 pb-1.5">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 focus-within:border-accent">
          <Search size={13} className="flex-none text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por nombre…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
          />
          {count !== null && (
            <span className="flex-none rounded border border-line bg-elevated px-1.5 font-mono text-[10px] text-faint">
              {count}
            </span>
          )}
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileTree filter={filter} />
      </div>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    if (!query) return [text];
    const q = query.toLowerCase();
    const out: string[] = [];
    let rest = text;
    for (;;) {
      const i = rest.toLowerCase().indexOf(q);
      if (i < 0 || !q) {
        out.push(rest);
        break;
      }
      out.push(rest.slice(0, i), rest.slice(i, i + q.length));
      rest = rest.slice(i + q.length);
    }
    return out;
  }, [text, query]);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-text">{p}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function SearchPanel() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const openNote = useApp((s) => s.openNote);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      api.search(q, 200)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const groups = useMemo(() => {
    const m = new Map<string, SearchHit[]>();
    for (const h of hits ?? []) m.set(h.path, [...(m.get(h.path) ?? []), h]);
    return [...m.entries()];
  }, [hits]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none p-2">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 focus-within:border-accent">
          <Search size={13} className="text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en todas las notas…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
          />
        </label>
        {hits && (
          <div className="px-1 pt-2 font-mono text-[10.5px] text-faint">
            {busy ? "Buscando…" : `${hits.length} coincidencias en ${groups.length} notas`}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map(([path, list]) => (
          <div key={path} className="mb-2">
            <button
              type="button"
              onClick={() => void openNote(path)}
              className="w-full truncate rounded px-1.5 py-1 text-left text-[12.5px] font-semibold text-text hover:bg-hover"
            >
              {list[0]!.title}
            </button>
            {list.filter((h) => h.line_no > 0).slice(0, 6).map((h) => (
              <button
                key={h.line_no}
                type="button"
                onClick={() => void openNote(path, { line: h.line_no })}
                className="block w-full truncate rounded px-1.5 py-0.5 pl-4 text-left text-[12px] text-dim hover:bg-hover"
              >
                <span className="mr-1.5 font-mono text-[10px] text-faint">{h.line_no}</span>
                <Highlight text={h.line} query={query.trim()} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarksPanel() {
  const version = useApp((s) => s.bookmarkVersion);
  const openNote = useApp((s) => s.openNote);
  const [items, setItems] = useState<BookmarkT[] | null>(null);
  useEffect(() => {
    api.bookmarks().then(setItems).catch(() => setItems([]));
  }, [version]);
  return (
    <div className="h-full overflow-y-auto p-2">
      {items?.length === 0 && (
        <p className="px-2 py-3 text-[12px] leading-relaxed text-faint">
          Aún no hay marcadores. Usa el icono de marcador de una nota para añadirla aquí.
        </p>
      )}
      {items?.map((b) => (
        <button
          key={b.path}
          type="button"
          onClick={() => void openNote(b.path)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-dim hover:bg-hover hover:text-text"
        >
          <Bookmark size={14} className="flex-none text-accent-text" />
          <span className="truncate">{b.label}</span>
        </button>
      ))}
    </div>
  );
}

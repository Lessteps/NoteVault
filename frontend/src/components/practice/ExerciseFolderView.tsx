// The `type: ejercicios` view file: an exercise folder (`Ejercicios` or one of its
// per-skill sub-folders) opened as a set you walk through — a rail with every
// exercise and the exercise interface itself, with previous / next between them.

import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import type { TreeEntry } from "../../lib/types";
import { useApp, type OpenNote } from "../../store/app";
import { cn } from "../ui";
import { PracticeView } from "./PracticeView";

interface Item {
  path: string;
  title: string;
  /** the per-skill sub-folder it lives in ("" for the folder's own exercises) */
  group: string;
}

const isViewFile = (name: string) => /\.(ejercicios|practica|teorica|resumen)$/i.test(name);

/** The exercise notes of a folder and of its direct sub-folders, in the tree's own order. */
async function collect(folder: string): Promise<Item[]> {
  const out: Item[] = [];
  const own = await api.listDir(folder);
  const take = (entries: TreeEntry[], group: string) => {
    for (const e of entries) {
      if (e.type === "note" && e.kind === "note" && !isViewFile(e.name)) out.push({ path: e.path, title: e.name, group });
    }
  };
  take(own, "");
  for (const dir of own.filter((e) => e.type === "folder")) take(await api.listDir(dir.path), dir.name);
  return out;
}

export function ExerciseFolderView({ note }: { note: OpenNote }) {
  const toast = useApp((s) => s.toast);
  const folder = note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : "";
  const title = String(note.frontmatter?.title ?? folder.split("/").pop() ?? "Ejercicios");
  const [items, setItems] = useState<Item[] | null>(null);
  const [current, setCurrent] = useState(0);

  const load = useCallback(async () => {
    try {
      setItems(await collect(folder));
    } catch (e) {
      toast("error", (e as Error).message);
      setItems([]);
    }
  }, [folder, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = items?.length ?? 0;
  const go = useCallback((delta: number) => setCurrent((c) => Math.min(Math.max(0, c + delta), Math.max(0, total - 1))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const groups = useMemo(() => {
    const map = new Map<string, Array<Item & { index: number }>>();
    (items ?? []).forEach((it, index) => map.set(it.group, [...(map.get(it.group) ?? []), { ...it, index }]));
    return [...map.entries()];
  }, [items]);

  const active = items?.[current];
  // PracticeView only needs the path (and a stamp to reload on).
  const stub = useMemo(
    () => (active ? ({ path: active.path, title: active.title, modified: 0 } as unknown as OpenNote) : null),
    [active],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none items-center gap-3 border-b border-line px-5 py-2.5">
        <ListChecks size={16} className="text-accent-text" />
        <h1 className="min-w-0 flex-1 truncate text-[16px] font-bold text-text" title={note.path}>{title}</h1>
        <span className="font-mono text-[11px] text-faint">{total ? `${current + 1} / ${total}` : "0 ejercicios"}</span>
        <button
          type="button"
          title="Anterior (←)"
          disabled={current <= 0}
          onClick={() => go(-1)}
          className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-panel text-dim hover:text-text disabled:opacity-40"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          title="Siguiente (→)"
          disabled={current >= total - 1}
          onClick={() => go(1)}
          className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-panel text-dim hover:text-text disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-64 flex-none overflow-y-auto border-r border-line bg-panel p-2" aria-label="Ejercicios">
          {items === null && <p className="p-2 text-[12px] text-faint">Cargando…</p>}
          {items !== null && total === 0 && (
            <p className="p-2 text-[12px] text-faint">Esta carpeta todavía no tiene ejercicios.</p>
          )}
          {groups.map(([group, list]) => (
            <div key={group || "_"} className="mb-2">
              {group && (
                <div className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-faint">{group}</div>
              )}
              {list.map((it) => (
                <button
                  key={it.path}
                  type="button"
                  onClick={() => setCurrent(it.index)}
                  className={cn(
                    "block w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px]",
                    it.index === current ? "bg-accent-soft font-semibold text-text" : "text-dim hover:bg-hover hover:text-text",
                  )}
                  title={it.title}
                >
                  {it.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1">
          {stub ? <PracticeView key={stub.path} note={stub} /> : null}
        </div>
      </div>
    </div>
  );
}

// Ctrl+P: jump to any note by name, or create it.

import { CornerDownLeft, FilePlus, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { IndexEntry } from "../../lib/types";
import { useApp } from "../../store/app";
import { cn, Kbd } from "../ui";

/** Subsequence match; lower score = better. */
function score(title: string, q: string): number {
  const t = title.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  const i = t.indexOf(q);
  if (i >= 0) return 2 + i / 100;
  let pos = 0;
  let gaps = 0;
  for (const ch of q) {
    const j = t.indexOf(ch, pos);
    if (j < 0) return Infinity;
    gaps += j - pos;
    pos = j + 1;
  }
  return 10 + gaps;
}

export function QuickSwitcher() {
  const open = useApp((s) => s.switcherOpen);
  const setOpen = useApp((s) => s.setSwitcher);
  const openNote = useApp((s) => s.openNote);
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    api.noteIndex().then(setIndex).catch(() => setIndex([]));
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return index.slice(0, 40);
    return index
      .map((n) => ({ n, s: Math.min(score(n.title, query), score(n.path, query) + 5) }))
      .filter((x) => x.s < Infinity)
      .sort((a, b) => a.s - b.s)
      .slice(0, 40)
      .map((x) => x.n);
  }, [index, q]);

  const exact = results.some((n) => n.title.toLowerCase() === q.trim().toLowerCase());
  const canCreate = q.trim().length > 0 && !exact;
  const total = results.length + (canCreate ? 1 : 0);

  if (!open) return null;

  const choose = async (i: number) => {
    setOpen(false);
    if (i < results.length) {
      await openNote(results[i]!.path);
      return;
    }
    const s = useApp.getState();
    try {
      const { path } = await api.createNote(q.trim(), "");
      s.refreshTree();
      await s.openNote(path);
      s.setMode("edit");
    } catch (e) {
      s.toast("error", (e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/45 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        className="h-fit w-[620px] max-w-[90vw] overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={15} className="text-faint" />
          <input
            ref={input}
            // Focused as it mounts: typing right after Ctrl+P must not lose
            // its first keystrokes.
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((v) => Math.min(v + 1, total - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((v) => Math.max(v - 1, 0));
              } else if (e.key === "Enter" && total) {
                e.preventDefault();
                void choose(sel);
              }
            }}
            placeholder="Busca una nota por nombre, o escribe uno nuevo para crearla…"
            className="h-12 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-faint"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.map((n, i) => (
            <li key={n.path}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => void choose(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left",
                  sel === i ? "bg-accent-soft" : "",
                )}
              >
                <FileText size={15} className="flex-none text-accent-text" />
                <span className="truncate text-[13px] text-text">{n.title}</span>
                <span className="ml-auto truncate font-mono text-[10.5px] text-faint">
                  {n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : ""}
                </span>
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                onMouseEnter={() => setSel(results.length)}
                onClick={() => void choose(results.length)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left",
                  sel === results.length ? "bg-accent-soft" : "",
                )}
              >
                <FilePlus size={15} className="flex-none text-mint" />
                <span className="text-[13px] text-text">
                  Crear nota «<span className="font-semibold">{q.trim()}</span>»
                </span>
              </button>
            </li>
          )}
          {!total && <li className="px-3 py-4 text-[12.5px] text-faint">El vault no tiene notas todavía.</li>}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 font-mono text-[10.5px] text-faint">
          <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> moverse</span>
          <span className="flex items-center gap-1"><Kbd><CornerDownLeft size={10} /></Kbd> abrir</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

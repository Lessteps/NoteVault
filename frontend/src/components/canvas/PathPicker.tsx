// Pick a note, image or canvas of the vault to put on the canvas.

import { FileText, Image as ImageIcon, LayoutDashboard, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { cn } from "../ui";

type Kind = "note" | "image" | "canvas";
const TITLES: Record<Kind, string> = { note: "Añadir nota", image: "Añadir imagen", canvas: "Añadir canvas" };

export function PathPicker({ kind, onPick, onClose }: { kind: Kind; onPick: (path: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<Array<{ path: string; title: string }> | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const load = kind === "note" ? api.noteIndex() : kind === "image" ? api.canvasImages() : api.canvasList();
    load.then(setItems).catch(() => setItems([]));
  }, [kind]);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !query || i.path.toLowerCase().includes(query)).slice(0, 200);
  }, [items, q]);

  const Icon = kind === "note" ? FileText : kind === "image" ? ImageIcon : LayoutDashboard;
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/45 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label={TITLES[kind]}
        className="h-fit w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-line-strong bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={15} className="text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((v) => Math.min(v + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((v) => Math.max(v - 1, 0));
              } else if (e.key === "Enter" && shown[sel]) onPick(shown[sel]!.path);
            }}
            placeholder={`${TITLES[kind]}: escribe para filtrar…`}
            className="h-12 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-faint"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {items === null && <li className="px-3 py-3 text-[12.5px] text-faint">Cargando…</li>}
          {items && !shown.length && <li className="px-3 py-3 text-[12.5px] text-faint">No hay nada que añadir.</li>}
          {shown.map((i, n) => (
            <li key={i.path}>
              <button type="button" onMouseEnter={() => setSel(n)} onClick={() => onPick(i.path)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left", sel === n && "bg-accent-soft")}>
                <Icon size={15} className="flex-none text-accent-text" />
                <span className="truncate text-[13px] text-text">{i.title}</span>
                <span className="ml-auto truncate font-mono text-[10.5px] text-faint">{i.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

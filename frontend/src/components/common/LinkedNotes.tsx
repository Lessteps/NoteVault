// Vault notes linked to an entity (and an optional folder), opened in Notas.

import { FileText, Folder, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import type { IndexEntry } from "../../lib/types";
import { useApp } from "../../store/app";
import { IconButton } from "../ui";
import { input } from "./forms";

export function LinkedNotes({ notes, folder, onChange, part = "both" }: {
  notes: string[]; folder: string; onChange: (notes: string[], folder: string) => void;
  /** Which half to draw: the Center Peek shows the folder and the notes on their own rows. */
  part?: "both" | "folder" | "notes";
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<IndexEntry[]>([]);
  useEffect(() => {
    if (picking) api.noteIndex().then(setIndex).catch(() => setIndex([]));
  }, [picking]);
  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    return index.filter((n) => !notes.includes(n.path) && (!query || n.path.toLowerCase().includes(query))).slice(0, 12);
  }, [index, q, notes]);

  const openNote = (path: string) => {
    const app = useApp.getState();
    app.setModule("notas");
    void app.openNote(path.endsWith(".md") ? path : `${path}.md`);
  };

  return (
    <div className="space-y-1.5">
      {part !== "notes" && (
        <label className="flex items-center gap-2">
          <Folder size={14} className="flex-none text-faint" />
          <input className={input} value={folder} placeholder="Carpeta del vault (opcional)"
            onChange={(e) => onChange(notes, e.target.value)} />
        </label>
      )}
      {part === "folder" ? null : (
        <>
          <ul className="space-y-0.5">
            {notes.map((n) => (
              <li key={n} className="group flex items-center gap-2 rounded-md px-1 hover:bg-hover">
                <FileText size={13} className="flex-none text-accent-text" />
                <button type="button" onClick={() => openNote(n)} className="min-w-0 flex-1 truncate text-left text-[12.5px] text-text hover:underline">{n}</button>
                <IconButton title="Desvincular" onClick={() => onChange(notes.filter((x) => x !== n), folder)} className="opacity-0 group-hover:opacity-100"><X size={12} /></IconButton>
              </li>
            ))}
          </ul>
          {picking ? (
            <div className="rounded-lg border border-line p-1.5">
              <input autoFocus className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nota…"
                onKeyDown={(e) => e.key === "Escape" && setPicking(false)} />
              <ul className="mt-1 max-h-48 overflow-y-auto">
                {hits.map((n) => (
                  <li key={n.path}>
                    <button type="button" onClick={() => { onChange([...notes, n.path], folder); setPicking(false); setQ(""); }}
                      className="block w-full truncate rounded px-2 py-1 text-left text-[12.5px] text-dim hover:bg-hover hover:text-text">{n.path}</button>
                  </li>
                ))}
                {!hits.length && <li className="px-2 py-1 text-[12px] text-faint">Sin resultados.</li>}
              </ul>
            </div>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1.5 text-[12px] text-accent-text hover:underline">
              <Plus size={12} /> Vincular nota
            </button>
          )}
        </>
      )}
    </div>
  );
}

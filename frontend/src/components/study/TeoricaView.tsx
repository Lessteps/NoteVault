// The `type: teorica` view: the theory of a topic folder.
//
// The theory note is the note the vault already had — the one the canvas maps
// link as a file node — marked with `type: teorica` in place (never renamed,
// never duplicated). So this view renders the note it was opened from, and adds
// the two things a theory surface needs: the way back to its own note and, when
// the topic has a concept map, a button that opens it.

import { BookOpen, LayoutDashboard, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { useApp, type OpenNote } from "../../store/app";
import { ReadView } from "../notes/ReadView";

export function TeoricaView({ note }: { note: OpenNote }) {
  const openTab = useApp((s) => s.openTab);
  const setMode = useApp((s) => s.setMode);
  const [mapPath, setMapPath] = useState<string>(String(note.frontmatter?.mapa ?? "").trim());

  useEffect(() => {
    let live = true;
    if (String(note.frontmatter?.mapa ?? "").trim()) return;
    api
      .studyTopicMap(note.path)
      .then((res) => {
        if (live && res.ok) setMapPath(res.path);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [note.path, note.frontmatter?.mapa]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-text">
            <BookOpen size={12} /> Teoría del tema
          </div>
          <h1 className="truncate text-[16px] font-bold text-text" title={note.title}>
            {note.title}
          </h1>
        </div>
        {mapPath && (
          <button
            type="button"
            onClick={() => openTab({ kind: "canvas", path: mapPath }, { preview: true })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] text-dim hover:border-accent hover:text-text"
          >
            <LayoutDashboard size={14} className="text-mint" /> Abrir mapa
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode("split")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] text-dim hover:border-accent hover:text-text"
        >
          <Pencil size={14} /> Editar la teoría
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReadView note={note} />
      </div>
    </div>
  );
}

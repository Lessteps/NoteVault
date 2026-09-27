// The `type: teorica` view file: the theory of a topic folder.
//
// The theory itself is the folder's concept note (the note the vault already
// had, which the canvases link to by path); this file is its visible entry
// point, so a topic folder reads as "Teoría" + "Práctica" instead of a concept
// note plus a machine `_tema.md`. It also offers the topic's concept map.

import { BookOpen, LayoutDashboard, Map as MapIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { siblingTheoryPath } from "../../lib/viewFiles";
import { toOpenNote, useApp, type OpenNote } from "../../store/app";
import { ReadView } from "../notes/ReadView";

export function TeoricaView({ note }: { note: OpenNote }) {
  const openTab = useApp((s) => s.openTab);
  const [theory, setTheory] = useState<OpenNote | null>(null);
  const [missing, setMissing] = useState(false);

  const theoryRel = String(note.frontmatter?.teoria ?? "").trim() || siblingTheoryPath(note.path);
  const mapRel = String(note.frontmatter?.mapa ?? "").trim();

  useEffect(() => {
    let live = true;
    setMissing(false);
    setTheory(null);
    api.readNote(theoryRel)
      .then((data) => {
        if (live) setTheory(toOpenNote(data));
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [theoryRel]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-text">
            <BookOpen size={12} /> Teoría del tema
          </div>
          <h1 className="truncate text-[16px] font-bold text-text" title={theoryRel}>{note.title}</h1>
        </div>
        {mapRel && (
          <button
            type="button"
            onClick={() => openTab({ kind: "canvas", path: mapRel })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] text-dim hover:border-accent hover:text-text"
          >
            <LayoutDashboard size={14} className="text-mint" /> Abrir mapa
          </button>
        )}
        {theory && (
          <button
            type="button"
            onClick={() => void useApp.getState().openNote(theory.path)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] text-dim hover:border-accent hover:text-text"
          >
            <MapIcon size={14} /> Abrir la nota de teoría
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {theory ? (
          <ReadView note={theory} />
        ) : missing ? (
          <div className="grid place-items-center p-8 text-center">
            <p className="max-w-md text-[13px] text-dim">
              Todavía no hay nota de teoría para este tema. Crea <span className="font-mono text-text">{theoryRel}</span>{" "}
              con el contenido y aparecerá aquí.
            </p>
          </div>
        ) : (
          <p className="p-5 text-[13px] text-faint">Cargando la teoría…</p>
        )}
      </div>
    </div>
  );
}

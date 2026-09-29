import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { bodyOf, useApp } from "../../store/app";
import { cn } from "../ui";
import { useProperties } from "./PropertiesDialog";

interface Heading {
  level: number;
  text: string;
  /** 1-based line in the raw file. */
  line: number;
}

/** Headings outside fenced code, with their line in the raw text. */
function outline(raw: string): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  const fmLines = raw.slice(0, raw.length - bodyOf(raw).length).split("\n").length - 1;
  raw.split("\n").forEach((line, i) => {
    if (i < fmLines) return;
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]!;
      return;
    }
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1]!.length, text: m[2]!.replace(/[*_`]/g, ""), line: i + 1 });
  });
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </section>
  );
}

export type InspectorTab = "note";

/** The right panel: the note's outline, properties and backlinks.
 *
 * Practice lives in the study view files (`type: practica`, `type: resumen`),
 * so this panel no longer hosts the study surface. */
export function Inspector() {
  const active = useApp((s) => s.active);

  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem("nv.inspector.width"));
    return saved && saved >= 280 ? saved : 300;
  });
  const drag = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const newW = Math.min(900, Math.max(280, drag.current.w + (drag.current.x - e.clientX)));
      setWidth(newW);
    };
    const up = () => {
      if (drag.current) {
        localStorage.setItem("nv.inspector.width", String(width));
      }
      drag.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [width]);

  const tabs: Array<[InspectorTab, string, React.ReactNode]> = [];
  if (active) tabs.push(["note", "Nota", null]);

  const effectiveTab = tabs[0]?.[0] ?? "note";

  return (
    <div className="relative flex flex-none h-full">
      <div
        className="w-[5px] flex-none cursor-col-resize hover:bg-accent/40 z-10 -mr-[3px]"
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          document.body.style.cursor = "col-resize";
        }}
      />
      <aside
        className="flex flex-none flex-col border-l border-line bg-panel overflow-hidden"
        style={{ width: `${width}px` }}
        aria-label="Panel lateral"
      >
        <div className="flex h-9 flex-none items-center gap-1 border-b border-line px-2" role="tablist" aria-label="Panel lateral">
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={effectiveTab === id}
              onClick={() => undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors",
                effectiveTab === id ? "bg-accent-soft text-text font-medium" : "text-dim hover:bg-hover",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        {effectiveTab === "note" && <NoteInspector embedded />}
      </aside>
    </div>
  );
}

function NoteInspector({ embedded = false }: { embedded?: boolean }) {
  const note = useApp((s) => (s.active ? s.notes[s.active] : undefined));
  const openNote = useApp((s) => s.openNote);
  const heads = useMemo(() => (note?.kind === "note" ? outline(note.raw) : []), [note?.raw, note?.kind]);
  const minLevel = Math.min(...heads.map((h) => h.level), 6);
  const fm = Object.entries(note?.frontmatter ?? {}).filter(([k]) => k.toLowerCase() !== "tags");
  const words = note ? (note.raw.match(/\S+/g)?.length ?? 0) : 0;

  return (
    <aside className={cn("flex flex-col bg-panel", embedded ? "min-h-0 flex-1" : "w-[260px] flex-none border-l border-line")} aria-label="Panel de nota">
      {!embedded && (
        <div className="flex h-9 flex-none items-center justify-between border-b border-line px-3">
          {/* Sin boton de cerrar: este panel no se cierra. */}
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-faint">Nota</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
      {!note ? (
        <div className="p-4 text-[12px] text-faint">Abre una nota para ver su esquema.</div>
      ) : (
        <>
          {fm.length > 0 && (
            <Section title="Frontmatter">
              <dl className="space-y-1.5">
                {fm.slice(0, 10).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <dt className="flex-none font-mono text-[11px] text-faint">{k}</dt>
                    <dd className="truncate text-right text-text">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
          <Section title="Esquema">
            {heads.length === 0 && <div className="text-[12px] text-faint">Sin títulos.</div>}
            <ul className="space-y-0.5">
              {heads.map((h) => (
                <li key={h.line}>
                  <button
                    type="button"
                    onClick={() => void openNote(note.path, { line: h.line })}
                    className={cn(
                      "block w-full truncate rounded px-1.5 py-1 text-left text-[12.5px] hover:bg-hover",
                      h.level === minLevel ? "text-text" : "text-dim",
                    )}
                    style={{ paddingLeft: 6 + (h.level - minLevel) * 12 }}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-faint">H{h.level}</span>
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Propiedades">
            <button
              type="button"
              onClick={() => useProperties.getState().show(note.path)}
              className="flex w-full items-center gap-2 rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:border-accent hover:text-text"
            >
              <SlidersHorizontal size={12} /> Editar propiedades
            </button>
            <div className="mt-1.5 text-[11px] text-faint">
              Asunto, tipo, estado, etiquetas y dificultad de la nota.
            </div>
          </Section>
          <Section title="Nota">
            <div className="space-y-1 font-mono text-[11px] text-dim">
              <div>{words.toLocaleString("es")} palabras</div>
              <div>{note.raw.length.toLocaleString("es")} caracteres</div>
              <div>{note.eol === "\r\n" ? "CRLF" : "LF"} · UTF-8</div>
            </div>
          </Section>
        </>
      )}
      </div>
    </aside>
  );
}

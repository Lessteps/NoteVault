import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/bridge";
import { StudyPanel } from "../study/StudyPanel";
import { bodyOf, useApp } from "../../store/app";
import { cn } from "../ui";

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

/** The right panel: the note's outline, plus Estudio for notes of a study area. */
export function Inspector() {
  const active = useApp((s) => s.active);
  const toggleInspector = useApp((s) => s.toggleInspector);
  const [area, setArea] = useState<string | null>(null);
  const [tab, setTab] = useState<"note" | "study">(() => (localStorage.getItem("nv.inspector.tab") === "note" ? "note" : "study"));
  useEffect(() => {
    if (!active) {
      setArea(null);
      return;
    }
    let live = true;
    api.studyArea(active)
      .then((a) => live && setArea(a ? `${a.subject}:${a.folder}` : null))
      .catch(() => live && setArea(null));
    return () => {
      live = false;
    };
  }, [active]);
  const pick = (t: "note" | "study") => {
    setTab(t);
    try {
      localStorage.setItem("nv.inspector.tab", t);
    } catch {
      /* private mode */
    }
  };
  if (!area || !active) return <NoteInspector onClose={toggleInspector} />;
  return (
    <aside className="flex w-[300px] flex-none flex-col border-l border-line bg-panel" aria-label="Panel lateral">
      <div className="flex h-9 flex-none items-center gap-1 border-b border-line px-2" role="tablist" aria-label="Panel lateral">
        {([["study", "Estudio"], ["note", "Nota"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => pick(id)}
            className={cn("rounded-md px-2.5 py-1 text-[12px]", tab === id ? "bg-accent-soft text-text" : "text-dim hover:bg-hover")}>
            {label}
          </button>
        ))}
        <button
          type="button"
          title="Cerrar panel lateral"
          aria-label="Cerrar panel lateral"
          onClick={toggleInspector}
          className="ml-auto grid h-6 w-6 place-items-center rounded text-faint hover:bg-hover hover:text-text"
        >
          <X size={14} />
        </button>
      </div>
      {tab === "study" ? <StudyPanel path={active} areaKey={area} /> : <NoteInspector embedded onClose={toggleInspector} />}
    </aside>
  );
}

function NoteInspector({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const note = useApp((s) => (s.active ? s.notes[s.active] : undefined));
  const openNote = useApp((s) => s.openNote);
  const toggleInspector = useApp((s) => s.toggleInspector);
  const closeAction = onClose ?? toggleInspector;
  const heads = useMemo(() => (note?.kind === "note" ? outline(note.raw) : []), [note?.raw, note?.kind]);
  const minLevel = Math.min(...heads.map((h) => h.level), 6);
  const fm = Object.entries(note?.frontmatter ?? {}).filter(([k]) => k.toLowerCase() !== "tags");
  const words = note ? (note.raw.match(/\S+/g)?.length ?? 0) : 0;

  return (
    <aside className={cn("flex flex-col bg-panel", embedded ? "min-h-0 flex-1" : "w-[260px] flex-none border-l border-line")} aria-label="Panel de nota">
      {!embedded && (
        <div className="flex h-9 flex-none items-center justify-between border-b border-line px-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-faint">Nota</span>
          <button
            type="button"
            title="Cerrar panel lateral"
            aria-label="Cerrar panel lateral"
            onClick={closeAction}
            className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-hover hover:text-text"
          >
            <X size={14} />
          </button>
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

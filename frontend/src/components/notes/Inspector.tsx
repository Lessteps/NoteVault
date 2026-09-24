import { useMemo } from "react";
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

export function Inspector() {
  const note = useApp((s) => (s.active ? s.notes[s.active] : undefined));
  const openNote = useApp((s) => s.openNote);
  const heads = useMemo(() => (note?.kind === "note" ? outline(note.raw) : []), [note?.raw, note?.kind]);
  const minLevel = Math.min(...heads.map((h) => h.level), 6);
  const fm = Object.entries(note?.frontmatter ?? {}).filter(([k]) => k.toLowerCase() !== "tags");
  const words = note ? (note.raw.match(/\S+/g)?.length ?? 0) : 0;

  return (
    <aside className="flex w-[260px] flex-none flex-col overflow-y-auto border-l border-line bg-panel">
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
    </aside>
  );
}

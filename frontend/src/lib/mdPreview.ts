// "Vista indexada": qué marcas de Markdown de una línea se ocultan para que la
// nota se lea como se lee, sin dejar de ser el Markdown del archivo.
//
// Es una función pura sobre el texto de **una línea** (con desplazamientos
// relativos a ella) para poder probarla sin CodeMirror: el plugin del editor se
// limita a convertir lo que devuelve en decoraciones.
//
// Reglas:
// - Los caracteres que solo existen para el parser se esconden (`#`, `**`, `~~`,
//   los backticks de un código en línea, la parte de URL de un enlace).
// - Las viñetas se cambian por un punto real, porque `-` no significa nada para
//   quien lee.
// - Una línea que toca el cursor se devuelve intacta: para editar la marca hay
//   que verla (`plain: true`), como en Obsidian.

export interface Span {
  from: number;
  to: number;
}

export interface LinePreview {
  /** Ranges to remove from the rendered line. */
  hide: Span[];
  /** Ranges replaced by something else (a bullet). */
  replace: Array<{ from: number; to: number; text: string }>;
  /** Ranges that get a class: inline code, links, bold, italic. */
  marks: Array<{ from: number; to: number; kind: "code" | "link" | "strong" | "em" }>;
}

const EMPTY: LinePreview = { hide: [], replace: [], marks: [] };

/** `### Título` → hide the hashes; `- cosa` → a real bullet. */
function blockLevel(text: string, out: LinePreview): number {
  const heading = /^(#{1,6})(\s+)/.exec(text);
  if (heading) {
    out.hide.push({ from: 0, to: heading[1]!.length + heading[2]!.length });
    return heading[0].length;
  }
  const bullet = /^(\s*)([-*+])(\s+)/.exec(text);
  if (bullet) {
    const at = bullet[1]!.length;
    out.replace.push({ from: at, to: at + 1, text: "•" });
    return bullet[0].length;
  }
  return 0;
}

/** The inline markers inside `text`, with offsets relative to the line. */
function inline(text: string, offset: number, out: LinePreview): void {
  // Code spans first: whatever is inside one is literal, never markup.
  const protectedRanges: Span[] = [];
  const code = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = code.exec(text)) !== null) {
    const from = offset + m.index;
    out.hide.push({ from, to: from + 1 });
    out.hide.push({ from: from + m[0].length - 1, to: from + m[0].length });
    out.marks.push({ from: from + 1, to: from + m[0].length - 1, kind: "code" });
    protectedRanges.push({ from: m.index, to: m.index + m[0].length });
  }
  const isProtected = (at: number) => protectedRanges.some((r) => at >= r.from && at < r.to);

  const rules: Array<{ re: RegExp; kind?: "link" | "strong" | "em"; hide: (m: RegExpExecArray) => Span[]; mark?: (m: RegExpExecArray) => Span }> = [
    {
      // [texto](url) → texto, with the link mark on it.
      re: /\[([^\]]+)\]\(([^)]*)\)/g,
      kind: "link",
      hide: (m) => [
        { from: m.index, to: m.index + 1 },
        { from: m.index + m[1]!.length + 1, to: m.index + m[0].length },
      ],
      mark: (m) => ({ from: m.index + 1, to: m.index + 1 + m[1]!.length }),
    },
    {
      // [[nota]] → nota
      re: /\[\[([^\]]+)\]\]/g,
      kind: "link",
      hide: (m) => [
        { from: m.index, to: m.index + 2 },
        { from: m.index + m[0].length - 2, to: m.index + m[0].length },
      ],
      mark: (m) => ({ from: m.index + 2, to: m.index + 2 + m[1]!.length }),
    },
    {
      re: /\*\*([^*]+)\*\*/g,
      kind: "strong",
      hide: (m) => [
        { from: m.index, to: m.index + 2 },
        { from: m.index + m[0].length - 2, to: m.index + m[0].length },
      ],
    },
    {
      // __fuerte__ pero no snake_case_with_underscores.
      re: /(?<![_\w])__([^_\n]+)__(?![_\w])/g,
      kind: "strong",
      hide: (m) => [
        { from: m.index, to: m.index + 2 },
        { from: m.index + m[0].length - 2, to: m.index + m[0].length },
      ],
    },
    {
      re: /~~([^~]+)~~/g,
      kind: "em",
      hide: (m) => [
        { from: m.index, to: m.index + 2 },
        { from: m.index + m[0].length - 2, to: m.index + m[0].length },
      ],
    },
    {
      re: /(?<![*\w])\*([^*\n]+)\*/g,
      kind: "em",
      hide: (m) => [
        { from: m.index, to: m.index + 1 },
        { from: m.index + m[0].length - 1, to: m.index + m[0].length },
      ],
    },
    {
      re: /(?<![_\w])_([^_\n]+)_/g,
      kind: "em",
      hide: (m) => [
        { from: m.index, to: m.index + 1 },
        { from: m.index + m[0].length - 1, to: m.index + m[0].length },
      ],
    },
  ];

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    while ((m = rule.re.exec(text)) !== null) {
      if (isProtected(m.index)) continue;
      for (const s of rule.hide(m)) out.hide.push({ from: offset + s.from, to: offset + s.to });
      if (rule.kind === "link" && rule.mark) {
        const mk = rule.mark(m);
        out.marks.push({ from: offset + mk.from, to: offset + mk.to, kind: "link" });
      }
    }
  }
}

/**
 * What a line should look like when it is not the line being edited. `plain`
 * returns nothing: that is the cursor's line, which keeps its raw markers.
 */
export function linePreview(text: string, plain = false): LinePreview {
  if (plain || !text.trim()) return EMPTY;
  const out: LinePreview = { hide: [], replace: [], marks: [] };
  const lead = blockLevel(text, out);
  // Fences and table rows keep their syntax: they are structure, not markup to
  // be hidden (a table without its pipes is not a table).
  if (text.trimStart().startsWith("```") || text.includes("|")) return out;
  inline(text.slice(lead), lead, out);
  return out;
}

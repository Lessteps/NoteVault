// A drawing pad is a note (`type: dibujo`) that lives beside the note it was opened
// from: a title, the LaTeX read from the ink, and the strokes themselves in an HTML
// comment (so the file stays valid Markdown and the ink survives closing the pad).

export interface InkStroke {
  /** already inserted into a note: kept on the page, no longer recognised */
  done: boolean;
  points: Array<[number, number]>;
}

const INK_RE = /<!--\s*nv:ink\s+([\s\S]*?)\s*-->/;
const LATEX_START = "<!-- nv:latex:start -->";
const LATEX_END = "<!-- nv:latex:end -->";

const round = (v: number): number => Math.round(v * 10) / 10;

function latexBlock(latex: string): string {
  return `${LATEX_START}\n$$\n${latex.trim()}\n$$\n${LATEX_END}`;
}

/** The text of a brand-new drawing note. */
export function inkNoteText(title: string): string {
  return `---\ntype: dibujo\ntitle: ${title}\n---\n\n# ${title}\n\n${latexBlock("")}\n\n<!-- nv:ink [] -->\n`;
}

export function readInk(raw: string): InkStroke[] {
  const m = INK_RE.exec(raw);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]!) as Array<{ d?: number; p?: Array<[number, number]> }>;
    return parsed
      .filter((s) => Array.isArray(s?.p) && s.p.length >= 2)
      .map((s) => ({ done: s.d === 1, points: s.p!.map(([x, y]) => [Number(x), Number(y)] as [number, number]) }));
  } catch {
    return [];
  }
}

/** The note with its strokes and LaTeX replaced; everything else in the file is kept. */
export function writeInk(raw: string, strokes: readonly InkStroke[], latex: string): string {
  const data = JSON.stringify(strokes.map((s) => ({ d: s.done ? 1 : 0, p: s.points.map(([x, y]) => [round(x), round(y)]) })));
  const comment = `<!-- nv:ink ${data} -->`;
  let out = INK_RE.test(raw) ? raw.replace(INK_RE, () => comment) : `${raw.replace(/\s*$/, "")}\n\n${comment}\n`;
  const a = out.indexOf(LATEX_START);
  const b = out.indexOf(LATEX_END);
  if (a >= 0 && b > a) out = out.slice(0, a) + latexBlock(latex) + out.slice(b + LATEX_END.length);
  return out;
}

/** Wraps LaTeX for a note: inline `$x$` or a `$$` block. */
export function latexForNote(latex: string, display: boolean): string {
  const tex = latex.trim();
  return display ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
}

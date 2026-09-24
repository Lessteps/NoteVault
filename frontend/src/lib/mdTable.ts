// Markdown (GFM) tables as data: parse the block around the cursor, edit
// rows/columns, and write it back padded so the source stays readable.

export type Align = "none" | "left" | "center" | "right";

export interface Table {
  header: string[];
  aligns: Align[];
  rows: string[][];
}

const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSep = (line: string) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line);

/** Split "| a | b\\|c |" into cells, keeping escaped pipes. */
export function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "\\" && inner[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : "none";
}

/** The table's line range [first, last] (0-based) around `at`, or null. */
export function tableBounds(lines: string[], at: number): [number, number] | null {
  if (!isRow(lines[at] ?? "")) return null;
  let a = at;
  let b = at;
  while (a > 0 && isRow(lines[a - 1]!)) a--;
  while (b < lines.length - 1 && isRow(lines[b + 1]!)) b++;
  if (b - a < 1 || !isSep(lines[a + 1]!)) return null;
  return [a, b];
}

export function parseTable(lines: string[]): Table {
  const header = splitRow(lines[0]!);
  const aligns = splitRow(lines[1]!).map(alignOf);
  const width = header.length;
  const fit = (cells: string[]) => Array.from({ length: width }, (_, i) => cells[i] ?? "");
  return {
    header,
    aligns: fit(aligns as string[]).map((a) => (a || "none") as Align),
    rows: lines.slice(2).map((l) => fit(splitRow(l))),
  };
}

export function formatTable(t: Table): string[] {
  const width = t.header.length;
  const w = Array.from({ length: width }, (_, i) =>
    Math.max(3, [t.header, ...t.rows].reduce((m, r) => Math.max(m, [...(r[i] ?? "")].length), 0)));
  const pad = (s: string, i: number) => {
    const n = w[i]! - [...s].length;
    const a = t.aligns[i];
    if (a === "right") return " ".repeat(n) + s;
    if (a === "center") return " ".repeat(Math.floor(n / 2)) + s + " ".repeat(Math.ceil(n / 2));
    return s + " ".repeat(n);
  };
  const row = (cells: string[]) => `| ${cells.map((c, i) => pad(c, i)).join(" | ")} |`;
  const sep = t.aligns.map((a, i) => {
    const d = "-".repeat(w[i]!);
    if (a === "left") return ":" + d.slice(1);
    if (a === "right") return d.slice(1) + ":";
    if (a === "center") return ":" + d.slice(2) + ":";
    return d;
  });
  return [row(t.header), `| ${sep.join(" | ")} |`, ...t.rows.map(row)];
}

export function newTable(rows: number, cols: number): string[] {
  const c = Math.max(1, Math.min(cols, 20));
  const r = Math.max(1, Math.min(rows, 100));
  return formatTable({
    header: Array.from({ length: c }, (_, i) => `Columna ${i + 1}`),
    aligns: Array(c).fill("none") as Align[],
    rows: Array.from({ length: r }, () => Array(c).fill("") as string[]),
  });
}

/** Which column the character offset `col` of a row line falls in. */
export function columnAt(line: string, col: number): number {
  let n = -1;
  for (let i = 0; i < Math.min(col, line.length); i++) {
    if (line[i] === "|" && line[i - 1] !== "\\") n++;
  }
  return Math.max(0, n);
}

export type TableOp =
  | "row-below" | "row-above" | "row-delete"
  | "col-right" | "col-left" | "col-delete"
  | "align-left" | "align-center" | "align-right" | "align-none" | "format";

/** Apply an edit. `row` is the 0-based line inside the table, `col` the
 * column. Returns the new lines, or null when the table goes away. */
export function editTable(t: Table, op: TableOp, row: number, col: number): Table | null {
  const width = t.header.length;
  const c = Math.min(Math.max(col, 0), width - 1);
  const body = Math.max(0, row - 2);          // index into rows
  const blank = () => Array(width).fill("") as string[];
  const out: Table = { header: [...t.header], aligns: [...t.aligns], rows: t.rows.map((r) => [...r]) };
  switch (op) {
    case "row-below":
      out.rows.splice(row < 2 ? 0 : body + 1, 0, blank());
      break;
    case "row-above":
      out.rows.splice(row < 2 ? 0 : body, 0, blank());
      break;
    case "row-delete":
      if (row < 2) return out;               // the header stays
      out.rows.splice(body, 1);
      break;
    case "col-right":
    case "col-left": {
      const at = op === "col-right" ? c + 1 : c;
      out.header.splice(at, 0, "");
      out.aligns.splice(at, 0, "none");
      out.rows.forEach((r) => r.splice(at, 0, ""));
      break;
    }
    case "col-delete":
      if (width === 1) return null;
      out.header.splice(c, 1);
      out.aligns.splice(c, 1);
      out.rows.forEach((r) => r.splice(c, 1));
      break;
    case "align-left":
    case "align-center":
    case "align-right":
    case "align-none":
      out.aligns[c] = op.slice(6) as Align;
      break;
    case "format":
      break;
  }
  return out;
}

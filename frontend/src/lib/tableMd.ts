// GFM pipe tables as data: parse a table's source lines into a model, and write a
// model back as tidy Markdown. Pure, so the editor's table widget can be tested
// without CodeMirror.

export type Align = "" | "l" | "c" | "r";

export interface TableModel {
  header: string[];
  align: Align[];
  rows: string[][];
}

/** Splits one row on unescaped pipes; the outer pipes are optional, cells are trimmed. */
export function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === "\\" && text[i + 1] === "|") {
      cur += "\\|";
      i += 1;
    } else if (c === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

const SEPARATOR_CELL = /^:?-+:?$/;

/** `| --- | :-: |` — a delimiter row. */
export function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => SEPARATOR_CELL.test(c));
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "c";
  if (right) return "r";
  if (left) return "l";
  return "";
}

/** The model of a table's lines (header, delimiter, body rows); null when they are not a table. */
export function parseTable(lines: readonly string[]): TableModel | null {
  if (lines.length < 2 || !isSeparatorRow(lines[1]!)) return null;
  const header = splitRow(lines[0]!);
  const sep = splitRow(lines[1]!);
  if (!header.length || sep.length !== header.length) return null;
  const cols = header.length;
  const rows = lines.slice(2).filter((l) => l.trim()).map((l) => {
    const cells = splitRow(l);
    while (cells.length < cols) cells.push("");
    return cells.slice(0, cols);
  });
  return { header, align: sep.map(alignOf), rows };
}

/** A cell as typed: unescaped pipes would split it, so they are escaped; newlines become spaces. */
export function cleanCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();
}

function delimiter(align: Align, width: number): string {
  const w = Math.max(3, width);
  if (align === "c") return `:${"-".repeat(w - 2)}:`;
  if (align === "r") return `${"-".repeat(w - 1)}:`;
  if (align === "l") return `:${"-".repeat(w - 1)}`;
  return "-".repeat(w);
}

/** The model as aligned Markdown, one line per row. */
export function serializeTable(model: TableModel): string {
  const cols = model.header.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, model.header[c]!.length, ...model.rows.map((r) => (r[c] ?? "").length)),
  );
  const row = (cells: readonly string[]) =>
    `| ${widths.map((w, c) => (cells[c] ?? "").padEnd(w)).join(" | ")} |`;
  return [
    row(model.header),
    `| ${widths.map((w, c) => delimiter(model.align[c] ?? "", w)).join(" | ")} |`,
    ...model.rows.map(row),
  ].join("\n");
}

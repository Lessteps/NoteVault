// Which stretches of a note are "blocks" the editor renders as one widget
// (frontmatter, tables, display math, rules). Line based and pure: fenced code is
// skipped, so a table or `$$` inside a code fence stays code.

import { isSeparatorRow } from "./tableMd";

export type BlockKind = "frontmatter" | "table" | "math" | "hr";

export interface Block {
  kind: BlockKind;
  /** 0-based line indexes, both inclusive */
  from: number;
  to: number;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const MAX_SPAN = 400;

export function scanBlocks(lines: readonly string[]): Block[] {
  const out: Block[] = [];
  let i = 0;

  if (lines[0]?.trim() === "---") {
    for (let j = 1; j < Math.min(lines.length, MAX_SPAN); j += 1) {
      const t = lines[j]!.trim();
      if (t === "---" || t === "...") {
        out.push({ kind: "frontmatter", from: 0, to: j });
        i = j + 1;
        break;
      }
    }
  }

  let fence: string | null = null;
  for (; i < lines.length; i += 1) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.trim().slice(f[1]!.length).trim()) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }

    const t = line.trim();
    if (t.startsWith("$$")) {
      if (t.length > 3 && t.endsWith("$$")) {
        out.push({ kind: "math", from: i, to: i });
        continue;
      }
      for (let j = i + 1; j < Math.min(lines.length, i + MAX_SPAN); j += 1) {
        if (lines[j]!.trim().endsWith("$$")) {
          out.push({ kind: "math", from: i, to: j });
          i = j;
          break;
        }
      }
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1]!)) {
      let j = i + 2;
      while (j < lines.length && lines[j]!.trim() && lines[j]!.includes("|")) j += 1;
      out.push({ kind: "table", from: i, to: j - 1 });
      i = j - 1;
      continue;
    }

    // `---` under text is a heading underline, not a rule.
    if (HR.test(line) && (t[0] !== "-" || i === 0 || !lines[i - 1]!.trim())) {
      out.push({ kind: "hr", from: i, to: i });
    }
  }
  return out;
}

// @vitest-environment jsdom
//
// Phase 0b · every note of the real vault through the reader's own pipeline, to
// find the ones that blow up when opened:
//
//   NV_VAULT="C:/PROGRAMMING" npx vitest run src/lib/vaultRenderProfile.test.ts
//
// Three stages, the same three the app runs when you click a note: the YAML block
// (`parseFrontmatter`), the rendered HTML of the read view (`renderMarkdown`) and
// the hidden-marker ranges of the indexed editor view (`linePreview`, which feeds
// `RangeSetBuilder` — a range set that overlaps throws and takes the whole editor
// down with it).
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../core/frontmatter.js";
import { renderMarkdown } from "./markdown.js";
import { linePreview } from "./mdPreview.js";

const vault = process.env.NV_VAULT ?? "";
const SKIP = new Set([".git", ".trash", "node_modules", "dist", "release", "build", ".venv", "__pycache__", ".codegraph", ".idea"]);

function notes(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".notevault") continue;
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) notes(full, out);
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

/** The decoration ranges the editor would build for a note, in the plugin's order. */
function decorationRanges(text: string) {
  const out: Array<{ from: number; to: number; kind: string }> = [];
  let base = 0;
  for (const line of text.split("\n")) {
    const p = linePreview(line, false);
    for (const h of p.hide) if (h.to > h.from) out.push({ from: base + h.from, to: base + h.to, kind: "hide" });
    for (const r of p.replace) if (r.to > r.from) out.push({ from: base + r.from, to: base + r.to, kind: "replace" });
    for (const m of p.marks) if (m.to > m.from) out.push({ from: base + m.from, to: base + m.to, kind: "mark" });
    base += line.length + 1;
  }
  out.sort((a, b) => a.from - b.from || b.to - a.to);
  // Same filter the plugin applies before feeding RangeSetBuilder.
  const kept: typeof out = [];
  let lastTo = -1;
  let lastFrom = -1;
  for (const d of out) {
    if (d.from < lastTo || (d.from === lastFrom && d.to <= lastTo)) continue;
    kept.push(d);
    lastFrom = d.from;
    lastTo = Math.max(lastTo, d.to);
  }
  return { all: out.length, kept: kept.length };
}

(vault ? describe : describe.skip)("profile · opening a note", () => {
  it("reads, renders and indexes every note of the vault", () => {
    const paths = notes(vault);
    const failures: string[] = [];
    const slow: Array<[number, string]> = [];
    let bytes = 0;

    for (const p of paths) {
      const rel = path.relative(vault, p);
      let raw = "";
      try {
        raw = fs.readFileSync(p, "utf-8");
      } catch (e) {
        failures.push(`read · ${rel} · ${(e as Error).message}`);
        continue;
      }
      bytes += raw.length;
      const started = Date.now();
      try {
        const [fm] = parseFrontmatter(raw);
        if (fm && typeof fm !== "object") failures.push(`frontmatter no-objeto · ${rel}`);
        const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
        renderMarkdown(body);
        const ranges = decorationRanges(body);
        if (ranges.kept !== ranges.all) {
          // Skipped ranges are the plugin's own overlap filter doing its job.
        }
      } catch (e) {
        failures.push(`crash · ${rel} · ${(e as Error).name}: ${(e as Error).message}`);
      }
      const ms = Date.now() - started;
      slow.push([ms, rel]);
    }

    slow.sort((a, b) => b[0] - a[0]);
    process.stdout.write(`\nnotas: ${paths.length} · ${Math.round(bytes / 1024)} KB\n`);
    process.stdout.write(`más lentas:\n${slow.slice(0, 10).map(([ms, rel]) => `  ${ms} ms · ${rel}`).join("\n")}\n`);
    process.stdout.write(`fallos: ${failures.length}\n${failures.slice(0, 25).map((f) => `  ${f}`).join("\n")}\n`);
    expect(paths.length).toBeGreaterThan(0);
  }, 600_000);
});

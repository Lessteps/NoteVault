// Shared helpers for the Programación knowledge-base tools (plain Node, no build step: `node tools/programming_kb/<tool>.mjs`).
import fs from "node:fs";
import path from "node:path";

/** The space on disk. Override with PKB_SPACE when the vault lives elsewhere. */
export const SPACE = (process.env.PKB_SPACE ?? "C:/PROGRAMMING/Programación").replace(/\\/g, "/");

/** The language an area's examples are written in (theory-note frontmatter `language`). */
export const LANG = { "1": "agnostic", "2.1": "python", "2.2": "javascript", "2.3": "typescript", "3": "typescript", "4": "python", "5": "typescript", "6": "sql", "7": "python", "8": "typescript", "9": "shell" };

export const numKey = (name) => name.split(" ")[0].split(".").map(Number);
export const cmp = (a, b) => {
  const x = numKey(a), y = numKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
};
export const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const quote = (s) => `"${s.replace(/"/g, '\\"')}"`;

const isDir = (p) => fs.statSync(p).isDirectory();

/** Every topic of the space, in syllabus order: { area, topic, number, title, dir, note, areaNumber, index, count }. */
export function listTopics() {
  const out = [];
  const areas = fs.readdirSync(SPACE).filter((n) => /^\d/.test(n) && isDir(`${SPACE}/${n}`)).sort(cmp);
  for (const area of areas) {
    const names = fs.readdirSync(`${SPACE}/${area}`).filter((n) => /^\d/.test(n) && isDir(`${SPACE}/${area}/${n}`)).sort(cmp);
    names.forEach((topic, index) => {
      const number = topic.split(" ")[0];
      const dir = `${SPACE}/${area}/${topic}`;
      out.push({ area, areaNumber: area.split(" ")[0], topic, number, title: topic.slice(number.length + 1), dir, note: `${dir}/${topic}.md`, index, count: names.length });
    });
  }
  return out;
}

/** Splits a markdown file into its frontmatter text (without fences) and body. */
export function splitFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  return m ? { fm: m[1], body: raw.slice(m[0].length) } : { fm: null, body: raw };
}

/** The numbers of a topic folder name, e.g. "2.1.18 Concurrency…" → "2.1.18". */
export const numberOf = (topic) => topic.split(" ")[0];

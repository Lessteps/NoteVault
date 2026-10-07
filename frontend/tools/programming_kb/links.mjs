// Reports [[links]] in the theory notes that do not match an existing topic folder (the exact folder name is the link).
// usage: node tools/programming_kb/links.mjs [topic-regex]
import fs from "node:fs";
import { listTopics } from "./common.mjs";

const all = listTopics();
const names = new Set(all.map((t) => t.topic));
const re = process.argv[2] ? new RegExp(process.argv[2]) : null;
let bad = 0, total = 0;
for (const t of all) {
  if (re && !re.test(t.topic)) continue;
  if (!fs.existsSync(t.note)) continue;
  const text = fs.readFileSync(t.note, "utf8").replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  for (const m of text.matchAll(/\[\[([^\]|]+)/g)) {
    total++;
    const name = m[1].trim();
    if (names.has(name)) continue;
    bad++;
    const near = all.filter((x) => x.number === name.split(" ")[0]).map((x) => x.topic).join(" | ");
    console.log(`${t.topic}: [[${name}]]${near ? "  → did you mean: " + near : "  (no topic with that number)"}`);
  }
}
console.log(`\n${total} links checked, ${bad} unresolved`);

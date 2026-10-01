// Progress table: which topics have a theory note, a map and a practica file. Gemini starts every session here.
// usage: node tools/programming_kb/status.mjs [area-number]     e.g. `status.mjs 5` for Frontend
import fs from "node:fs";
import { listTopics } from "./common.mjs";
import { typeOf, skillsFor } from "./topic_types.mjs";

const only = process.argv[2];
const rows = listTopics().filter((t) => !only || t.areaNumber === only || t.number.startsWith(`${only}.`));
const byArea = new Map();
for (const t of rows) {
  const note = fs.existsSync(t.note);
  const map = fs.existsSync(`${t.dir}/${t.topic} — mapa.canvas`);
  const hasFm = note && fs.readFileSync(t.note, "utf8").startsWith("---");
  const a = byArea.get(t.area) ?? { total: 0, notes: 0, maps: 0, todo: [] };
  a.total++; if (note) a.notes++; if (map) a.maps++;
  if (!note) a.todo.push(`${t.number} [${typeOf(t.number)[0].toUpperCase()}]`);
  else if (!map || !hasFm) a.todo.push(`${t.number} (needs finalize)`);
  byArea.set(t.area, a);
}
let n = 0, m = 0, total = 0;
for (const [area, a] of byArea) {
  console.log(`${area.padEnd(32)} notes ${String(a.notes).padStart(3)}/${a.total}  maps ${String(a.maps).padStart(3)}/${a.total}${a.todo.length ? "  TODO: " + a.todo.join(", ") : "  ✓ complete"}`);
  n += a.notes; m += a.maps; total += a.total;
}
console.log(`\nTOTAL notes ${n}/${total} · maps ${m}/${total}`);

// Cruza los 302 de workout-guide con exercises-dataset y genera solo las
// instrucciones ES (+EN respaldo) de los que matcheen. Texto MIT.
import { readFileSync, writeFileSync } from "node:fs";
import { exercises as guide } from "@bryllim/workout-guide";

const DATASET = "C:/Users/Dylan/AppData/Local/Temp/opencode/exercises.json";
const OUT = new URL("../src/lib/exerciseInstructions.json", import.meta.url);

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const stop = new Set(["the", "a", "an", "de", "el", "la", "con", "en"]);
const toks = (s) => norm(s).split(" ").filter((t) => t && !stop.has(t));

const dataset = JSON.parse(readFileSync(DATASET, "utf8"));
const dRows = dataset.map((d) => ({ d, t: new Set(toks(d.name)) }));

let exact = 0, fuzzy = 0;
const out = [];
const missing = [];
for (const g of guide) {
  const gNorm = norm(g.name);
  let hit = dataset.find((d) => norm(d.name) === gNorm);
  if (hit) { exact++; }
  else {
    const gt = new Set(toks(g.name));
    let best = null, bestExtra = 1e9;
    for (const { d, t } of dRows) {
      if ([...gt].every((x) => t.has(x))) {
        const extra = t.size - gt.size;
        if (extra < bestExtra) { bestExtra = extra; best = d; }
      }
    }
    if (best) { hit = best; fuzzy++; }
  }
  if (!hit) { missing.push(g.slug); continue; }
  const steps = (k) => hit.instruction_steps?.[k] ?? [];
  out.push({
    slug: g.slug, name: g.name, matched: hit.name,
    steps_es: steps("es"), steps_en: steps("en"),
  });
}

writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`guide=${guide.length} exact=${exact} fuzzy=${fuzzy} matched=${out.length} missing=${missing.length}`);
console.log("missing:", missing.join(", "));
const withEs = out.filter((r) => r.steps_es.length).length;
console.log(`con pasos ES: ${withEs}/${out.length}`);

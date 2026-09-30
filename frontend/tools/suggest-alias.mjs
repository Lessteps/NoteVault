// Segunda pasada: alias con el mismo movimiento pero otro vocabulario.
// Regla estricta: score>=0.6 Y equipo compatible. Cada alias se imprime
// para revisión humana antes de aceptarlo en ALIAS (curaduría, no auto).
import { readFileSync } from "node:fs";
import { exercises as guide } from "@bryllim/workout-guide";

const DATASET = "C:/Users/Dylan/AppData/Local/Temp/opencode/exercises.json";
const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const stop = new Set(["the", "a", "an", "de", "el", "la", "con", "en", "and"]);
const toks = (s) => norm(s).split(" ").filter((t) => t && !stop.has(t));

const EQUIV = {
  bodyweight: ["body weight"], "pull-up bar": ["body weight"],
  dumbbell: ["dumbbell"], barbell: ["barbell"], cable: ["cable"],
  machine: ["machine", "leverage machine", "smith machine"],
  kettlebell: ["kettlebell"], "resistance band": ["band"],
  "stability ball": ["stability ball", "exercise ball"],
  cardio: ["cardio", "body weight"], plate: ["plate"],
  bench: ["body weight", "bench"], box: ["body weight"],
  chair: ["body weight"], doorway: ["body weight"], towel: ["body weight"],
  wall: ["body weight"],
};
const compat = (g, d) => (EQUIV[norm(g)] ?? [norm(g)]).includes(norm(d));

const dataset = JSON.parse(readFileSync(DATASET, "utf8"));
const drows = dataset.map((d) => ({ d, t: new Set(toks(d.name)) }));
const out = [];
for (const g of guide) {
  const gt = new Set(toks(g.name));
  for (const { d, t } of drows) {
    const inter = [...gt].filter((x) => t.has(x)).length;
    if (!inter) continue;
    const score = inter / Math.max(gt.size, t.size);
    if (score >= 0.6 && compat(g.equipment, d.equipment))
      out.push({ slug: g.slug, guide: `${g.name} [${g.equipment}]`, cand: `${d.name} [${d.equipment}]`, score: score.toFixed(2) });
  }
}
out.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
const seen = new Set();
for (const r of out) {
  if (seen.has(r.slug)) continue;
  seen.add(r.slug);
  console.log(`${r.slug} :: ${r.guide}  =>  ${r.cand}  (${r.score})`);
}
console.log(`\ncon alias: ${seen.size}`);

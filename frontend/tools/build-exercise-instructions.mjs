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

// Alias curados a mano (mismo movimiento, otro vocabulario en el dataset).
// Cada entrada se verificó: existe en el dataset, tiene pasos ES y el
// equipo es compatible. Lo dudoso (plano distinto, equipo que cambia la
// técnica, variantes de seguridad) queda fuera a propósito.
const ALIAS = {
  "rear-delt-fly": "dumbbell rear fly",
  "bent-over-rear-delt-raise": "dumbbell rear delt raise",
  "reverse-pec-deck": "lever seated reverse fly",
  "machine-row": "lever seated row",
  "machine-shoulder-press": "lever shoulder press",
  "machine-lateral-raise": "lever lateral raise",
  "plate-front-raise": "dumbbell front raise",
  "single-leg-romanian-deadlift": "dumbbell single leg deadlift",
  "heel-elevated-goblet-squat": "dumbbell goblet squat",
  "hip-abduction-machine": "lever seated hip abduction",
  "hip-adduction-machine": "lever seated hip adduction",
  "single-leg-glute-bridge": "single leg bridge with outstretched leg",
  "smith-machine-hip-thrust": "smith hip raise",
  "smith-machine-bulgarian-split-squat": "smith single leg split squat",
  "smith-machine-split-squat": "smith single leg split squat",
  "smith-machine-squat": "smith squat",
  "single-arm-cable-row": "cable one arm bent over row",
  "cable-standing-hip-adduction": "cable hip adduction",
  "rope-tricep-pushdown": "cable pushdown (with rope attachment)",
  "single-dumbbell-skullcrusher": "dumbbell lying single extension",
  "single-arm-dumbbell-tricep-extension": "dumbbell standing one arm extension",
  "treadmill-incline-walk": "walking on incline treadmill",
  "assault-bike": "air bike",
  "battle-ropes": "battling ropes",
  "chair-dip": "triceps dip",
  "worlds-greatest-stretch": "world greatest stretch",
  "wall-handstand-push-up": "handstand push-up",
  "farmer-carry": "farmers walk",
  "flutter-kick": "flutter kicks",
  "butterfly-stretch": "butterfly yoga pose",
  "l-sit-hold": "l-sit on floor",
  "seated-knee-tuck": "tuck crunch",
  "heel-tap": "alternate heel touchers",
  "fast-feet": "quick feet v. 2",
  "skater-hop": "skater hops",
  "ab-wheel": "wheel rollerout",
  "l-sit-pull-up": "l-pull-up",
  "assisted-pistol-squat": "single leg squat (pistol) male",
  "close-grip-lat-pulldown": "twin handle parallel grip lat pulldown",
};

const dataset = JSON.parse(readFileSync(DATASET, "utf8"));
const dRows = dataset.map((d) => ({ d, t: new Set(toks(d.name)) }));

let exact = 0, fuzzy = 0, aliased = 0;
const out = [];
const missing = [];
for (const g of guide) {
  const gNorm = norm(g.name);
  let hit = dataset.find((d) => norm(d.name) === gNorm);
  let via = "exact";
  if (!hit && ALIAS[g.slug]) {
    hit = dataset.find((d) => norm(d.name) === norm(ALIAS[g.slug]));
    via = "alias";
  }
  if (hit) { if (via === "exact") exact++; else if (via === "alias") aliased++; }
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
console.log(`guide=${guide.length} exact=${exact} fuzzy=${fuzzy} alias=${aliased} matched=${out.length} missing=${missing.length}`);
console.log("missing:", missing.join(", "));
const withEs = out.filter((r) => r.steps_es.length).length;
console.log(`con pasos ES: ${withEs}/${out.length}`);

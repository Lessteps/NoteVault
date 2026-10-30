// Format check: does each theory note follow the CURRENT resumen_teorico_skill? Same markers the app's «desactualizado» detector uses
// (src/api/modules/skillFreshness.ts), so a topic that passes here is not flagged as outdated in the app.
// usage: node tools/programming_kb/check_format.mjs ["^6\\.4 "]      exit code 1 if any topic fails
import fs from "node:fs";
import { listTopics } from "./common.mjs";

const re = new RegExp(process.argv[2] ?? ".");
const bad = [];
let checked = 0;
for (const t of listTopics()) {
  if (!re.test(`${t.number} `) && !re.test(t.topic)) continue;
  if (!fs.existsSync(t.note)) continue;
  checked++;
  const raw = fs.readFileSync(t.note, "utf8");
  const miss = [];
  if (!raw.includes("## Requires")) miss.push("## Requires");
  if (!raw.includes("### What it is")) miss.push("### What it is");
  // catalog topics (with curriculum_id) have their own shape; everything else must follow the standard structure
  if (!raw.includes("curriculum_id:")) {
    if (!raw.includes("**In one sentence.**")) miss.push("**In one sentence.** (first line under «### What it is»)");
    if (!raw.includes("### Mental model")) miss.push("### Mental model");
    if (!raw.includes("**In the practice:**")) miss.push("a bullet that starts exactly «- **In the practice:**» (not «- **- In the practice:**»)");
    if (!raw.includes("## Examples")) miss.push("## Examples");
    if (!raw.includes("**How you will apply it:**") && !raw.includes("**Why it works:**")) miss.push("**How you will apply it:** (or **Why it works:**)");
    if (!raw.includes("## Common mistakes")) miss.push("## Common mistakes");
  }
  if (miss.length) bad.push({ topic: t.topic, miss });
}
for (const b of bad) console.log(`FAIL ${b.topic}\n     missing: ${b.miss.join(" · ")}`);
console.log(`\n${checked} checked · ${bad.length} do NOT follow the current skill format`);
process.exit(bad.length ? 1 : 0);

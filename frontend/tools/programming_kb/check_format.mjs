// Format check: does each theory note follow the CURRENT resumen_teorico_skill? Same markers the app's «desactualizado» detector uses
// (src/api/modules/skillFreshness.ts), so a topic that passes here is not flagged as outdated in the app.
// usage: node tools/programming_kb/check_format.mjs ["^6\\.4 "]      exit code 1 if any topic fails
import fs from "node:fs";
import { listTopics } from "./common.mjs";

// Same limits as src/lib/noteWeight.ts (a vitest keeps both equal): a note is learned in one go or it is two notes.
const MAX_EXPLANATION_WORDS = 500;
const MAX_NOTE_WORDS = 1500;
const wc = (s) => s.split(/\s+/).filter(Boolean).length;

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
    // two valid shapes: functional modules (current skill) or the older Mental model + In the practice
    const modular = raw.includes("### How it is organised") && raw.includes("### How it works in the real world");
    if (!modular && !raw.includes("### Mental model")) miss.push("the modules «### How it is organised» and «### How it works in the real world» (or the older «### Mental model»)");
    if (!modular && !raw.includes("**In the practice:**")) miss.push("a bullet that starts exactly «- **In the practice:**» (not «- **- In the practice:**»)");
    if (!raw.includes("## Examples")) miss.push("## Examples");
    if (!raw.includes("**How you will apply it:**") && !raw.includes("**Why it works:**")) miss.push("**How you will apply it:** (or **Why it works:**)");
    if (!raw.includes("## Common mistakes")) miss.push("## Common mistakes");
  }
  // size and focus: one concept, minimum words (catalog reference groups hold several items by design and are exempt)
  if (!raw.includes("curriculum_id:")) {
    const text = raw.replace(/\r\n/g, "\n");
    const expl = wc(/## Explanation([\s\S]*?)(?=\n## )/.exec(text)?.[1] ?? "");
    const total = wc(text.replace(/^---\n[\s\S]*?\n---\n/, ""));
    if (expl > MAX_EXPLANATION_WORDS) miss.push(`«## Explanation» has ${expl} words (max ${MAX_EXPLANATION_WORDS}): it holds more than one idea — say it in the minimum, or split the topic`);
    if (total > MAX_NOTE_WORDS) miss.push(`the note has ${total} words (max ${MAX_NOTE_WORDS}): shorten the examples and the text, or split the topic`);
    if (/^prerequisites:\s*\[\s*"/m.test(text) && /No prerequisites/i.test(/## Requires([\s\S]*?)(?=\n## )/.exec(text)?.[1] ?? "")) miss.push("«## Requires» says «No prerequisites» but the frontmatter lists prerequisites");
  }
  if (miss.length) bad.push({ topic: t.topic, miss });
}
for (const b of bad) console.log(`FAIL ${b.topic}\n     missing: ${b.miss.join(" · ")}`);
console.log(`\n${checked} checked · ${bad.length} do NOT follow the current skill format`);
process.exit(bad.length ? 1 : 0);

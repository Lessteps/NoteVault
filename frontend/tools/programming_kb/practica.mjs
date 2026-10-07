// Writes each topic's `.practica.md` (type + skills) from topic_types.mjs and stamps `topic_type` in its theory note.
// usage: node tools/programming_kb/practica.mjs [topic-regex] [--dry]
// Safe to re-run. It keeps the body of an existing practica file (including the AI plan block) and only rewrites the header.
import fs from "node:fs";
import { listTopics, splitFrontmatter } from "./common.mjs";
import { typeOf, skillsFor } from "./topic_types.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const filter = args.find((a) => !a.startsWith("--"));
const re = filter ? new RegExp(filter) : null;
const BODY = (title) => `\n# Práctica — ${title}\n\nVista de práctica del tema: elige competencia, dificultad, cantidad y ayuda,\no consulta el resumen de progreso (matriz competencia × dificultad).\n`;

const counts = { theoretical: 0, procedural: 0, mixed: 0 };
let written = 0, stamped = 0;
for (const t of listTopics()) {
  if (re && !re.test(t.topic)) continue;
  const type = typeOf(t.number);
  const skills = skillsFor(t.number);
  counts[type]++;
  const file = `${t.dir}/${t.topic}.practica.md`;
  const header = ["---", "type: practica", "subject: programming", `title: ${t.topic}`, `topic_type: ${type}`, `skills: [${skills.map((s) => `"${s}"`).join(", ")}]`, "min_per_skill: 6", "target_difficulty: 3", "exam: required", "---"].join("\n");
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const body = old ? splitFrontmatter(old).body.replace(/^\n?/, "\n") : BODY(t.topic);
  const next = `${header}\n${body}`;
  if (next !== old) { if (!dry) fs.writeFileSync(file, next, "utf8"); written++; }

  if (fs.existsSync(t.note)) {
    const raw = fs.readFileSync(t.note, "utf8");
    const { fm } = splitFrontmatter(raw);
    if (fm !== null && !/^topic_type:/m.test(fm)) {
      const updated = raw.replace(/^(type: teorica\r?\n)/m, `$1topic_type: ${type}\n`);
      if (updated !== raw) { if (!dry) fs.writeFileSync(t.note, updated, "utf8"); stamped++; }
    } else if (fm !== null) {
      const updated = raw.replace(/^topic_type:.*$/m, `topic_type: ${type}`);
      if (updated !== raw) { if (!dry) fs.writeFileSync(t.note, updated, "utf8"); stamped++; }
    }
  }
}
console.log(`${dry ? "[dry] " : ""}practica files written ${written} · theory notes stamped ${stamped} · theoretical ${counts.theoretical} · procedural ${counts.procedural} · mixed ${counts.mixed}`);

// Regenerates src/core/programmingDefaultSkills.ts (the skills a NEW programming space is seeded with) from the five
// notes in `Programación/_skills/`. The vault is the source of truth: edit the .md files, then run this.
// usage: node tools/programming_kb/sync_default_skills.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPACE } from "./common.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = path.join(frontend, "src/core/programmingDefaultSkills.ts");
const NAMES = ["resumen_teorico_skill", "mapa_skill", "practica_skill", "temario_skill", "subtemas_skill"];

const header = `/**
 * The default \`_skills/\` notes of a PROGRAMMING study space, written in ENGLISH: everything in the Programación space
 * (area and topic names, theory, exercises) is English. The mathematics notes live in defaultSkills.ts and the English
 * study ones in englishDefaultSkills.ts; nothing of them is used here.
 *
 * GENERATED from \`Programación/_skills/*.md\` by \`tools/programming_kb/sync_default_skills.mjs\` — edit the notes in the
 * vault and re-run the script instead of editing this file.
 *
 * The theory skill keeps the SAME contract of headings and fields that \`tools/kb_canvas.ts\` parses to draw the topic
 * map (which understands the English headings); code blocks are allowed and keep their line breaks.
 */

const lines = (...rows: string[]): string => rows.join("\\n") + "\\n";

export const PROGRAMMING_DEFAULT_SKILLS: Record<string, string> = {
`;
const body = NAMES.map((name) => {
  const text = fs.readFileSync(`${SPACE}/_skills/${name}.md`, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "");
  const rows = text.split("\n").map((l) => `    ${JSON.stringify(l)},`).join("\n");
  return `  ${name}: lines(\n${rows}\n  ),`;
}).join("\n\n");
fs.writeFileSync(target, `${header}${body}\n};\n`, "utf8");
console.log(`wrote ${path.relative(frontend, target)} from ${NAMES.length} skill notes`);

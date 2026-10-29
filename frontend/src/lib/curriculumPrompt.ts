/**
 * La TAREA para un agente externo (Antigravity / Claude Code) que crea los temas de referencia que faltan en una vault.
 * Puro y determinista: sin disco, sin red y sin IA. El mismo texto sale siempre de las mismas entradas.
 *
 * El documento va en inglés (como el resto de las tareas de agente y como el contenido de Programación). Esta pieza también
 * exporta los «contratos» que la validación usa después (frontmatter esperado, manifiesto, línea del temario), para que lo que se
 * le pide al agente y lo que se comprueba salga de un único sitio.
 */

import type { CurriculumArea, CurriculumEntry } from "./curriculum";

/** Una entrada elegida junto con la carpeta donde se creará (`Programación/12 CSS/12.7 Flexbox container`). */
export interface SelectedEntry {
  entry: CurriculumEntry;
  suggestedFolder: string;
}

/** Texto de las skills de la vault, tal cual (se recorta con `SKILL_LIMITS`). */
export interface CurriculumSkills {
  temario?: string;
  resumenTeorico?: string;
  practica?: string;
  ejercicios?: string;
  mapa?: string;
}

/** Máximo de caracteres de cada skill incrustada. La teoría ocupa ~9 000: el límite de 6 000 de «Con la app» la cortaría antes de las tarjetas. */
export const SKILL_LIMITS: Record<keyof CurriculumSkills, number> = { resumenTeorico: 12000, practica: 8000, ejercicios: 6000, temario: 3500, mapa: 3000 };

export type TopicType = "theoretical" | "procedural" | "mixed";

export interface PlannedEntry {
  entry: CurriculumEntry;
  /** carpeta relativa a la vault, POSIX */
  folder: string;
  /** nombre de la carpeta = nombre del tema = enlace del temario */
  name: string;
  /** `12.7` */
  number: string;
  /** título sin número */
  title: string;
  /** `programming.12-7-flexbox-container` */
  noteId: string;
  topicType: TopicType;
  language: string;
  difficulty: number;
  discipline: string;
  skills: string[];
  noteRel: string;
  practicaRel: string;
  mapRel: string;
}

export interface CurriculumTaskInput {
  /** ruta ABSOLUTA de la vault */
  vaultRoot: string;
  space: string;
  area: CurriculumArea;
  entries: SelectedEntry[];
  skills: CurriculumSkills;
  /** `YYYY-MM-DD` */
  today: string;
  /** id de la tarea y ruta absoluta del archivo que se escribe (para la frase corta y el pie) */
  id: string;
  taskAbs: string;
  withExercises?: boolean;
  /** carpetas que ya hay dentro del área (nombres) para la lista de colisiones */
  existingFolders?: string[];
  /** ¿existe ya la carpeta del área? */
  areaFolderExists?: boolean;
  /** temas hermanos (existentes) que se pueden enlazar en «Requires» */
  linkable?: string[];
}

export interface CurriculumTask {
  markdown: string;
  shortPrompt: string;
  planned: PlannedEntry[];
}

export const MAX_FOLDER_NAME = 72;
const FORBIDDEN = /[\\/:*?"<>|]/;

/** `N.M Nombre`: ≤ 72 caracteres y sin `/ \ : * ? " < > |`. */
export function isValidTopicFolderName(name: string): boolean {
  return /^\d+(?:\.\d+)+ \S/.test(name) && name.length <= MAX_FOLDER_NAME && !FORBIDDEN.test(name) && name === name.trim();
}

/** El nombre de carpeta de un título: corta en los dos puntos, quita los caracteres prohibidos y recorta a 72. */
export function topicFolderName(number: string, title: string): string {
  const clean = (title.split(":")[0] ?? "").replace(/[\\/*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${number} ${clean}`.slice(0, MAX_FOLDER_NAME).trim();
}

export const slugOf = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const LANGUAGE: Record<string, string> = { html: "html", css: "css", "js-reference": "javascript", java: "java" };
const DISCIPLINE: Record<string, string> = { html: "frontend", css: "frontend", "js-reference": "javascript", java: "programming_logic" };
/** Skills de práctica por área (ids reales del catálogo de `_skills/practica_skill.md`; máximo 6). Referencias de lenguaje: concepto + código. */
const SKILLS: Record<string, string[]> = {
  html: ["pg_true_false", "explain", "implement", "debug", "review", "refactor"],
  css: ["pg_true_false", "explain", "implement", "debug", "trace", "refactor"],
  "js-reference": ["pg_true_false", "explain", "implement", "trace", "debug", "test"],
  java: ["pg_true_false", "explain", "implement", "trace", "debug", "test"],
};
/** Estas skills no tienen nivel 1 (`practica_skill.md`). */
export const SKILLS_WITHOUT_D1 = ["debug", "design", "review", "analyze", "port"];

export const languageOf = (areaId: string): string => LANGUAGE[areaId] ?? "agnostic";
export const topicTypeOf = (_area: CurriculumArea, _entry: CurriculumEntry): TopicType => "mixed";
export const skillsOf = (area: CurriculumArea, _entry: CurriculumEntry): string[] => [...(SKILLS[area.id] ?? SKILLS["js-reference"]!)].slice(0, 6);
const difficultyOf = (e: CurriculumEntry): number => (e.importance === "esencial" ? 1 : 2);

/** Separa `Espacio/Área/N.M Título`; lanza un `Error` con un mensaje claro si no cumple las reglas. */
export function parseSuggestedFolder(folder: string): { space: string; areaFolder: string; name: string; number: string; title: string } {
  const parts = String(folder ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 3) throw new Error(`La carpeta «${folder}» debe tener la forma Espacio/Área/N.M Tema (al menos dos niveles).`);
  const space = parts[0]!;
  const name = parts[parts.length - 1]!;
  const areaFolder = parts.slice(1, -1).join("/");
  if (!isValidTopicFolderName(name)) throw new Error(`«${name}» no es un nombre de carpeta válido (N.M Nombre, máximo ${MAX_FOLDER_NAME} caracteres, sin / \\ : * ? " < > |).`);
  const m = /^(\d+(?:\.\d+)+) (.+)$/.exec(name)!;
  return { space, areaFolder, name, number: m[1]!, title: m[2]! };
}

export function planEntries(area: CurriculumArea, selected: SelectedEntry[]): PlannedEntry[] {
  const seen = new Set<string>();
  return selected.map(({ entry, suggestedFolder }) => {
    const p = parseSuggestedFolder(suggestedFolder);
    if (seen.has(p.name)) throw new Error(`La carpeta «${p.name}» está repetida en la selección.`);
    seen.add(p.name);
    const folder = `${p.space}/${p.areaFolder}/${p.name}`;
    return {
      entry,
      folder,
      name: p.name,
      number: p.number,
      title: p.title,
      noteId: `programming.${slugOf(p.name)}`,
      topicType: topicTypeOf(area, entry),
      language: languageOf(area.id),
      difficulty: difficultyOf(entry),
      discipline: DISCIPLINE[area.id] ?? "programming_logic",
      skills: skillsOf(area, entry),
      noteRel: `${folder}/${p.name}.md`,
      practicaRel: `${folder}/${p.name}.practica.md`,
      mapRel: `${folder}/${p.name} — mapa.canvas`,
    };
  });
}

/** El texto del manifiesto de práctica: el MISMO que escribe `ensureTopicViewFiles` / `practica.mjs` (cabecera y cuerpo fijos de 2 líneas). */
export function practicaManifest(p: PlannedEntry): string {
  return [
    "---",
    "type: practica",
    "subject: programming",
    `title: ${p.name}`,
    `topic_type: ${p.topicType}`,
    `skills: [${p.skills.map((s) => `"${s}"`).join(", ")}]`,
    "min_per_skill: 6",
    "target_difficulty: 3",
    "exam: required",
    "---",
    "",
    `# Práctica — ${p.name}`,
    "",
    "Vista de práctica del tema: elige competencia, dificultad, cantidad y ayuda,",
    "o consulta el resumen de progreso (matriz competencia × dificultad).",
    "",
  ].join("\n");
}

/** La cabecera exacta que se le pide a la nota de teoría. */
export function noteFrontmatter(p: PlannedEntry, area: CurriculumArea, areaFolder: string, prerequisites: string[] = []): string {
  return [
    "---",
    `id: ${p.noteId}`,
    `title: ${JSON.stringify(p.title)}`,
    `number: ${JSON.stringify(p.number)}`,
    `area: ${JSON.stringify(areaFolder)}`,
    `topic: ${JSON.stringify(p.name)}`,
    "type: teorica",
    `topic_type: ${p.topicType}`,
    `difficulty: ${p.difficulty}`,
    "subject: programming",
    `language: ${languageOf(area.id)}`,
    `prerequisites: [${prerequisites.map((x) => JSON.stringify(x)).join(", ")}]`,
    "status: draft",
    "verified: false",
    "sources: []",
    `curriculum_id: ${p.entry.id}`,
    "---",
  ].join("\n");
}

export const temarioLine = (p: Pick<PlannedEntry, "name">): string => `- [[${p.name}]]`;

/** Una forma normalizada para comparar (minúsculas, sin comillas invertidas, espacios colapsados). */
const flat = (s: string): string => s.toLowerCase().replace(/`/g, "").replace(/\s+/g, " ");

/** ¿Aparece el elemento de referencia en la nota? */
export function itemCovered(note: string, item: string): boolean {
  return flat(note).includes(flat(item).trim());
}

/** Un cercado de markdown más largo que cualquier racha de ``` del texto. */
function fenced(text: string, lang = ""): string {
  const runs = text.match(/`+/g) ?? [];
  const n = Math.max(3, ...runs.map((r) => r.length + 1));
  const f = "`".repeat(n);
  return `${f}${lang}\n${text.replace(/\s+$/, "")}\n${f}`;
}

const sepOf = (root: string): string => (root.includes("\\") && !root.includes("/") ? "\\" : "/");
export const absJoin = (root: string, rel: string): string => {
  const sep = sepOf(root);
  return `${root.replace(/[\\/]+$/, "")}${sep}${rel.split("/").join(sep)}`;
};

const clip = (text: string | undefined, max: number): string => (text ?? "").slice(0, max);

export function buildCurriculumTask(input: CurriculumTaskInput): CurriculumTask {
  const { vaultRoot, space, area, skills, today, id, taskAbs } = input;
  if (!input.entries.length) throw new Error("Elige al menos un tema.");
  const planned = planEntries(area, input.entries);
  const areaFolder = area.areaFolder;
  const areaPrefix = `${space}/${areaFolder}/`;
  for (const p of planned) {
    if (!p.folder.startsWith(areaPrefix)) throw new Error(`«${p.folder}» no está en ${space}/${areaFolder}.`);
  }
  const withEx = input.withExercises === true;
  const existing = [...(input.existingFolders ?? [])].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const areaAbs = absJoin(vaultRoot, `${space}/${areaFolder}`);
  const temarioRel = `${space}/00 Temario.md`;
  const shortPrompt = `Read \`${taskAbs}\` and execute it. Create only the folders and files that file lists, change nothing else, and tell me when you are done.`;
  const names = new Set(planned.map((p) => p.name));
  const linkable = [...new Set([...(input.linkable ?? existing), ...planned.map((p) => p.name)])]
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const L: string[] = [];
  const push = (...l: string[]): void => void L.push(...l);

  push(
    `# NoteVault creation task — ${area.title} · ${planned.length} new topic${planned.length === 1 ? "" : "s"}`,
    "",
    "To run this task, paste only this:",
    "",
    `> ${shortPrompt}`,
    "",
    "---",
    "",
    `## 0. Goal`,
    "",
    `You are ADDING new reference topics to the **${space}** space of a NoteVault vault (\`${vaultRoot}\`), area **${areaFolder}** (${area.title}). Today is ${today}. Task id: \`${id}\`.`,
    `Each topic below is a small GROUP of related ${area.title} items (properties, elements, methods…). For every topic you create its folder, its theory note, its practice manifest and (optionally) exercises. The app wrote this task WITHOUT any AI and will VALIDATE your result when you finish (section 8) with the same checks it uses for its own notes.`,
    "Everything you write is in **English** (note text, code, comments, identifiers).",
    "",
    "## 1. Rules",
    "",
    "- Create ONLY the folders and files listed in sections 3–6. Never rename, move, delete or edit an existing folder or note, never create a topic INSIDE another topic's folder, and do not run git commands.",
    "- Layout is two levels: `Space/Area/<N.M Title>/`. The topic folder name, the note title/number and every `[[link]]` use the exact same name.",
    `- Folder names: \`N.M Name\`, at most ${MAX_FOLDER_NAME} characters, none of \`/ \\ : * ? " < > |\`. Use the folder names of section 2 literally.`,
    "- Do NOT draw or hand-edit any `.canvas`: topic maps are generated from the note (section 6).",
    "- Do NOT edit the app source (`frontend/src`, `electron`), the tools in `frontend/tools`, `.notevault` or `.trash`, nor other areas' finished notes.",
    "- Never invent an API, property, value, flag or version. If you are not certain it exists, leave it out. Verify code by RUNNING it (section 6), then write the expected result.",
    "- One topic = one idea. What belongs to another topic is linked with `[[…]]`, not repeated.",
    "",
    "## 2. Where: folders to create",
    "",
    `Vault: \`${vaultRoot}\``,
    `Area folder: \`${areaAbs}\` — ${input.areaFolderExists === false ? "does NOT exist yet: create it (see 5.2)" : "exists: do not touch what is already inside"}.`,
    "",
    "| # | Number | Topic folder (create exactly this) | Category | Importance |",
    "|---|---|---|---|---|",
  );
  planned.forEach((p, i) => push(`| ${i + 1} | ${p.number} | \`${absJoin(vaultRoot, p.folder)}\` | ${p.entry.category} | ${p.entry.importance} |`));
  push(
    "",
    `Numbers were assigned by the app so they do not collide with the folders that exist now. Folders already in \`${areaFolder}\` (collision check — none of these may be touched or reused):`,
    "",
    existing.length ? existing.map((n) => `- ${n}`).join("\n") : "- (the area has no topic folders yet)",
    "",
  );

  push("## 3. Instructions (the vault skills, inlined)", "", "These are the vault's own rules, word for word. They are binding.", "");
  const inline = (label: string, text: string | undefined, max: number): void => {
    if (text && text.trim()) push(`### ${label}`, "", fenced(clip(text, max)), "");
  };
  inline("Theory note skill (`_skills/resumen_teorico_skill.md`)", skills.resumenTeorico, SKILL_LIMITS.resumenTeorico);
  inline("Practice skill (`_skills/practica_skill.md`)", skills.practica, SKILL_LIMITS.practica);
  inline("Syllabus skill (`_skills/temario_skill.md`)", skills.temario, SKILL_LIMITS.temario);
  inline("Map skill (`_skills/mapa_skill.md`)", skills.mapa, SKILL_LIMITS.mapa);
  if (withEx) inline("Exercises skill", skills.ejercicios, SKILL_LIMITS.ejercicios);
  push("Where this task and the skills differ, THIS task wins for these reference-group topics (3 examples, 3 mistakes, the reference list of section 4).", "");

  push(
    "## 4. Contract of each theory note (`<Title>.md`)",
    "",
    "Headings in this order, exactly (the map generator and the app parse them):",
    "",
    "1. `# <number> <title>` — same as the folder name.",
    "2. `## Requires` — `- [[Earlier topic]] — why it is needed` (EXACT folder name of an existing topic of the list below), or `*No prerequisites.*`.",
    "3. `## Explanation` with `### What it is` and `### Mental model`:",
    "   - `### What it is`: **In one sentence.** a plain-language definition, then 2–3 short sentences with an everyday analogy and why you would use it in a real project; then the **REFERENCE** block (below); then the minimum syntax in a code block with a comment on every line.",
    "   - `### Mental model`: a numbered walkthrough of what the browser/engine/runtime does, then 3–5 bullets with **bold** lead-ins, ending with a bullet **In the practice:** what the learner will do with this and the first thing to check when it does not work.",
    "4. `## Examples` — exactly 3 examples `### Example N — title`. Each is EXACTLY four bullets (extra detail goes inside them, never as new bullets/headings): `- **Context:** …` (a realistic task, 1–3 sentences) · `- **Case:** …` (numbered steps `1.` `2.` `3.`, then the complete code block, with a plain-words comment on every line or small group of lines and `# <-- the important part` / `/* <-- the important part */` on the key line) · `- **Expected result:** …` (the exact output or what is seen on screen, and how to read it) · `- **Why it works:** …` (each step tied to its line; finish with **How you will apply it:** …).",
    "5. `## Common mistakes` — exactly 3 mistakes `### Mistake N — title`, each EXACTLY four bullets `- **Mistake:**` `- **Symptom:**` `- **Cause:**` `- **Fix:**` (behavioural slips that run but do the wrong thing, including those an AI assistant makes; the Fix shows the corrected line with a comment).",
    "6. `## Connections` — related topics (as `[[links]]`) and what they are for; new vocabulary at the end.",
    "7. `## Cards` — one card per KEY item of the group, between 6 and 9 in total (add a contrast or mistake card if the group has fewer than 6 items): `### 1 · definition` then `**Q:** …` and `**A:** …`. Types: definition, example, mistake, contrast, connection.",
    "",
    "**REFERENCE block (inside `### What it is`).** After the analogy, write `**Reference — N items.**` and then a NUMBERED list, one entry per item of the topic's item list (section 5), in that order and using the item text literally in backticks. Each entry has four short parts on one line or a few indented lines: **what it does** · **accepted values** · **default** (or `none`) · **one-line example with a comment**, e.g.",
    "",
    "```",
    "1. `item` — what it does in one sentence. Values: a | b | c. Default: a. Example: `item: b; /* what this line changes */`",
    "```",
    "",
    "Plain language: explain any term with an everyday analogy before using it. Everything is oriented to PRACTICE (the exercises of this topic); make each Context the same kind of task a learner would be given.",
    "",
    `Existing/planned topics you may link in \`## Requires\` and \`## Connections\` (EXACT names; anything else is removed or reported):`,
    "",
    linkable.length ? linkable.map((n) => `- ${n}`).join("\n") : "- (none)",
    "",
    "## 5. Work list",
    "",
    "### 5.1 Topics",
    "",
  );
  planned.forEach((p, i) => {
    const a = absJoin(vaultRoot, p.folder);
    push(
      `#### ${i + 1}. ${p.name}`,
      "",
      `- Category: ${p.entry.category} · importance: ${p.entry.importance} · entry id: \`${p.entry.id}\` · type: \`${p.topicType}\``,
      `- Create the folder: \`${a}\``,
      `- Write the theory note: \`${p.name}.md\` inside it, starting with EXACTLY this frontmatter (fill \`prerequisites\` with the names you put under \`## Requires\`; keep \`curriculum_id\`):`,
      "",
      fenced(noteFrontmatter(p, area, areaFolder), "yaml"),
      "",
      ...(p.entry.parentId
        ? [
            `- ATOMIC TOPIC: this note is about ONE single piece — \`${p.entry.title}\` — which belongs to the group «${p.entry.category}». Do not tour the whole group: go deep on this one piece (what it does, every value or form it accepts, default, interaction with its neighbours, one common mistake, one realistic use) and link to the group topic with \`[[…]]\` for the rest. Learning is linear: the group overview comes first, each piece after it, in number order.`,
          ]
        : []),
      `- Items of the group (**every one must appear in the note**, as a numbered REFERENCE entry and in the cards where it is key): ${p.entry.items.length ? p.entry.items.map((x) => `\`${x}\``).join(", ") : "(none listed: cover the topic title)"}.`,
      ...(p.entry.keywords.length ? [`- Keywords: ${p.entry.keywords.join(", ")}.`] : []),
      `- Write the practice manifest: \`${p.name}.practica.md\` inside the folder, with EXACTLY this content (the skills are already chosen):`,
      "",
      fenced(practicaManifest(p), "markdown"),
      "",
      `- Append to the syllabus (5.3): \`${temarioLine(p)}\`.`,
      "",
    );
  });

  push("### 5.2 Area folder", "");
  if (input.areaFolderExists === false) {
    push(
      `\`${areaFolder}\` is new: create the folder \`${areaAbs}\` and ONLY this file inside it, \`${areaFolder}.resumen.md\`, exactly:`,
      "",
      fenced(["---", "type: resumen", "subject: programming", `title: ${areaFolder}`, `scope: ${space}/${areaFolder}`, "---", "", `# Resumen — ${areaFolder}`, "", "Vista general del área: progreso por tema, competencias y dificultades,", "errores comunes y acceso a practicar el área completa.", ""].join("\n"), "markdown"),
      "",
      "Do not create `00 Units — …` or an area map: they are generated later.",
      "",
    );
  } else push(`\`${areaFolder}\` already exists: create only the topic folders above inside it.`, "");

  push(
    "### 5.3 Syllabus",
    "",
    `Open \`${absJoin(vaultRoot, temarioRel)}\` (header \`<!-- nv:generated -->\`). **Append, do not regenerate**: keep every existing line. Under the heading \`## ${areaFolder}\` (create that heading at the end of the file if it is missing) add one line per new topic, in numeric order:`,
    "",
    planned.map(temarioLine).join("\n"),
    "",
    "## 6. Maps and verification (run the commands from the NoteVault `frontend` folder, the one that contains `tools/programming_kb`)",
    "",
    "For each topic, in this order, and fix the NOTE (never the tools) until clean:",
    "",
    "1. Code you wrote: run it. JavaScript with `node file.js`; Java with `java File.java` (single-file) or `javac` + `java`. `node tools/programming_kb/check_examples.mjs \"^<number> \"` runs the Python/JS/TS Cases and prints the real output next to your Expected result. HTML/CSS/JSON are not run by that checker: render them in a real browser (or keep to documented behaviour you are certain of) and describe only what you saw. If a tool is not installed, do not claim output you did not obtain.",
    "2. `node tools/programming_kb/finalize.mjs \"^<number> \"` generates the topic map from the note. It must say `BLOCKED 0`. (The regex is matched against the folder name; escape the dots, as in the commands below.)",
    "3. `node tools/programming_kb/links.mjs \"^<number> \"` must list 0 unresolved `[[links]]`.",
    "",
    "Commands for this task:",
    "",
    fenced(planned.map((p) => `node tools/programming_kb/finalize.mjs "^${p.number.replace(/\./g, "\\.")} "`).join("\n"), "bash"),
    "",
    "Do not touch the files in `frontend/tools`; if you think a tool is wrong, say so in your final message.",
    "",
    "## 7. Exercises",
    "",
  );
  if (withEx) {
    push(
      "Create exercises for each topic: **between 12 and 16 per topic in total**, spread over the skills of its manifest and difficulties 1–3 (the skills " + SKILLS_WITHOUT_D1.map((s) => `\`${s}\``).join(", ") + " have no difficulty 1).",
      "",
      "- Path: `<topic folder>/Ejercicios/<skill>/ej_<skill>_d<difficulty>_<ts>_<i>.md` (`<ts>` any 13-digit number, the same for the topic; `<i>` = 1, 2, 3… within the file group).",
      "- Format (copy exactly; one file per exercise):",
      "",
      fenced(
        [
          "---",
          "type: exercise",
          "subject: programming",
          'title: "<short descriptive title>"',
          "mode: <skill id>",
          "discipline: <see below>",
          "difficulty: <1|2|3>",
          "assistance: nohelp",
          'topic: "<topic folder name>"',
          "---",
          "",
          "# <same title>",
          "",
          "## Statement",
          "<a concrete task or situation; code in fenced blocks>",
          "",
          "## Hints",
          "- <one hint>",
          "",
          "## Solution",
          "<the full solution; every code block was run>",
          "",
          "## Rubric",
          "- [ ] <criterion 1>",
          "- [ ] <criterion 2>",
          "- [ ] <criterion 3>",
          "",
        ].join("\n"),
        "markdown",
      ),
      "",
      "Required: a non-empty Statement and Solution and a Rubric with at least 3 criteria. Concept skills (`pg_true_false`, `explain`…) are applied to concrete situations, never trivia. Suggested base `<ts>` per topic (use as is): " +
        planned.map((p, i) => `${p.number} → \`${Date.parse(`${today}T12:00:00Z`) + i * 1000}\``).join(", ") + ".",
      "",
      "`discipline` per topic: " + planned.map((p) => `${p.number} → \`${p.discipline}\``).join(", ") + ".",
      "",
    );
  } else {
    push("**Skip exercises: the app generates them on demand.** Do NOT create an `Ejercicios` folder.", "");
  }

  push(
    "## 8. When you finish",
    "",
    "Tick every box, then tell the person: **done**. The person presses «Ya terminó — validar» in NoteVault; the app then, per topic:",
    "",
    "- checks the folder, the note (`<name>.md`), the manifest (`<name>.practica.md`) and that the syllabus has `[[<name>]]`;",
    "- checks the frontmatter (id, title, number, area, topic, type, topic_type, difficulty, subject, language, prerequisites, status, verified, sources, `curriculum_id`);",
    "- parses the note with the same reader as the map generator: required sections, the four fields of every example and mistake, the last section `## Cards` with content, zero problems;",
    "- checks that EVERY item of the topic's item list appears in the note;",
    "- checks the manifest (type, skills from the catalogue, min_per_skill, target_difficulty, exam)" + (withEx ? ", and every exercise note (statement, solution, rubric ≥ 3)" : "") + ";",
    "- generates the topic map itself if it is missing. A topic that fails is listed with the exact problems so you can fix it and run the validation again.",
    "",
    "Checklist:",
    "",
  );
  for (const p of planned) {
    push(
      `- [ ] \`${p.folder}/\` created`,
      `- [ ] \`${p.name}.md\` written (frontmatter with \`curriculum_id: ${p.entry.id}\`; all ${p.entry.items.length} items; 3 examples; 3 mistakes; cards)`,
      `- [ ] \`${p.name}.practica.md\` written`,
      `- [ ] map generated (\`finalize\`, BLOCKED 0) and links resolved`,
      `- [ ] ${temarioLine(p)} appended under \`## ${areaFolder}\` in \`00 Temario.md\``,
    );
    if (withEx) push(`- [ ] 12–16 exercises under \`${p.name}/Ejercicios/\``);
  }
  push(
    "- [ ] Nothing outside the folders and files above was changed.",
    "",
    `> Generated by NoteVault on ${today}, without AI. Task file: \`${taskAbs}\`. Topics: ${[...names].join(", ")}.`,
    "",
  );

  return { markdown: L.join("\n"), shortPrompt, planned };
}

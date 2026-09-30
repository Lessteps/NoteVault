/**
 * The chat's vault modes: guided flows in which the AI proposes files for the vault.
 * The renderer mirrors ids and labels in `lib/assistantModes.ts` (it cannot import
 * `src/core`); a test keeps both lists in step.
 */

export const VAULT_MODE_IDS = ["temario", "canvas", "tema", "matriz"] as const;
export type VaultModeId = (typeof VAULT_MODE_IDS)[number];

export function isVaultMode(value: unknown): value is VaultModeId {
  return (VAULT_MODE_IDS as readonly string[]).includes(String(value));
}

export const ACTION_PROTOCOL = [
  "FILE ACTIONS. You never write files yourself. To create or change something in the user's vault, END your reply with exactly one fenced block:",
  "```nv-action",
  '{"action":"<name>","args":{ ... }}',
  "```",
  "The app shows the user what would be created and writes ONLY after they click \"Aplicar\". EVERY field listed below goes INSIDE \"args\" (never beside \"action\"). Available actions (shown as their args):",
  '- create_syllabus: {"subject":"JavaScript","subject_id":"mathematics|programming|english","areas":[{"name":"1 Fundamentos","folder":"1 Fundamentos","topics":[{"name":"1.1 Variables y tipos"}]}]}',
  '- create_topic: {"area":"<existing vault folder of the area>","subject_id":"...","topic":{"name":"1.13 Conjuntos"},"theory":"<markdown of the theory note>","skills":["solve","prove"]}  (skills optional, ids of the subject catalogue)',
  '- create_canvas: {"path":"<vault path without extension>","canvas":{"nodes":[{"id":"n1","type":"text","text":"...","x":0,"y":0,"width":260,"height":120}],"edges":[{"id":"e1","fromNode":"n1","toNode":"n2","label":"why they connect"}]}}',
  '- set_practice_plan: {"topic":"<vault path of the topic folder>","topic_type":"theoretical|procedural|mixed","skills":[{"skill":"solve","difficulties":{"1":3,"2":4,"3":2},"why":"..."}],"summary":"..."}  (replaces the competency matrix of THAT topic only; send the FULL matrix, not just the changes)',
  '- write_skill: {"name":"canvas_skill","folder":"<optional subject folder>","content":"<markdown>"}  (saved in _skills/, replaces the file with that name)',
  '- create_note: {"path":"<vault path>","content":"<markdown>"}',
  "Rules: at most one action per reply; strictly valid JSON (escape newlines as \\n and backslashes as \\\\); folder and file names have no / \\ : * ? \" < > |; paths are relative to the vault and never leave it; talk to the user in Spanish, briefly, before the block. Nothing is created until they accept, so never claim it already exists.",
].join("\n");

const TEMARIO = [
  "MODE: SYLLABUS GENERATION (a guided wizard). Follow these steps IN ORDER, one step per reply, remembering every answer already given in this conversation. Never ask the user to name a level, scope or depth: infer them.",
  "1. AREA: if the user has not said the main area/subject yet (e.g. JavaScript, Cálculo diferencial, Backend Development), ask for it.",
  "2. OBJECTIVE: ask for the concrete result they want to reach by studying it; it decides depth and which contents are selected.",
  "3. DIAGNOSIS: ask at most 5 short questions in ONE message to learn their context (what they already know, what they have built or solved, time available…). From the answers you decide: starting point, needed depth, fundamental contents, whether introductory phases are needed, and missing prerequisites.",
  '4. PREREQUISITES: say which prior knowledge the objective needs and whether a "Fase 0" (an introductory area numbered 0) is needed; ask for a one-line confirmation.',
  "5. FOCUS: ask what purpose the syllabus should serve inside the area (e.g. Backend). The focus steers selection and depth but must not stop you from adding complementary knowledge the objective needs.",
  "6. EXTENSIONS: from area, objective and focus detect complementary areas that could help (e.g. TypeScript, Testing, Node.js, Patrones de diseño) and offer them as a bulleted list; the user may accept, reject or ignore them.",
  '7. GENERATE: once extensions are settled, show the full syllabus as a compact outline (phases, areas, numbered topics like "1.1 …", ordered by learning dependencies) and ask "¿Lo creo?". Only when the user confirms, end with the create_syllabus action.',
  'If the user selected a folder in the chat (see "Folders selected"), the syllabus goes INSIDE it: skip every step whose answer is already known from the message or from what that folder contains, and never propose areas it already has. create_syllabus itself also writes the space overview, "00 Temario.md" (the linked outline) and the space map canvas, so do not offer them separately.',
  'Conventions: area folders are "N Nombre" and topic folders "N.M Nombre" (natural numeric order; Fase 0 is area "0 …"); 6-12 topics per area; topic names must stay identical across theory, practice and canvas. Theory notes, practice plans and canvases are created afterwards, one topic at a time.',
].join("\n");

const CANVAS = [
  "MODE: CANVAS GENERATION. Build a canvas for the topic the user names (or the topic of the open note) following the vault canvas skill given under \"Vault skills\" (Matemáticas canvas skill, or the FULLSTACK canvas skills for programming). Every micro-step gets a heading, a \"How to\" note and an example, and EVERY arrow has a label explaining the connection.",
  "If the user attaches an example canvas (as selection or open note), replicate its structure, colours and spacing and use it as the template. You may refine the canvas skill or save a reusable template when asked (write_skill, name canvas_template_<name>), improving it iteratively as the user requests changes.",
  "Ask only what you truly need. Then end with the create_canvas action (Obsidian JSON Canvas: nodes need id, type text|file|group|link, x, y, width, height; edges need id, fromNode, toNode, label). Place the file next to the topic's notes.",
].join("\n");

const TEMA = [
  "MODE: NEW TOPIC IN AN AREA. The user wants to add a topic to an existing area (its current topics are listed under \"Area context\"). If they have not said which topic, ask.",
  'Pick a number that keeps the natural order (e.g. "1.13 …") and avoid duplicating an existing topic. Write the theory in Spanish, rigorous and concise, following the vault theory skill given under "Vault skills" (frontmatter plus its sections). Then end with the create_topic action (area = the area folder shown in the context).',
  "Tell the user that afterwards the wand button of the topic's practice tab lets the AI choose the competencies and how many exercises to do.",
].join("\n");

const MATRIZ = [
  'MODE: COMPETENCY MATRIX OF THE OPEN TOPIC. The user wants to change which competencies (skills) THIS topic trains and how many passed exercises each difficulty needs. The current matrix and the skill catalogue are under "Matrix context".',
  "Rules: only skills whose type fits the topic (a theoretical topic never gets quick calculation `drill`; a procedural one gets no proofs); 3-6 skills; counts per difficulty 0-12 (0 = that level is not practised); the change affects only this topic.",
  "Explain briefly what you will change and why, then end with the set_practice_plan action containing the COMPLETE new matrix (every skill that must remain, not only the changed ones).",
].join("\n");

/** Directive text per mode; the protocol is appended so every mode can act. */
export const VAULT_MODE_DIRECTIVES: Record<VaultModeId, string> = {
  temario: `${TEMARIO}\n\n${ACTION_PROTOCOL}`,
  canvas: `${CANVAS}\n\n${ACTION_PROTOCOL}`,
  tema: `${TEMA}\n\n${ACTION_PROTOCOL}`,
  matriz: `${MATRIZ}\n\n${ACTION_PROTOCOL}`,
};

const MAX_SKILL_CHARS = 3000;

/** The dynamic part of a mode's prompt: the vault's skills and the area being worked on. */
export function buildModeContext(input: {
  skills: ReadonlyArray<{ title: string; content: string }>;
  areaFolder?: string;
  areaTopics?: readonly string[];
  /** folder of the open note: files that belong to its topic go there */
  noteFolder?: string;
  /** the open topic's competency matrix and the catalogue, for the matrix mode */
  matrix?: string;
  /** folders the user selected in the chat (vault-relative paths) */
  folders?: readonly string[];
}): string {
  const parts: string[] = [];
  if (input.skills.length) {
    parts.push(
      "Vault skills (follow them):\n" +
        input.skills.map((s) => `### ${s.title}\n${s.content.slice(0, MAX_SKILL_CHARS).trim()}`).join("\n\n"),
    );
  }
  if (input.areaFolder) {
    parts.push(
      `Area context: folder "${input.areaFolder}". Existing topics: ${input.areaTopics?.length ? input.areaTopics.join("; ") : "(none)"}.`,
    );
  }
  if (input.folders?.length) {
    parts.push(
      'Folders selected by the user in the chat ("this folder", "this topic" and "here" refer to them; work INSIDE them and never create a sibling with a similar name):\n' +
        input.folders.map((f) => `- ${f}`).join("\n") +
        "\nFor create_syllabus: if a selected folder is a top-level folder, its exact name MUST be args.subject (the areas are added inside it). For create_topic use a selected area folder as args.area; for set_practice_plan a selected topic folder as args.topic.",
    );
  }
  if (input.matrix) parts.push(`Matrix context:\n${input.matrix}`);
  if (input.noteFolder) {
    parts.push(
      `Open note folder: "${input.noteFolder}". Put new files that belong to this note's topic (its canvas, for example) inside that folder.`,
    );
  }
  return parts.join("\n\n");
}

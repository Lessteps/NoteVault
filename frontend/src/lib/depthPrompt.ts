// El archivo de tarea que la app escribe para que OTRA IA (Antigravity) desglose en piezas los capítulos gruesos de un área, y la frase corta que la persona pega.
// La app dice QUÉ pedir; la persona no tiene que redactar nada. Puro: sin disco.

import { MIN_PIECES_PER_CHAPTER, type DepthGap } from "./areaDepth.js";

export interface DepthTask {
  markdown: string;
  shortPrompt: string;
}

export function buildDepthTask(gap: DepthGap, o: { taskAbs: string; space: string; vaultAbs: string; notevaultAbs: string }): DepthTask {
  const shortPrompt = `NEW TASK — ignore everything we discussed before in this conversation. Read \`${o.taskAbs}\` and execute it. Do ALL of it in one run, WITHOUT stopping or asking me anything between chapters; report once at the very end. If you are resuming after an interruption, skip every chapter that already has its pieces and continue with the first one that does not. Write only inside the vault folders the file names; do NOT modify the NoteVault app (frontend/, electron/) or ~/.notevault.`;
  const L: string[] = [];
  L.push(`# Break ${gap.coarse.length} coarse chapter${gap.coarse.length === 1 ? "" : "s"} of «${gap.groupTitle}» (${gap.area}) into atomic pieces`);
  L.push("", `> ${shortPrompt}`, "");
  L.push("## Why", "", `The app measured the area: ${gap.coarse.length} of its ${gap.chapters} chapters are a single big topic with fewer than ${MIN_PIECES_PER_CHAPTER} pieces. In this vault a topic is ONE thing (one HTML element, one SQL clause, one HTTP concept), so a chapter that covers a dozen things in one note is too coarse to study and to practise.`, "");
  L.push("## What to do", "", `For EACH chapter below: design the pieces a real course would have for it (at least ${MIN_PIECES_PER_CHAPTER}, as many as the chapter really needs, one per concept/command/construct) and create them as new topics numbered \`<chapter>.1\`, \`<chapter>.2\`, … under the same area folder. Then add a \`## Pieces\` section with \`[[links]]\` to the chapter note. Do NOT rename, renumber, move or delete anything that exists, and do not edit the chapter's content beyond that section.`, "");
  L.push("## Rules (read these first, in this order)", "");
  L.push(`1. \`${o.space}/_skills/subtemas_skill.md\` — how to add a topic inside an existing area.`);
  L.push(`2. \`${o.space}/_skills/resumen_teorico_skill.md\`, \`mapa_skill.md\`, \`practica_skill.md\` — the CURRENT contract of a theory note, a map and a practice manifest. Notes that drift from it get flagged as outdated.`);
  L.push(`3. Model notes that pass the checkers: \`1 Fundamentals/1.1 What programming is\` and \`6 Databases/6.4.1 SELECT statement\`. Copy their SHAPE (the \`**In one sentence.**\` opening, numbered mental model, \`- **In the practice:**\`, Examples, Common mistakes), not their content.`);
  L.push(`4. Every code example must be run before you write its result. Never invent output.`);
  L.push(`5. Section names in the area's \`00 Units — <area>.md\` must be distinct and say what they contain; add each new piece under the section of its chapter.`);
  L.push("", "## The chapters", "", "| Chapter | Minutes | Pieces now |", "|---|---|---|");
  for (const c of gap.coarse) L.push(`| \`${c.folder.split("/").pop()}\` | ${c.estMinutes} | ${c.pieces} |`);
  L.push("", "## Verify (from `NoteVault/frontend`, after every chapter)", "", "```bash");
  L.push(`export PKB_SPACE=${o.vaultAbs}/${o.space}`);
  L.push(`node tools/programming_kb/finalize.mjs "^<chapter number>\\\\."   # BLOCKED 0 — generates the map`);
  L.push(`node tools/programming_kb/links.mjs "^<chapter number>\\\\."      # 0 unresolved [[links]]`);
  L.push(`node tools/programming_kb/check_format.mjs "^<chapter number>\\\\."   # 0 do NOT follow the current skill format`);
  L.push("```", "");
  L.push("Commit in the vault after each area section (`git add -A && git commit`), do not push. You are finished only when `check_format.mjs` (no argument) prints `0 do NOT follow`. The NoteVault app detects the new topics by itself and adds them to the plan: you do not need to register anything.", "");
  return { markdown: L.join("\n"), shortPrompt };
}

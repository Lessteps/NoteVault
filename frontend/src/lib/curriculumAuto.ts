// Modo AUTOMÁTICO de «Temas por crear»: la app misma pide a su IA la nota de cada tema de referencia (uno tras otro) con EL MISMO contrato que la tarea
// para Antigravity. Aquí solo lo puro: el prompt de una nota y la línea del temario. Sin disco, red ni IA.

import { noteContractLines, SKILL_LIMITS, type CurriculumSkills, type PlannedEntry } from "./curriculumPrompt.js";

export interface AutoMessage {
  role: "system" | "user";
  content: string;
}

export const AUTO_SYSTEM = [
  "You write ONE theory note for a personal study vault (NoteVault). Everything is in English.",
  "Return ONLY the note body in Markdown, starting with the line `# <number> <title>` of the topic. No frontmatter, no code fence around the note, no commentary before or after.",
  "Follow the vault's theory skill and the note contract in the user message exactly: same headings, same order, same counts.",
  "Never invent an API, property, value, flag or version. If you are not certain it exists, leave it out. Every code block must be correct and complete.",
  "An ATOMIC topic is about ONE single piece (an element, a property, a method): go deep on it, and link the group topic with [[…]] instead of touring the group.",
].join("\n");

const clip = (t: string | undefined, max: number): string => (t ?? "").slice(0, max);

/** El mensaje para escribir la nota de UN tema (`p`) con el texto de la skill de teoría y el contrato de la sección 4 de la tarea. */
export function autoNoteMessages(p: PlannedEntry, areaTitle: string, o: { skills: CurriculumSkills; linkable: readonly string[] }): AutoMessage[] {
  const atomic = p.entry.parentId
    ? [`ATOMIC TOPIC: this note is about ONE piece — \`${p.entry.title}\` — of the group «${p.entry.category}». Go deep on this piece (what it does, every value or form it accepts, the default, how it interacts with its neighbours, one common mistake, one realistic use) and link the group topic with [[…]]. Cards are 6–9 questions about THIS piece.`, ""]
    : [];
  const user = [
    `Write the theory note of this ${areaTitle} topic.`,
    "",
    `- Topic: \`${p.name}\` (number ${p.number}, title «${p.title}»)`,
    `- Category: ${p.entry.category} · importance: ${p.entry.importance} · type: \`${p.topicType}\``,
    `- Items that EVERY ONE must appear in the note (as a numbered REFERENCE entry and in the cards where key): ${p.entry.items.length ? p.entry.items.map((x) => `\`${x}\``).join(", ") : "(none listed: cover the topic title)"}.`,
    ...(p.entry.keywords.length ? [`- Keywords: ${p.entry.keywords.join(", ")}.`] : []),
    "",
    ...atomic,
    ...(o.skills.resumenTeorico ? ["## Theory note skill (the vault's own rules, binding)", "", clip(o.skills.resumenTeorico, SKILL_LIMITS.resumenTeorico), ""] : []),
    ...noteContractLines(o.linkable),
    "",
    `Start the note with \`# ${p.name}\` and end it with the \`## Cards\` section. Nothing else.`,
  ].join("\n");
  return [
    { role: "system", content: AUTO_SYSTEM },
    { role: "user", content: user },
  ];
}

/** El mensaje que pide corregir una nota que no pasó las comprobaciones. */
export const autoFixMessage = (problems: readonly string[], name: string): string =>
  `The note does not meet the contract:\n- ${problems.join("\n- ")}\n\nReturn the COMPLETE corrected note, no frontmatter, starting with \`# ${name}\`.`;

/** Quita lo que la IA suele añadir alrededor: una valla de código y un frontmatter propio. */
export function cleanNoteReply(reply: string): string {
  return reply.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim().replace(/^---[\s\S]*?\n---\s*/, "").trim();
}

/** Añade `line` al final de la sección `heading` de `00 Temario.md` (la crea si no existe). Idempotente. */
export function appendTemarioLine(text: string, heading: string, line: string): string {
  if (text.split(/\r?\n/).some((l) => l.trim() === line.trim())) return text;
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === heading.trim());
  if (at < 0) return `${text.replace(/\s*$/, "")}\n\n${heading}\n${line}\n`;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (/^##\s/.test(lines[i]!)) { end = i; break; }
  let last = end - 1;
  while (last > at && !lines[last]!.trim()) last--;
  lines.splice(last + 1, 0, line);
  return lines.join("\n");
}

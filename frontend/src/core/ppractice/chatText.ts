/**
 * What the chat conversation shows for each call to the model. The model answers JSON; reading `{"ideas":[{"title":…` in a
 * chat is useless, so every answer is written there as the text it describes.
 */

import type { DefenseGrade, FinalReport, Idea, LayerReport } from "./prompts.js";
import type { Postmortem } from "./profile.js";
import type { ProjectSpec } from "./spec.js";

const list = (items: readonly string[]): string => items.map((i) => `- ${i}`).join("\n");

export function ideasText(ideas: readonly Idea[]): string {
  return ["Ideas propuestas:", "", ...ideas.map((i) => `**${i.title}** — ${i.focus} · ${i.client} · ${i.hours} h\n${i.problem}\n_${i.why}_`)].join("\n\n");
}

export function planText(plan: ReadonlyArray<Idea & { week: number }>): string {
  return ["Plan propuesto:", "", ...plan.map((w) => `**Semana ${w.week}: ${w.title}** — ${w.focus} · ${w.client} · ${w.hours} h\n${w.problem}`)].join("\n\n");
}

/** A specification candidate, before it is validated. */
export function specText(spec: ProjectSpec): string {
  return [
    `Especificación propuesta: **${spec.title}** (carpeta «${spec.folder}»)`,
    `Foco ${spec.focus} · cliente ${spec.client} · ${spec.hours} h`,
    "",
    `Base de datos: ${spec.database.tables.length} tablas, ${spec.database.criteria.length} criterios`,
    `Backend: ${spec.backend.endpoints.length} endpoints, ${spec.backend.criteria.length} criterios`,
    `Cliente: ${spec.clientLayer.screens.length} pantallas, ${spec.clientLayer.criteria.length} criterios, ${spec.clientLayer.patterns.length} patrones`,
    `Foco: ${spec.focusCriteria.length} criterios · Automatización: ${spec.automation ? "sí" : "no"}`,
  ].join("\n");
}

export function reviewText(r: LayerReport): string {
  const unmet = r.criteria.filter((c) => !c.met);
  return [
    `Revisión de ${r.layer}: **${r.verdict}**`,
    r.criteria.length ? `Criterios cumplidos: ${r.criteria.length - unmet.length}/${r.criteria.length}` : "",
    unmet.length ? `No cumplidos:\n${list(unmet.map((c) => c.criterion))}` : "",
    r.issues.length ? `Problemas:\n${list(r.issues.map((i) => `[${i.severity}] ${i.file}${i.line ? `:${i.line}` : ""} — ${i.problem}`))}` : "Sin problemas de comportamiento.",
    r.strengths.length ? `Bien hecho:\n${list(r.strengths)}` : "",
  ].filter(Boolean).join("\n\n");
}

export function finalText(f: FinalReport): string {
  return [`Veredicto: ${f.functional ? "funcional" : "**no funcional**"} · ${f.score}/100`, f.summary, f.mustFix.length ? `Hay que arreglar:\n${list(f.mustFix)}` : "", `Preguntas de defensa:\n${list(f.questions.map((q) => `${q.id}. ${q.question}`))}`].filter(Boolean).join("\n\n");
}

export function gradeText(g: DefenseGrade): string {
  return [`Defensa: ${g.score}/100`, g.summary, list(g.items.map((i) => `${i.id} — ${i.verdict}: ${i.feedback}`)), g.gaps.length ? `A repasar: ${g.gaps.join("; ")}` : ""].filter(Boolean).join("\n\n");
}

export function postmortemText(p: Postmortem): string {
  return [
    `Postmortem de **${p.project}** — ${p.score}/100`,
    p.summary,
    p.weaknesses.length ? `A mejorar:\n${list(p.weaknesses.map((w) => `[${w.layer}] ${w.label}`))}` : "",
    p.strengths.length ? `Bien hecho:\n${list(p.strengths)}` : "",
    p.styleNotes.length ? `Cómo escribes código:\n${list(p.styleNotes)}` : "",
    p.nextFocus ? `Próximo foco: ${p.nextFocus}` : "",
  ].filter(Boolean).join("\n\n");
}

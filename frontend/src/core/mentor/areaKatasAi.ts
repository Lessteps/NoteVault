/**
 * Katas por área generados con IA, por BLOQUES de semanas (mismo patrón que `planCurriculumAi`): una llamada pide los katas de varios días de UN
 * área; cada kata se VALIDA y, si no pasa (o la IA no devuelve ese día), se usa la plantilla determinista de `lib/areaPracticeSystem.ts`.
 * La IA solo recibe el área, las habilidades y el nivel de cada día; nunca las notas. La habilidad de cada día la decide la app, no la IA.
 */

import { areaKataSkillId } from "../../lib/planAreaPractice.js";
import { areaLabelOf, kataForDay, type AreaKata } from "../../lib/areaPracticeSystem.js";

export interface KataBlockDay {
  day: number;
  level: number;
}

const oneLine = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const text = (v: unknown, max: number): string => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

export function kataBlockMessages(areaId: string, days: readonly KataBlockDay[]): Array<{ role: "system" | "user"; content: string }> {
  const plan = days.map((d) => {
    const t = kataForDay(areaId, d.day, d.level);
    return t ? { day: d.day, skill: t.skillName, level: t.level, minutes: t.minutes } : null;
  }).filter(Boolean);
  const system = [
    `You write the daily katas of the ${areaLabelOf(areaId)} practice area for a developer who is preparing for technical interviews and wants to improve the logic of the area and its most important skills.`,
    "Everything is written in English. A kata is a 20-30 minute exercise about ONE skill, set in a small real situation (no toy names like foo or data1), with a precise task and a deliverable that can be judged.",
    "Rules: do not change the skill or the level given for each day; the statement must name a concrete situation, the task and the deliverable; criteria are things a good answer shows (3 to 5); hints are progressive (2 or 3) and never reveal the solution; the solution is a short expected answer.",
    'Answer ONLY with JSON: {"katas":[{"day":1,"title":"short title","statement":"markdown","criteria":["..."],"hints":["..."],"solution":"..."}]}',
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `Area: ${areaLabelOf(areaId)}\nKatas to write (one per day, keep the skill and the level):\n${JSON.stringify(plan)}` },
  ];
}

export interface AiKata {
  title: string;
  statement: string;
  criteria: string[];
  hints: string[];
  solution: string;
}

/** Valida la respuesta: solo se aceptan los días pedidos y los katas que cumplen las reglas; el resto vuelve a la plantilla. */
export function parseKataBlock(reply: string, expected: readonly number[]): Map<number, AiKata> {
  const out = new Map<number, AiKata>();
  const s = String(reply ?? "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return out;
  let j: any;
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return out;
  }
  for (const k of Array.isArray(j?.katas) ? j.katas : []) {
    const day = Math.round(Number(k?.day));
    if (!expected.includes(day) || out.has(day)) continue;
    const title = oneLine(k.title, 80);
    const statement = text(k.statement, 1800);
    const criteria = (Array.isArray(k.criteria) ? k.criteria : []).map((c: unknown) => oneLine(c, 220)).filter((c: string) => c.length >= 8).slice(0, 6);
    const hints = (Array.isArray(k.hints) ? k.hints : []).map((c: unknown) => oneLine(c, 260)).filter((c: string) => c.length >= 8).slice(0, 3);
    const solution = text(k.solution, 1500);
    if (title.length < 6 || statement.length < 80 || criteria.length < 3 || hints.length < 2 || solution.length < 30) continue;
    out.set(day, { title, statement, criteria, hints, solution });
  }
  return out;
}

/** El kata de la plantilla con el contenido validado de la IA (la habilidad, el nivel y el id siguen siendo los de la app). */
export function mergeAiKata(base: AreaKata, ai: AiKata): AreaKata {
  const safe = ai.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    ...base,
    title: ai.title,
    statement: ai.statement,
    criteria: ai.criteria,
    hints: ai.hints,
    solution: ai.solution,
    file: `${String(base.day).padStart(3, "0")} ${safe}.md`,
  };
}

export { areaKataSkillId };

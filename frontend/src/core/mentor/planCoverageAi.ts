/**
 * «Revisar cobertura con el Mentor»: el prompt de UNA llamada pequeña a la IA. Recibe SOLO el objetivo del plan, el perfil declarado,
 * la lista compacta de temas por área y grupo (títulos) y el resumen determinista de cobertura (`lib/planCoverage.ts`). Nunca lee notas.
 * La respuesta se valida con `parseCoverageReply` (descarta lo que ya existe, normaliza áreas) y se guarda como `Plan.coverageReview`.
 */

import type { AreaGroup } from "../../lib/planAreas.js";
import type { PlanCoverage } from "../../lib/planCoverage.js";
import { areaKeyOf } from "../../lib/planCoverage.js";

export interface CoverageAiInput {
  objective: string;
  profile: string;
  subplans: ReadonlyArray<{ id: string; area: string; areaId?: string; objective?: string; groups?: readonly AreaGroup[]; topics: ReadonlyArray<{ title: string; group?: string }> }>;
  coverage: PlanCoverage;
}

/** Títulos por grupo como mucho (el prompt queda en unos pocos KB aunque el plan tenga cientos de temas). */
const MAX_TITLES_PER_GROUP = 90;
const MAX_OUT_OF_PLAN = 40;

export const COVERAGE_SYSTEM_PROMPT = [
  "Eres un mentor técnico senior que REVISA la cobertura de un plan de estudio. No tienes acceso a las notas: solo a la lista de temas del plan por área y a un resumen calculado por la app.",
  "Tu trabajo: decir, para el objetivo y el perfil del estudiante, qué conocimientos FALTAN en cada área (temas nuevos que no están en la lista ni fuera del plan), qué temas del plan sobran o están en un área equivocada, y una valoración breve por área.",
  "Reglas:",
  "- Las áreas son SOLO las dadas; usa su `key` exacta.",
  "- `missing`: temas concretos que faltan (título corto en el idioma de los temas, `why` en español de una frase, `group` opcional: el id de uno de los grupos del área). No repitas temas que ya están en la lista ni en `outOfPlan`.",
  "- `misplaced`: temas de la lista que sobran o irían mejor en otra área (`title` EXACTO de la lista, `reason`, `suggestedArea` opcional con la key de otra área).",
  "- Sé concreto y honesto (p. ej. «Backend se queda corto para automatización: faltan colas, jobs programados, scraping, integración con APIs»). Como mucho 8 faltantes por área.",
  "- No inventes métricas ni horas. No propongas crear notas: solo informa.",
  'Responde SOLO con JSON: {"summary": "valoración global (máx. 3 frases)", "areas": [{"key": "backend", "assessment": "una o dos frases", "missing": [{"title": "Message queues", "why": "…", "group": "core"}], "misplaced": [{"title": "…", "reason": "…", "suggestedArea": "automation"}]}]}',
].join("\n");

export function coverageMessages(input: CoverageAiInput): Array<{ role: "system" | "user"; content: string }> {
  const cov = new Map(input.coverage.areas.map((a) => [a.key, a]));
  const areas = input.subplans.map((s) => {
    const key = areaKeyOf(s);
    const c = cov.get(key);
    const groups = (s.groups?.length ? [...s.groups].sort((a, b) => a.order - b.order) : [{ id: "", title: "Temas", kind: "knowledge" as const, order: 0 }]).map((g) => {
      const titles = s.topics.filter((t) => (g.id ? t.group === g.id : true)).map((t) => t.title);
      return { id: g.id, title: g.title, count: titles.length, topics: titles.slice(0, MAX_TITLES_PER_GROUP), ...(titles.length > MAX_TITLES_PER_GROUP ? { more: titles.length - MAX_TITLES_PER_GROUP } : {}) };
    });
    return {
      key,
      area: s.area,
      ...(s.objective ? { objective: s.objective } : {}),
      groups,
      coverage: c ? { topics: c.total, withTheory: c.theory, withPractice: c.practice, withoutPractice: c.total - c.practice - c.notFound, notFound: c.notFound } : undefined,
      outOfPlan: (c?.outOfPlan ?? []).filter((t) => !t.done).slice(0, MAX_OUT_OF_PLAN).map((t) => t.title),
    };
  });
  const payload = { objective: input.objective || "(sin objetivo escrito)", profile: input.profile || "(no declarado)", areas };
  return [
    { role: "system", content: COVERAGE_SYSTEM_PROMPT },
    { role: "user", content: `Revisa la cobertura de este plan:\n${JSON.stringify(payload)}` },
  ];
}

// Lenguajes del plan con PRÁCTICA PROPIA cada día (Python · JavaScript · TypeScript).
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Las reglas son una TABLA DE DATOS (`AREA_LANGUAGE_RULES`),
// documentada en docs/VAULT_FORMAT.md («Lenguajes del plan»).
//
// Qué dice el usuario: «backend como área centraliza esa práctica, pero también hace falta la práctica del lenguaje; quiero practicar con
// Python y, por obligación, TypeScript y JavaScript para backend y Python». Por eso:
//  - Backend  ⇒ Python + JavaScript + TypeScript obligatorios (backend en TypeScript y Python);
//  - Frontend ⇒ JavaScript + TypeScript obligatorios;
//  - Automation ⇒ Python obligatorio (la automatización es solo Python);
//  - si el estudiante elige Python (o cualquier otro lenguaje), queda en el plan; Python elegido a mano es obligatorio.
// El plan guarda la lista en `preconditions.languages`; cada día de estudio lleva un bloque «Práctica de <lenguaje>» (sintaxis, lógica y
// resolución de problemas) que rota por la lista con una proporción por lenguaje (Python más frecuente por defecto).

import { classifyBranch, PLAN_LANGUAGE_IDS, type PlanLanguage, type PlanLanguageId } from "./planTime.js";

export const LANGUAGE_NAME: Readonly<Record<PlanLanguageId, string>> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript" };
/** Proporción por defecto de la rotación diaria: Python es el más frecuente. */
export const DEFAULT_LANGUAGE_WEIGHT: Readonly<Record<PlanLanguageId, number>> = { python: 3, javascript: 2, typescript: 2 };

/** Qué áreas hacen obligatorio qué lenguajes (datos). */
export const AREA_LANGUAGE_RULES: Readonly<Record<string, { languages: readonly PlanLanguageId[]; why: string }>> = {
  backend: { languages: ["python", "javascript", "typescript"], why: "Backend se practica en Python y en TypeScript/JavaScript" },
  frontend: { languages: ["javascript", "typescript"], why: "Frontend es JavaScript y TypeScript" },
  automation: { languages: ["python"], why: "La automatización es solo Python" },
};

export const languageName = (id: string): string => LANGUAGE_NAME[id as PlanLanguageId] ?? id;

/** El id de un lenguaje a partir de un nombre («Python», «typescript», «JS»); `undefined` si no es uno de los tres. */
export function languageIdOf(name: string | undefined): PlanLanguageId | undefined {
  const n = (name ?? "").toLowerCase();
  if (/python/.test(n)) return "python";
  if (/typescript|\bts\b/.test(n)) return "typescript";
  if (/javascript|\bjs\b/.test(n)) return "javascript";
  return undefined;
}

/** Ids de área elemental que implican unas ramas de carpeta (por la clasificación por nombre). */
export function areaIdsOfBranches(branchNames: readonly string[]): string[] {
  const out = new Set<string>();
  for (const b of branchNames) {
    const k = classifyBranch(b);
    if (k === "backend" || k === "frontend" || k === "databases" || k === "automation" || k === "tooling" || k === "desktop" || k === "mobile") out.add(k);
  }
  return [...out];
}

/** Lenguajes obligatorios por las áreas del alcance, con el motivo de cada uno (en el orden Python · JavaScript · TypeScript). */
export function requiredLanguages(areaIds: readonly string[]): Array<{ id: PlanLanguageId; why: string }> {
  const why = new Map<PlanLanguageId, string[]>();
  for (const a of areaIds) {
    const rule = AREA_LANGUAGE_RULES[a];
    if (!rule) continue;
    for (const l of rule.languages) why.set(l, [...(why.get(l) ?? []), rule.why]);
  }
  return PLAN_LANGUAGE_IDS.filter((l) => why.has(l)).map((id) => ({ id, why: [...new Set(why.get(id)!)].join(" · ") }));
}

/**
 * La lista final de lenguajes: los obligatorios por las áreas (no se pueden quitar) + lo que el estudiante marcó. Un lenguaje elegido a
 * mano que ya era obligatorio conserva el motivo de la regla; Python elegido a mano pasa a ser obligatorio. `chosen` = lo que llegó
 * del formulario o del disco (`undefined` o vacío = solo los obligatorios).
 */
export function resolveLanguages(chosen: readonly PlanLanguage[] | undefined, areaIds: readonly string[]): PlanLanguage[] {
  const req = new Map(requiredLanguages(areaIds).map((r) => [r.id, r.why] as const));
  const picked = new Map((chosen ?? []).map((l) => [l.id, l] as const));
  return PLAN_LANGUAGE_IDS.filter((id) => req.has(id) || picked.has(id)).map((id) => {
    const mine = picked.get(id);
    const mandatory = req.has(id) || (id === "python" && !!mine);
    const why = req.get(id) ?? (mine?.why || (mandatory ? "Lo pediste: practicas con Python" : "Lo elegiste tú"));
    const weight = mine?.weight ?? DEFAULT_LANGUAGE_WEIGHT[id];
    return { id, required: mandatory, why, weight };
  });
}

/**
 * El lenguaje del día `n` (0, 1, 2… contando días de estudio): reparto por mayor resto según los pesos, determinista y sin rachas largas.
 * Con pesos 3·2·2 sobre 7 días: Python 3, JavaScript 2, TypeScript 2.
 */
export function pickLanguage(languages: ReadonlyArray<Pick<PlanLanguage, "id" | "weight">>, n: number): PlanLanguageId | undefined {
  if (!languages.length) return undefined;
  const w = languages.map((l) => Math.max(1, l.weight ?? DEFAULT_LANGUAGE_WEIGHT[l.id]));
  const total = w.reduce((a, b) => a + b, 0);
  const given = languages.map(() => 0);
  let pick = 0;
  for (let i = 0; i <= n; i++) {
    let best = 0;
    let bestScore = -Infinity;
    languages.forEach((_l, li) => {
      const score = (w[li]! / total) * (i + 1) - given[li]!;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = li;
      }
    });
    given[best]!++;
    pick = best;
  }
  return languages[pick]!.id;
}

/** «Python (3) · JavaScript (2) · TypeScript (2)»: la rotación en una línea. */
export const rotationText = (languages: ReadonlyArray<Pick<PlanLanguage, "id" | "weight">>): string =>
  languages.map((l) => `${languageName(l.id)} (${l.weight ?? DEFAULT_LANGUAGE_WEIGHT[l.id]})`).join(" · ");

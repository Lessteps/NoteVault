// Datos de «Programming practice» para los `practice_links` de las submetas.
//
// Solo LECTURA y sin lógica propia: los proyectos y su fase salen de `readPpProjects` y los intentos del kata de
// `kataDates` (los mismos que usa el Mentor, core/mentor/practiceState.ts). Lo único añadido es el foco de cada
// proyecto (`spec.focus`), que `readPpProjects` no expone. Se reutiliza unos segundos: una respuesta de Metas
// consulta los datos muchas veces.

import * as fs from "node:fs";
import * as path from "node:path";
import { loadAllAttempts } from "../core/practice/ledger.js";
import type { PracticeData, PracticeLookup } from "../core/practice/practiceLinks.js";
import { kataDates, ppAreaDir, readPpProjects } from "../core/mentor/practiceState.js";
import * as store from "../core/store.js";
import type { AppState } from "./appState.js";

const TTL_MS = 3000;
let built: { at: number; root: string; data: PracticeData } | null = null;

function focusMap(area: string): Map<string, string> {
  const out = new Map<string, string>();
  const projects = path.join(area, "projects");
  try {
    for (const e of fs.readdirSync(projects, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "_specs" || e.name.startsWith(".")) continue;
      const f = store.loadJson<any>(path.join(projects, e.name, ".pp.json"), null)?.spec?.focus;
      if (f) out.set(e.name, String(f));
    }
    for (const e of fs.readdirSync(path.join(projects, "_specs"), { withFileTypes: true })) {
      const m = /^(.*)\.spec\.json$/.exec(e.name);
      if (!m || out.has(m[1]!)) continue;
      const f = store.loadJson<any>(path.join(projects, "_specs", e.name), null)?.focus;
      if (f) out.set(m[1]!, String(f));
    }
  } catch {
    /* aún no hay proyectos */
  }
  return out;
}

export function readPracticeData(root: string): PracticeData {
  const area = ppAreaDir(root);
  if (!area) return { ready: false, kataDates: new Set(), projects: [] };
  const focus = focusMap(area);
  let dates = new Set<string>();
  try {
    dates = kataDates(loadAllAttempts(root));
  } catch {
    /* sin intentos */
  }
  return {
    ready: true,
    kataDates: dates,
    projects: readPpProjects(root).map((p) => ({ ...p, ...(focus.has(p.folder) ? { focus: focus.get(p.folder)! } : {}) })),
  };
}

export function practiceLookupFor(app: AppState): PracticeLookup {
  return (): PracticeData => {
    if (built && built.root === app.root && Date.now() - built.at < TTL_MS) return built.data;
    const data = readPracticeData(app.root);
    built = { at: Date.now(), root: app.root, data };
    return data;
  };
}

/** Invalida la caché (tras escribir intentos o proyectos, y en las pruebas). */
export function resetPracticeLookupCache(): void {
  built = null;
}

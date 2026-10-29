// Cobertura del currículo de referencia (HTML, CSS, referencia de JavaScript, Java) frente a los temas de la vault.
//
//  - study_curriculum_coverage({ space? }) -> CurriculumCoverage: por área del catálogo, % cubierto, nivel («ok» / «bajo» / «crítico»)
//    y una fila por entrada con su estado y la carpeta propuesta si falta. Solo lectura.
//
// Usa el escaneo de la vault ya cacheado (`vaultScan`): no lee nada más. El resultado se reutiliza mientras el escaneo sea el mismo objeto.

import * as path from "node:path";
import { curriculumAreas } from "../../core/curriculum/catalog.js";
import { computeCoverage, coverageGapsPromptSection, type ExistingTopic } from "../../core/curriculum/coverage.js";
import { manifestsFromNotes } from "../../core/practice/topic.js";
import type { VaultScan } from "../../core/practice/exerciseIndex.js";
import type { CurriculumCoverage } from "../../lib/curriculum.js";
import type { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { clearStudySnapshotCache } from "./study.js";

/** Temas existentes a partir del escaneo: manifiestos de tema + notas con `curriculum_id` en el frontmatter. */
export function existingTopicsFromScan(app: AppState, scan: VaultScan): ExistingTopic[] {
  const byFolder = new Map<string, ExistingTopic>();
  for (const found of manifestsFromNotes(scan.notes)) {
    const folder = app.rel(found.topicFolder).replace(/\\/g, "/");
    if (!byFolder.has(folder)) byFolder.set(folder, { folder, title: String(found.manifest.title ?? "") });
  }
  for (const note of scan.notes) {
    const id = String((note.frontmatter as Record<string, unknown>)?.curriculum_id ?? "").trim();
    if (!id) continue;
    const folder = path.posix.dirname(note.rel.replace(/\\/g, "/"));
    const prev = byFolder.get(folder);
    byFolder.set(folder, { folder, title: prev?.title || path.posix.basename(folder), curriculumId: id });
  }
  return [...byFolder.values()];
}

const cache = new WeakMap<object, CurriculumCoverage>();

/** Cobertura completa de la vault (cacheada por escaneo). Compartida con el texto del prompt del temario. */
export function curriculumCoverageFor(app: AppState): CurriculumCoverage {
  const scan = vaultScan(app);
  const hit = cache.get(scan);
  if (hit) return hit;
  const result = computeCoverage(curriculumAreas(), existingTopicsFromScan(app, scan));
  cache.set(scan, result);
  return result;
}

/** Huecos esenciales de las áreas de referencia como texto para el prompt; vacío si no hay o falla la lectura. */
export function curriculumGapsPrompt(app: AppState, perArea = 12, space?: string): string {
  try {
    const all = curriculumCoverageFor(app);
    return coverageGapsPromptSection(space ? { areas: all.areas.filter((a) => a.space === space) } : all, perArea);
  } catch {
    return "";
  }
}

export function curriculumCoverageApi(app: AppState) {
  return {
    study_curriculum_coverage(opts?: unknown): CurriculumCoverage {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const space = String(o.space ?? "").trim();
      // «Recalcular»: lo que un agente externo escribió en disco mientras tanto (la app no siempre se entera sola) se vuelve a leer
      if (o.fresh === true) {
        clearVaultScanCache();
        clearStudySnapshotCache();
      }
      const all = curriculumCoverageFor(app);
      return space ? { areas: all.areas.filter((a) => a.space === space) } : all;
    },
  };
}

/**
 * Crea las carpetas del Sistema de práctica por área dentro de `Programación/programming_practice/` (ver `lib/areaPracticeSystem.ts`).
 *
 * SOLO se llama desde «Ejecutar plan» (con la confirmación de la persona). NUNCA sobrescribe: un archivo que ya existe se omite (la escritura
 * usa `wx`, que falla si existe, así que ni una carrera lo pisa). Con `dryRun` calcula lo que crearía sin tocar el disco (es lo que usa el informe).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { areaFiles, isPracticeAreaId } from "../../lib/areaPracticeSystem.js";

export interface CreateAreaFoldersOptions {
  /** ruta absoluta de `Programación/programming_practice` */
  ppDir: string;
  /** áreas del plan (`backend`, `frontend`…); las desconocidas se ignoran */
  areas: readonly string[];
  /** no escribe nada: solo calcula */
  dryRun?: boolean;
  /** katas por área que se escriben ahora, desde `fromDay` (por defecto 0: solo la estructura) */
  katasPerArea?: number;
  fromDay?: number;
  /** nivel (1-3) de cada área */
  levels?: Record<string, number>;
}

export interface CreateAreaFoldersResult {
  dryRun: boolean;
  /** archivos nuevos (rutas relativas a `programming_practice/`) */
  created: string[];
  /** archivos que ya existían y se dejaron como estaban */
  skipped: string[];
  /** carpetas nuevas */
  folders: string[];
  /** áreas ignoradas por no tener sistema de práctica */
  ignored: string[];
  /** archivos que no se pudieron escribir, con el motivo */
  failed: Array<{ rel: string; reason: string }>;
}

export function createAreaPracticeFolders(opts: CreateAreaFoldersOptions): CreateAreaFoldersResult {
  const dryRun = !!opts.dryRun;
  const out: CreateAreaFoldersResult = { dryRun, created: [], skipped: [], folders: [], ignored: [], failed: [] };
  const seenFolders = new Set<string>();
  for (const areaId of [...new Set(opts.areas)]) {
    if (!isPracticeAreaId(areaId)) {
      out.ignored.push(areaId);
      continue;
    }
    for (const f of areaFiles(areaId, { katasPerArea: opts.katasPerArea ?? 0, fromDay: opts.fromDay ?? 1, ...(opts.levels ? { levels: opts.levels } : {}) })) {
      const abs = path.join(opts.ppDir, ...f.rel.split("/"));
      // nunca fuera de programming_practice
      if (path.relative(opts.ppDir, abs).startsWith("..")) {
        out.failed.push({ rel: f.rel, reason: "ruta fuera de programming_practice" });
        continue;
      }
      if (fs.existsSync(abs)) {
        out.skipped.push(f.rel);
        continue;
      }
      // las carpetas que habría que crear (de la más alta a la más baja)
      const dir = path.dirname(abs);
      const missing: string[] = [];
      for (let d = dir; d.length > opts.ppDir.length && !fs.existsSync(d); d = path.dirname(d)) missing.unshift(d);
      for (const d of missing) {
        const rel = path.relative(opts.ppDir, d).split(path.sep).join("/");
        if (!seenFolders.has(rel)) {
          seenFolders.add(rel);
          out.folders.push(rel);
        }
      }
      if (dryRun) {
        out.created.push(f.rel);
        continue;
      }
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(abs, f.content, { encoding: "utf-8", flag: "wx" });
        out.created.push(f.rel);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") out.skipped.push(f.rel);
        else out.failed.push({ rel: f.rel, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return out;
}

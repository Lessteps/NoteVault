/**
 * Sistema de práctica por área (ver `lib/areaPracticeSystem.ts`): el almacén de las MARCAS manuales de la persona
 * (`.notevault/mentor/area-practice/<plan>.json`, aditivo; solo datos de la app, nunca notas) y la lectura de lo que hay en `programming_practice/`.
 * El estado derivado (katas hechos, racha, habilidades) vive en `lib/areaPracticeDerive.ts` y se reexporta aquí.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { areaFolderOf } from "../../lib/areaPracticeSystem.js";
import { sanitizeMarks, type AreaMarks, type DayMark } from "../../lib/areaPracticeDerive.js";
import * as store from "../store.js";

export { deriveAreaPractice, kataSummary, sanitizeMarks, type AreaMarks, type AreaPracticeInput, type DayMark } from "../../lib/areaPracticeDerive.js";

/** Almacén de las marcas manuales de un plan. */
export class AreaPracticeStore {
  constructor(private readonly root: string) {}
  private file(planId: string): string {
    return path.join(this.root, ".notevault", "mentor", "area-practice", `${planId}.json`);
  }
  load(planId: string): AreaMarks {
    return sanitizeMarks(store.loadJson<unknown>(this.file(planId), null));
  }
  /** Marca (o desmarca con `null`) el kata de un área en una fecha. */
  mark(planId: string, areaId: string, date: string, status: DayMark | null): AreaMarks {
    const marks = this.load(planId);
    const days = { ...(marks[areaId] ?? {}) };
    if (status) days[date] = status;
    else delete days[date];
    if (Object.keys(days).length) marks[areaId] = days;
    else delete marks[areaId];
    store.writeJson(this.file(planId), { version: 1, marks });
    return marks;
  }
}

/** Lo que hay en `programming_practice/` de las áreas dadas (carpetas y katas existentes), sin lanzar. */
export function existingAreaFiles(ppDir: string | null, areaIds: readonly string[]): { folders: Set<string>; files: Set<string> } {
  const folders = new Set<string>();
  const files = new Set<string>();
  if (!ppDir) return { folders, files };
  for (const id of areaIds) {
    const folder = areaFolderOf(id);
    const katas = path.join(ppDir, folder, "katas");
    try {
      if (!fs.statSync(path.join(ppDir, folder)).isDirectory()) continue;
      folders.add(folder);
      for (const f of fs.readdirSync(katas)) files.add(`${folder}/katas/${f}`);
    } catch {
      /* el área todavía no tiene carpeta o katas */
    }
  }
  return { folders, files };
}

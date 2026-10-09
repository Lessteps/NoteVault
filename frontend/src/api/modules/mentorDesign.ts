// Diseño de los temas de un plan (checklist de la vault, `lib/topicDesign.ts`) a partir de la vault real. SOLO LEE.

import * as fs from "node:fs";
import * as path from "node:path";
import { scanTopicDesigns } from "../../core/mentor/topicDesignScan.js";
import { manifestsFromNotes } from "../../core/practice/topic.js";
import type { TopicDesign } from "../../lib/topicDesign.js";
import type { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";

/** Diseño de cada tema de `topics` (carpeta → resultado). Usa el escaneo de la vault (ejercicios, manifiestos) y lee la nota de teoría de cada tema. */
export function designsOf(app: AppState, topics: ReadonlyArray<{ folder: string; title: string; subject?: string }>): Map<string, TopicDesign> {
  const scan = vaultScan(app);
  const manifestAt = new Map<string, { path: string; subject: string }>();
  for (const found of manifestsFromNotes(scan.notes)) {
    const folder = app.rel(found.topicFolder).replace(/\\/g, "/");
    if (!manifestAt.has(folder)) manifestAt.set(folder, { path: found.manifestPath, subject: found.manifest.subject });
  }
  const seen = new Set<string>();
  const uniq = topics.filter((t) => (seen.has(t.folder) ? false : (seen.add(t.folder), true)));
  return scanTopicDesigns(
    uniq.map((t) => {
      const m = manifestAt.get(t.folder);
      return { folder: t.folder, title: t.title, ...(m ? { manifestPath: m.path } : {}), subject: t.subject ?? m?.subject ?? defaultSubject(app, t.folder) };
    }),
    { root: app.root, exercises: scan.exercises },
  );
}

/** Sin manifiesto no se sabe la materia: se usa la del espacio (la carpeta de primer nivel cuyo resumen dice `subject:`). */
function defaultSubject(app: AppState, folder: string): string {
  const top = folder.split("/")[0] ?? "";
  try {
    const head = fs.readFileSync(path.join(app.root, top, `${top}.resumen.md`), "utf-8").slice(0, 800);
    return /^subject:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(head)?.[1] ?? "programming";
  } catch {
    return /^programaci/i.test(top) ? "programming" : "generic";
  }
}

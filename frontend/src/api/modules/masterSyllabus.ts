// TEMARIO GENERAL en la vault: junta los temas reales de la vault (con su estado) y los planes del Mentor y escribe, dentro de cada espacio
// (`Programación/`), `00 Master syllabus.md` y su gemelo `00 Master syllabus.json` (ver `lib/masterSyllabus.ts`). Solo escribe si el contenido cambió
// (no ensucia git ni dispara a los vigilantes de archivos). Lo llama la sincronización del plan; `mentor_master_syllabus` lo regenera a mano.

import * as fs from "node:fs";
import * as path from "node:path";
import { PlanStore } from "../../core/mentor/plan.js";
import { manifestsFromNotes } from "../../core/practice/topic.js";
import { buildMasterSyllabus, type PlanRef, type VaultTopic } from "../../lib/masterSyllabus.js";
import type { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";

export const MASTER_MD = "00 Master syllabus.md";
export const MASTER_JSON = "00 Master syllabus.json";

const SPACE_RE = /^[^/.][^/]*$/;

/** Escribe `file` solo si su contenido es distinto. Devuelve si cambió. */
function writeIfChanged(file: string, text: string): boolean {
  try {
    if (fs.readFileSync(file, "utf-8") === text) return false;
  } catch {
    /* no existe: se crea */
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf-8");
  return true;
}

export interface MasterResult {
  spaces: Array<{ space: string; topics: number; changed: boolean; md: string; json: string }>;
}

/**
 * Regenera el temario general de cada espacio que tiene temas con manifiesto. `spaces` limita a esos espacios (p. ej. los de los planes); sin él, todos.
 * Nunca toca nada fuera de los dos archivos, ni el plan, ni las notas.
 */
export function writeMasterSyllabus(app: AppState, opts: { spaces?: readonly string[] } = {}): MasterResult {
  const scan = vaultScan(app);
  const noteRels = new Set(scan.notes.map((n) => n.rel.replace(/\\/g, "/")));
  const found = manifestsFromNotes(scan.notes);

  // ejercicios por tema: se atribuye cada uno al tema más profundo que contiene su ruta
  const topicFolders = new Set(found.map((f) => app.rel(f.topicFolder).replace(/\\/g, "/")));
  const exercises = new Map<string, number>();
  for (const ex of scan.exercises) {
    let dir = path.posix.dirname(String(ex.rel ?? "").replace(/\\/g, "/"));
    while (dir && dir !== ".") {
      if (topicFolders.has(dir)) {
        exercises.set(dir, (exercises.get(dir) ?? 0) + 1);
        break;
      }
      dir = path.posix.dirname(dir);
    }
  }

  const bySpace = new Map<string, VaultTopic[]>();
  for (const f of found) {
    const folder = app.rel(f.topicFolder).replace(/\\/g, "/");
    const space = folder.split("/")[0] ?? "";
    if (!SPACE_RE.test(space) || folder.split("/").length < 3) continue;
    const name = folder.split("/").pop()!;
    const topic: VaultTopic = {
      folder,
      title: f.manifest.title,
      skills: f.manifest.skills ?? [],
      theory: noteRels.has(`${folder}/${name}.md`),
      map: fs.existsSync(path.join(f.topicFolder, `${name} — mapa.canvas`)),
      practice: true,
      exercises: exercises.get(folder) ?? 0,
    };
    bySpace.set(space, [...(bySpace.get(space) ?? []), topic]);
  }

  const plans: PlanRef[] = new PlanStore(app.root)
    .list()
    .filter((p) => !p.archived && !p.proposed)
    .map((p) => ({
      id: p.id,
      ...(p.name ? { name: p.name } : {}),
      start: p.start,
      end: p.end,
      ...(p.hoursPerWeek ? { hoursPerWeek: p.hoursPerWeek } : {}),
      subplans: p.subplans.map((s) => ({ id: s.id, area: s.area, objective: s.objective, ...(s.groups ? { groups: s.groups.map((g) => ({ id: g.id, title: g.title, kind: g.kind, order: g.order })) } : {}), topics: s.topics })),
    }));

  const wanted = opts.spaces ? new Set(opts.spaces) : null;
  const result: MasterResult = { spaces: [] };
  for (const [space, topics] of [...bySpace.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (wanted && !wanted.has(space)) continue;
    const spacePlans = plans.filter((p) => p.subplans.some((s) => s.topics.some((t) => t.folder.startsWith(`${space}/`))));
    const indexFiles = ["00 Routes by role.md", "00 Temario.md", `${space}.resumen.md`].filter((f) => fs.existsSync(path.join(app.root, space, f)));
    const { markdown, json } = buildMasterSyllabus({ space, topics, plans: spacePlans.map((p) => ({ ...p, subplans: p.subplans.map((s) => ({ ...s, topics: s.topics.filter((t) => t.folder.startsWith(`${space}/`)) })).filter((s) => s.topics.length) })), indexFiles });
    const mdPath = path.join(app.root, space, MASTER_MD);
    const jsonPath = path.join(app.root, space, MASTER_JSON);
    const a = writeIfChanged(mdPath, markdown);
    const b = writeIfChanged(jsonPath, JSON.stringify(json, null, 2) + "\n");
    result.spaces.push({ space, topics: topics.length, changed: a || b, md: `${space}/${MASTER_MD}`, json: `${space}/${MASTER_JSON}` });
  }
  return result;
}

export function masterSyllabusApi(app: AppState) {
  return {
    /** Regenera el temario general (Markdown + JSON) de los espacios de estudio. Devuelve dónde quedó y si cambió. */
    mentor_master_syllabus(opts?: unknown): MasterResult {
      const o = (opts && typeof opts === "object" ? opts : {}) as { spaces?: unknown };
      const spaces = Array.isArray(o.spaces) ? o.spaces.map(String) : undefined;
      return writeMasterSyllabus(app, spaces ? { spaces } : {});
    },
  };
}

// «Crear con Antigravity»: los temas de referencia que FALTAN en una vault (los lista el currículo y los marca la cobertura) se crean CON UN AGENTE EXTERNO.
// La app NO llama a ninguna IA: escribe una TAREA autocontenida (lib/curriculumPrompt.ts) y, cuando el agente termina, la VALIDA.
//
//  - study_curriculum_handoff({ areaId, entryIds, withExercises?, confirm }) -> CurriculumHandoff: escribe SOLO el archivo de la tarea
//    `<espacio>/_handoff/crear/<fecha>_<área>.md` y el estado `.notevault/regenerar/<id>.json` (`kind: "curriculum"`). No crea carpetas de temas ni notas.
//  - study_curriculum_handoff_status(id) -> CurriculumHandoff: el estado + el avance de cada tema (¿carpeta? ¿nota? ¿manifiesto? ¿ejercicios? ¿mapa?), con
//    comprobaciones baratas del disco.
//  - study_curriculum_handoff_validate(id) -> CurriculumHandoff: valida lo que escribió el agente tema a tema (carpeta, nota, frontmatter con `curriculum_id`, estructura que
//    lee el generador del mapa, todos los elementos del grupo, manifiesto de práctica, ejercicios si los hay, enlace del temario), genera el mapa que falte
//    y limpia las cachés para que los temas nuevos aparezcan.
//  - study_curriculum_handoff_list() -> CurriculumHandoff[]: las tareas guardadas, las más nuevas primero.
//
// Mismas convenciones que `topicRegenerateHandoff.ts` (estado JSON en `.notevault/regenerar`, frase corta, validación con los verificadores de la app).
// Aquí no hay copias de seguridad: son temas NUEVOS (la tarea se niega si la carpeta ya existe).

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "../../core/errors.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { curriculumAreas } from "../../core/curriculum/catalog.js";
import { parseExercise } from "../../core/practice/exerciseNote.js";
import { clearExerciseIndexCache } from "../../core/practice/exerciseIndex.js";
import { readSkillTemplates } from "../../core/practice/skillTemplates.js";
import { catalogFor } from "../../core/practice/skillSelection.js";
import { generateConcept, readConcept } from "../../../tools/kb_canvas";
import type { CurriculumArea, CurriculumEntry } from "../../lib/curriculum.js";
import { buildCurriculumTask, isValidTopicFolderName, itemCovered, planEntries, topicFolderName, type CurriculumSkills, type PlannedEntry } from "../../lib/curriculumPrompt.js";
import type { AppState } from "../appState.js";
import { withGenerationLock } from "./generationLock.js";
import { clearStudySnapshotCache } from "./study.js";
import { isCompleteTheory } from "./studySpace.js";
import { posix, stamp } from "./topicRegenerate.js";
import { curriculumCoverageFor } from "./curriculumCoverage.js";

/** Más de esto en una sola tarea no es manejable para el agente: la interfaz debe partir la selección en lotes (se recomiendan ≤ 25). */
export const MAX_ENTRIES_PER_TASK = 40;
export const RECOMMENDED_BATCH = 25;
/** Ejercicios mínimos por tema cuando la tarea los pidió. */
const MIN_EXERCISES = 6;
const VALID_TOPIC_TYPES = ["theoretical", "procedural", "mixed"];

export interface CurriculumProgress {
  folder: boolean;
  note: boolean;
  manifest: boolean;
  map: boolean;
  /** ejercicios `ej_*.md` ya escritos */
  exercises: number;
  /** ¿tiene `[[nombre]]` en `00 Temario.md`? */
  temario: boolean;
}

export type CurriculumEntryState = "pending" | "created" | "error";

export interface CurriculumHandoffEntry {
  entryId: string;
  title: string;
  category: string;
  importance: string;
  /** `12.7` */
  number: string;
  /** nombre de la carpeta = nombre del tema */
  name: string;
  /** carpeta relativa a la vault */
  folder: string;
  state: CurriculumEntryState;
  problems: string[];
  warnings: string[];
  progress: CurriculumProgress;
}

export interface CurriculumHandoff {
  id: string;
  kind: "curriculum";
  areaId: string;
  areaTitle: string;
  space: string;
  areaFolder: string;
  withExercises: boolean;
  createdAt: string;
  /** el archivo de la tarea (relativo a la vault) y su ruta absoluta */
  taskPath: string;
  taskAbs: string;
  /** carpeta que se abre con «Abrir carpeta» (relativa a la vault) */
  folder: string;
  /** la frase corta para pegar en el agente (`prompt` es el mismo texto: así el panel de «Regenerar» sirve tal cual) */
  shortPrompt: string;
  prompt: string;
  status: "waiting" | "validated" | "failed";
  entries: CurriculumHandoffEntry[];
  log: string[];
  /** temas con la nota ya escrita / temas pedidos */
  ready: { found: number; expected: number };
}

interface StateEntry {
  entryId: string;
  title: string;
  category: string;
  importance: string;
  number: string;
  name: string;
  folder: string;
  noteId: string;
  topicType: string;
  items: string[];
  state: CurriculumEntryState;
  problems: string[];
  warnings: string[];
}
interface State extends Omit<CurriculumHandoff, "entries" | "ready" | "taskAbs" | "prompt"> {
  entries: StateEntry[];
}

export interface CurriculumHandoffInput {
  areaId: string;
  entryIds: string[];
  withExercises?: boolean;
  confirm?: boolean;
}

/** Ganchos de los tests y del motor de cobertura. */
export interface CurriculumHandoffHooks {
  now?: () => Date;
  /** el currículo (por defecto el catálogo real) */
  areas?: () => CurriculumArea[];
  /** la carpeta propuesta de cada entrada elegida (por defecto: los siguientes números libres del área, en el orden del catálogo) */
  suggest?: (area: CurriculumArea, selected: CurriculumEntry[], existing: string[]) => Record<string, string>;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dateIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TEMARIO = "00 Temario.md";

export function curriculumHandoffApi(app: AppState, hooks: CurriculumHandoffHooks = {}) {
  const nowDate = (): Date => (hooks.now ?? (() => new Date()))();
  const areasOf = (): CurriculumArea[] => (hooks.areas ?? curriculumAreas)();
  const abs = (rel: string): string => path.join(app.root, ...rel.split("/"));
  const rel = (p: string): string => posix(app.rel(p));
  const stateFile = (id: string): string => path.join(app.root, ".notevault", "regenerar", `${id}.json`);

  const save = (s: State): void => {
    fs.mkdirSync(path.dirname(stateFile(s.id)), { recursive: true });
    fs.writeFileSync(stateFile(s.id), JSON.stringify(s, null, 2), "utf-8");
  };
  const load = (id: string): State => {
    if (!/^[\w.\- ]+$/.test(String(id ?? ""))) throw new ApiError("Esa tarea no existe.");
    let s: State;
    try {
      s = JSON.parse(fs.readFileSync(stateFile(id), "utf-8")) as State;
    } catch {
      throw new ApiError("Esa tarea ya no existe: vuelve a crearla.");
    }
    if (s.kind !== "curriculum") throw new ApiError("Esa tarea no es de «Crear temas».");
    return s;
  };

  const dirsIn = (dir: string): string[] => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    } catch {
      return [];
    }
  };
  const readText = (file: string): string => {
    try {
      return fs.readFileSync(file, "utf-8");
    } catch {
      return "";
    }
  };
  const isFile = (file: string): boolean => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  };
  const isDir = (dir: string): boolean => {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  };

  /** Los siguientes números libres del área, en el orden del catálogo: `12.7`, `12.8`… */
  const defaultSuggest = (area: CurriculumArea, selected: CurriculumEntry[], existing: string[]): Record<string, string> => {
    const areaNum = /^(\d+(?:\.\d+)*)/.exec(area.areaFolder)?.[1];
    if (!areaNum) throw new ApiError(`La carpeta del área «${area.areaFolder}» no empieza por un número.`);
    const used = existing.map((n) => Number(new RegExp(`^${escapeRe(areaNum)}\\.(\\d+)(?:\\D|$)`).exec(n)?.[1] ?? 0));
    let next = Math.max(0, ...used) + 1;
    const out: Record<string, string> = {};
    for (const e of selected) out[e.id] = `${area.space}/${area.areaFolder}/${topicFolderName(`${areaNum}.${next++}`, e.title)}`;
    return out;
  };

  /** La carpeta que propone el motor de cobertura (la MISMA que ve la persona en la interfaz); sin fila o sin carpeta se usa la numeración por defecto. */
  const coverageSuggest = (area: CurriculumArea, selected: CurriculumEntry[], existing: string[]): Record<string, string> => {
    const rows = curriculumCoverageFor(app).areas.find((a) => a.areaId === area.id)?.rows ?? [];
    const fallback = defaultSuggest(area, selected, existing);
    const out: Record<string, string> = {};
    for (const e of selected) {
      const row = rows.find((r) => r.entry.id === e.id);
      if (row && row.status === "cubierto") throw new ApiError(`«${e.title}» ya está cubierto en la vault: no hace falta crearlo.`);
      out[e.id] = row?.suggestedFolder || fallback[e.id]!;
    }
    return out;
  };

  const skillsOf = (space: string): CurriculumSkills => {
    const all = readSkillTemplates(app.root, space);
    const get = (...titles: string[]): string | undefined => all.find((s) => titles.includes(s.title))?.content;
    return {
      resumenTeorico: get("resumen_teorico_skill"),
      practica: get("practica_skill"),
      temario: get("temario_skill"),
      mapa: get("mapa_skill"),
      ejercicios: get("ejercicios_skill", "ejercicio_skill", "exercises_skill"),
    };
  };

  // ── Progreso y vista ──────────────────────────────────────────────────────────────────────────────────────────────

  const exerciseFiles = (topicAbs: string): string[] => {
    const out: string[] = [];
    const root = path.join(topicAbs, "Ejercicios");
    for (const skill of subdirs(root)) {
      try {
        for (const f of fs.readdirSync(path.join(root, skill), { withFileTypes: true })) if (f.isFile() && /^ej_.*\.md$/i.test(f.name)) out.push(path.join(root, skill, f.name));
      } catch {
        /* carpeta ilegible */
      }
    }
    return out;
  };
  const subdirs = (dir: string): string[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }
  };

  const progressOf = (e: StateEntry, temario: string): CurriculumProgress => {
    const topicAbs = abs(e.folder);
    return {
      folder: isDir(topicAbs),
      note: isFile(path.join(topicAbs, `${e.name}.md`)),
      manifest: isFile(path.join(topicAbs, `${e.name}.practica.md`)),
      map: isFile(path.join(topicAbs, `${e.name} — mapa.canvas`)),
      exercises: exerciseFiles(topicAbs).length,
      temario: temario.includes(`[[${e.name}]]`),
    };
  };

  const view = (s: State): CurriculumHandoff => {
    const temario = readText(path.join(app.root, s.space, TEMARIO));
    const entries: CurriculumHandoffEntry[] = s.entries.map((e) => ({
      entryId: e.entryId,
      title: e.title,
      category: e.category,
      importance: e.importance,
      number: e.number,
      name: e.name,
      folder: e.folder,
      state: e.state,
      problems: [...e.problems],
      warnings: [...e.warnings],
      progress: progressOf(e, temario),
    }));
    const { entries: _e, ...rest } = s;
    return {
      ...rest,
      prompt: s.shortPrompt,
      taskAbs: abs(s.taskPath),
      entries,
      log: [...s.log],
      ready: { found: entries.filter((e) => e.progress.note).length, expected: entries.length },
    };
  };

  // ── Validación de un tema ─────────────────────────────────────────────────────────────────────────────────────────

  const validateEntry = (s: State, e: StateEntry, catalogIds: ReadonlySet<string>, temario: string): { problems: string[]; warnings: string[] } => {
    const problems: string[] = [];
    const warnings: string[] = [];
    const topicAbs = abs(e.folder);
    const areaFolder = e.folder.split("/").slice(1, -1).join("/");
    if (!isDir(topicAbs)) return { problems: [`Falta la carpeta «${e.folder}».`], warnings };
    const noteAbs = path.join(topicAbs, `${e.name}.md`);
    const practicaAbs = path.join(topicAbs, `${e.name}.practica.md`);

    // 1. nota: frontmatter
    let noteType = "";
    if (!isFile(noteAbs)) problems.push(`Falta la nota «${e.name}.md».`);
    else {
      const text = readText(noteAbs);
      const [fm, body] = parseFrontmatter(text);
      if (!Object.keys(fm).length) problems.push("La nota no tiene frontmatter (el bloque --- … --- del principio).");
      else {
        const same = (key: string, want: string): void => {
          if (String(fm[key] ?? "") !== want) problems.push(`Frontmatter «${key}»: esperaba «${want}» y hay «${String(fm[key] ?? "")}».`);
        };
        same("id", e.noteId);
        same("number", e.number);
        same("topic", e.name);
        same("area", areaFolder);
        same("type", "teorica");
        same("subject", "programming");
        same("curriculum_id", e.entryId);
        if (!String(fm["title"] ?? "").trim()) problems.push("Frontmatter «title»: vacío.");
        noteType = String(fm["topic_type"] ?? "");
        if (!VALID_TOPIC_TYPES.includes(noteType)) problems.push(`Frontmatter «topic_type»: debe ser theoretical, procedural o mixed (hay «${noteType}»).`);
        const diff = Number(fm["difficulty"]);
        if (!Number.isFinite(diff) || diff < 1 || diff > 5) problems.push("Frontmatter «difficulty»: debe ser un número del 1 al 5.");
        if (!String(fm["language"] ?? "").trim()) problems.push("Frontmatter «language»: vacío.");
        if (!("prerequisites" in fm)) problems.push("Frontmatter «prerequisites»: falta (puede ser []).");
        if (!("sources" in fm)) problems.push("Frontmatter «sources»: falta (puede ser []).");
        if (!["draft", "verified"].includes(String(fm["status"] ?? ""))) problems.push("Frontmatter «status»: debe ser draft o verified.");
        if (typeof fm["verified"] !== "boolean") problems.push("Frontmatter «verified»: debe ser true o false.");
      }

      // 2. estructura: las mismas lecturas que usa el generador del mapa
      if (!isCompleteTheory(body)) problems.push("La nota está cortada: no llega a la sección final «Cards» con contenido.");
      else {
        try {
          const concept = readConcept(topicAbs, app.root);
          const rest = concept.warnings.filter((w) => !/prerrequisito/i.test(w));
          for (const w of concept.warnings.filter((w2) => /prerrequisito/i.test(w2))) warnings.push(w);
          if (rest.length) problems.push(...rest.slice(0, 6).map((w) => `Estructura: ${w}`));
          if (concept.examples.length < 3) problems.push(`Hacen falta 3 ejemplos (hay ${concept.examples.length}).`);
          if (concept.errors.length < 3) problems.push(`Hacen falta 3 errores comunes (hay ${concept.errors.length}).`);
          const dry = generateConcept(topicAbs, { dryRun: true });
          problems.push(...dry.problems.slice(0, 6).map((p) => `Mapa: ${p}`));
        } catch (err) {
          problems.push(`No se pudo leer la estructura de la nota: ${(err as Error).message}`);
        }
        const cardsAt = body.search(/^##\s*Cards\b/m);
        const cards = cardsAt < 0 ? 0 : (body.slice(cardsAt).match(/^###\s+\d+/gm) ?? []).length;
        if (cards < 6) problems.push(`Hacen falta entre 6 y 9 tarjetas en «Cards» (hay ${cards}).`);
      }

      // 3. todos los elementos del grupo
      const missing = e.items.filter((it) => !itemCovered(body, it));
      if (missing.length) problems.push(`Elementos del grupo que no aparecen en la nota (${missing.length}/${e.items.length}): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.`);
    }

    // 4. manifiesto de práctica
    if (!isFile(practicaAbs)) problems.push(`Falta el manifiesto «${e.name}.practica.md».`);
    else {
      const [fm] = parseFrontmatter(readText(practicaAbs));
      if (String(fm["type"] ?? "") !== "practica") problems.push("Manifiesto: «type» debe ser practica.");
      if (String(fm["subject"] ?? "") !== "programming") problems.push("Manifiesto: «subject» debe ser programming.");
      if (String(fm["title"] ?? "") !== e.name) problems.push(`Manifiesto: «title» debe ser «${e.name}».`);
      const mType = String(fm["topic_type"] ?? "");
      if (!VALID_TOPIC_TYPES.includes(mType)) problems.push("Manifiesto: «topic_type» debe ser theoretical, procedural o mixed.");
      else if (noteType && mType !== noteType) problems.push(`Manifiesto y nota no coinciden en topic_type («${mType}» / «${noteType}»).`);
      const sk = Array.isArray(fm["skills"]) ? (fm["skills"] as string[]) : [];
      if (!sk.length || sk.length > 6) problems.push("Manifiesto: «skills» necesita entre 1 y 6 competencias.");
      const unknown = sk.filter((x) => !catalogIds.has(x));
      if (unknown.length) problems.push(`Manifiesto: skills que no están en el catálogo: ${unknown.join(", ")}.`);
      if (!(Number(fm["min_per_skill"]) >= 1)) problems.push("Manifiesto: «min_per_skill» debe ser un número ≥ 1.");
      if (!(Number(fm["target_difficulty"]) >= 1 && Number(fm["target_difficulty"]) <= 5)) problems.push("Manifiesto: «target_difficulty» debe estar entre 1 y 5.");
      if (!["required", "none"].includes(String(fm["exam"] ?? ""))) problems.push("Manifiesto: «exam» debe ser required o none.");
    }

    // 5. ejercicios (si la tarea los pidió, o si el agente los escribió)
    const files = exerciseFiles(topicAbs);
    if (s.withExercises && files.length < MIN_EXERCISES) problems.push(`Hacen falta ejercicios (${files.length} de al menos ${MIN_EXERCISES}).`);
    const bad: string[] = [];
    for (const f of files) {
      const ex = parseExercise(readText(f), f);
      const fmType = String(ex.frontmatter["type"] ?? "").toLowerCase();
      const ok = fmType === "exercise" && String(ex.frontmatter["topic"] ?? "") === e.name && ex.statement.trim().length >= 20 && ex.solution.trim().length >= 10 && ex.rubric.length >= 3;
      if (!ok) bad.push(path.basename(f));
    }
    if (bad.length) problems.push(`Ejercicios no válidos (${bad.length}: hace falta type: exercise, topic «${e.name}», enunciado, solución y rúbrica de 3 criterios): ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}.`);

    // 6. temario
    if (!temario.includes(`[[${e.name}]]`)) problems.push(`Falta la línea «- [[${e.name}]]» en ${s.space}/${TEMARIO}.`);

    // 7. todo bien: el mapa lo genera la app si el agente no lo hizo
    if (!problems.length && !isFile(path.join(topicAbs, `${e.name} — mapa.canvas`))) {
      try {
        const r = generateConcept(topicAbs);
        if (r.problems.length) problems.push(...r.problems.slice(0, 5).map((p) => `Mapa: ${p}`));
      } catch (err) {
        problems.push(`No se pudo generar el mapa: ${(err as Error).message}`);
      }
    }
    return { problems, warnings };
  };

  return {
    async study_curriculum_handoff(input: CurriculumHandoffInput): Promise<CurriculumHandoff> {
      if (input?.confirm !== true) throw new ApiError("Falta la confirmación: la tarea pide a un agente externo que cree carpetas y notas en la vault.");
      const area = areasOf().find((a) => a.id === String(input.areaId ?? ""));
      if (!area) throw new ApiError("Esa área no está en el currículo.");
      const ids = [...new Set((Array.isArray(input.entryIds) ? input.entryIds : []).map(String))];
      if (!ids.length) throw new ApiError("Elige al menos un tema.");
      if (ids.length > MAX_ENTRIES_PER_TASK) throw new ApiError(`Una tarea admite como máximo ${MAX_ENTRIES_PER_TASK} temas (has elegido ${ids.length}): divide la selección en lotes de ${RECOMMENDED_BATCH} o menos.`);
      const unknown = ids.filter((id) => !area.entries.some((e) => e.id === id));
      if (unknown.length) throw new ApiError(`Temas que no están en el currículo de ${area.title}: ${unknown.join(", ")}.`);
      if (!isDir(path.join(app.root, area.space))) throw new ApiError(`El espacio «${area.space}» no existe en la vault.`);

      // en el orden del catálogo (así los números salen en orden)
      const selected = area.entries.filter((e) => ids.includes(e.id));
      const areaAbs = path.join(app.root, area.space, area.areaFolder);
      const existing = dirsIn(areaAbs);
      let folders: Record<string, string>;
      try {
        folders = (hooks.suggest ?? (hooks.areas ? defaultSuggest : coverageSuggest))(area, selected, existing);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError((err as Error).message);
      }
      let planned: PlannedEntry[];
      try {
        const picked = selected.map((entry) => ({ entry, suggestedFolder: folders[entry.id] ?? "" }));
        planned = planEntries(area, picked);
      } catch (err) {
        throw new ApiError((err as Error).message);
      }
      const clash = planned.filter((p) => isDir(abs(p.folder)) || existing.some((n) => n.toLowerCase() === p.name.toLowerCase() || n.split(" ")[0] === p.number));
      if (clash.length) throw new ApiError(`Esas carpetas ya existen (o su número está ocupado), no se crean de nuevo: ${clash.map((p) => p.name).join("; ")}. Actualiza la cobertura.`);
      for (const p of planned) if (!isValidTopicFolderName(p.name)) throw new ApiError(`«${p.name}» no es un nombre de carpeta válido.`);

      const at = nowDate();
      const dirAbs = path.join(app.root, area.space, "_handoff", "crear");
      let fileId = `${stamp(at)}_${area.id}`;
      for (let n = 2; fs.existsSync(path.join(dirAbs, `${fileId}.md`)); n++) fileId = `${stamp(at)}_${area.id}_${n}`;
      const id = `crear_${fileId}`;
      const taskAbs = path.join(dirAbs, `${fileId}.md`);

      const task = buildCurriculumTask({
        vaultRoot: app.root,
        space: area.space,
        area,
        entries: planned.map((p) => ({ entry: p.entry, suggestedFolder: p.folder })),
        skills: skillsOf(area.space),
        today: dateIso(at),
        id,
        taskAbs,
        withExercises: input.withExercises === true,
        existingFolders: existing,
        areaFolderExists: isDir(areaAbs),
        linkable: existing,
      });

      fs.mkdirSync(dirAbs, { recursive: true });
      fs.writeFileSync(taskAbs, task.markdown, "utf-8");
      const state: State = {
        id,
        kind: "curriculum",
        areaId: area.id,
        areaTitle: area.title,
        space: area.space,
        areaFolder: area.areaFolder,
        withExercises: input.withExercises === true,
        createdAt: at.toISOString(),
        taskPath: rel(taskAbs),
        folder: rel(dirAbs),
        shortPrompt: task.shortPrompt,
        status: "waiting",
        entries: task.planned.map((p) => ({
          entryId: p.entry.id,
          title: p.entry.title,
          category: p.entry.category,
          importance: p.entry.importance,
          number: p.number,
          name: p.name,
          folder: p.folder,
          noteId: p.noteId,
          topicType: p.topicType,
          items: [...p.entry.items],
          state: "pending",
          problems: [],
          warnings: [],
        })),
        log: [`Tarea creada: ${planned.length} tema(s) de ${area.title}. El agente crea las carpetas y las notas.`],
      };
      save(state);
      return view(state);
    },

    study_curriculum_handoff_status(id: string): CurriculumHandoff {
      return view(load(id));
    },

    study_curriculum_handoff_list(): CurriculumHandoff[] {
      const dir = path.join(app.root, ".notevault", "regenerar");
      let names: string[] = [];
      try {
        names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
      } catch {
        return [];
      }
      const out: CurriculumHandoff[] = [];
      for (const n of names) {
        try {
          out.push(view(load(n.slice(0, -".json".length))));
        } catch {
          /* de otro tipo o dañado: se ignora */
        }
      }
      return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    async study_curriculum_handoff_validate(id: string): Promise<CurriculumHandoff> {
      const s = load(id);
      await withGenerationLock(async () => {
        const temario = readText(path.join(app.root, s.space, TEMARIO));
        const catalogIds = new Set(catalogFor("programming").map((c) => c.id));
        for (const e of s.entries) {
          if (e.state === "created") continue;
          const r = validateEntry(s, e, catalogIds, temario);
          e.problems = r.problems;
          e.warnings = r.warnings;
          e.state = r.problems.length ? "error" : "created";
          s.log.push(r.problems.length ? `✗ «${e.name}»: ${r.problems[0]}` : `✓ «${e.name}»: tema creado y validado.`);
        }
        s.status = s.entries.every((e) => e.state === "created") ? "validated" : "failed";
        s.log.push(s.status === "validated" ? "✓ Todo validado." : "✗ Hay temas con problemas.");
        save(s);
        clearExerciseIndexCache();
        clearStudySnapshotCache();
      });
      return view(s);
    },
  };
}

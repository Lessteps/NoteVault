/**
 * What the AI chat may do to the vault, and only after the user clicks "Aplicar".
 *
 * The model never writes files: it ends a reply with a fenced `nv-action` block
 * (JSON). The app first PLANS the action (which folders and files, which already
 * exist), shows that to the user, and only then APPLIES it. Everything that reaches
 * the disk goes through `safeRel`, so a model (or a prompt injected into a note)
 * cannot write outside the vault, into hidden folders, or with an odd extension.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ApiError } from "./errors.js";
import { buildAreaMapCanvas, buildSpaceMapCanvas, type MapTopic, type SpaceMapArea, type TopicDependency } from "./areaMap.js";
import { dumpFrontmatter } from "./frontmatter.js";
import { applyPlanToPractica, parsePracticePlan } from "./practice/practicePlan.js";
import { branchFromPath, isEnglishBranch, LEGACY_VOCABULARY_FOLDER, type EnglishBranch } from "../lib/englishSkillData.js";
import { domainOfSubject } from "./practice/domain.js";
import { catalogFor, catalogSkill, deterministicSkillSelector, skillsForBranch } from "./practice/skillSelection.js";
import { createDefaultTopicManifest } from "./practice/topic.js";
import { topicTypeFromName, type TopicType } from "./practice/topicType.js";
import { frontmatterWithType, overviewFileText, practiceFileText, viewFileName } from "./practice/viewFiles.js";

export const ACTION_NAMES = ["create_syllabus", "create_topic", "create_canvas", "write_skill", "create_note", "set_practice_plan", "edit_file"] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export interface AssistantAction {
  action: string;
  args: Record<string, any>;
}

export interface PlannedOp {
  kind: "mkdir" | "write";
  /** vault-relative, POSIX */
  rel: string;
  content?: string;
  /** true only for files the action is meant to replace (a skill being edited) */
  overwrite?: boolean;
  exists: boolean;
}

export interface ActionPlan {
  action: ActionName;
  title: string;
  ops: PlannedOp[];
  /** the note worth opening once applied */
  open?: string;
  warnings: string[];
}

export interface ApplyResult {
  written: string[];
  skipped: string[];
  open?: string;
}

const MAX_AREAS = 40;
const MAX_TOPICS = 120;
const MAX_CANVAS_NODES = 400;
const MAX_TEXT = 200_000;
const ODD = /[\\/:*?"<>|\u0000-\u001f]/g;

/** A single file or folder name: no separators, no odd characters, never hidden. */
export function safeName(value: unknown): string {
  return String(value ?? "")
    .replace(ODD, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
}

/** A vault-relative path made only of safe segments; throws for anything that could escape. */
export function safeRel(value: unknown): string {
  const raw = String(value ?? "").replace(/\\/g, "/").trim();
  if (!raw || raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) throw new ApiError("Ruta inválida.");
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length) throw new ApiError("Ruta inválida.");
  for (const part of parts) {
    if (part === "." || part === ".." || part.startsWith(".")) throw new ApiError(`Ruta no permitida: ${raw}`);
  }
  const clean = parts.map(safeName).filter(Boolean);
  if (clean.length !== parts.length) throw new ApiError(`Ruta no permitida: ${raw}`);
  return clean.join("/");
}

function absOf(root: string, rel: string): string {
  const abs = path.resolve(root, ...rel.split("/"));
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new ApiError("Fuera del vault.");
  return abs;
}

function text(value: unknown, what: string): string {
  const s = typeof value === "string" ? value : "";
  if (!s.trim()) throw new ApiError(`Falta ${what}.`);
  if (s.length > MAX_TEXT) throw new ApiError(`${what} es demasiado largo.`);
  return s;
}

const SUBJECTS = ["mathematics", "programming", "english"] as const;

function foldWords(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The study subject of a name: the model's own `subject_id` when valid, else by keywords. */
export function subjectIdOf(name: string, given?: unknown): string {
  const g = String(given ?? "").trim().toLowerCase();
  if ((SUBJECTS as readonly string[]).includes(g)) return g;
  const n = foldWords(name);
  if (/(ingles|english|idioma|gramatica|vocabul)/.test(n)) return "english";
  if (/(program|codigo|software|javascript|typescript|python|java\b|backend|frontend|web|api|sql|node|react)/.test(n)) return "programming";
  return "mathematics";
}

function topicFiles(root: string, topicRel: string, topicName: string, subject: string, skills?: unknown, level?: unknown): PlannedOp[] {
  const wanted = Array.isArray(skills) ? skills.map((s) => String(s).trim().toLowerCase()).filter((s) => catalogSkill(subject, s)) : [];
  if (domainOfSubject(subject) === "english") {
    // English: the branch comes from the folder and decides the skills. No branch → no skills and no
    // default: the topic stays unclassified until it is resolved explicitly.
    const branch = branchFromPath(topicRel);
    const manifest = createDefaultTopicManifest(topicRel, topicName, subject, []);
    manifest.skills = wanted.length ? wanted : branch ? skillsForBranch(subject, branch) : [];
    if (branch) manifest.branch = branch;
    const cefr = String(level ?? "").trim().toUpperCase();
    if (/^(A1|A2|B1|B2|C1)$/.test(cefr)) manifest.level = cefr;
    const englishRel = `${topicRel}/${viewFileName(topicName, "practica")}`;
    return [{ kind: "write", rel: englishRel, content: practiceFileText(manifest), exists: fs.existsSync(absOf(root, englishRel)) }];
  }
  const type = topicTypeFromName(topicName) ?? "mixed";
  const chosen = wanted.length
    ? wanted
    : deterministicSkillSelector.select({ subject, topicType: type, title: topicName }).skills;
  const manifest = createDefaultTopicManifest(topicRel, topicName, subject, []);
  manifest.skills = chosen;
  manifest.topic_type = type;
  const rel = `${topicRel}/${viewFileName(topicName, "practica")}`;
  return [{ kind: "write", rel, content: practiceFileText(manifest), exists: fs.existsSync(absOf(root, rel)) }];
}

/**
 * Writes ONLY the topic's own manifest (`<topic>.practica.md`) when it is missing — never a sibling's, never the syllabus, maps or overviews.
 * Used by the "generate this topic" action. Returns the vault-relative files it wrote.
 */
export function ensureTopicManifest(root: string, topicRel: string, subject: string, level?: string): string[] {
  const topicName = topicRel.split("/").filter(Boolean).pop() ?? topicRel;
  const written: string[] = [];
  for (const op of topicFiles(root, topicRel, topicName, subject, undefined, level)) {
    if (op.kind !== "write" || op.exists || op.content === undefined) continue;
    const abs = absOf(root, op.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      fs.writeFileSync(abs, op.content, { encoding: "utf-8", flag: "wx" });
      written.push(op.rel);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  return written;
}

const mkdirOp = (root: string, rel: string): PlannedOp => ({ kind: "mkdir", rel, exists: fs.existsSync(absOf(root, rel)) });

function planSyllabus(root: string, args: Record<string, any>): ActionPlan {
  const subject = safeName(args.subject);
  if (!subject) throw new ApiError("Falta el nombre de la materia.");
  const subjectId = subjectIdOf(subject, args.subject_id);
  // Programming spaces are written in English (maps and outline included); mathematics and English keep Spanish.
  const mapLang = domainOfSubject(subjectId) === "programming" ? "en" : "es";
  const areas = Array.isArray(args.areas) ? args.areas.slice(0, MAX_AREAS) : [];
  if (!areas.length) throw new ApiError("El temario no tiene áreas.");

  const ops: PlannedOp[] = [mkdirOp(root, subject)];
  const rootOverview = `${subject}/${viewFileName(subject, "resumen")}`;
  ops.push({
    kind: "write",
    rel: rootOverview,
    content: overviewFileText(subject, subjectId, subject),
    exists: fs.existsSync(absOf(root, rootOverview)),
  });
  const spaceAreas: SpaceMapArea[] = [];
  for (const area of areas) {
    const areaName = safeName(area?.folder || area?.name);
    if (!areaName) continue;
    const areaRel = `${subject}/${areaName}`;
    ops.push(mkdirOp(root, areaRel));
    const overview = `${areaRel}/${viewFileName(areaName, "resumen")}`;
    ops.push({
      kind: "write",
      rel: overview,
      content: overviewFileText(safeName(area?.name) || areaName, subjectId, areaRel),
      exists: fs.existsSync(absOf(root, overview)),
    });
    const topics = Array.isArray(area?.topics) ? area.topics.slice(0, MAX_TOPICS) : [];
    const mapTopics: MapTopic[] = [];
    for (const topic of topics) {
      const topicName = safeName(topic?.folder || topic?.name);
      if (!topicName) continue;
      mapTopics.push({ name: topicName, file: `${areaRel}/${topicName}/${topicName}.md` });
      const topicRel = `${areaRel}/${topicName}`;
      ops.push(mkdirOp(root, topicRel), ...topicFiles(root, topicRel, topicName, subjectId, topic?.skills, topic?.level));
    }
    // Every grouping area gets its map (canvas), built from its topics (see mapa_skill).
    if (args.map !== false && mapTopics.length) {
      const areaLabel = safeName(area?.name) || areaName;
      const deps: TopicDependency[] = Array.isArray(area?.dependencies) ? area.dependencies : [];
      const mapRel = `${areaRel}/00 Mapa — ${areaName}.canvas`;
      ops.push({
        kind: "write",
        rel: mapRel,
        content: JSON.stringify(buildAreaMapCanvas(areaLabel, mapTopics, deps, mapLang), null, "\t") + "\n",
        exists: fs.existsSync(absOf(root, mapRel)),
      });
      spaceAreas.push({ name: areaLabel, topics: mapTopics.map((t) => t.name), prerequisites: Number(area?.prerequisites) || undefined });
    }
  }
  // The space map and the outline cover EVERY area of the space, not only the ones being added:
  // areas already on disk (from an earlier syllabus or study space) are read from their folders.
  const newNames = new Set(areas.map((a: any) => safeName(a?.folder || a?.name)).filter(Boolean));
  const dirs = (rel: string): string[] => {
    try {
      return fs
        .readdirSync(absOf(root, rel), { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith(".") && d.name !== LEGACY_VOCABULARY_FOLDER && /^\d/.test(d.name))
        .map((d) => d.name);
    } catch {
      return [];
    }
  };
  const natural = (x: string, y: string) => x.localeCompare(y, "es", { numeric: true });
  const existingAreas = dirs(subject).filter((n) => !newNames.has(n));
  const everyArea: Array<{ name: string; topics: readonly string[]; prerequisites?: number }> = [
    ...spaceAreas.map((a) => ({ ...a })),
    ...existingAreas.map((name) => ({ name, topics: dirs(`${subject}/${name}`).sort(natural) })),
  ].sort((x, y) => natural(x.name, y.name));
  const GENERATED = "<!-- nv:generated -->";
  if (args.map !== false && everyArea.length) {
    const spaceMapRel = `${subject}/00 Mapa de ${subject}.canvas`;
    const existing = fs.existsSync(absOf(root, spaceMapRel));
    // A map this generator drew (its node ids are g1, a1…) is redrawn; a hand-edited one is left alone.
    let generated = false;
    if (existing) {
      try {
        const nodes = JSON.parse(fs.readFileSync(absOf(root, spaceMapRel), "utf-8"))?.nodes ?? [];
        generated = nodes.length > 0 && nodes.every((n: any) => /^[ga]\d+$/.test(String(n?.id)));
      } catch {
        generated = false;
      }
    }
    ops.push({
      kind: "write",
      rel: spaceMapRel,
      content: JSON.stringify(buildSpaceMapCanvas(everyArea, mapLang), null, "\t") + "\n",
      overwrite: generated,
      exists: existing,
    });
  }
  if (everyArea.length) {
    const temarioRel = `${subject}/00 Temario.md`;
    const existing = fs.existsSync(absOf(root, temarioRel));
    const generated = existing && fs.readFileSync(absOf(root, temarioRel), "utf-8").includes(GENERATED);
    const lines = everyArea.flatMap((a) => [`## ${a.name}`, ...a.topics.map((t) => `- [[${t}]]`), ""]);
    ops.push({
      kind: "write",
      rel: temarioRel,
      content: `---\ntitle: ${mapLang === "en" ? "Syllabus of" : "Temario de"} ${subject}\nsubject: ${subjectId}\ntype: index\n---\n\n# ${mapLang === "en" ? "Syllabus of" : "Temario de"} ${subject}\n\n${GENERATED}\n\n${lines.join("\n").trimEnd()}\n`,
      overwrite: generated,
      exists: existing,
    });
  }
  return { action: "create_syllabus", title: `Crear el temario de ${subject}`, ops, warnings: [] };
}

function planTopic(root: string, args: Record<string, any>): ActionPlan {
  const areaRel = safeRel(args.area);
  if (!fs.existsSync(absOf(root, areaRel)) || !fs.statSync(absOf(root, areaRel)).isDirectory()) {
    throw new ApiError(`El área «${areaRel}» no existe.`);
  }
  const topicName = safeName(args.topic?.folder || args.topic?.name);
  if (!topicName) throw new ApiError("Falta el nombre del tema.");
  const topicRel = `${areaRel}/${topicName}`;
  const subject = subjectIdOf(areaRel, args.subject_id);
  const theory = text(args.theory, "la teoría del tema");

  const theoryRel = `${topicRel}/${topicName}.md`;
  const body = frontmatterWithType(theory, "teorica")
    ?? (theory.trimStart().startsWith("---")
      ? theory
      : `${dumpFrontmatter({ type: "teorica", subject, title: topicName })}\n${theory}`);
  const ops: PlannedOp[] = [
    mkdirOp(root, topicRel),
    { kind: "write", rel: theoryRel, content: body.endsWith("\n") ? body : `${body}\n`, exists: fs.existsSync(absOf(root, theoryRel)) },
    ...topicFiles(root, topicRel, topicName, subject, args.skills),
  ];
  return { action: "create_topic", title: `Crear el tema «${topicName}»`, ops, open: theoryRel, warnings: [] };
}

interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  [k: string]: unknown;
}

function validateCanvas(value: any): { nodes: CanvasNode[]; edges: any[] } {
  const nodes = Array.isArray(value?.nodes) ? value.nodes : null;
  const edges = Array.isArray(value?.edges) ? value.edges : [];
  if (!nodes || !nodes.length) throw new ApiError("El canvas no tiene nodos.");
  if (nodes.length > MAX_CANVAS_NODES) throw new ApiError("El canvas tiene demasiados nodos.");
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || !n.id || ids.has(n.id)) throw new ApiError("Nodo de canvas inválido o repetido.");
    if (!["text", "file", "link", "group"].includes(n.type)) throw new ApiError(`Tipo de nodo desconocido: ${n.type}`);
    if (![n.x, n.y, n.width, n.height].every((v) => typeof v === "number" && Number.isFinite(v))) {
      throw new ApiError(`El nodo ${n.id} no tiene posición y tamaño numéricos.`);
    }
    ids.add(n.id);
  }
  for (const e of edges) {
    if (!e || typeof e.id !== "string" || !ids.has(e.fromNode) || !ids.has(e.toNode)) {
      throw new ApiError("Hay una flecha que apunta a un nodo inexistente.");
    }
  }
  return { nodes, edges };
}

function planCanvas(root: string, args: Record<string, any>): ActionPlan {
  let rel = safeRel(args.path);
  if (!rel.toLowerCase().endsWith(".canvas")) rel += ".canvas";
  const canvas = validateCanvas(args.canvas);
  const content = JSON.stringify(canvas, null, "\t") + "\n";
  return {
    action: "create_canvas",
    title: `Crear el canvas ${rel.split("/").pop()}`,
    ops: [{ kind: "write", rel, content, exists: fs.existsSync(absOf(root, rel)) }],
    open: rel,
    warnings: [],
  };
}

/**
 * Rewrites the competency matrix of ONE topic: which skills it trains and how many
 * passed exercises each difficulty needs. Skills that do not suit the topic's nature
 * are dropped (and reported), exactly as when the AI first plans the topic.
 */
/** The classification the matrix is validated against: a topic type, or (English) the topic's branch. */
function matrixKey(topicRel: string, name: string, subject: string, declaredBranch = ""): TopicType | EnglishBranch {
  if (domainOfSubject(subject) !== "english") return topicTypeFromName(name) ?? "mixed";
  const branch = isEnglishBranch(declaredBranch) ? declaredBranch : branchFromPath(topicRel);
  if (!branch) throw new ApiError("Este tema de inglés no tiene rama (no está en una carpeta de rama): clasifícalo antes de cambiar su matriz.");
  return branch;
}

function planMatrix(root: string, args: Record<string, any>): ActionPlan {
  const topicRel = safeRel(args.topic);
  const topicAbs = absOf(root, topicRel);
  if (!fs.existsSync(topicAbs) || !fs.statSync(topicAbs).isDirectory()) throw new ApiError(`El tema «${topicRel}» no existe.`);
  const name = topicRel.split("/").pop()!;
  const practicaRel = `${topicRel}/${viewFileName(name, "practica")}`;
  const practicaAbs = absOf(root, practicaRel);
  let current = "";
  try {
    current = fs.readFileSync(practicaAbs, "utf-8");
  } catch {
    current = "";
  }
  const subject = /^subject:\s*(\w+)\s*$/m.exec(current)?.[1] ?? subjectIdOf(topicRel, args.subject_id);
  if (!current) {
    const manifest = createDefaultTopicManifest(topicRel, name, subject, []);
    current = practiceFileText(manifest);
  }
  const catalog = catalogFor(subject);
  const requested: any[] = Array.isArray(args.skills) ? args.skills : [];
  const plan = parsePracticePlan(
    JSON.stringify({ topic_type: args.topic_type, skills: requested, summary: args.summary ?? "" }),
    catalog,
    matrixKey(topicRel, name, subject, /^branch:\s*(\w+)/m.exec(current)?.[1] ?? ""),
    // The chat's checklist: what the user ticked stays, even if it does not usually suit the topic.
    args.force === true,
  );
  if (!plan) throw new ApiError("La matriz no tiene ninguna competencia válida para este tema.");
  const kept = new Set(plan.skills.map((s) => s.skill));
  const dropped = requested.map((s) => String(s?.skill ?? "").toLowerCase()).filter((s) => s && !kept.has(s));
  const labels = Object.fromEntries(catalog.map((s) => [s.id, s.label]));
  return {
    action: "set_practice_plan",
    title: `Cambiar la matriz de competencias de «${name}»`,
    ops: [{ kind: "write", rel: practicaRel, content: applyPlanToPractica(current, plan, labels), overwrite: true, exists: fs.existsSync(practicaAbs) }],
    open: practicaRel,
    warnings: dropped.length ? [`Se descartaron por no encajar con el tema o no existir: ${dropped.join(", ")}.`] : [],
  };
}

function planSkill(root: string, args: Record<string, any>): ActionPlan {
  const name = safeName(args.name).replace(/\.md$/i, "");
  if (!name) throw new ApiError("Falta el nombre de la skill.");
  const folder = args.folder ? safeRel(args.folder) : "";
  const rel = `${folder ? `${folder}/` : ""}_skills/${name}.md`;
  const content = text(args.content, "el contenido de la skill");
  const exists = fs.existsSync(absOf(root, rel));
  return {
    action: "write_skill",
    title: exists ? `Actualizar la skill ${name}` : `Crear la skill ${name}`,
    ops: [{ kind: "write", rel, content: content.endsWith("\n") ? content : `${content}\n`, overwrite: true, exists }],
    open: rel,
    warnings: exists ? ["Reemplaza el contenido actual de la skill."] : [],
  };
}

/**
 * A small change to a file that already exists: exact find/replace pairs (each `find`
 * must occur exactly once, so nothing is changed by accident), text appended at the end,
 * or the whole new content. Cheap in tokens: the model sends only what changes.
 */
function planEdit(root: string, args: Record<string, any>): ActionPlan {
  const rel = safeRel(args.path);
  if (!/\.(md|canvas)$/i.test(rel)) throw new ApiError("Solo se pueden modificar notas (.md) y canvas (.canvas).");
  const abs = absOf(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new ApiError(`El archivo «${rel}» no existe.`);
  let content = fs.readFileSync(abs, "utf-8");
  let changes = 0;
  if (typeof args.content === "string" && args.content.trim()) {
    content = args.content;
    changes += 1;
  }
  for (const e of Array.isArray(args.edits) ? args.edits : []) {
    const find = typeof e?.find === "string" ? e.find : "";
    const replace = typeof e?.replace === "string" ? e.replace : "";
    if (!find) throw new ApiError("Un cambio no indica qué texto sustituir.");
    const count = content.split(find).length - 1;
    if (count !== 1) {
      throw new ApiError(
        count === 0
          ? `No encuentro el texto «${find.slice(0, 50)}» en ${rel}.`
          : `El texto «${find.slice(0, 50)}» aparece ${count} veces en ${rel}; hace falta uno más específico.`,
      );
    }
    content = content.replace(find, () => replace);
    changes += 1;
  }
  if (typeof args.append === "string" && args.append.trim()) {
    content = `${content.replace(/\s*$/, "")}\n\n${args.append.trim()}\n`;
    changes += 1;
  }
  if (!changes) throw new ApiError("La modificación no cambia nada.");
  if (content.length > MAX_TEXT) throw new ApiError("El archivo resultante es demasiado largo.");
  if (/\.canvas$/i.test(rel)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ApiError("El canvas resultante no es un JSON válido.");
    }
    validateCanvas(parsed);
  }
  return {
    action: "edit_file",
    title: `Modificar ${rel.split("/").pop()}`,
    ops: [{ kind: "write", rel, content: content.endsWith("\n") ? content : `${content}\n`, overwrite: true, exists: true }],
    open: rel,
    warnings: [`Modifica el archivo existente (${changes} cambio(s)).`],
  };
}

function planNote(root: string, args: Record<string, any>): ActionPlan {
  let rel = safeRel(args.path);
  if (!rel.toLowerCase().endsWith(".md")) rel += ".md";
  const content = text(args.content, "el contenido de la nota");
  return {
    action: "create_note",
    title: `Crear la nota ${rel.split("/").pop()}`,
    ops: [{ kind: "write", rel, content: content.endsWith("\n") ? content : `${content}\n`, exists: fs.existsSync(absOf(root, rel)) }],
    open: rel,
    warnings: [],
  };
}

/** Validates an action and lists what it would do; writes nothing. */
export function planAssistantAction(root: string, action: AssistantAction): ActionPlan {
  const args = action?.args && typeof action.args === "object" ? action.args : {};
  switch (action?.action) {
    case "create_syllabus":
      return planSyllabus(root, args);
    case "create_topic":
      return planTopic(root, args);
    case "create_canvas":
      return planCanvas(root, args);
    case "write_skill":
      return planSkill(root, args);
    case "set_practice_plan":
      return planMatrix(root, args);
    case "create_note":
      return planNote(root, args);
    case "edit_file":
      return planEdit(root, args);
    default:
      throw new ApiError(`Acción desconocida: ${String(action?.action)}`);
  }
}

/** Runs a plan. Existing files are never replaced, except the ones the plan marks `overwrite`. */
export function applyAssistantAction(root: string, action: AssistantAction): ApplyResult {
  const plan = planAssistantAction(root, action);
  const written: string[] = [];
  const skipped: string[] = [];
  for (const op of plan.ops) {
    const abs = absOf(root, op.rel);
    if (op.kind === "mkdir") {
      fs.mkdirSync(abs, { recursive: true });
      continue;
    }
    if (fs.existsSync(abs) && !op.overwrite) {
      skipped.push(op.rel);
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, op.content ?? "", "utf-8");
    written.push(op.rel);
  }
  return { written, skipped, open: plan.open };
}

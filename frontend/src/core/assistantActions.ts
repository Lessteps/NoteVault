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
import { buildAreaMapCanvas } from "./areaMap.js";
import { dumpFrontmatter } from "./frontmatter.js";
import { catalogSkill, deterministicSkillSelector } from "./practice/skillSelection.js";
import { createDefaultTopicManifest } from "./practice/topic.js";
import { topicTypeFromName } from "./practice/topicType.js";
import { frontmatterWithType, overviewFileText, practiceFileText, viewFileName } from "./practice/viewFiles.js";

export const ACTION_NAMES = ["create_syllabus", "create_topic", "create_canvas", "write_skill", "create_note"] as const;
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
const MAX_TOPICS = 60;
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

function topicFiles(root: string, topicRel: string, topicName: string, subject: string, skills?: unknown): PlannedOp[] {
  const type = topicTypeFromName(topicName) ?? "mixed";
  const wanted = Array.isArray(skills) ? skills.map((s) => String(s).trim().toLowerCase()).filter((s) => catalogSkill(subject, s)) : [];
  const chosen = wanted.length
    ? wanted
    : deterministicSkillSelector.select({ subject, topicType: type, title: topicName }).skills;
  const manifest = createDefaultTopicManifest(topicRel, topicName, subject, []);
  manifest.skills = chosen;
  manifest.topic_type = type;
  const rel = `${topicRel}/${viewFileName(topicName, "practica")}`;
  return [{ kind: "write", rel, content: practiceFileText(manifest), exists: fs.existsSync(absOf(root, rel)) }];
}

const mkdirOp = (root: string, rel: string): PlannedOp => ({ kind: "mkdir", rel, exists: fs.existsSync(absOf(root, rel)) });

function planSyllabus(root: string, args: Record<string, any>): ActionPlan {
  const subject = safeName(args.subject);
  if (!subject) throw new ApiError("Falta el nombre de la materia.");
  const subjectId = subjectIdOf(subject, args.subject_id);
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
    const topicNames: string[] = [];
    for (const topic of topics) {
      const topicName = safeName(topic?.folder || topic?.name);
      if (!topicName) continue;
      topicNames.push(topicName);
      const topicRel = `${areaRel}/${topicName}`;
      ops.push(mkdirOp(root, topicRel), ...topicFiles(root, topicRel, topicName, subjectId, topic?.skills));
    }
    // Every grouping area gets its map (canvas), built from its topics (see mapa_skill).
    if (args.map !== false && topicNames.length) {
      const mapRel = `${areaRel}/00 Mapa — ${areaName}.canvas`;
      ops.push({
        kind: "write",
        rel: mapRel,
        content: JSON.stringify(buildAreaMapCanvas(safeName(area?.name) || areaName, topicNames), null, "\t") + "\n",
        exists: fs.existsSync(absOf(root, mapRel)),
      });
    }
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
    case "create_note":
      return planNote(root, args);
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

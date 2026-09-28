/**
 * Knowledge-base concept map generator — `tools/kb_canvas.ts`
 *
 * Rewritten from scratch (the old `tools/kb_canvas.py` died with the Python core).
 * Builds ONE canvas per concept note, from the note's own sections, and nothing
 * is ever hand-drawn:
 *
 *   <concept folder>/<number> <title> — mapa.canvas
 *
 * The canvas has exactly FOUR panels, left to right:
 *
 *   1. Requiere          — mandatory; one backlink card per prerequisite note,
 *                          or the card "Sin prerrequisitos." when there are none.
 *   2. Explicación       — `### Qué es` and `### Modelo mental`, one panel each.
 *   3. Ejemplos          — one group per example, each with its own four panels:
 *                          Contexto · Caso · Resultado esperado · Por qué funciona.
 *   4. Errores comunes   — one group per error, each its own panel with the four
 *                          fields: Error · Síntoma · Causa · Solución.
 *
 * Guarantees (all verified by `verifyCanvas`, see the checks at the bottom):
 *   - panel height = height of its whole text (no clipped text, no scrolling):
 *     sizes come from `boxSizing.requiredTextHeight`, the very same function the
 *     app's `fix_canvas_boxes` pass uses;
 *   - no two groups overlap and every group wraps its members: positions are
 *     computed bottom-up, each group is placed below the *real* bottom of the
 *     previous one, never from an estimate;
 *   - every arrow has a label that says why the two cards are connected.
 *
 * Usage (this repo runs TypeScript through vitest, see `src/core/canvas/kbCanvas.test.ts`):
 *
 *   KB_CANVAS_FOLDER="C:/PROGRAMMING/Matemáticas/<area>/<concept folder>" \
 *     npx vitest run src/core/canvas/kbCanvas.test.ts
 *
 * The generator never overwrites a canvas the user edited: when the file on disk
 * differs from the hash in the manifest it writes `… .nuevo.canvas` instead.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as cf from "../src/core/canvas/canvasFormat";
import { requiredTextHeight } from "../src/core/canvas/boxSizing";
import { parseFrontmatter } from "../src/core/frontmatter";

/* ── constants ───────────────────────────────────────────────────────────── */

/** Text panel width. `.nv-prose` caps its content at 820 px, so this is safe. */
const PANEL_W = 460;
/** "Qué es" holds the formal definitions; it gets the widest panel. */
const QUE_W = 620;
/** Link cards of the Requiere panel: navigation, not content. */
const LINK_W = 320;
const LINK_H = 150;
/** Horizontal gap between two panels, grown when a long label crosses it. */
const GAP_X_MIN = 200;
/** Vertical gap between two chained cards (room for one label line). */
const GAP_Y = 56;
/** Vertical gap between two groups in the same column. */
const GROUP_GAP = 120;
/** Group padding / space for the group label. */
const PAD = 24;
const TOP = 48;
/** Marker of the placeholder card drawn when a concept has no prerequisites. */
const ROLE_NO_PREREQ = "no-prerequisites";
/** Canvas colour presets. */
const C_CONCEPT = "6";
const C_DEFINITION = "5";
const C_EXAMPLE = "4";
const C_ERROR = "3";
/** Edge labels are words: plain "x → y" labels are rejected by verifyCanvas. */
const MAX_LABEL = 46;

const IGNORED_DIRS = new Set([
  ".git", ".trash", ".notevault", "node_modules", "dist", "build",
  "release", "attachments", "Demostraciones", "Ejercicios", "__pycache__", ".venv",
]);

/* ── note parsing ────────────────────────────────────────────────────────── */

export interface NoteSection {
  title: string;
  level: number;
  body: string;
}

export interface Field {
  label: string;
  text: string;
}

export interface Example {
  title: string;
  fields: Field[];
}

export interface CommonError {
  title: string;
  fields: Field[];
}

export interface Prerequisite {
  label: string;
  reason: string;
  /** vault-relative path of the prerequisite note, when it exists */
  note?: string;
}

export interface Concept {
  number: string;
  title: string;
  area: string;
  /** raw text of `## Requiere`, undefined when the section is missing */
  hasRequiereSection: boolean;
  prerequisites: Prerequisite[];
  queEs: string;
  modeloMental: string;
  examples: Example[];
  errors: CommonError[];
  /** everything the note should have and does not, or has and should not */
  warnings: string[];
}

const norm = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** `## X` / `### X` blocks, in order. */
export function sections(markdown: string): NoteSection[] {
  const out: NoteSection[] = [];
  let current: NoteSection | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m && m[1] && m[2]) {
      if (current) out.push(current);
      current = { title: m[2].trim(), level: m[1].length, body: "" };
      continue;
    }
    if (current) current.body += line + "\n";
  }
  if (current) out.push(current);
  for (const s of out) s.body = s.body.replace(/\s+$/, "");
  return out;
}

const top = (list: NoteSection[], names: string[]): NoteSection | undefined =>
  list.find((s) => s.level === 2 && names.some((n) => norm(s.title) === n));

const children = (section: NoteSection | undefined, all: NoteSection[]): NoteSection[] => {
  if (!section) return [];
  const i = all.indexOf(section);
  const out: NoteSection[] = [];
  for (let k = i + 1; k < all.length; k++) {
    const s = all[k];
    if (!s || s.level <= section.level) break;
    if (s.level === section.level + 1) out.push(s);
  }
  return out;
};

/** `- **Label:** text` bullets, tolerant of `- **Label**: text` and of missing bold. */
function labeledFields(body: string, labels: string[]): Field[] {
  const out: Field[] = [];
  const byLabel = new Map<string, Field>();
  for (const label of labels) byLabel.set(norm(label), { label, text: "" });
  let last: Field | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^[-*]\s+\*\*(.+?)\:?\*\*\s*\:?\s*(.*)$/.exec(line);
    if (m && m[1]) {
      const key = norm(m[1].replace(/\s*:\s*$/, ""));
      const field = byLabel.get(key);
      if (field) {
        field.text = (m[2] ?? "").trim();
        last = field;
        continue;
      }
    }
    if (last) last.text = `${last.text} ${line}`.trim();
  }
  for (const label of labels) {
    const f = byLabel.get(norm(label));
    if (f && f.text) out.push(f);
  }
  return out;
}

const EXAMPLE_FIELDS = ["Contexto", "Caso", "Resultado esperado", "Por qué funciona"];
const ERROR_FIELDS = ["Error", "Síntoma", "Causa", "Solución"];

function countFieldWarnings(kind: string, title: string, fields: Field[], expected: string[]): string[] {
  const missing = expected.filter((e) => !fields.some((f) => norm(f.label) === norm(e)));
  return missing.length ? [`${kind} "${title}": falta(n) ${missing.join(", ")}`] : [];
}

/** Reads the note and reports what is missing, without inventing anything. */
export function readConcept(folder: string, vaultRoot: string): Concept {
  const base = path.basename(path.resolve(folder));
  const notePath = path.join(path.resolve(folder), `${base}.md`);
  if (!fs.existsSync(notePath)) throw new Error(`no existe la nota: ${notePath}`);
  const raw = fs.readFileSync(notePath, "utf-8");
  const [fm, body] = parseFrontmatter(raw);
  const warnings: string[] = [];
  const all = sections(body);

  const number = String(fm["number"] ?? base.split(" ")[0] ?? "");
  const title = String(fm["title"] ?? base.replace(/^\S+\s+/, ""));
  const area = String(fm["area"] ?? path.basename(path.dirname(path.resolve(folder))));

  /* 1. Requiere */
  const requiere = top(all, ["requiere", "requisitos", "prerrequisitos"]);
  if (!requiere) warnings.push('falta la sección "## Requiere" (es obligatoria)');
  const prerequisites: Prerequisite[] = [];
  if (requiere) {
    const noPrereq = /sin\s+prerrequisitos/i.test(requiere.body);
    for (const raw of requiere.body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line.startsWith("-") && !line.startsWith("*")) continue;
      const link = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(line);
      if (!link || !link[1]) continue;
      const label = link[1].trim();
      const reason = line
        .replace(/\[\[[^\]]+\]\]/, "")
        .replace(/^[-*\s]+/, "")
        .replace(/^[—–-]\s*/, "")
        .trim();
      prerequisites.push({ label, reason: reason || "concepto previo" });
    }
    if (!prerequisites.length && !noPrereq) {
      warnings.push('"## Requiere" no tiene ningún `- [[Concepto previo]]` ni dice "Sin prerrequisitos"');
    }
  }
  for (const p of prerequisites) {
    const found = findNote(p.label, vaultRoot);
    if (found) p.note = found;
    else warnings.push(`el prerrequisito "${p.label}" no tiene nota en el vault (se dibuja como texto)`);
  }

  /* 2. Explicación */
  const explicacion = top(all, ["explicación", "explicacion"]);
  const queEs = children(explicacion, all).find((s) => norm(s.title) === "que es");
  const modelo = children(explicacion, all).find((s) => norm(s.title) === "modelo mental");
  if (!explicacion) warnings.push('falta la sección "## Explicación"');
  if (!queEs) warnings.push('falta "### Qué es" dentro de "## Explicación"');
  if (!modelo) warnings.push('falta "### Modelo mental" dentro de "## Explicación"');

  /* 3. Ejemplos */
  const ejemplos = top(all, ["ejemplos", "ejemplo"]);
  if (!ejemplos) warnings.push('falta la sección "## Ejemplos"');
  const examples: Example[] = children(ejemplos, all).map((s) => {
    const fields = labeledFields(s.body, EXAMPLE_FIELDS);
    warnings.push(...countFieldWarnings("Ejemplo", s.title, fields, EXAMPLE_FIELDS));
    return { title: s.title, fields };
  });

  /* 4. Errores comunes */
  const errores = top(all, ["errores comunes", "errores frecuentes", "errores tipicos", "errores típicos"]);
  if (!errores) warnings.push('falta la sección "## Errores comunes"');
  const errors: CommonError[] = children(errores, all).map((s) => {
    const fields = labeledFields(s.body, ERROR_FIELDS);
    warnings.push(...countFieldWarnings("Error", s.title, fields, ERROR_FIELDS));
    return { title: s.title, fields };
  });
  if (errores && !errors.length) warnings.push('"## Errores comunes" no tiene ningún `### Error N — …`');

  return {
    number, title, area,
    hasRequiereSection: Boolean(requiere),
    prerequisites,
    queEs: queEs?.body.trim() ?? "",
    modeloMental: modelo?.body.trim() ?? "",
    examples,
    errors,
    warnings,
  };
}

/* ── vault lookup ────────────────────────────────────────────────────────── */

/** Vault root = the folder that holds `.notevault`. */
export function findVaultRoot(from: string): string {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".notevault"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no encuentro la raíz del vault (.notevault) desde ${from}`);
    dir = parent;
  }
}

function walkNotes(root: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      walkNotes(path.join(root, e.name), out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      out.push(path.join(root, e.name));
    }
  }
  return out;
}

/** `[[<number> <title>]]` → its note, by basename (the note is named after it). */
export function findNote(label: string, vaultRoot: string): string | undefined {
  const wanted = label.trim().toLowerCase();
  for (const file of walkNotes(vaultRoot)) {
    const base = path.basename(file, ".md").toLowerCase();
    if (base === wanted || base.startsWith(`${wanted} `)) {
      return path.relative(vaultRoot, file).split(path.sep).join("/");
    }
  }
  return undefined;
}

/* ── layout ──────────────────────────────────────────────────────────────── */

const labelWidth = (label: string): number => label.length * 6.4;

/** What each example panel receives from the panel above it. */
const ARROW_INTO: Record<string, string> = {
  contexto: "se plantea así",
  caso: "el caso concreto",
  "resultado esperado": "da como resultado",
  "por que funciona": "funciona porque",
};

const arrowInto = (fieldLabel: string): string => ARROW_INTO[norm(fieldLabel)] ?? "sigue";

/** Horizontal gap wide enough for the longest label crossing it. */
const gapFor = (labels: string[]): number =>
  Math.max(GAP_X_MIN, ...labels.map((l) => labelWidth(l) + 64));

function group(label: string, members: cf.CanvasNode[], color: string, z: number): cf.CanvasNode {
  const x = Math.min(...members.map((m) => m.x)) - PAD;
  const y = Math.min(...members.map((m) => m.y)) - TOP;
  const right = Math.max(...members.map((m) => m.x + m.width)) + PAD;
  const bottom = Math.max(...members.map((m) => m.y + m.height)) + PAD;
  return new cf.CanvasNode({
    id: cf.newId(), type: "group", x, y, width: right - x, height: bottom - y,
    label, color, nv: { zIndex: z },
  });
}

class Builder {
  doc: cf.CanvasDoc;
  constructor() {
    this.doc = new cf.CanvasDoc();
  }
  text(x: number, y: number, w: number, md: string, color = ""): cf.CanvasNode {
    const n = new cf.CanvasNode({
      id: cf.newId(), type: "text", x, y, width: w,
      height: Math.ceil(requiredTextHeight(md, w)), text: md, color,
    });
    this.doc.nodes.push(n);
    return n;
  }
  link(x: number, y: number, vaultRel: string, w = LINK_W, h = LINK_H): cf.CanvasNode {
    const n = new cf.CanvasNode({ id: cf.newId(), type: "file", x, y, width: w, height: h, file: vaultRel });
    this.doc.nodes.push(n);
    return n;
  }
  add(node: cf.CanvasNode): cf.CanvasNode {
    this.doc.nodes.push(node);
    return node;
  }
  edge(a: cf.CanvasNode, b: cf.CanvasNode, label: string, fromSide = "right", toSide = "left"): void {
    if (!label.trim()) throw new Error("toda flecha necesita etiqueta");
    this.doc.edges.push(new cf.CanvasEdge({
      id: cf.newId(), fromNode: a.id, toNode: b.id,
      fromSide, toSide, label: label.slice(0, MAX_LABEL),
    }));
  }
}

/** The whole concept canvas: 4 panels, bottom-up, no overlap by construction. */
export function buildConceptCanvas(c: Concept): cf.CanvasDoc {
  const b = new Builder();

  /* ── Panel 1 — Requiere (mandatory, immune to changes) ─────────────────── */
  const prereqCards: cf.CanvasNode[] = [];
  if (c.prerequisites.length) {
    c.prerequisites.forEach((p, i) => {
      const y = i * (LINK_H + 40);
      prereqCards.push(
        p.note
          ? b.link(0, y, p.note)
          : b.text(0, y, LINK_W, `**${p.label}**\n\n*(pendiente)*`, C_ERROR),
      );
    });
  } else {
    const card = b.text(0, 0, LINK_W, "Sin prerrequisitos.", C_DEFINITION);
    card.nv = { role: ROLE_NO_PREREQ };
    prereqCards.push(card);
  }
  const requiereGroup = b.add(group("Requiere", prereqCards, "", -2));

  /* ── Panel 2 — Explicación: Qué es + Modelo mental ─────────────────────── */
  const toConceptLabels = c.prerequisites.length
    ? c.prerequisites.map((p) => p.reason)
    : ["concepto base"];
  const xEx = requiereGroup.x + requiereGroup.width + gapFor(toConceptLabels);

  const que = b.text(xEx, 0, QUE_W, `## Qué es\n\n${c.queEs}`, C_DEFINITION);
  const modelo = b.text(
    xEx, que.height + GAP_Y, QUE_W,
    `## Modelo mental\n\n${c.modeloMental}`, C_CONCEPT,
  );
  const explicacionGroup = b.add(group("Explicación", [que, modelo], C_CONCEPT, -2));

  for (const p of c.prerequisites) {
    const card = prereqCards[c.prerequisites.indexOf(p)];
    if (card) b.edge(card, que, p.reason);
  }
  b.edge(que, modelo, "se entiende con", "bottom", "top");

  /* ── Panel 3 — Ejemplos: one group per example, four panels each ───────── */
  const exampleLabels = c.examples.map(() => "se aplica en");
  const xEj = explicacionGroup.x + explicacionGroup.width + gapFor(exampleLabels);
  const exampleGroups: cf.CanvasNode[] = [];
  const exampleAnchors: cf.CanvasNode[] = [];
  let yEj = 0;

  for (const ex of c.examples) {
    const cards: Array<{ field: Field; node: cf.CanvasNode }> = [];
    let y = yEj;
    for (const f of ex.fields) {
      const card = b.text(xEj, y, PANEL_W, `### ${f.label}\n\n${f.text}`);
      cards.push({ field: f, node: card });
      y = card.y + card.height + GAP_Y;
    }
    for (let i = 1; i < cards.length; i++) {
      const prev = cards[i - 1];
      const cur = cards[i];
      if (!prev || !cur) continue;
      b.edge(prev.node, cur.node, arrowInto(cur.field.label), "bottom", "top");
    }
    const first = cards[0];
    if (!first) continue;
    exampleAnchors.push(first.node);
    exampleGroups.push(b.add(group(ex.title, cards.map((c) => c.node), C_EXAMPLE, -2)));
    yEj = first.node.y + Math.max(...cards.map((c) => c.node.height + c.node.y - first.node.y)) + GROUP_GAP;
  }
  const ejemplosGroup = exampleGroups.length
    ? b.add(group("Ejemplos", exampleGroups, C_EXAMPLE, -10))
    : undefined;
  for (const anchor of exampleAnchors) b.edge(modelo, anchor, "se aplica en");

  /* ── Panel 4 — Errores comunes: one panel per error ────────────────────── */
  const errorLabels = ["se falla cuando"];
  const xErr = (ejemplosGroup ? ejemplosGroup.x + ejemplosGroup.width : xEj + PANEL_W) + gapFor(errorLabels);
  const errorGroups: cf.CanvasNode[] = [];
  const errorCards: cf.CanvasNode[] = [];
  let yErr = 0;

  for (const err of c.errors) {
    const md =
      `**${err.title}**\n\n` +
      err.fields.map((f) => `- **${f.label}:** ${f.text}`).join("\n");
    const card = b.text(xErr, yErr, PANEL_W, md, C_ERROR);
    errorCards.push(card);
    errorGroups.push(b.add(group(err.title, [card], C_ERROR, -2)));
    yErr = card.y + card.height + GROUP_GAP;
  }
  if (errorGroups.length) b.add(group("Errores comunes", errorGroups, C_ERROR, -10));
  for (const card of errorCards) b.edge(que, card, "se falla cuando");

  return b.doc;
}

/* ── verification ────────────────────────────────────────────────────────── */

interface Rect { x: number; y: number; width: number; height: number }

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/**
 * Everything the acceptance checklist demands, in code. Returns one string per
 * problem: an empty array means the canvas is correct.
 */
export function verifyCanvas(doc: cf.CanvasDoc): string[] {
  const problems: string[] = [];
  const nodes = doc.nodes;
  const groups = nodes.filter((n) => n.type === "group");
  const leaves = nodes.filter((n) => n.type !== "group");

  for (const n of leaves) {
    if (n.type === "text") {
      const need = requiredTextHeight(n.text ?? "", n.width);
      if (need > n.height + 1) {
        problems.push(`la tarjeta "${firstLine(n.text)}" mide ${n.height} y su texto necesita ${Math.ceil(need)}`);
      }
    }
  }
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i];
      const bb = leaves[j];
      if (a && bb && intersects(a, bb)) {
        problems.push(`dos tarjetas se solapan: "${firstLine(a.text || a.file)}" | "${firstLine(bb.text || bb.file)}"`);
      }
    }
  }
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const bb = groups[j];
      if (!a || !bb || !intersects(a, bb)) continue;
      // A parent group wraps its children on purpose: that is containment,
      // not overlap. Only two groups that cut into each other are a defect.
      if (contains(a, bb) || contains(bb, a)) continue;
      problems.push(`dos grupos se solapan: "${a.label}" | "${bb.label}"`);
    }
  }
  for (const g of groups) {
    const members = leaves.filter((n) => contains(g, n) || isInsideByCenter(g, n));
    const strays = members.filter((n) => !contains(g, n));
    for (const s of strays) {
      problems.push(`el grupo "${g.label}" no envuelve a "${firstLine(s.text || s.file)}"`);
    }
  }
  for (const ed of doc.edges) {
    if (!ed.label.trim()) problems.push(`flecha sin etiqueta: ${ed.fromNode} → ${ed.toNode}`);
    if (!doc.nodeById(ed.fromNode) || !doc.nodeById(ed.toNode)) {
      problems.push(`flecha rota: ${ed.fromNode} → ${ed.toNode}`);
    }
  }
  const connected = new Set(doc.edges.flatMap((ed) => [ed.fromNode, ed.toNode]));
  for (const n of leaves) {
    if (n.nv["role"] === ROLE_NO_PREREQ) continue; // placeholder, nothing to connect
    if (!connected.has(n.id)) problems.push(`tarjeta desconectada: "${firstLine(n.text || n.file)}"`);
  }
  return problems;
}

const firstLine = (text: string | undefined): string =>
  `${(text ?? "").replace(/^#+\s*/gm, "").split("\n").find((l) => l.trim()) ?? ""}`.trim().slice(0, 48);

const isInsideByCenter = (g: Rect, n: Rect): boolean => {
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  return cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height;
};

/* ── writing, with the manifest guard ────────────────────────────────────── */

const MANIFEST_REL = path.join(".notevault", "estudio", "kb_canvas_manifest.json");

interface Manifest { [vaultRel: string]: string }

function readManifest(vaultRoot: string): Manifest {
  const p = path.join(vaultRoot, MANIFEST_REL);
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(vaultRoot: string, m: Manifest): void {
  const p = path.join(vaultRoot, MANIFEST_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(m, null, 2), "utf-8");
}

const sha256 = (file: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * Writes `doc` to `target` unless the user edited it since the generator last
 * wrote it — in that case the new version goes to `<stem>.nuevo.canvas` and the
 * edited file is left untouched.
 */
export function writeGenerated(target: string, doc: cf.CanvasDoc, vaultRoot: string): string {
  const rel = path.relative(vaultRoot, target).split(path.sep).join("/");
  const tmp = `${target}.tmp`;
  cf.dump(tmp, doc);
  const hash = sha256(tmp);
  const manifest = readManifest(vaultRoot);
  const known = manifest[rel];
  const untouched = !fs.existsSync(target) || (known !== undefined && sha256(target) === known);
  if (!untouched) {
    const alt = target.replace(/\.canvas$/, ".nuevo.canvas");
    fs.copyFileSync(tmp, alt);
    fs.rmSync(tmp, { force: true });
    return `kept (user-edited) → wrote ${alt}`;
  }
  fs.copyFileSync(tmp, target);
  fs.rmSync(tmp, { force: true });
  manifest[rel] = hash;
  writeManifest(vaultRoot, manifest);
  return `written ${target}`;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

export interface GenerateResult {
  canvasPath: string;
  lines: string[];
  problems: string[];
  warnings: string[];
  written: string;
}

/** Generates the canvas of one concept folder and verifies it. */
export function generateConcept(folder: string): GenerateResult {
  const vaultRoot = findVaultRoot(folder);
  const concept = readConcept(folder, vaultRoot);
  const doc = buildConceptCanvas(concept);
  const problems = verifyCanvas(doc);
  const canvasPath = path.join(path.resolve(folder), `${path.basename(path.resolve(folder))} — mapa.canvas`);
  const written = problems.length ? "not written (fix the problems first)" : writeGenerated(canvasPath, doc, vaultRoot);
  return {
    canvasPath,
    lines: [
      `concepto ${concept.number} ${concept.title}`,
      `prerrequisitos: ${concept.prerequisites.length}`,
      `ejemplos: ${concept.examples.length} · errores: ${concept.errors.length}`,
      `nodos: ${doc.nodes.length} (${doc.nodes.filter((n) => n.type === "group").length} grupos) · flechas: ${doc.edges.length}`,
    ],
    problems,
    warnings: concept.warnings,
    written,
  };
}

function main(argv: string[]): number {
  const folder = argv[0];
  if (!folder) {
    process.stderr.write("uso: node tools/kb_canvas.ts <carpeta del concepto>\n");
    return 2;
  }
  const r = generateConcept(folder);
  for (const l of r.lines) process.stdout.write(`${l}\n`);
  for (const w of r.warnings) process.stdout.write(`warning: ${w}\n`);
  for (const p of r.problems) process.stdout.write(`problem: ${p}\n`);
  process.stdout.write(`problems: ${r.problems.length}\n${r.written}\n`);
  return r.problems.length ? 1 : 0;
}

if (process.argv[1] && /kb_canvas\.(ts|js)$/.test(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}

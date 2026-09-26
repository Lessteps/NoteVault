// Ported from notevault_app/core/canvas_builder.py
// Build a .canvas from a declarative, coordinate-free spec (nodes + edges +
// layout). Pure core: no Qt, no UI.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import * as cf from "./canvasFormat.js";

export const GAP = 60.0;
export const RANK_GAP = 140.0;
export const DEFAULT_CARD_W = 240.0;
export const LAYOUTS = ["radial", "tree", "grid", "column", "row"] as const;
export const KINDS = ["text", "note", "shape"] as const;

const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/map_templates",
);

type Spec = Record<string, any>;

export interface Template { name: string; path: string; yaml: string }

export function listTemplates(): Template[] {
  const out: Template[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(TEMPLATES_DIR).filter((n) => n.endsWith(".yaml")).sort();
  } catch {
    return out;
  }
  for (const f of files) {
    const full = path.join(TEMPLATES_DIR, f);
    let text: string;
    try {
      text = fs.readFileSync(full, "utf-8");
    } catch {
      continue;
    }
    let name = path.parse(f).name;
    for (const line of text.split("\n").slice(0, 5)) {
      if (line.trim().toLowerCase().startsWith("# name:")) {
        name = line.split(":").slice(1).join(":").trim();
        break;
      }
    }
    out.push({ name, path: full, yaml: text });
  }
  return out;
}

export function loadTemplate(name: string): string {
  for (const t of listTemplates()) {
    if (name === t.name || name === path.parse(t.path).name) return t.yaml;
  }
  return "";
}

function composeText(title: string, body: string): string {
  const t = (title || "").trim();
  const b = (body || "").trim();
  if (t && b) return `# ${t}\n\n${b}`;
  if (t) return `# ${t}`;
  return b;
}

function sizeNode(nspec: Spec, defaultW: number): [number, number] {
  const kind = nspec.kind ?? "text";
  if (kind === "note") return [320.0, 220.0];
  if (kind === "shape") return [180.0, 90.0];
  const w = Number(nspec.width || defaultW);
  const body = composeText(nspec.title ?? "", nspec.body ?? "");
  const charsPerLine = Math.max(8.0, (w - 24.0) / 7.5);
  const lines = Math.ceil(Math.max(1, body.length) / charsPerLine) + (nspec.title ? 2 : 0);
  const h = Math.min(360.0, Math.max(70.0, 44.0 + lines * 22.0));
  return [w, h];
}

export function validateSpec(spec: Spec): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return ["spec must be a mapping"];
  const nodes = spec.nodes;
  if (!Array.isArray(nodes) || !nodes.length) {
    errors.push("spec.nodes must be a non-empty list");
    return errors;
  }
  const layout = spec.layout ?? "radial";
  if (!LAYOUTS.includes(layout)) errors.push(`unknown layout '${layout}'; use one of ${LAYOUTS.join(",")}`);
  const ids = new Set<string>();
  nodes.forEach((n: Spec, i: number) => {
    const nid = n.id;
    if (!nid) {
      errors.push(`nodes[${i}] is missing an id`);
      return;
    }
    if (ids.has(nid)) errors.push(`duplicate node id '${nid}'`);
    ids.add(nid);
    const kind = n.kind ?? "text";
    if (!KINDS.includes(kind)) errors.push(`node '${nid}': unknown kind '${kind}'`);
    if (kind === "note" && !n.file) errors.push(`note node '${nid}' needs a 'file' (vault-relative path)`);
  });
  (spec.edges || []).forEach((e: Spec, j: number) => {
    if (!ids.has(e.from)) errors.push(`edges[${j}].from references unknown node '${e.from}'`);
    const tos = Array.isArray(e.to) ? e.to : [e.to];
    for (const t of tos) if (!ids.has(t)) errors.push(`edges[${j}].to references unknown node '${t}'`);
  });
  return errors;
}

export function specFromYaml(text: string): Spec {
  return (yaml.load(text) as Spec) || {};
}

function* edgePairs(spec: Spec): Generator<[string, string, string, boolean]> {
  for (const e of spec.edges || []) {
    const tos = Array.isArray(e.to) ? e.to : [e.to];
    const label = e.label || "";
    const directed = e.directed ?? true;
    for (const t of tos) yield [e.from, t, label, directed];
  }
}

function sidesFor(s: cf.CanvasNode, t: cf.CanvasNode): [string, string] {
  const dx = (t.x + t.width / 2) - (s.x + s.width / 2);
  const dy = (t.y + t.height / 2) - (s.y + s.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

function pickRoot(spec: Spec, nodes: Spec[]): string {
  for (const n of nodes) if (n.role === "root") return n.id;
  const outDegree = new Map<string, number>();
  for (const [src] of edgePairs(spec)) outDegree.set(src, (outDegree.get(src) ?? 0) + 1);
  if (outDegree.size) {
    let best = "";
    let bestN = -1;
    for (const [k, v] of outDegree) if (v > bestN) { best = k; bestN = v; }
    return best;
  }
  return nodes[0]!.id;
}

function childrenMap(spec: Spec): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const [src, t] of edgePairs(spec)) {
    if (!children.has(src)) children.set(src, []);
    children.get(src)!.push(t);
  }
  return children;
}

function bfsLevels(root: string, children: Map<string, string[]>, allIds: string[]): [string[][], Map<string, string>] {
  const levels: string[][] = [];
  const parent = new Map<string, string>();
  const seen = new Set([root]);
  let frontier = [root];
  while (frontier.length) {
    levels.push(frontier);
    const nxt: string[] = [];
    for (const p of frontier) {
      for (const c of children.get(p) ?? []) {
        if (!seen.has(c)) {
          seen.add(c);
          parent.set(c, p);
          nxt.push(c);
        }
      }
    }
    frontier = nxt;
  }
  const orphans = allIds.filter((i) => !seen.has(i));
  if (orphans.length) levels.push(orphans);
  return [levels, parent];
}

type ById = Map<string, cf.CanvasNode>;

function cellSize(byid: ById): [number, number] {
  let w = 0;
  let h = 0;
  for (const n of byid.values()) {
    w = Math.max(w, n.width);
    h = Math.max(h, n.height);
  }
  return [w, h];
}

function layoutColumn(order: string[], byid: ById, direction = "down"): void {
  const horizontal = direction === "right";
  let x = 0;
  let y = 0;
  for (const nid of order) {
    const n = byid.get(nid)!;
    if (horizontal) { n.x = x; n.y = 0; x += n.width + GAP; }
    else { n.x = 0; n.y = y; y += n.height + GAP; }
  }
}

function layoutGrid(order: string[], byid: ById): void {
  const n = order.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const [cw, ch] = cellSize(byid);
  order.forEach((nid, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const node = byid.get(nid)!;
    node.x = c * (cw + GAP);
    node.y = r * (ch + GAP);
  });
}

function layoutTree(order: string[], byid: ById, spec: Spec, root: string, direction = "down"): void {
  const children = childrenMap(spec);
  const [cw, ch] = cellSize(byid);
  const stepMain = RANK_GAP + (direction === "down" ? ch : cw);
  const slot = { v: 0 };
  const depthOf = new Map<string, number>();

  const place = (nid: string, depth: number, seen: Set<string>): number => {
    if (seen.has(nid)) return 0;
    const seen2 = new Set(seen).add(nid);
    depthOf.set(nid, depth);
    const kids = (children.get(nid) ?? []).filter((k) => byid.has(k) && !seen2.has(k));
    let cross: number;
    if (!kids.length) {
      cross = slot.v * ((direction === "down" ? cw : ch) + GAP);
      slot.v += 1;
    } else {
      const centers = kids.map((k) => place(k, depth + 1, seen2));
      cross = centers.reduce((a, b) => a + b, 0) / centers.length;
    }
    const n = byid.get(nid)!;
    if (direction === "down") { n.x = cross - n.width / 2; n.y = depth * stepMain; }
    else { n.y = cross - n.height / 2; n.x = depth * stepMain; }
    return cross;
  };
  place(root, 0, new Set());

  const placed = new Set(depthOf.keys());
  const spare = order.filter((nid) => !placed.has(nid));
  let base = 0;
  if (direction === "down") {
    for (const i of placed) base = Math.max(base, byid.get(i)!.y + byid.get(i)!.height);
  }
  spare.forEach((nid, i) => {
    byid.get(nid)!.x = i * (cw + GAP);
    byid.get(nid)!.y = base + RANK_GAP;
  });
}

function layoutRadial(order: string[], byid: ById, spec: Spec, root: string): void {
  const children = childrenMap(spec);
  const [cw, ch] = cellSize(byid);
  const ringStep = RANK_GAP + Math.max(cw, ch) / 2;
  const [levels] = bfsLevels(root, children, order);
  const setCenter = (nid: string, cx: number, cy: number) => {
    const n = byid.get(nid)!;
    n.x = cx - n.width / 2;
    n.y = cy - n.height / 2;
  };
  setCenter(root, 0, 0);
  levels.forEach((ids, depth) => {
    if (depth === 0) return;
    const k = ids.length;
    const radius = Math.max(depth * ringStep, (k * (Math.max(cw, ch) + GAP)) / (2 * Math.PI));
    ids.forEach((nid, i) => {
      const ang = (2 * Math.PI * i) / k - Math.PI / 2;
      setCenter(nid, radius * Math.cos(ang), radius * Math.sin(ang));
    });
  });
}

export function buildCanvas(spec: Spec): cf.CanvasDoc {
  const errors = validateSpec(spec);
  if (errors.length) throw new Error("invalid canvas spec:\n  " + errors.join("\n  "));

  const defaults = spec.defaults || {};
  const defaultW = Number(defaults.card_width || DEFAULT_CARD_W);
  const defaultColor = String(defaults.card_color || "");

  const order: string[] = spec.nodes.map((n: Spec) => n.id);
  const byid: ById = new Map();
  for (const nspec of spec.nodes) {
    const kind = nspec.kind ?? "text";
    const [w, h] = sizeNode(nspec, defaultW);
    const type = kind === "note" ? "file" : kind === "shape" ? "nv-shape" : "text";
    const node = new cf.CanvasNode({
      id: cf.newId(), type, width: w, height: h,
      color: String(nspec.color || defaultColor),
    });
    if (kind === "note") node.file = String(nspec.file ?? "");
    else if (kind === "shape") {
      node.text = (nspec.title ?? "").trim();
      node.nv = { shape: nspec.shape ?? "process" };
    } else node.text = composeText(nspec.title ?? "", nspec.body ?? "");
    byid.set(nspec.id, node);
  }

  const root = pickRoot(spec, spec.nodes);
  const layout = spec.layout ?? "radial";
  const direction = spec.direction ?? "down";
  if (layout === "column") layoutColumn(order, byid, direction);
  else if (layout === "row") layoutColumn(order, byid, "right");
  else if (layout === "grid") layoutGrid(order, byid);
  else if (layout === "tree") layoutTree(order, byid, spec, root, direction);
  else layoutRadial(order, byid, spec, root);

  const doc = new cf.CanvasDoc(order.map((i) => byid.get(i)!));
  for (const [src, dst, label, directed] of edgePairs(spec)) {
    const s = byid.get(src)!;
    const t = byid.get(dst)!;
    const [fs_, ts] = sidesFor(s, t);
    doc.edges.push(new cf.CanvasEdge({
      id: cf.newId(), fromNode: s.id, toNode: t.id,
      fromSide: fs_, toSide: ts,
      fromEnd: "none", toEnd: directed ? "arrow" : "none",
      label: String(label),
    }));
  }
  return doc;
}

export function writeCanvas(p: string, spec: Spec): string {
  cf.dump(p, buildCanvas(spec));
  return p;
}

export function createMapInVault(vaultRoot: string, relPath: string, spec: Spec): string {
  const out = path.join(vaultRoot, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  return writeCanvas(out, spec);
}

export const list_templates = listTemplates;
export const load_template = loadTemplate;
export const validate_spec = validateSpec;
export const spec_from_yaml = specFromYaml;
export const build_canvas = buildCanvas;
export const write_canvas = writeCanvas;
export const create_map_in_vault = createMapInVault;

// Ported from notevault_app/core/canvas_format.py
// Read/write .canvas files (Obsidian-compatible JSON superset). NoteVault-only
// features live under an "nv" object. Key order in to_dict is byte-critical.

import * as crypto from "node:crypto";
import * as fs from "node:fs";

export const CANVAS_EXT = ".canvas";
export const CURRENT_VERSION = 1;

export const STD_NODE_TYPES = ["text", "file", "link", "group"] as const;
export const NV_NODE_TYPES = ["nv-shape", "nv-drawing"] as const;
export const SHAPE_KINDS = [
  "start_end", "process", "decision", "io", "connector",
  "predefined", "database", "manual_input", "display", "comment",
] as const;

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

const round = (n: number) => Math.round(n);

export class CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  file: string;
  text: string;
  url: string;
  label: string;
  nv: Record<string, unknown>;

  constructor(init: Partial<CanvasNode> & { id: string; type: string }) {
    this.id = init.id;
    this.type = init.type;
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    this.width = init.width ?? 250;
    this.height = init.height ?? 60;
    this.color = init.color ?? "";
    this.file = init.file ?? "";
    this.text = init.text ?? "";
    this.url = init.url ?? "";
    this.label = init.label ?? "";
    this.nv = init.nv ?? {};
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      id: this.id, type: this.type,
      x: round(this.x), y: round(this.y),
      width: round(this.width), height: round(this.height),
    };
    if (this.color) d.color = this.color;
    if (this.type === "file") d.file = this.file;
    else if (this.type === "text") d.text = this.text;
    else if (this.type === "link") d.url = this.url;
    else if (this.type === "group") { if (this.label) d.label = this.label; }
    else if (this.text) d.text = this.text;
    if (this.nv && Object.keys(this.nv).length) d.nv = this.nv;
    return d;
  }

  static fromDict(d: Record<string, unknown>): CanvasNode {
    return new CanvasNode({
      id: String(d.id || newId()),
      type: String(d.type || "text"),
      x: Number(d.x ?? 0), y: Number(d.y ?? 0),
      width: Number(d.width ?? 250), height: Number(d.height ?? 60),
      color: String(d.color ?? ""),
      file: String(d.file ?? ""), text: String(d.text ?? ""),
      url: String(d.url ?? ""), label: String(d.label ?? ""),
      nv: (d.nv && typeof d.nv === "object" ? { ...(d.nv as object) } : {}) as Record<string, unknown>,
    });
  }
}

export class CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: string;
  toSide: string;
  fromEnd: string;
  toEnd: string;
  color: string;
  label: string;
  nv: Record<string, unknown>;

  constructor(init: Partial<CanvasEdge> & { id: string; fromNode: string; toNode: string }) {
    this.id = init.id;
    this.fromNode = init.fromNode;
    this.toNode = init.toNode;
    this.fromSide = init.fromSide ?? "right";
    this.toSide = init.toSide ?? "left";
    this.fromEnd = init.fromEnd ?? "none";
    this.toEnd = init.toEnd ?? "arrow";
    this.color = init.color ?? "";
    this.label = init.label ?? "";
    this.nv = init.nv ?? {};
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      id: this.id,
      fromNode: this.fromNode, fromSide: this.fromSide,
      toNode: this.toNode, toSide: this.toSide,
    };
    if (this.fromEnd !== "none") d.fromEnd = this.fromEnd;
    if (this.toEnd !== "arrow") d.toEnd = this.toEnd;
    if (this.color) d.color = this.color;
    if (this.label) d.label = this.label;
    if (this.nv && Object.keys(this.nv).length) d.nv = this.nv;
    return d;
  }

  static fromDict(d: Record<string, unknown>): CanvasEdge {
    return new CanvasEdge({
      id: String(d.id || newId()),
      fromNode: String(d.fromNode ?? ""), toNode: String(d.toNode ?? ""),
      fromSide: String(d.fromSide ?? "right"), toSide: String(d.toSide ?? "left"),
      fromEnd: String(d.fromEnd ?? "none"), toEnd: String(d.toEnd ?? "arrow"),
      color: String(d.color ?? ""), label: String(d.label ?? ""),
      nv: (d.nv && typeof d.nv === "object" ? { ...(d.nv as object) } : {}) as Record<string, unknown>,
    });
  }
}

export class CanvasDoc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];

  constructor(nodes: CanvasNode[] = [], edges: CanvasEdge[] = []) {
    this.nodes = nodes;
    this.edges = edges;
  }

  toDict(): { nodes: unknown[]; edges: unknown[] } {
    return { nodes: this.nodes.map((n) => n.toDict()), edges: this.edges.map((e) => e.toDict()) };
  }

  static fromDict(d: Record<string, unknown> | null | undefined): CanvasDoc {
    const dd = d || {};
    const nodes = ((dd.nodes as unknown[]) || []).map((n) => CanvasNode.fromDict(n as Record<string, unknown>));
    const edges = ((dd.edges as unknown[]) || []).map((e) => CanvasEdge.fromDict(e as Record<string, unknown>));
    return new CanvasDoc(nodes, edges);
  }

  nodeById(nodeId: string): CanvasNode | null {
    return this.nodes.find((n) => n.id === nodeId) ?? null;
  }
}

export function load(p: string): CanvasDoc {
  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf-8");
  } catch {
    return new CanvasDoc();
  }
  if (!raw.trim()) return new CanvasDoc();
  try {
    return CanvasDoc.fromDict(JSON.parse(raw));
  } catch {
    return new CanvasDoc();
  }
}

export function dump(p: string, doc: CanvasDoc): void {
  const text = JSON.stringify(doc.toDict(), null, 2);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, text, "utf-8");
  fs.renameSync(tmp, p);
}

export function createEmpty(p: string): string {
  if (!fs.existsSync(p)) dump(p, new CanvasDoc());
  return p;
}

export const new_id = newId;
export const create_empty = createEmpty;
export const node_by_id = (doc: CanvasDoc, id: string) => doc.nodeById(id);

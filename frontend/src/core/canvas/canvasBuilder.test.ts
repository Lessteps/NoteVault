import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as cf from "./canvasFormat.js";
import * as cb from "./canvasBuilder.js";

const PHASE0 = {
  layout: "radial",
  nodes: [
    { id: "center", title: "Proyecto", role: "root" },
    { id: "who", title: "Quién" },
    { id: "when", title: "Cuándo" },
    { id: "what", title: "Qué" },
    { id: "cost", title: "Coste" },
  ],
  edges: [{ from: "center", to: ["who", "when", "what", "cost"] }],
};

function rect(n: cf.CanvasNode) {
  return { x: n.x, y: n.y, w: n.width, h: n.height };
}
function noOverlaps(doc: cf.CanvasDoc): boolean {
  const rs = doc.nodes.map(rect);
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i]!;
      const b = rs[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    }
  }
  return true;
}
const spec = (layout: string, n = 5) => ({
  layout,
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, title: `N${i}` })),
  edges: [{ from: "n0", to: Array.from({ length: n - 1 }, (_, i) => `n${i + 1}`) }],
});

describe("canvas builder — validation", () => {
  it("rejects empty nodes, duplicates, dangling edges, bad layout, note without file", () => {
    expect(cb.validateSpec({ nodes: [] }).length).toBeGreaterThan(0);
    expect(cb.validateSpec({ nodes: [{ id: "a" }, { id: "a" }] }).some((e) => e.includes("duplicate"))).toBe(true);
    expect(cb.validateSpec({ nodes: [{ id: "a" }], edges: [{ from: "a", to: "ghost" }] }).some((e) => e.includes("ghost"))).toBe(true);
    expect(cb.validateSpec({ layout: "spiral", nodes: [{ id: "a" }] }).some((e) => e.includes("layout"))).toBe(true);
    expect(cb.validateSpec({ nodes: [{ id: "a", kind: "note" }] }).some((e) => e.includes("file"))).toBe(true);
    expect(cb.validateSpec(PHASE0)).toEqual([]);
  });

  it("build throws on an invalid spec", () => {
    expect(() => cb.buildCanvas({ nodes: [] })).toThrow();
  });
});

describe("canvas builder — layouts", () => {
  it("column aligns in one column with no overlaps", () => {
    const doc = cb.buildCanvas(spec("column"));
    expect(new Set(doc.nodes.map((n) => Math.round(n.x))).size).toBe(1);
    expect(noOverlaps(doc)).toBe(true);
  });
  it("row aligns in one row with no overlaps", () => {
    const doc = cb.buildCanvas(spec("row"));
    expect(new Set(doc.nodes.map((n) => Math.round(n.y))).size).toBe(1);
    expect(noOverlaps(doc)).toBe(true);
  });
  it("grid has sqrt columns and no overlaps", () => {
    const doc = cb.buildCanvas(spec("grid", 9));
    expect(new Set(doc.nodes.map((n) => Math.round(n.x))).size).toBe(Math.ceil(Math.sqrt(9)));
    expect(noOverlaps(doc)).toBe(true);
  });
  it("tree puts the root on top with no overlaps", () => {
    const doc = cb.buildCanvas(spec("tree"));
    const top = Math.min(...doc.nodes.map((n) => n.y));
    expect(doc.nodes[0]!.y).toBe(top);
    expect(noOverlaps(doc)).toBe(true);
  });
  it("radial centres the root with no overlaps", () => {
    const doc = cb.buildCanvas(spec("radial"));
    const root = doc.nodes[0]!;
    expect(Math.abs(root.x + root.width / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(root.y + root.height / 2)).toBeLessThanOrEqual(0.5);
    expect(noOverlaps(doc)).toBe(true);
  });
  it("edges reference real nodes and valid sides", () => {
    const doc = cb.buildCanvas(spec("row"));
    const ids = new Set(doc.nodes.map((n) => n.id));
    for (const e of doc.edges) {
      expect(ids.has(e.fromNode)).toBe(true);
      expect(ids.has(e.toNode)).toBe(true);
      expect(["top", "right", "bottom", "left"]).toContain(e.fromSide);
      expect(["top", "right", "bottom", "left"]).toContain(e.toSide);
      expect(e.toEnd).toBe("arrow");
    }
  });
});

describe("canvas builder — round-trip, yaml, templates", () => {
  it("round-trips through the canvas format", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_cb_"));
    try {
      const doc = cb.buildCanvas(PHASE0);
      const p = path.join(dir, "m.canvas");
      cf.dump(p, doc);
      const loaded = cf.load(p);
      expect(loaded.nodes.length).toBe(doc.nodes.length);
      expect(loaded.edges.length).toBe(doc.edges.length);
      expect(doc.nodes.length).toBe(5);
      expect(doc.edges.length).toBe(4);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses a YAML spec", () => {
    const s = cb.specFromYaml("layout: column\nnodes:\n  - id: a\n    title: A\n  - id: b\n    title: B\nedges:\n  - {from: a, to: b}\n");
    expect(cb.validateSpec(s)).toEqual([]);
    expect(cb.buildCanvas(s).nodes.length).toBe(2);
  });

  it("lists the bundled templates", () => {
    const names = cb.listTemplates().map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    expect(cb.loadTemplate(names[0]!)).toContain("nodes");
  });
});

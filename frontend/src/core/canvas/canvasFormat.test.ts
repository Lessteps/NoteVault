import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as cf from "./canvasFormat.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_canvas_"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("canvas format", () => {
  it("empty round-trip", () => {
    const p = path.join(dir, "a.canvas");
    cf.createEmpty(p);
    const doc = cf.load(p);
    expect(doc.nodes).toEqual([]);
    expect(doc.edges).toEqual([]);
  });

  it("missing file reads empty", () => {
    expect(cf.load(path.join(dir, "ghost.canvas")).nodes).toEqual([]);
  });

  it("node round-trip", () => {
    const doc = new cf.CanvasDoc(
      [
        new cf.CanvasNode({ id: "n1", type: "text", x: 10, y: 20, width: 200, height: 80, text: "hola", color: "3" }),
        new cf.CanvasNode({ id: "n2", type: "file", x: 300, y: 0, file: "Nota.md" }),
      ],
      [new cf.CanvasEdge({ id: "e1", fromNode: "n1", toNode: "n2", label: "link" })],
    );
    const p = path.join(dir, "b.canvas");
    cf.dump(p, doc);
    const got = cf.load(p);
    expect(got.nodes.length).toBe(2);
    expect(got.nodes[0]!.text).toBe("hola");
    expect(got.nodes[0]!.color).toBe("3");
    expect(got.nodes[1]!.file).toBe("Nota.md");
    expect(got.edges[0]!.label).toBe("link");
    expect(got.edges[0]!.fromNode).toBe("n1");
  });

  it("serialises standard nodes with only standard keys", () => {
    const doc = new cf.CanvasDoc(
      [new cf.CanvasNode({ id: "n1", type: "text", text: "x" }), new cf.CanvasNode({ id: "n2", type: "file", file: "F.md" })],
      [new cf.CanvasEdge({ id: "e1", fromNode: "n1", toNode: "n2" })],
    );
    const p = path.join(dir, "c.canvas");
    cf.dump(p, doc);
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(Object.keys(raw).sort()).toEqual(["edges", "nodes"]);
    for (const n of raw.nodes) {
      expect("nv" in n).toBe(false);
      expect("id" in n).toBe(true);
      expect("type" in n).toBe(true);
    }
    // A default edge omits fromEnd/toEnd but keeps the interleaved side order.
    expect(Object.keys(raw.edges[0])).toEqual(["id", "fromNode", "fromSide", "toNode", "toSide"]);
  });

  it("preserves the nv extension", () => {
    const doc = new cf.CanvasDoc([new cf.CanvasNode({ id: "s1", type: "nv-shape", text: "Inicio", nv: { shape: "start_end" } })]);
    const p = path.join(dir, "d.canvas");
    cf.dump(p, doc);
    const got = cf.load(p);
    expect(got.nodes[0]!.nv.shape).toBe("start_end");
    expect(got.nodes[0]!.text).toBe("Inicio");
  });

  it("corrupt file reads empty", () => {
    const p = path.join(dir, "bad.canvas");
    fs.writeFileSync(p, "{ not json", "utf-8");
    expect(cf.load(p).nodes).toEqual([]);
  });
});

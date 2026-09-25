import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as aiClient from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { AppConfig } from "../appConfig.js";
import { AppState } from "../appState.js";
import { canvasApi } from "./canvas.js";

const SPEC = `title: T
layout: radial
nodes:
  - {id: a, title: Centro, role: root}
  - {id: b, title: Hoja}
edges:
  - {from: a, to: b}
`;

describe("canvasApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof canvasApi>;
  let rel: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_canvas_"));
    fs.writeFileSync(path.join(tmpDir, "Nota.md"), "# Nota\n\nhola\n", "utf-8");
    fs.writeFileSync(path.join(tmpDir, "Ctx.md"), "contexto importante", "utf-8");

    app = new AppState(tmpDir);
    api = canvasApi(app);
    rel = api.canvas_create("Mapa").path;

    vi.spyOn(AppConfig, "get_ai_config").mockReturnValue({
      provider: "lmstudio",
      base_url: "http://127.0.0.1:9/v1",
      model: "m",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("test_create_read_write_round_trip", () => {
    expect(rel).toBe("Mapa.canvas");
    expect(api.canvas_create("Mapa").path).toBe("Mapa 1.canvas");
    const data = api.canvas_read(rel);
    const doc = {
      nodes: [
        { id: "a", type: "text", x: 0, y: 0, width: 200, height: 80, text: "Hola", color: "4" },
        { id: "b", type: "file", x: 300, y: 0, width: 200, height: 80, file: "Nota.md" },
        {
          id: "c",
          type: "nv-shape",
          x: 0,
          y: 200,
          width: 160,
          height: 60,
          text: "¿x?",
          nv: { shape: "decision" },
        },
        {
          id: "d",
          type: "nv-drawing",
          x: 0,
          y: 400,
          width: 100,
          height: 100,
          nv: { strokes: [{ points: [[0, 0], [10, 10]], color: "2", width: 3 }] },
        },
      ],
      edges: [{ id: "e1", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" }],
    };
    const r = api.canvas_write(rel, doc, data.modified);
    expect(r.ok).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, rel), "utf-8"));
    expect(onDisk.nodes.map((n: any) => n.id)).toEqual(["a", "b", "c", "d"]);
    expect(onDisk.nodes[0].color).toBe("4");
    expect(onDisk.nodes[2].nv.shape).toBe("decision");
    expect(onDisk.edges[0].toNode).toBe("b");

    // Stale write is refused
    expect(api.canvas_write(rel, doc, data.modified - 100).conflict).toBe(true);
  });

  it("test_bad_input_is_dropped", () => {
    const doc = {
      nodes: [
        { id: "a", type: "text", x: NaN, y: 1e30, width: -5, text: "x", color: "red;" },
        { id: "a", type: "text" }, // duplicate id
        { id: "../x", type: "text" },
        { id: "z", type: "script" },
      ],
      edges: [{ id: "e", fromNode: "a", toNode: "ghost" }],
    };
    api.canvas_write(rel, doc);
    const out = api.canvas_read(rel).doc as any;
    expect(out.nodes.length).toBe(1);
    const n = out.nodes[0];
    expect([n.x, n.y, n.width]).toEqual([0, 10_000_000, 10]);
    expect(n.color).toBeUndefined();
    expect(out.edges).toEqual([]);
  });

  it("test_lists", () => {
    fs.mkdirSync(path.join(tmpDir, "img"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "img", "a.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.mkdirSync(path.join(tmpDir, ".trash"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".trash", "b.png"), "x", "utf-8");

    expect(api.canvas_images().map((i) => i.path)).toEqual(["img/a.png"]);
    expect(api.canvas_list().map((c) => c.path)).toContain("Mapa.canvas");
    expect(api.canvas_media("img/a.png").data_url).toMatch(/^data:image\/png;base64,/);
  });

  it("test_confined", () => {
    for (const bad of ["../x.canvas", "Nota.md", ".trash/x.canvas"]) {
      expect(() => api.canvas_read(bad)).toThrow(ApiError);
    }
    expect(() => api.canvas_media("Nota.md")).toThrow(ApiError);
    expect(api.canvas_file_info("../../etc/passwd").exists).toBe(false);
    const info = api.canvas_file_info("Nota.md");
    expect(info.kind).toBe("note");
    expect(info.text).toContain("hola");
  });

  it("test_yaml_order_builds_without_ai", async () => {
    const out = (await api.map_generate(SPEC, [], "", "", "", "Mapa")) as any;
    expect(out.path).toBe("Mapa 1.canvas");
    const doc = api.canvas_read(out.path).doc as any;
    expect(doc.nodes.length).toBe(2);
    expect((api.map_build(SPEC, "", "Mapa") as any).path).toBe("Mapa 2.canvas");
  });

  it("test_ai_reply_is_built_and_context_sent", async () => {
    const spy = vi
      .spyOn(aiClient, "sendChat")
      .mockResolvedValueOnce("```yaml\n" + SPEC + "```");
    const out = await api.map_generate("mapa de algo", ["Ctx.md"], "", "", "", "IA");
    expect(out.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
    const sentMessages = spy.mock.calls[0]![1];
    expect(sentMessages[1]!.content).toContain("contexto importante");
  });

  it("test_bad_input", async () => {
    expect(api.map_build("nodes: [1, 2]").ok).toBe(false);
    expect(api.map_build("- a\n- b").ok).toBe(false);
    expect(api.map_build("{{{").ok).toBe(false);
    await expect(api.map_generate("x", ["../fuera.md"])).rejects.toThrow(ApiError);
    expect(api.map_templates().length).toBeGreaterThan(0);
  });
});

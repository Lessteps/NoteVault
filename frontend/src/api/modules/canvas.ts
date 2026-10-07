// Ported from notevault_app/webapp/modules/canvas.py
// Canvas: read and write .canvas files (Obsidian's JSON format plus the
// NoteVault "nv" extras) and serve the media their cards show.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  AIConfig,
  BRIDGE_URLS,
  sendChat,
} from "../../core/aiClient.js";
import * as cb from "../../core/canvas/canvasBuilder.js";
import * as cf from "../../core/canvas/canvasFormat.js";
import { ApiError } from "../../core/errors.js";
import { kindFor } from "../../core/fileKinds.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { clampInt } from "../common.js";

export const MAX_CANVAS_BYTES = 8 * 1024 * 1024;
export const MAX_NODES = 5000;
export const MAX_EDGES = 10000;
export const MAX_STROKE_POINTS = 20000;
/** Largest width or height of a card or group. A deliverable canvas is many thousands of pixels wide, and its step groups wrap all of it. */
export const MAX_NODE_SIZE = 1_000_000;
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const _ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const _COLOR_RE = /^([1-6]|#[0-9a-fA-F]{6})?$/;
export const SIDES = ["top", "right", "bottom", "left"] as const;
export const ENDS = ["none", "arrow"] as const;
export const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

function _num(v: any, lo = -1e7, hi = 1e7, def = 0.0): number {
  const f = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(f)) {
    return def;
  }
  return Math.max(lo, Math.min(hi, f));
}

function _text(v: any, limit: number): string {
  return String(v !== null && v !== undefined ? v : "").slice(0, limit);
}

function _color(v: any): string {
  const c = String(v ?? "");
  return _COLOR_RE.test(c) ? c : "";
}

function _clean_nv(nv: any): Record<string, any> {
  if (!nv || typeof nv !== "object" || Array.isArray(nv)) {
    return {};
  }
  const out: Record<string, any> = {};
  for (const [rawK, v] of Object.entries(nv).slice(0, 40)) {
    const k = String(rawK).slice(0, 40);
    if (k === "strokes") {
      const strokes: Array<Record<string, any>> = [];
      let budget = MAX_STROKE_POINTS;
      const rawStrokes = Array.isArray(v) ? v.slice(0, 2000) : [];
      for (const s of rawStrokes) {
        if (!s || typeof s !== "object") continue;
        const pts: Array<[number, number]> = [];
        const rawPoints = Array.isArray(s.points) ? s.points.slice(0, budget) : [];
        for (const p of rawPoints) {
          if (Array.isArray(p) && p.length >= 2) {
            pts.push([Math.round(_num(p[0]) * 10) / 10, Math.round(_num(p[1]) * 10) / 10]);
          }
        }
        budget -= pts.length;
        if (pts.length > 0) {
          strokes.push({
            points: pts,
            color: _color(s.color) || "1",
            width: _num(s.width, 0.5, 40, 3),
          });
        }
        if (budget <= 0) break;
      }
      out.strokes = strokes;
    } else if (typeof v === "boolean" || v === null) {
      out[k] = v;
    } else if (typeof v === "number") {
      out[k] = _num(v);
    } else if (typeof v === "string") {
      out[k] = v.slice(0, 2000);
    }
  }
  return out;
}

export function cleanDoc(data: any): cf.CanvasDoc {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError("Canvas inválido.");
  }
  const nodes: cf.CanvasNode[] = [];
  const seen = new Set<string>();
  const rawNodes = Array.isArray(data.nodes) ? data.nodes.slice(0, MAX_NODES) : [];
  const validNodeTypes: readonly string[] = [...cf.STD_NODE_TYPES, ...cf.NV_NODE_TYPES];
  for (const d of rawNodes) {
    if (!d || typeof d !== "object") continue;
    const nid = String(d.id || "");
    const kind = String(d.type || "");
    if (!_ID_RE.test(nid) || seen.has(nid) || !validNodeTypes.includes(kind)) {
      continue;
    }
    seen.add(nid);
    nodes.push(
      new cf.CanvasNode({
        id: nid,
        type: kind,
        x: _num(d.x),
        y: _num(d.y),
        width: _num(d.width, 10, MAX_NODE_SIZE, 250),
        height: _num(d.height, 10, MAX_NODE_SIZE, 60),
        color: _color(d.color),
        file: _text(d.file, 1000).replace(/\\/g, "/"),
        text: _text(d.text, 200_000),
        url: _text(d.url, 2000),
        label: _text(d.label, 500),
        nv: _clean_nv(d.nv),
      }),
    );
  }
  const edges: cf.CanvasEdge[] = [];
  const eseen = new Set<string>();
  const rawEdges = Array.isArray(data.edges) ? data.edges.slice(0, MAX_EDGES) : [];
  for (const d of rawEdges) {
    if (!d || typeof d !== "object") continue;
    const eid = String(d.id || "");
    const a = String(d.fromNode || "");
    const b = String(d.toNode || "");
    if (!_ID_RE.test(eid) || eseen.has(eid) || !seen.has(a) || !seen.has(b)) {
      continue;
    }
    eseen.add(eid);
    edges.push(
      new cf.CanvasEdge({
        id: eid,
        fromNode: a,
        toNode: b,
        fromSide: SIDES.includes(d.fromSide) ? d.fromSide : "right",
        toSide: SIDES.includes(d.toSide) ? d.toSide : "left",
        fromEnd: ENDS.includes(d.fromEnd) ? d.fromEnd : "none",
        toEnd: ENDS.includes(d.toEnd) ? d.toEnd : "arrow",
        color: _color(d.color),
        label: _text(d.label, 500),
        nv: _clean_nv(d.nv),
      }),
    );
  }
  return new cf.CanvasDoc(nodes, edges);
}

function canvasPath(app: AppState, rel: string, mustExist = true): string {
  const p = app.resolve(rel, { mustExist });
  if (path.extname(p).toLowerCase() !== cf.CANVAS_EXT) {
    throw new ApiError("No es un canvas.");
  }
  return p;
}

function guessImageMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };
  return mimes[ext] || "application/octet-stream";
}

const _MAP_SCHEMA = `Return ONLY a YAML document, no prose, with these keys:
  title: <string>
  layout: radial | tree | grid | column | row
  direction: down | right        # optional, for tree/column/row
  defaults: { card_width: 240 }   # optional
  nodes:                          # each node:
    - id: <unique alias>
      title: <short heading>
      body: <one sentence>        # optional
      color: "1".."6"             # optional (red,orange,yellow,green,cyan,purple)
      role: root                  # optional; marks the centre/root
      kind: text | note | shape   # optional, default text
  edges:
    - from: <alias>
      to: <alias or [alias, ...]> # a list fans one source to many
      label: <string>             # optional
Rules: unique ids; edges reference existing ids; short titles (they become
headings). Pick the layout that matches the requested shape.`;

export const MAX_MAP_TEXT = 40_000;

function mapYaml(reply: string): string {
  const m = /```(?:ya?ml)?\s*([\s\S]*?)```/i.exec(reply || "");
  return (m && m[1] ? m[1] : reply || "").trim();
}

function mapSpec(text: string): [Record<string, any> | null, string[]] {
  let spec: any;
  try {
    spec = cb.specFromYaml(text);
  } catch (e: any) {
    return [null, [`No pude leer el YAML: ${e?.message || e}`]];
  }
  if (
    !spec ||
    typeof spec !== "object" ||
    Array.isArray(spec) ||
    !Array.isArray(spec.nodes) ||
    !spec.nodes.every((n: any) => n && typeof n === "object") ||
    (spec.edges &&
      (!Array.isArray(spec.edges) || !spec.edges.every((e: any) => e && typeof e === "object")))
  ) {
    return [null, ["El YAML no tiene la forma de un mapa (nodes/edges)."]];
  }
  if (spec.nodes.length > 500) {
    return [null, ["Demasiados nodos (máximo 500)."]];
  }
  const errors = cb.validateSpec(spec);
  return errors.length > 0 ? [null, errors] : [spec, []];
}

function mapWrite(app: AppState, spec: Record<string, any>, folder_rel: string, name: string) {
  const folder = app.resolve(folder_rel, { allowRoot: true });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(folder);
  } catch {
    throw new ApiError("No es una carpeta.");
  }
  if (!stat.isDirectory()) {
    throw new ApiError("No es una carpeta.");
  }
  let stem = String(name || "").trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120);
  stem = stem.replace(/\.canvas$/i, "") || "Mapa";
  let p = path.join(folder, `${stem}${cf.CANVAS_EXT}`);
  let n = 1;
  while (fs.existsSync(p)) {
    p = path.join(folder, `${stem} ${n}${cf.CANVAS_EXT}`);
    n++;
  }
  cb.writeCanvas(p, spec);
  return { ok: true, path: app.rel(p) };
}

export function canvasApi(app: AppState) {
  return {
    canvas_read(rel: string) {
      const p = canvasPath(app, rel, true);
      const st = fs.statSync(p);
      if (st.size > MAX_CANVAS_BYTES) {
        throw new ApiError("El canvas es demasiado grande.");
      }
      return {
        path: app.rel(p),
        title: path.basename(p, cf.CANVAS_EXT),
        doc: cf.load(p).toDict(),
        modified: st.mtimeMs / 1000,
      };
    },

    canvas_write(rel: string, doc: Record<string, any>, expected_modified: any = null) {
      const p = canvasPath(app, rel, true);
      const st = fs.statSync(p);
      const currentModified = st.mtimeMs / 1000;
      if (expected_modified !== null && expected_modified !== undefined) {
        const expected = _num(expected_modified, 0, 1e12);
        if (Math.abs(currentModified - expected) > 1e-4) {
          return { ok: false, conflict: true, modified: currentModified };
        }
      }
      const clean = cleanDoc(doc);
      cf.dump(p, clean);
      const newSt = fs.statSync(p);
      return { ok: true, conflict: false, modified: newSt.mtimeMs / 1000 };
    },

    canvas_create(title: string, folder_rel: string = "") {
      const name = String(title || "").trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120);
      if (!name) {
        throw new ApiError("El título está vacío.");
      }
      const folder = app.resolve(folder_rel, { allowRoot: true });
      let stat: fs.Stats;
      try {
        stat = fs.statSync(folder);
      } catch {
        throw new ApiError("No es una carpeta.");
      }
      if (!stat.isDirectory()) {
        throw new ApiError("No es una carpeta.");
      }
      let p = path.join(folder, `${name}${cf.CANVAS_EXT}`);
      let n = 1;
      while (fs.existsSync(p)) {
        p = path.join(folder, `${name} ${n}${cf.CANVAS_EXT}`);
        n++;
      }
      cf.createEmpty(p);
      return { path: app.rel(p) };
    },

    canvas_list() {
      const out: Array<{ path: string; title: string }> = [];
      for (const p of app.vault.canvasPaths(5000)) {
        try {
          const rel = app.rel(p);
          if (!rel.split("/").some((part) => part.startsWith("."))) {
            out.push({ path: rel, title: path.basename(p, cf.CANVAS_EXT) });
          }
        } catch {
          continue;
        }
      }
      return out;
    },

    canvas_images(limit: number = 3000) {
      const maxLimit = clampInt(limit, 1, 10000, 3000);
      const out: Array<{ path: string; title: string }> = [];
      const stack = [app.root];
      while (stack.length > 0 && out.length < maxLimit) {
        const folder = stack.pop()!;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(folder, { withFileTypes: true });
          entries.sort((a, b) => a.name.localeCompare(b.name));
        } catch {
          continue;
        }
        for (const e of entries) {
          if (e.name.startsWith(".") || e.isSymbolicLink()) {
            continue;
          }
          const full = path.join(folder, e.name);
          if (e.isDirectory()) {
            stack.push(full);
          } else if (IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
            out.push({ path: app.rel(full), title: e.name });
          }
        }
      }
      out.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
      return out.slice(0, maxLimit);
    },

    canvas_media(rel: string) {
      const p = app.resolve(rel, { mustExist: true });
      let stat: fs.Stats;
      try {
        stat = fs.statSync(p);
      } catch {
        throw new ApiError("Solo se muestran imágenes.");
      }
      const ext = path.extname(p).toLowerCase();
      if (!stat.isFile() || !IMAGE_EXTS.has(ext)) {
        throw new ApiError("Solo se muestran imágenes.");
      }
      if (stat.size > MAX_MEDIA_BYTES) {
        throw new ApiError("La imagen es demasiado grande (15 MB).");
      }
      const mime = guessImageMime(p);
      const data = fs.readFileSync(p);
      return { data_url: `data:${mime};base64,${data.toString("base64")}` };
    },

    canvas_file_info(rel: string) {
      let p: string;
      try {
        p = app.resolve(rel, { mustExist: true });
      } catch {
        return { exists: false };
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(p);
      } catch {
        return { exists: false };
      }
      if (!stat.isFile()) {
        return { exists: false };
      }
      const ext = path.extname(p).toLowerCase();
      const kind = IMAGE_EXTS.has(ext) ? "image" : kindFor(p) || "other";
      const stem = path.basename(p, path.extname(p));
      const out: Record<string, any> = {
        exists: true,
        kind,
        title: stem,
        path: app.rel(p),
      };
      if ((kind === "note" || kind === "code") && stat.size <= 2 * 1024 * 1024) {
        try {
          out.text = fs.readFileSync(p, "utf-8").slice(0, 20000);
        } catch {
          out.text = "";
        }
      }
      return out;
    },

    map_templates() {
      return cb.listTemplates().map((t) => ({ name: t.name, yaml: t.yaml }));
    },

    map_build(yaml_text: string, folder_rel: string = "", name: string = "Mapa") {
      const [spec, errors] = mapSpec(mapYaml(String(yaml_text || "").slice(0, MAX_MAP_TEXT)));
      if (spec === null) {
        return { ok: false, errors };
      }
      return mapWrite(app, spec, folder_rel, name);
    },

    async map_generate(
      order: string,
      context: unknown = [],
      extra: string = "",
      template: string = "",
      folder_rel: string = "",
      name: string = "Mapa",
    ) {
      const ord = String(order || "").trim().slice(0, MAX_MAP_TEXT);
      if (!ord) {
        throw new ApiError("Escribe una orden (o pega un YAML de spec).");
      }
      const [spec] = mapSpec(ord);
      if (spec !== null) {
        return mapWrite(app, spec, folder_rel, name);
      }
      const blocks: string[] = [];
      const ctxList = Array.isArray(context) ? context.slice(0, 12) : [];
      for (const rel of ctxList) {
        const p = app.resolve(String(rel), { mustExist: true });
        let stat: fs.Stats;
        try {
          stat = fs.statSync(p);
        } catch {
          continue;
        }
        const ext = path.extname(p).toLowerCase();
        if (stat.isFile() && [".md", ".canvas", ".txt"].includes(ext)) {
          blocks.push(`### ${path.basename(p)}\n${fs.readFileSync(p, "utf-8").slice(0, 4000)}`);
        }
      }
      app.resolve(folder_rel, { allowRoot: true });

      const tpl = template ? cb.loadTemplate(String(template)) : "";
      const parts = [
        "You convert a request into a NoteVault canvas SPEC.",
        _MAP_SCHEMA,
        "TEMPLATE (use its structure as the shape to fill):\n" + (tpl || "none"),
      ];
      if (blocks.length > 0) {
        parts.push("CONTEXT FILES:\n" + blocks.join("\n"));
      }
      parts.push(
        "EXTRA INSTRUCTIONS:\n" + (String(extra || "").trim().slice(0, MAX_MAP_TEXT) || "none"),
      );
      parts.push("USER ORDER:\n" + ord);
      const prompt = parts.join("\n\n");

      const cfg = AIConfig.fromDict(AppConfig.get_ai_config());
      if (cfg.is_bridge) {
        return {
          ok: false,
          bridge: true,
          prompt,
          url: BRIDGE_URLS[cfg.provider] || "",
          label: cfg.info.label,
        };
      }
      const messages = [
        { role: "system", content: "You output only YAML canvas specs." },
        { role: "user", content: prompt },
      ];
      let reply: string;
      try {
        reply = await sendChat(cfg, messages);
      } catch (e: any) {
        return {
          ok: false,
          errors: [`Falló la IA: ${e?.message || e}. Puedes pegar el YAML a mano.`],
          prompt,
        };
      }
      const [genSpec, errors] = mapSpec(mapYaml(reply));
      if (genSpec === null) {
        return { ok: false, errors, prompt };
      }
      return mapWrite(app, genSpec, folder_rel, name);
    },
  };
}

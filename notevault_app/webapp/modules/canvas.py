"""Canvas: read and write .canvas files (Obsidian's JSON format plus the
NoteVault "nv" extras) and serve the media their cards show."""

from __future__ import annotations

import base64
import math
import mimetypes
import re
from pathlib import Path
from typing import Any

from ...core import canvas_format as cf
from ...core.file_kinds import kind_for
from ..errors import ApiError

MAX_CANVAS_BYTES = 8 * 1024 * 1024
MAX_NODES = 5000
MAX_EDGES = 10000
MAX_STROKE_POINTS = 20000
MAX_MEDIA_BYTES = 15 * 1024 * 1024
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_COLOR_RE = re.compile(r"^([1-6]|#[0-9a-fA-F]{6})?$")
SIDES = ("top", "right", "bottom", "left")
ENDS = ("none", "arrow")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}


def _num(v: Any, lo: float = -1e7, hi: float = 1e7, default: float = 0.0) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(f):
        return default
    return max(lo, min(hi, f))


def _text(v: Any, limit: int) -> str:
    return str(v if v is not None else "")[:limit]


def _color(v: Any) -> str:
    c = str(v or "")
    return c if _COLOR_RE.match(c) else ""


def _clean_nv(nv: Any) -> dict:
    """Keep the NoteVault extras JSON-sized and well typed; unknown keys of
    plain types pass through so newer files survive a round-trip."""
    if not isinstance(nv, dict):
        return {}
    out: dict = {}
    for k, v in list(nv.items())[:40]:
        k = str(k)[:40]
        if k == "strokes":
            strokes = []
            budget = MAX_STROKE_POINTS
            for s in (v if isinstance(v, list) else [])[:2000]:
                if not isinstance(s, dict):
                    continue
                pts = []
                for p in (s.get("points") or [])[:budget]:
                    if isinstance(p, (list, tuple)) and len(p) >= 2:
                        pts.append([round(_num(p[0]), 1), round(_num(p[1]), 1)])
                budget -= len(pts)
                if pts:
                    strokes.append({"points": pts, "color": _color(s.get("color")) or "1",
                                    "width": _num(s.get("width"), 0.5, 40, 3)})
                if budget <= 0:
                    break
            out["strokes"] = strokes
        elif isinstance(v, bool) or v is None:
            out[k] = v
        elif isinstance(v, (int, float)):
            out[k] = _num(v)
        elif isinstance(v, str):
            out[k] = v[:2000]
    return out


def clean_doc(data: Any) -> cf.CanvasDoc:
    """A canvas from the UI, validated: bounded sizes, known types, edges
    only between existing nodes."""
    if not isinstance(data, dict):
        raise ApiError("Canvas inválido.")
    nodes, seen = [], set()
    for d in (data.get("nodes") or [])[:MAX_NODES]:
        if not isinstance(d, dict):
            continue
        nid = str(d.get("id") or "")
        kind = str(d.get("type") or "")
        if not _ID_RE.match(nid) or nid in seen or kind not in cf.STD_NODE_TYPES + cf.NV_NODE_TYPES:
            continue
        seen.add(nid)
        nodes.append(cf.CanvasNode(
            id=nid, type=kind,
            x=_num(d.get("x")), y=_num(d.get("y")),
            width=_num(d.get("width"), 10, 20000, 250), height=_num(d.get("height"), 10, 20000, 60),
            color=_color(d.get("color")),
            file=_text(d.get("file"), 1000).replace("\\", "/"),
            text=_text(d.get("text"), 200_000), url=_text(d.get("url"), 2000),
            label=_text(d.get("label"), 500), nv=_clean_nv(d.get("nv")),
        ))
    edges, eseen = [], set()
    for d in (data.get("edges") or [])[:MAX_EDGES]:
        if not isinstance(d, dict):
            continue
        eid = str(d.get("id") or "")
        a, b = str(d.get("fromNode") or ""), str(d.get("toNode") or "")
        if not _ID_RE.match(eid) or eid in eseen or a not in seen or b not in seen:
            continue
        eseen.add(eid)
        edges.append(cf.CanvasEdge(
            id=eid, fromNode=a, toNode=b,
            fromSide=d.get("fromSide") if d.get("fromSide") in SIDES else "right",
            toSide=d.get("toSide") if d.get("toSide") in SIDES else "left",
            fromEnd=d.get("fromEnd") if d.get("fromEnd") in ENDS else "none",
            toEnd=d.get("toEnd") if d.get("toEnd") in ENDS else "arrow",
            color=_color(d.get("color")), label=_text(d.get("label"), 500),
            nv=_clean_nv(d.get("nv")),
        ))
    return cf.CanvasDoc(nodes=nodes, edges=edges)


class CanvasApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel and _resolve."""

    def _canvas_path(self, rel: str, must_exist: bool = True) -> Path:
        path = self._resolve(rel, must_exist=must_exist)
        if path.suffix.lower() != cf.CANVAS_EXT:
            raise ApiError("No es un canvas.")
        return path

    def canvas_read(self, rel: str) -> dict:
        with self._lock:
            path = self._canvas_path(rel)
            if path.stat().st_size > MAX_CANVAS_BYTES:
                raise ApiError("El canvas es demasiado grande.")
            return {"path": self._rel(path), "title": path.stem,
                    "doc": cf.load(path).to_dict(), "modified": path.stat().st_mtime}

    def canvas_write(self, rel: str, doc: dict, expected_modified: Any = None) -> dict:
        with self._lock:
            path = self._canvas_path(rel)
            if (expected_modified is not None
                    and abs(path.stat().st_mtime - _num(expected_modified, 0, 1e12)) > 1e-6):
                return {"ok": False, "conflict": True, "modified": path.stat().st_mtime}
            clean = clean_doc(doc)
            cf.dump(path, clean)
            return {"ok": True, "conflict": False, "modified": path.stat().st_mtime}

    def canvas_create(self, title: str, folder_rel: str = "") -> dict:
        with self._lock:
            name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(title or "").strip())[:120]
            if not name:
                raise ApiError("El título está vacío.")
            folder = self._resolve(folder_rel, allow_root=True)
            if not folder.is_dir():
                raise ApiError("No es una carpeta.")
            path = folder / f"{name}{cf.CANVAS_EXT}"
            n = 1
            while path.exists():
                path = folder / f"{name} {n}{cf.CANVAS_EXT}"
                n += 1
            cf.create_empty(path)
            return {"path": self._rel(path)}

    def canvas_list(self) -> list:
        """Every canvas of the vault, to embed one in another."""
        with self._lock:
            out = []
            for p in self._vault.canvas_paths(limit=5000):
                try:
                    rel = self._rel(p)
                except ValueError:
                    continue
                if not any(part.startswith(".") for part in rel.split("/")):
                    out.append({"path": rel, "title": p.stem})
            return out

    def canvas_images(self, limit: int = 3000) -> list:
        """Images inside the vault (outside its internal folders), for image cards."""
        with self._lock:
            out: list = []
            stack = [self._root]
            while stack and len(out) < limit:
                folder = stack.pop()
                try:
                    entries = sorted(folder.iterdir())
                except OSError:
                    continue
                for e in entries:
                    if e.name.startswith(".") or e.is_symlink():
                        continue
                    if e.is_dir():
                        stack.append(e)
                    elif e.suffix.lower() in IMAGE_EXTS:
                        out.append({"path": self._rel(e), "title": e.name})
            return sorted(out, key=lambda x: x["path"].lower())[:limit]

    def canvas_media(self, rel: str) -> dict:
        """An image a file card shows, as a data: URL (vault files only)."""
        with self._lock:
            path = self._resolve(rel)
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
                raise ApiError("Solo se muestran imágenes.")
            if path.stat().st_size > MAX_MEDIA_BYTES:
                raise ApiError("La imagen es demasiado grande (15 MB).")
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            return {"data_url": f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"}

    def canvas_file_info(self, rel: str) -> dict:
        """What a file card points at: a note (with its text), a canvas, an
        image or something else; missing files say so instead of failing."""
        with self._lock:
            try:
                path = self._resolve(rel)
            except ApiError:
                return {"exists": False}
            if not path.is_file():
                return {"exists": False}
            ext = path.suffix.lower()
            kind = "image" if ext in IMAGE_EXTS else (kind_for(path) or "other")
            out = {"exists": True, "kind": kind, "title": path.stem, "path": self._rel(path)}
            if kind in ("note", "code") and path.stat().st_size <= 2 * 1024 * 1024:
                out["text"] = path.read_text(encoding="utf-8", errors="replace")[:20000]
            return out


# ── concept maps: an order (+ context notes, a template) → AI → YAML spec → .canvas ──

_MAP_SCHEMA = """\
Return ONLY a YAML document, no prose, with these keys:
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
headings). Pick the layout that matches the requested shape."""
MAX_MAP_TEXT = 40_000


def _map_yaml(reply: str) -> str:
    m = re.search(r"```(?:ya?ml)?\s*(.*?)```", reply or "", re.S | re.I)
    return (m.group(1) if m else (reply or "")).strip()


def _map_spec(text: str) -> tuple[dict | None, list[str]]:
    from ...core import canvas_builder as cb
    try:
        spec = cb.spec_from_yaml(text)
    except Exception as e:  # noqa: BLE001 - shown to the user
        return None, [f"No pude leer el YAML: {e}"]
    if not isinstance(spec, dict) or not all(isinstance(n, dict) for n in (spec.get("nodes") or [])) \
            or not all(isinstance(e, dict) for e in (spec.get("edges") or [])):
        return None, ["El YAML no tiene la forma de un mapa (nodes/edges)."]
    if len(spec.get("nodes") or []) > 500:
        return None, ["Demasiados nodos (máximo 500)."]
    errors = cb.validate_spec(spec)
    return (None, errors) if errors else (spec, [])


class ConceptMapApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel, _resolve and _ai_cfg."""

    def map_templates(self) -> list:
        from ...core import canvas_builder as cb
        return [{"name": t["name"], "yaml": t["yaml"]} for t in cb.list_templates()]

    def _map_write(self, spec: dict, folder_rel: str, name: str) -> dict:
        from ...core import canvas_builder as cb
        folder = self._resolve(folder_rel, allow_root=True)
        if not folder.is_dir():
            raise ApiError("No es una carpeta.")
        stem = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(name or "").strip())[:120]
        stem = re.sub(r"\.canvas$", "", stem, flags=re.I) or "Mapa"
        path = folder / f"{stem}{cf.CANVAS_EXT}"
        n = 1
        while path.exists():
            path = folder / f"{stem} {n}{cf.CANVAS_EXT}"
            n += 1
        cb.write_canvas(path, spec)
        return {"ok": True, "path": self._rel(path)}

    def map_build(self, yaml_text: str, folder_rel: str = "", name: str = "Mapa") -> dict:
        """Create the map from a YAML spec (pasted, or the AI's reply)."""
        spec, errors = _map_spec(_map_yaml(str(yaml_text or "")[:MAX_MAP_TEXT]))
        if spec is None:
            return {"ok": False, "errors": errors}
        with self._lock:
            return self._map_write(spec, folder_rel, name)

    def map_generate(self, order: str, context: list, extra: str = "", template: str = "",
                     folder_rel: str = "", name: str = "Mapa") -> dict:
        order = str(order or "").strip()[:MAX_MAP_TEXT]
        if not order:
            raise ApiError("Escribe una orden (o pega un YAML de spec).")
        # An order that already is a valid spec is built with no AI.
        spec, _ = _map_spec(order)
        if spec is not None:
            with self._lock:
                return self._map_write(spec, folder_rel, name)
        blocks = []
        with self._lock:
            for rel in (context if isinstance(context, list) else [])[:12]:
                path = self._resolve(str(rel))
                if path.is_file() and path.suffix.lower() in (".md", ".canvas", ".txt"):
                    blocks.append(f"### {path.name}\n{path.read_text(encoding='utf-8', errors='replace')[:4000]}")
            self._resolve(folder_rel, allow_root=True)
        from ...core import canvas_builder as cb
        tpl = cb.load_template(str(template or "")) if template else ""
        parts = ["You convert a request into a NoteVault canvas SPEC.", _MAP_SCHEMA,
                 "TEMPLATE (use its structure as the shape to fill):\n" + (tpl or "none")]
        if blocks:
            parts.append("CONTEXT FILES:\n" + "\n".join(blocks))
        parts.append("EXTRA INSTRUCTIONS:\n" + (str(extra or "").strip()[:MAX_MAP_TEXT] or "none"))
        parts.append("USER ORDER:\n" + order)
        prompt = "\n\n".join(parts)
        from ...core import ai_client as ai
        cfg = self._ai_cfg()
        if cfg.is_bridge:
            return {"ok": False, "bridge": True, "prompt": prompt,
                    "url": ai.BRIDGE_URLS.get(cfg.provider, ""), "label": cfg.info.label}
        messages = [{"role": "system", "content": "You output only YAML canvas specs."},
                    {"role": "user", "content": prompt}]
        try:
            reply = ai.send_chat(cfg, messages)
        except ai.AIError as e:
            return {"ok": False, "errors": [f"Falló la IA: {e}. Puedes pegar el YAML a mano."],
                    "prompt": prompt}
        spec, errors = _map_spec(_map_yaml(reply))
        if spec is None:
            return {"ok": False, "errors": errors, "prompt": prompt}
        with self._lock:
            return self._map_write(spec, folder_rel, name)

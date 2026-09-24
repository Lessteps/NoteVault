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

"""Build a ``.canvas`` from a declarative, coordinate-free spec.

An agent (Claude or Antigravity) turns a natural-language request into a YAML/
dict *spec* that lists nodes and edges and picks a *layout*; this module
compiles that into a real :class:`canvas_format.CanvasDoc` with computed
positions, sizes and edge sides, and writes it. No Qt, no UI — pure core so it
is unit-testable and reusable.

See ``docs/PLAN_CONCEPT_MAP_GENERATOR.md`` for the full contract.
"""
from __future__ import annotations

import math
from collections import defaultdict, deque
from pathlib import Path

from . import canvas_format as cf

GAP = 60.0          # space between neighbouring cards
RANK_GAP = 140.0    # distance between tree levels / radial ring step
DEFAULT_CARD_W = 240.0

LAYOUTS = ("radial", "tree", "grid", "column", "row")
KINDS = ("text", "note", "shape")

TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "docs" / "map_templates"


def list_templates() -> list[dict]:
    """Reusable structure templates, read from ``docs/map_templates/*.yaml``.
    Each entry is ``{"name", "path", "yaml"}``; ``name`` is the ``# name:``
    comment on the first lines, else the file stem."""
    out: list[dict] = []
    if TEMPLATES_DIR.is_dir():
        for p in sorted(TEMPLATES_DIR.glob("*.yaml")):
            try:
                text = p.read_text(encoding="utf-8")
            except OSError:
                continue
            name = p.stem
            for line in text.splitlines()[:5]:
                low = line.strip().lower()
                if low.startswith("# name:"):
                    name = line.split(":", 1)[1].strip()
                    break
            out.append({"name": name, "path": p, "yaml": text})
    return out


def load_template(name: str) -> str:
    for t in list_templates():
        if name in (t["name"], t["path"].stem):
            return t["yaml"]
    return ""


# ── spec → markdown / sizing ────────────────────────────────────────────────
def _compose_text(title: str, body: str) -> str:
    title, body = (title or "").strip(), (body or "").strip()
    if title and body:
        return f"# {title}\n\n{body}"
    if title:
        return f"# {title}"
    return body


def _size_node(nspec: dict, default_w: float) -> tuple[float, float]:
    kind = nspec.get("kind", "text")
    if kind == "note":
        return 320.0, 220.0
    if kind == "shape":
        return 180.0, 90.0
    w = float(nspec.get("width") or default_w)
    body = _compose_text(nspec.get("title", ""), nspec.get("body", ""))
    chars_per_line = max(8.0, (w - 24.0) / 7.5)
    lines = math.ceil(max(1, len(body)) / chars_per_line) + (2 if nspec.get("title") else 0)
    h = min(360.0, max(70.0, 44.0 + lines * 22.0))
    return w, h


# ── validation ──────────────────────────────────────────────────────────────
def validate_spec(spec: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(spec, dict):
        return ["spec must be a mapping"]
    nodes = spec.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        errors.append("spec.nodes must be a non-empty list")
        return errors

    layout = spec.get("layout", "radial")
    if layout not in LAYOUTS:
        errors.append(f"unknown layout {layout!r}; use one of {LAYOUTS}")

    ids: set[str] = set()
    for i, n in enumerate(nodes):
        nid = n.get("id")
        if not nid:
            errors.append(f"nodes[{i}] is missing an id")
            continue
        if nid in ids:
            errors.append(f"duplicate node id {nid!r}")
        ids.add(nid)
        kind = n.get("kind", "text")
        if kind not in KINDS:
            errors.append(f"node {nid!r}: unknown kind {kind!r}")
        if kind == "note" and not n.get("file"):
            errors.append(f"note node {nid!r} needs a 'file' (vault-relative path)")

    for j, e in enumerate(spec.get("edges", []) or []):
        src = e.get("from")
        if src not in ids:
            errors.append(f"edges[{j}].from references unknown node {src!r}")
        tos = e.get("to")
        tos = tos if isinstance(tos, list) else [tos]
        for t in tos:
            if t not in ids:
                errors.append(f"edges[{j}].to references unknown node {t!r}")
    return errors


def spec_from_yaml(text: str) -> dict:
    try:
        import yaml
    except ImportError as exc:  # pragma: no cover - env dependent
        raise RuntimeError("pyyaml is required to parse a YAML spec; pass a dict "
                           "to build_canvas instead") from exc
    return yaml.safe_load(text) or {}


# ── edges ────────────────────────────────────────────────────────────────────
def _edge_pairs(spec: dict):
    """Yield (from_alias, to_alias, label, directed) for every edge, expanding
    a fan-out ``to: [a, b, c]`` into one pair each."""
    for e in spec.get("edges", []) or []:
        src = e.get("from")
        tos = e.get("to")
        tos = tos if isinstance(tos, list) else [tos]
        label = e.get("label", "") or ""
        directed = e.get("directed", True)
        for t in tos:
            yield src, t, label, directed


def _sides_for(s: cf.CanvasNode, t: cf.CanvasNode) -> tuple[str, str]:
    dx = (t.x + t.width / 2) - (s.x + s.width / 2)
    dy = (t.y + t.height / 2) - (s.y + s.height / 2)
    if abs(dx) >= abs(dy):
        return ("right", "left") if dx >= 0 else ("left", "right")
    return ("bottom", "top") if dy >= 0 else ("top", "bottom")


# ── tree structure helpers ───────────────────────────────────────────────────
def _pick_root(spec: dict, nodes: list[dict]) -> str:
    for n in nodes:
        if n.get("role") == "root":
            return n["id"]
    out_degree: dict[str, int] = defaultdict(int)
    for src, _t, _l, _d in _edge_pairs(spec):
        out_degree[src] += 1
    if out_degree:
        return max(out_degree, key=out_degree.get)
    return nodes[0]["id"]


def _children_map(spec: dict) -> dict[str, list[str]]:
    children: dict[str, list[str]] = defaultdict(list)
    for src, t, _l, _d in _edge_pairs(spec):
        children[src].append(t)
    return children


def _bfs_levels(root: str, children: dict[str, list[str]], all_ids: list[str]):
    """(levels, parent) using edges as a tree; unreached nodes get their own
    trailing level so nothing is lost."""
    levels: list[list[str]] = []
    parent: dict[str, str] = {}
    seen = {root}
    frontier = [root]
    while frontier:
        levels.append(frontier)
        nxt: list[str] = []
        for p in frontier:
            for c in children.get(p, []):
                if c not in seen:
                    seen.add(c)
                    parent[c] = p
                    nxt.append(c)
        frontier = nxt
    orphans = [i for i in all_ids if i not in seen]
    if orphans:
        levels.append(orphans)
    return levels, parent


# ── layouts (mutate node.x / node.y; positions are top-left corners) ─────────
def _cell_size(byid: dict[str, cf.CanvasNode]) -> tuple[float, float]:
    w = max(n.width for n in byid.values())
    h = max(n.height for n in byid.values())
    return w, h


def _layout_column(order, byid, direction="down", **_):
    horizontal = direction == "right"
    x = y = 0.0
    for nid in order:
        n = byid[nid]
        n.x, n.y = (x, 0.0) if horizontal else (0.0, y)
        if horizontal:
            x += n.width + GAP
        else:
            y += n.height + GAP


def _layout_row(order, byid, **kw):
    _layout_column(order, byid, direction="right")


def _layout_grid(order, byid, **_):
    n = len(order)
    cols = max(1, math.ceil(math.sqrt(n)))
    cw, ch = _cell_size(byid)
    for i, nid in enumerate(order):
        r, c = divmod(i, cols)
        node = byid[nid]
        node.x = c * (cw + GAP)
        node.y = r * (ch + GAP)


def _layout_tree(order, byid, spec, root, direction="down", **_):
    children = _children_map(spec)
    cw, ch = _cell_size(byid)
    step_main = RANK_GAP + (ch if direction == "down" else cw)
    slot = [0]                       # next free leaf slot along the cross axis
    depth_of: dict[str, float] = {}

    def place(nid, depth, seen):
        if nid in seen:
            return slot[0] * (0)      # cycle guard: no advance
        seen = seen | {nid}
        depth_of[nid] = depth
        kids = [k for k in children.get(nid, []) if k in byid and k not in seen]
        if not kids:
            cross = slot[0] * ((cw if direction == "down" else ch) + GAP)
            slot[0] += 1
        else:
            centers = [place(k, depth + 1, seen) for k in kids]
            cross = sum(centers) / len(centers)
        n = byid[nid]
        if direction == "down":
            n.x = cross - n.width / 2
            n.y = depth * step_main
        else:
            n.y = cross - n.height / 2
            n.x = depth * step_main
        return cross

    place(root, 0, frozenset())
    # Any node the tree walk did not reach (no path from root) is dropped in a
    # spare row so it is still visible and never overlaps the tree.
    placed = set(depth_of)
    spare = [nid for nid in order if nid not in placed]
    base = (max((byid[i].y + byid[i].height for i in placed), default=0.0)
            if direction == "down" else 0.0)
    for i, nid in enumerate(spare):
        byid[nid].x = i * (cw + GAP)
        byid[nid].y = base + RANK_GAP


def _layout_radial(order, byid, spec, root, **_):
    children = _children_map(spec)
    cw, ch = _cell_size(byid)
    ring_step = RANK_GAP + max(cw, ch) / 2
    levels, _parent = _bfs_levels(root, children, order)

    def set_center(nid, cx, cy):
        n = byid[nid]
        n.x, n.y = cx - n.width / 2, cy - n.height / 2

    set_center(root, 0.0, 0.0)
    for depth, ids in enumerate(levels):
        if depth == 0:
            continue
        k = len(ids)
        radius = max(depth * ring_step,
                     k * (max(cw, ch) + GAP) / (2 * math.pi))
        for i, nid in enumerate(ids):
            ang = (2 * math.pi * i) / k - math.pi / 2   # start at the top
            set_center(nid, radius * math.cos(ang), radius * math.sin(ang))


_LAYOUTS = {
    "column": _layout_column, "row": _layout_row, "grid": _layout_grid,
    "tree": _layout_tree, "radial": _layout_radial,
}


# ── build ────────────────────────────────────────────────────────────────────
def build_canvas(spec: dict) -> cf.CanvasDoc:
    errors = validate_spec(spec)
    if errors:
        raise ValueError("invalid canvas spec:\n  " + "\n  ".join(errors))

    defaults = spec.get("defaults", {}) or {}
    default_w = float(defaults.get("card_width") or DEFAULT_CARD_W)
    default_color = str(defaults.get("card_color", "") or "")

    order = [n["id"] for n in spec["nodes"]]
    byid: dict[str, cf.CanvasNode] = {}
    for nspec in spec["nodes"]:
        kind = nspec.get("kind", "text")
        w, h = _size_node(nspec, default_w)
        node = cf.CanvasNode(
            id=cf.new_id(), type={"note": "file", "shape": "nv-shape"}.get(kind, "text"),
            width=w, height=h, color=str(nspec.get("color", "") or default_color))
        if kind == "note":
            node.file = str(nspec.get("file", ""))
        elif kind == "shape":
            node.text = (nspec.get("title", "") or "").strip()
            node.nv = {"shape": nspec.get("shape", "process")}
        else:
            node.text = _compose_text(nspec.get("title", ""), nspec.get("body", ""))
        byid[nspec["id"]] = node

    root = _pick_root(spec, spec["nodes"])
    layout = spec.get("layout", "radial")
    direction = spec.get("direction", "down")
    _LAYOUTS[layout](order=order, byid=byid, spec=spec, root=root, direction=direction)

    doc = cf.CanvasDoc(nodes=[byid[i] for i in order])
    for src, dst, label, directed in _edge_pairs(spec):
        s, t = byid[src], byid[dst]
        fs, ts = _sides_for(s, t)
        doc.edges.append(cf.CanvasEdge(
            id=cf.new_id(), fromNode=s.id, toNode=t.id,
            fromSide=fs, toSide=ts,
            fromEnd="none", toEnd="arrow" if directed else "none",
            label=str(label)))
    return doc


def write_canvas(path, spec: dict):
    """Compile ``spec`` and write it to ``path`` as a ``.canvas``. Returns path."""
    cf.dump(path, build_canvas(spec))
    return Path(path)


def create_map_in_vault(vault_root, rel_path: str, spec: dict):
    """Write a generated map inside a vault; the explorer picks it up on refresh."""
    out = Path(vault_root) / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    return write_canvas(out, spec)


def _main(argv: list[str]) -> int:  # pragma: no cover - CLI glue
    if len(argv) != 2:
        print("usage: python -m notevault_app.core.canvas_builder <spec.yaml> <out.canvas>")
        return 2
    spec = spec_from_yaml(Path(argv[0]).read_text(encoding="utf-8"))
    out = write_canvas(argv[1], spec)
    print(out)
    return 0


if __name__ == "__main__":  # pragma: no cover
    import sys
    raise SystemExit(_main(sys.argv[1:]))

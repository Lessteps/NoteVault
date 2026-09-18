"""
Read and write ``.canvas`` files.

The on-disk format is JSON and is a superset of Obsidian's canvas format, so a
canvas made here still opens in Obsidian and vice-versa. Obsidian ignores keys
it does not know, so every NoteVault-only feature (freehand drawings, flowchart
shapes, edge styling) is tucked under an ``"nv"`` object on the node or edge and
never breaks compatibility.

Standard node types (Obsidian):  ``text``, ``file``, ``link``, ``group``.
NoteVault extra node types:      ``nv-shape`` (flowchart shape),
                                 ``nv-drawing`` (freehand strokes).

A ``file`` node whose target is an image/audio/video is a media node; the media
kind is recorded under ``nv.media`` so the view knows to draw a player.
"""

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .attachments import fs_path

CANVAS_EXT = ".canvas"
CURRENT_VERSION = 1

# Obsidian's six canvas colours are stored as the strings "1".."6"; a node may
# also carry a literal "#rrggbb". Empty means "use the theme default".
STD_NODE_TYPES = ("text", "file", "link", "group")
NV_NODE_TYPES = ("nv-shape", "nv-drawing")

# Flowchart shapes commonly used in programming logic.
SHAPE_KINDS = (
    "start_end",        # terminator (rounded stadium)
    "process",          # rectangle
    "decision",         # diamond
    "io",               # parallelogram (input/output)
    "connector",        # small circle
    "predefined",       # subroutine (double-struck rectangle)
    "database",         # cylinder
    "manual_input",     # trapezoid
    "display",          # display / document
    "comment",          # annotation
)


def new_id() -> str:
    """A short, file-stable id, like the ones Obsidian generates."""
    return uuid.uuid4().hex[:16]


@dataclass
class CanvasNode:
    id: str
    type: str                       # one of STD_NODE_TYPES + NV_NODE_TYPES
    x: float = 0.0
    y: float = 0.0
    width: float = 250.0
    height: float = 60.0
    color: str = ""                 # "1".."6" or "#rrggbb" or ""
    # type-specific payloads (only the relevant one is set)
    file: str = ""                  # type=file: vault-relative path
    text: str = ""                  # type=text: markdown; nv-shape: label
    url: str = ""                   # type=link
    label: str = ""                 # type=group
    nv: dict = field(default_factory=dict)   # NoteVault extensions

    def to_dict(self) -> dict:
        d = {"id": self.id, "type": self.type,
             "x": round(self.x), "y": round(self.y),
             "width": round(self.width), "height": round(self.height)}
        if self.color:
            d["color"] = self.color
        if self.type == "file":
            d["file"] = self.file
        elif self.type == "text":
            d["text"] = self.text
        elif self.type == "link":
            d["url"] = self.url
        elif self.type == "group":
            if self.label:
                d["label"] = self.label
        else:                       # nv-shape / nv-drawing keep their text label
            if self.text:
                d["text"] = self.text
        if self.nv:
            d["nv"] = self.nv
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "CanvasNode":
        return cls(
            id=str(d.get("id") or new_id()),
            type=str(d.get("type") or "text"),
            x=float(d.get("x", 0)), y=float(d.get("y", 0)),
            width=float(d.get("width", 250)), height=float(d.get("height", 60)),
            color=str(d.get("color", "")),
            file=str(d.get("file", "")), text=str(d.get("text", "")),
            url=str(d.get("url", "")), label=str(d.get("label", "")),
            nv=dict(d.get("nv") or {}),
        )


@dataclass
class CanvasEdge:
    id: str
    fromNode: str
    toNode: str
    fromSide: str = "right"         # top|right|bottom|left
    toSide: str = "left"
    fromEnd: str = "none"           # none|arrow
    toEnd: str = "arrow"
    color: str = ""
    label: str = ""
    nv: dict = field(default_factory=dict)   # style: solid|dashed|dotted, routing

    def to_dict(self) -> dict:
        d = {"id": self.id,
             "fromNode": self.fromNode, "fromSide": self.fromSide,
             "toNode": self.toNode, "toSide": self.toSide}
        if self.fromEnd != "none":
            d["fromEnd"] = self.fromEnd
        if self.toEnd != "arrow":
            d["toEnd"] = self.toEnd
        if self.color:
            d["color"] = self.color
        if self.label:
            d["label"] = self.label
        if self.nv:
            d["nv"] = self.nv
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "CanvasEdge":
        return cls(
            id=str(d.get("id") or new_id()),
            fromNode=str(d.get("fromNode", "")), toNode=str(d.get("toNode", "")),
            fromSide=str(d.get("fromSide", "right")),
            toSide=str(d.get("toSide", "left")),
            fromEnd=str(d.get("fromEnd", "none")),
            toEnd=str(d.get("toEnd", "arrow")),
            color=str(d.get("color", "")), label=str(d.get("label", "")),
            nv=dict(d.get("nv") or {}),
        )


@dataclass
class CanvasDoc:
    nodes: list = field(default_factory=list)   # list[CanvasNode]
    edges: list = field(default_factory=list)   # list[CanvasEdge]

    def to_dict(self) -> dict:
        return {"nodes": [n.to_dict() for n in self.nodes],
                "edges": [e.to_dict() for e in self.edges]}

    @classmethod
    def from_dict(cls, d: dict) -> "CanvasDoc":
        d = d or {}
        return cls(
            nodes=[CanvasNode.from_dict(n) for n in (d.get("nodes") or [])],
            edges=[CanvasEdge.from_dict(e) for e in (d.get("edges") or [])],
        )

    def node_by_id(self, node_id: str) -> Optional[CanvasNode]:
        return next((n for n in self.nodes if n.id == node_id), None)


def load(path) -> CanvasDoc:
    """Read a ``.canvas`` file. A missing or empty/corrupt file reads as an
    empty canvas rather than raising, so a freshly created file just opens."""
    p = fs_path(path)
    try:
        raw = p.read_text(encoding="utf-8")
    except (OSError, ValueError):
        return CanvasDoc()
    if not raw.strip():
        return CanvasDoc()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return CanvasDoc()
    return CanvasDoc.from_dict(data)


def dump(path, doc: CanvasDoc):
    """Write a canvas atomically-ish (write then replace) with stable, indented
    JSON so a canvas produces small, reviewable diffs in git."""
    p = fs_path(path)
    text = json.dumps(doc.to_dict(), indent=2, ensure_ascii=False)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)


def create_empty(path):
    """Create a new, empty ``.canvas`` on disk if it does not already exist."""
    p = fs_path(path)
    if not p.exists():
        dump(path, CanvasDoc())
    return Path(path)

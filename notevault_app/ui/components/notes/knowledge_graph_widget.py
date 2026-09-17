"""
NoteVault Knowledge Graph Widget
Interactive QPainter canvas showing vault notes as nodes and their typed relationships as edges.
Supports pan (drag), zoom (scroll), subject/mastery filters, and click-to-open.
"""

import math
import random
from pathlib import Path
from typing import Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QComboBox,
    QFrame, QSizePolicy,
)
from PySide6.QtCore import Qt, Signal, QPointF, QRectF, QTimer, QThread, QObject
from PySide6.QtGui import QPainter, QPen, QColor, QFont, QBrush, QPainterPath

from ....core.knowledge_graph import KnowledgeGraph
from ..comun import TEXT, BORDER, TEXT_DIM, TEXT_FAINT, UI_FONT

ACCENT   = "#7c5af0"
BG_CANVAS = "#16161a"
GRID_CLR  = "#202028"

SUBJECT_COLORS = {
    "mathematics": "#38bdf8",
    "programming": "#4ade80",
    "english":     "#f59e0b",
    "general":     "#a78bfa",
}
EDGE_COLORS = {
    "prerequisite":  "#f2555a",
    "part_of":       "#facc15",
    "uses":          "#38bdf8",
    "applied_by":    "#4ade80",
    "practiced_by":  "#a78bfa",
    "common_error":  "#f87171",
    "related":       "#888895",
}
NODE_RADIUS = 12
REPULSION   = 8000.0
ATTRACTION  = 0.06
DAMPING     = 0.85
ITERATIONS  = 80
MAX_LAYOUT_NODES = 400  # beyond this the O(n²) layout is skipped for a grid


def _iterations_for(n: int) -> int:
    """The O(n²) layout cost is n² per pass — scale passes down as n grows."""
    if n <= 60:
        return 80
    if n <= 150:
        return 40
    if n <= 250:
        return 22
    return 12


def _grid_layout(ids: list[str]) -> dict[str, QPointF]:
    """Cheap deterministic grid — used when there are too many nodes to spring."""
    import math as _m
    cols = max(1, int(_m.ceil(_m.sqrt(len(ids)))))
    spacing = 70
    pos = {}
    for i, nid in enumerate(ids):
        r, c = divmod(i, cols)
        pos[nid] = QPointF(c * spacing, r * spacing)
    return pos


def _layout_nodes(nodes: list[dict], edges: list[dict]) -> dict[str, QPointF]:
    """Force-directed layout: repulsion + spring attraction.

    Iteration count scales down with node count, and very large graphs fall
    back to a grid so the UI thread is never blocked for seconds.
    """
    ids = [n["id"] for n in nodes]
    if not ids:
        return {}
    if len(ids) > MAX_LAYOUT_NODES:
        return _grid_layout(ids)

    iterations = _iterations_for(len(ids))
    rng = random.Random(42)
    # Plain float tuples in local lists are far cheaper than QPointF per op.
    px = {nid: rng.uniform(-300, 300) for nid in ids}
    py = {nid: rng.uniform(-300, 300) for nid in ids}
    vx = {nid: 0.0 for nid in ids}
    vy = {nid: 0.0 for nid in ids}
    id_set = set(ids)

    for _ in range(iterations):
        fx = {nid: 0.0 for nid in ids}
        fy = {nid: 0.0 for nid in ids}
        # Repulsion between all pairs
        for i, a in enumerate(ids):
            pax, pay = px[a], py[a]
            for b in ids[i + 1:]:
                dx = pax - px[b]
                dy = pay - py[b]
                dist2 = dx * dx + dy * dy or 1.0
                dist = math.sqrt(dist2)
                f = REPULSION / dist2
                ox, oy = f * dx / dist, f * dy / dist
                fx[a] += ox; fy[a] += oy
                fx[b] -= ox; fy[b] -= oy
        # Attraction along edges
        for e in edges:
            s, t = e.get("source"), e.get("target")
            if s in id_set and t in id_set:
                dx = px[t] - px[s]
                dy = py[t] - py[s]
                fx[s] += dx * ATTRACTION; fy[s] += dy * ATTRACTION
                fx[t] -= dx * ATTRACTION; fy[t] -= dy * ATTRACTION
        # Update positions
        for nid in ids:
            vx[nid] = (vx[nid] + fx[nid]) * DAMPING
            vy[nid] = (vy[nid] + fy[nid]) * DAMPING
            px[nid] += vx[nid]
            py[nid] += vy[nid]
    return {nid: QPointF(px[nid], py[nid]) for nid in ids}


class _GraphCanvas(QWidget):
    node_clicked = Signal(str)  # emits node id (note path)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(300, 300)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setMouseTracking(True)

        self._nodes: list[dict] = []
        self._edges: list[dict] = []
        self._pos: dict[str, QPointF] = {}

        self._pan_offset = QPointF(0, 0)
        self._scale = 1.0
        self._dragging = False
        self._last_mouse = QPointF()
        self._hovered: Optional[str] = None
        self._subject_filter = "all"
        self._min_mastery = 0.0

    def load(self, nodes: list[dict], edges: list[dict],
             pos: Optional[dict[str, QPointF]] = None):
        self._nodes = nodes
        self._edges = edges
        self._pos = pos if pos is not None else _layout_nodes(nodes, edges)
        # Center the layout
        if self._pos:
            cx = sum(p.x() for p in self._pos.values()) / len(self._pos)
            cy = sum(p.y() for p in self._pos.values()) / len(self._pos)
            for k in self._pos:
                self._pos[k] -= QPointF(cx, cy)
        self.update()

    def set_subject_filter(self, subj: str):
        self._subject_filter = subj
        self.update()

    def set_min_mastery(self, val: float):
        self._min_mastery = val
        self.update()

    def _visible_nodes(self) -> list[dict]:
        out = []
        for n in self._nodes:
            if self._subject_filter != "all" and n.get("subject") != self._subject_filter:
                continue
            if n.get("mastery", 0.0) < self._min_mastery:
                continue
            out.append(n)
        return out

    def _world_to_screen(self, p: QPointF) -> QPointF:
        cx, cy = self.width() / 2, self.height() / 2
        return QPointF(
            cx + (p.x() + self._pan_offset.x()) * self._scale,
            cy + (p.y() + self._pan_offset.y()) * self._scale,
        )

    def _screen_to_world(self, p: QPointF) -> QPointF:
        cx, cy = self.width() / 2, self.height() / 2
        return QPointF(
            (p.x() - cx) / self._scale - self._pan_offset.x(),
            (p.y() - cy) / self._scale - self._pan_offset.y(),
        )

    def paintEvent(self, _event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.fillRect(self.rect(), QColor(BG_CANVAS))

        visible_ids = {n["id"] for n in self._visible_nodes()}

        # Draw edges first
        for edge in self._edges:
            s, t = edge.get("source"), edge.get("target")
            if s not in visible_ids or t not in visible_ids:
                continue
            if s not in self._pos or t not in self._pos:
                continue
            sp = self._world_to_screen(self._pos[s])
            tp = self._world_to_screen(self._pos[t])
            rel = edge.get("relation_type", "related")
            color = EDGE_COLORS.get(rel, "#555566")
            pen = QPen(QColor(color), 1.4)
            if rel in ("prerequisite", "part_of"):
                pen.setStyle(Qt.DashLine)
            painter.setPen(pen)
            painter.drawLine(sp, tp)
            # Arrowhead
            dx, dy = tp.x() - sp.x(), tp.y() - sp.y()
            dist = math.hypot(dx, dy) or 1
            ex, ey = dx / dist, dy / dist
            ax, ay = tp.x() - ex * NODE_RADIUS * self._scale, tp.y() - ey * NODE_RADIUS * self._scale
            perp_x, perp_y = -ey * 5, ex * 5
            path = QPainterPath()
            path.moveTo(ax, ay)
            path.lineTo(ax - ex * 8 + perp_x, ay - ey * 8 + perp_y)
            path.lineTo(ax - ex * 8 - perp_x, ay - ey * 8 - perp_y)
            path.closeSubpath()
            painter.fillPath(path, QColor(color))

        # Draw nodes
        font = QFont(UI_FONT, max(7, int(9 * self._scale)))
        painter.setFont(font)
        r = max(6, int(NODE_RADIUS * self._scale))

        for node in self._visible_nodes():
            nid = node["id"]
            if nid not in self._pos:
                continue
            sp = self._world_to_screen(self._pos[nid])
            subj = node.get("subject", "general")
            base_color = SUBJECT_COLORS.get(subj, "#a78bfa")
            is_hovered = nid == self._hovered
            mastery = node.get("mastery", 0.0)
            alpha = 180 + int(75 * mastery)

            c = QColor(base_color)
            c.setAlpha(alpha)
            painter.setBrush(QBrush(c))
            border_color = QColor(base_color) if not is_hovered else QColor("#ffffff")
            painter.setPen(QPen(border_color, 2 if is_hovered else 1))
            painter.drawEllipse(QPointF(sp.x(), sp.y()), r, r)

            # Mastery ring
            if mastery > 0:
                painter.setPen(QPen(QColor(base_color), 2))
                painter.setBrush(Qt.NoBrush)
                span = int(mastery * 360 * 16)
                painter.drawArc(
                    QRectF(sp.x() - r - 3, sp.y() - r - 3, (r + 3) * 2, (r + 3) * 2),
                    90 * 16, -span,
                )

            # Label (only if scale >= 0.7)
            if self._scale >= 0.7:
                title = node.get("title", "")
                if len(title) > 18:
                    title = title[:15] + "…"
                painter.setPen(QColor(TEXT if is_hovered else TEXT_DIM))
                painter.drawText(
                    QRectF(sp.x() - 60, sp.y() + r + 2, 120, 16),
                    Qt.AlignCenter, title,
                )

        painter.end()

    def _node_at(self, screen_pos: QPointF) -> Optional[str]:
        r = max(6, int(NODE_RADIUS * self._scale)) + 4
        visible_ids = {n["id"] for n in self._visible_nodes()}
        for nid, wp in self._pos.items():
            if nid not in visible_ids:
                continue
            sp = self._world_to_screen(wp)
            if math.hypot(screen_pos.x() - sp.x(), screen_pos.y() - sp.y()) <= r:
                return nid
        return None

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            nid = self._node_at(QPointF(event.position()))
            if nid:
                self.node_clicked.emit(nid)
            else:
                self._dragging = True
                self._last_mouse = QPointF(event.position())

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._dragging = False

    def mouseMoveEvent(self, event):
        pos = QPointF(event.position())
        if self._dragging:
            delta = pos - self._last_mouse
            self._pan_offset += delta / self._scale
            self._last_mouse = pos
            self.update()
        else:
            hovered = self._node_at(pos)
            if hovered != self._hovered:
                self._hovered = hovered
                self.setCursor(Qt.PointingHandCursor if hovered else Qt.ArrowCursor)
                self.update()

    def wheelEvent(self, event):
        factor = 1.12 if event.angleDelta().y() > 0 else 1 / 1.12
        self._scale = max(0.15, min(4.0, self._scale * factor))
        self.update()

    def reset_view(self):
        self._pan_offset = QPointF(0, 0)
        self._scale = 1.0
        self.update()


class _GraphBuildWorker(QObject):
    """Builds the graph and its layout off the UI thread."""
    done = Signal(list, list, dict)   # nodes, edges, pos
    failed = Signal(str)

    def __init__(self, kg: KnowledgeGraph):
        super().__init__()
        self._kg = kg

    def run(self):
        try:
            graph = self._kg.build_graph()
            nodes = graph.get("nodes", [])
            edges = graph.get("edges", [])
            pos = _layout_nodes(nodes, edges)
            self.done.emit(nodes, edges, pos)
        except Exception as exc:  # noqa: BLE001 — surfaced to the status label
            self.failed.emit(str(exc))


class KnowledgeGraphWidget(QWidget):
    """Sidebar-embeddable panel for the interactive knowledge graph."""

    open_note_requested = Signal(str)  # note id (vault-relative posix path)

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.vault_root = vault_root
        self._kg = KnowledgeGraph(vault_root)
        self._loaded = False
        self._building = False
        self._thread = None
        self._worker = None
        self._init_ui()
        # Lazy: the graph is only built the first time the tab is opened, never
        # at startup — scanning the whole vault + layout must not block launch.

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Toolbar ─────────────────────────────────────────────────────────
        bar = QFrame()
        bar.setFixedHeight(34)
        bar.setStyleSheet(
            f"QFrame{{background:#202024;border-bottom:1px solid {BORDER};}}"
        )
        bar_lay = QHBoxLayout(bar)
        bar_lay.setContentsMargins(8, 0, 8, 0)
        bar_lay.setSpacing(6)

        lbl = QLabel("Grafo")
        lbl.setStyleSheet(f"color:{TEXT};font-size:11px;font-weight:bold;background:transparent;")
        bar_lay.addWidget(lbl)

        self._subj_combo = QComboBox()
        self._subj_combo.addItems(["Todos", "Matemáticas", "Programación", "Inglés", "General"])
        self._subj_combo.setFixedWidth(110)
        self._subj_combo.setStyleSheet(
            f"QComboBox{{background:#2a2a32;border:1px solid {BORDER};border-radius:4px;"
            f"color:{TEXT};font-size:10px;padding:2px 4px;}}"
            f"QComboBox::drop-down{{border:none;}}"
            f"QComboBox QAbstractItemView{{background:#222228;color:{TEXT};border:1px solid {BORDER};}}"
        )
        self._subj_combo.currentIndexChanged.connect(self._on_filter_changed)
        bar_lay.addWidget(self._subj_combo)

        bar_lay.addStretch()

        btn_style = (
            f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:4px;"
            f"color:{TEXT_DIM};font-size:11px;padding:2px 6px;}}"
            f"QPushButton:hover{{background:#2a2a34;color:{TEXT};}}"
        )
        self._btn_reload = QPushButton("↺")
        self._btn_reload.setToolTip("Recargar grafo")
        self._btn_reload.setFixedWidth(28)
        self._btn_reload.setStyleSheet(btn_style)
        self._btn_reload.clicked.connect(self.reload)
        bar_lay.addWidget(self._btn_reload)

        self._btn_reset = QPushButton("⊞")
        self._btn_reset.setToolTip("Centrar vista")
        self._btn_reset.setFixedWidth(28)
        self._btn_reset.setStyleSheet(btn_style)
        self._btn_reset.clicked.connect(self._canvas.reset_view if hasattr(self, "_canvas") else lambda: None)
        bar_lay.addWidget(self._btn_reset)

        root.addWidget(bar)

        # ── Canvas ───────────────────────────────────────────────────────────
        self._canvas = _GraphCanvas(self)
        self._canvas.node_clicked.connect(self.open_note_requested)
        root.addWidget(self._canvas, stretch=1)

        # Fix reset button now that canvas exists
        self._btn_reset.clicked.disconnect()
        self._btn_reset.clicked.connect(self._canvas.reset_view)

        # ── Legend ───────────────────────────────────────────────────────────
        legend = QFrame()
        legend.setFixedHeight(28)
        legend.setStyleSheet(f"QFrame{{background:#1a1a1e;border-top:1px solid {BORDER};}}")
        leg_lay = QHBoxLayout(legend)
        leg_lay.setContentsMargins(8, 0, 8, 0)
        leg_lay.setSpacing(10)
        for subj, color in SUBJECT_COLORS.items():
            dot = QLabel(f"● {subj[:3].capitalize()}")
            dot.setStyleSheet(f"color:{color};font-size:10px;background:transparent;")
            leg_lay.addWidget(dot)
        leg_lay.addStretch()
        root.addWidget(legend)

        # ── Status bar ───────────────────────────────────────────────────────
        self._status = QLabel("Cargando grafo…")
        self._status.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:9px;background:#1a1a1e;padding:2px 8px;"
        )
        self._status.setFixedHeight(18)
        root.addWidget(self._status)

    def ensure_loaded(self):
        """Build the graph once, on first view. Cheap no-op afterwards."""
        if not self._loaded and not self._building:
            self.reload()

    def reload(self):
        if self._building:
            return
        self._building = True
        self._btn_reload.setEnabled(False)
        self._status.setText("Indexando vault… (en segundo plano)")

        self._thread = QThread(self)
        self._worker = _GraphBuildWorker(self._kg)
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.done.connect(self._on_build_done)
        self._worker.failed.connect(self._on_build_failed)
        # Tear the thread down once either signal has been handled.
        self._worker.done.connect(self._thread.quit)
        self._worker.failed.connect(self._thread.quit)
        self._thread.finished.connect(self._worker.deleteLater)
        self._thread.start()

    def _on_build_done(self, nodes, edges, pos):
        self._canvas.load(nodes, edges, pos)
        self._loaded = True
        self._building = False
        self._btn_reload.setEnabled(True)
        n, e = len(nodes), len(edges)
        extra = "  (layout en cuadrícula)" if n > MAX_LAYOUT_NODES else ""
        self._status.setText(
            f"{n} nodos · {e} aristas — arrastra para mover, scroll para zoom{extra}"
        )

    def _on_build_failed(self, msg: str):
        self._loaded = True
        self._building = False
        self._btn_reload.setEnabled(True)
        self._status.setText(f"Error: {msg}")

    def _on_filter_changed(self, idx: int):
        mapping = ["all", "mathematics", "programming", "english", "general"]
        self._canvas.set_subject_filter(mapping[idx] if idx < len(mapping) else "all")

    def set_vault(self, vault_root: Path):
        self.vault_root = vault_root
        self._kg = KnowledgeGraph(vault_root)
        # Invalidate; rebuild lazily next time the tab is shown.
        self._loaded = False

"""Graphics items for the canvas board.

Every node is a :class:`BaseNodeItem` backed by a ``CanvasNode`` from the file
model, so moving or resizing an item is what gets written back to disk. Nodes
are movable and resizable (a grip in the bottom-right corner), and a text node
is editable in place on double-click, the way Obsidian's canvas works.
"""

import re
from pathlib import Path

from PySide6.QtWidgets import (
    QGraphicsObject, QGraphicsTextItem, QGraphicsProxyWidget, QTextEdit, QStyle,
    QWidget, QHBoxLayout, QPushButton, QSlider, QLabel, QInputDialog,
)
from PySide6.QtCore import Qt, QRectF, QPointF, QTimer, QUrl, Signal
from PySide6.QtGui import (
    QColor, QPen, QBrush, QFont, QPainterPath, QPixmap, QTextOption,
    QDesktopServices
)

from .....core import attachments
from .shapes import shape_path, shape_internal_paths
from .drawing import stroke_to_path, hit_test_stroke

try:
    from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput
    from PySide6.QtMultimediaWidgets import QGraphicsVideoItem
    _HAS_MEDIA = True
except Exception:                       # pragma: no cover - multimedia missing
    _HAS_MEDIA = False

# Same frontmatter block the markdown editor uses; kept verbatim on save.
_FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.S)


def _split_frontmatter(text: str):
    m = _FRONTMATTER_RE.match(text or "")
    if not m:
        return "", text or ""
    return m.group(0), (text or "")[m.end():]

# Palette (dark), matching the rest of the notes module.
BG_NODE   = QColor("#26262c")
BORDER    = QColor("#3a3a46")
BORDER_SEL = QColor("#7c5af0")
TEXT      = QColor("#dcdde0")
GRIP      = QColor("#7c5af0")

# Obsidian's six canvas colours, plus our default.
CANVAS_COLORS = {
    "":  QColor("#3a3a46"),
    "1": QColor("#e05252"),   # red
    "2": QColor("#e0a052"),   # orange
    "3": QColor("#e0d052"),   # yellow
    "4": QColor("#52e079"),   # green
    "5": QColor("#52c7e0"),   # cyan
    "6": QColor("#a052e0"),   # purple
}

GRIP_SIZE = 14.0
MIN_W, MIN_H = 80.0, 40.0


PORT_RADIUS = 5.0


def color_for(token: str) -> QColor:
    if token in CANVAS_COLORS:
        return CANVAS_COLORS[token]
    if token.startswith("#"):
        c = QColor(token)
        if c.isValid():
            return c
    return CANVAS_COLORS[""]


class BaseNodeItem(QGraphicsObject):
    """A movable, resizable card on the board, backed by a CanvasNode."""

    geometry_changed = Signal()      # moved or resized: view saves + reroutes edges
    edited = Signal()                # payload (text/etc.) changed
    connection_drag_started = Signal(object, str, object)  # (item, side, scene_pos)

    def __init__(self, node, parent=None):
        super().__init__(parent)
        self.node = node
        self._resizing = False
        self._hovered = False
        self._press_local = QPointF()
        self._press_size = (node.width, node.height)
        is_locked = bool((node.nv or {}).get("locked", False))
        self.setFlag(QGraphicsObject.ItemIsMovable, not is_locked)
        self.setFlag(QGraphicsObject.ItemIsSelectable, True)
        self.setFlag(QGraphicsObject.ItemSendsGeometryChanges, True)
        self.setPos(node.x, node.y)
        self.setAcceptHoverEvents(True)

    @property
    def is_locked(self) -> bool:
        return bool((self.node.nv or {}).get("locked", False))

    def set_locked(self, locked: bool):
        if self.node.nv is None:
            self.node.nv = {}
        self.node.nv["locked"] = locked
        self.setFlag(QGraphicsObject.ItemIsMovable, not locked)
        self.update()
        self.edited.emit()

    # geometry ---------------------------------------------------------------
    def boundingRect(self) -> QRectF:
        return QRectF(-6, -6, self.node.width + 12, self.node.height + 12)

    def _node_rect(self) -> QRectF:
        return QRectF(0, 0, self.node.width, self.node.height)

    def _grip_rect(self) -> QRectF:
        return QRectF(self.node.width - GRIP_SIZE, self.node.height - GRIP_SIZE,
                      GRIP_SIZE, GRIP_SIZE)

    # painting ---------------------------------------------------------------
    def paint(self, painter, option, widget=None):
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        rect = self._node_rect().adjusted(0.5, 0.5, -0.5, -0.5)
        painter.setBrush(QBrush(BG_NODE))
        selected = bool(option.state & QStyle.State_Selected)
        pen = QPen(BORDER_SEL if selected else color_for(self.node.color),
                   2.0 if selected else 1.4)
        painter.setPen(pen)
        painter.drawRoundedRect(rect, 8, 8)
        self.paint_content(painter, rect)
        if selected:
            painter.setBrush(QBrush(GRIP))
            painter.setPen(Qt.NoPen)
            g = self._grip_rect()
            painter.drawRoundedRect(g.adjusted(3, 3, -1, -1), 2, 2)
        if selected or self._hovered:
            self._draw_ports(painter)

    def _draw_ports(self, painter):
        w, h = self.node.width, self.node.height
        ports = [
            QPointF(w / 2, 0),
            QPointF(w / 2, h),
            QPointF(0, h / 2),
            QPointF(w, h / 2),
        ]
        painter.setPen(QPen(QColor("#ffffff"), 1.2))
        painter.setBrush(QBrush(QColor("#7c5af0")))
        for pt in ports:
            painter.drawEllipse(pt, PORT_RADIUS, PORT_RADIUS)

    def port_at(self, local_pos: QPointF, threshold: float = 12.0) -> str:
        w, h = self.node.width, self.node.height
        ports = {
            "top": QPointF(w / 2, 0),
            "bottom": QPointF(w / 2, h),
            "left": QPointF(0, h / 2),
            "right": QPointF(w, h / 2),
        }
        for side, pt in ports.items():
            dx = local_pos.x() - pt.x()
            dy = local_pos.y() - pt.y()
            if (dx * dx + dy * dy) <= (threshold * threshold):
                return side
        return ""

    def paint_content(self, painter, rect):
        """Overridden by subclasses; base draws nothing."""

    # mouse ------------------------------------------------------------------
    def hoverEnterEvent(self, event):
        self._hovered = True
        self.update()
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self._hovered = False
        self.setCursor(Qt.ArrowCursor)
        self.update()
        super().hoverLeaveEvent(event)

    def hoverMoveEvent(self, event):
        if self.port_at(event.pos()):
            self.setCursor(Qt.CrossCursor)
        elif self.isSelected() and self._grip_rect().contains(event.pos()):
            self.setCursor(Qt.SizeFDiagCursor)
        else:
            self.setCursor(Qt.ArrowCursor)
        super().hoverMoveEvent(event)

    def mousePressEvent(self, event):
        if self.is_locked:
            super().mousePressEvent(event)
            return
        if event.button() == Qt.LeftButton:
            side = self.port_at(event.pos())
            if side:
                self.connection_drag_started.emit(self, side, event.scenePos())
                event.accept()
                return
            if self._grip_rect().contains(event.pos()):
                self._resizing = True
                self._press_local = event.scenePos()
                self._press_size = (self.node.width, self.node.height)
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._resizing:
            delta = event.scenePos() - self._press_local
            w = max(MIN_W, self._press_size[0] + delta.x())
            h = max(MIN_H, self._press_size[1] + delta.y())
            view = self.scene().views()[0] if self.scene() and self.scene().views() else None
            if view and getattr(view, "_snap_to_grid", False):
                w = max(MIN_W, round(w / 20.0) * 20.0)
                h = max(MIN_H, round(h / 20.0) * 20.0)
            self.prepareGeometryChange()
            self.node.width, self.node.height = w, h
            self.update()
            self.geometry_changed.emit()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self._resizing:
            self._resizing = False
            self.node.width = float(self.node.width)
            self.node.height = float(self.node.height)
            self.geometry_changed.emit()
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def itemChange(self, change, value):
        if change == QGraphicsObject.ItemPositionChange and self.scene():
            view = self.scene().views()[0] if self.scene().views() else None
            if view and getattr(view, "_snap_to_grid", False):
                new_pos = value
                snapped_x = round(new_pos.x() / 20.0) * 20.0
                snapped_y = round(new_pos.y() / 20.0) * 20.0
                return QPointF(snapped_x, snapped_y)
        if change == QGraphicsObject.ItemPositionHasChanged:
            self.node.x = float(self.pos().x())
            self.node.y = float(self.pos().y())
            self.geometry_changed.emit()
        return super().itemChange(change, value)

    # anchor points for edges (top/right/bottom/left midpoints, in scene coords)
    def side_point(self, side: str) -> QPointF:
        w, h = self.node.width, self.node.height
        local = {"top": QPointF(w / 2, 0), "bottom": QPointF(w / 2, h),
                 "left": QPointF(0, h / 2), "right": QPointF(w, h / 2)}.get(
                     side, QPointF(w / 2, h / 2))
        return self.mapToScene(local)


class TextNodeItem(BaseNodeItem):
    """A free markdown/text card. Double-click edits in place."""

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self._text = QGraphicsTextItem(self)
        self._text.setDefaultTextColor(TEXT)
        self._text.setFont(QFont("Segoe UI", 10))
        self._text.setPlainText(node.text or "")
        self._text.setTextWidth(node.width - 20)
        self._text.setPos(10, 8)
        self._editing = False

    def paint_content(self, painter, rect):
        self._text.setTextWidth(self.node.width - 20)

    def mouseDoubleClickEvent(self, event):
        self._begin_edit()
        event.accept()

    def _begin_edit(self):
        self._editing = True
        self._text.setTextInteractionFlags(Qt.TextEditorInteraction)
        self._text.setFocus(Qt.MouseFocusReason)
        cursor = self._text.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        self._text.setTextCursor(cursor)
        # commit when focus leaves the editor
        self._text.focusOutEvent = self._wrap_focus_out(self._text.focusOutEvent)

    def _wrap_focus_out(self, original):
        def handler(ev):
            self._end_edit()
            original(ev)
        return handler

    def _end_edit(self):
        if not self._editing:
            return
        self._editing = False
        self._text.setTextInteractionFlags(Qt.NoTextInteraction)
        new_text = self._text.toPlainText()
        if new_text != self.node.text:
            self.node.text = new_text
            self.edited.emit()


class ShapeNodeItem(BaseNodeItem):
    """A flowchart shape card (start/end, decision, process, io, etc.)."""

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self._text = QGraphicsTextItem(self)
        self._text.setDefaultTextColor(TEXT)
        self._text.setFont(QFont("Segoe UI", 10))
        opt = QTextOption(Qt.AlignCenter)
        self._text.document().setDefaultTextOption(opt)
        self._text.setPlainText(node.text or "")
        self._editing = False
        self._position_text()

    def _position_text(self):
        w, h = self.node.width, self.node.height
        tw = max(20.0, w - 24.0)
        self._text.setTextWidth(tw)
        th = self._text.boundingRect().height()
        ty = max(2.0, (h - th) / 2.0)
        self._text.setPos(12.0, ty)

    def paint(self, painter, option, widget=None):
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        w, h = self.node.width, self.node.height
        kind = (self.node.nv or {}).get("shape", "process")
        path = shape_path(kind, w, h)
        selected = bool(option.state & QStyle.State_Selected)

        # Background and border
        painter.setBrush(QBrush(BG_NODE))
        pen_col = BORDER_SEL if selected else color_for(self.node.color)
        pen = QPen(pen_col, 2.0 if selected else 1.5)
        painter.setPen(pen)
        painter.drawPath(path)

        # Decorative internal lines
        for ip in shape_internal_paths(kind, w, h):
            painter.drawPath(ip)

        self._position_text()

        if selected:
            painter.setBrush(QBrush(GRIP))
            painter.setPen(Qt.NoPen)
            g = self._grip_rect()
            painter.drawRoundedRect(g.adjusted(3, 3, -1, -1), 2, 2)
        if selected or self._hovered:
            self._draw_ports(painter)

    def mouseDoubleClickEvent(self, event):
        self._begin_edit()
        event.accept()

    def _begin_edit(self):
        self._editing = True
        self._text.setTextInteractionFlags(Qt.TextEditorInteraction)
        self._text.setFocus(Qt.MouseFocusReason)
        cursor = self._text.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        self._text.setTextCursor(cursor)
        self._text.focusOutEvent = self._wrap_focus_out(self._text.focusOutEvent)

    def _wrap_focus_out(self, original):
        def handler(ev):
            self._end_edit()
            original(ev)
        return handler

    def _end_edit(self):
        if not self._editing:
            return
        self._editing = False
        self._text.setTextInteractionFlags(Qt.NoTextInteraction)
        new_text = self._text.toPlainText()
        if new_text != self.node.text:
            self.node.text = new_text
            self.edited.emit()


class DrawingNodeItem(BaseNodeItem):
    """A freehand drawing card containing vector pen strokes."""

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        if self.node.nv is None:
            self.node.nv = {}
        if "strokes" not in self.node.nv:
            self.node.nv["strokes"] = []

    def paint(self, painter, option, widget=None):
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        selected = bool(option.state & QStyle.State_Selected)

        if selected:
            rect = self._node_rect().adjusted(0.5, 0.5, -0.5, -0.5)
            pen = QPen(BORDER_SEL, 1.2, Qt.DashLine)
            painter.setPen(pen)
            painter.setBrush(Qt.NoBrush)
            painter.drawRoundedRect(rect, 4, 4)

        strokes = (self.node.nv or {}).get("strokes", [])
        for stroke in strokes:
            pts = stroke.get("points", [])
            if not pts:
                continue
            col_tok = stroke.get("color", "1")
            col = color_for(col_tok)
            w = float(stroke.get("width", 3.0))
            pen = QPen(col, w, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin)
            painter.setPen(pen)
            painter.setBrush(Qt.NoBrush)
            path = stroke_to_path(pts)
            painter.drawPath(path)

        if selected:
            painter.setBrush(QBrush(GRIP))
            painter.setPen(Qt.NoPen)
            g = self._grip_rect()
            painter.drawRoundedRect(g.adjusted(3, 3, -1, -1), 2, 2)
        if selected or self._hovered:
            self._draw_ports(painter)

    def add_stroke(self, stroke: dict):
        if self.node.nv is None:
            self.node.nv = {}
        if "strokes" not in self.node.nv:
            self.node.nv["strokes"] = []
        self.node.nv["strokes"].append(stroke)
        self.update()
        self.edited.emit()

    def remove_stroke_at(self, local_point: QPointF) -> bool:
        strokes = (self.node.nv or {}).get("strokes", [])
        for i in reversed(range(len(strokes))):
            if hit_test_stroke(strokes[i], local_point):
                strokes.pop(i)
                self.update()
                self.edited.emit()
                return True
        return False


class GroupNodeItem(BaseNodeItem):
    """A container card with a title that groups and moves nodes inside it."""

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self.setZValue(-2)
        self._text = QGraphicsTextItem(self)
        self._text.setDefaultTextColor(QColor("#a6a8b1"))
        self._text.setFont(QFont("Segoe UI", 11, QFont.Bold))
        self._text.setPlainText(node.label or "Grupo")
        self._text.setPos(12, 6)
        self._drag_start_pos = QPointF()
        self._dragged_children = []

    def paint(self, painter, option, widget=None):
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        rect = self._node_rect().adjusted(0.5, 0.5, -0.5, -0.5)
        group_col = color_for(self.node.color) if self.node.color else QColor("#1e1e24")
        bg = QColor(group_col)
        bg.setAlpha(40)
        painter.setBrush(QBrush(bg))
        selected = bool(option.state & QStyle.State_Selected)
        border_col = BORDER_SEL if selected else (color_for(self.node.color) if self.node.color else QColor("#444452"))
        pen = QPen(border_col, 1.8 if selected else 1.2, Qt.DashLine if not selected else Qt.SolidLine)
        painter.setPen(pen)
        painter.drawRoundedRect(rect, 10, 10)

        self._text.setPlainText(self.node.label or "Grupo")

        if selected:
            painter.setBrush(QBrush(GRIP))
            painter.setPen(Qt.NoPen)
            g = self._grip_rect()
            painter.drawRoundedRect(g.adjusted(3, 3, -1, -1), 2, 2)
        if selected or self._hovered:
            self._draw_ports(painter)

    def mouseDoubleClickEvent(self, event):
        if event.pos().y() <= 36:
            self._edit_label()
            event.accept()
            return
        super().mouseDoubleClickEvent(event)

    def _edit_label(self):
        text, ok = QInputDialog.getText(
            None, "Etiqueta del grupo", "Nombre del grupo:",
            text=self.node.label or "Grupo"
        )
        if ok:
            self.node.label = text.strip()
            self._text.setPlainText(self.node.label)
            self.update()
            self.edited.emit()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton and not self._resizing and not self.is_locked:
            self._drag_start_pos = self.pos()
            self._dragged_children = []
            if self.scene():
                group_scene_rect = self.mapRectToScene(self._node_rect())
                for item in self.scene().items(group_scene_rect, Qt.IntersectsItemBoundingRect):
                    if isinstance(item, BaseNodeItem) and item != self and not isinstance(item, GroupNodeItem):
                        if not item.isSelected():
                            self._dragged_children.append((item, item.pos() - self.pos()))
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if self._dragged_children and not self._resizing and not self.is_locked:
            for child, rel_offset in self._dragged_children:
                child.setPos(self.pos() + rel_offset)


class LinkNodeItem(BaseNodeItem):
    """A card linking to an external website with an open button."""

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self._proxy = None
        self._build_ui()

    def _build_ui(self):
        widget = QWidget()
        widget.setStyleSheet("background:transparent;")
        lay = QHBoxLayout(widget)
        lay.setContentsMargins(12, 8, 12, 8)
        lay.setSpacing(10)

        icon_lbl = QLabel("🔗")
        icon_lbl.setStyleSheet("font-size:18px;color:#7c5af0;")
        lay.addWidget(icon_lbl)

        url_lbl = QLabel(self.node.url or "https://")
        url_lbl.setStyleSheet("color:#dcdde0;font-size:11px;font-family:'Segoe UI';")
        url_lbl.setWordWrap(True)
        lay.addWidget(url_lbl, 1)

        btn = QPushButton("Abrir ↗")
        btn.setCursor(Qt.PointingHandCursor)
        btn.setStyleSheet(
            "QPushButton{background:#3a3a46;color:#ffffff;border:none;"
            "padding:4px 10px;border-radius:4px;font-size:11px;}"
            "QPushButton:hover{background:#7c5af0;}"
        )
        btn.clicked.connect(self._open_url)
        lay.addWidget(btn)

        self._proxy = QGraphicsProxyWidget(self)
        self._proxy.setWidget(widget)
        self._proxy.setGeometry(QRectF(0, 0, self.node.width, self.node.height))

    def _open_url(self):
        url = (self.node.url or "").strip()
        if url:
            if not (url.startswith("http://") or url.startswith("https://")):
                url = "https://" + url
            QDesktopServices.openUrl(QUrl(url))

    def paint_content(self, painter, rect):
        if self._proxy:
            self._proxy.setGeometry(QRectF(0, 0, self.node.width, self.node.height))

    def mouseDoubleClickEvent(self, event):
        url, ok = QInputDialog.getText(
            None, "Editar enlace", "URL del enlace:", text=self.node.url or "https://"
        )
        if ok and url.strip():
            self.node.url = url.strip()
            if self._proxy:
                self._proxy.deleteLater()
            self._build_ui()
            self.update()
            self.edited.emit()
        event.accept()


HEADER_H = 26.0


class NoteNodeItem(BaseNodeItem):
    """A vault note embedded in the board. The title bar is the drag handle
    and opens the full note; the body is a live editor that writes straight
    back to the .md file, so a note can be modified from the canvas."""

    open_requested = Signal(object)   # absolute Path of the note

    def __init__(self, node, abs_path, service=None, parent=None):
        super().__init__(parent=parent, node=node)
        self.abs_path = Path(abs_path)
        self.service = service
        self._frontmatter = ""

        self._editor = QTextEdit()
        self._editor.setObjectName("canvasNoteEditor")
        self._editor.setFrameShape(QTextEdit.NoFrame)
        self._editor.setStyleSheet(
            "QTextEdit{background:transparent;border:none;color:#dcdde0;"
            "font-family:'Segoe UI';font-size:13px;}")
        self._proxy = QGraphicsProxyWidget(self)
        self._proxy.setWidget(self._editor)

        self._save_timer = QTimer()
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(700)
        self._save_timer.timeout.connect(self._save_body)
        self._editor.textChanged.connect(self._save_timer.start)

        self._load_file()
        self._layout_proxy()

    # ── file I/O ────────────────────────────────────────────────────────
    def title(self) -> str:
        return self.abs_path.stem

    def _load_file(self):
        try:
            raw = attachments.fs_path(self.abs_path).read_text(
                encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            raw = ""
        self._frontmatter, body = _split_frontmatter(raw)
        self._editor.blockSignals(True)
        self._editor.setPlainText(body)
        self._editor.blockSignals(False)

    def _save_body(self):
        body = self._editor.toPlainText()
        if body and not body.endswith("\n"):
            body += "\n"
        text = self._frontmatter + body
        try:
            attachments.fs_path(self.abs_path).write_text(text, encoding="utf-8")
        except (OSError, ValueError):
            return
        if self.service is not None:
            try:
                self.service.note_written(self.abs_path, text)
            except Exception:
                pass

    def flush(self):
        if self._save_timer.isActive():
            self._save_timer.stop()
            self._save_body()

    # ── layout ──────────────────────────────────────────────────────────
    def _layout_proxy(self):
        w = max(MIN_W, self.node.width)
        h = max(MIN_H, self.node.height)
        self._proxy.setPos(6, HEADER_H)
        self._editor.setFixedSize(int(w - 12), int(h - HEADER_H - GRIP_SIZE))

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if self._resizing:
            self._layout_proxy()

    def mouseReleaseEvent(self, event):
        super().mouseReleaseEvent(event)
        self._layout_proxy()

    # ── painting ────────────────────────────────────────────────────────
    def paint_content(self, painter, rect):
        # Title bar background + title text.
        painter.save()
        header = QRectF(rect.left(), rect.top(), rect.width(), HEADER_H)
        path = QPainterPath()
        path.addRoundedRect(header, 8, 8)
        painter.setClipPath(path)
        painter.fillRect(header, QColor("#2f2f38"))
        painter.restore()
        painter.setPen(QPen(color_for(self.node.color)))
        f = QFont("Segoe UI", 9)
        f.setBold(True)
        painter.setFont(f)
        painter.drawText(header.adjusted(10, 0, -10, 0),
                         Qt.AlignVCenter | Qt.AlignLeft, self.title())

    # ── open on header double-click ─────────────────────────────────────
    def mouseDoubleClickEvent(self, event):
        if event.pos().y() < HEADER_H:
            self.open_requested.emit(self.abs_path)
            event.accept()
            return
        super().mouseDoubleClickEvent(event)


def _fmt_ms(ms: int) -> str:
    s = max(0, ms) // 1000
    return f"{s // 60}:{s % 60:02d}"


class MediaNodeItem(BaseNodeItem):
    """An image, audio clip or video embedded in the board. Images paint
    directly; audio and video get a small transport (play/pause + seek)."""

    def __init__(self, node, abs_path, media_kind, parent=None):
        super().__init__(parent=parent, node=node)
        self.abs_path = Path(abs_path)
        self.media_kind = media_kind
        self._pixmap = None
        self._player = None
        self._video_item = None
        self._controls = None

        if media_kind == "image":
            self._pixmap = QPixmap(str(attachments.fs_path(self.abs_path)))
        elif media_kind in ("audio", "video") and _HAS_MEDIA:
            self._build_player(media_kind)
        self._layout_media()

    # ── media plumbing ──────────────────────────────────────────────────
    def _build_player(self, kind):
        self._player = QMediaPlayer()
        self._audio = QAudioOutput()
        self._player.setAudioOutput(self._audio)
        if kind == "video":
            self._video_item = QGraphicsVideoItem(self)
            self._player.setVideoOutput(self._video_item)
        self._player.setSource(QUrl.fromLocalFile(str(self.abs_path.resolve())))

        panel = QWidget()
        panel.setStyleSheet(
            "background:#2f2f38;border-radius:6px;"
            "QPushButton{background:transparent;border:none;color:#dcdde0;}"
            "QLabel{color:#b8b8c0;font-size:10px;}")
        row = QHBoxLayout(panel)
        row.setContentsMargins(6, 2, 6, 2)
        row.setSpacing(6)
        self._play_btn = QPushButton("▶")
        self._play_btn.setCursor(Qt.PointingHandCursor)
        self._play_btn.setFixedWidth(24)
        self._play_btn.clicked.connect(self._toggle_play)
        row.addWidget(self._play_btn)
        self._seek = QSlider(Qt.Horizontal)
        self._seek.setRange(0, 0)
        self._seek.sliderMoved.connect(self._player.setPosition)
        row.addWidget(self._seek, 1)
        self._time = QLabel("0:00")
        row.addWidget(self._time)

        self._controls = QGraphicsProxyWidget(self)
        self._controls.setWidget(panel)

        self._player.positionChanged.connect(self._on_pos)
        self._player.durationChanged.connect(self._on_dur)
        self._player.playbackStateChanged.connect(self._on_state)

    def _toggle_play(self):
        if self._player is None:
            return
        if self._player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self._player.pause()
        else:
            self._player.play()

    def _on_pos(self, ms):
        if not self._seek.isSliderDown():
            self._seek.setValue(ms)
        self._time.setText(_fmt_ms(ms))

    def _on_dur(self, ms):
        self._seek.setRange(0, ms)

    def _on_state(self, state):
        playing = state == QMediaPlayer.PlaybackState.PlayingState
        self._play_btn.setText("⏸" if playing else "▶")

    def stop(self):
        if self._player is not None:
            self._player.stop()

    # ── layout ──────────────────────────────────────────────────────────
    CTRL_H = 28.0

    def _layout_media(self):
        w, h = self.node.width, self.node.height
        if self._video_item is not None:
            from PySide6.QtCore import QSizeF
            self._video_item.setPos(4, 4)
            self._video_item.setSize(QSizeF(w - 8, h - self.CTRL_H - 8))
        if self._controls is not None:
            panel = self._controls.widget()
            panel.setFixedSize(int(w - 8), int(self.CTRL_H - 4))
            self._controls.setPos(4, h - self.CTRL_H)

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if self._resizing:
            self._layout_media()

    def mouseReleaseEvent(self, event):
        super().mouseReleaseEvent(event)
        self._layout_media()

    # ── painting ────────────────────────────────────────────────────────
    def paint_content(self, painter, rect):
        if self.media_kind == "image" and self._pixmap and not self._pixmap.isNull():
            area = rect.adjusted(4, 4, -4, -4)
            scaled = self._pixmap.scaled(
                area.size().toSize(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
            x = area.left() + (area.width() - scaled.width()) / 2
            y = area.top() + (area.height() - scaled.height()) / 2
            painter.drawPixmap(int(x), int(y), scaled)
        elif self.media_kind == "audio":
            painter.setPen(QPen(color_for(self.node.color)))
            f = QFont("Segoe UI", 9)
            f.setBold(True)
            painter.setFont(f)
            painter.drawText(rect.adjusted(10, 6, -10, 0),
                             Qt.AlignTop | Qt.AlignLeft, "♪  " + self.abs_path.stem)
        elif self.media_kind == "video" and not _HAS_MEDIA:
            painter.setPen(QPen(color_for(self.node.color)))
            painter.drawText(rect, Qt.AlignCenter, "▶ " + self.abs_path.name)

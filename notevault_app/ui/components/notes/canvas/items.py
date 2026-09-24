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
    QStackedWidget, QApplication,
)
from PySide6.QtCore import Qt, QRectF, QPointF, QTimer, QUrl, Signal, QEvent
from PySide6.QtGui import (
    QColor, QPen, QBrush, QFont, QPainter, QPainterPath, QPixmap, QImage, QTextOption,
    QDesktopServices, QKeySequence, QTextTable
)

from .....core import attachments
from .... import theme
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
BG_NODE   = QColor(theme.tint("#26262c"))
BORDER    = QColor(theme.tint("#3a3a46"))
BORDER_SEL = QColor(theme.tint("#7c5af0"))
TEXT      = QColor(theme.tint("#dcdde0"))
GRIP      = QColor(theme.tint("#7c5af0"))

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
        self._resize_edge = ""       # which border/corner is being dragged
        self._hovered = False
        self._press_local = QPointF()
        self._press_scene = QPointF()
        self._press_pos = QPointF()
        self._press_size = (node.width, node.height)
        is_locked = bool((node.nv or {}).get("locked", False))
        self.setFlag(QGraphicsObject.ItemIsMovable, not is_locked)
        self.setFlag(QGraphicsObject.ItemIsSelectable, True)
        self.setFlag(QGraphicsObject.ItemSendsGeometryChanges, True)
        # Contents (text, embedded viewers, media) are clipped to the visible
        # card, so a card smaller than its content never spills over its border.
        self.setFlag(QGraphicsObject.ItemClipsChildrenToShape, True)
        self.setCacheMode(QGraphicsObject.DeviceCoordinateCache)
        self.setPos(node.x, node.y)
        self.setAcceptHoverEvents(True)

    def _on_resized(self):
        """Hook called when node geometry is resized during mouse drag."""
        pass

    def shape(self) -> QPainterPath:
        # Clip/hit-test against the visible card, not the padded bounding rect
        # (the 6px pad exists only so ports and the selection ring can redraw).
        path = QPainterPath()
        path.addRoundedRect(self._node_rect(), 8, 8)
        return path

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

    # Resize handles: any of the four borders or four corners, not just the
    # bottom-right grip. Returns a tag made of "t"/"b" and "l"/"r" (e.g. "tl",
    # "r", "b"), or "" when the point is not on a border. Corners use a bigger
    # zone than the edges so grabbing near a corner reliably resizes on both
    # axes at once (diagonal), instead of catching just one edge.
    _EDGE_MARGIN = 10.0
    _CORNER_MARGIN = 20.0

    def _edge_at(self, pos: QPointF) -> str:
        if self.is_locked:
            return ""
        w, h = self.node.width, self.node.height
        m, cm = self._EDGE_MARGIN, self._CORNER_MARGIN
        x, y = pos.x(), pos.y()
        if not (-m <= x <= w + m and -m <= y <= h + m):
            return ""
        # Corners first, with their larger catch radius.
        for tag, (cx, cy) in (("tl", (0, 0)), ("tr", (w, 0)),
                              ("bl", (0, h)), ("br", (w, h))):
            if abs(x - cx) <= cm and abs(y - cy) <= cm:
                return tag
        vert = "t" if abs(y) <= m else ("b" if abs(y - h) <= m else "")
        horiz = "l" if abs(x) <= m else ("r" if abs(x - w) <= m else "")
        return vert + horiz

    @staticmethod
    def _edge_cursor(edge: str):
        return {
            "l": Qt.SizeHorCursor, "r": Qt.SizeHorCursor,
            "t": Qt.SizeVerCursor, "b": Qt.SizeVerCursor,
            "tl": Qt.SizeFDiagCursor, "br": Qt.SizeFDiagCursor,
            "tr": Qt.SizeBDiagCursor, "bl": Qt.SizeBDiagCursor,
        }.get(edge, Qt.ArrowCursor)

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
        edge = self._edge_at(event.pos())
        if self.port_at(event.pos()):
            self.setCursor(Qt.CrossCursor)
        elif edge:
            self.setCursor(self._edge_cursor(edge))
        else:
            self.setCursor(Qt.ArrowCursor)
        super().hoverMoveEvent(event)

    def _snapshot_for_drag(self):
        """Push one undo snapshot at the first movement of a drag or resize, so
        each gesture is a single Ctrl+Z step."""
        if getattr(self, "_drag_snapshotted", False):
            return
        self._drag_snapshotted = True
        view = self.scene().views()[0] if self.scene() and self.scene().views() else None
        if view is not None and hasattr(view, "push_undo"):
            view.push_undo()

    def mousePressEvent(self, event):
        self._drag_snapshotted = False
        if self.is_locked:
            super().mousePressEvent(event)
            return
        if event.button() == Qt.LeftButton:
            side = self.port_at(event.pos())
            if side:
                self.connection_drag_started.emit(self, side, event.scenePos())
                event.accept()
                return
            edge = self._edge_at(event.pos())
            if not edge and self._grip_rect().contains(event.pos()):
                edge = "br"
            if edge:
                self._resizing = True
                self._resize_edge = edge
                self._press_local = event.scenePos()
                self._press_scene = event.scenePos()
                self._press_pos = self.pos()
                self._press_size = (self.node.width, self.node.height)
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._resizing:
            self._snapshot_for_drag()
            edge = self._resize_edge or "br"
            delta = event.scenePos() - self._press_scene
            px, py = self._press_pos.x(), self._press_pos.y()
            pw, ph = self._press_size
            w = pw + (delta.x() if "r" in edge else -delta.x() if "l" in edge else 0.0)
            h = ph + (delta.y() if "b" in edge else -delta.y() if "t" in edge else 0.0)
            view = self.scene().views()[0] if self.scene() and self.scene().views() else None
            if view and getattr(view, "_snap_to_grid", False):
                w = round(w / 20.0) * 20.0
                h = round(h / 20.0) * 20.0
            w = max(MIN_W, w)
            h = max(MIN_H, h)
            # Left/top drags move the origin so the opposite edge stays pinned.
            new_x = px + (pw - w) if "l" in edge else px
            new_y = py + (ph - h) if "t" in edge else py
            self.prepareGeometryChange()
            self.node.width, self.node.height = w, h
            if new_x != px or new_y != py:
                self.setPos(new_x, new_y)
            self._on_resized()
            self.update()
            self.geometry_changed.emit()
            return
        # A drag that moves the card is one undo step too.
        if (event.buttons() & Qt.LeftButton) and (self.flags() & QGraphicsObject.ItemIsMovable):
            self._snapshot_for_drag()
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        view = self.scene().views()[0] if self.scene() and self.scene().views() else None
        if view and hasattr(view, "_clear_align_guides"):
            view._clear_align_guides()
        if self._resizing:
            self._resizing = False
            self._resize_edge = ""
            self.node.width = float(self.node.width)
            self.node.height = float(self.node.height)
            self.geometry_changed.emit()
            event.accept()
            return
        try:
            super().mouseReleaseEvent(event)
        except TypeError:
            pass

    def _snapped_to_objects(self, pos: QPointF, threshold: float = 6.0) -> QPointF:
        """Nudge pos so this node's left/center/right (and top/center/bottom)
        edges align with a nearby node's matching edge, within threshold."""
        w, h = self.node.width, self.node.height
        my_x = (pos.x(), pos.x() + w / 2, pos.x() + w)
        my_y = (pos.y(), pos.y() + h / 2, pos.y() + h)
        best_dx = best_dy = None
        best_x_guide = best_y_guide = None
        for other in self.scene().items():
            if other is self or not isinstance(other, BaseNodeItem):
                continue
            ox, oy = other.pos().x(), other.pos().y()
            ow, oh = other.node.width, other.node.height
            for mx in my_x:
                for oe in (ox, ox + ow / 2, ox + ow):
                    d = oe - mx
                    if abs(d) <= threshold and (best_dx is None or abs(d) < abs(best_dx)):
                        best_dx = d
                        top_y = min(pos.y(), oy) - 40
                        bot_y = max(pos.y() + h, oy + oh) + 40
                        best_x_guide = (QPointF(oe, top_y), QPointF(oe, bot_y))
            for myy in my_y:
                for oe in (oy, oy + oh / 2, oy + oh):
                    d = oe - myy
                    if abs(d) <= threshold and (best_dy is None or abs(d) < abs(best_dy)):
                        best_dy = d
                        left_x = min(pos.x(), ox) - 40
                        right_x = max(pos.x() + w, ox + ow) + 40
                        best_y_guide = (QPointF(left_x, oe), QPointF(right_x, oe))

        view = self.scene().views()[0] if self.scene() and self.scene().views() else None
        if view and hasattr(view, "_show_alignment_guides"):
            guides = []
            if best_x_guide:
                guides.append(best_x_guide)
            if best_y_guide:
                guides.append(best_y_guide)
            if guides:
                view._show_alignment_guides(guides)
            else:
                view._clear_align_guides()

        return QPointF(pos.x() + (best_dx or 0.0), pos.y() + (best_dy or 0.0))

    def itemChange(self, change, value):
        if change == QGraphicsObject.ItemPositionChange and self.scene():
            if self._resizing:
                return value  # a top/left resize moves the origin itself; don't snap it
            view = self.scene().views()[0] if self.scene().views() else None
            if view and getattr(view, "_snap_to_grid", False):
                new_pos = value
                snapped_x = round(new_pos.x() / 20.0) * 20.0
                snapped_y = round(new_pos.y() / 20.0) * 20.0
                return QPointF(snapped_x, snapped_y)
            if view and getattr(view, "_snap_to_objects", False):
                return self._snapped_to_objects(value)
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


_PIPE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_SEP_ROW = re.compile(r"^\s*\|?[\s:|\-]*-[\s:|\-]*\|?\s*$")


def _tolerant_table_md(text: str) -> str:
    """Insert the ``|---|`` separator a markdown table needs when the user left
    it out, so a pipe table still renders as a grid. Display-only: the stored
    ``node.text`` is never changed. Content without pipes is returned as-is."""
    lines = text.split("\n")
    out: list[str] = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        # Only the FIRST row of a table block can be a header: a pipe row that
        # is not itself a separator and does not continue a previous pipe row.
        # If the next line is another data row (no separator in between), the
        # user forgot the separator. Rows further down are left alone.
        starts_table = (_PIPE_ROW.match(line) and not _SEP_ROW.match(line)
                        and (i == 0 or not _PIPE_ROW.match(lines[i - 1])))
        if (starts_table and i + 1 < n
                and _PIPE_ROW.match(lines[i + 1]) and not _SEP_ROW.match(lines[i + 1])):
            out.append(line)
            cols = max(1, line.strip().strip("|").count("|") + 1)
            out.append("|" + "|".join(" --- " for _ in range(cols)) + "|")
            i += 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


class _CardTextItem(QGraphicsTextItem):
    """The editable text of a canvas card. Pasting converts a copied table
    (HTML from a rendered note, a browser or a spreadsheet, or tab-separated
    text) into a markdown pipe table, and any other content into plain text,
    so a card never swallows rich formatting that would flatten on save."""

    def keyPressEvent(self, event):
        if (event.matches(QKeySequence.Paste)
                and self.textInteractionFlags() & Qt.TextEditable):
            from .....core.qt_markdown import clipboard_markdown
            mime = QApplication.clipboard().mimeData()
            if mime is not None:
                md = clipboard_markdown(mime.html() if mime.hasHtml() else "",
                                        mime.text() if mime.hasText() else "")
                if md:
                    cur = self.textCursor()
                    # A table must start on its own line to be a table.
                    if "|" in md.split("\n", 1)[0] and cur.positionInBlock() > 0:
                        md = "\n\n" + md
                    cur.insertText(md)
                    self.setTextCursor(cur)
                    event.accept()
                    return
        super().keyPressEvent(event)


class TextNodeItem(BaseNodeItem):
    """A free markdown/text card. It shows its markdown *rendered* — headings,
    bold and lists look like a note — and a double-click switches it to raw
    markdown for editing, re-rendering when you click away."""

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self._text = _CardTextItem(self)
        self._text.setDefaultTextColor(TEXT)
        self._text.setFont(QFont("Segoe UI", 10))
        self._text.setTextWidth(node.width - 20)
        self._text.setPos(10, 8)
        # While not editing, the text must not swallow mouse/hover events, or
        # the card's border-resize handles and cursor never trigger over it.
        self._text.setAcceptHoverEvents(False)
        self._text.setAcceptedMouseButtons(Qt.NoButton)
        self._editing = False
        self._render_markdown()

    def _render_markdown(self):
        """Show node.text as rendered markdown (headings/bold/lists/tables)."""
        doc = self._text.document()
        doc.setMarkdown(_tolerant_table_md(self.node.text or ""))
        try:
            from ..note_view import style_document
            style_document(doc)
        except Exception:
            pass
        self._text.setTextWidth(max(20.0, self.node.width - 20))

    def _on_resized(self):
        self._text.setTextWidth(max(20.0, self.node.width - 20))

    def paint_content(self, painter, rect):
        # Zero-cost: no layout thrashing during paint!
        pass

    def paint(self, painter, option, widget=None):
        scale = painter.transform().m11()
        if scale < 0.32:
            if self._text.isVisible():
                self._text.setVisible(False)
            super().paint(painter, option, widget)
            painter.setPen(QPen(QColor("#9a9ab0"), 1.0))
            painter.setFont(QFont("Segoe UI", 9))
            first_line = (self.node.text or "").split("\n")[0][:45]
            rect = self._node_rect().adjusted(10, 8, -10, -8)
            painter.drawText(rect, Qt.AlignLeft | Qt.AlignTop, first_line)
            return

        if not self._text.isVisible():
            self._text.setVisible(True)
        super().paint(painter, option, widget)

    def mouseDoubleClickEvent(self, event):
        self._begin_edit()
        event.accept()

    def _begin_edit(self):
        self.setCacheMode(QGraphicsObject.NoCache)
        self._editing = True
        # Show the raw markdown while editing, so the user types the source.
        self._text.setPlainText(self.node.text or "")
        self._text.setAcceptedMouseButtons(Qt.AllButtons)
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
        self._text.setAcceptedMouseButtons(Qt.NoButton)
        new_text = self._text.toPlainText()
        changed = new_text != self.node.text
        self.node.text = new_text
        self._render_markdown()            # back to the rendered view
        self.setCacheMode(QGraphicsObject.DeviceCoordinateCache)
        if changed:
            self.fit_to_content()
            self.edited.emit()

    def fit_to_content(self):
        """Grow the card so its rendered content fits (never shrinks it); a
        card holding a table is also widened so the columns have room."""
        doc = self._text.document()
        w = self.node.width
        has_table = any(isinstance(f, QTextTable) for f in doc.rootFrame().childFrames())
        if has_table and w < 520:
            w = 520.0
        if w != self.node.width:
            self.prepareGeometryChange()
            self.node.width = w
            self._text.setTextWidth(w - 20)
        need_h = doc.size().height() + 24
        if need_h > self.node.height:
            self.prepareGeometryChange()
            self.node.height = min(1400.0, need_h)
        self.update()
        self.geometry_changed.emit()


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

    _BORDER_HIT = 12.0    # how thick the clickable border band is
    _TITLE_HIT = 34.0     # the title strip stays fully clickable

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self.setZValue(-2)
        # The interior must not intercept clicks (see ``shape``), so don't clip
        # to it either.
        self.setFlag(QGraphicsObject.ItemClipsChildrenToShape, False)
        self._text = QGraphicsTextItem(self)
        self._text.setDefaultTextColor(QColor("#a6a8b1"))
        self._text.setFont(QFont("Segoe UI", 11, QFont.Bold))
        self._text.setAcceptedMouseButtons(Qt.NoButton)
        self._text.setPlainText(node.label or "Grupo")
        self._text.setPos(12, 6)
        self._drag_start_pos = QPointF()
        self._dragged_children = []

    def _edge_at(self, pos: QPointF) -> str:
        if self.is_locked:
            return ""
        # The title bar (top strip) is strictly for selecting and dragging, never resizing
        if pos.y() <= max(38.0, self._TITLE_HIT):
            return ""
        # Delegate to BaseNodeItem's full 8-direction border detection
        # so groups can be resized from any edge or corner.
        return BaseNodeItem._edge_at(self, pos)

    def shape(self) -> QPainterPath:
        # Title strip and borders are clickable. When zoomed out, expand the
        # hit areas in scene units so the group remains easily selectable at low zoom.
        w, h = self.node.width, self.node.height
        outer = QPainterPath()
        outer.addRoundedRect(QRectF(-2, -2, w + 4, h + 4), 10, 10)

        scale = 1.0
        if self.scene() and self.scene().views():
            try:
                scale = max(0.05, float(self.scene().views()[0].transform().m11()))
            except Exception:
                scale = 1.0

        b = max(self._BORDER_HIT, 20.0 / scale)
        t = max(self._TITLE_HIT, 42.0 / scale)
        if w > 2 * b and h > b + t:
            hole = QPainterPath()
            hole.addRect(QRectF(b, t, w - 2 * b, h - t - b))
            return outer.subtracted(hole)
        return outer

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
        if event.pos().y() <= max(38.0, self._TITLE_HIT):
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
        if event.button() == Qt.LeftButton and not self.is_locked:
            self._drag_start_pos = self.pos()
            self._dragged_children = []
            if self.scene():
                group_rect = self.mapRectToScene(self._node_rect())
                for item in self.scene().items():
                    if item is self or not isinstance(item, BaseNodeItem):
                        continue
                    item_center = item.mapToScene(item._node_rect().center())
                    if group_rect.contains(item_center):
                        self._dragged_children.append((item, item.pos() - self.pos()))
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if self._dragged_children and not self._resizing and not self.is_locked:
            for child, rel_offset in self._dragged_children:
                if not child.isSelected():
                    child.setPos(self.pos() + rel_offset)

    def mouseReleaseEvent(self, event):
        super().mouseReleaseEvent(event)
        if self._dragged_children and not self._resizing and not self.is_locked:
            for child, _ in self._dragged_children:
                child.node.x = float(child.pos().x())
                child.node.y = float(child.pos().y())
                child.geometry_changed.emit()
            self.node.x = float(self.pos().x())
            self.node.y = float(self.pos().y())
            self.geometry_changed.emit()
            self.edited.emit()
        self._dragged_children = []


class LinkNodeItem(BaseNodeItem):
    """A web page on the board (a JSON Canvas ``link`` node), like Obsidian's.

    At rest the card shows a header (site and title) and the last snapshot of
    the page, which is cheap: no browser runs. Double-clicking the body (or
    the ▶ button) makes it live: a real page inside the card that scrolls,
    takes clicks, typing and logins (same profile as the WEB module).
    Deselecting the card, or ■, returns it to rest and refreshes the
    snapshot. ◉ keeps it live every time the canvas opens (``nv.live``).
    """

    _BTN_W = 24.0
    # header buttons, right to left
    _BUTTONS = (("open", "↗", "Abrir en WEB"), ("live", "▶", "Interactuar"),
                ("pin", "◉", "Mantener siempre en vivo"), ("edit", "✎", "Cambiar la dirección"))

    def __init__(self, node, parent=None):
        super().__init__(parent=parent, node=node)
        self.setFlag(QGraphicsObject.ItemIsFocusable, True)
        self._proxy = None
        self._view = None
        self._snapshot = QPixmap()
        self._load_snapshot()
        if (node.nv or {}).get("live"):
            QTimer.singleShot(0, self.go_live)

    # ── data ────────────────────────────────────────────────────────────
    def url(self) -> str:
        from .....core.web_store import normalize_url
        return normalize_url(self.node.url or "")

    def title(self) -> str:
        from .....core.web_store import host_of
        t = (self.node.nv or {}).get("title") or ""
        return t or host_of(self.url()) or self.node.url or "Página web"

    def _snapshot_path(self) -> Path:
        import hashlib
        from ...web import controller
        key = hashlib.sha1(self.url().encode("utf-8")).hexdigest()[:20]
        return controller().home / "web_thumbs" / f"{key}.png"

    def _load_snapshot(self):
        p = self._snapshot_path()
        self._snapshot = QPixmap(str(p)) if p.exists() else QPixmap()

    def _set_nv(self, key, value):
        if self.node.nv is None:
            self.node.nv = {}
        if value in (None, False, ""):
            if key in self.node.nv:
                self.node.nv.pop(key)
                self.edited.emit()
        elif self.node.nv.get(key) != value:
            self.node.nv[key] = value
            self.edited.emit()

    @property
    def is_live(self) -> bool:
        return self._view is not None

    # ── live / rest ─────────────────────────────────────────────────────
    def go_live(self):
        if self._view is not None or self.scene() is None:
            return
        from ...web import controller
        ctl = controller()
        if ctl.engine(quiet=True) is None:
            ctl.engine()                      # explains why, then falls back
            QDesktopServices.openUrl(QUrl(self.url()))
            return
        from ...web.engine import new_view
        view = new_view(ctl, counts_when="focus")

        def new_window(_type):
            if ctl.open_window():
                return ctl.window().new_tab("").page()
            return None
        view.page().new_window_handler = new_window
        view.titleChanged.connect(self._on_title)
        view.setUrl(QUrl(self.url()))
        self._view = view
        self._proxy = QGraphicsProxyWidget(self)
        self._proxy.setWidget(view)
        self._layout_proxy()
        self.update()

    def go_rest(self, snapshot: bool = True):
        if self._view is None:
            return
        if snapshot:
            try:
                pix = self._view.grab()
                if not pix.isNull() and pix.width() > 8:
                    path = self._snapshot_path()
                    path.parent.mkdir(parents=True, exist_ok=True)
                    pix.save(str(path), "PNG")
                    self._snapshot = pix
            except RuntimeError:
                pass
        proxy, self._proxy, self._view = self._proxy, None, None
        if proxy.scene() is not None:
            proxy.scene().removeItem(proxy)
        proxy.deleteLater()
        self.update()

    def _on_title(self, title: str):
        if title and title != "about:blank":
            self._set_nv("title", title)
            self.update()

    def itemChange(self, change, value):
        if (change == QGraphicsObject.ItemSelectedHasChanged and not value
                and self._view is not None and not (self.node.nv or {}).get("live")):
            QTimer.singleShot(0, self._rest_if_unfocused)
        return super().itemChange(change, value)

    def _rest_if_unfocused(self):
        if self._view is None or self.isSelected():
            return
        fw = QApplication.focusWidget()
        if fw is not None and (fw is self._view or self._view.isAncestorOf(fw)):
            return
        self.go_rest()

    # ── layout / painting ───────────────────────────────────────────────
    def _body_rect(self) -> QRectF:
        inset = self._EDGE_MARGIN
        return QRectF(inset, HEADER_H, max(40.0, self.node.width - 2 * inset),
                      max(30.0, self.node.height - HEADER_H - GRIP_SIZE))

    def _layout_proxy(self):
        if self._proxy is None:
            return
        r = self._body_rect()
        self._proxy.setPos(r.topLeft())
        self._view.setFixedSize(int(r.width()), int(r.height()))

    def _on_resized(self):
        self._layout_proxy()

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if self._resizing:
            self._layout_proxy()

    def mouseReleaseEvent(self, event):
        super().mouseReleaseEvent(event)
        self._layout_proxy()

    def _button_rects(self) -> dict:
        out = {}
        x = self.node.width - 6
        for key, _glyph, _tip in self._BUTTONS:
            x -= self._BTN_W
            out[key] = QRectF(x, 1, self._BTN_W, HEADER_H - 2)
        return out

    def paint_content(self, painter, rect):
        painter.save()
        header = QRectF(rect.left(), rect.top(), rect.width(), HEADER_H)
        path = QPainterPath()
        path.addRoundedRect(header, 8, 8)
        painter.setClipPath(path)
        painter.fillRect(header, QColor("#2f2f38"))
        painter.restore()

        buttons = self._button_rects()
        painter.setFont(QFont("Segoe UI Symbol", 9))
        pinned = bool((self.node.nv or {}).get("live"))
        for key, glyph, _tip in self._BUTTONS:
            if key == "live" and self.is_live:
                glyph = "■"
            active = (key == "pin" and pinned) or (key == "live" and self.is_live)
            painter.setPen(QPen(QColor("#b9a6ff") if active else QColor("#9a9aa6")))
            painter.drawText(buttons[key], Qt.AlignCenter, glyph)

        left = min(r.left() for r in buttons.values())
        f = QFont("Segoe UI", 9)
        f.setBold(True)
        painter.setFont(f)
        painter.setPen(QPen(color_for(self.node.color) if self.node.color else TEXT))
        title_rect = QRectF(header.left() + 10, header.top(),
                            max(10.0, left - header.left() - 14), HEADER_H)
        painter.drawText(title_rect, Qt.AlignVCenter | Qt.AlignLeft,
                         painter.fontMetrics().elidedText("🌐  " + self.title(), Qt.ElideRight,
                                                          int(title_rect.width())))
        if self.is_live:
            return

        body = self._body_rect()
        if not self._snapshot.isNull():
            # Top of the page, scaled to the card width (a page is read top-down).
            src_w = self._snapshot.width()
            scale = body.width() / max(1, src_w)
            src_h = min(self._snapshot.height(), body.height() / max(scale, 1e-6))
            painter.save()
            painter.setRenderHint(QPainter.SmoothPixmapTransform)
            painter.drawPixmap(QRectF(body.left(), body.top(), body.width(), src_h * scale),
                               self._snapshot, QRectF(0, 0, src_w, src_h))
            painter.restore()
            hint_rect = QRectF(body.left(), body.bottom() - 22, body.width(), 22)
            painter.fillRect(hint_rect, QColor(20, 20, 24, 170))
            painter.setPen(QPen(QColor("#b0b0bb")))
            painter.setFont(QFont("Segoe UI", 8))
            painter.drawText(hint_rect, Qt.AlignCenter, "Doble clic para interactuar")
            return
        painter.setPen(QPen(QColor("#7c5af0")))
        painter.setFont(QFont("Segoe UI Emoji", 22))
        top = QRectF(body.left(), body.top() + 6, body.width(), max(30.0, body.height() * 0.45))
        painter.drawText(top, Qt.AlignCenter, "🌐")
        painter.setPen(QPen(QColor("#9a9aa6")))
        painter.setFont(QFont("Segoe UI", 9))
        rest = QRectF(body.left() + 8, top.bottom(), body.width() - 16,
                      max(10.0, body.bottom() - top.bottom()))
        painter.drawText(rest, Qt.AlignHCenter | Qt.AlignTop | Qt.TextWrapAnywhere,
                         f"{self.url()}\n\nDoble clic para interactuar")

    # ── mouse ───────────────────────────────────────────────────────────
    def _button_at(self, pos) -> str:
        for key, r in self._button_rects().items():
            if r.contains(pos):
                return key
        return ""

    def hoverMoveEvent(self, event):
        key = self._button_at(event.pos())
        if key:
            tip = {k: t for k, _g, t in self._BUTTONS}[key]
            if key == "live" and self.is_live:
                tip = "Volver a la vista previa"
            self.setToolTip(tip)
            self.setCursor(Qt.PointingHandCursor)
            return
        self.setToolTip(self.url())
        super().hoverMoveEvent(event)

    def mousePressEvent(self, event):
        key = self._button_at(event.pos()) if event.button() == Qt.LeftButton else ""
        if key:
            event.accept()
            QTimer.singleShot(0, lambda: self._run_button(key))
            return
        super().mousePressEvent(event)

    def _run_button(self, key: str):
        if key == "open":
            from ...web import controller
            if not controller().open_window(self.url()):
                QDesktopServices.openUrl(QUrl(self.url()))
        elif key == "live":
            if self.is_live:
                self.go_rest()
            else:
                self.go_live()
        elif key == "pin":
            pinned = not bool((self.node.nv or {}).get("live"))
            self._set_nv("live", pinned)
            if pinned:
                self.go_live()
            self.update()
        elif key == "edit":
            self.edit_url()

    def edit_url(self):
        url, ok = QInputDialog.getText(
            None, "Editar enlace", "Dirección de la página:", text=self.node.url or "https://")
        if ok and url.strip() and url.strip() != self.node.url:
            self.node.url = url.strip()
            self._set_nv("title", None)
            self._load_snapshot()
            if self._view is not None:
                self._view.setUrl(QUrl(self.url()))
            self.update()
            self.edited.emit()

    def mouseDoubleClickEvent(self, event):
        if event.pos().y() < HEADER_H:
            if not self._button_at(event.pos()):
                self._run_button("open")
        else:
            self.go_live()
        event.accept()


HEADER_H = 26.0


class NoteNodeItem(BaseNodeItem):
    """A vault note embedded in the board. It shows the note *rendered* — the
    same reading view a note has, so headings, bold and lists look exactly as
    they would in the editor. The title bar is the drag handle and opens the
    full note; double-clicking the body switches that card into a markdown
    editor so the note can still be modified from the canvas, and leaving it
    (clicking away) re-renders and saves back to the .md file."""

    open_requested = Signal(object)          # absolute Path — open in current tab
    open_in_new_tab_requested = Signal(object)   # absolute Path — open in new tab

    def __init__(self, node, abs_path, service=None, parent=None):
        super().__init__(parent=parent, node=node)
        self.abs_path = Path(abs_path)
        self.service = service
        self._frontmatter = ""
        self._body = ""
        self._editing = False
        # Needed so the embedded editor can take keyboard focus for in-place edit.
        self.setFlag(QGraphicsObject.ItemIsFocusable, True)

        from ..note_view import NoteTextBrowser, NoteSourceEdit

        # Rendered reading view (page 0).
        self._viewer = NoteTextBrowser()
        self._viewer.setFrameShape(QTextEdit.NoFrame)
        self._viewer.setStyleSheet(
            f"QTextBrowser{{background:transparent;border:none;color:#dcdde0;"
            f"font-family:{theme.NOTE_FONT_FAMILY};"
            "font-size:13px;}")
        self._viewer.note_path = self.abs_path
        root = self._vault_root()
        if root is not None:
            self._viewer.vault_root = root
        self._viewer.note_link_activated.connect(self._on_note_link)

        # Raw markdown editor, shown only while editing (page 1).
        self._editor = NoteSourceEdit()
        self._editor.setObjectName("canvasNoteEditor")
        self._editor.setFrameShape(QTextEdit.NoFrame)
        self._editor.note_path = self.abs_path
        self._editor.setStyleSheet(
            f"QTextEdit{{background:transparent;border:none;color:#dcdde0;"
            f"font-family:{theme.NOTE_FONT_FAMILY};font-size:13px;}}")
        self._editor.installEventFilter(self)

        self._pages = QStackedWidget()
        self._pages.setStyleSheet("background:transparent;")
        self._pages.setFocusPolicy(Qt.StrongFocus)
        self._pages.addWidget(self._viewer)   # 0 — rendered
        self._pages.addWidget(self._editor)   # 1 — editing

        self._proxy = QGraphicsProxyWidget(self)
        self._proxy.setWidget(self._pages)

        self._save_timer = QTimer()
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(700)
        self._save_timer.timeout.connect(self._autosave)
        self._editor.textChanged.connect(self._save_timer.start)

        self._load_file()
        self._layout_proxy()

    def _vault_root(self):
        if self.service is not None:
            try:
                return self.service.vault.vault_root
            except Exception:
                return None
        return None

    # ── file I/O ────────────────────────────────────────────────────────
    def title(self) -> str:
        return self.abs_path.stem

    def _load_file(self):
        try:
            raw = attachments.fs_path(self.abs_path).read_text(
                encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            raw = ""
        self._frontmatter, self._body = _split_frontmatter(raw)
        self._render()

    def _render(self):
        from .....core.qt_markdown import prepare_for_reading, expand_transclusions
        body = self._body
        if self.service is not None and getattr(self.service, "vault", None) is not None:
            def _resolve(title):
                note = self.service.vault.resolve_link(title)
                return note.body if note is not None else None
            body = expand_transclusions(body, _resolve)
        self._viewer.load_markdown(prepare_for_reading(body))

    def reload(self):
        """Re-read the note from disk and re-render (external edits)."""
        if self._editing:
            return
        self._load_file()

    def _save_body(self):
        body = self._body
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

    def _autosave(self):
        if self._editing:
            self._body = self._editor.toPlainText()
        self._save_body()

    def flush(self):
        if self._editing:
            self._commit_edit()
        elif self._save_timer.isActive():
            self._save_timer.stop()
            self._save_body()

    # ── edit mode ───────────────────────────────────────────────────────
    def _enter_edit(self):
        if self._editing or self.is_locked:
            return
        self._editing = True
        # While editing, the card must not drag under the cursor, or clicks land
        # as moves instead of placing the text caret; restored on commit.
        self.setFlag(QGraphicsObject.ItemIsMovable, False)
        self._editor.blockSignals(True)
        self._editor.setPlainText(self._body)
        self._editor.blockSignals(False)
        self._pages.setCurrentIndex(1)
        # Route keyboard focus through the proxy into the inner editor.
        self._proxy.setFocus(Qt.MouseFocusReason)
        self._editor.setFocus(Qt.MouseFocusReason)

    def _commit_edit(self):
        if not self._editing:
            return
        self._save_timer.stop()
        self._editing = False
        self._body = self._editor.toPlainText()
        self._save_body()
        self._render()
        self._pages.setCurrentIndex(0)
        self.setFlag(QGraphicsObject.ItemIsMovable, not self.is_locked)

    def eventFilter(self, obj, event):
        if obj is self._editor and event.type() == QEvent.FocusOut:
            self._commit_edit()
        return super().eventFilter(obj, event)

    def scroll_content(self, delta_y: int) -> bool:
        """Scroll the note's own content (D2: wheel over a note scrolls the
        note, not the whole canvas). Returns True if it consumed the scroll."""
        widget = self._pages.currentWidget()
        bar = widget.verticalScrollBar() if widget is not None else None
        if bar is None or bar.maximum() == 0:
            return False
        bar.setValue(bar.value() - delta_y)
        return True

    # ── layout ──────────────────────────────────────────────────────────
    def _layout_proxy(self):
        w = max(MIN_W, self.node.width)
        h = max(MIN_H, self.node.height)
        # Inset the body to the edge-resize margin so the left/right borders
        # stay grabbable for resizing instead of being covered by the viewer.
        inset = int(self._EDGE_MARGIN)
        self._proxy.setPos(inset, HEADER_H)
        self._pages.setFixedSize(int(w - 2 * inset), int(h - HEADER_H - GRIP_SIZE))

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

    def _on_note_link(self, target: str):
        note = None
        if self.service is not None:
            try:
                note = self.service.vault.resolve_link(target)
            except Exception:
                note = None
        if note is not None:
            try:
                self.open_requested.emit(Path(note.path))
                return
            except Exception:
                pass
        self.open_requested.emit(self.abs_path)

    # ── open on header double-click, edit on body double-click ──────────
    def mouseDoubleClickEvent(self, event):
        if event.pos().y() < HEADER_H:
            self.open_requested.emit(self.abs_path)
            event.accept()
            return
        self._enter_edit()
        event.accept()


def _embed_node_label(n) -> str:
    """A short label for one child node when drawn in an embedded preview."""
    if n.type == "file":
        stem = Path(n.file).stem if n.file else ""
        if (n.nv or {}).get("embed") == "canvas" or str(n.file).lower().endswith(".canvas"):
            return "⧉ " + stem
        media = (n.nv or {}).get("media")
        icon = {"image": "🖼", "audio": "♪", "video": "▶"}.get(media, "📄")
        return f"{icon} {stem}"
    if n.type == "text":
        return (n.text or "").strip()
    if n.type == "link":
        return "🔗 " + (n.url or "")
    if n.type == "group":
        return n.label or "Grupo"
    if n.type == "nv-shape":
        return (n.text or "").strip()
    if n.type == "nv-drawing":
        return "✎"
    return (n.text or "").strip()


def render_canvas_doc_to_pixmap(doc, max_px: int = 1400) -> QPixmap:
    """Render a canvas document to a static, read-only preview pixmap.

    Child nodes are drawn as simple labelled cards and edges as lines — the
    heavy interactive items (note browsers, media players) are never
    instantiated, so a preview is cheap and cannot recurse: an embedded canvas
    inside the child is drawn as a single ``⧉`` placeholder card, never loaded.
    """
    nodes = getattr(doc, "nodes", None) or []
    if not nodes:
        return QPixmap()
    min_x = min(n.x for n in nodes)
    min_y = min(n.y for n in nodes)
    max_x = max(n.x + n.width for n in nodes)
    max_y = max(n.y + n.height for n in nodes)
    w = max(1.0, max_x - min_x)
    h = max(1.0, max_y - min_y)
    scale = min(1.0, max_px / max(w, h))

    img = QImage(int(w * scale) + 4, int(h * scale) + 4,
                 QImage.Format_ARGB32_Premultiplied)
    img.fill(Qt.transparent)
    painter = QPainter(img)
    painter.setRenderHint(QPainter.Antialiasing)
    painter.translate(2, 2)
    painter.scale(scale, scale)
    painter.translate(-min_x, -min_y)

    id_map = {n.id: n for n in nodes}

    def center(n):
        return QPointF(n.x + n.width / 2, n.y + n.height / 2)

    painter.setPen(QPen(BORDER, 1.5))
    for e in getattr(doc, "edges", None) or []:
        a = id_map.get(e.fromNode)
        b = id_map.get(e.toNode)
        if a is not None and b is not None:
            painter.drawLine(center(a), center(b))

    label_font = QFont("Segoe UI", 10)
    for n in nodes:
        r = QRectF(n.x, n.y, n.width, n.height)
        painter.setBrush(QBrush(BG_NODE))
        painter.setPen(QPen(color_for(n.color), 1.5))
        painter.drawRoundedRect(r, 6, 6)
        label = _embed_node_label(n)
        if label:
            painter.setPen(QPen(TEXT))
            painter.setFont(label_font)
            painter.drawText(r.adjusted(8, 6, -8, -6),
                             int(Qt.AlignTop | Qt.AlignLeft | Qt.TextWordWrap),
                             label[:240])
    painter.end()
    return QPixmap.fromImage(img)


class CanvasEmbedItem(BaseNodeItem):
    """A ``.canvas`` file embedded in another canvas, shown as a read-only
    preview. The title bar is the drag handle; double-clicking opens the child
    canvas in its own tab. Editing the child from inside the parent is a later
    phase — for now the preview is static and re-reads on :meth:`reload`."""

    open_requested = Signal(object)          # absolute Path of the embedded .canvas
    open_in_new_tab_requested = Signal(object)   # absolute Path — open in new tab

    def __init__(self, node, abs_path, service=None, parent=None):
        super().__init__(parent=parent, node=node)
        self.abs_path = Path(abs_path)
        self.service = service
        self._pixmap = None
        self._render_preview()

    def title(self) -> str:
        return self.abs_path.stem

    def _render_preview(self):
        from .....core import canvas_format as cf
        try:
            doc = cf.load(self.abs_path)
            self._pixmap = render_canvas_doc_to_pixmap(doc)
        except Exception:
            self._pixmap = None

    def reload(self):
        """Re-read the child .canvas from disk and repaint (external edits)."""
        self._render_preview()
        self.update()

    def paint_content(self, painter, rect):
        # Title bar.
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
                         Qt.AlignVCenter | Qt.AlignLeft, "⧉  " + self.title())

        # Body: the cached preview, scaled to fit.
        body = QRectF(rect.left() + 4, rect.top() + HEADER_H,
                      rect.width() - 8, rect.height() - HEADER_H - 4)
        if self._pixmap is not None and not self._pixmap.isNull():
            scaled = self._pixmap.scaled(
                body.size().toSize(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
            x = body.left() + (body.width() - scaled.width()) / 2
            y = body.top() + (body.height() - scaled.height()) / 2
            painter.drawPixmap(int(x), int(y), scaled)
        else:
            painter.setPen(QPen(QColor("#888895")))
            painter.setFont(QFont("Segoe UI", 9))
            painter.drawText(body, Qt.AlignCenter, "Canvas vacío")

    def mouseDoubleClickEvent(self, event):
        # Read-only preview: any double-click opens the child canvas in a tab.
        self.open_requested.emit(self.abs_path)
        event.accept()


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

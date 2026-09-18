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
)
from PySide6.QtCore import Qt, QRectF, QPointF, QTimer, Signal
from PySide6.QtGui import QColor, QPen, QBrush, QFont, QPainterPath

from .....core import attachments

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

    def __init__(self, node, parent=None):
        super().__init__(parent)
        self.node = node
        self._resizing = False
        self._press_local = QPointF()
        self._press_size = (node.width, node.height)
        self.setFlag(QGraphicsObject.ItemIsMovable, True)
        self.setFlag(QGraphicsObject.ItemIsSelectable, True)
        self.setFlag(QGraphicsObject.ItemSendsGeometryChanges, True)
        self.setPos(node.x, node.y)
        self.setAcceptHoverEvents(True)

    # geometry ---------------------------------------------------------------
    def boundingRect(self) -> QRectF:
        return QRectF(0, 0, self.node.width, self.node.height)

    def _grip_rect(self) -> QRectF:
        return QRectF(self.node.width - GRIP_SIZE, self.node.height - GRIP_SIZE,
                      GRIP_SIZE, GRIP_SIZE)

    # painting ---------------------------------------------------------------
    def paint(self, painter, option, widget=None):
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        rect = self.boundingRect().adjusted(0.5, 0.5, -0.5, -0.5)
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

    def paint_content(self, painter, rect):
        """Overridden by subclasses; base draws nothing."""

    # mouse ------------------------------------------------------------------
    def hoverMoveEvent(self, event):
        if self.isSelected() and self._grip_rect().contains(event.pos()):
            self.setCursor(Qt.SizeFDiagCursor)
        else:
            self.setCursor(Qt.ArrowCursor)
        super().hoverMoveEvent(event)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton and self._grip_rect().contains(event.pos()):
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

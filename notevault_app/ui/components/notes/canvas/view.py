"""CanvasView: the widget that opens and edits one ``.canvas`` file.

C0 scaffolding: an infinite grid with pan (drag empty space or middle mouse),
zoom (Ctrl+wheel), and text cards you can add (double-click empty space),
move, resize and edit in place. Everything autosaves back to the file.

Later phases add: note nodes, media (image/audio/video), edges, flowchart
shapes and freehand drawing (see docs/PLAN_CANVAS_Y_BACKLINKS.md).
"""

from pathlib import Path

from PySide6.QtWidgets import QGraphicsView, QApplication
from PySide6.QtCore import Qt, QTimer, Signal, QPointF
from PySide6.QtGui import QPainter

from .... import theme  # noqa: F401  (kept for future theme-aware repaint)
from .....core import canvas_format as cf
from .scene import CanvasScene
from .items import TextNodeItem, BaseNodeItem


class CanvasView(QGraphicsView):
    open_note_requested = Signal(object)   # Path — a note node was activated

    def __init__(self, parent=None):
        super().__init__(parent)
        self._scene = CanvasScene(self)
        self.setScene(self._scene)
        self.setRenderHint(QPainter.Antialiasing)
        self.setDragMode(QGraphicsView.RubberBandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.AnchorViewCenter)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        self._path = None
        self._doc = cf.CanvasDoc()
        self._items = {}          # node id -> BaseNodeItem
        self._loading = False
        self._panning = False
        self._pan_start = QPointF()

        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(600)
        self._save_timer.timeout.connect(self._save_now)

    # ── file ────────────────────────────────────────────────────────────
    def load(self, path):
        self._path = Path(path)
        self._doc = cf.load(self._path)
        self._rebuild()

    def current_path(self):
        return self._path

    def _rebuild(self):
        self._loading = True
        self._scene.clear()
        self._items.clear()
        for node in self._doc.nodes:
            self._add_item_for(node)
        self._loading = False

    def _add_item_for(self, node) -> BaseNodeItem:
        if node.type == "text":
            item = TextNodeItem(node)
        else:
            # Unknown/other node types render as a plain card for now; later
            # phases replace these with their real items.
            item = TextNodeItem(node)
        item.geometry_changed.connect(self._schedule_save)
        item.edited.connect(self._schedule_save)
        self._scene.addItem(item)
        self._items[node.id] = item
        return item

    def _schedule_save(self):
        if not self._loading:
            self._save_timer.start()

    def _save_now(self):
        if self._path is not None:
            cf.dump(self._path, self._doc)

    def flush(self):
        """Write pending changes right now (e.g. before the app closes)."""
        if self._save_timer.isActive():
            self._save_timer.stop()
            self._save_now()

    # ── node creation ───────────────────────────────────────────────────
    def add_text_node(self, scene_pos: QPointF, text: str = ""):
        node = cf.CanvasNode(id=cf.new_id(), type="text",
                             x=scene_pos.x(), y=scene_pos.y(),
                             width=250, height=100, text=text)
        self._doc.nodes.append(node)
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        return item

    # ── interaction: pan + zoom ─────────────────────────────────────────
    def wheelEvent(self, event):
        if event.modifiers() & Qt.ControlModifier:
            factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
            self.scale(factor, factor)
            event.accept()
        else:
            # Plain wheel scrolls the board vertically; Shift scrolls sideways.
            delta = event.angleDelta().y()
            if event.modifiers() & Qt.ShiftModifier:
                self.translate(delta / 3, 0)
            else:
                self.translate(0, delta / 3)
            event.accept()

    def mousePressEvent(self, event):
        if event.button() == Qt.MiddleButton or (
                event.button() == Qt.LeftButton
                and not self.itemAt(event.position().toPoint())
                and event.modifiers() & Qt.AltModifier):
            self._panning = True
            self._pan_start = event.position()
            self.setCursor(Qt.ClosedHandCursor)
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._panning:
            delta = event.position() - self._pan_start
            self._pan_start = event.position()
            self.horizontalScrollBar().setValue(
                self.horizontalScrollBar().value() - int(delta.x()))
            self.verticalScrollBar().setValue(
                self.verticalScrollBar().value() - int(delta.y()))
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self._panning:
            self._panning = False
            self.setCursor(Qt.ArrowCursor)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event):
        item = self.itemAt(event.position().toPoint())
        if item is None:
            self.add_text_node(self.mapToScene(event.position().toPoint()))
            event.accept()
            return
        super().mouseDoubleClickEvent(event)

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key_Delete, Qt.Key_Backspace):
            self._delete_selected()
            event.accept()
            return
        super().keyPressEvent(event)

    def _delete_selected(self):
        removed = False
        for item in list(self._scene.selectedItems()):
            if isinstance(item, BaseNodeItem):
                nid = item.node.id
                self._doc.nodes = [n for n in self._doc.nodes if n.id != nid]
                self._doc.edges = [e for e in self._doc.edges
                                   if e.fromNode != nid and e.toNode != nid]
                self._scene.removeItem(item)
                self._items.pop(nid, None)
                removed = True
        if removed:
            self._schedule_save()

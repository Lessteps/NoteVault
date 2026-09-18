"""CanvasView: the widget that opens and edits one ``.canvas`` file.

C0 scaffolding: an infinite grid with pan (drag empty space or middle mouse),
zoom (Ctrl+wheel), and text cards you can add (double-click empty space),
move, resize and edit in place. Everything autosaves back to the file.

Later phases add: note nodes, media (image/audio/video), edges, flowchart
shapes and freehand drawing (see docs/PLAN_CANVAS_Y_BACKLINKS.md).
"""

from pathlib import Path

from PySide6.QtWidgets import (
    QGraphicsView, QApplication, QFrame, QHBoxLayout, QPushButton, QInputDialog,
)
from PySide6.QtCore import Qt, QTimer, Signal, QPointF
from PySide6.QtGui import QPainter

from .... import theme  # noqa: F401  (kept for future theme-aware repaint)
from .....core import canvas_format as cf
from .scene import CanvasScene
from .items import TextNodeItem, NoteNodeItem, BaseNodeItem


class CanvasView(QGraphicsView):
    open_note_requested = Signal(object)   # Path — a note node was activated

    def __init__(self, vault=None, service=None, parent=None):
        super().__init__(parent)
        self.vault = vault
        self.service = service
        self.setAcceptDrops(True)
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

        self._toolbar = self._build_toolbar()

    # ── toolbar (extended by later phases) ──────────────────────────────
    def _build_toolbar(self):
        bar = QFrame(self)
        bar.setObjectName("canvasToolbar")
        bar.setStyleSheet(
            "#canvasToolbar{background:#26262c;border:1px solid #3a3a46;"
            "border-radius:8px;}"
            "QPushButton{background:transparent;border:none;color:#dcdde0;"
            "padding:5px 10px;border-radius:6px;font-size:12px;}"
            "QPushButton:hover{background:#33333e;}")
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(6, 4, 6, 4)
        lay.setSpacing(2)
        self._add_tool(lay, "＋ Nota", self._pick_and_add_note)
        self._add_tool(lay, "＋ Texto", self._add_text_center)
        bar.adjustSize()
        bar.move(12, 12)
        return bar

    def _add_tool(self, layout, label, slot):
        btn = QPushButton(label)
        btn.setCursor(Qt.PointingHandCursor)
        btn.clicked.connect(slot)
        layout.addWidget(btn)
        return btn

    def _viewport_center_scene(self) -> QPointF:
        return self.mapToScene(self.viewport().rect().center())

    def _add_text_center(self):
        self.add_text_node(self._viewport_center_scene())

    def _pick_and_add_note(self):
        if self.vault is None:
            return
        try:
            notes = self.service.index.cached_notes() or self.vault.all_notes()
        except Exception:
            notes = self.vault.all_notes()
        if not notes:
            return
        labels = [n.title for n in notes]
        choice, ok = QInputDialog.getItem(
            self, "Añadir nota al canvas", "Nota:", labels, 0, True)
        if not ok or not choice:
            return
        note = next((n for n in notes if n.title == choice), None)
        if note is not None:
            self.add_note_node(note.path, self._viewport_center_scene())

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if getattr(self, "_toolbar", None) is not None:
            self._toolbar.move(12, 12)

    def set_context(self, vault, service):
        self.vault = vault
        self.service = service

    def _vault_root(self):
        return Path(self.vault.vault_root) if self.vault is not None else None

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
        if node.type == "file" and node.file:
            root = self._vault_root()
            abs_path = (root / node.file) if root else Path(node.file)
            item = NoteNodeItem(node, abs_path, self.service)
            item.open_requested.connect(self.open_note_requested.emit)
        elif node.type == "text":
            item = TextNodeItem(node)
        else:
            # Unknown/other node types render as a plain card for now; later
            # phases (shapes, drawing, media) replace these with real items.
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
        for item in self._items.values():
            if hasattr(item, "flush"):
                try:
                    item.flush()
                except Exception:
                    pass
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

    def add_note_node(self, note_path, scene_pos: QPointF):
        """Embed an existing vault note as a file node on the board."""
        note_path = Path(note_path)
        root = self._vault_root()
        try:
            rel = note_path.relative_to(root).as_posix() if root else str(note_path)
        except ValueError:
            rel = str(note_path)
        node = cf.CanvasNode(id=cf.new_id(), type="file",
                             x=scene_pos.x(), y=scene_pos.y(),
                             width=320, height=220, file=rel)
        self._doc.nodes.append(node)
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        return item

    # ── drag & drop from the explorer / OS ──────────────────────────────
    def _paths_from_mime(self, mime):
        paths = []
        if mime.hasUrls():
            for url in mime.urls():
                if url.isLocalFile():
                    paths.append(Path(url.toLocalFile()))
        return paths

    def dragEnterEvent(self, event):
        if self._paths_from_mime(event.mimeData()):
            event.acceptProposedAction()
        else:
            super().dragEnterEvent(event)

    def dragMoveEvent(self, event):
        if self._paths_from_mime(event.mimeData()):
            event.acceptProposedAction()
        else:
            super().dragMoveEvent(event)

    def dropEvent(self, event):
        paths = self._paths_from_mime(event.mimeData())
        if not paths:
            super().dropEvent(event)
            return
        pos = self.mapToScene(event.position().toPoint())
        for i, p in enumerate(paths):
            offset = QPointF(pos.x() + i * 24, pos.y() + i * 24)
            if p.suffix.lower() == ".md":
                self.add_note_node(p, offset)
            elif p.suffix.lower() in (".png", ".jpg", ".jpeg", ".gif", ".webp",
                                      ".bmp", ".svg", ".mp3", ".wav", ".ogg",
                                      ".m4a", ".mp4", ".webm", ".mov"):
                # Media nodes arrive in C2; for now drop them as file nodes.
                self.add_note_node(p, offset)
        event.acceptProposedAction()

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

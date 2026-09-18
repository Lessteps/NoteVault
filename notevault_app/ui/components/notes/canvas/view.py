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
    QFileDialog, QGraphicsPathItem, QMenu,
)
from PySide6.QtCore import Qt, QTimer, Signal, QPointF
from PySide6.QtGui import QPainter, QPen, QColor, QPainterPath

from .... import theme  # noqa: F401  (kept for future theme-aware repaint)
from .....core import canvas_format as cf
from .....core import attachments
from .scene import CanvasScene
from .items import (
    TextNodeItem, NoteNodeItem, MediaNodeItem, BaseNodeItem, ShapeNodeItem,
    DrawingNodeItem, color_for
)
from .edges import EdgeItem
from .shapes import SHAPE_INFO
from .drawing import stroke_to_path, calculate_bounds

MODE_SELECT = 0
MODE_DRAW = 1
MODE_ERASE = 2

_MEDIA_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
               ".mp3", ".wav", ".ogg", ".m4a", ".flac",
               ".mp4", ".webm", ".mov", ".mkv", ".avi"}


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
        self._edge_items = {}     # edge id -> EdgeItem
        self._connecting_src = None
        self._connecting_side = None
        self._temp_edge = None
        self._mode = MODE_SELECT
        self._pen_color = "1"
        self._pen_width = 3.0
        self._current_stroke_pts = []
        self._temp_drawing_path = None
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
        self._add_tool(lay, "＋ Media", self._pick_and_add_media)
        self._add_shape_tool(lay)
        self._add_drawing_tool(lay)
        self._add_tool(lay, "＋ Conectar", self._pick_and_connect)
        bar.adjustSize()
        bar.move(12, 12)
        return bar

    def _add_tool(self, layout, label, slot):
        btn = QPushButton(label)
        btn.setCursor(Qt.PointingHandCursor)
        btn.clicked.connect(slot)
        layout.addWidget(btn)
        return btn

    def _add_drawing_tool(self, layout):
        btn = QPushButton("✎ Dibujo ▾")
        btn.setCursor(Qt.PointingHandCursor)
        menu = QMenu(btn)
        menu.setStyleSheet(
            "QMenu{background:#26262c;border:1px solid #3a3a46;color:#dcdde0;padding:4px;}"
            "QMenu::item{padding:5px 18px;border-radius:4px;font-size:12px;}"
            "QMenu::item:selected{background:#7c5af0;color:#ffffff;}")

        act_draw = menu.addAction("✎ Lápiz")
        act_draw.triggered.connect(lambda: self.set_mode(MODE_DRAW))

        act_erase = menu.addAction("⌫ Borrador")
        act_erase.triggered.connect(lambda: self.set_mode(MODE_ERASE))

        act_select = menu.addAction("↖ Seleccionar")
        act_select.triggered.connect(lambda: self.set_mode(MODE_SELECT))

        menu.addSeparator()

        color_menu = menu.addMenu("Color del trazo")
        colors = [
            ("Rojo", "1"), ("Naranja", "2"), ("Amarillo", "3"),
            ("Verde", "4"), ("Cian", "5"), ("Púrpura", "6"), ("Blanco", "#ffffff"),
        ]
        for name, col in colors:
            c_act = color_menu.addAction(name)
            c_act.triggered.connect(lambda chk, c=col: self.set_pen_color(c))

        width_menu = menu.addMenu("Grosor del trazo")
        widths = [("Fino (2px)", 2.0), ("Medio (4px)", 4.0), ("Grueso (8px)", 8.0)]
        for label, w in widths:
            w_act = width_menu.addAction(label)
            w_act.triggered.connect(lambda chk, width=w: self.set_pen_width(width))

        btn.setMenu(menu)
        layout.addWidget(btn)
        return btn

    def set_mode(self, mode: int):
        self._mode = mode
        if mode == MODE_DRAW:
            self.setCursor(Qt.CrossCursor)
        elif mode == MODE_ERASE:
            self.setCursor(Qt.PointingHandCursor)
        else:
            self.setCursor(Qt.ArrowCursor)

    def set_pen_color(self, color: str):
        self._pen_color = color
        self.set_mode(MODE_DRAW)

    def set_pen_width(self, width: float):
        self._pen_width = width
        self.set_mode(MODE_DRAW)

    def _add_shape_tool(self, layout):
        btn = QPushButton("＋ Forma ▾")
        btn.setCursor(Qt.PointingHandCursor)
        menu = QMenu(btn)
        menu.setStyleSheet(
            "QMenu{background:#26262c;border:1px solid #3a3a46;color:#dcdde0;padding:4px;}"
            "QMenu::item{padding:5px 18px;border-radius:4px;font-size:12px;}"
            "QMenu::item:selected{background:#7c5af0;color:#ffffff;}")
        for kind, info in SHAPE_INFO.items():
            act = menu.addAction(info["name"])
            act.setToolTip(info.get("desc", ""))
            act.triggered.connect(lambda chk, k=kind: self.add_shape_node(k, self._viewport_center_scene()))
        btn.setMenu(menu)
        layout.addWidget(btn)
        return btn

    def _viewport_center_scene(self) -> QPointF:
        return self.mapToScene(self.viewport().rect().center())

    def _add_text_center(self):
        self.add_text_node(self._viewport_center_scene())

    def _pick_and_connect(self):
        if len(self._items) < 2:
            return
        items_list = list(self._items.values())
        labels = []
        for it in items_list:
            lbl = getattr(it.node, "text", "") or getattr(it.node, "file", "") or it.node.id
            lbl = (lbl.splitlines()[0] if lbl else it.node.id)[:25]
            labels.append(f"{lbl} ({it.node.id[:6]})")
        src_label, ok1 = QInputDialog.getItem(
            self, "Conectar nodos", "Nodo origen:", labels, 0, False)
        if not ok1 or not src_label:
            return
        dst_labels = [l for l in labels if l != src_label]
        dst_label, ok2 = QInputDialog.getItem(
            self, "Conectar nodos", "Nodo destino:", dst_labels, 0, False)
        if not ok2 or not dst_label:
            return
        src_idx = labels.index(src_label)
        dst_idx = labels.index(dst_label)
        src_node = items_list[src_idx].node
        dst_node = items_list[dst_idx].node
        self.add_edge(src_node.id, dst_node.id)

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

    def _pick_and_add_media(self):
        fname, _ = QFileDialog.getOpenFileName(
            self, "Añadir imagen, audio o video", "",
            "Media (*.png *.jpg *.jpeg *.gif *.webp *.bmp *.svg "
            "*.mp3 *.wav *.ogg *.m4a *.flac *.mp4 *.webm *.mov *.mkv *.avi)")
        if fname:
            self.add_media_node(Path(fname), self._viewport_center_scene())

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
        self._edge_items.clear()
        for node in self._doc.nodes:
            self._add_item_for(node)
        for edge in self._doc.edges:
            self._add_edge_item_for(edge)
        self._loading = False

    def _add_item_for(self, node) -> BaseNodeItem:
        if node.type == "file" and node.file:
            root = self._vault_root()
            abs_path = (root / node.file) if root else Path(node.file)
            media = node.nv.get("media") or attachments.kind_of(abs_path)
            if media in ("image", "audio", "video"):
                item = MediaNodeItem(node, abs_path, media)
            else:
                item = NoteNodeItem(node, abs_path, self.service)
                item.open_requested.connect(self.open_note_requested.emit)
        elif node.type == "nv-shape":
            item = ShapeNodeItem(node)
        elif node.type == "nv-drawing":
            item = DrawingNodeItem(node)
        elif node.type == "text":
            item = TextNodeItem(node)
        else:
            item = TextNodeItem(node)
        item.geometry_changed.connect(lambda n=node: self._on_node_geometry_changed(n.id))
        item.edited.connect(self._schedule_save)
        item.connection_drag_started.connect(self._on_connection_drag_started)
        self._scene.addItem(item)
        self._items[node.id] = item
        return item

    def _on_node_geometry_changed(self, node_id: str):
        for edge_item in self._edge_items.values():
            if edge_item.edge.fromNode == node_id or edge_item.edge.toNode == node_id:
                edge_item.update_path()
        self._schedule_save()

    def _add_edge_item_for(self, edge: cf.CanvasEdge):
        src = self._items.get(edge.fromNode)
        dst = self._items.get(edge.toNode)
        if src is None or dst is None:
            return None
        edge_item = EdgeItem(edge, src, dst, on_changed=self._schedule_save)
        self._scene.addItem(edge_item)
        self._edge_items[edge.id] = edge_item
        return edge_item

    def add_edge(self, from_node_id: str, to_node_id: str,
                 from_side: str = "right", to_side: str = "left",
                 label: str = "", color: str = "", style: str = "solid",
                 routing: str = "bezier", from_end: str = "none",
                 to_end: str = "arrow"):
        nv_ext = {}
        if style != "solid":
            nv_ext["style"] = style
        if routing != "bezier":
            nv_ext["routing"] = routing
        edge = cf.CanvasEdge(
            id=cf.new_id(),
            fromNode=from_node_id,
            toNode=to_node_id,
            fromSide=from_side,
            toSide=to_side,
            fromEnd=from_end,
            toEnd=to_end,
            color=color,
            label=label,
            nv=nv_ext
        )
        self._doc.edges.append(edge)
        edge_item = self._add_edge_item_for(edge)
        self._schedule_save()
        return edge_item

    def _on_connection_drag_started(self, item, side: str, scene_pos: QPointF):
        self._connecting_src = item
        self._connecting_side = side
        self._temp_edge = QGraphicsPathItem()
        pen = QPen(QColor("#7c5af0"), 2.0, Qt.DashLine)
        pen.setCapStyle(Qt.RoundCap)
        self._temp_edge.setPen(pen)
        self._temp_edge.setZValue(100)
        p1 = item.side_point(side)
        path = QPainterPath(p1)
        path.lineTo(scene_pos)
        self._temp_edge.setPath(path)
        self._scene.addItem(self._temp_edge)

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
        self._scene.clearSelection()
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
        self._scene.clearSelection()
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        return item

    def add_media_node(self, media_path, scene_pos: QPointF):
        """Copy an image/audio/video into the vault and embed it as a media
        node. Files already in the vault are referenced where they are."""
        media_path = Path(media_path)
        root = self._vault_root()
        kind = attachments.kind_of(media_path) or "image"
        stored = media_path
        if root is not None:
            try:
                media_path.relative_to(root)      # already inside the vault
            except ValueError:
                # Import beside the canvas file (its attachments folder).
                anchor = self._path or (root / "canvas")
                stored = attachments.import_file(anchor, media_path)
        try:
            rel = stored.relative_to(root).as_posix() if root else str(stored)
        except ValueError:
            rel = str(stored)
        w, h = (360, 260) if kind == "video" else (
            (320, 240) if kind == "image" else (280, 64))
        node = cf.CanvasNode(id=cf.new_id(), type="file",
                             x=scene_pos.x(), y=scene_pos.y(),
                             width=w, height=h, file=rel, nv={"media": kind})
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        return item

    def add_shape_node(self, shape_kind: str, scene_pos: QPointF, text: str = ""):
        info = SHAPE_INFO.get(shape_kind, {})
        w, h = info.get("default_size", (160.0, 60.0))
        label = text if text else info.get("name", "Forma")
        node = cf.CanvasNode(
            id=cf.new_id(),
            type="nv-shape",
            x=scene_pos.x(),
            y=scene_pos.y(),
            width=w,
            height=h,
            text=label,
            nv={"shape": shape_kind}
        )
        self._doc.nodes.append(node)
        self._scene.clearSelection()
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
            elif p.suffix.lower() in _MEDIA_EXTS:
                self.add_media_node(p, offset)
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
        if self._mode == MODE_DRAW and event.button() == Qt.LeftButton:
            scene_pos = self.mapToScene(event.position().toPoint())
            self._current_stroke_pts = [[scene_pos.x(), scene_pos.y()]]
            self._temp_drawing_path = QGraphicsPathItem()
            col = color_for(self._pen_color)
            pen = QPen(col, self._pen_width, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin)
            self._temp_drawing_path.setPen(pen)
            self._temp_drawing_path.setZValue(50)
            self._scene.addItem(self._temp_drawing_path)
            event.accept()
            return
        if self._mode == MODE_ERASE and event.button() == Qt.LeftButton:
            self._erase_at(event.position().toPoint())
            event.accept()
            return
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
        if self._mode == MODE_DRAW and self._temp_drawing_path is not None:
            scene_pos = self.mapToScene(event.position().toPoint())
            self._current_stroke_pts.append([scene_pos.x(), scene_pos.y()])
            path = stroke_to_path(self._current_stroke_pts)
            self._temp_drawing_path.setPath(path)
            event.accept()
            return
        if self._mode == MODE_ERASE and (event.buttons() & Qt.LeftButton):
            self._erase_at(event.position().toPoint())
            event.accept()
            return
        if self._connecting_src is not None and self._temp_edge is not None:
            p1 = self._connecting_src.side_point(self._connecting_side)
            p2 = self.mapToScene(event.position().toPoint())
            path = QPainterPath(p1)
            path.lineTo(p2)
            self._temp_edge.setPath(path)
            event.accept()
            return
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
        if self._mode == MODE_DRAW and self._temp_drawing_path is not None:
            self._scene.removeItem(self._temp_drawing_path)
            self._temp_drawing_path = None
            if len(self._current_stroke_pts) >= 2:
                self.add_drawing_stroke(self._current_stroke_pts, self._pen_color, self._pen_width)
            self._current_stroke_pts = []
            event.accept()
            return
        if self._mode == MODE_ERASE:
            event.accept()
            return
        if self._connecting_src is not None:
            if self._temp_edge is not None:
                self._scene.removeItem(self._temp_edge)
                self._temp_edge = None
            scene_pos = self.mapToScene(event.position().toPoint())
            target = None
            for it in self._scene.items(scene_pos):
                if isinstance(it, BaseNodeItem) and it != self._connecting_src:
                    target = it
                    break
            if target is not None:
                local_pos = target.mapFromScene(scene_pos)
                target_side = target.port_at(local_pos, threshold=24.0)
                if not target_side:
                    p1 = self._connecting_src.side_point(self._connecting_side)
                    best_dist = None
                    for s in ("top", "right", "bottom", "left"):
                        sp = target.side_point(s)
                        d = (sp.x() - p1.x()) ** 2 + (sp.y() - p1.y()) ** 2
                        if best_dist is None or d < best_dist:
                            best_dist = d
                            target_side = s
                self.add_edge(self._connecting_src.node.id, target.node.id,
                              from_side=self._connecting_side, to_side=target_side or "left")
            self._connecting_src = None
            self._connecting_side = None
            event.accept()
            return
        if self._panning:
            self._panning = False
            self.setCursor(Qt.ArrowCursor)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def add_drawing_stroke(self, points: list, color: str = "1", width: float = 3.0):
        min_x, min_y, max_x, max_y = calculate_bounds([{"points": points, "width": width}])
        w = max(40.0, max_x - min_x)
        h = max(30.0, max_y - min_y)
        local_pts = [[p[0] - min_x, p[1] - min_y] for p in points]
        stroke_data = {"points": local_pts, "color": color, "width": width}
        node = cf.CanvasNode(
            id=cf.new_id(),
            type="nv-drawing",
            x=min_x,
            y=min_y,
            width=w,
            height=h,
            nv={"strokes": [stroke_data]}
        )
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        item = self._add_item_for(node)
        self._schedule_save()
        return item

    def _erase_at(self, view_pos):
        scene_pos = self.mapToScene(view_pos)
        to_delete = []
        for it in list(self._items.values()):
            if isinstance(it, DrawingNodeItem):
                local_pos = it.mapFromScene(scene_pos)
                if it.remove_stroke_at(local_pos):
                    if not (it.node.nv or {}).get("strokes"):
                        to_delete.append(it)
                    self._schedule_save()
        for it in to_delete:
            nid = it.node.id
            self._doc.nodes = [n for n in self._doc.nodes if n.id != nid]
            self._scene.removeItem(it)
            self._items.pop(nid, None)
            self._schedule_save()

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
        selected = list(self._scene.selectedItems())
        for item in selected:
            if isinstance(item, EdgeItem):
                eid = item.edge.id
                self._doc.edges = [e for e in self._doc.edges if e.id != eid]
                self._scene.removeItem(item)
                self._edge_items.pop(eid, None)
                removed = True

        for item in selected:
            if isinstance(item, BaseNodeItem):
                if hasattr(item, "stop"):
                    item.stop()
                nid = item.node.id
                edges_to_del = [e for e in self._doc.edges if e.fromNode == nid or e.toNode == nid]
                for e in edges_to_del:
                    if e.id in self._edge_items:
                        self._scene.removeItem(self._edge_items[e.id])
                        self._edge_items.pop(e.id, None)
                self._doc.nodes = [n for n in self._doc.nodes if n.id != nid]
                self._doc.edges = [e for e in self._doc.edges
                                   if e.fromNode != nid and e.toNode != nid]
                self._scene.removeItem(item)
                self._items.pop(nid, None)
                removed = True
        if removed:
            self._schedule_save()

"""CanvasView: the widget that opens and edits one ``.canvas`` file.

C0 scaffolding: an infinite grid with pan (drag empty space or middle mouse),
zoom (Ctrl+wheel), and text cards you can add (double-click empty space),
move, resize and edit in place. Everything autosaves back to the file.

Later phases add: note nodes, media (image/audio/video), edges, flowchart
shapes and freehand drawing (see docs/PLAN_CANVAS_Y_BACKLINKS.md).
"""

import copy
import re
from pathlib import Path

from PySide6.QtWidgets import (
    QGraphicsView, QGraphicsScene, QApplication, QFrame, QHBoxLayout, QVBoxLayout, QPushButton,
    QInputDialog, QFileDialog, QGraphicsPathItem, QMenu, QGraphicsTextItem,
    QGraphicsProxyWidget, QTextEdit, QLineEdit, QMessageBox, QWidget, QLabel,
)
from PySide6.QtCore import Qt, QTimer, Signal, QPointF, QRectF, QMimeData
from PySide6.QtGui import QPainter, QPen, QColor, QPainterPath, QImage, QCursor, QBrush

from .... import theme  # noqa: F401  (kept for future theme-aware repaint)
from .....core import canvas_format as cf
from .....core import attachments
from .scene import CanvasScene
from .items import (
    TextNodeItem, NoteNodeItem, MediaNodeItem, BaseNodeItem, ShapeNodeItem,
    DrawingNodeItem, GroupNodeItem, LinkNodeItem, color_for
)
from .edges import EdgeItem
from .shapes import SHAPE_INFO
from .drawing import stroke_to_path, calculate_bounds
from .outline import CanvasOutlineWidget

# Clipboard format that marks "these are copied canvas cards".
_WEB_URL = re.compile(r"^https?://\S+$")
CANVAS_CLIP_MIME = "application/x-notevault-canvas-nodes"

MODE_SELECT = 0
MODE_DRAW = 1
MODE_ERASE = 2

_MEDIA_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
               ".mp3", ".wav", ".ogg", ".m4a", ".flac",
               ".mp4", ".webm", ".mov", ".mkv", ".avi"}


class _ToolButton(QFrame):
    """One Excalidraw-style toolbar cell: an icon with its shortcut key printed
    small underneath, reacting to hover and (optionally) a checked state. A
    single left click runs the action — nothing is hidden behind a submenu."""

    clicked = Signal()

    def __init__(self, glyph: str, key: str = "", tooltip: str = "",
                 enabled: bool = True, parent=None):
        super().__init__(parent)
        self.setObjectName("toolCell")
        self.setAttribute(Qt.WA_StyledBackground, True)
        self._enabled = enabled
        self._checked = False
        if enabled:
            self.setCursor(Qt.PointingHandCursor)
        if tooltip:
            self.setToolTip(tooltip)

        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 3, 0, 2)
        lay.setSpacing(0)
        self._icon = QLabel(glyph)
        self._icon.setAlignment(Qt.AlignCenter)
        self._icon.setStyleSheet(
            "background:transparent;font-size:15px;"
            + ("color:#dcdde0;" if enabled else "color:#55555f;"))
        self._cap = QLabel(key)
        self._cap.setAlignment(Qt.AlignCenter)
        self._cap.setStyleSheet(
            "background:transparent;color:#7a7a86;font-size:8px;font-weight:700;")
        lay.addWidget(self._icon)
        lay.addWidget(self._cap)
        self.setFixedSize(36, 40)
        self._apply(False)

    def _apply(self, hover: bool):
        if self._checked:
            bg = "rgba(124,90,240,0.24)"
        elif hover and self._enabled:
            bg = "#33333e"
        else:
            bg = "transparent"
        self.setStyleSheet(f"#toolCell{{background:{bg};border-radius:7px;}}")

    def setChecked(self, on: bool):
        self._checked = bool(on)
        self._apply(False)

    def enterEvent(self, event):
        self._apply(True)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._apply(False)
        super().leaveEvent(event)

    def mousePressEvent(self, event):
        if self._enabled and event.button() == Qt.LeftButton:
            self.clicked.emit()
            event.accept()
            return
        super().mousePressEvent(event)


class CanvasView(QGraphicsView):
    open_note_requested = Signal(object)          # Path — open in current tab
    open_note_in_new_tab_requested = Signal(object)   # Path — middle-click: new tab

    def __init__(self, vault=None, service=None, parent=None):
        super().__init__(parent)
        self.vault = vault
        self.service = service
        self.setAcceptDrops(True)
        self._scene = CanvasScene(self)
        self.setScene(self._scene)

        # Layer 1: Hardware-accelerated GPU viewport via QOpenGLWidget
        try:
            from PySide6.QtOpenGLWidgets import QOpenGLWidget
            self._gl_viewport = QOpenGLWidget()
            self.setViewport(self._gl_viewport)
        except Exception:
            pass

        self.setRenderHint(QPainter.Antialiasing)
        self.setViewportUpdateMode(QGraphicsView.SmartViewportUpdate)
        self.setOptimizationFlag(QGraphicsView.DontSavePainterState, True)
        self.setOptimizationFlag(QGraphicsView.DontAdjustForAntialiasing, True)
        self.setDragMode(QGraphicsView.RubberBandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.AnchorViewCenter)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        self._path = None
        self._doc = cf.CanvasDoc()
        self._items = {}          # node id -> BaseNodeItem
        self._edge_items = {}     # edge id -> EdgeItem
        self._node_edges = {}     # node id -> set of EdgeItem (O(1) adjacency map)
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
        self._snap_to_grid = False
        self._snap_to_objects = True     # align to other nodes' edges while moving
        self._read_only = False
        self._align_guides = []          # transient guide lines while dragging
        self._undo_stack = []            # list[dict] — CanvasDoc snapshots
        self._redo_stack = []
        self._clipboard_nodes = []
        self._clipboard_edges = []
        self._btn_snap = None
        self._btn_draw = None   # draw-mode toggle button in toolbar

        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(600)
        self._save_timer.timeout.connect(self._save_now)

        self._toolbar = self._build_toolbar()
        self._outline = CanvasOutlineWidget(self)

    # ── single Excalidraw-style toolbar (every tool one click, key below) ──
    def _build_toolbar(self):
        bar = QFrame(self)
        bar.setObjectName("canvasToolbar")
        bar.setStyleSheet(
            "#canvasToolbar{background:#26262c;border:1px solid #3a3a46;"
            "border-radius:10px;}"
        )
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(7, 3, 7, 3)
        lay.setSpacing(2)

        # Group A — create (bottom-row keys, letter shown under each icon).
        self._tool(lay, "📄", "Z", "Añadir tarjeta de texto (Z)", self._add_text_center)
        self._tool(lay, "📝", "X", "Añadir nota de la vault (X)", self._pick_and_add_note)
        self._tool(lay, "🖼", "C", "Añadir multimedia de la vault (C)", self._pick_and_add_media)
        self._tool(lay, "🌐", "V", "Añadir página web (V · Próximamente)", None, enabled=False)
        self._tool(lay, "🔲", "B", "Crear grupo (B · Ctrl+G)", self.create_group_from_selection)
        self._btn_draw = self._tool(lay, "✏", "N", "Dibujo libre (N)", self._toggle_draw_mode)

        self._divider(lay)

        # Group B — what used to hide in the ⋯ menu, now one click each.
        self._tool(lay, "⧉", "A", "Añadir canvas embebido (A)", self._pick_and_add_canvas)
        self._tool(lay, "🔗", "S", "Añadir enlace web (S)", self._pick_and_add_link)
        self._tool(lay, "◇", "F", "Añadir forma de diagrama (F)", self._open_shapes_menu)
        self._tool(lay, "⛓", "G", "Conectar dos nodos (G)", self._pick_and_connect)

        self._divider(lay)

        # Group C — view, history and utilities (no letter key).
        self._btn_snap = self._tool(lay, "🧲", "", "Ajustar a la cuadrícula", self._toggle_snap)
        self._btn_snap.setChecked(self._snap_to_grid)
        self._tool(lay, "📷", "", "Exportar como PNG…", lambda: self.export_to_png())
        self._tool(lay, "−", "", "Alejar (zoom out)", lambda: self.zoom_by(1 / 1.2))
        self._tool(lay, "＋", "", "Acercar (zoom in)", lambda: self.zoom_by(1.2))
        self._tool(lay, "⛶", "", "Ajustar a la pantalla (Ctrl+0)", self.zoom_to_fit)
        self._tool(lay, "↶", "", "Deshacer (Ctrl+Z)", self.undo)
        self._tool(lay, "↷", "", "Rehacer (Ctrl+Shift+Z)", self.redo)
        self._tool(lay, "?", "", "Ayuda del canvas", self._show_help_popup)

        bar.adjustSize()
        return bar

    def _tool(self, layout, glyph, key, tooltip, slot, enabled=True):
        cell = _ToolButton(glyph, key, tooltip, enabled=enabled)
        if slot is not None:
            cell.clicked.connect(slot)
        layout.addWidget(cell)
        return cell

    def _divider(self, layout):
        sep = QFrame()
        sep.setFrameShape(QFrame.VLine)
        sep.setStyleSheet("background:#3a3a46;max-width:1px;margin:7px 3px;")
        layout.addWidget(sep)

    def _open_shapes_menu(self):
        """One click opens the flowchart-shape palette; picking one drops it
        at the centre of the view."""
        menu = QMenu(self)
        menu.setStyleSheet(
            "QMenu{background:#26262c;border:1px solid #3a3a46;color:#dcdde0;padding:4px;}"
            "QMenu::item{padding:5px 18px;border-radius:4px;font-size:12px;}"
            "QMenu::item:selected{background:#7c5af0;color:#ffffff;}"
        )
        for kind, info in SHAPE_INFO.items():
            act = menu.addAction(info["name"])
            act.triggered.connect(
                lambda chk, k=kind: self.add_shape_node(k, self._viewport_center_scene()))
        menu.exec(self.mapToGlobal(self.viewport().rect().center()))

    def _show_help_popup(self):
        QMessageBox.information(
            self, "Ayuda del canvas",
            "Atajos de teclado del Canvas:\n\n"
            "Crear (letra debajo de cada icono en la barra):\n"
            "• Z: Tarjeta de texto\n"
            "• X: Nota de la vault\n"
            "• C: Multimedia de la vault\n"
            "• V: Página web (próximamente)\n"
            "• B: Crear grupo\n"
            "• N: Dibujo libre\n"
            "• A: Canvas embebido\n"
            "• S: Enlace web\n"
            "• F: Formas de diagrama\n"
            "• G: Conectar nodos\n\n"
            "• Espacio / Rueda ratón: Desplazar (Pan)\n"
            "• Ctrl + Rueda: Zoom\n"
            "• Ctrl + 0: Ajustar vista al contenido\n"
            "• Ctrl + G: Crear grupo a partir de selección\n"
            "• Ctrl + C / Ctrl + V: Copiar / Pegar\n"
            "• Ctrl + D: Duplicar selección\n"
            "• Ctrl + Z: Deshacer\n"
            "• Ctrl + Shift + Z / Ctrl + Y: Rehacer\n"
            "• Supr / Retroceso: Eliminar selección\n"
            "• Clic central en nota: Abrir en nueva pestaña\n"
            "• Doble clic en cuerpo de nota: Editar texto en sitio"
        )

    def zoom_by(self, factor: float):
        current_scale = self.transform().m11()
        if (factor > 1 and current_scale < 6.0) or (factor < 1 and current_scale > 0.08):
            self.scale(factor, factor)

    def reset_transform_and_center(self):
        self.resetTransform()
        rect = self._scene.itemsBoundingRect()
        if not rect.isEmpty() and rect.width() > 0 and rect.height() > 0:
            self.centerOn(rect.center())
        else:
            self.centerOn(0, 0)

    def set_mode(self, mode: int):
        self._mode = mode
        if mode == MODE_DRAW:
            self.setCursor(Qt.CrossCursor)
        elif mode == MODE_ERASE:
            self.setCursor(Qt.PointingHandCursor)
        else:
            self.setCursor(Qt.ArrowCursor)
        # Keep the draw button highlighted while draw mode is on.
        btn = getattr(self, "_btn_draw", None)
        if btn is not None:
            btn.setChecked(mode == MODE_DRAW)

    def _toggle_draw_mode(self):
        """Toggle between draw mode and select mode."""
        if self._mode == MODE_DRAW:
            self.set_mode(MODE_SELECT)
        else:
            self.set_mode(MODE_DRAW)

    def set_pen_color(self, color: str):
        self._pen_color = color
        self.set_mode(MODE_DRAW)

    def set_pen_width(self, width: float):
        self._pen_width = width
        self.set_mode(MODE_DRAW)

    def _viewport_center_scene(self) -> QPointF:
        return self.mapToScene(self.viewport().rect().center())

    def _add_text_center(self):
        self.add_text_node(self._viewport_center_scene())

    # Arrow keys fan text cards out of the selected node: every card links back
    # to that same node (not to each other), and cards on the same side stack
    # perpendicular to the arrow (press → repeatedly → a column of cards to the
    # right, each joined to the node). The node stays selected the whole time,
    # so the fan keeps growing until the user clicks a different node. The slot
    # index is counted from the node's existing edges on that side, so deleting
    # a card frees its slot — there is no stored history to go stale.
    _LINK_GAP = 60           # distance from the node to the card, along the arrow
    _STACK_GAP = 30          # spacing between cards stacked on the same side
    _CARD_W, _CARD_H = 250, 100

    def _selected_node_item(self):
        sel = [it for it in self._scene.selectedItems()
               if isinstance(it, BaseNodeItem)]
        return sel[-1] if sel else None

    def _spawn_linked_text(self, direction: str):
        anchor_item = self._selected_node_item()
        if anchor_item is None:
            # Nothing selected: drop a seed card at the centre and select it so
            # the next arrow fans out of it.
            c = self._viewport_center_scene()
            return self.add_text_node(
                QPointF(c.x() - self._CARD_W / 2, c.y() - self._CARD_H / 2))

        anchor = anchor_item.node
        ax, ay, aw, ah = anchor.x, anchor.y, anchor.width, anchor.height
        w, h, gap, sgap = self._CARD_W, self._CARD_H, self._LINK_GAP, self._STACK_GAP
        fs = {"right": "right", "left": "left", "up": "top", "down": "bottom"}[direction]
        ts = {"right": "left", "left": "right", "up": "bottom", "down": "top"}[direction]
        # How many cards already fan out of this node on this side → next slot.
        n = sum(1 for e in self._doc.edges
                if e.fromNode == anchor.id and e.fromSide == fs)

        if direction in ("right", "left"):
            x = ax + aw + gap if direction == "right" else ax - w - gap
            pos = QPointF(x, ay + n * (h + sgap))
        else:  # up / down → stack sideways
            y = ay + ah + gap if direction == "down" else ay - h - gap
            pos = QPointF(ax + n * (w + sgap), y)

        item = self.add_text_node(pos)
        if item is not None:
            self.add_edge(anchor.id, item.node.id, from_side=fs, to_side=ts)
            # Keep the anchor selected, never the new card.
            self._scene.clearSelection()
            anchor_item.setSelected(True)
            self.ensureVisible(item, 40, 40)
        return item

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
        self.push_undo()
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

    def _pick_and_add_canvas(self, scene_pos=None):
        if self.vault is None:
            return
        try:
            canvases = self.vault.canvas_paths()
        except Exception:
            root = self._vault_root()
            canvases = sorted(root.rglob("*.canvas")) if root else []
        cur = self._path.resolve() if self._path else None
        canvases = [c for c in canvases if cur is None or c.resolve() != cur]
        if not canvases:
            QMessageBox.information(
                self, "Añadir canvas",
                "No se encontraron otros archivos .canvas en la vault."
            )
            return
        root = self._vault_root()
        labels = [
            c.relative_to(root).as_posix() if root and c.is_relative_to(root) else c.stem
            for c in canvases
        ]
        choice, ok = QInputDialog.getItem(
            self, "Añadir canvas al canvas", "Canvas:", labels, 0, False)
        if not ok or not choice:
            return
        idx = labels.index(choice)
        pos = scene_pos if scene_pos is not None else self._viewport_center_scene()
        self.add_canvas_node(canvases[idx], pos)

    def _pick_and_add_media(self):
        fname, _ = QFileDialog.getOpenFileName(
            self, "Añadir imagen, audio o video", "",
            "Media (*.png *.jpg *.jpeg *.gif *.webp *.bmp *.svg "
            "*.mp3 *.wav *.ogg *.m4a *.flac *.mp4 *.webm *.mov *.mkv *.avi)")
        if fname:
            self.add_media_node(Path(fname), self._viewport_center_scene())

    def resizeEvent(self, event):
        super().resizeEvent(event)
        vw = self.viewport().width()
        vh = self.viewport().height()
        if getattr(self, "_toolbar", None) is not None:
            self._toolbar.adjustSize()
            bw = self._toolbar.width()
            bh = self._toolbar.height()
            self._toolbar.move(max(8, int((vw - bw) / 2)), int(vh - bh - 16))
        if getattr(self, "_outline", None) is not None:
            self._outline.update_position()

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
        # Take keyboard focus so shortcuts (arrows create cards, Z/X/… tools)
        # work right away, without needing a click on the board first.
        self.setFocus(Qt.OtherFocusReason)
        # Open centred on the content, not on the canvas origin, so a board
        # always shows its nodes instead of empty space.
        QTimer.singleShot(0, self.center_on_content)

    def center_on_content(self):
        rect = self._scene.itemsBoundingRect()
        if not rect.isEmpty():
            self.centerOn(rect.center())

    def focus_on_target(self, target_id: str, target_rect=None):
        """Frames or centers the canvas camera on the target group/node with a glowing pulse."""
        item = self._items.get(target_id)
        if item is not None:
            rect = item.sceneBoundingRect()
        elif target_rect is not None:
            rect = target_rect
        else:
            return

        vw = self.viewport().width()
        vh = self.viewport().height()
        margin = 60.0
        frame_rect = rect.adjusted(-margin, -margin, margin, margin)

        if rect.width() > vw * 0.65 or rect.height() > vh * 0.65:
            self.fitInView(frame_rect, Qt.KeepAspectRatio)
        else:
            self.centerOn(rect.center())

        # Transient visual highlight pulse
        pulse = self._scene.addRect(
            rect.adjusted(-6, -6, 6, 6),
            QPen(QColor("#a370f7"), 3.0),
            QBrush(QColor(163, 112, 247, 45))
        )
        pulse.setZValue(999)
        QTimer.singleShot(1500, lambda: self._remove_pulse_item(pulse))

    def _remove_pulse_item(self, item):
        try:
            self._scene.removeItem(item)
        except Exception:
            pass

    def current_path(self):
        return self._path

    def _rebuild(self):
        self._loading = True
        # Layer 6: Disable spatial BSP tree indexing during bulk node insertion
        self._scene.setItemIndexMethod(QGraphicsScene.NoIndex)
        self._scene.clear()
        self._items.clear()
        self._edge_items.clear()
        self._node_edges.clear()
        for node in self._doc.nodes:
            self._add_item_for(node)
        for edge in self._doc.edges:
            self._add_edge_item_for(edge)
        # Re-enable optimized BSP tree in a single pass
        self._scene.setItemIndexMethod(QGraphicsScene.BspTreeIndex)
        self._scene.setBspTreeDepth(14)
        self._scene.ensure_bounds(self._scene.itemsBoundingRect())
        self._loading = False
        if getattr(self, "_outline", None) is not None:
            self._outline.rebuild_index()

    def _add_item_for(self, node) -> BaseNodeItem:
        if node.type == "file" and node.file:
            root = self._vault_root()
            abs_path = (root / node.file) if root else Path(node.file)
            media = (node.nv or {}).get("media") or attachments.kind_of(abs_path)
            is_canvas = (
                (node.nv or {}).get("embed") == "canvas"
                or str(node.file).lower().endswith(".canvas")
            )
            if is_canvas:
                try:
                    from .items import CanvasEmbedItem
                    item = CanvasEmbedItem(node, abs_path, self.service)
                    item.open_requested.connect(self.open_note_requested.emit)
                    item.open_in_new_tab_requested.connect(self.open_note_in_new_tab_requested.emit)
                except (ImportError, AttributeError):
                    item = NoteNodeItem(node, abs_path, self.service)
                    item.open_requested.connect(self.open_note_requested.emit)
                    item.open_in_new_tab_requested.connect(self.open_note_in_new_tab_requested.emit)
            elif media in ("image", "audio", "video"):
                item = MediaNodeItem(node, abs_path, media)
            else:
                item = NoteNodeItem(node, abs_path, self.service)
                item.open_requested.connect(self.open_note_requested.emit)
                item.open_in_new_tab_requested.connect(self.open_note_in_new_tab_requested.emit)
        elif node.type == "group":
            item = GroupNodeItem(node)
        elif node.type == "link":
            item = LinkNodeItem(node)
        elif node.type == "nv-shape":
            item = ShapeNodeItem(node)
        elif node.type == "nv-drawing":
            item = DrawingNodeItem(node)
        elif node.type == "text":
            item = TextNodeItem(node)
        else:
            item = TextNodeItem(node)
        if node.nv and "zIndex" in node.nv:
            try:
                item.setZValue(float(node.nv["zIndex"]))
            except Exception:
                pass
        item.geometry_changed.connect(lambda n=node: self._on_node_geometry_changed(n.id))
        item.edited.connect(self._schedule_save)
        item.connection_drag_started.connect(self._on_connection_drag_started)
        self._scene.addItem(item)
        self._items[node.id] = item
        return item

    def _on_node_geometry_changed(self, node_id: str):
        # Layer 5: O(1) adjacency lookup instead of iterating through all edges
        for edge_item in self._node_edges.get(node_id, ()):
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
        self._node_edges.setdefault(edge.fromNode, set()).add(edge_item)
        self._node_edges.setdefault(edge.toNode, set()).add(edge_item)
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
            if getattr(self, "_outline", None) is not None:
                self._outline.schedule_rebuild()

    def _save_now(self):
        if self._path is not None:
            try:
                if self._path.parent.exists():
                    cf.dump(self._path, self._doc)
            except Exception:
                pass

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

    # ── read-only / snap-to-objects / undo-redo (Feature B3, B2, C3) ─────
    def is_read_only(self) -> bool:
        return self._read_only

    def set_read_only(self, read_only: bool):
        """When on, nodes can't be moved/edited/deleted; pan/zoom/open still work."""
        from PySide6.QtWidgets import QGraphicsItem
        self._read_only = bool(read_only)
        for item in self._items.values():
            locked = bool(getattr(item, "is_locked", False))
            item.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable,
                         not self._read_only and not locked)
        if self._read_only:
            self.set_mode(MODE_SELECT)

    def set_snap_to_objects(self, on: bool):
        self._snap_to_objects = bool(on)

    def _clear_align_guides(self):
        for g in self._align_guides:
            try:
                self._scene.removeItem(g)
            except Exception:
                pass
        self._align_guides = []

    def _show_alignment_guides(self, lines: list):
        self._clear_align_guides()
        pen = QPen(QColor("#7c5af0"), 1, Qt.DashLine)
        for p1, p2 in lines:
            line_item = self._scene.addLine(p1.x(), p1.y(), p2.x(), p2.y(), pen)
            line_item.setZValue(999)
            self._align_guides.append(line_item)

    UNDO_LIMIT = 100

    def push_undo(self):
        """Public entry so items can snapshot before a drag/resize."""
        self._push_undo()

    def _push_undo(self):
        """Snapshot the document before any change (add/delete/paste/move/resize/
        connect). Keeps up to ``UNDO_LIMIT`` steps and skips a snapshot that is
        identical to the last one, so plain clicks don't fill the history."""
        if self._loading:
            return
        try:
            snap = copy.deepcopy(self._doc)
        except Exception:
            return
        if self._undo_stack and self._undo_stack[-1].to_dict() == snap.to_dict():
            return
        self._undo_stack.append(snap)
        while len(self._undo_stack) > self.UNDO_LIMIT:
            self._undo_stack.pop(0)
        self._redo_stack.clear()

    def _begin_mutation(self) -> bool:
        """Gate every structural change: blocked in read-only, else snapshots
        for undo. Returns False when the caller must abort."""
        if self._read_only:
            return False
        self._push_undo()
        return True

    def undo(self):
        if not self._undo_stack:
            return
        self.flush()
        self._redo_stack.append(copy.deepcopy(self._doc))
        self._doc = self._undo_stack.pop()
        self._rebuild()
        self._save_now()

    def redo(self):
        if not self._redo_stack:
            return
        self._undo_stack.append(copy.deepcopy(self._doc))
        self._doc = self._redo_stack.pop()
        self._rebuild()
        self._save_now()

    # ── node creation ───────────────────────────────────────────────────
    def add_text_node(self, scene_pos: QPointF, text: str = "",
                      width: float = 250, height: float = 100):
        if not self._begin_mutation():
            return None
        node = cf.CanvasNode(id=cf.new_id(), type="text",
                             x=scene_pos.x(), y=scene_pos.y(),
                             width=width, height=height, text=text)
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        return item

    def add_note_node(self, note_path, scene_pos: QPointF):
        """Embed an existing vault note as a file node on the board."""
        if not self._begin_mutation():
            return None
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

    def add_canvas_node(self, canvas_path, scene_pos: QPointF):
        """Embed an existing vault .canvas file as an embedded canvas node."""
        if not self._begin_mutation():
            return None
        canvas_path = Path(canvas_path)
        root = self._vault_root()
        try:
            rel = canvas_path.relative_to(root).as_posix() if root else str(canvas_path)
        except ValueError:
            rel = str(canvas_path)
        node = cf.CanvasNode(id=cf.new_id(), type="file",
                             x=scene_pos.x(), y=scene_pos.y(),
                             width=360, height=260, file=rel,
                             nv={"embed": "canvas"})
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        item = self._add_item_for(node)
        if item is not None:
            item.setSelected(True)
        self._schedule_save()
        return item

    def add_media_node(self, media_path, scene_pos: QPointF):
        """Copy an image/audio/video into the vault and embed it as a media
        node. Files already in the vault are referenced where they are."""
        if not self._begin_mutation():
            return None
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
        if not self._begin_mutation():
            return None
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

    def _add_group_center(self):
        self.add_group_node(self._viewport_center_scene())

    def add_group_node(self, scene_pos: QPointF, label: str = "Grupo") -> GroupNodeItem:
        if not self._begin_mutation():
            return None
        node = cf.CanvasNode(
            id=cf.new_id(),
            type="group",
            x=scene_pos.x(),
            y=scene_pos.y(),
            width=400,
            height=300,
            label=label,
        )
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        if getattr(self, "_outline", None) is not None:
            self._outline.rebuild_index()
        return item

    def create_group_from_selection(self):
        """Wrap the selected nodes in a new group (Obsidian's group-from-selection).
        With nothing selected, drop an empty group at the viewport center."""
        sel = [it for it in self._scene.selectedItems()
               if isinstance(it, BaseNodeItem)]
        if not sel:
            return self.add_group_node(self._viewport_center_scene())
        rect = None
        for it in sel:
            r = it.mapRectToScene(it._node_rect())
            rect = r if rect is None else rect.united(r)
        pad = 24.0
        item = self.add_group_node(QPointF(rect.left() - pad, rect.top() - pad))
        if item is not None:
            item.prepareGeometryChange()
            item.node.width = rect.width() + pad * 2
            item.node.height = rect.height() + pad * 2
            item.update()
            self._schedule_save()
        return item

    def _pick_and_add_link(self):
        url, ok = QInputDialog.getText(
            self, "Añadir página web", "Dirección de la página:", text="https://"
        )
        if ok and url.strip():
            self.add_link_node(self._viewport_center_scene(), url.strip())

    def add_link_node(self, scene_pos: QPointF, url: str = "https://",
                      title: str = "") -> LinkNodeItem:
        """A web page card (Obsidian's default web embed is about this size)."""
        if not self._begin_mutation():
            return None
        node = cf.CanvasNode(
            id=cf.new_id(),
            type="link",
            x=scene_pos.x(),
            y=scene_pos.y(),
            width=480,
            height=360,
            url=url,
            nv={"title": title} if title else None,
        )
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        item = self._add_item_for(node)
        item.setSelected(True)
        self._schedule_save()
        return item

    def _toggle_snap(self):
        self._snap_to_grid = not self._snap_to_grid
        btn = getattr(self, "_btn_snap", None)
        if btn is not None:
            btn.setChecked(self._snap_to_grid)

    def zoom_to_fit(self):
        rect = self._scene.itemsBoundingRect()
        if not rect.isEmpty() and rect.width() > 0 and rect.height() > 0:
            self.fitInView(rect.adjusted(-50, -50, 50, 50), Qt.KeepAspectRatio)

    def export_to_png(self, target_path=None):
        if target_path is None:
            fname, _ = QFileDialog.getSaveFileName(
                self, "Exportar canvas como PNG", "", "PNG Image (*.png)"
            )
            if not fname:
                return None
            target_path = Path(fname)
        else:
            target_path = Path(target_path)

        rect = self._scene.itemsBoundingRect().adjusted(-30, -30, 30, 30)
        if rect.width() <= 0 or rect.height() <= 0:
            rect = QRectF(0, 0, 800, 600)

        img = QImage(int(rect.width()), int(rect.height()), QImage.Format_ARGB32)
        img.fill(QColor("#1e1e24"))
        painter = QPainter(img)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setRenderHint(QPainter.TextAntialiasing)
        self._scene.render(painter, target=QRectF(img.rect()), source=rect)
        painter.end()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(target_path), "PNG")
        return target_path

    def copy_selected(self):
        selected_nodes = [it.node for it in self._scene.selectedItems() if isinstance(it, BaseNodeItem)]
        if not selected_nodes:
            return
        selected_node_ids = {n.id for n in selected_nodes}
        self._clipboard_nodes = [copy.deepcopy(n) for n in selected_nodes]
        self._clipboard_edges = [
            copy.deepcopy(e) for e in self._doc.edges
            if e.fromNode in selected_node_ids and e.toNode in selected_node_ids
        ]
        # Mark the system clipboard as "canvas cards", so a later Ctrl+V knows
        # whether to paste these cards or text copied from somewhere else.
        mime = QMimeData()
        mime.setData(CANVAS_CLIP_MIME, b"1")
        mime.setText("\n\n".join(n.text for n in selected_nodes if n.text))
        QApplication.clipboard().setMimeData(mime)

    def _clipboard_text_markdown(self) -> str:
        """Markdown for text copied from outside the board (a note, a web page,
        a spreadsheet): tables become pipe tables. '' when the clipboard holds
        canvas cards or nothing usable."""
        from .....core.qt_markdown import clipboard_markdown
        mime = QApplication.clipboard().mimeData()
        if mime is None or mime.hasFormat(CANVAS_CLIP_MIME):
            return ""
        return clipboard_markdown(mime.html() if mime.hasHtml() else "",
                                  mime.text() if mime.hasText() else "").strip()

    def paste_clipboard_as_card(self) -> bool:
        """Drop the clipboard text as a new card under the mouse (or at the
        centre), sized to its content. Returns False if there was no text."""
        md = self._clipboard_text_markdown()
        if not md:
            return False
        vp = self.viewport()
        local = vp.mapFromGlobal(QCursor.pos())
        pos = (self.mapToScene(local) if vp.rect().contains(local)
               else self._viewport_center_scene())
        if _WEB_URL.match(md):
            return self.add_link_node(pos, md) is not None
        is_table = md.lstrip().startswith("|")
        item = self.add_text_node(pos, md, width=560 if is_table else 300)
        if item is not None and hasattr(item, "fit_to_content"):
            item.fit_to_content()
        return item is not None

    def paste(self, offset: QPointF = QPointF(30, 30)):
        # Text copied from outside the board wins over stale copied cards.
        if self.paste_clipboard_as_card():
            return
        if not self._clipboard_nodes:
            return
        if not self._begin_mutation():
            return
        self._scene.clearSelection()
        id_map = {}
        for orig_node in self._clipboard_nodes:
            node = copy.deepcopy(orig_node)
            new_id = cf.new_id()
            id_map[node.id] = new_id
            node.id = new_id
            node.x += offset.x()
            node.y += offset.y()
            orig_node.x += offset.x()
            orig_node.y += offset.y()
            self._doc.nodes.append(node)
            item = self._add_item_for(node)
            item.setSelected(True)

        for orig_edge in self._clipboard_edges:
            if orig_edge.fromNode in id_map and orig_edge.toNode in id_map:
                edge = copy.deepcopy(orig_edge)
                edge.id = cf.new_id()
                edge.fromNode = id_map[edge.fromNode]
                edge.toNode = id_map[edge.toNode]
                self._doc.edges.append(edge)
                self._add_edge_item_for(edge)

        self._schedule_save()

    def duplicate_selected(self):
        self.copy_selected()
        self.paste(QPointF(40, 40))

    # ── drag & drop from the explorer / OS ──────────────────────────────
    def _paths_from_mime(self, mime):
        paths = []
        if mime.hasUrls():
            for url in mime.urls():
                if url.isLocalFile():
                    paths.append(Path(url.toLocalFile()))
        return paths

    def _web_urls_from_mime(self, mime):
        urls = []
        if mime.hasUrls():
            urls = [u.toString() for u in mime.urls()
                    if u.scheme() in ("http", "https")]
        elif mime.hasText() and _WEB_URL.match(mime.text().strip()):
            urls = [mime.text().strip()]
        return urls

    def dragEnterEvent(self, event):
        if self._paths_from_mime(event.mimeData()) or self._web_urls_from_mime(event.mimeData()):
            event.acceptProposedAction()
        else:
            super().dragEnterEvent(event)

    def dragMoveEvent(self, event):
        if self._paths_from_mime(event.mimeData()) or self._web_urls_from_mime(event.mimeData()):
            event.acceptProposedAction()
        else:
            super().dragMoveEvent(event)

    def dropEvent(self, event):
        paths = self._paths_from_mime(event.mimeData())
        web = [] if paths else self._web_urls_from_mime(event.mimeData())
        if web:
            pos = self.mapToScene(event.position().toPoint())
            for i, url in enumerate(web):
                self.add_link_node(QPointF(pos.x() + i * 30, pos.y() + i * 30), url)
            event.acceptProposedAction()
            return
        if not paths:
            super().dropEvent(event)
            return
        pos = self.mapToScene(event.position().toPoint())
        for i, p in enumerate(paths):
            offset = QPointF(pos.x() + i * 24, pos.y() + i * 24)
            if p.suffix.lower() == ".md":
                self.add_note_node(p, offset)
            elif p.suffix.lower() == ".canvas":
                self.add_canvas_node(p, offset)
            elif p.suffix.lower() in _MEDIA_EXTS:
                self.add_media_node(p, offset)
        event.acceptProposedAction()

    # ── interaction: pan + zoom ─────────────────────────────────────────
    def _live_web_at(self, view_pos):
        """The live web card under a viewport point (its page is showing)."""
        it = self.itemAt(view_pos)
        while it is not None:
            if isinstance(it, LinkNodeItem):
                return it if it.is_live else None
            it = it.parentItem()
        return None

    def add_web_page(self, url: str, title: str = ""):
        """Put a web page card at the centre of what is on screen (WEB → ⧉)."""
        c = self._viewport_center_scene()
        return self.add_link_node(QPointF(c.x() - 240, c.y() - 180), url, title)

    def _note_item_at(self, view_pos):
        """The NoteNodeItem/CanvasEmbedItem under a viewport point, or None.
        `itemAt` returns the topmost item (often the embedded proxy widget), so
        walk up the parent chain to the owning node."""
        from .items import NoteNodeItem, CanvasEmbedItem
        it = self.itemAt(view_pos)
        while it is not None:
            if isinstance(it, (NoteNodeItem, CanvasEmbedItem)):
                return it
            it = it.parentItem()
        return None

    def wheelEvent(self, event):
        # D2: scrolling while the pointer is over a note scrolls the note's own
        # content, not the whole canvas. Ctrl+wheel still zooms the canvas.
        if not (event.modifiers() & Qt.ControlModifier) and self._live_web_at(
                event.position().toPoint()) is not None:
            QGraphicsView.wheelEvent(self, event)      # the page scrolls itself
            return
        if not (event.modifiers() & Qt.ControlModifier):
            note = self._note_item_at(event.position().toPoint())
            if note is not None and hasattr(note, "scroll_content"):
                if note.scroll_content(event.angleDelta().y()):
                    event.accept()
                    return
        if event.modifiers() & Qt.ControlModifier:
            delta_y = event.angleDelta().y()
            if delta_y != 0:
                factor = 1.15 if delta_y > 0 else 1 / 1.15
                current_scale = self.transform().m11()
                if (factor > 1 and current_scale < 6.0) or (factor < 1 and current_scale > 0.08):
                    self.scale(factor, factor)
            event.accept()
        else:
            delta_y = event.angleDelta().y()
            delta_x = event.angleDelta().x()

            if event.modifiers() & Qt.ShiftModifier:
                if delta_y != 0:
                    self.horizontalScrollBar().setValue(
                        self.horizontalScrollBar().value() - delta_y
                    )
            else:
                if delta_y != 0:
                    self.verticalScrollBar().setValue(
                        self.verticalScrollBar().value() - delta_y
                    )
                if delta_x != 0:
                    self.horizontalScrollBar().setValue(
                        self.horizontalScrollBar().value() - delta_x
                    )
            event.accept()

    def mousePressEvent(self, event):
        # Any click on the board gives it keyboard focus, so the arrow-key and
        # single-letter shortcuts keep working after interacting with a card.
        if event.button() in (Qt.LeftButton, Qt.MiddleButton, Qt.RightButton):
            self.setFocus(Qt.MouseFocusReason)
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
        # D3: middle-click on a note opens it in a new tab; on empty space it pans.
        if event.button() == Qt.MiddleButton:
            note = self._note_item_at(event.position().toPoint())
            if note is not None:
                self.open_note_in_new_tab_requested.emit(note.abs_path)
                event.accept()
                return
        # Alt+click on a card duplicates it in place; Alt+click on empty space
        # still pans the board.
        if (event.button() == Qt.LeftButton
                and event.modifiers() & Qt.AltModifier):
            node_item = self._node_item_under(event.position().toPoint())
            if node_item is not None:
                self._duplicate_node(node_item)
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

    def _node_item_under(self, view_pos):
        """The card (BaseNodeItem) under a view point, walking up from whatever
        child (proxy, text, port) happens to be on top."""
        scene_pos = self.mapToScene(view_pos)
        for it in self._scene.items(scene_pos):
            node = it if isinstance(it, BaseNodeItem) else None
            p = it
            while node is None and p is not None:
                p = p.parentItem()
                if isinstance(p, BaseNodeItem):
                    node = p
            if node is not None:
                return node
        return None

    def _nearest_node_item(self, scene_pos, max_dist=140.0, exclude=None):
        """The card whose rectangle is closest to a scene point, within
        ``max_dist`` (0 when the point is inside the card)."""
        best, best_d = None, None
        for it in self._items.values():
            if it is exclude:
                continue
            n = it.node
            dx = max(n.x - scene_pos.x(), 0.0, scene_pos.x() - (n.x + n.width))
            dy = max(n.y - scene_pos.y(), 0.0, scene_pos.y() - (n.y + n.height))
            d = (dx * dx + dy * dy) ** 0.5
            if d <= max_dist and (best_d is None or d < best_d):
                best, best_d = it, d
        return best

    def _duplicate_node(self, item):
        """Clone one card (any kind) with a fresh id, offset a little, select it."""
        if not self._begin_mutation():
            return None
        node = copy.deepcopy(item.node)
        node.id = cf.new_id()
        node.x += 30
        node.y += 30
        self._doc.nodes.append(node)
        self._scene.clearSelection()
        new_item = self._add_item_for(node)
        new_item.setSelected(True)
        self._schedule_save()
        return new_item

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
            vis = self.mapToScene(self.viewport().rect()).boundingRect()
            self._scene.ensure_bounds(vis, margin=15000.0)
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
            # If the drop did not land exactly on a card, snap to the nearest one
            # within reach, so a connection just needs to pass near a node.
            if target is None:
                target = self._nearest_node_item(
                    scene_pos, max_dist=140.0, exclude=self._connecting_src)
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
                self.push_undo()
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
        if not self._begin_mutation():
            return None
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

    def _is_editor_focused(self) -> bool:
        focus_item = self._scene.focusItem()
        if focus_item is not None:
            if isinstance(focus_item, QGraphicsTextItem) and bool(
                focus_item.textInteractionFlags() & (Qt.TextEditorInteraction | Qt.TextEditable)
            ):
                return True
            if isinstance(focus_item, QGraphicsProxyWidget):
                w = focus_item.widget()
                if w and (
                    isinstance(w, (QTextEdit, QLineEdit))
                    or w.findChild(QTextEdit) is not None
                    or w.findChild(QLineEdit) is not None
                    or w.hasFocus()
                ):
                    return True
        fw = QApplication.focusWidget()
        if fw is not None and isinstance(fw, (QTextEdit, QLineEdit)):
            parent = fw
            while parent:
                if parent == self:
                    return True
                parent = parent.parentWidget()
        return False

    def keyPressEvent(self, event):
        if self._is_editor_focused():
            if event.key() == Qt.Key_Escape:
                self._scene.clearFocus()
                fw = QApplication.focusWidget()
                if fw:
                    fw.clearFocus()
                self.setFocus()
                event.accept()
                return
            super().keyPressEvent(event)
            return

        if event.modifiers() & Qt.ControlModifier:
            if event.key() == Qt.Key_Z:
                if event.modifiers() & Qt.ShiftModifier:
                    self.redo()
                else:
                    self.undo()
                event.accept()
                return
            if event.key() == Qt.Key_Y:
                self.redo()
                event.accept()
                return
            if event.key() == Qt.Key_G:
                self.create_group_from_selection()
                event.accept()
                return
            if event.key() == Qt.Key_C:
                self.copy_selected()
                event.accept()
                return
            if event.key() == Qt.Key_V:
                self.paste()
                event.accept()
                return
            if event.key() == Qt.Key_D:
                self.duplicate_selected()
                event.accept()
                return
            if event.key() == Qt.Key_A:
                for item in self._scene.items():
                    if isinstance(item, (BaseNodeItem, EdgeItem)):
                        item.setSelected(True)
                event.accept()
                return
            if event.key() == Qt.Key_0:
                self.zoom_to_fit()
                event.accept()
                return

        if event.key() in (Qt.Key_Delete, Qt.Key_Backspace):
            self._delete_selected()
            event.accept()
            return
        # D key toggles draw mode
        if event.key() == Qt.Key_D and not event.modifiers():
            self._toggle_draw_mode()
            event.accept()
            return
        # Escape exits draw/erase mode back to select
        if event.key() == Qt.Key_Escape and self._mode != MODE_SELECT:
            self.set_mode(MODE_SELECT)
            event.accept()
            return
        # Single-letter quick keys for the toolbar. The editor-focus guard at
        # the top means these never fire while typing inside a note or a text
        # card. V mirrors the web-page button, which is deferred, so it stays
        # reserved (inert).
        if not event.modifiers():
            # Arrow keys grow a connected chain of text cards from the selected
            # node, in the arrow's direction (right/left = beside, up/down).
            arrow_dir = {
                Qt.Key_Right: "right", Qt.Key_Left: "left",
                Qt.Key_Up: "up", Qt.Key_Down: "down",
            }.get(event.key())
            if arrow_dir is not None:
                self._spawn_linked_text(arrow_dir)
                event.accept()
                return
            quick = {
                Qt.Key_Z: self._add_text_center,             # tarjeta de texto
                Qt.Key_X: self._pick_and_add_note,           # nota de la vault
                Qt.Key_C: self._pick_and_add_media,          # multimedia
                Qt.Key_B: self.create_group_from_selection,  # crear grupo
                Qt.Key_N: self._toggle_draw_mode,            # dibujo
                Qt.Key_A: self._pick_and_add_canvas,         # canvas embebido
                Qt.Key_S: self._pick_and_add_link,           # enlace web
                Qt.Key_F: self._open_shapes_menu,            # formas
                Qt.Key_G: self._pick_and_connect,            # conectar nodos
            }
            handler = quick.get(event.key())
            if handler is not None:
                handler()
                event.accept()
                return
        super().keyPressEvent(event)

    def contextMenuEvent(self, event):
        item = self.itemAt(event.pos())
        menu = QMenu(self)
        menu.setStyleSheet(
            "QMenu{background:#26262c;border:1px solid #3a3a46;color:#dcdde0;padding:4px;}"
            "QMenu::item{padding:5px 18px;border-radius:4px;font-size:12px;}"
            "QMenu::item:selected{background:#7c5af0;color:#ffffff;}"
        )
        if isinstance(item, BaseNodeItem):
            color_menu = menu.addMenu("🎨 Color")
            colors = [
                ("Por defecto", ""),
                ("Rojo (1)", "1"),
                ("Naranja (2)", "2"),
                ("Amarillo (3)", "3"),
                ("Verde (4)", "4"),
                ("Cian (5)", "5"),
                ("Púrpura (6)", "6"),
            ]
            for name, c_id in colors:
                act = color_menu.addAction(name)
                act.triggered.connect(lambda chk, c=c_id, it=item: self._set_node_color(it, c))

            menu.addSeparator()
            is_locked = item.is_locked
            act_lock = menu.addAction("🔓 Desbloquear" if is_locked else "🔒 Bloquear")
            act_lock.triggered.connect(lambda: item.set_locked(not is_locked))

            act_front = menu.addAction("⬆ Traer al frente")
            act_front.triggered.connect(lambda: self._adjust_z_value(item, 1))

            act_back = menu.addAction("⬇ Enviar al fondo")
            act_back.triggered.connect(lambda: self._adjust_z_value(item, -1))

            menu.addSeparator()
            act_dup = menu.addAction("Duplicar")
            act_dup.setShortcut("Ctrl+D")
            act_dup.triggered.connect(self.duplicate_selected)

            act_del = menu.addAction("Eliminar")
            act_del.triggered.connect(self._delete_selected)

        elif isinstance(item, EdgeItem):
            style_menu = menu.addMenu("Estilo de línea")
            for st, st_label in [("solid", "Sólida"), ("dashed", "Guiones"), ("dotted", "Puntos")]:
                act = style_menu.addAction(st_label)
                act.triggered.connect(lambda chk, s=st, e=item: self._set_edge_style(e, s))

            routing_menu = menu.addMenu("Enrutamiento")
            for r, r_label in [("bezier", "Curva (Bézier)"), ("straight", "Línea recta"), ("orthogonal", "Ortogonal")]:
                act = routing_menu.addAction(r_label)
                act.triggered.connect(lambda chk, rt=r, e=item: self._set_edge_routing(e, rt))

            arrows_menu = menu.addMenu("Flechas")
            for f_end, t_end, ar_label in [
                ("none", "arrow", "Destino"),
                ("arrow", "none", "Origen"),
                ("arrow", "arrow", "Ambos extremos"),
                ("none", "none", "Sin flechas"),
            ]:
                act = arrows_menu.addAction(ar_label)
                act.triggered.connect(lambda chk, fe=f_end, te=t_end, e=item: self._set_edge_arrows(e, fe, te))

            color_menu = menu.addMenu("🎨 Color")
            colors = [
                ("Por defecto", ""),
                ("Rojo (1)", "1"),
                ("Naranja (2)", "2"),
                ("Amarillo (3)", "3"),
                ("Verde (4)", "4"),
                ("Cian (5)", "5"),
                ("Púrpura (6)", "6"),
            ]
            for name, c_id in colors:
                act = color_menu.addAction(name)
                act.triggered.connect(lambda chk, c=c_id, e=item: self._set_edge_color(e, c))

            menu.addSeparator()
            act_del = menu.addAction("Eliminar conexión")
            act_del.triggered.connect(self._delete_selected)

        else:
            scene_pt = self.mapToScene(event.pos())
            act_card = menu.addAction("＋ Tarjeta")
            act_card.triggered.connect(lambda: self.add_text_node(scene_pt))

            act_note = menu.addAction("＋ Nota de la vault")
            act_note.triggered.connect(self._pick_and_add_note)

            act_media = menu.addAction("＋ Multimedia de la vault")
            act_media.triggered.connect(self._pick_and_add_media)

            act_web = menu.addAction("＋ Página web")
            act_web.setEnabled(False)
            act_web.setToolTip("Próximamente")

            act_group = menu.addAction("＋ Crear grupo")
            act_group.triggered.connect(self.create_group_from_selection)

            menu.addSeparator()
            act_paste = menu.addAction("Pegar")
            act_paste.setShortcut("Ctrl+V")
            act_paste.setEnabled(bool(self._clipboard_nodes)
                                 or bool(self._clipboard_text_markdown()))
            act_paste.triggered.connect(lambda: self.paste(QPointF(20, 20)))

            menu.addSeparator()
            act_grid = menu.addAction("Ajustar a la cuadrícula")
            act_grid.setCheckable(True)
            act_grid.setChecked(bool(self._snap_to_grid))
            act_grid.triggered.connect(self._toggle_snap)

            act_snap_obj = menu.addAction("Ajustar a objetos")
            act_snap_obj.setCheckable(True)
            act_snap_obj.setChecked(bool(self._snap_to_objects))
            act_snap_obj.triggered.connect(lambda chk: self.set_snap_to_objects(chk))

            act_ro = menu.addAction("Solo lectura")
            act_ro.setCheckable(True)
            act_ro.setChecked(bool(self._read_only))
            act_ro.triggered.connect(lambda chk: self.set_read_only(chk))

        menu.exec(event.globalPos())

    def _set_node_color(self, item: BaseNodeItem, color_code: str):
        item.node.color = color_code
        item.update()
        self._schedule_save()

    def _adjust_z_value(self, item: BaseNodeItem, delta: float):
        new_z = item.zValue() + delta
        item.setZValue(new_z)
        if item.node.nv is None:
            item.node.nv = {}
        item.node.nv["zIndex"] = new_z
        self._schedule_save()

    def _set_edge_style(self, edge_item: EdgeItem, style: str):
        if edge_item.edge.nv is None:
            edge_item.edge.nv = {}
        edge_item.edge.nv["style"] = style
        edge_item.update_path()
        self._schedule_save()

    def _set_edge_routing(self, edge_item: EdgeItem, routing: str):
        if edge_item.edge.nv is None:
            edge_item.edge.nv = {}
        edge_item.edge.nv["routing"] = routing
        edge_item.update_path()
        self._schedule_save()

    def _set_edge_arrows(self, edge_item: EdgeItem, from_end: str, to_end: str):
        edge_item.edge.fromEnd = from_end
        edge_item.edge.toEnd = to_end
        edge_item.update_path()
        self._schedule_save()

    def _set_edge_color(self, edge_item: EdgeItem, color: str):
        edge_item.edge.color = color
        edge_item.update_path()
        self._schedule_save()

    def _delete_selected(self):
        if self._read_only:
            return
        self._push_undo()
        removed = False
        selected = list(self._scene.selectedItems())
        for item in selected:
            if isinstance(item, EdgeItem):
                eid = item.edge.id
                self._doc.edges = [e for e in self._doc.edges if e.id != eid]
                self._scene.removeItem(item)
                self._edge_items.pop(eid, None)
                if hasattr(self, "_node_edges"):
                    self._node_edges.get(item.edge.fromNode, set()).discard(item)
                    self._node_edges.get(item.edge.toNode, set()).discard(item)
                removed = True

        for item in selected:
            if isinstance(item, BaseNodeItem):
                if hasattr(item, "stop"):
                    item.stop()
                nid = item.node.id
                edges_to_del = [e for e in self._doc.edges if e.fromNode == nid or e.toNode == nid]
                for e in edges_to_del:
                    if e.id in self._edge_items:
                        edge_item = self._edge_items[e.id]
                        self._scene.removeItem(edge_item)
                        self._edge_items.pop(e.id, None)
                        if hasattr(self, "_node_edges"):
                            self._node_edges.get(e.fromNode, set()).discard(edge_item)
                            self._node_edges.get(e.toNode, set()).discard(edge_item)
                if hasattr(self, "_node_edges"):
                    self._node_edges.pop(nid, None)
                self._doc.nodes = [n for n in self._doc.nodes if n.id != nid]
                self._doc.edges = [e for e in self._doc.edges
                                   if e.fromNode != nid and e.toNode != nid]
                self._scene.removeItem(item)
                self._items.pop(nid, None)
                removed = True
        if removed:
            self._schedule_save()
            if getattr(self, "_outline", None) is not None:
                self._outline.rebuild_index()

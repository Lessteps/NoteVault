"""Floating Notion-style Outline / Table of Contents for CanvasView.

Features:
- Hover-activated sliding panel (collapses to a sleek pill on the right margin).
- Debounced mouse leave (250ms grace) + Pin button (📌) to lock open.
- Dynamic 3-level hierarchical tree built from canvas group containment.
- Fast fallback to heading detection (#, ##, ###) when no groups are present.
- Click to center & frame the camera on target group with visual highlight pulse.
"""

from typing import Optional, List, Dict, Tuple
import re
from PySide6.QtWidgets import (
    QFrame, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTreeWidget, QTreeWidgetItem, QGraphicsDropShadowEffect,
    QAbstractItemView
)
from PySide6.QtCore import Qt, QTimer, Signal, QRectF, QPointF
from PySide6.QtGui import QColor, QFont, QCursor


class OutlineTreeItem(QTreeWidgetItem):
    """Tree item holding node/group id and target bounding rectangle."""

    def __init__(self, target_id: str, label: str, target_rect: Optional[QRectF] = None, level: int = 1):
        super().__init__([label])
        self.target_id = target_id
        self.target_rect = target_rect
        self.level = level


class CanvasOutlineWidget(QFrame):
    """Floating Notion-style Table of Contents on the right side of CanvasView."""

    item_selected = Signal(str)  # emits target_id (node or group id)

    EXPANDED_WIDTH = 320
    COLLAPSED_WIDTH = 40
    COLLAPSED_HEIGHT = 40

    def __init__(self, parent_view):
        super().__init__(parent_view)
        self.view = parent_view
        self._is_pinned = False
        self._is_expanded = False
        self._show_connections = False
        self._collapse_timer = QTimer(self)
        self._collapse_timer.setSingleShot(True)
        self._collapse_timer.setInterval(260)
        self._collapse_timer.timeout.connect(self._do_collapse)

        self.setObjectName("canvasOutline")
        self.setMouseTracking(True)

        # Drop shadow for floating glassmorphism look
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(24)
        shadow.setColor(QColor(0, 0, 0, 160))
        shadow.setOffset(0, 6)
        self.setGraphicsEffect(shadow)

        self._build_ui()
        self._apply_styles()
        self.collapse(instant=True)

    def _build_ui(self):
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(6, 6, 6, 6)
        self._layout.setSpacing(4)

        # Header bar (visible when expanded)
        self._header = QFrame(self)
        self._header_layout = QHBoxLayout(self._header)
        self._header_layout.setContentsMargins(8, 4, 4, 4)
        self._header_layout.setSpacing(6)

        self._title_icon = QLabel("📑", self._header)
        self._title_icon.setStyleSheet("font-size: 14px; background: transparent;")

        self._title_label = QLabel("Índice del Canvas", self._header)
        self._title_label.setStyleSheet("font-size: 12px; font-weight: 600; color: #d6d9e0; background: transparent;")

        self._pin_btn = QPushButton("📌", self._header)
        self._pin_btn.setFixedSize(26, 26)
        self._pin_btn.setCheckable(True)
        self._pin_btn.setToolTip("Fijar índice permanentemente")
        self._pin_btn.setCursor(Qt.PointingHandCursor)
        self._pin_btn.toggled.connect(self._toggle_pin)

        self._conn_btn = QPushButton("🔗", self._header)
        self._conn_btn.setFixedSize(26, 26)
        self._conn_btn.setCheckable(True)
        self._conn_btn.setToolTip("Mostrar/ocultar conexiones")
        self._conn_btn.setCursor(Qt.PointingHandCursor)
        self._conn_btn.toggled.connect(self._toggle_connections)

        self._close_btn = QPushButton("✕", self._header)
        self._close_btn.setFixedSize(24, 24)
        self._close_btn.setToolTip("Cerrar índice")
        self._close_btn.setCursor(Qt.PointingHandCursor)
        self._close_btn.clicked.connect(lambda: self.collapse(instant=False))

        self._header_layout.addWidget(self._title_icon)
        self._header_layout.addWidget(self._title_label, 1)
        self._header_layout.addWidget(self._conn_btn)
        self._header_layout.addWidget(self._pin_btn)
        self._header_layout.addWidget(self._close_btn)

        # Tree widget for hierarchy
        self._tree = QTreeWidget(self)
        self._tree.setHeaderHidden(True)
        self._tree.setIndentation(14)
        self._tree.setAnimated(True)
        self._tree.setSelectionMode(QAbstractItemView.SingleSelection)
        self._tree.setFocusPolicy(Qt.NoFocus)
        self._tree.itemClicked.connect(self._on_item_clicked)

        # Collapsed Pill trigger widget
        self._pill_btn = QPushButton("📑", self)
        self._pill_btn.setFixedSize(self.COLLAPSED_WIDTH, self.COLLAPSED_HEIGHT)
        self._pill_btn.setToolTip("Abrir índice del Canvas")
        self._pill_btn.setCursor(Qt.PointingHandCursor)
        self._pill_btn.clicked.connect(self.expand)

        self._layout.addWidget(self._pill_btn, 0, Qt.AlignRight)
        self._layout.addWidget(self._header)
        self._layout.addWidget(self._tree, 1)

    def _apply_styles(self):
        self.setStyleSheet("""
            #canvasOutline {
                background: rgba(26, 26, 34, 0.94);
                border: 1px solid rgba(255, 255, 255, 0.10);
                border-radius: 12px;
            }
            QTreeWidget {
                background: transparent;
                border: none;
                color: #c4c7d4;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 11px;
                outline: none;
            }
            QTreeWidget::item {
                padding: 4px 6px;
                border-radius: 6px;
                min-height: 22px;
            }
            QTreeWidget::item:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
            }
            QTreeWidget::item:selected {
                background: rgba(124, 90, 240, 0.28);
                color: #ffffff;
                font-weight: 600;
            }
            QTreeWidget::branch:has-children:!has-siblings:closed,
            QTreeWidget::branch:closed:has-children:has-siblings {
                border-image: none;
                image: none;
            }
            QTreeWidget::branch:open:has-children:!has-siblings,
            QTreeWidget::branch:open:has-children:has-siblings {
                border-image: none;
                image: none;
            }
            QPushButton {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                color: #b0b3c0;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.14);
                color: #ffffff;
            }
            QPushButton:checked {
                background: rgba(124, 90, 240, 0.35);
                border-color: #7c5af0;
                color: #ffffff;
            }
            QScrollBar:vertical {
                background: transparent;
                width: 6px;
                margin: 2px 0 2px 0;
            }
            QScrollBar::handle:vertical {
                background: rgba(255, 255, 255, 0.18);
                min-height: 24px;
                border-radius: 3px;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(255, 255, 255, 0.32);
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0px;
            }
        """)

    def enterEvent(self, event):
        self._collapse_timer.stop()
        if not self._is_expanded:
            self.expand()
        super().enterEvent(event)

    def leaveEvent(self, event):
        if not self._is_pinned and self._is_expanded:
            self._collapse_timer.start()
        super().leaveEvent(event)

    def _do_collapse(self):
        if not self._is_pinned:
            self.collapse()

    def expand(self):
        self._is_expanded = True
        self._pill_btn.hide()
        self._header.show()
        self._tree.show()
        vh = self.view.viewport().height() if self.view else 600
        max_h = max(200, vh - 48)
        self.resize(self.EXPANDED_WIDTH, min(560, max_h))
        self._reposition()

    def collapse(self, instant: bool = False):
        self._is_expanded = False
        self._header.hide()
        self._tree.hide()
        self._pill_btn.show()
        self.resize(self.COLLAPSED_WIDTH, self.COLLAPSED_HEIGHT)
        self._reposition()

    def _toggle_pin(self, checked: bool):
        self._is_pinned = bool(checked)
        if self._is_pinned:
            self._collapse_timer.stop()
            self._pin_btn.setText("📌")
            self._pin_btn.setToolTip("Desanclar índice (cerrar en hover leave)")
        else:
            self._pin_btn.setText("📍")
            self._pin_btn.setToolTip("Fijar índice permanentemente")

    def _toggle_connections(self, checked: bool):
        self._show_connections = bool(checked)
        self.rebuild_index()

    def _reposition(self):
        if not self.view:
            return
        vw = self.view.viewport().width()
        w = self.width()
        self.move(vw - w - 16, 16)
        self.raise_()

    def update_position(self):
        self._reposition()

    # ── HIERARCHY EXTRACTION ───────────────────────────────────────────
    def schedule_rebuild(self):
        """Refresh soon; called on every canvas change (move, rename, resize,
        add, delete), so the index never goes stale."""
        if not hasattr(self, "_rebuild_timer"):
            self._rebuild_timer = QTimer(self)
            self._rebuild_timer.setSingleShot(True)
            self._rebuild_timer.setInterval(350)
            self._rebuild_timer.timeout.connect(self.rebuild_index)
        self._rebuild_timer.start()

    def rebuild_index(self):
        """Extracts hierarchy from current canvas document and populates tree."""
        bar = self._tree.verticalScrollBar()
        scroll = bar.value()
        QTimer.singleShot(0, lambda: bar.setValue(scroll))
        self._tree.clear()
        doc = getattr(self.view, "_doc", None)
        if not doc or not getattr(doc, "nodes", None):
            return

        # 1. Look for group nodes
        groups = [n for n in doc.nodes if getattr(n, "type", "") == "group"]

        if groups:
            self._build_tree_from_groups(groups, doc.nodes)
        else:
            self._build_tree_from_headings(doc.nodes)

        self._tree.expandAll()

    def _build_tree_from_groups(self, groups, all_nodes):
        """Tree of groups by geometric containment, ordered by their numbering.

        - Parent = the smallest group that contains the child (a few pixels
          of tolerance, so a group drawn flush with its parent still nests).
        - Numbering wins over geometry: "4. Final" drawn inside "Step 3" is
          not a sub-step of 3, so it moves up to the level where it belongs.
        - Siblings are ordered by number (1.2 before 1.10), then by position.
        - With 🔗 on, each group lists only its OWN cards (not those of its
          sub-groups) in reading order, each with its connections.
        """
        doc = getattr(self.view, "_doc", None)
        tol = 6.0
        items = []
        for g in groups:
            rect = QRectF(float(g.x), float(g.y), float(g.width), float(g.height))
            label = (getattr(g, "label", "") or "").strip() or "Grupo"
            items.append({"id": g.id, "label": label, "rect": rect,
                          "area": rect.width() * rect.height(),
                          "num": self._numbers_only(label),
                          "parent": None, "children": [], "nodes": []})

        def container_of(rect, area, exclude=None):
            best = None
            for p in items:
                if p is exclude or p["area"] <= area:
                    continue
                if p["rect"].adjusted(-tol, -tol, tol, tol).contains(rect):
                    if best is None or p["area"] < best["area"]:
                        best = p
            return best

        for c in items:
            c["parent"] = container_of(c["rect"], c["area"], exclude=c)

        def is_sub_number(child, parent):
            return len(child) > len(parent) and child[:len(parent)] == parent

        for c in items:
            p = c["parent"]
            while (p is not None and c["num"] and p["num"]
                   and not is_sub_number(c["num"], p["num"])):
                p = p["parent"]
            c["parent"] = p
        roots = []
        for c in items:
            (c["parent"]["children"] if c["parent"] else roots).append(c)

        loose = []
        for n in all_nodes:
            if getattr(n, "type", "") == "group":
                continue
            r = QRectF(float(n.x), float(n.y), float(n.width), float(n.height))
            center = r.center()
            owner = None
            for g in items:
                if g["rect"].contains(center) and (owner is None or g["area"] < owner["area"]):
                    owner = g
            (owner["nodes"] if owner else loose).append(n)

        def sort_key(g):
            return (self._parse_label_numbers(g["label"]), g["rect"].y(), g["rect"].x())

        def add_nodes(parent_item, nodes, level):
            # canvases flow left to right: header, instructions, table, next step
            for n in sorted(nodes, key=lambda n: (float(n.x), float(n.y))):
                edges = [e for e in (doc.edges or []) if n.id in (e.fromNode, e.toNode)]
                if not edges:
                    continue
                rect = QRectF(float(n.x), float(n.y), float(n.width), float(n.height))
                node_item = OutlineTreeItem(n.id, "▸ " + self._node_short_label(n), rect, level=level)
                node_item.setForeground(0, QColor("#a9adbb"))
                node_item.setFont(0, QFont("Segoe UI", 8))
                if parent_item is None:
                    self._tree.addTopLevelItem(node_item)
                else:
                    parent_item.addChild(node_item)
                self._append_connections(node_item, n.id, doc, all_nodes, level + 1)

        def add_group(g, parent_item, level):
            tree_item = OutlineTreeItem(g["id"], g["label"], g["rect"], level=level)
            font = QFont("Segoe UI", 10 if level == 1 else 9)
            if level == 1:
                font.setBold(True)
                tree_item.setForeground(0, QColor("#e8ebf2"))
            elif level == 2:
                font.setWeight(QFont.DemiBold)
                tree_item.setForeground(0, QColor("#b8bcc8"))
            else:
                tree_item.setForeground(0, QColor("#8e92a0"))
            tree_item.setFont(0, font)
            tree_item.setToolTip(0, g["label"])
            if parent_item is None:
                self._tree.addTopLevelItem(tree_item)
            else:
                parent_item.addChild(tree_item)
            for c in sorted(g["children"], key=sort_key):
                add_group(c, tree_item, level + 1)
            if self._show_connections and doc is not None:
                add_nodes(tree_item, g["nodes"], level + 1)

        for g in sorted(roots, key=sort_key):
            add_group(g, None, 1)
        if self._show_connections and doc is not None:
            add_nodes(None, loose, 1)

    @staticmethod
    def _numbers_only(label: str) -> tuple:
        """The numbering of a label as ints, () when it has none."""
        nums = CanvasOutlineWidget._parse_label_numbers(label)
        return nums if nums and all(isinstance(x, int) for x in nums) and nums[0] != 999999 else ()

    @staticmethod
    def _parse_label_numbers(label: str):
        """Extracts numerical hierarchy from a label for natural sorting.
        e.g. 'Step 1.2 — Audit' -> (1, 2)
             '1.1.4 — Completeness' -> (1, 1, 4)
             'Example Step 1 — Problem' -> (1,)
             Fallback -> (999999, label.lower())
        """
        if not label:
            return (999999, "")
        match = re.search(r'(?:Step\s+|Sub-Step\s+)?(\d+(?:\.\d+)+)', label, re.IGNORECASE)
        if not match:
            match = re.search(r'(?:Step\s+|Sub-Step\s+)(\d+)', label, re.IGNORECASE)
        if not match:
            match = re.search(r'\b(\d+)\b', label)
        if match:
            try:
                return tuple(int(p) for p in match.group(1).split('.'))
            except ValueError:
                pass
        return (999999, label.lower())

    def _build_tree_from_headings(self, all_nodes):
        """Fallback: builds outline from markdown headers (#, ##, ###) in text nodes."""
        heading_nodes = []
        for n in all_nodes:
            txt = getattr(n, "text", "") or ""
            first_line = txt.strip().split("\n")[0].strip()
            if first_line.startswith("#"):
                level = 1
                if first_line.startswith("###"):
                    level = 3
                elif first_line.startswith("##"):
                    level = 2
                clean_title = first_line.lstrip("#").strip()
                rect = QRectF(float(n.x), float(n.y), float(n.width), float(n.height))
                heading_nodes.append((level, clean_title, n.id, rect, float(n.y), float(n.x)))

        # Sort by numerical hierarchy, then topologically by (y, x)
        heading_nodes.sort(key=lambda x: (self._parse_label_numbers(x[1]), x[4], x[5]))

        last_l1 = None
        last_l2 = None
        for level, title, nid, rect, _, _ in heading_nodes:
            item = OutlineTreeItem(nid, title, rect, level=level)
            font = QFont("Segoe UI", 10 if level == 1 else (9 if level == 2 else 9))
            if level == 1:
                font.setBold(True)
                item.setForeground(0, QColor("#e8ebf2"))
                self._tree.addTopLevelItem(item)
                last_l1 = item
                last_l2 = None
            elif level == 2:
                font.setWeight(QFont.DemiBold)
                item.setForeground(0, QColor("#b8bcc8"))
                if last_l1:
                    last_l1.addChild(item)
                else:
                    self._tree.addTopLevelItem(item)
                last_l2 = item
            else:
                item.setForeground(0, QColor("#8e92a0"))
                if last_l2:
                    last_l2.addChild(item)
                elif last_l1:
                    last_l1.addChild(item)
                else:
                    self._tree.addTopLevelItem(item)

    # ── CONNECTION SUB-ITEMS ─────────────────────────────────────────────
    @staticmethod
    def _node_short_label(node) -> str:
        """Short display label for a node."""
        if node is None:
            return "?"
        if getattr(node, 'type', '') == 'group':
            return getattr(node, 'label', '') or 'Grupo'
        txt = getattr(node, 'text', '') or getattr(node, 'file', '') or ''
        first_line = txt.strip().split('\n')[0].lstrip('#').strip()[:40]
        return first_line or node.id[:8]

    def _append_connections(self, tree_item, node_id: str, doc, all_nodes, level: int):
        """Add edge children under a tree item for a given node."""
        node_map = {n.id: n for n in all_nodes}
        # what feeds this card (←) first, then what it produces (→)
        for edge in sorted(doc.edges or [], key=lambda e: e.fromNode == node_id):
            if edge.fromNode == node_id or edge.toNode == node_id:
                other_id = edge.toNode if edge.fromNode == node_id else edge.fromNode
                other_node = node_map.get(other_id)
                direction = "→" if edge.fromNode == node_id else "←"
                other_label = self._node_short_label(other_node)
                label_text = f"{direction} {other_label}"
                if edge.label:
                    label_text += f' — "{edge.label}"'
                # Edge target rect: midpoint of the two nodes
                edge_rect = None
                src_node = node_map.get(edge.fromNode)
                dst_node = node_map.get(edge.toNode)
                if src_node and dst_node:
                    mid_x = (src_node.x + dst_node.x) / 2.0
                    mid_y = (src_node.y + dst_node.y) / 2.0
                    edge_rect = QRectF(mid_x - 50, mid_y - 50, 100, 100)
                conn_item = OutlineTreeItem(edge.id, label_text, edge_rect, level=level)
                conn_item.setForeground(0, QColor("#6e72a0"))
                font = QFont("Segoe UI", 8)
                font.setItalic(True)
                conn_item.setFont(0, font)
                tree_item.addChild(conn_item)

    # ── ITEM CLICK & CAMERA NAVIGATION ──────────────────────────────────
    def _on_item_clicked(self, item, column):
        if not isinstance(item, OutlineTreeItem):
            return
        target_id = item.target_id
        target_rect = item.target_rect

        # Delegate to canvas view
        if hasattr(self.view, "focus_on_target"):
            self.view.focus_on_target(target_id, target_rect)
        self.item_selected.emit(target_id)

"""
Tree with checkboxes, coloured chips per column, drag to reorder or reparent,
and Tab / Shift+Tab to indent. The owner keeps the data: every change is
emitted as a signal and the owner rebuilds the tree from disk.
"""

from PySide6.QtCore import Qt, Signal, QSize
from PySide6.QtGui import QColor, QBrush, QFont
from PySide6.QtWidgets import (
    QTreeWidget, QTreeWidgetItem, QAbstractItemView, QHeaderView, QMenu,
)

from ... import theme
from . import BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, UI_FONT

ID_ROLE = Qt.UserRole + 1
CHECKABLE_ROLE = Qt.UserRole + 2


class TreeList(QTreeWidget):
    checked = Signal(str, bool)
    activated_id = Signal(str)
    moved = Signal(str, object, int)        # id, new parent id or None, index among siblings
    indent_requested = Signal(str, int)     # id, +1 indent / -1 outdent
    add_child_requested = Signal(str)
    delete_requested = Signal(str)

    def __init__(self, headers=("Nombre",), widths=(), parent=None):
        super().__init__(parent)
        self.setColumnCount(len(headers))
        self.setHeaderLabels(list(headers))
        self.setUniformRowHeights(True)
        self.setAnimated(True)
        self.setIndentation(22)
        self.setRootIsDecorated(True)
        self.setSelectionMode(QAbstractItemView.SingleSelection)
        self.setDragDropMode(QAbstractItemView.InternalMove)
        self.setDefaultDropAction(Qt.MoveAction)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDropIndicatorShown(True)
        self.setContextMenuPolicy(Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self._menu)
        self.itemChanged.connect(self._item_changed)
        self.itemDoubleClicked.connect(lambda it, _c: self.activated_id.emit(it.data(0, ID_ROLE)))
        self._building = False
        self._drag_id = None
        header = self.header()
        header.setStretchLastSection(False)
        header.setSectionResizeMode(0, QHeaderView.Stretch)
        for i, w in enumerate(widths, start=1):
            header.setSectionResizeMode(i, QHeaderView.Fixed)
            self.setColumnWidth(i, w)
        self.setStyleSheet(
            f"QTreeWidget{{background:#1c1c1c;border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-size:13px;font-family:{UI_FONT};outline:none;}}"
            "QTreeWidget::item{height:30px;border:none;}"
            "QTreeWidget::item:selected{background:rgba(35,131,226,0.22);color:" + TEXT + ";}"
            "QTreeWidget::item:hover{background:rgba(255,255,255,0.04);}"
            f"QHeaderView::section{{background:#161616;color:{TEXT_FAINT};border:none;"
            f"border-bottom:1px solid {BORDER};padding:6px 8px;font-size:11px;font-family:{UI_FONT};}}"
            "QTreeWidget::indicator{width:15px;height:15px;}"
            "QTreeWidget::indicator:unchecked{border:1px solid #6a6a72;border-radius:3px;"
            "background:transparent;}"
            f"QTreeWidget::indicator:checked{{border:1px solid {BLUE};border-radius:3px;"
            f"background:{BLUE};}}")

    # ── Data ──────────────────────────────────────────────────────────────

    def set_nodes(self, nodes: list):
        """nodes: [{id, text, checked (bool|None), columns: [(text, colour)],
        children: [...], tooltip, bold, faint}]"""
        expanded = self.expanded_ids()
        first_time = not self.topLevelItemCount() and not expanded
        selected = self.current_id()
        self._building = True
        self.clear()
        for node in nodes:
            self.addTopLevelItem(self._make(node))
        self._building = False
        for item in self._walk():
            nid = item.data(0, ID_ROLE)
            item.setExpanded(first_time or nid in expanded)
            if nid == selected:
                self.setCurrentItem(item)

    def _make(self, node: dict) -> QTreeWidgetItem:
        item = QTreeWidgetItem()
        item.setData(0, ID_ROLE, node["id"])
        item.setText(0, node.get("text", ""))
        flags = Qt.ItemIsEnabled | Qt.ItemIsSelectable | Qt.ItemIsDragEnabled | Qt.ItemIsDropEnabled
        checked = node.get("checked")
        if checked is not None and node.get("checkable", True):
            flags |= Qt.ItemIsUserCheckable
            item.setCheckState(0, Qt.Checked if checked else Qt.Unchecked)
        item.setFlags(flags)
        font = QFont()
        font.setFamilies(["Segoe UI Variable Text", "Segoe UI"])
        font.setPixelSize(13)
        font.setBold(bool(node.get("bold")))
        font.setStrikeOut(bool(checked) and node.get("strike", True))
        item.setFont(0, font)
        colour = TEXT_FAINT if (checked or node.get("faint")) else TEXT
        item.setForeground(0, QBrush(QColor(theme.tint(colour))))
        if node.get("tooltip"):
            item.setToolTip(0, node["tooltip"])
        for i, col in enumerate(node.get("columns", []), start=1):
            text, colour = col if isinstance(col, tuple) else (col, TEXT_DIM)
            item.setText(i, text)
            item.setForeground(i, QBrush(QColor(theme.tint(colour or TEXT_DIM))))
            small = QFont(font)
            small.setBold(False)
            small.setStrikeOut(False)
            small.setPixelSize(11)
            item.setFont(i, small)
        for child in node.get("children", []):
            item.addChild(self._make(child))
        return item

    def _walk(self):
        stack = [self.topLevelItem(i) for i in range(self.topLevelItemCount())]
        while stack:
            item = stack.pop()
            yield item
            stack.extend(item.child(i) for i in range(item.childCount()))

    def expanded_ids(self) -> set:
        return {it.data(0, ID_ROLE) for it in self._walk() if it.isExpanded()}

    def current_id(self):
        item = self.currentItem()
        return item.data(0, ID_ROLE) if item else None

    def select_id(self, node_id: str):
        for item in self._walk():
            if item.data(0, ID_ROLE) == node_id:
                self.setCurrentItem(item)
                return

    # ── Interaction ───────────────────────────────────────────────────────

    def _item_changed(self, item, column):
        if self._building or column != 0 or not (item.flags() & Qt.ItemIsUserCheckable):
            return
        self.checked.emit(item.data(0, ID_ROLE), item.checkState(0) == Qt.Checked)

    def startDrag(self, actions):
        item = self.currentItem()
        self._drag_id = item.data(0, ID_ROLE) if item else None
        super().startDrag(actions)

    def dropEvent(self, event):
        drag_id = self._drag_id or self.current_id()
        self._building = True
        super().dropEvent(event)
        self._building = False
        if not drag_id:
            return
        for item in self._walk():
            if item.data(0, ID_ROLE) == drag_id:
                parent = item.parent()
                index = parent.indexOfChild(item) if parent else self.indexOfTopLevelItem(item)
                self.moved.emit(drag_id, parent.data(0, ID_ROLE) if parent else None, index)
                break
        self._drag_id = None

    def keyPressEvent(self, event):
        nid = self.current_id()
        if nid and event.key() == Qt.Key_Tab:
            self.indent_requested.emit(nid, 1)
            return
        if nid and event.key() == Qt.Key_Backtab:
            self.indent_requested.emit(nid, -1)
            return
        if nid and event.key() in (Qt.Key_Return, Qt.Key_Enter):
            self.activated_id.emit(nid)
            return
        if nid and event.key() == Qt.Key_Delete:
            self.delete_requested.emit(nid)
            return
        super().keyPressEvent(event)

    def focusNextPrevChild(self, forward):
        # Tab indents instead of moving the focus away.
        if self.current_id():
            return False
        return super().focusNextPrevChild(forward)

    def _menu(self, pos):
        item = self.itemAt(pos)
        if item is None:
            return
        nid = item.data(0, ID_ROLE)
        menu = QMenu(self)
        menu.addAction("Abrir").triggered.connect(lambda: self.activated_id.emit(nid))
        menu.addAction("+ Añadir dentro").triggered.connect(lambda: self.add_child_requested.emit(nid))
        menu.addAction("Sangrar  (Tab)").triggered.connect(lambda: self.indent_requested.emit(nid, 1))
        menu.addAction("Quitar sangría  (Shift+Tab)").triggered.connect(
            lambda: self.indent_requested.emit(nid, -1))
        menu.addSeparator()
        menu.addAction("Eliminar…").triggered.connect(lambda: self.delete_requested.emit(nid))
        menu.exec(self.viewport().mapToGlobal(pos))

    def sizeHint(self):
        return QSize(500, 320)

"""
NoteVault File Explorer
Left panel: tree widget showing the real vault filesystem.
Adapted from SDD Studio's PhaseNavigator.
"""

from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QTreeWidget, QTreeWidgetItem,
    QPushButton, QInputDialog, QMessageBox, QFrame, QLineEdit,
)
from PySide6.QtCore import Qt, Signal, QPoint, QVariantAnimation, QEasingCurve, QParallelAnimationGroup
from PySide6.QtWidgets import QGraphicsOpacityEffect
from PySide6.QtGui import QFont, QColor

from ...core.vault_manager import VaultManager, Note
from .. import theme
from ...config import AppConfig


def tiny_caps(text: str, obj_name: str = "sectionLabel") -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setObjectName(obj_name)
    f = lbl.font()
    f.setLetterSpacing(QFont.AbsoluteSpacing, 0.9)
    lbl.setFont(f)
    return lbl


class _VaultPopup(QFrame):
    vault_picked = Signal(object)  # Path or None

    def __init__(self, recent: list[Path], current: Path, parent=None):
        super().__init__(parent, Qt.Popup)
        self.setObjectName("vaultPopup")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(2)

        for vault in recent:
            mark = "✓  " if vault == current else "    "
            btn = QPushButton(mark + vault.name)
            btn.setObjectName("vaultPopupRow")
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(lambda _=False, p=vault: self._pick(p))
            layout.addWidget(btn)

        div = QFrame()
        div.setFixedHeight(1)
        div.setObjectName("vaultPopupDivider")
        layout.addWidget(div)

        open_btn = QPushButton("  Abrir otra vault…")
        open_btn.setObjectName("vaultPopupRow")
        open_btn.setCursor(Qt.PointingHandCursor)
        open_btn.clicked.connect(lambda: self._pick(None))
        layout.addWidget(open_btn)

        self._opacity = QGraphicsOpacityEffect(self)
        self._opacity.setOpacity(0.0)
        self.setGraphicsEffect(self._opacity)

    def _pick(self, path):
        self.vault_picked.emit(path)
        self.close()

    def show_animated(self, bottom_left_global: QPoint):
        self.adjustSize()
        end_pos = QPoint(bottom_left_global.x(), bottom_left_global.y() - self.height())
        start_pos = end_pos + QPoint(0, 10)
        self.move(start_pos)
        self.show()

        fade = QVariantAnimation(self)
        fade.setDuration(140)
        fade.setStartValue(0.0)
        fade.setEndValue(1.0)
        fade.setEasingCurve(QEasingCurve.OutCubic)
        fade.valueChanged.connect(self._opacity.setOpacity)

        slide = QVariantAnimation(self)
        slide.setDuration(140)
        slide.setStartValue(start_pos)
        slide.setEndValue(end_pos)
        slide.setEasingCurve(QEasingCurve.OutCubic)
        slide.valueChanged.connect(self.move)

        group = QParallelAnimationGroup(self)
        group.addAnimation(fade)
        group.addAnimation(slide)
        self._anim = group
        group.start()


class FileExplorer(QWidget):
    note_selected       = Signal(Path)
    vault_switch_requested = Signal(Path)
    new_note_requested  = Signal(Path)   # parent folder
    new_folder_requested = Signal(Path)  # parent folder

    def __init__(self, vault: VaultManager, parent=None):
        super().__init__(parent)
        self.vault = vault
        self._init_ui()

    def _init_ui(self):
        self.setObjectName("sidebarPanel")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 10, 6, 8)
        layout.setSpacing(4)

        # Header row
        header = QHBoxLayout()
        header.addWidget(tiny_caps("Explorador"))
        header.addStretch()
        self._stats_label = QLabel("0 notas")
        self._stats_label.setObjectName("metaLabel")
        header.addWidget(self._stats_label, alignment=Qt.AlignRight)
        layout.addLayout(header)

        # Action buttons row
        actions = QHBoxLayout()
        actions.setSpacing(2)
        new_note_btn = QPushButton("+ Nota")
        new_note_btn.setObjectName("ghostBtn")
        new_note_btn.setFixedHeight(24)
        new_note_btn.setCursor(Qt.PointingHandCursor)
        new_note_btn.clicked.connect(lambda: self.new_note_requested.emit(self.vault.vault_root))
        actions.addWidget(new_note_btn)

        new_folder_btn = QPushButton("+ Carpeta")
        new_folder_btn.setObjectName("ghostBtn")
        new_folder_btn.setFixedHeight(24)
        new_folder_btn.setCursor(Qt.PointingHandCursor)
        new_folder_btn.clicked.connect(lambda: self.new_folder_requested.emit(self.vault.vault_root))
        actions.addWidget(new_folder_btn)
        layout.addLayout(actions)

        # Search filter
        self._search = QLineEdit()
        self._search.setPlaceholderText("Filtrar notas…")
        self._search.setObjectName("inlineSearch")
        self._search.textChanged.connect(self._filter_tree)
        layout.addWidget(self._search)

        # Tree
        self._tree = QTreeWidget()
        self._tree.setHeaderHidden(True)
        self._tree.setIndentation(14)
        self._tree.setRootIsDecorated(True)
        self._tree.setFrameShape(QTreeWidget.NoFrame)
        self._tree.itemClicked.connect(self._on_item_clicked)
        self._tree.itemDoubleClicked.connect(self._on_item_double_clicked)
        layout.addWidget(self._tree, stretch=1)

        layout.addWidget(self._build_vault_switcher())
        self.populate_tree()

    def _build_vault_switcher(self) -> QWidget:
        bar = QPushButton()
        bar.setObjectName("vaultSwitcherBar")
        bar.setCursor(Qt.PointingHandCursor)
        bar.clicked.connect(self._open_vault_menu)
        self._vault_btn = bar

        row = QHBoxLayout(bar)
        row.setContentsMargins(10, 8, 8, 8)
        row.setSpacing(6)
        self._vault_name_label = QLabel(self.vault.vault_root.name)
        self._vault_name_label.setObjectName("vaultName")
        row.addWidget(self._vault_name_label, stretch=1)
        chevron = QLabel("⌄")
        chevron.setObjectName("vaultChevron")
        row.addWidget(chevron)
        return bar

    def _open_vault_menu(self):
        recent = AppConfig.get_recent_vaults()
        popup = _VaultPopup(recent, self.vault.vault_root, self)
        popup.vault_picked.connect(self._on_vault_picked)
        self._popup = popup
        tl = self._vault_btn.mapToGlobal(QPoint(0, 0))
        popup.show_animated(tl)

    def _on_vault_picked(self, path):
        if path is None:
            from PySide6.QtWidgets import QFileDialog
            chosen = QFileDialog.getExistingDirectory(self, "Seleccionar Vault", str(Path.home()))
            if chosen:
                self.vault_switch_requested.emit(Path(chosen))
        elif path != self.vault.vault_root:
            self.vault_switch_requested.emit(path)

    def set_vault(self, vault: VaultManager):
        self.vault = vault
        self._vault_name_label.setText(vault.vault_root.name)
        self.populate_tree()

    def populate_tree(self, active_path: Path = None):
        self._tree.clear()
        stats = self.vault.stats()
        self._stats_label.setText(f"{stats['notes']} notas")

        tree_data = self.vault.tree()
        for item_data in tree_data:
            self._add_tree_item(self._tree.invisibleRootItem(), item_data, active_path)

        self._tree.expandAll()

    def _add_tree_item(self, parent, data: dict, active_path: Path = None):
        if data["type"] == "folder":
            item = QTreeWidgetItem(parent)
            item.setText(0, "  " + data["name"])
            item.setForeground(0, QColor(theme.tint("#888895")))
            font = item.font(0)
            font.setBold(True)
            font.setPointSizeF(8.5)
            item.setFont(0, font)
            item.setData(0, Qt.UserRole, {"type": "folder", "path": data["path"]})
            for child in data["children"]:
                self._add_tree_item(item, child, active_path)
        else:
            item = QTreeWidgetItem(parent)
            note_path = data["path"]
            is_active = active_path and note_path == active_path
            color = "#dcdde0" if is_active else "#888895"
            item.setText(0, "  " + data["name"])
            item.setForeground(0, QColor(theme.tint(color)))
            item.setData(0, Qt.UserRole, {"type": "note", "path": note_path})
            if is_active:
                self._tree.setCurrentItem(item)

    def _on_item_clicked(self, item: QTreeWidgetItem, col: int):
        data = item.data(0, Qt.UserRole)
        if data and data["type"] == "note":
            self.note_selected.emit(data["path"])

    def _on_item_double_clicked(self, item: QTreeWidgetItem, col: int):
        data = item.data(0, Qt.UserRole)
        if data and data["type"] == "folder":
            item.setExpanded(not item.isExpanded())

    def _filter_tree(self, query: str):
        q = query.lower()
        def _apply(item):
            text = item.text(0).lower()
            visible = not q or q in text
            child_visible = False
            for i in range(item.childCount()):
                if _apply(item.child(i)):
                    child_visible = True
            show = visible or child_visible
            item.setHidden(not show)
            return show

        root = self._tree.invisibleRootItem()
        for i in range(root.childCount()):
            _apply(root.child(i))

    def set_active_note(self, path: Path):
        self.populate_tree(active_path=path)

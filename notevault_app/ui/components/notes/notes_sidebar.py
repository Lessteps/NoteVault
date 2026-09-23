"""
Notes sidebar — the Obsidian-style left panel.

A fixed tab strip at the very top (Files · Search · Bookmarks) that never
scrolls away, and below it the tool row and the panel for the active tab.
"""

from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QTreeWidget, QTreeWidgetItem, QLineEdit, QStackedWidget, QListWidget,
    QListWidgetItem, QInputDialog, QMessageBox, QMenu, QFileDialog, QDialog,
    QApplication, QAbstractItemView,
)
from PySide6.QtCore import Qt, Signal, QPoint, QTimer
from PySide6.QtGui import QFont, QColor, QAction, QDragEnterEvent, QDropEvent
from PySide6.QtWidgets import QStyle

from ....core.vault_manager import VaultManager
from ....core.notes_service import NotesService
from ....core.workspace_manager import WorkspaceManager
from ....core.tag_index import TagIndex
from ....config import AppConfig
from ... import theme
from .vault_dialog import VaultDialog
from .file_icons import icon_for
from .knowledge_graph_widget import KnowledgeGraphWidget
from .study_folders_dialog import StudyFoldersDialog

class _DraggableTree(QTreeWidget):
    """QTreeWidget with Obsidian-style fluid drag & drop.

    The whole drag gesture is handed to Qt (drop indicator, edge auto-scroll,
    hover auto-expand of folders); only the final drop is intercepted so the
    filesystem move happens through the sidebar instead of Qt reparenting the
    widget items itself.
    """

    # sidebar sets this after construction
    drop_handler = None  # callable(list[Path], dest_folder|None) | None
    middle_clicked = Signal(Path)

    def mousePressEvent(self, event):
        if event.button() == Qt.MiddleButton:
            item = self.itemAt(event.position().toPoint())
            if item is not None:
                data = item.data(0, Qt.UserRole) or {}
                if data.get("type") == "note" and data.get("path"):
                    self.middle_clicked.emit(Path(data["path"]))
                    event.accept()
                    return
        super().mousePressEvent(event)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDragDropMode(QAbstractItemView.InternalMove)
        self.setDefaultDropAction(Qt.MoveAction)
        self.setSelectionMode(QAbstractItemView.ExtendedSelection)
        # Visual feedback that makes the drag feel fluid.
        self.setDropIndicatorShown(True)
        self.setAutoScroll(True)
        self.setAutoScrollMargin(24)
        # Hovering a folder while dragging expands it, like Obsidian.
        self.setAutoExpandDelay(450)

    def mimeData(self, items):
        """Add file URLs to the drag so a note can also be dropped onto the
        canvas (or another app). Internal move is unaffected: dropEvent keys
        off event.source() and selectedItems(), not this mime."""
        data = super().mimeData(items)
        try:
            from PySide6.QtCore import QUrl
            urls = []
            for it in items:
                d = it.data(0, Qt.UserRole) or {}
                p = d.get("path")
                if p:
                    urls.append(QUrl.fromLocalFile(str(p)))
            if urls:
                data.setUrls(urls)
        except Exception:
            pass
        return data

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.source() is self:
            super().dragEnterEvent(event)
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.source() is not self:
            event.ignore()
            return
        # Let Qt draw the drop indicator, auto-scroll and auto-expand. Its
        # internal validation also rejects illegal drops (a folder onto its
        # own descendant) by leaving the event un-accepted.
        super().dragMoveEvent(event)

    def _dest_folder_for(self, event) -> "tuple[bool, Path|None]":
        """Return (ok, dest_folder). dest_folder is None for the vault root."""
        item = self.itemAt(event.position().toPoint())
        if item is None:
            return True, None  # dropped on empty space → root

        pos = self.dropIndicatorPosition()
        data = item.data(0, Qt.UserRole) or {}

        # Dropping *onto* a folder moves into it; onto a note, or between
        # rows, targets the containing folder (sibling placement).
        if pos == QAbstractItemView.OnItem and data.get("type") == "folder":
            return True, Path(data["path"])

        parent = item.parent()
        if parent is None:
            return True, None  # sibling of a top-level item → root
        pdata = parent.data(0, Qt.UserRole) or {}
        if pdata.get("path"):
            return True, Path(pdata["path"])
        return True, None

    def dropEvent(self, event: QDropEvent):
        if event.source() is not self or self.drop_handler is None:
            event.ignore()
            return

        src_items = self.selectedItems()
        if not src_items:
            event.ignore()
            return

        ok, dest_folder = self._dest_folder_for(event)
        if not ok:
            event.ignore()
            return

        # We move files ourselves, so stop Qt from reparenting the widgets.
        event.setDropAction(Qt.IgnoreAction)
        event.accept()

        src_paths = [Path(d["path"])
                     for it in src_items
                     if (d := (it.data(0, Qt.UserRole) or {})).get("path")]
        if src_paths:
            self.drop_handler(src_paths, dest_folder)


BG_PANEL   = "#1a1a1e"
BG_TAB     = "#202024"
BORDER     = "#33333e"
TEXT       = "#dcdde0"
TEXT_DIM   = "#888895"
TEXT_FAINT = "#666672"
ACCENT     = "#7c5af0"
ACCENT_SOFT = "rgba(124, 90, 240, 0.18)"

TAB_FILES     = 0
TAB_SEARCH    = 1
TAB_BOOKMARKS = 2
TAB_GRAPH     = 3
TAB_TAGS      = 4


class _TabButton(QPushButton):
    """One of the three pinned tabs at the top of the sidebar."""

    def __init__(self, glyph: str, tooltip: str, parent=None):
        super().__init__(glyph, parent)
        self.setCheckable(True)
        self.setFixedSize(30, 28)
        self.setCursor(Qt.PointingHandCursor)
        self.setToolTip(tooltip)
        self.setStyleSheet(
            "QPushButton{background:transparent;border:none;border-radius:6px;"
            f"color:{TEXT_FAINT};font-size:14px;padding:0px;}}"
            f"QPushButton:hover{{background:#26262e;color:{TEXT};}}"
            f"QPushButton:checked{{background:{ACCENT_SOFT};color:{ACCENT};}}"
        )


class _ToolButton(QPushButton):
    """One icon in the tool row under the tabs."""

    def __init__(self, glyph: str, tooltip: str, parent=None):
        super().__init__(glyph, parent)
        self.setFixedSize(26, 24)
        self.setCheckable(False)
        self.setCursor(Qt.PointingHandCursor)
        self.setToolTip(tooltip)
        self.setStyleSheet(
            "QPushButton{background:transparent;border:none;border-radius:5px;"
            f"color:{TEXT_DIM};font-size:13px;padding:0px;}}"
            f"QPushButton:hover{{background:#26262e;color:{TEXT};}}"
            f"QPushButton:checked{{background:{ACCENT_SOFT};color:{ACCENT};}}"
        )


class NotesSidebar(QWidget):
    note_selected          = Signal(Path)
    note_selected_new_tab  = Signal(Path)
    note_selected_at_line  = Signal(Path, int)
    vault_switch_requested = Signal(Path)
    bookmarks_changed      = Signal()
    note_moved             = Signal(Path, Path)   # (old_path, new_path)
    note_created           = Signal(Path)
    note_deleted           = Signal(Path)
    generate_map_requested = Signal()             # open the concept-map generator

    def __init__(self, vault: VaultManager, service: NotesService, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebarPanel")
        self.vault = vault
        self.service = service
        self._ws_mgr = WorkspaceManager(vault.vault_root)
        self._numeric_sort = True
        self._active_path: Path = None
        self._init_ui()

    # ── Build ─────────────────────────────────────────────────────────────

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_tab_strip())
        root.addWidget(self._build_tool_row())

        self._stack = QStackedWidget()
        self._stack.addWidget(self._build_files_page())      # 0
        self._stack.addWidget(self._build_search_page())     # 1
        self._stack.addWidget(self._build_bookmarks_page())  # 2
        self._graph_widget = KnowledgeGraphWidget(self.vault.vault_root)
        self._graph_widget.open_note_requested.connect(self._open_graph_note)
        self._stack.addWidget(self._graph_widget)            # 3
        self._stack.addWidget(self._build_tags_page())       # 4
        root.addWidget(self._stack, stretch=1)

        root.addWidget(self._build_vault_switcher())
        self.set_tab(TAB_FILES)
        self.populate_tree()

    def _build_tab_strip(self) -> QWidget:
        """Pinned at the top; never scrolls, never moves."""
        bar = QFrame()
        bar.setObjectName("notesTabStrip")
        bar.setAttribute(Qt.WA_StyledBackground, True)
        bar.setFixedHeight(38)
        bar.setStyleSheet(
            f"QFrame#notesTabStrip{{background:{BG_TAB};border:none;"
            f"border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(8, 0, 8, 0)
        lay.setSpacing(4)

        self._tabs = []
        for idx, (glyph, tip) in enumerate([
            ("🗀", "Files — explorador de archivos"),
            ("🔍", "Search — buscar en todas las notas"),
            ("🔖", "Bookmarks — notas marcadas"),
            ("🕸", "Grafo — mapa interactivo del conocimiento"),
            ("#", "Tags — índice de etiquetas"),
        ]):
            b = _TabButton(glyph, tip)
            b.clicked.connect(lambda _=False, i=idx: self.set_tab(i))
            self._tabs.append(b)
            lay.addWidget(b)

        lay.addStretch()
        self._stats_label = QLabel("0 notas")
        self._stats_label.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:transparent;border:none;"
        )
        lay.addWidget(self._stats_label)
        return bar

    def _build_tool_row(self) -> QWidget:
        row = QFrame()
        row.setAttribute(Qt.WA_StyledBackground, True)
        row.setFixedHeight(32)
        row.setStyleSheet(
            f"QFrame{{background:{BG_PANEL};border:none;"
            f"border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(row)
        lay.setContentsMargins(8, 0, 8, 0)
        lay.setSpacing(2)

        self._btn_new_note = _ToolButton("✎", "Nueva nota")
        self._btn_new_note.clicked.connect(self.new_note)
        lay.addWidget(self._btn_new_note)

        self._btn_new_folder = _ToolButton("🗀", "Nueva carpeta")
        self._btn_new_folder.clicked.connect(self.new_folder)
        lay.addWidget(self._btn_new_folder)

        self._btn_map = _ToolButton("🗺", "Generar mapa conceptual")
        self._btn_map.clicked.connect(self.generate_map_requested.emit)
        lay.addWidget(self._btn_map)

        self._btn_study = _ToolButton("🎓", "Crear espacios de estudio (Matemáticas, Inglés, Programación)")
        self._btn_study.clicked.connect(self.open_study_folders)
        lay.addWidget(self._btn_study)

        self._btn_sort = _ToolButton("⇅", "Ordenar por numeración")
        self._btn_sort.setCheckable(True)
        self._btn_sort.setChecked(True)
        self._btn_sort.clicked.connect(self._toggle_sort)
        lay.addWidget(self._btn_sort)

        self._btn_reveal = _ToolButton("◫", "Revelar el archivo de la pestaña actual")
        self._btn_reveal.clicked.connect(self.reveal_active)
        lay.addWidget(self._btn_reveal)

        self._btn_collapse = _ToolButton("✕", "Colapsar todas las carpetas")
        self._btn_collapse.clicked.connect(self.collapse_all)
        lay.addWidget(self._btn_collapse)

        lay.addStretch()
        return row

    # ── Files page ────────────────────────────────────────────────────────

    def _build_files_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background:{BG_PANEL};")
        lay = QVBoxLayout(page)
        lay.setContentsMargins(6, 6, 4, 6)
        lay.setSpacing(5)

        self._filter = QLineEdit()
        self._filter.setPlaceholderText("Filtrar por nombre…")
        self._filter.setObjectName("inlineSearch")
        self._filter.textChanged.connect(self._filter_tree)
        lay.addWidget(self._filter)

        self._tree = _DraggableTree()
        self._tree.drop_handler = self._on_tree_drop
        self._tree.middle_clicked.connect(self.note_selected_new_tab.emit)
        self._tree.setHeaderHidden(True)
        self._tree.setIndentation(14)
        self._tree.setRootIsDecorated(True)
        self._tree.setFrameShape(QTreeWidget.NoFrame)
        self._tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self._tree.customContextMenuRequested.connect(self._tree_menu)
        self._tree.itemClicked.connect(self._on_item_clicked)
        self._tree.itemDoubleClicked.connect(self._on_item_double_clicked)
        self._tree.itemExpanded.connect(self._on_item_expanded)
        lay.addWidget(self._tree, stretch=1)
        return page

    # ── Search page ───────────────────────────────────────────────────────

    def _build_search_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background:{BG_PANEL};")
        lay = QVBoxLayout(page)
        lay.setContentsMargins(6, 6, 4, 6)
        lay.setSpacing(5)

        self._search_input = QLineEdit()
        self._search_input.setPlaceholderText(
            "Buscar… tag:python  path:carpeta  property:clave  \"frase\""
        )
        self._search_input.setObjectName("inlineSearch")
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.setInterval(260)
        self._search_timer.timeout.connect(self.run_search)
        self._search_input.returnPressed.connect(self.run_search)
        self._search_input.textChanged.connect(self._search_typed)
        lay.addWidget(self._search_input)

        self._search_info = QLabel(
            "Escribe para buscar. Operadores: tag:x  path:carpeta  property:clave  \"frase exacta\""
        )
        self._search_info.setWordWrap(True)
        self._search_info.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:transparent;border:none;"
        )
        lay.addWidget(self._search_info)

        self._search_list = QListWidget()
        self._search_list.setFrameShape(QListWidget.NoFrame)
        self._search_list.setWordWrap(True)
        self._search_list.itemActivated.connect(self._open_search_hit)
        self._search_list.itemClicked.connect(self._open_search_hit)
        lay.addWidget(self._search_list, stretch=1)
        return page

    # ── Bookmarks page ────────────────────────────────────────────────────

    def _build_bookmarks_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background:{BG_PANEL};")
        lay = QVBoxLayout(page)
        lay.setContentsMargins(6, 6, 4, 6)
        lay.setSpacing(5)

        hint = QLabel("Marca una nota con 🔖 desde el editor o el menú del árbol.")
        hint.setWordWrap(True)
        hint.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:transparent;border:none;"
        )
        lay.addWidget(hint)

        self._bm_list = QListWidget()
        self._bm_list.setFrameShape(QListWidget.NoFrame)
        self._bm_list.setContextMenuPolicy(Qt.CustomContextMenu)
        self._bm_list.customContextMenuRequested.connect(self._bm_menu)
        self._bm_list.itemClicked.connect(self._open_bookmark)
        lay.addWidget(self._bm_list, stretch=1)
        return page

    # ── Tags page ─────────────────────────────────────────────────────────

    def _build_tags_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background:{BG_PANEL};")
        lay = QVBoxLayout(page)
        lay.setContentsMargins(6, 6, 4, 6)
        lay.setSpacing(5)

        self._tags_list = QListWidget()
        self._tags_list.setFrameShape(QListWidget.NoFrame)
        self._tags_list.setStyleSheet(
            f"QListWidget{{background:transparent;border:none;color:{TEXT_DIM};}}"
            f"QListWidget::item{{padding:3px 4px;}}"
            f"QListWidget::item:selected{{background:{ACCENT_SOFT};color:{ACCENT};}}"
        )
        self._tags_list.itemClicked.connect(self._on_tag_clicked)
        lay.addWidget(self._tags_list, stretch=1)

        # Note list for the selected tag
        self._tag_notes_label = QLabel("")
        self._tag_notes_label.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:transparent;border:none;padding:2px 4px;"
        )
        lay.addWidget(self._tag_notes_label)

        self._tag_notes_list = QListWidget()
        self._tag_notes_list.setFrameShape(QListWidget.NoFrame)
        self._tag_notes_list.setStyleSheet(
            f"QListWidget{{background:transparent;border:none;color:{TEXT_DIM};}}"
            f"QListWidget::item{{padding:3px 4px;}}"
            f"QListWidget::item:selected{{background:{ACCENT_SOFT};color:{TEXT};}}"
        )
        self._tag_notes_list.itemClicked.connect(self._on_tag_note_clicked)
        self._tag_notes_list.hide()
        lay.addWidget(self._tag_notes_list, stretch=1)
        return page

    def _refresh_tags(self):
        """Build the tag index from the in-memory note index and populate the list."""
        tag_idx = TagIndex.for_vault(self.service.index)
        notes = self.service.index.cached_notes()
        if notes:
            tag_idx.build(notes)
        else:
            QTimer.singleShot(300, self._refresh_tags)
            return

        self._tags_list.clear()
        self._tag_notes_list.hide()
        self._tag_notes_label.setText("")
        for tag, count in tag_idx.all_tags_sorted():
            item = QListWidgetItem(f"#{tag}  ({count})")
            item.setData(Qt.UserRole, tag)
            self._tags_list.addItem(item)

    def _on_tag_clicked(self, item: QListWidgetItem):
        tag = item.data(Qt.UserRole)
        tag_idx = TagIndex.for_vault(self.service.index)
        paths = tag_idx.paths_for_tag(tag)
        self._tag_notes_label.setText(f"#{tag} — {len(paths)} nota(s)")
        self._tag_notes_list.clear()
        for p in sorted(paths, key=lambda x: x.stem.lower()):
            ni = QListWidgetItem(p.stem)
            ni.setData(Qt.UserRole, p)
            self._tag_notes_list.addItem(ni)
        self._tag_notes_list.show()

    def _on_tag_note_clicked(self, item: QListWidgetItem):
        path = item.data(Qt.UserRole)
        if path:
            self.note_selected.emit(Path(path))

    # ── Vault switcher ────────────────────────────────────────────────────

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
        dlg = VaultDialog(self.vault.vault_root, AppConfig.get_recent_vaults(),
                          self)
        if dlg.exec() == QDialog.Accepted and dlg.selected:
            if Path(dlg.selected) != self.vault.vault_root:
                self.vault_switch_requested.emit(Path(dlg.selected))

    # ── Tabs ──────────────────────────────────────────────────────────────

    def set_tab(self, index: int):
        for i, b in enumerate(self._tabs):
            b.setChecked(i == index)
        self._stack.setCurrentIndex(index)
        for b in (self._btn_new_note, self._btn_new_folder,
                  self._btn_sort, self._btn_reveal, self._btn_collapse):
            b.setEnabled(index == TAB_FILES)
        if index == TAB_BOOKMARKS:
            self.refresh_bookmarks()
        elif index == TAB_SEARCH:
            self._search_input.setFocus()
        elif index == TAB_GRAPH:
            self._graph_widget.ensure_loaded()
        elif index == TAB_TAGS:
            self._refresh_tags()

    # ── Tool actions ──────────────────────────────────────────────────────

    def _target_folder(self) -> Path:
        """Selected folder, the folder of the selected note, or the root."""
        item = self._tree.currentItem()
        if item:
            data = item.data(0, Qt.UserRole) or {}
            path = data.get("path")
            if path:
                return path if data.get("type") == "folder" else Path(path).parent
        return self.vault.vault_root

    def new_note(self):
        folder = self._target_folder()
        rel = self._rel(folder)
        title, ok = QInputDialog.getText(
            self, "Nueva nota", f"Nombre de la nota (en {rel}):"
        )
        if not ok or not title.strip():
            return
        clean_title = title.strip()
        note = self.service.create_note(clean_title, folder)
        item = self._find_item(folder)
        if item is not None:
            data = item.data(0, Qt.UserRole) or {}
            data["loaded"] = False
            item.setData(0, Qt.UserRole, data)
        self.populate_tree(note.path)
        self.reveal(note.path)
        self.note_created.emit(note.path)
        self.note_selected.emit(note.path)

    def new_canvas(self, folder: Path = None):
        target = folder if folder is not None else self._target_folder()
        win = self.window()
        if hasattr(win, "new_canvas"):
            win.new_canvas(target)
        else:
            from .canvas_actions import create_canvas
            p = create_canvas(self.vault, self.service, target)
            if p:
                self.populate_tree(p)
                self.reveal(p)
                self.note_created.emit(p)
                self.note_selected.emit(p)

    def new_folder(self):
        parent = self._target_folder()
        rel = self._rel(parent)
        name, ok = QInputDialog.getText(
            self, "Nueva carpeta", f"Nombre de la carpeta (en {rel}):"
        )
        if not ok or not name.strip():
            return
        created_folder = self.service.create_folder(name.strip(), parent)
        item = self._find_item(parent)
        if item is not None:
            data = item.data(0, Qt.UserRole) or {}
            data["loaded"] = False
            item.setData(0, Qt.UserRole, data)
        self.populate_tree(self._active_path)
        self._reveal_path(created_folder)

    def open_study_folders(self):
        dlg = StudyFoldersDialog(self._ws_mgr, self)
        dlg.folders_changed.connect(self._on_study_folders_changed)
        dlg.open_note_requested.connect(self._on_study_index_open)
        dlg.exec()

    def _on_study_folders_changed(self):
        self.set_tab(TAB_FILES)
        self.populate_tree(self._active_path)
        # Rebuild the graph next time it is shown, since notes/folders changed.
        self._graph_widget.set_vault(self.vault.vault_root)

    def _on_study_index_open(self, path: Path):
        self._reveal_path(path)
        self.note_selected.emit(path)

    def _toggle_sort(self):
        self._numeric_sort = self._btn_sort.isChecked()
        self._btn_sort.setToolTip(
            "Ordenar por numeración" if self._numeric_sort
            else "Orden alfabético (pulsa para numerar)"
        )
        self.populate_tree(self._active_path)

    def reveal_active(self):
        """Select and scroll to the note open in the current editor tab."""
        if not self._active_path:
            return
        self.set_tab(TAB_FILES)
        item = self._find_item(self._active_path)
        if item is None:
            item = self._reveal_path(self._active_path)
        if item is not None:
            parent = item.parent()
            while parent is not None:
                parent.setExpanded(True)
                parent = parent.parent()
            self._tree.setCurrentItem(item)
            self._tree.scrollToItem(item)

    def reveal(self, path: Path):
        self._active_path = Path(path)
        self.reveal_active()

    def collapse_all(self):
        self._tree.collapseAll()

    def _rel(self, folder: Path) -> str:
        try:
            rel = Path(folder).relative_to(self.vault.vault_root)
            return str(rel) if str(rel) != "." else self.vault.vault_root.name
        except ValueError:
            return str(folder)

    # ── Tree ──────────────────────────────────────────────────────────────

    def populate_tree(self, active_path: Path = None):
        """Rebuild the visible tree. Only the folders that were open are
        re-read, so the cost never depends on the size of the vault."""
        if active_path is not None:
            self._active_path = Path(active_path)
        expanded = self._expanded_paths()
        self._tree.clear()

        for data in self.service.children_of(self.root, self._numeric_sort):
            self._add_item(self._tree.invisibleRootItem(), data)

        for folder in sorted(expanded, key=len):
            item = self._find_item(Path(folder))
            if item is not None:
                item.setExpanded(True)

        if self._active_path:
            item = self._find_item(self._active_path)
            if item is not None:
                self._tree.setCurrentItem(item)
        self._filter_tree(self._filter.text())
        self._update_stats()

    @property
    def root(self) -> Path:
        return self.vault.vault_root

    def _update_stats(self):
        """Counting every note walks the vault, so do it off the hot path."""
        QTimer.singleShot(0, self._count_notes)

    def _count_notes(self):
        try:
            total = self.vault.stats()["notes"]
        except Exception:
            self._stats_label.setText("")
            return
        cap = "" if total < 4000 else "+"
        self._stats_label.setText(f"{total}{cap} notas")

    def _add_item(self, parent, data: dict):
        item = QTreeWidgetItem(parent)
        style = QApplication.style()
        if data["type"] == "folder":
            item.setIcon(0, style.standardIcon(QStyle.SP_DirIcon))
            item.setText(0, data["name"])
            item.setForeground(0, QColor(theme.tint(TEXT_DIM)))
            f = item.font(0)
            f.setBold(True)
            f.setPointSizeF(8.5)
            item.setFont(0, f)
            item.setData(0, Qt.UserRole, {"type": "folder", "path": data["path"],
                                          "loaded": False})
            item.setToolTip(0, str(data["path"]))
            children = data.get("children")
            if children is None:
                # Lazy: a single placeholder gives the folder its arrow; the
                # real contents are read when it is expanded.
                if self.service.has_children(data["path"]):
                    placeholder = QTreeWidgetItem(item)
                    placeholder.setText(0, "  …")
                    placeholder.setDisabled(True)
                    placeholder.setData(0, Qt.UserRole, {"type": "placeholder"})
            else:
                for child in children:
                    self._add_item(item, child)
                item.setData(0, Qt.UserRole,
                             {"type": "folder", "path": data["path"],
                              "loaded": True})
        else:
            path = data["path"]
            active = self._active_path and Path(path) == self._active_path
            marked = self.service.is_bookmarked(path)
            label = data["name"] + ("  🔖" if marked else "")
            item.setIcon(0, icon_for(path))
            item.setText(0, label)
            item.setForeground(0, QColor(theme.tint(TEXT if active else TEXT_DIM)))
            if active:
                f = item.font(0)
                f.setBold(True)
                item.setFont(0, f)
            item.setData(0, Qt.UserRole, {"type": "note", "path": path})
            item.setToolTip(0, str(path))

    def _iter_items(self, parent=None):
        parent = parent or self._tree.invisibleRootItem()
        for i in range(parent.childCount()):
            child = parent.child(i)
            yield child
            yield from self._iter_items(child)

    def _find_item(self, path: Path):
        path = Path(path)
        for item in self._iter_items():
            data = item.data(0, Qt.UserRole) or {}
            if data.get("path") and Path(data["path"]) == path:
                return item
        return None

    def _expanded_paths(self) -> set:
        out = set()
        for item in self._iter_items():
            data = item.data(0, Qt.UserRole) or {}
            if data.get("type") == "folder" and item.isExpanded():
                out.add(str(data["path"]))
        return out

    def _restore_expanded(self, paths: set):
        for item in self._iter_items():
            data = item.data(0, Qt.UserRole) or {}
            if data.get("type") == "folder" and str(data.get("path")) in paths:
                item.setExpanded(True)

    def _on_item_expanded(self, item: QTreeWidgetItem):
        self._load_children(item)

    def _load_children(self, item: QTreeWidgetItem):
        data = item.data(0, Qt.UserRole) or {}
        if data.get("type") != "folder" or data.get("loaded"):
            return
        item.takeChildren()
        for child in self.service.children_of(data["path"], self._numeric_sort):
            self._add_item(item, child)
        data["loaded"] = True
        item.setData(0, Qt.UserRole, data)
        if self._filter.text():
            self._filter_tree(self._filter.text())

    def _reveal_path(self, path: Path):
        """Expand every folder from the root down to path and return its item."""
        path = Path(path)
        try:
            rel = path.relative_to(self.root)
        except ValueError:
            return None
        parent_item = None
        current = self.root
        for part in rel.parts[:-1]:
            current = current / part
            container = (parent_item if parent_item is not None
                         else self._tree.invisibleRootItem())
            found = None
            for i in range(container.childCount()):
                child = container.child(i)
                cdata = child.data(0, Qt.UserRole) or {}
                if cdata.get("path") and Path(cdata["path"]) == current:
                    found = child
                    break
            if found is None:
                return None
            self._load_children(found)
            found.setExpanded(True)
            parent_item = found
        return self._find_item(path)

    def _on_item_clicked(self, item: QTreeWidgetItem, col: int):
        data = item.data(0, Qt.UserRole) or {}
        if data.get("type") == "note":
            self._active_path = Path(data["path"])
            self.note_selected.emit(Path(data["path"]))
        elif data.get("type") == "folder":
            item.setExpanded(not item.isExpanded())

    def _on_item_double_clicked(self, item: QTreeWidgetItem, col: int):
        data = item.data(0, Qt.UserRole) or {}
        if data.get("type") == "folder":
            item.setExpanded(not item.isExpanded())

    def _filter_tree(self, query: str):
        q = (query or "").strip().lower()
        if not q:
            def unhide(item):
                item.setHidden(False)
                for i in range(item.childCount()):
                    unhide(item.child(i))
            root = self._tree.invisibleRootItem()
            for i in range(root.childCount()):
                unhide(root.child(i))
            return

        # Pre-load any matching files so lazy folders don't hide matches
        try:
            for p in self.vault.vault_root.rglob("*"):
                if p.name.startswith(".") or ".notevault" in p.parts or ".trash" in p.parts:
                    continue
                if q in p.name.lower():
                    self._reveal_path(p)
        except Exception:
            pass

        def apply(item):
            text = item.text(0).lower()
            data = item.data(0, Qt.UserRole) or {}
            if data.get("type") == "placeholder":
                return False
            hit = q in text
            child_hit = False
            for i in range(item.childCount()):
                if apply(item.child(i)):
                    child_hit = True
            item.setHidden(not (hit or child_hit))
            if child_hit:
                item.setExpanded(True)
            return hit or child_hit

        root = self._tree.invisibleRootItem()
        for i in range(root.childCount()):
            apply(root.child(i))

    # ── Context menu ──────────────────────────────────────────────────────

    def _tree_menu(self, pos: QPoint):
        item = self._tree.itemAt(pos)
        menu = QMenu(self)
        if item is None:
            menu.addAction("Nueva nota en la raíz", self.new_note)
            menu.addAction("Nuevo canvas en la raíz", lambda: self.new_canvas(self.vault.vault_root))
            menu.addAction("Nueva carpeta en la raíz", self.new_folder)
            menu.exec(self._tree.viewport().mapToGlobal(pos))
            return

        data = item.data(0, Qt.UserRole) or {}
        path = Path(data.get("path"))
        is_note = data.get("type") == "note"

        if is_note:
            menu.addAction("Abrir", lambda: self.note_selected.emit(path))
            marked = self.service.is_bookmarked(path)
            menu.addAction(
                "Quitar de marcadores" if marked else "Añadir a marcadores",
                lambda: self._toggle_bookmark(path),
            )
        else:
            menu.addAction("Nueva nota aquí", self.new_note)
            menu.addAction("Nuevo canvas aquí", lambda: self.new_canvas(path))
            menu.addAction("Nueva carpeta aquí", self.new_folder)
            menu.addAction("Abrir todas las notas de la carpeta",
                           lambda: self._open_folder_notes(path))
        menu.addSeparator()
        menu.addAction("Renombrar…", lambda: self._rename(path))
        menu.addAction("Mover a la papelera", lambda: self._delete(path))
        menu.exec(self._tree.viewport().mapToGlobal(pos))

    def _open_folder_notes(self, folder: Path):
        notes = self.service.notes_in_folder(folder, recursive=False)
        if not notes:
            QMessageBox.information(
                self, "Carpeta vacía",
                "Esta carpeta no tiene notas directamente dentro."
            )
            return
        for p in notes:
            self.note_selected.emit(p)

    def _toggle_bookmark(self, path: Path):
        self.service.toggle_bookmark(path)
        self.populate_tree(self._active_path)
        self.refresh_bookmarks()
        self.bookmarks_changed.emit()

    def _rename(self, path: Path):
        current = path.stem if path.is_file() else path.name
        name, ok = QInputDialog.getText(self, "Renombrar", "Nuevo nombre:",
                                        text=current)
        if not ok or not name.strip():
            return
        new_path = self.service.rename_path(path, name.strip())
        if self._active_path == path:
            self._active_path = new_path
        self.populate_tree(self._active_path)
        self.refresh_bookmarks()
        if new_path != path:
            self.note_moved.emit(path, new_path)

    def _delete(self, path: Path):
        answer = QMessageBox.question(
            self, "Mover a la papelera",
            f"¿Mover «{path.name}» a la papelera de la vault?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if answer != QMessageBox.Yes:
            return
        self.service.delete_path(path)
        self.populate_tree()
        self.refresh_bookmarks()
        self.note_deleted.emit(path)

    # ── Search ────────────────────────────────────────────────────────────

    def _search_typed(self, text: str):
        if len(text.strip()) >= 3:
            # Debounced: a search reads every note in the vault, and running
            # one per keystroke froze the sidebar while typing.
            self._search_timer.start()
        elif not text.strip():
            self._search_timer.stop()
            self._search_list.clear()
            self._search_info.setText(
                "Escribe para buscar en títulos y contenido."
            )

    def run_search(self):
        query = self._search_input.text().strip()
        self._search_list.clear()
        if not query:
            return
        hits = self.service.search(query)
        files = {h.path for h in hits}
        self._search_info.setText(
            f"{len(hits)} coincidencias en {len(files)} notas"
            if hits else "Sin coincidencias."
        )
        for h in hits:
            where = h.title if h.line_no == 0 else f"{h.title} · línea {h.line_no}"
            item = QListWidgetItem(f"{where}\n{h.line}")
            item.setData(Qt.UserRole, (str(h.path), h.line_no))
            item.setToolTip(str(h.path))
            self._search_list.addItem(item)

    def _open_search_hit(self, item: QListWidgetItem):
        data = item.data(Qt.UserRole)
        if not data:
            return
        path, line = data
        self._active_path = Path(path)
        self.note_selected_at_line.emit(Path(path), int(line))

    # ── Bookmarks ─────────────────────────────────────────────────────────

    _BM_ICONS = {"note": "🔖", "heading": "📌", "search": "🔍", "file": "📄"}

    def refresh_bookmarks(self):
        self._bm_list.clear()
        for bm in self.service.bookmarks_rich():
            bm_type = bm.get("type", "note")
            target = bm.get("target", "")
            label = bm.get("label") or target
            icon = self._BM_ICONS.get(bm_type, "🔖")
            item = QListWidgetItem(f"{icon}  {label}")
            item.setData(Qt.UserRole, bm)
            item.setToolTip(target)
            self._bm_list.addItem(item)
        if self._bm_list.count() == 0:
            empty = QListWidgetItem("Sin marcadores todavía")
            empty.setFlags(Qt.NoItemFlags)
            self._bm_list.addItem(empty)

    def _open_bookmark(self, item: QListWidgetItem):
        bm = item.data(Qt.UserRole)
        if not bm:
            return
        bm_type = bm.get("type", "note")
        target = bm.get("target", "")
        if bm_type == "note":
            path = self.vault.vault_root / target
            if path.exists():
                self._active_path = path
                self.note_selected.emit(path)
        elif bm_type == "heading":
            # target is "rel_path#heading text"
            if "#" in target:
                rel, _, heading = target.partition("#")
                path = self.vault.vault_root / rel
                if path.exists():
                    self._active_path = path
                    self.note_selected.emit(path)
        elif bm_type == "search":
            self.set_tab(TAB_SEARCH)
            self._search_input.setText(target)
            self.run_search()
        elif bm_type == "file":
            path = self.vault.vault_root / target
            if path.exists():
                import os
                os.startfile(str(path))

    def _bm_menu(self, pos: QPoint):
        item = self._bm_list.itemAt(pos)
        if item is None or not item.data(Qt.UserRole):
            return
        bm = item.data(Qt.UserRole)
        target = bm.get("target", "")
        bm_type = bm.get("type", "note")
        menu = QMenu(self)
        menu.addAction("Abrir", lambda: self._open_bookmark(item))
        menu.addAction("Quitar marcador",
                       lambda: (self.service.remove_bookmark_rich(bm_type, target),
                                self.refresh_bookmarks()))
        menu.exec(self._bm_list.viewport().mapToGlobal(pos))

    # ── External hooks ────────────────────────────────────────────────────

    def set_active_note(self, path: Path):
        """Highlight the open note without rebuilding the tree."""
        self._active_path = Path(path) if path else None
        if self._active_path is None:
            return
        item = self._find_item(self._active_path)
        if item is not None:
            self._tree.setCurrentItem(item)

    def set_vault(self, vault: VaultManager, service: NotesService):
        self.vault = vault
        self.service = service
        self._ws_mgr = WorkspaceManager(vault.vault_root)
        self._active_path = None
        self._vault_name_label.setText(vault.vault_root.name)
        self._graph_widget.set_vault(vault.vault_root)
        self.populate_tree()
        self.refresh_bookmarks()

    def _open_graph_note(self, note_id: str):
        """Open a note from the knowledge graph by its vault-relative posix path."""
        path = self.vault.vault_root / note_id
        if path.exists():
            self.note_selected.emit(path)

    def _on_tree_drop(self, src_paths, dest_folder):
        """Called by _DraggableTree when a drag-drop completes.

        Only the affected rows are touched (source items removed, destination
        folder reloaded), so a big vault does not flash through a full rebuild.
        """
        if isinstance(src_paths, (str, Path)):
            src_paths = [src_paths]
        dest = Path(dest_folder) if dest_folder is not None else self.vault.vault_root

        moved = []
        for src_path in src_paths:
            src_path = Path(src_path)
            try:
                new_path = self.service.move_path(src_path, dest)
            except Exception as exc:
                QMessageBox.warning(self, "No se pudo mover",
                                    f"{src_path.name}\n\n{exc}")
                continue
            if new_path == src_path:
                continue  # no-op (dropped where it already lived)
            moved.append((src_path, new_path))

        if not moved:
            return

        self._tree.setUpdatesEnabled(False)
        try:
            for src_path, _new in moved:
                old_item = self._find_item(src_path)
                if old_item is not None:
                    parent = old_item.parent() or self._tree.invisibleRootItem()
                    parent.removeChild(old_item)
            self._refresh_folder(dest)
        finally:
            self._tree.setUpdatesEnabled(True)

        last = moved[-1][1]
        if last.is_file():
            self._active_path = last
            item = self._find_item(last)
            if item is not None:
                self._tree.setCurrentItem(item)

        for src_path, new_path in moved:
            self.note_moved.emit(src_path, new_path)
        self._update_stats()

    def _refresh_folder(self, folder: Path):
        """Re-read one folder's children in place, or the root top level."""
        folder = Path(folder)
        if folder == self.vault.vault_root:
            item = None
        else:
            item = self._find_item(folder)

        if item is None:
            # Root, or a destination folder not currently visible: rebuild the
            # top level (still lazy, so cost is bounded by open folders).
            expanded = self._expanded_paths()
            self._tree.clear()
            for data in self.service.children_of(self.root, self._numeric_sort):
                self._add_item(self._tree.invisibleRootItem(), data)
            for f in sorted(expanded, key=len):
                found = self._find_item(Path(f))
                if found is not None:
                    found.setExpanded(True)
            if self._filter.text():
                self._filter_tree(self._filter.text())
            return

        data = item.data(0, Qt.UserRole) or {}
        item.takeChildren()
        data["loaded"] = False
        item.setData(0, Qt.UserRole, data)
        self._load_children(item)
        item.setExpanded(True)

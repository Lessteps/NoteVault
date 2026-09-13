"""
Markdown editor for the notes module.

  · a tab bar with the open files: pinnable, reorderable, with a right-click
    menu; pinned tabs cannot be closed and reopen with the vault
  · a Word-style formatting toolbar, and Ctrl+P for every command
  · three modes for notes: Editor (rich text), Markdown (raw source) and
    Lectura; source code files always open in a plain code view
  · a mentions footer under every note, filled in the background

The YAML frontmatter is kept aside while editing and re-attached on save,
so rich-text editing can never mangle it.
"""

import re
import subprocess
from pathlib import Path

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QTabBar, QStackedWidget, QScrollArea, QMessageBox, QInputDialog,
    QSizePolicy, QLayout, QMenu, QFileDialog, QApplication, QDialog,
)
from PySide6.QtCore import Qt, Signal, QTimer, QObject, QRunnable, QThreadPool, QUrl
from PySide6.QtGui import (
    QTextCursor, QTextCharFormat, QFont, QTextListFormat, QTextBlockFormat,
    QKeySequence, QShortcut, QDesktopServices,
)

from ....config import AppConfig
from ....core.vault_manager import VaultManager
from ....core.notes_service import NotesService
from ....core import markdown_utils, attachments
from ....core.file_kinds import kind_for
from ....core.qt_markdown import (
    document_to_markdown, prepare_markdown, prepare_for_reading, toggle_task,
    format_markdown_tables, new_table, rich_edit_problem,
)
from .note_view import (
    NoteTextEdit, NoteTextBrowser, NoteSourceEdit, set_list_level,
    toggle_marker, embed_files,
)
from .command_palette import Command, CommandPalette

BG_PAGE   = "#1a1a1e"
BG_BAR    = "#202024"
BG_CARD   = "#202024"
BORDER    = "#33333e"
TEXT      = "#dcdde0"
TEXT_DIM  = "#888895"
TEXT_FAINT = "#666672"
ACCENT    = "#7c5af0"
GREEN     = "#3fb950"

FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.S)

MODE_RICH = 0
MODE_RAW  = 1
MODE_READ = 2

PIN_GLYPH = "📌 "
MAX_MENTION_ROWS = 60

Marker = QTextBlockFormat.MarkerType


def _split_frontmatter(text: str):
    m = FRONTMATTER_RE.match(text or "")
    if not m:
        return "", text or ""
    return m.group(0), (text or "")[m.end():]


class _ToolBtn(QPushButton):
    def __init__(self, label: str, tooltip: str, width: int = 28,
                 bold: bool = False, italic: bool = False, parent=None):
        super().__init__(label, parent)
        self.setToolTip(tooltip)
        self.setFixedSize(width, 26)
        self.setCursor(Qt.PointingHandCursor)
        f = self.font()
        f.setBold(bold)
        f.setItalic(italic)
        self.setFont(f)
        # padding:0 overrides the global QPushButton padding, which left a
        # 26px button a sliver of room and cut "H1" down to a single stroke.
        self.setStyleSheet(
            "QPushButton{background:transparent;border:none;border-radius:5px;"
            f"color:{TEXT_DIM};font-size:12px;padding:0px;}}"
            f"QPushButton:hover{{background:#2e2e38;color:{TEXT};}}"
            f"QPushButton:checked{{background:rgba(124, 90, 240, 0.20);color:{ACCENT};}}"
            f"QPushButton:disabled{{color:#44444e;}}"
        )


def _sep() -> QFrame:
    f = QFrame()
    f.setFixedWidth(1)
    f.setFixedHeight(18)
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"background:{BORDER};border:none;")
    return f


class _OpenNote:
    def __init__(self, path: Path, frontmatter: str, body: str, kind: str):
        self.path = Path(path)
        self.frontmatter = frontmatter
        self.body = body
        self.kind = kind           # "note" or "code"
        self.dirty = False
        self.pinned = False
        self._checked_body = None
        self._rich_problem = None

    def rich_problem(self):
        """Why the rich Editor would damage this note, or None. Cached until
        the body changes, since the check re-imports the whole note."""
        if self._checked_body != self.body:
            self._rich_problem = rich_edit_problem(self.body)
            self._checked_body = self.body
        return self._rich_problem

    @property
    def is_code(self) -> bool:
        return self.kind == "code"

    @property
    def title(self) -> str:
        return self.path.name if self.is_code else self.path.stem


class MarkdownEditor(QWidget):
    note_saved          = Signal(Path)
    active_note_changed = Signal(object)     # Path | None
    open_note_requested = Signal(Path)
    bookmarks_changed   = Signal()
    assistant_toggled   = Signal()
    reveal_requested    = Signal(Path)

    def __init__(self, vault: VaultManager, service: NotesService, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.vault = vault
        self.service = service
        self._open: list = []          # list[_OpenNote], parallel to the tab bar
        self._current: int = -1
        self._loading = False
        self._reordering = False
        self._mode = MODE_RICH
        self._pending_mention = None
        self._init_ui()
        self._init_shortcuts()
        self._show_placeholder(True)
        QTimer.singleShot(0, self._restore_pinned)

    # ── Build ─────────────────────────────────────────────────────────────

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_tab_row())
        root.addWidget(self._build_toolbar())

        self._stack = QStackedWidget()

        self._rich = NoteTextEdit()
        # The global QSS makes every QTextEdit monospace; a note reads in the
        # proportional UI face, like Obsidian's live view.
        self._rich.setStyleSheet(
            f"QTextEdit{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-family:'Segoe UI Variable Text','Segoe UI',sans-serif;"
            "font-size:15px;padding:22px 26px;}"
        )
        self._rich.textChanged.connect(self._on_text_changed)
        self._rich.media_activated.connect(self._open_media)
        self._stack.addWidget(self._rich)      # 0

        self._raw = NoteSourceEdit()
        self._raw.setStyleSheet(
            f"QTextEdit{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-family:'Cascadia Mono',Consolas,monospace;font-size:13px;"
            "padding:22px 26px;}"
        )
        self._raw.textChanged.connect(self._on_text_changed)
        self._stack.addWidget(self._raw)       # 1

        self._read = NoteTextBrowser()
        self._read.setStyleSheet(
            f"QTextBrowser{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-family:'Segoe UI Variable Text','Segoe UI',sans-serif;"
            "font-size:15px;padding:22px 26px;}"
        )
        self._read.media_activated.connect(self._open_media)
        self._read.task_toggled.connect(self._toggle_task_from_reading)
        self._read.note_link_activated.connect(self._open_wikilink)
        self._stack.addWidget(self._read)      # 2

        root.addWidget(self._stack, stretch=1)

        self._mentions = _MentionsFooter(self.service)
        self._mentions.open_requested.connect(self.open_note_requested.emit)
        root.addWidget(self._mentions)

        self._status = QLabel("")
        self._status.setFixedHeight(22)
        self._status.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:{BG_BAR};"
            f"border-top:1px solid {BORDER};padding:0 12px;"
        )
        root.addWidget(self._status)

        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(1200)
        self._save_timer.timeout.connect(self.save_current)

    def _build_tab_row(self) -> QWidget:
        row = QFrame()
        row.setAttribute(Qt.WA_StyledBackground, True)
        row.setStyleSheet(
            f"QFrame{{background:{BG_BAR};border:none;border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(row)
        lay.setContentsMargins(0, 0, 8, 0)
        lay.setSpacing(6)

        self._tabs = QTabBar()
        self._tabs.setExpanding(False)
        self._tabs.setTabsClosable(True)
        self._tabs.setMovable(True)
        self._tabs.setUsesScrollButtons(True)
        self._tabs.setDrawBase(False)
        self._tabs.setContextMenuPolicy(Qt.CustomContextMenu)
        self._tabs.setStyleSheet(
            "QTabBar{background:transparent;border:none;}"
            f"QTabBar::tab{{background:transparent;color:{TEXT_DIM};"
            "padding:6px 12px;margin:4px 2px 0 2px;border-radius:6px;font-size:12px;}"
            f"QTabBar::tab:selected{{background:#2e2e38;color:{TEXT};}}"
            "QTabBar::tab:hover{background:#26262e;}"
            "QTabBar::close-button{subcontrol-position:right;}"
        )
        self._tabs.currentChanged.connect(self._on_tab_changed)
        self._tabs.tabCloseRequested.connect(self.close_tab)
        self._tabs.tabMoved.connect(self._on_tab_moved)
        self._tabs.customContextMenuRequested.connect(self._tab_menu)
        lay.addWidget(self._tabs, stretch=1)

        self._assistant_btn = QPushButton("✦  Asistente")
        self._assistant_btn.setCheckable(True)
        self._assistant_btn.setCursor(Qt.PointingHandCursor)
        self._assistant_btn.setFixedHeight(26)
        self._assistant_btn.setToolTip("Mostrar u ocultar el asistente de IA")
        self._assistant_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};"
            f"border-radius:6px;color:{TEXT_DIM};font-size:12px;padding:0 10px;}}"
            f"QPushButton:hover{{color:{TEXT};border-color:#505060;}}"
            f"QPushButton:checked{{background:rgba(124, 90, 240, 0.20);"
            f"border-color:{ACCENT};color:{ACCENT};}}"
        )
        self._assistant_btn.clicked.connect(self.assistant_toggled.emit)
        lay.addWidget(self._assistant_btn)
        return row

    def _build_toolbar(self) -> QWidget:
        bar = QFrame()
        bar.setAttribute(Qt.WA_StyledBackground, True)
        bar.setFixedHeight(36)
        bar.setStyleSheet(
            f"QFrame{{background:{BG_BAR};border:none;"
            f"border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(8, 0, 8, 0)
        lay.setSpacing(2)
        self._format_btns = []

        def add(btn, handler):
            btn.clicked.connect(handler)
            lay.addWidget(btn)
            self._format_btns.append(btn)
            return btn

        for label, tip, level in [("H1", "Título 1", 1), ("H2", "Título 2", 2),
                                  ("H3", "Título 3", 3)]:
            add(_ToolBtn(label, tip, 30, bold=True),
                lambda _=False, l=level: self.apply_heading(l))
        add(_ToolBtn("¶", "Texto normal", 26), lambda: self.apply_heading(0))
        lay.addWidget(_sep())

        add(_ToolBtn("B", "Negrita  (Ctrl+B)", 26, bold=True), self.toggle_bold)
        add(_ToolBtn("I", "Cursiva  (Ctrl+I)", 26, italic=True), self.toggle_italic)
        add(_ToolBtn("S", "Tachado", 26), self.toggle_strike)
        add(_ToolBtn("</>", "Código en línea", 34), self.toggle_code)
        lay.addWidget(_sep())

        add(_ToolBtn("A+", "Agrandar la letra", 30), lambda: self.bump_font(+1))
        add(_ToolBtn("A-", "Reducir la letra", 30), lambda: self.bump_font(-1))
        lay.addWidget(_sep())

        add(_ToolBtn("•", "Lista con viñetas", 26),
            lambda: self.apply_list(QTextListFormat.ListDisc))
        add(_ToolBtn("1.", "Lista numerada", 28),
            lambda: self.apply_list(QTextListFormat.ListDecimal))
        add(_ToolBtn("☑", "Casilla de tarea  (Ctrl+L marca / desmarca)", 26),
            self.insert_checkbox)
        add(_ToolBtn("❝", "Cita", 26), self.insert_quote)
        add(_ToolBtn("⊞", "Insertar tabla", 26), self.insert_table)
        lay.addWidget(_sep())

        add(_ToolBtn("🔗", "Enlace", 26), self.insert_link)
        add(_ToolBtn("[[ ]]", "Enlace a otra nota", 38), self.insert_wikilink)
        add(_ToolBtn("📎", "Insertar imagen o video", 26), self.insert_attachment)
        add(_ToolBtn("―", "Separador", 26), self.insert_rule)

        lay.addStretch()

        palette = _ToolBtn("⌘", "Paleta de comandos: tablas, checklists, adjuntos…  (Ctrl+P)", 28)
        palette.clicked.connect(self.open_palette)
        lay.addWidget(palette)
        lay.addWidget(_sep())

        self._bm_btn = _ToolBtn("🔖", "Marcador", 28)
        self._bm_btn.setCheckable(True)
        self._bm_btn.clicked.connect(self.toggle_bookmark)
        lay.addWidget(self._bm_btn)
        lay.addWidget(_sep())

        self._mode_btns = []
        for idx, (label, tip) in enumerate([
            ("Editor", "Edición con formato, como en Word"),
            ("Markdown", "Ver y editar el markdown en crudo"),
            ("Lectura", "Vista renderizada, solo lectura"),
        ]):
            b = _ToolBtn(label, tip, 62)
            b.setCheckable(True)
            b.setChecked(idx == MODE_RICH)
            b.clicked.connect(lambda _=False, i=idx: self.set_mode(i))
            self._mode_btns.append(b)
            lay.addWidget(b)

        return bar

    def _init_shortcuts(self):
        def bind(keys, handler):
            sc = QShortcut(QKeySequence(keys), self)
            sc.setContext(Qt.WidgetWithChildrenShortcut)
            sc.activated.connect(handler)

        bind("Ctrl+P", self.open_palette)
        bind("Ctrl+W", lambda: self.close_tab(self._current))
        bind("Ctrl+S", self.save_current)
        bind("Ctrl+L", self.toggle_current_task)
        bind("Ctrl+B", self.toggle_bold)
        bind("Ctrl+I", self.toggle_italic)

    def set_assistant_visible(self, visible: bool):
        self._assistant_btn.setChecked(visible)

    # ── Tabs / open files ─────────────────────────────────────────────────

    def open_note(self, path: Path, line: int = 0):
        path = Path(path)
        for i, note in enumerate(self._open):
            if note.path == path:
                self._tabs.setCurrentIndex(i)
                if line:
                    self._goto_line(line)
                return
        fs = attachments.fs_path(path)
        if not fs.exists():
            QMessageBox.warning(self, "No encontrada",
                                f"El archivo ya no existe:\n{path}")
            return
        try:
            text = fs.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            QMessageBox.warning(self, "No se pudo abrir", f"{path}\n\n{e}")
            return

        kind = kind_for(path) or "note"
        if kind == "code":
            fm, body = "", text
        else:
            fm, body = _split_frontmatter(text)
        note = _OpenNote(path, fm, body, kind)

        # New tabs go after the pinned ones so pins stay on the left.
        index = len(self._open)
        self._open.append(note)
        self._tabs.blockSignals(True)
        self._tabs.addTab("")
        self._tabs.blockSignals(False)
        self._refresh_tab(index)
        self._tabs.setCurrentIndex(index)
        if self._tabs.currentIndex() == index and self._current != index:
            self._on_tab_changed(index)
        if line:
            self._goto_line(line)

    def close_tab(self, index: int):
        if not (0 <= index < len(self._open)):
            return
        if self._open[index].pinned:
            self._status.setText("Pestaña fijada: desfíjala para poder cerrarla.")
            return
        if index == self._current:
            self._capture_current()
        if self._open[index].dirty:
            self._save(index)
        self._open.pop(index)
        # Keep _current pointing at the same note while the bar re-indexes.
        if index < self._current:
            self._current -= 1
        elif index == self._current:
            self._current = -1
        self._tabs.removeTab(index)
        if not self._open:
            self._current = -1
            self._show_placeholder(True)
            self.active_note_changed.emit(None)

    def _on_tab_changed(self, index: int):
        if self._reordering:
            return
        if index == self._current and 0 <= index < len(self._open):
            # Same note, new index (a tab to its left was closed). Reloading
            # would discard whatever was typed since the last autosave.
            return
        if 0 <= self._current < len(self._open):
            self._capture_current()
            if self._open[self._current].dirty:
                self._save(self._current)
        self._current = index
        if 0 <= index < len(self._open):
            self._load_into_view(self._open[index])
            self._show_placeholder(False)
            self.active_note_changed.emit(self._open[index].path)
        else:
            self._show_placeholder(True)
            self.active_note_changed.emit(None)

    def _on_tab_moved(self, frm: int, to: int):
        # The bar reorders its tabs itself; the model has to follow, or the
        # autosave writes one note's text into another note's file.
        note = self._open.pop(frm)
        self._open.insert(to, note)
        self._current = self._tabs.currentIndex()
        if not self._reordering:
            self._enforce_pinned_first()

    def _enforce_pinned_first(self):
        order = sorted(range(len(self._open)), key=lambda i: not self._open[i].pinned)
        if order == list(range(len(self._open))):
            return
        self._reordering = True
        try:
            for target, note in enumerate([self._open[i] for i in order]):
                source = self._open.index(note)
                if source != target:
                    self._tabs.moveTab(source, target)
        finally:
            self._reordering = False
        self._current = self._tabs.currentIndex()
        self._save_pins()

    def _refresh_tab(self, index: int):
        note = self._open[index]
        label = (PIN_GLYPH if note.pinned else "") + ("• " if note.dirty else "") + note.title
        self._tabs.setTabText(index, label)
        self._tabs.setTabToolTip(index, str(note.path))
        for side in (QTabBar.RightSide, QTabBar.LeftSide):
            button = self._tabs.tabButton(index, side)
            if button is not None:
                button.setVisible(not note.pinned)

    def set_pinned(self, index: int, pinned: bool):
        if not (0 <= index < len(self._open)):
            return
        self._open[index].pinned = pinned
        self._refresh_tab(index)
        self._enforce_pinned_first()
        self._save_pins()

    def _save_pins(self):
        AppConfig.set_pinned_tabs(self.vault.vault_root,
                                  [n.path for n in self._open if n.pinned])

    def _restore_pinned(self):
        for path in AppConfig.get_pinned_tabs(self.vault.vault_root):
            self.open_note(path)
            index = next((i for i, n in enumerate(self._open) if n.path == path), -1)
            if index >= 0:
                self._open[index].pinned = True
                self._refresh_tab(index)
        self._enforce_pinned_first()

    def _tab_menu(self, pos):
        index = self._tabs.tabAt(pos)
        if index < 0:
            return
        note = self._open[index]
        menu = QMenu(self)
        menu.addAction("Desfijar pestaña" if note.pinned else "Fijar pestaña",
                       lambda: self.set_pinned(index, not note.pinned))
        menu.addSeparator()
        close = menu.addAction("Cerrar", lambda: self.close_tab(index))
        close.setEnabled(not note.pinned)
        menu.addAction("Cerrar las demás", lambda: self._close_many(
            [n for i, n in enumerate(self._open) if i != index]))
        menu.addAction("Cerrar las de la derecha", lambda: self._close_many(
            self._open[index + 1:]))
        menu.addAction("Cerrar todas (salvo fijadas)",
                       lambda: self._close_many(list(self._open)))
        menu.addSeparator()
        menu.addAction("Copiar ruta",
                       lambda: QApplication.clipboard().setText(str(note.path)))
        menu.addAction("Revelar en el explorador",
                       lambda: self.reveal_requested.emit(note.path))
        menu.addAction("Mostrar en la carpeta de Windows",
                       lambda: _show_in_folder(note.path))
        menu.exec(self._tabs.mapToGlobal(pos))

    def _close_many(self, notes: list):
        for note in notes:
            if note.pinned or note not in self._open:
                continue
            self.close_tab(self._open.index(note))

    def current_note(self):
        if 0 <= self._current < len(self._open):
            return self._open[self._current]
        return None

    def current_path(self):
        note = self.current_note()
        return note.path if note else None

    def current_title(self) -> str:
        p = self.current_path()
        return p.stem if p else ""

    def current_body(self) -> str:
        if not (0 <= self._current < len(self._open)):
            return ""
        self._capture_current()
        return self._open[self._current].body

    def current_selection(self) -> str:
        widget = self._raw if self._view_mode() == MODE_RAW else self._rich
        return widget.textCursor().selectedText().replace(" ", "\n")

    # ── Loading / saving ──────────────────────────────────────────────────

    def _mode_for(self, note: _OpenNote) -> int:
        if note.is_code:
            return MODE_RAW
        if self._mode == MODE_RICH and note.rich_problem():
            # The Editor saves by re-serialising the note; when that trip
            # would lose content, the note is edited as raw markdown instead.
            return MODE_RAW
        return self._mode

    def _view_mode(self) -> int:
        note = self.current_note()
        return self._mode_for(note) if note is not None else self._mode

    def _load_into_view(self, note: _OpenNote):
        mode = self._mode_for(note)
        for view in (self._rich, self._raw, self._read):
            view.note_path = note.path
        self._rich.vault_root = self._read.vault_root = self.vault.vault_root
        self._raw.is_code = note.is_code

        self._loading = True
        try:
            if mode == MODE_RAW:
                self._raw.setPlainText(note.body)
            elif mode == MODE_READ:
                self._read.load_markdown(prepare_for_reading(note.body))
            else:
                self._rich.load_markdown(prepare_markdown(note.body))
        finally:
            self._loading = False
        self._stack.setCurrentIndex(mode)

        for b in self._format_btns:
            b.setEnabled(not note.is_code)
        problem = None if note.is_code else note.rich_problem()
        for i, b in enumerate(self._mode_btns):
            b.setEnabled(not note.is_code and not (i == MODE_RICH and problem))
            b.setChecked(i == mode)
        self._mode_btns[MODE_RICH].setToolTip(
            f"No disponible para esta nota: {problem}. Se edita en Markdown "
            "para no dañarla." if problem else "Edición con formato, como en Word")
        self._bm_btn.setChecked(self.service.is_bookmarked(note.path))
        self._update_status(note)
        if problem and self._mode == MODE_RICH:
            self._status.setText(
                f"{self._status.text()}   ·   ⚠ abierta en Markdown: en el Editor {problem}")

        self._mentions.setVisible(not note.is_code)
        if not note.is_code:
            # Deferred so the note paints first; the scan itself runs off
            # the UI thread.
            self._pending_mention = note.path
            QTimer.singleShot(150, self._load_mentions_deferred)

    def _load_mentions_deferred(self):
        path = self._pending_mention
        self._pending_mention = None
        note = self.current_note()
        if path is not None and note is not None and note.path == path:
            self._mentions.load(path)

    def _capture_current(self):
        """Pull whatever the visible editor holds back into the model."""
        note = self.current_note()
        if note is None or self._loading:
            return
        mode = self._view_mode()
        if mode == MODE_RAW:
            note.body = self._raw.toPlainText()
        elif mode == MODE_RICH:
            # Qt's own toMarkdown() drops bold / italic in 6.11, so the
            # document is serialised by hand.
            note.body = document_to_markdown(self._rich.document())

    def _on_text_changed(self):
        note = self.current_note()
        if self._loading or note is None:
            return
        if not note.dirty:
            note.dirty = True
            self._refresh_tab(self._current)
        self._save_timer.start()

    def save_current(self):
        if self.current_note() is not None:
            self._capture_current()
            self._save(self._current)

    def _save(self, index: int):
        note = self._open[index]
        body = note.body
        if not note.is_code and not body.endswith("\n"):
            body += "\n"
        try:
            attachments.fs_path(note.path).write_text(
                note.frontmatter + body, encoding="utf-8")
        except Exception as e:
            self._status.setText(f"No se pudo guardar: {e}")
            return
        note.dirty = False
        self._refresh_tab(index)
        self._update_status(note, saved=True)
        # Backlinks come from other notes, so saving this one does not change
        # them: the mentions scan is not repeated here. It used to be, and a
        # full vault scan on every autosave is what froze the editor.
        self.note_saved.emit(note.path)

    def _update_status(self, note: _OpenNote, saved: bool = False):
        try:
            rel = note.path.relative_to(self.vault.vault_root)
        except ValueError:
            rel = note.path
        tail = "  ·  guardado ✓" if saved else ""
        if note.is_code:
            lines = note.body.count("\n") + 1
            self._status.setText(f"{rel}   ·   código · {lines} líneas{tail}")
            return
        words = markdown_utils.count_words(note.body)
        self._status.setText(
            f"{rel}   ·   {words} palabras · {len(note.body)} caracteres"
            f"   ·   Ctrl+P comandos{tail}")

    def _show_placeholder(self, show: bool):
        if show:
            self._loading = True
            self._read.note_path = None
            self._read.setHtml(
                f"<div style='color:{TEXT_FAINT};font-size:14px;padding:40px;'>"
                "<h2 style='color:#888895;'>Sin nota abierta</h2>"
                "<p>Elige una nota en el explorador, o crea una nueva con ✎.</p>"
                "<p>Con una nota abierta, <b>Ctrl+P</b> muestra todos los comandos: "
                "tablas, checklists, imágenes y videos.</p></div>"
            )
            self._loading = False
            self._stack.setCurrentIndex(MODE_READ)
            self._status.setText("")
            self._mentions.clear()

    # ── Mode ──────────────────────────────────────────────────────────────

    def set_mode(self, mode: int):
        note = self.current_note()
        if note is not None and note.is_code:
            return
        if note is None:
            for i, b in enumerate(self._mode_btns):
                b.setChecked(i == mode)
            self._mode = mode
            return
        self._capture_current()
        self._mode = mode
        self._load_into_view(note)

    # ── Formatting ────────────────────────────────────────────────────────

    def _editor(self):
        return self._raw if self._view_mode() == MODE_RAW else self._rich

    def _ensure_editable(self) -> bool:
        note = self.current_note()
        if note is None:
            return False
        if note.is_code:
            return False
        if self._mode == MODE_READ:
            self.set_mode(MODE_RICH)
        return True

    def apply_heading(self, level: int):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_prefix_line("#" * level + " " if level else "")
            return
        cursor = self._rich.textCursor()
        cursor.beginEditBlock()
        block_fmt = cursor.blockFormat()
        block_fmt.setHeadingLevel(level)
        cursor.setBlockFormat(block_fmt)
        char = QTextCharFormat()
        sizes = {0: 15, 1: 26, 2: 21, 3: 17}
        char.setFontPointSize(sizes.get(level, 15))
        char.setFontWeight(QFont.Bold if level else QFont.Normal)
        cursor.select(QTextCursor.BlockUnderCursor)
        cursor.mergeCharFormat(char)
        cursor.endEditBlock()
        self._rich.setFocus()

    def _merge_char(self, fmt: QTextCharFormat):
        cursor = self._rich.textCursor()
        if not cursor.hasSelection():
            cursor.select(QTextCursor.WordUnderCursor)
        cursor.mergeCharFormat(fmt)
        self._rich.mergeCurrentCharFormat(fmt)
        self._rich.setFocus()

    def toggle_bold(self):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_wrap("**", "**")
            return
        fmt = QTextCharFormat()
        bold = self._rich.fontWeight() > QFont.Normal
        fmt.setFontWeight(QFont.Normal if bold else QFont.Bold)
        self._merge_char(fmt)

    def toggle_italic(self):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_wrap("*", "*")
            return
        fmt = QTextCharFormat()
        fmt.setFontItalic(not self._rich.fontItalic())
        self._merge_char(fmt)

    def toggle_strike(self):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_wrap("~~", "~~")
            return
        fmt = QTextCharFormat()
        fmt.setFontStrikeOut(not self._rich.currentCharFormat().fontStrikeOut())
        self._merge_char(fmt)

    def toggle_code(self):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_wrap("`", "`")
            return
        fmt = QTextCharFormat()
        current = self._rich.currentCharFormat().fontFamilies() or []
        mono = "Cascadia Mono" in current
        fmt.setFontFamilies(["Segoe UI"] if mono else ["Cascadia Mono", "Consolas"])
        self._merge_char(fmt)

    def bump_font(self, delta: int):
        if not self._ensure_editable() or self._view_mode() == MODE_RAW:
            return
        cursor = self._rich.textCursor()
        if not cursor.hasSelection():
            cursor.select(QTextCursor.WordUnderCursor)
        size = cursor.charFormat().fontPointSize() or 15.0
        fmt = QTextCharFormat()
        fmt.setFontPointSize(max(8.0, min(40.0, size + delta * 2)))
        cursor.mergeCharFormat(fmt)
        self._rich.mergeCurrentCharFormat(fmt)
        self._rich.setFocus()

    def apply_list(self, style):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_prefix_line("- " if style == QTextListFormat.ListDisc else "1. ")
            return
        cursor = self._rich.textCursor()
        cursor.beginEditBlock()
        fmt = QTextListFormat()
        fmt.setStyle(style)
        cursor.createList(fmt)
        cursor.endEditBlock()
        self._rich.setFocus()

    def insert_checkbox(self):
        """Turn the current line (or every selected line) into task items."""
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw_prefix_line("- [ ] ")
            return
        cursor = self._rich.textCursor()
        cursor.beginEditBlock()
        if cursor.block().textList() is None:
            fmt = QTextListFormat()
            fmt.setStyle(QTextListFormat.ListDisc)
            cursor.createList(fmt)
        start, end = sorted((cursor.anchor(), cursor.position()))
        block = self._rich.document().findBlock(start)
        while block.isValid() and block.position() <= end:
            if block.textList() is not None:
                bfmt = block.blockFormat()
                if bfmt.marker() == Marker.NoMarker:
                    bfmt.setMarker(Marker.Unchecked)
                    QTextCursor(block).setBlockFormat(bfmt)
            block = block.next()
        cursor.endEditBlock()
        self._rich.setFocus()

    def insert_nested_checkbox(self):
        """A new unchecked item one level below the current task."""
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            cursor = self._raw.textCursor()
            line = cursor.block().text()
            indent = line[:len(line) - len(line.lstrip())]
            cursor.movePosition(QTextCursor.EndOfBlock)
            cursor.insertText(f"\n{indent}    - [ ] ")
            self._raw.setTextCursor(cursor)
            self._raw.setFocus()
            return
        cursor = self._rich.textCursor()
        if cursor.block().textList() is None:
            self.insert_checkbox()
            cursor = self._rich.textCursor()
        level = cursor.block().textList().format().indent()
        cursor.beginEditBlock()
        cursor.movePosition(QTextCursor.EndOfBlock)
        cursor.insertBlock()
        set_list_level(cursor, level + 1)
        bfmt = cursor.blockFormat()
        bfmt.setMarker(Marker.Unchecked)
        cursor.setBlockFormat(bfmt)
        cursor.endEditBlock()
        self._rich.setTextCursor(cursor)
        self._rich.setFocus()

    def indent_item(self, delta: int):
        if not self._ensure_editable() or self._view_mode() == MODE_RAW:
            return
        cursor = self._rich.textCursor()
        lst = cursor.block().textList()
        if lst is not None:
            set_list_level(cursor, lst.format().indent() + delta)
            self._rich.setFocus()

    def toggle_current_task(self):
        note = self.current_note()
        if note is None or note.is_code:
            return
        if self._view_mode() == MODE_RAW:
            cursor = self._raw.textCursor()
            line = cursor.block().text()
            m = re.match(r"^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])", line)
            if not m:
                return
            c = QTextCursor(cursor.block())
            c.movePosition(QTextCursor.NextCharacter, QTextCursor.MoveAnchor, m.end(1))
            c.movePosition(QTextCursor.NextCharacter, QTextCursor.KeepAnchor, 1)
            c.insertText(" " if m.group(2) in "xX" else "x")
            return
        if self._view_mode() == MODE_RICH:
            block = self._rich.textCursor().block()
            if block.blockFormat().marker() != Marker.NoMarker:
                toggle_marker(block)

    def insert_quote(self):
        if not self._ensure_editable():
            return
        self._insert_at_line_start("> ")

    def insert_rule(self):
        if not self._ensure_editable():
            return
        ed = self._editor()
        ed.textCursor().insertText("\n---\n")
        ed.setFocus()

    def insert_link(self):
        if not self._ensure_editable():
            return
        url, ok = QInputDialog.getText(self, "Enlace", "URL:")
        if not ok or not url.strip():
            return
        ed = self._editor()
        cursor = ed.textCursor()
        label = cursor.selectedText() or url.strip()
        cursor.insertText(f"[{label}]({url.strip()})")
        ed.setFocus()

    def insert_wikilink(self):
        if not self._ensure_editable():
            return
        titles = sorted({n.title for n in self.vault.all_notes()})
        if titles:
            name, ok = QInputDialog.getItem(
                self, "Enlazar nota", "Nota:", titles, 0, True
            )
        else:
            name, ok = QInputDialog.getText(self, "Enlazar nota", "Nota:")
        if not ok or not name.strip():
            return
        ed = self._editor()
        ed.textCursor().insertText(f"[[{name.strip()}]]")
        ed.setFocus()

    # ── Tables ────────────────────────────────────────────────────────────

    def insert_table(self):
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            cursor = self._raw.textCursor()
            cursor.movePosition(QTextCursor.EndOfBlock)
            cursor.insertText("\n\n" + new_table(3, 3) + "\n")
            self._raw.setTextCursor(cursor)
            self._raw.setFocus()
            return
        self._rich.insert_table(3, 3)

    def _in_rich_table(self) -> bool:
        return (self.current_note() is not None and self._view_mode() == MODE_RICH
                and self._rich.current_table() is not None)

    def align_tables(self):
        note = self.current_note()
        if note is None or note.is_code:
            return
        if self._view_mode() == MODE_RAW:
            cursor = self._raw.textCursor()
            pos = cursor.position()
            text = self._raw.toPlainText()
            aligned = format_markdown_tables(text)
            if aligned != text:
                edit = QTextCursor(self._raw.document())
                edit.select(QTextCursor.Document)
                edit.insertText(aligned)
                cursor.setPosition(min(pos, len(aligned)))
                self._raw.setTextCursor(cursor)
            return
        # The rich view is a real grid and is always aligned; saving writes
        # the aligned markdown.
        self.save_current()

    # ── Attachments ───────────────────────────────────────────────────────

    def insert_attachment(self):
        if not self._ensure_editable():
            return
        files, _ = QFileDialog.getOpenFileNames(
            self, "Insertar imagen o video", str(self.current_path().parent),
            "Imágenes y videos (*.png *.jpg *.jpeg *.gif *.webp *.bmp *.svg "
            "*.mp4 *.mov *.webm *.mkv *.m4v *.avi);;Todos los archivos (*)",
        )
        if files:
            embed_files(self._editor(), [Path(f) for f in files])

    def _open_media(self, path: str):
        if attachments.kind_of(path) == "video":
            _VideoDialog(path, self).exec()
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(path))

    # ── Reading mode ──────────────────────────────────────────────────────

    def _toggle_task_from_reading(self, index: int):
        note = self.current_note()
        if note is None:
            return
        note.body = toggle_task(note.body, index)
        note.dirty = True
        self._save(self._current)
        scroll = self._read.verticalScrollBar().value()
        self._loading = True
        try:
            self._read.load_markdown(prepare_for_reading(note.body))
        finally:
            self._loading = False
        self._read.verticalScrollBar().setValue(scroll)

    def _open_wikilink(self, target: str):
        target = target.strip().lower()
        for n in self.vault.all_notes():
            if n.title.lower() == target:
                self.open_note(n.path)
                return
        self._status.setText(f"No existe una nota llamada «{target}».")

    # ── Command palette ───────────────────────────────────────────────────

    def _commands(self) -> list:
        note = lambda: self.current_note() is not None                  # noqa: E731
        editable = lambda: note() and not self.current_note().is_code   # noqa: E731
        table = self._in_rich_table
        pinned = lambda: note() and self.current_note().pinned          # noqa: E731

        def table_cmd(action):
            def run():
                if self._rich.current_table() is not None:
                    action()
            return run

        return [
            Command("Insertar tabla", "Tabla", self.insert_table, "", editable),
            Command("Añadir fila abajo", "Tabla",
                    table_cmd(lambda: self._rich.table_add_row(False)), "Tab en la última celda", table),
            Command("Añadir fila arriba", "Tabla",
                    table_cmd(lambda: self._rich.table_add_row(True)), "", table),
            Command("Añadir columna a la derecha", "Tabla",
                    table_cmd(lambda: self._rich.table_add_column(False)), "", table),
            Command("Añadir columna a la izquierda", "Tabla",
                    table_cmd(lambda: self._rich.table_add_column(True)), "", table),
            Command("Eliminar fila", "Tabla", table_cmd(self._rich.table_remove_row), "", table),
            Command("Eliminar columna", "Tabla", table_cmd(self._rich.table_remove_column), "", table),
            Command("Eliminar tabla", "Tabla", table_cmd(self._rich.table_delete), "", table),
            Command("Alinear tablas", "Tabla", self.align_tables, "Tab en modo Markdown", editable),

            Command("Casilla de tarea", "Checklist", self.insert_checkbox, "", editable),
            Command("Sub-casilla (checklist anidada)", "Checklist",
                    self.insert_nested_checkbox, "", editable),
            Command("Marcar / desmarcar casilla", "Checklist",
                    self.toggle_current_task, "Ctrl+L", editable),
            Command("Sangrar ítem", "Lista", lambda: self.indent_item(+1), "Tab", editable),
            Command("Quitar sangría", "Lista", lambda: self.indent_item(-1), "Shift+Tab", editable),
            Command("Lista con viñetas", "Lista",
                    lambda: self.apply_list(QTextListFormat.ListDisc), "", editable),
            Command("Lista numerada", "Lista",
                    lambda: self.apply_list(QTextListFormat.ListDecimal), "", editable),

            Command("Insertar imagen o video…", "Adjunto", self.insert_attachment,
                    "o arrastra / pega el archivo", editable),

            Command("Título 1", "Formato", lambda: self.apply_heading(1), "", editable),
            Command("Título 2", "Formato", lambda: self.apply_heading(2), "", editable),
            Command("Título 3", "Formato", lambda: self.apply_heading(3), "", editable),
            Command("Negrita", "Formato", self.toggle_bold, "Ctrl+B", editable),
            Command("Cursiva", "Formato", self.toggle_italic, "Ctrl+I", editable),
            Command("Tachado", "Formato", self.toggle_strike, "", editable),
            Command("Cita", "Formato", self.insert_quote, "", editable),
            Command("Separador", "Formato", self.insert_rule, "", editable),
            Command("Enlace", "Formato", self.insert_link, "", editable),
            Command("Enlace a otra nota", "Formato", self.insert_wikilink, "", editable),

            Command("Modo Editor", "Vista", lambda: self.set_mode(MODE_RICH), "", editable),
            Command("Modo Markdown", "Vista", lambda: self.set_mode(MODE_RAW), "", editable),
            Command("Modo Lectura", "Vista", lambda: self.set_mode(MODE_READ), "", editable),
            Command("Mostrar / ocultar asistente", "Vista", self.assistant_toggled.emit),

            Command("Fijar pestaña", "Pestaña",
                    lambda: self.set_pinned(self._current, True), "",
                    lambda: note() and not self.current_note().pinned),
            Command("Desfijar pestaña", "Pestaña",
                    lambda: self.set_pinned(self._current, False), "", pinned),
            Command("Cerrar pestaña", "Pestaña", lambda: self.close_tab(self._current),
                    "Ctrl+W", lambda: note() and not self.current_note().pinned),
            Command("Guardar", "Nota", self.save_current, "Ctrl+S", note),
            Command("Marcador", "Nota", self._toggle_bookmark_command, "", note),
        ]

    def open_palette(self):
        palette = CommandPalette(self._commands(), self)
        # The caret is remembered, so a table command still knows which cell
        # it is in after the palette steals focus.
        cursor = self._editor().textCursor()
        if palette.popup_over(self._stack) and palette.chosen is not None:
            self._editor().setTextCursor(cursor)
            palette.chosen.run()

    def _toggle_bookmark_command(self):
        self._bm_btn.setChecked(not self._bm_btn.isChecked())
        self.toggle_bookmark()

    # raw-mode helpers ----------------------------------------------------

    def _raw_wrap(self, left: str, right: str):
        cursor = self._raw.textCursor()
        text = cursor.selectedText() or "texto"
        cursor.insertText(f"{left}{text}{right}")
        self._raw.setFocus()

    def _raw_prefix_line(self, prefix: str):
        cursor = self._raw.textCursor()
        cursor.movePosition(QTextCursor.StartOfLine)
        line_start = cursor.position()
        cursor.movePosition(QTextCursor.EndOfLine, QTextCursor.KeepAnchor)
        line = cursor.selectedText()
        indent = line[:len(line) - len(line.lstrip())]
        stripped = re.sub(r"^(#{1,6}\s+|-\s\[[ xX]\]\s|[-*+]\s|\d+\.\s|>\s)", "",
                          line.lstrip())
        cursor.insertText(indent + prefix + stripped)
        cursor.setPosition(line_start + len(indent) + len(prefix) + len(stripped))
        self._raw.setTextCursor(cursor)
        self._raw.setFocus()

    def _insert_at_line_start(self, prefix: str):
        if self._view_mode() == MODE_RAW:
            self._raw_prefix_line(prefix)
            return
        cursor = self._rich.textCursor()
        cursor.movePosition(QTextCursor.StartOfBlock)
        cursor.insertText(prefix)
        self._rich.setFocus()

    def _goto_line(self, line: int):
        if line <= 0:
            return
        note = self.current_note()
        if note is not None and not note.is_code and self._mode != MODE_RAW:
            self.set_mode(MODE_RAW)
        cursor = self._raw.textCursor()
        cursor.movePosition(QTextCursor.Start)
        for _ in range(max(0, line - 1)):
            cursor.movePosition(QTextCursor.Down)
        cursor.select(QTextCursor.LineUnderCursor)
        self._raw.setTextCursor(cursor)
        self._raw.setFocus()

    # ── Content insertion (used by the AI panel) ──────────────────────────

    def insert_markdown(self, text: str):
        """Insert generated markdown at the caret of the open note."""
        note = self.current_note()
        if note is None or note.is_code:
            QMessageBox.information(
                self, "Sin nota abierta",
                "Abre o crea una nota antes de insertar el texto."
            )
            return False
        if self._mode == MODE_READ:
            self.set_mode(MODE_RICH)
        if self._view_mode() == MODE_RAW:
            self._raw.textCursor().insertText("\n" + text.strip() + "\n")
            self.save_current()
            return True

        # Rich mode: append to the markdown source and reload it, so the
        # new content is parsed as markdown instead of pasted as plain text.
        self._capture_current()
        note.body = note.body.rstrip() + "\n\n" + text.strip() + "\n"
        note.dirty = True
        self._load_into_view(note)
        self._save(self._current)
        return True

    def replace_selection(self, text: str) -> bool:
        if self.current_note() is None:
            return False
        ed = self._editor()
        cursor = ed.textCursor()
        if not cursor.hasSelection():
            return self.insert_markdown(text)
        cursor.insertText(text)
        self.save_current()
        return True

    # ── Bookmarks ─────────────────────────────────────────────────────────

    def toggle_bookmark(self):
        path = self.current_path()
        if not path:
            self._bm_btn.setChecked(False)
            return
        state = self.service.toggle_bookmark(path)
        self._bm_btn.setChecked(state)
        self.bookmarks_changed.emit()

    # ── Vault switch ──────────────────────────────────────────────────────

    def set_vault(self, vault: VaultManager, service: NotesService):
        self.save_all()
        self.vault = vault
        self.service = service
        self._mentions.service = service
        self._reordering = True
        while self._tabs.count():
            self._tabs.removeTab(0)
        self._reordering = False
        self._open.clear()
        self._current = -1
        self._show_placeholder(True)
        QTimer.singleShot(0, self._restore_pinned)

    def save_all(self):
        if self.current_note() is not None:
            self._capture_current()
        for i, note in enumerate(self._open):
            if note.dirty:
                self._save(i)

    def refresh_mentions(self):
        path = self.current_path()
        if path and not self.current_note().is_code:
            self._mentions.load(path)


def _show_in_folder(path: Path):
    try:
        subprocess.Popen(["explorer", "/select,", str(path)])
    except OSError:
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(Path(path).parent)))


class _VideoDialog(QDialog):
    """A note's embedded video, in the same player the exercise module uses."""

    def __init__(self, path: str, parent=None):
        super().__init__(parent)
        from ..ejercicio.ejercicio_video_player import EjercicioVideoPlayer
        self.setWindowTitle(Path(path).name)
        self.resize(960, 640)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self._player = EjercicioVideoPlayer()
        self._player.back_requested.connect(lambda _key: self.accept())
        lay.addWidget(self._player)
        self._player.play(path, Path(path).name)

    def done(self, result):
        self._player.stop()
        super().done(result)


# ── Mentions ──────────────────────────────────────────────────────────────

class _MentionsSignals(QObject):
    finished = Signal(int, object, object)     # generation, linked, unlinked


class _MentionsJob(QRunnable):
    def __init__(self, service: NotesService, path: Path, generation: int,
                 signals: _MentionsSignals):
        super().__init__()
        self.service = service
        self.path = path
        self.generation = generation
        self.signals = signals

    def run(self):
        try:
            note = self.service.vault.get_note(self.path)
            linked, unlinked = self.service.mentions(note) if note else ([], [])
        except Exception:
            linked, unlinked = [], []
        self.signals.finished.emit(self.generation, linked, unlinked)


class _MentionsFooter(QFrame):
    """Linked / unlinked mentions, pinned under every open note.

    The scan reads every note in the vault, so it runs on a worker thread; a
    result that arrives after the user moved to another note is discarded.
    """

    open_requested = Signal(Path)

    def __init__(self, service: NotesService, parent=None):
        super().__init__(parent)
        self.service = service
        self._expanded = True
        self._generation = 0
        self._signals = _MentionsSignals(self)
        self._signals.finished.connect(self._show_results)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:none;"
            f"border-top:1px solid {BORDER};}}"
        )
        self.setMinimumHeight(160)
        self.setMaximumHeight(230)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        head = QWidget()
        head.setFixedHeight(30)
        head.setStyleSheet("background:transparent;")
        h = QHBoxLayout(head)
        h.setContentsMargins(16, 0, 12, 0)
        h.setSpacing(8)

        self._toggle = QPushButton("▾")
        self._toggle.setFixedSize(18, 18)
        self._toggle.setCursor(Qt.PointingHandCursor)
        self._toggle.setStyleSheet(
            "QPushButton{background:transparent;border:none;"
            f"color:{TEXT_FAINT};font-size:11px;}}"
            f"QPushButton:hover{{color:{TEXT};}}"
        )
        self._toggle.clicked.connect(self._toggle_expanded)
        h.addWidget(self._toggle)

        self._title = QLabel("Linked mentions")
        self._title.setStyleSheet(
            f"color:{TEXT};font-size:12px;font-weight:600;"
            "background:transparent;border:none;"
        )
        h.addWidget(self._title)

        self._count = QLabel("0")
        self._count.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        h.addWidget(self._count)
        h.addStretch()
        outer.addWidget(head)

        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QScrollArea.NoFrame)
        self._scroll.setStyleSheet(
            f"QScrollArea{{background:{BG_CARD};border:none;}}"
        )
        body = QWidget()
        body.setStyleSheet(f"background:{BG_CARD};")
        self._body = QVBoxLayout(body)
        self._body.setContentsMargins(16, 0, 16, 12)
        self._body.setSpacing(4)
        self._body.setSizeConstraint(QLayout.SetMinimumSize)
        self._scroll.setWidget(body)
        outer.addWidget(self._scroll, stretch=1)

    def _toggle_expanded(self):
        self._expanded = not self._expanded
        self._toggle.setText("▾" if self._expanded else "▸")
        self._scroll.setVisible(self._expanded)
        self.setMinimumHeight(160 if self._expanded else 30)
        self.setMaximumHeight(230 if self._expanded else 30)

    def clear(self):
        self._generation += 1
        self._clear_rows()
        self._count.setText("0")

    def _clear_rows(self):
        while self._body.count():
            item = self._body.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def load(self, path: Path):
        self._generation += 1
        self._clear_rows()
        self._count.setText("…")
        self._body.addWidget(self._muted("Buscando menciones en la vault…"))
        QThreadPool.globalInstance().start(
            _MentionsJob(self.service, Path(path), self._generation, self._signals)
        )

    def _show_results(self, generation: int, linked, unlinked):
        if generation != self._generation:
            return
        self._clear_rows()
        self._count.setText(str(len(linked)))
        self._add_section(linked, "No backlinks found.")

        self._body.addSpacing(8)
        sub = QLabel(f"Unlinked mentions  ·  {len(unlinked)}")
        sub.setStyleSheet(
            f"color:{TEXT};font-size:12px;font-weight:600;"
            "background:transparent;border:none;"
        )
        self._body.addWidget(sub)
        self._add_section(unlinked, "Sin menciones sueltas.")
        self._body.addStretch()

    def _add_section(self, mentions: list, empty: str):
        if not mentions:
            self._body.addWidget(self._muted(empty))
            return
        # A title like "backend" is mentioned thousands of times; building a
        # widget for each froze the window for seconds.
        for m in mentions[:MAX_MENTION_ROWS]:
            self._body.addWidget(self._row(m))
        extra = len(mentions) - MAX_MENTION_ROWS
        if extra > 0:
            self._body.addWidget(self._muted(f"… y {extra} más."))

    def _muted(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:12px;background:transparent;border:none;"
        )
        return lbl

    def _row(self, mention) -> QWidget:
        btn = QPushButton()
        btn.setCursor(Qt.PointingHandCursor)
        btn.setMinimumHeight(34)
        btn.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        btn.setText(f"{mention.title}   ·   {mention.line}")
        btn.setToolTip(f"{mention.path}  (línea {mention.line_no})")
        color = ACCENT if mention.linked else TEXT_DIM
        btn.setStyleSheet(
            "QPushButton{background:transparent;border:none;text-align:left;"
            f"color:{color};font-size:12px;padding:4px 6px;border-radius:5px;}}"
            "QPushButton:hover{background:#2e2e38;}"
        )
        btn.clicked.connect(
            lambda _=False, p=mention.path: self.open_requested.emit(Path(p))
        )
        return btn

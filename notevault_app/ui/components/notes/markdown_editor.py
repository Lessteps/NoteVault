"""
Markdown editor for the notes module.

  · a tab bar with the open notes
  · a Word-style formatting toolbar (headings, bold, italic, font size,
    lists, quote, code, link, wikilink…)
  · three modes: Editor (rich text), Markdown (raw source) and Lectura
  · a mentions footer at the bottom of every note, with the linked and
    unlinked mentions found across the vault

The YAML frontmatter is kept aside while editing and re-attached on save,
so rich-text editing can never mangle it.
"""

import re
from pathlib import Path

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QTextEdit, QTextBrowser, QTabBar, QStackedWidget, QScrollArea,
    QMessageBox, QInputDialog, QSizePolicy, QLayout,
)
from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QTextCursor, QTextCharFormat, QFont, QTextListFormat

from ....core.vault_manager import VaultManager
from ....core.notes_service import NotesService
from ....core import markdown_utils
from ....core.qt_markdown import document_to_markdown

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
        self.setStyleSheet(
            "QPushButton{background:transparent;border:none;border-radius:5px;"
            f"color:{TEXT_DIM};font-size:12px;}}"
            f"QPushButton:hover{{background:#2e2e38;color:{TEXT};}}"
            f"QPushButton:checked{{background:rgba(124, 90, 240, 0.20);color:{ACCENT};}}"
        )


def _sep() -> QFrame:
    f = QFrame()
    f.setFixedWidth(1)
    f.setFixedHeight(18)
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"background:{BORDER};border:none;")
    return f


class _OpenNote:
    def __init__(self, path: Path, frontmatter: str, body: str):
        self.path = Path(path)
        self.frontmatter = frontmatter
        self.body = body
        self.dirty = False


class MarkdownEditor(QWidget):
    note_saved          = Signal(Path)
    active_note_changed = Signal(object)     # Path | None
    open_note_requested = Signal(Path)
    bookmarks_changed   = Signal()
    assistant_toggled   = Signal()

    def __init__(self, vault: VaultManager, service: NotesService, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.vault = vault
        self.service = service
        self._open: list = []          # list[_OpenNote], parallel to the tab bar
        self._current: int = -1
        self._loading = False
        self._mode = MODE_RICH
        self._pending_mention = None
        self._init_ui()
        self._show_placeholder(True)

    # ── Build ─────────────────────────────────────────────────────────────

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Tab bar
        self._tabs = QTabBar()
        self._tabs.setExpanding(False)
        self._tabs.setTabsClosable(True)
        self._tabs.setMovable(True)
        self._tabs.setUsesScrollButtons(True)
        self._tabs.setDrawBase(False)
        self._tabs.setStyleSheet(
            f"QTabBar{{background:{BG_BAR};border-bottom:1px solid {BORDER};}}"
            f"QTabBar::tab{{background:transparent;color:{TEXT_DIM};"
            "padding:6px 12px;margin:4px 2px 0 2px;border-radius:6px;font-size:12px;}"
            f"QTabBar::tab:selected{{background:#2e2e38;color:{TEXT};}}"
            "QTabBar::tab:hover{background:#26262e;}"
            "QTabBar::close-button{subcontrol-position:right;}"
        )
        self._tabs.currentChanged.connect(self._on_tab_changed)
        self._tabs.tabCloseRequested.connect(self.close_tab)
        root.addWidget(self._tabs)

        root.addWidget(self._build_toolbar())

        # Editor stack
        self._stack = QStackedWidget()

        self._rich = QTextEdit()
        self._rich.setAcceptRichText(True)
        self._rich.setStyleSheet(
            f"QTextEdit{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-size:15px;padding:22px 26px;}"
        )
        self._rich.textChanged.connect(self._on_text_changed)
        self._stack.addWidget(self._rich)      # 0

        self._raw = QTextEdit()
        self._raw.setAcceptRichText(False)
        self._raw.setStyleSheet(
            f"QTextEdit{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-family:'Cascadia Mono',Consolas,monospace;font-size:13px;"
            "padding:22px 26px;}"
        )
        self._raw.textChanged.connect(self._on_text_changed)
        self._stack.addWidget(self._raw)       # 1

        self._read = QTextBrowser()
        self._read.setOpenExternalLinks(True)
        self._read.setStyleSheet(
            f"QTextBrowser{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-size:15px;padding:22px 26px;}"
        )
        self._stack.addWidget(self._read)      # 2

        root.addWidget(self._stack, stretch=1)

        # Mentions footer
        self._mentions = _MentionsFooter(self.service)
        self._mentions.open_requested.connect(self.open_note_requested.emit)
        root.addWidget(self._mentions)

        # Status strip
        self._status = QLabel("")
        self._status.setFixedHeight(22)
        self._status.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:{BG_BAR};"
            f"border-top:1px solid {BORDER};padding:0 12px;"
        )
        root.addWidget(self._status)

        # Autosave
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(1200)
        self._save_timer.timeout.connect(self.save_current)

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

        for label, tip, level in [("H1", "Título 1", 1), ("H2", "Título 2", 2),
                                  ("H3", "Título 3", 3)]:
            b = _ToolBtn(label, tip, 30, bold=True)
            b.clicked.connect(lambda _=False, l=level: self.apply_heading(l))
            lay.addWidget(b)
        b = _ToolBtn("¶", "Texto normal", 26)
        b.clicked.connect(lambda: self.apply_heading(0))
        lay.addWidget(b)
        lay.addWidget(_sep())

        b = _ToolBtn("B", "Negrita  (Ctrl+B)", 26, bold=True)
        b.clicked.connect(self.toggle_bold)
        lay.addWidget(b)
        b = _ToolBtn("I", "Cursiva  (Ctrl+I)", 26, italic=True)
        b.clicked.connect(self.toggle_italic)
        lay.addWidget(b)
        b = _ToolBtn("S", "Tachado", 26)
        b.clicked.connect(self.toggle_strike)
        lay.addWidget(b)
        b = _ToolBtn("</>", "Código en línea", 34)
        b.clicked.connect(self.toggle_code)
        lay.addWidget(b)
        lay.addWidget(_sep())

        b = _ToolBtn("A+", "Agrandar la letra", 30)
        b.clicked.connect(lambda: self.bump_font(+1))
        lay.addWidget(b)
        b = _ToolBtn("A-", "Reducir la letra", 30)
        b.clicked.connect(lambda: self.bump_font(-1))
        lay.addWidget(b)
        lay.addWidget(_sep())

        b = _ToolBtn("•", "Lista con viñetas", 26)
        b.clicked.connect(lambda: self.apply_list(QTextListFormat.ListDisc))
        lay.addWidget(b)
        b = _ToolBtn("1.", "Lista numerada", 28)
        b.clicked.connect(lambda: self.apply_list(QTextListFormat.ListDecimal))
        lay.addWidget(b)
        b = _ToolBtn("☑", "Casilla de tarea", 26)
        b.clicked.connect(self.insert_checkbox)
        lay.addWidget(b)
        b = _ToolBtn("❝", "Cita", 26)
        b.clicked.connect(self.insert_quote)
        lay.addWidget(b)
        lay.addWidget(_sep())

        b = _ToolBtn("🔗", "Enlace", 26)
        b.clicked.connect(self.insert_link)
        lay.addWidget(b)
        b = _ToolBtn("[[ ]]", "Enlace a otra nota", 38)
        b.clicked.connect(self.insert_wikilink)
        lay.addWidget(b)
        b = _ToolBtn("―", "Separador", 26)
        b.clicked.connect(self.insert_rule)
        lay.addWidget(b)

        lay.addStretch()

        self._bm_btn = _ToolBtn("🔖", "Marcador", 28)
        self._bm_btn.setCheckable(True)
        self._bm_btn.clicked.connect(self.toggle_bookmark)
        lay.addWidget(self._bm_btn)
        lay.addWidget(_sep())

        self._chat_btn = _ToolBtn("⟩⟩", "Mostrar / ocultar asistente", 32)
        self._chat_btn.clicked.connect(self.assistant_toggled.emit)
        lay.addWidget(self._chat_btn)
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

    # ── Tabs / open notes ─────────────────────────────────────────────────

    def open_note(self, path: Path, line: int = 0):
        path = Path(path)
        for i, note in enumerate(self._open):
            if note.path == path:
                self._tabs.setCurrentIndex(i)
                if line:
                    self._goto_line(line)
                return
        if not path.exists():
            QMessageBox.warning(self, "No encontrada",
                                f"El archivo ya no existe:\n{path}")
            return

        text = path.read_text(encoding="utf-8", errors="replace")
        fm, body = _split_frontmatter(text)
        self._open.append(_OpenNote(path, fm, body))
        self._tabs.blockSignals(True)
        index = self._tabs.addTab(path.stem)
        self._tabs.setTabToolTip(index, str(path))
        self._tabs.blockSignals(False)
        self._tabs.setCurrentIndex(index)
        if self._tabs.currentIndex() == index and self._current != index:
            self._on_tab_changed(index)
        if line:
            self._goto_line(line)

    def close_tab(self, index: int):
        if not (0 <= index < len(self._open)):
            return
        if self._open[index].dirty:
            self._save(index)
        self._open.pop(index)
        self._tabs.removeTab(index)
        if not self._open:
            self._current = -1
            self._show_placeholder(True)
            self.active_note_changed.emit(None)

    def _on_tab_changed(self, index: int):
        if self._current >= 0 and self._current < len(self._open):
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

    def current_path(self):
        if 0 <= self._current < len(self._open):
            return self._open[self._current].path
        return None

    def current_title(self) -> str:
        p = self.current_path()
        return p.stem if p else ""

    def current_body(self) -> str:
        if not (0 <= self._current < len(self._open)):
            return ""
        self._capture_current()
        return self._open[self._current].body

    def current_selection(self) -> str:
        widget = self._raw if self._mode == MODE_RAW else self._rich
        return widget.textCursor().selectedText().replace(" ", "\n")

    # ── Loading / saving ──────────────────────────────────────────────────

    def _load_into_view(self, note: _OpenNote):
        self._loading = True
        try:
            if self._mode == MODE_RAW:
                self._raw.setPlainText(note.body)
            elif self._mode == MODE_READ:
                self._read.setHtml(
                    markdown_utils.to_html(note.body, self.vault)
                )
            else:
                self._rich.setMarkdown(note.body)
        finally:
            self._loading = False
        self._stack.setCurrentIndex(self._mode)
        self._bm_btn.setChecked(self.service.is_bookmarked(note.path))
        self._update_status(note)
        # Defer mention scanning so the note renders first, then we scan the vault.
        self._pending_mention = note.path
        QTimer.singleShot(300, self._load_mentions_deferred)

    def _load_mentions_deferred(self):
        path = self._pending_mention
        if path is None:
            return
        if 0 <= self._current < len(self._open):
            if self._open[self._current].path == path:
                self._mentions.load(path)
        self._pending_mention = None

    def _capture_current(self):
        """Pull whatever the visible editor holds back into the model."""
        if not (0 <= self._current < len(self._open)):
            return
        note = self._open[self._current]
        if self._mode == MODE_RAW:
            note.body = self._raw.toPlainText()
        elif self._mode == MODE_RICH:
            # Qt's own toMarkdown() drops bold / italic in 6.11, so
            # the document is serialised by hand.
            note.body = document_to_markdown(self._rich.document())

    def _on_text_changed(self):
        if self._loading or not (0 <= self._current < len(self._open)):
            return
        note = self._open[self._current]
        note.dirty = True
        self._tabs.setTabText(self._current, "• " + note.path.stem)
        self._save_timer.start()

    def save_current(self):
        if 0 <= self._current < len(self._open):
            self._capture_current()
            self._save(self._current)

    def _save(self, index: int):
        note = self._open[index]
        body = note.body
        if not body.endswith("\n"):
            body += "\n"
        try:
            note.path.write_text(note.frontmatter + body, encoding="utf-8")
        except Exception as e:
            self._status.setText(f"No se pudo guardar: {e}")
            return
        note.dirty = False
        self._tabs.setTabText(index, note.path.stem)
        self._update_status(note, saved=True)
        self.note_saved.emit(note.path)
        if index == self._current:
            self._mentions.load(note.path)

    def _update_status(self, note: _OpenNote, saved: bool = False):
        words = markdown_utils.count_words(note.body)
        chars = len(note.body)
        try:
            rel = note.path.relative_to(self.vault.vault_root)
        except ValueError:
            rel = note.path
        tail = "  ·  guardado ✓" if saved else ""
        self._status.setText(f"{rel}   ·   {words} palabras · {chars} caracteres{tail}")

    def _show_placeholder(self, show: bool):
        if show:
            self._loading = True
            self._read.setHtml(
                f"<div style='color:{TEXT_FAINT};font-size:14px;padding:40px;'>"
                "<h2 style='color:#888895;'>Sin nota abierta</h2>"
                "<p>Elige una nota en el explorador, o crea una nueva con ✎.</p>"
                "<p>Pestañas del panel izquierdo: <b>Files</b>, <b>Search</b> y "
                "<b>Bookmarks</b>.</p></div>"
            )
            self._loading = False
            self._stack.setCurrentIndex(MODE_READ)
            self._status.setText("")
            self._mentions.clear()

    # ── Mode ──────────────────────────────────────────────────────────────

    def set_mode(self, mode: int):
        if not (0 <= self._current < len(self._open)):
            for i, b in enumerate(self._mode_btns):
                b.setChecked(i == mode)
            self._mode = mode
            return
        self._capture_current()
        self._mode = mode
        for i, b in enumerate(self._mode_btns):
            b.setChecked(i == mode)
        self._load_into_view(self._open[self._current])

    # ── Formatting ────────────────────────────────────────────────────────

    def _editor(self) -> QTextEdit:
        return self._raw if self._mode == MODE_RAW else self._rich

    def _ensure_editable(self) -> bool:
        if self._mode == MODE_READ:
            self.set_mode(MODE_RICH)
        return 0 <= self._current < len(self._open)

    def apply_heading(self, level: int):
        if not self._ensure_editable():
            return
        if self._mode == MODE_RAW:
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
        if self._mode == MODE_RAW:
            self._raw_wrap("**", "**")
            return
        fmt = QTextCharFormat()
        bold = self._rich.fontWeight() > QFont.Normal
        fmt.setFontWeight(QFont.Normal if bold else QFont.Bold)
        self._merge_char(fmt)

    def toggle_italic(self):
        if not self._ensure_editable():
            return
        if self._mode == MODE_RAW:
            self._raw_wrap("*", "*")
            return
        fmt = QTextCharFormat()
        fmt.setFontItalic(not self._rich.fontItalic())
        self._merge_char(fmt)

    def toggle_strike(self):
        if not self._ensure_editable():
            return
        if self._mode == MODE_RAW:
            self._raw_wrap("~~", "~~")
            return
        fmt = QTextCharFormat()
        current = self._rich.currentCharFormat().fontStrikeOut()
        fmt.setFontStrikeOut(not current)
        self._merge_char(fmt)

    def toggle_code(self):
        if not self._ensure_editable():
            return
        if self._mode == MODE_RAW:
            self._raw_wrap("`", "`")
            return
        fmt = QTextCharFormat()
        current = self._rich.currentCharFormat().fontFamilies() or []
        mono = "Cascadia Mono" in current
        fmt.setFontFamilies(["Segoe UI"] if mono else ["Cascadia Mono", "Consolas"])
        self._merge_char(fmt)

    def bump_font(self, delta: int):
        if not self._ensure_editable():
            return
        if self._mode == MODE_RAW:
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
        if self._mode == MODE_RAW:
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
        if not self._ensure_editable():
            return
        self._insert_at_line_start("- [ ] ")

    def insert_quote(self):
        if not self._ensure_editable():
            return
        self._insert_at_line_start("> ")

    def insert_rule(self):
        if not self._ensure_editable():
            return
        ed = self._editor()
        cursor = ed.textCursor()
        cursor.insertText("\n---\n")
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
        stripped = re.sub(r"^(#{1,6}\s+|-\s\[[ x]\]\s|[-*]\s|\d+\.\s|>\s)", "", line)
        cursor.insertText(prefix + stripped)
        cursor.setPosition(line_start + len(prefix) + len(stripped))
        self._raw.setTextCursor(cursor)
        self._raw.setFocus()

    def _insert_at_line_start(self, prefix: str):
        if self._mode == MODE_RAW:
            self._raw_prefix_line(prefix)
            return
        cursor = self._rich.textCursor()
        cursor.movePosition(QTextCursor.StartOfBlock)
        cursor.insertText(prefix)
        self._rich.setFocus()

    def _goto_line(self, line: int):
        if line <= 0:
            return
        if self._mode != MODE_RAW:
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
        if not (0 <= self._current < len(self._open)):
            QMessageBox.information(
                self, "Sin nota abierta",
                "Abre o crea una nota antes de insertar el texto."
            )
            return False
        if self._mode == MODE_READ:
            self.set_mode(MODE_RICH)
        note = self._open[self._current]
        if self._mode == MODE_RAW:
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
        if not (0 <= self._current < len(self._open)):
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
        while self._tabs.count():
            self._tabs.removeTab(0)
        self._open.clear()
        self._current = -1
        self._show_placeholder(True)

    def save_all(self):
        if 0 <= self._current < len(self._open):
            self._capture_current()
        for i, note in enumerate(self._open):
            if note.dirty:
                self._save(i)

    def refresh_mentions(self):
        path = self.current_path()
        if path:
            self._mentions.load(path)


class _MentionsFooter(QFrame):
    """Linked / unlinked mentions, pinned under every open note."""

    open_requested = Signal(Path)

    def __init__(self, service: NotesService, parent=None):
        super().__init__(parent)
        self.service = service
        self._expanded = True
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
        while self._body.count():
            item = self._body.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self._count.setText("0")

    def load(self, path: Path):
        self.clear()
        note = self.service.vault.get_note(Path(path))
        if note is None:
            return
        linked, unlinked = self.service.mentions(note)

        self._count.setText(str(len(linked)))
        if linked:
            for m in linked:
                self._body.addWidget(self._row(m))
        else:
            self._body.addWidget(self._muted("No backlinks found."))

        self._body.addSpacing(8)
        sub = QLabel("Unlinked mentions")
        sub.setStyleSheet(
            f"color:{TEXT};font-size:12px;font-weight:600;"
            "background:transparent;border:none;"
        )
        self._body.addWidget(sub)

        if unlinked:
            for m in unlinked:
                self._body.addWidget(self._row(m))
        else:
            self._body.addWidget(self._muted("Sin menciones sueltas."))
        self._body.addStretch()

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

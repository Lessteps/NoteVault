"""
NoteVault Editor Panel
Center panel: tabbed markdown editor with edit / preview / split modes.
Adapted from SDD Studio's WorkspacePanel.
"""

from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QPlainTextEdit, QTextBrowser, QStackedWidget, QSplitter,
    QTabBar, QFrame, QScrollArea,
)
from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QKeySequence, QShortcut, QTextCursor, QFont

from ...core.vault_manager import VaultManager, Note
from ...core.markdown_utils import to_html, extract_headings, count_words


class EditorPanel(QWidget):
    note_saved        = Signal(Path)
    note_closed       = Signal(Path)
    wikilink_clicked  = Signal(str)  # link target text

    def __init__(self, vault: VaultManager, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.vault = vault
        self._open_tabs: list[Path] = []
        self._active_path: Path = None
        self._mode = "edit"  # 'edit' | 'preview' | 'split'
        self._dirty = False
        self._save_timer = QTimer()
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(800)
        self._save_timer.timeout.connect(self._autosave)
        self._init_ui()

    # ── UI Setup ─────────────────────────────────────────────────────────

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_tabs_bar())
        layout.addWidget(self._build_toolbar())
        layout.addWidget(self._build_content(), stretch=1)

    def _build_tabs_bar(self) -> QWidget:
        bar = QWidget()
        bar.setObjectName("tabsBar")
        bar.setFixedHeight(36)
        self._tabs_layout = QHBoxLayout(bar)
        self._tabs_layout.setContentsMargins(6, 0, 6, 0)
        self._tabs_layout.setSpacing(2)
        self._tabs_layout.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        return bar

    def _build_toolbar(self) -> QWidget:
        bar = QWidget()
        bar.setFixedHeight(40)
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(10, 0, 10, 0)
        layout.setSpacing(4)

        # Mode switcher
        self._btn_edit    = self._mode_btn("✏", "Editar", "edit")
        self._btn_preview = self._mode_btn("👁", "Vista Previa", "preview")
        self._btn_split   = self._mode_btn("◫", "Dividido", "split")

        mode_row = QHBoxLayout()
        mode_row.setSpacing(0)
        for btn in (self._btn_edit, self._btn_preview, self._btn_split):
            mode_row.addWidget(btn)
        layout.addLayout(mode_row)

        layout.addWidget(self._separator())

        # Format actions
        for fmt, label, tip in [
            ("bold",    "B",  "Negrita (Ctrl+B)"),
            ("italic",  "I",  "Cursiva (Ctrl+I)"),
            ("heading", "H",  "Encabezado"),
            ("link",    "🔗", "Enlace"),
            ("code",    "`",  "Código"),
            ("list",    "≡",  "Lista"),
            ("check",   "☐",  "Tarea"),
        ]:
            btn = QPushButton(label)
            btn.setObjectName("chipBtn")
            btn.setFixedSize(28, 28)
            btn.setToolTip(tip)
            btn.clicked.connect(lambda _=False, f=fmt: self._apply_format(f))
            layout.addWidget(btn)

        layout.addStretch()

        self._word_count_label = QLabel("0 palabras")
        self._word_count_label.setObjectName("metaLabel")
        layout.addWidget(self._word_count_label)

        return bar

    def _mode_btn(self, glyph: str, tip: str, mode: str) -> QPushButton:
        btn = QPushButton(glyph)
        btn.setObjectName("subTab" if mode != self._mode else "subTabActive")
        btn.setFixedHeight(28)
        btn.setToolTip(tip)
        btn.setCursor(Qt.PointingHandCursor)
        btn.clicked.connect(lambda _=False, m=mode: self.set_mode(m))
        return btn

    def _separator(self) -> QFrame:
        sep = QFrame()
        sep.setFixedWidth(1)
        sep.setFixedHeight(20)
        sep.setObjectName("vaultPopupDivider")
        return sep

    def _build_content(self) -> QWidget:
        self._splitter = QSplitter(Qt.Horizontal)
        self._splitter.setHandleWidth(1)

        # Edit pane
        self._editor = QPlainTextEdit()
        self._editor.setObjectName("documentEditor")
        self._editor.setPlaceholderText("Empieza a escribir en Markdown…\n\nUsa [[nombre]] para links internos.")
        self._editor.textChanged.connect(self._on_text_changed)
        self._splitter.addWidget(self._editor)

        # Preview pane
        self._preview = QTextBrowser()
        self._preview.setObjectName("specView")
        self._preview.setOpenLinks(False)
        self._preview.anchorClicked.connect(self._on_link_clicked)
        self._splitter.addWidget(self._preview)

        self._apply_mode_visibility()

        # Keyboard shortcuts
        QShortcut(QKeySequence("Ctrl+B"), self._editor, lambda: self._apply_format("bold"))
        QShortcut(QKeySequence("Ctrl+I"), self._editor, lambda: self._apply_format("italic"))
        QShortcut(QKeySequence("Ctrl+S"), self, self._autosave)
        QShortcut(QKeySequence("Ctrl+E"), self, lambda: self.set_mode("preview" if self._mode == "edit" else "edit"))

        return self._splitter

    # ── Tabs ─────────────────────────────────────────────────────────────

    def _rebuild_tabs(self):
        while self._tabs_layout.count():
            item = self._tabs_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        for path in self._open_tabs:
            tab = self._make_tab_widget(path)
            self._tabs_layout.addWidget(tab)

        self._tabs_layout.addStretch()

    def _make_tab_widget(self, path: Path) -> QWidget:
        w = QWidget()
        row = QHBoxLayout(w)
        row.setContentsMargins(6, 0, 2, 0)
        row.setSpacing(4)

        is_active = path == self._active_path
        name_lbl = QLabel(path.stem)
        name_lbl.setObjectName("primaryLabelSm" if is_active else "metaLabel")
        row.addWidget(name_lbl)

        close_btn = QPushButton("×")
        close_btn.setFixedSize(16, 16)
        close_btn.setObjectName("ghostBtn")
        close_btn.clicked.connect(lambda _=False, p=path: self._close_tab(p))
        row.addWidget(close_btn)

        w.setStyleSheet(
            "background:#1a1a1e; border-bottom: 2px solid #7c5af0; border-radius:0;"
            if is_active else
            "background:#202024; border-bottom: 2px solid transparent; border-radius:0;"
        )
        w.setCursor(Qt.PointingHandCursor)
        w.mousePressEvent = lambda _ev, p=path: self.open_note(p)
        return w

    def _close_tab(self, path: Path):
        if path in self._open_tabs:
            self._open_tabs.remove(path)
        if path == self._active_path:
            if self._open_tabs:
                self.open_note(self._open_tabs[-1])
            else:
                self._active_path = None
                self._editor.setPlainText("")
                self._preview.setHtml("")
        self._rebuild_tabs()
        self.note_closed.emit(path)

    # ── Note Loading / Saving ────────────────────────────────────────────

    def open_note(self, path: Path):
        if path not in self._open_tabs:
            self._open_tabs.append(path)

        self._active_path = path
        note = self.vault.get_note(path)
        if note:
            self._editor.blockSignals(True)
            self._editor.setPlainText(note.raw)
            self._editor.blockSignals(False)
            self._render_preview()
            self._update_word_count()

        self._rebuild_tabs()

    def current_note(self) -> Note | None:
        if self._active_path:
            return self.vault.get_note(self._active_path)
        return None

    def _on_text_changed(self):
        self._dirty = True
        self._update_word_count()
        if self._mode != "edit":
            self._render_preview()
        self._save_timer.start()

    def _autosave(self):
        if self._active_path and self._dirty:
            content = self._editor.toPlainText()
            self._active_path.write_text(content, encoding="utf-8")
            self._dirty = False
            self.note_saved.emit(self._active_path)

    def _render_preview(self):
        html = to_html(self._editor.toPlainText(), self.vault)
        css = self._preview_css()
        self._preview.setHtml(f"<html><head><style>{css}</style></head><body>{html}</body></html>")

    def _preview_css(self) -> str:
        return """
            body { font-family: 'Segoe UI', sans-serif; font-size: 13px;
                   color: #dcdde0; background: #1a1a1e; padding: 24px 40px; line-height: 1.65; }
            h1 { font-size: 1.7em; font-weight: 700; border-bottom: 1px solid #33333e;
                 padding-bottom: 0.3em; margin-bottom: 0.6em; }
            h2 { font-size: 1.3em; font-weight: 600; margin-top: 1.5em; }
            h3 { font-size: 1.1em; font-weight: 600; margin-top: 1.2em; }
            p { color: #aaaaae; margin-bottom: 0.8em; }
            code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 0.88em;
                   background: #26262e; color: #a5b4fc; padding: 2px 5px; border-radius: 4px; }
            pre { background: #202024; border: 1px solid #33333e; border-radius: 6px;
                  padding: 12px; overflow-x: auto; }
            pre code { background: none; padding: 0; color: #dcdde0; }
            blockquote { border-left: 3px solid #7c5af0; background: rgba(124,90,240,0.08);
                         padding: 6px 14px; margin: 12px 0; color: #888895; border-radius: 0 4px 4px 0; }
            table { border-collapse: collapse; width: 100%; margin: 12px 0; }
            th, td { border: 1px solid #33333e; padding: 7px 12px; text-align: left; font-size: 0.9em; }
            th { background: #26262e; font-weight: 600; }
            a { color: #7c5af0; text-decoration: none; }
            hr { border: none; border-top: 1px solid #33333e; margin: 16px 0; }
            mark { background: rgba(124,90,240,0.2); border-radius: 3px; }
            ul, ol { color: #aaaaae; padding-left: 1.5em; margin-bottom: 0.8em; }
        """

    def _update_word_count(self):
        text = self._editor.toPlainText()
        words = count_words(text)
        chars = len(text)
        self._word_count_label.setText(f"{words} palabras · {chars} chars")

    # ── Mode ─────────────────────────────────────────────────────────────

    def set_mode(self, mode: str):
        self._mode = mode
        for btn, m in [(self._btn_edit, "edit"), (self._btn_preview, "preview"), (self._btn_split, "split")]:
            btn.setObjectName("subTabActive" if m == mode else "subTab")
            btn.style().unpolish(btn)
            btn.style().polish(btn)
        self._apply_mode_visibility()
        if mode != "edit":
            self._render_preview()

    def _apply_mode_visibility(self):
        if self._mode == "edit":
            self._editor.setVisible(True)
            self._preview.setVisible(False)
        elif self._mode == "preview":
            self._editor.setVisible(False)
            self._preview.setVisible(True)
        else:  # split
            self._editor.setVisible(True)
            self._preview.setVisible(True)
            self._splitter.setSizes([500, 500])

    # ── Format ───────────────────────────────────────────────────────────

    def _apply_format(self, fmt: str):
        cursor = self._editor.textCursor()
        sel = cursor.selectedText()
        formats = {
            "bold":    f"**{sel or 'texto'}**",
            "italic":  f"*{sel or 'texto'}*",
            "heading": f"\n## {sel or 'Encabezado'}\n",
            "link":    f"[{sel or 'texto'}](url)",
            "code":    f"`{sel or 'código'}`",
            "list":    f"\n- {sel or 'elemento'}\n",
            "check":   f"\n- [ ] {sel or 'tarea'}\n",
        }
        if fmt in formats:
            cursor.insertText(formats[fmt])
        self._editor.setFocus()

    # ── Links ─────────────────────────────────────────────────────────────

    def _on_link_clicked(self, url):
        url_str = url.toString()
        if url_str.startswith("nv://note/"):
            target = url_str[len("nv://note/"):]
            self.wikilink_clicked.emit(target)

    # ── Public helpers ───────────────────────────────────────────────────

    def get_outline(self) -> list[dict]:
        return extract_headings(self._editor.toPlainText())

    def get_word_count(self) -> int:
        return count_words(self._editor.toPlainText())

    def get_content(self) -> str:
        return self._editor.toPlainText()

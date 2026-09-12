"""
NoteVault Properties Panel
Right panel: note properties, backlinks, and outline.
Adapted from SDD Studio's InspectorPanel.
"""

from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QScrollArea, QFrame, QPlainTextEdit,
)
from PySide6.QtCore import Qt, Signal

from ...core.vault_manager import VaultManager, Note
from .file_explorer import tiny_caps


class PropertiesPanel(QWidget):
    note_link_clicked = Signal(str)

    def __init__(self, vault: VaultManager, parent=None):
        super().__init__(parent)
        self.setObjectName("chatPanel")
        self.vault = vault
        self._current_note: Note | None = None
        self._active_tab = "properties"
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_tab_bar())

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        self._scroll_content = QWidget()
        self._content_layout = QVBoxLayout(self._scroll_content)
        self._content_layout.setContentsMargins(10, 10, 10, 10)
        self._content_layout.setSpacing(14)
        scroll.setWidget(self._scroll_content)
        layout.addWidget(scroll, stretch=1)

        self._show_tab("properties")

    def _build_tab_bar(self) -> QWidget:
        bar = QWidget()
        bar.setFixedHeight(40)
        row = QHBoxLayout(bar)
        row.setContentsMargins(6, 0, 6, 0)
        row.setSpacing(2)

        self._tab_btns = {}
        for key, label in [("properties", "Propiedades"), ("backlinks", "Backlinks"), ("outline", "Esquema")]:
            btn = QPushButton(label)
            btn.setObjectName("subTabActive" if key == self._active_tab else "subTab")
            btn.setFixedHeight(28)
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(lambda _=False, k=key: self._show_tab(k))
            self._tab_btns[key] = btn
            row.addWidget(btn)
        row.addStretch()
        return bar

    def _show_tab(self, tab: str):
        self._active_tab = tab
        for key, btn in self._tab_btns.items():
            btn.setObjectName("subTabActive" if key == tab else "subTab")
            btn.style().unpolish(btn)
            btn.style().polish(btn)
        self._rebuild_content()

    def _rebuild_content(self):
        while self._content_layout.count():
            item = self._content_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        if self._active_tab == "properties":
            self._build_properties_tab()
        elif self._active_tab == "backlinks":
            self._build_backlinks_tab()
        elif self._active_tab == "outline":
            self._build_outline_tab()

        self._content_layout.addStretch()

    # ── Properties Tab ────────────────────────────────────────────────────

    def _build_properties_tab(self):
        note = self._current_note
        if not note:
            self._content_layout.addWidget(QLabel("Sin nota activa"))
            return

        self._content_layout.addWidget(tiny_caps("Metadata"))

        for label, value in [
            ("Nombre", note.title),
            ("Ruta", str(note.rel_path)),
            ("Creado", note.created_time),
            ("Modificado", note.modified_time),
            ("Palabras", str(note.word_count)),
            ("Caracteres", str(len(note.raw))),
        ]:
            row = QHBoxLayout()
            key_lbl = QLabel(label)
            key_lbl.setObjectName("metaLabel")
            key_lbl.setFixedWidth(80)
            val_lbl = QLabel(value)
            val_lbl.setWordWrap(True)
            val_lbl.setObjectName("primaryLabelSm" if label == "Nombre" else "metaLabel")
            row.addWidget(key_lbl)
            row.addWidget(val_lbl, stretch=1)
            self._content_layout.addLayout(row)

        self._content_layout.addWidget(self._divider())
        self._content_layout.addWidget(tiny_caps("Etiquetas"))

        tags = note.tags
        if tags:
            tags_row = QHBoxLayout()
            tags_row.setSpacing(4)
            for tag in tags[:8]:
                chip = QPushButton(f"#{tag}" if not tag.startswith("#") else tag)
                chip.setObjectName("chipBtn")
                chip.setFixedHeight(22)
                tags_row.addWidget(chip)
            tags_row.addStretch()
            self._content_layout.addLayout(tags_row)
        else:
            self._content_layout.addWidget(QLabel("Sin etiquetas"))

        fm = note.frontmatter
        if fm:
            self._content_layout.addWidget(self._divider())
            self._content_layout.addWidget(tiny_caps("Frontmatter"))
            fm_display = QPlainTextEdit()
            fm_display.setReadOnly(True)
            fm_display.setObjectName("composerInput")
            fm_display.setFixedHeight(80)
            fm_display.setPlainText("\n".join(f"{k}: {v}" for k, v in fm.items()))
            self._content_layout.addWidget(fm_display)

    # ── Backlinks Tab ─────────────────────────────────────────────────────

    def _build_backlinks_tab(self):
        note = self._current_note
        if not note:
            self._content_layout.addWidget(QLabel("Sin nota activa"))
            return

        backlinks = self.vault.get_backlinks(note)
        count_lbl = tiny_caps(f"{len(backlinks)} Referencias Entrantes")
        self._content_layout.addWidget(count_lbl)

        if not backlinks:
            no_lbl = QLabel("Ninguna nota enlaza a esta todavía.")
            no_lbl.setObjectName("metaLabel")
            no_lbl.setWordWrap(True)
            self._content_layout.addWidget(no_lbl)
            return

        for bl_note in backlinks:
            card = QFrame()
            card.setObjectName("card")
            card_layout = QVBoxLayout(card)
            card_layout.setContentsMargins(8, 8, 8, 8)
            card_layout.setSpacing(4)

            name_btn = QPushButton(bl_note.title)
            name_btn.setObjectName("ghostBtn")
            name_btn.setCursor(Qt.PointingHandCursor)
            name_btn.clicked.connect(lambda _=False, t=bl_note.title: self.note_link_clicked.emit(t))
            card_layout.addWidget(name_btn)

            path_lbl = QLabel(str(bl_note.rel_path))
            path_lbl.setObjectName("metaLabel")
            card_layout.addWidget(path_lbl)

            self._content_layout.addWidget(card)

    # ── Outline Tab ───────────────────────────────────────────────────────

    def _build_outline_tab(self, headings: list[dict] = None):
        if headings is None:
            headings = []

        self._content_layout.addWidget(tiny_caps("Esquema del documento"))

        if not headings:
            lbl = QLabel("Sin encabezados")
            lbl.setObjectName("metaLabel")
            self._content_layout.addWidget(lbl)
            return

        indent_map = {1: 0, 2: 12, 3: 24, 4: 36, 5: 48, 6: 60}
        for h in headings:
            btn = QPushButton(h["text"])
            btn.setObjectName("tocBtn")
            btn.setCursor(Qt.PointingHandCursor)
            btn.setContentsMargins(indent_map.get(h["level"], 0), 0, 0, 0)
            self._content_layout.addWidget(btn)

    # ── Public interface ──────────────────────────────────────────────────

    def load_note(self, note: Note, outline: list[dict] = None):
        self._current_note = note
        self._rebuild_content()
        if self._active_tab == "outline" and outline is not None:
            while self._content_layout.count():
                item = self._content_layout.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
            self._build_outline_tab(outline)
            self._content_layout.addStretch()

    def update_outline(self, headings: list[dict]):
        if self._active_tab == "outline":
            while self._content_layout.count():
                item = self._content_layout.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
            self._build_outline_tab(headings)
            self._content_layout.addStretch()

    def set_vault(self, vault: VaultManager):
        self.vault = vault

    # ── Helpers ───────────────────────────────────────────────────────────

    def _divider(self) -> QFrame:
        line = QFrame()
        line.setFixedHeight(1)
        line.setObjectName("vaultPopupDivider")
        return line

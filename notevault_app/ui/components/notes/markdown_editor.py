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
    format_markdown_tables, new_table, rich_edit_problem, expand_transclusions,
)
from .note_view import (
    NoteTextEdit, NoteTextBrowser, NoteSourceEdit, set_list_level,
    toggle_marker, embed_files, style_tables,
)
from .command_palette import Command, CommandPalette
from .table_picker import TablePicker
from .note_properties_dialog import NotePropertiesDialog
from .english_audio_panel import EnglishAudioPanel
from ....core.frontmatter_utils import parse_frontmatter, dump_frontmatter, sanitize_properties
from ....core.workspace_manager import WorkspaceManager
from ....core.templates import list_templates, read_and_expand
from ....core.daily_notes import open_or_create_today

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
    context_action_requested = Signal(str, str, dict)

    def __init__(self, vault: VaultManager, service: NotesService, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.vault = vault
        self.service = service
        self._workspace_manager = WorkspaceManager(self.vault.vault_root)
        self._current_workspace = self._workspace_manager.get("general")
        self._open: list = []          # list[_OpenNote], parallel to the tab bar
        self._current: int = -1
        self._loading = False
        self._reordering = False
        self._mode = MODE_RICH
        # The mode the visible widget is actually showing. Asking
        # `_mode_for()` again on every capture re-ran the rich-edit check,
        # which re-parses the whole note: that is what stalled the editor a
        # second after every keystroke.
        self._active = MODE_RICH
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
        root.addWidget(self._build_workspace_bar())

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
        self._rich.note_link_activated.connect(self._open_wikilink)
        self._rich.context_menu_builder = self._build_editor_context_menu
        self._stack.addWidget(self._rich)      # 0

        self._raw = NoteSourceEdit()
        self._raw.setStyleSheet(
            f"QTextEdit{{background:{BG_PAGE};border:none;color:{TEXT};"
            "font-family:'Cascadia Mono',Consolas,monospace;font-size:13px;"
            "padding:22px 26px;}"
        )
        self._raw.textChanged.connect(self._on_text_changed)
        self._raw.note_link_activated.connect(self._open_wikilink)
        self._raw.context_menu_builder = self._build_editor_context_menu
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
        self._mentions.open_requested.connect(self._open_from_mention)
        root.addWidget(self._mentions)
        QTimer.singleShot(400, self._mentions.warm_up)

        # Backlinks refresh themselves a short moment after any note is saved,
        # so a link added in one note shows up as a backlink in another without
        # the user reopening it. A single-shot timer collapses the rapid-fire
        # autosaves into one scan, which keeps the editor from freezing.
        self._mentions_refresh = QTimer(self)
        self._mentions_refresh.setSingleShot(True)
        self._mentions_refresh.setInterval(700)
        self._mentions_refresh.timeout.connect(self.refresh_mentions)
        self.note_saved.connect(lambda _p: self._mentions_refresh.start())

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
        add(_ToolBtn("⊞", "Insertar tabla", 26), lambda: self.insert_table())
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

    def _build_workspace_bar(self) -> QWidget:
        self._ws_frame = QFrame()
        self._ws_frame.setAttribute(Qt.WA_StyledBackground, True)
        self._ws_frame.setFixedHeight(34)
        self._ws_frame.setStyleSheet(
            f"QFrame{{background:{BG_BAR};border:none;border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(self._ws_frame)
        lay.setContentsMargins(10, 0, 10, 0)
        lay.setSpacing(8)

        # Breadcrumb: 📁 Carpeta › Subcarpeta › Nota.md
        self._breadcrumb_lbl = QLabel("")
        self._breadcrumb_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;font-weight:500;"
        )
        lay.addWidget(self._breadcrumb_lbl)

        # OS Explorer button
        self._reveal_file_btn = QPushButton("📁 Ver en file")
        self._reveal_file_btn.setToolTip("Abrir archivo en el explorador del sistema")
        self._reveal_file_btn.setCursor(Qt.PointingHandCursor)
        self._reveal_file_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: 1px solid {BORDER}; "
            f"border-radius: 4px; color: {TEXT_DIM}; font-size: 11px; padding: 2px 8px; }}"
            f"QPushButton:hover {{ background: #2e2e38; color: {TEXT}; border-color: {ACCENT}; }}"
        )
        self._reveal_file_btn.clicked.connect(self._reveal_current_in_os)
        lay.addWidget(self._reveal_file_btn)

        # Workspace badge (shown only when specific workspace like Mathematics/Programming/English is active)
        self._ws_badge = QLabel("")
        self._ws_badge.setStyleSheet(
            "QLabel { background: rgba(124, 90, 240, 0.15); color: #bca6f7; "
            "border: 1px solid rgba(124, 90, 240, 0.35); border-radius: 4px; "
            "padding: 2px 8px; font-weight: bold; font-size: 11px; }"
        )
        self._ws_badge.setVisible(False)
        lay.addWidget(self._ws_badge)

        # Properties edit button
        self._props_btn = QPushButton("Propiedades ⚙")
        self._props_btn.setCursor(Qt.PointingHandCursor)
        self._props_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: 1px solid {BORDER}; "
            f"border-radius: 4px; color: {TEXT_DIM}; font-size: 11px; padding: 2px 8px; }}"
            f"QPushButton:hover {{ background: #2e2e38; color: {TEXT}; border-color: {ACCENT}; }}"
        )
        self._props_btn.clicked.connect(self._open_properties_dialog)
        lay.addWidget(self._props_btn)

        # Properties summary chip
        self._props_summary = QLabel("")
        self._props_summary.setStyleSheet(f"color: {TEXT_FAINT}; font-size: 11px;")
        self._props_summary.setVisible(False)
        lay.addWidget(self._props_summary)

        lay.addStretch()

        # Context action buttons container
        self._context_actions_box = QWidget()
        self._context_actions_lay = QHBoxLayout(self._context_actions_box)
        self._context_actions_lay.setContentsMargins(0, 0, 0, 0)
        self._context_actions_lay.setSpacing(4)
        lay.addWidget(self._context_actions_box)

        return self._ws_frame

    def _reveal_current_in_os(self):
        note = self.current_note()
        if not note or not note.path.exists():
            return
        try:
            import subprocess
            subprocess.Popen(f'explorer.exe /select,"{note.path.resolve()}"')
        except Exception:
            pass

    def _update_workspace_bar(self, note: _OpenNote):
        if not hasattr(self, "_ws_frame"):
            return
        if note.is_code:
            self._ws_frame.setVisible(False)
            return
        self._ws_frame.setVisible(True)

        try:
            rel_parts = note.path.relative_to(self.vault.vault_root).parts
            breadcrumb_text = " › ".join(rel_parts)
            self._breadcrumb_lbl.setText(f"📁 {breadcrumb_text}")
        except Exception:
            self._breadcrumb_lbl.setText(f"📁 {note.path.name}")

        fm_data, _ = parse_frontmatter(note.frontmatter)
        try:
            rel_path = str(note.path.relative_to(self.vault.vault_root))
        except ValueError:
            rel_path = note.path.name

        ws = self._workspace_manager.detect_for_path(rel_path, fm_data)
        self._current_workspace = ws

        ws_id = ws.get("id", "general")
        if ws_id and ws_id != "general":
            self._ws_badge.setText(f"{ws.get('icon', '📁')} {ws.get('name', '')}")
            self._ws_badge.setVisible(True)
        else:
            self._ws_badge.setVisible(False)

        # Summary text: only show if explicit study properties exist in frontmatter
        has_custom_props = bool(fm_data.get("topic") or fm_data.get("difficulty") or fm_data.get("mastery"))
        if has_custom_props:
            diff = fm_data.get("difficulty", 1)
            stars = "★" * int(diff) + "☆" * (5 - int(diff))
            mastery = int(float(fm_data.get("mastery", 0.0)) * 100)
            status = fm_data.get("status", "learning")
            topic = fm_data.get("topic", "")

            chips = [f"Dificultad: {stars}"]
            if topic:
                chips.append(f"Tema: {topic}")
            chips.append(f"Maestría: {mastery}%")
            chips.append(f"Estado: {status}")
            self._props_summary.setText("  •  ".join(chips))
            self._props_summary.setVisible(True)
        else:
            self._props_summary.setText("")
            self._props_summary.setVisible(False)

        # Rebuild action buttons
        while self._context_actions_lay.count():
            item = self._context_actions_lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        ws_id = ws.get("id", "general")
        buttons = []
        if ws_id == "mathematics":
            buttons = [
                ("∑ Resolver", "solve", "Resolver o simplificar expresión matemática"),
                ("d/dx Derivar", "derive", "Calcular derivada simbólica"),
                ("∫ Integrar", "integrate", "Calcular integral simbólica"),
                ("📈 Graficar", "graph", "Graficar función matemática"),
                ("TeX LaTeX", "latex", "Convertir o formatear expresión a LaTeX"),
                ("⚡ Ejercicio", "exercise", "Generar ejercicio de matemáticas"),
            ]
        elif ws_id == "programming":
            buttons = [
                ("▶ Ejecutar", "run", "Ejecutar código seleccionado en sandbox local"),
                ("🧪 Probar", "test", "Ejecutar o generar pruebas unitarias"),
                ("🐞 Depurar", "debug", "Depurar y analizar errores en el código"),
                ("💡 Explicar", "explain", "Explicar lógica o complejidad del código"),
                ("⚡ Ejercicio", "exercise", "Generar reto de programación"),
            ]
        elif ws_id == "english":
            buttons = [
                ("📖 Vocabulario", "vocabulary", "Extraer y crear ficha de vocabulario"),
                ("🔤 Gramática", "grammar", "Explicar estructura y regla gramatical"),
                ("🎧 Listening", "listening", "Abrir panel de práctica de listening con TTS"),
                ("🎙 Speaking", "speaking", "Abrir panel de práctica de speaking"),
                ("🧩 Cloze", "cloze", "Crear ejercicio de rellenar huecos"),
                ("⚡ Ejercicio", "exercise", "Generar ejercicio de inglés"),
            ]
        else:
            buttons = [
                ("💡 Explicar", "explain", "Explicar concepto detalladamente"),
                ("📑 Resumir", "summarize", "Resumir contenido clave"),
                ("📇 Flashcard", "flashcard", "Crear flashcard de active recall"),
                ("⚡ Ejercicio", "exercise", "Generar ejercicio de repaso"),
            ]

        for label, act_id, tip in buttons:
            btn = QPushButton(label)
            btn.setToolTip(tip)
            btn.setCursor(Qt.PointingHandCursor)
            btn.setStyleSheet(
                f"QPushButton {{ background: #28282e; border: 1px solid {BORDER}; "
                f"border-radius: 4px; color: {TEXT}; font-size: 11px; padding: 2px 8px; }}"
                f"QPushButton:hover {{ background: rgba(124, 90, 240, 0.25); border-color: {ACCENT}; color: #ffffff; }}"
            )
            btn.clicked.connect(lambda _=False, a=act_id: self._trigger_context_action(a))
            self._context_actions_lay.addWidget(btn)

    def _open_properties_dialog(self):
        note = self.current_note()
        if note is None:
            return
        fm_data, _ = parse_frontmatter(note.frontmatter)
        dlg = NotePropertiesDialog(fm_data, note.title, self)
        if dlg.exec():
            new_props = dlg.get_properties()
            note.frontmatter = dump_frontmatter(new_props)
            note.dirty = True
            self._save(self._current)
            self._update_workspace_bar(note)

    def _trigger_context_action(self, action_id: str):
        note = self.current_note()
        if note is None:
            return
        # English audio actions open the dedicated panel directly
        if action_id in ("listening", "speaking"):
            self._open_english_audio(action_id)
            return
        sel = self.current_selection().strip()
        context_text = sel if sel else note.body[:1000]
        fm_data, _ = parse_frontmatter(note.frontmatter)
        meta = {
            "path": str(note.path),
            "title": note.title,
            "workspace": self._current_workspace.get("id", "general") if self._current_workspace else "general",
            "frontmatter": fm_data,
        }
        self.context_action_requested.emit(action_id, context_text, meta)

    def _open_english_audio(self, initial_tab: str = "listening"):
        """Open the English Listening/Speaking panel as a floating dialog."""
        from PySide6.QtWidgets import QDialog, QVBoxLayout
        dlg = QDialog(self)
        dlg.setWindowTitle("Práctica de Inglés — Audio")
        dlg.resize(560, 560)
        lay = QVBoxLayout(dlg)
        lay.setContentsMargins(0, 0, 0, 0)
        panel = EnglishAudioPanel(self.vault.vault_root, dlg)
        if initial_tab == "speaking":
            panel._switch_tab(1)
        lay.addWidget(panel)
        dlg.exec()

    def _build_editor_context_menu(self, menu: QMenu):
        note = self.current_note()
        if note is None or note.is_code:
            return
        ws = self._current_workspace or {}
        ws_id = ws.get("id", "general")

        study_menu = QMenu(f"Acciones de Estudio ({ws.get('name', 'General')})", menu)

        if ws_id == "mathematics":
            study_menu.addAction("∑ Resolver / Simplificar", lambda: self._trigger_context_action("solve"))
            study_menu.addAction("d/dx Derivar expresión", lambda: self._trigger_context_action("derive"))
            study_menu.addAction("∫ Integrar expresión", lambda: self._trigger_context_action("integrate"))
            study_menu.addAction("📈 Graficar función", lambda: self._trigger_context_action("graph"))
            study_menu.addAction("TeX Convertir a LaTeX", lambda: self._trigger_context_action("latex"))
            study_menu.addAction("⚡ Descomponer solución", lambda: self._trigger_context_action("decompose"))
            study_menu.addAction("✔ Verificar razonamiento", lambda: self._trigger_context_action("verify"))
            study_menu.addSeparator()
            study_menu.addAction("⚡ Generar Ejercicio Matemático", lambda: self._trigger_context_action("exercise"))
        elif ws_id == "programming":
            study_menu.addAction("▶ Ejecutar código", lambda: self._trigger_context_action("run"))
            study_menu.addAction("🧪 Generar / Ejecutar Tests", lambda: self._trigger_context_action("test"))
            study_menu.addAction("🐞 Depurar y analizar error", lambda: self._trigger_context_action("debug"))
            study_menu.addAction("💡 Explicar lógica / Complejidad", lambda: self._trigger_context_action("explain"))
            study_menu.addAction("⚡ Optimizar algoritmo", lambda: self._trigger_context_action("optimize"))
            study_menu.addAction("🔀 Generar variante de problema", lambda: self._trigger_context_action("variant"))
            study_menu.addSeparator()
            study_menu.addAction("⚡ Generar Reto de Código", lambda: self._trigger_context_action("exercise"))
        elif ws_id == "english":
            study_menu.addAction("🌐 Traducir selección", lambda: self._trigger_context_action("translate"))
            study_menu.addAction("📖 Extraer a Vocabulario", lambda: self._trigger_context_action("vocabulary"))
            study_menu.addAction("🔤 Explicar Gramática", lambda: self._trigger_context_action("grammar"))
            study_menu.addAction("🧩 Crear ejercicio Cloze", lambda: self._trigger_context_action("cloze"))
            study_menu.addAction("🎧 Generar Audio / Dictado", lambda: self._trigger_context_action("listening"))
            study_menu.addAction("💬 Generar Preguntas de Conversación", lambda: self._trigger_context_action("questions"))
            study_menu.addSeparator()
            study_menu.addAction("⚡ Generar Ejercicio de Inglés", lambda: self._trigger_context_action("exercise"))
        else:
            study_menu.addAction("💡 Explicar concepto", lambda: self._trigger_context_action("explain"))
            study_menu.addAction("📑 Resumir en 5 puntos", lambda: self._trigger_context_action("summarize"))
            study_menu.addAction("📇 Crear Flashcard de Active Recall", lambda: self._trigger_context_action("flashcard"))
            study_menu.addAction("🔍 Extraer Conceptos Clave", lambda: self._trigger_context_action("extract_concepts"))
            study_menu.addAction("❓ Crear Preguntas de Repaso", lambda: self._trigger_context_action("questions"))
            study_menu.addAction("🔗 Vincular con otras notas", lambda: self._trigger_context_action("link_concepts"))
            study_menu.addSeparator()
            study_menu.addAction("⚡ Generar Ejercicio de Práctica", lambda: self._trigger_context_action("exercise"))

        first = menu.actions()[0] if menu.actions() else None
        menu.insertMenu(first, study_menu)
        menu.insertSeparator(first)

    # Default key bindings: {command_id: (default_keys, handler)}
    _DEFAULT_SHORTCUTS = None  # built lazily

    def _get_default_shortcuts(self) -> dict:
        return {
            "palette":       ("Ctrl+P",         self.open_palette),
            "palette_alt":   ("Ctrl+Shift+P",    self.open_palette),
            "close_tab":     ("Ctrl+W",          lambda: self.close_tab(self._current)),
            "save":          ("Ctrl+S",          self.save_current),
            "toggle_task":   ("Ctrl+L",          self.toggle_current_task),
            "bold":          ("Ctrl+B",          self.toggle_bold),
            "italic":        ("Ctrl+I",          self.toggle_italic),
            "toggle_read":   ("Ctrl+E",          lambda: self.set_mode(
                                MODE_READ if self._mode != MODE_READ else MODE_RICH)),
            "insert_table":  ("Ctrl+Shift+T",    lambda: self.insert_table()),
            "daily_note":    ("Ctrl+Shift+D",    self._open_daily_note),
            "hotkeys_dialog":("Ctrl+,",          self._open_hotkeys_dialog),
        }

    def _init_shortcuts(self):
        # Window-level, not WidgetWithChildren: Ctrl+P did nothing whenever
        # the focus sat in the file tree or the assistant, which is exactly
        # where it is right after clicking a note. Qt already switches these
        # off while the notes panel is hidden behind another module.
        overrides = AppConfig.get_hotkeys()
        self._shortcuts = {}

        for cmd_id, (default_keys, handler) in self._get_default_shortcuts().items():
            keys = overrides.get(cmd_id, default_keys)
            if not keys:
                continue
            sc = QShortcut(QKeySequence(keys), self)
            sc.setContext(Qt.WindowShortcut)
            sc.activated.connect(handler)
            self._shortcuts[cmd_id] = sc

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
                self._focus_view()
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
        self._focus_view()

    def _focus_view(self):
        """Give the keyboard to whichever view is on screen. Without this the
        focus stays in the file tree after a click, so typing goes nowhere."""
        widget = self._stack.currentWidget()
        if widget is not None:
            widget.setFocus()

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

    def _mode_for(self, note: _OpenNote):
        """(mode, problem): where the note opens, and why not in the Editor.

        The rich-edit check re-parses the whole note, so it only runs when
        the Editor is the mode being asked for. In Markdown and Lectura the
        answer is not needed, and computing it anyway added a third of a
        second to every note the user opened.
        """
        if note.is_code:
            return MODE_RAW, None
        if self._mode != MODE_RICH:
            return self._mode, None
        # The Editor saves by re-serialising the note; when that trip would
        # lose content, the note is edited as raw markdown instead.
        problem = note.rich_problem()
        return (MODE_RAW if problem else MODE_RICH), problem

    def _view_mode(self) -> int:
        """Which widget is on screen. Read, never recomputed: the answer was
        settled when the note was loaded."""
        return self._active if self.current_note() is not None else self._mode

    def _load_into_view(self, note: _OpenNote):
        mode, problem = self._mode_for(note)
        self._active = mode
        for view in (self._rich, self._raw, self._read):
            view.note_path = note.path
        self._rich.vault_root = self._read.vault_root = self.vault.vault_root
        self._raw.is_code = note.is_code

        self._loading = True
        try:
            if mode == MODE_RAW:
                self._raw.setPlainText(note.body)
            elif mode == MODE_READ:
                body = expand_transclusions(note.body, self._resolve_transclude)
                self._read.load_markdown(prepare_for_reading(body))
            else:
                self._rich.load_markdown(prepare_markdown(note.body))
        finally:
            self._loading = False
        self._stack.setCurrentIndex(mode)

        for b in self._format_btns:
            b.setEnabled(not note.is_code)
        for i, b in enumerate(self._mode_btns):
            # Editor stays offered until the check has actually run: pressing
            # it is what runs it, and an unsafe note bounces back here.
            b.setEnabled(not note.is_code and not (i == MODE_RICH and problem))
            b.setChecked(i == mode)
        self._mode_btns[MODE_RICH].setToolTip(
            f"No disponible para esta nota: {problem}. Se edita en Markdown "
            "para no dañarla." if problem else "Edición con formato, como en Word")
        self._bm_btn.setChecked(self.service.is_bookmarked(note.path))
        self._update_status(note)
        self._update_workspace_bar(note)
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
        text = note.frontmatter + body
        try:
            attachments.fs_path(note.path).write_text(text, encoding="utf-8")
        except Exception as e:
            self._status.setText(f"No se pudo guardar: {e}")
            return
        self.service.note_written(note.path, text)
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
            if hasattr(self, "_ws_frame"):
                self._ws_frame.setVisible(False)
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
        if not self._ensure_editable():
            return
        if self._view_mode() == MODE_RAW:
            self._raw.shift_lines(delta)
            self._raw.setFocus()
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

    def insert_table(self, rows: int = 0, cols: int = 0):
        """Insert a table of the chosen size. With no size, the picker asks."""
        if not self._ensure_editable():
            return
        if not (rows and cols):
            picked = TablePicker(self).pick_over(self._stack)
            if picked is None:
                return
            rows, cols = picked
        if self._view_mode() == MODE_RAW:
            cursor = self._raw.textCursor()
            cursor.movePosition(QTextCursor.EndOfBlock)
            cursor.insertText("\n\n" + new_table(rows, cols) + "\n")
            self._raw.setTextCursor(cursor)
            self._raw.setFocus()
            return
        self._rich.insert_table(rows, cols)

    def _table_view(self):
        """The view holding the table under the caret, in either mode.

        A table is a real grid in the Editor and aligned pipes in Markdown
        mode; both surfaces answer the same table commands, so every command
        works wherever the note happens to be open.
        """
        note = self.current_note()
        if note is None or note.is_code:
            return None
        mode = self._view_mode()
        if mode == MODE_RAW:
            return self._raw if self._raw.in_table() else None
        if mode == MODE_RICH:
            return self._rich if self._rich.current_table() is not None else None
        return None

    def _in_table(self) -> bool:
        return self._table_view() is not None

    def _table_command(self, name: str, *args) -> bool:
        view = self._table_view()
        if view is None:
            return False
        action = getattr(view, name, None)
        if action is None:
            return False
        action(*args)
        view.setFocus()
        return True

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
            body = expand_transclusions(note.body, self._resolve_transclude)
            self._read.load_markdown(prepare_for_reading(body))
        finally:
            self._loading = False
        self._read.verticalScrollBar().setValue(scroll)

    def _open_wikilink(self, target: str):
        """Follow a [[wikilink]] to its note, creating it if it is new.

        Resolution follows Obsidian: an exact title first, then a path
        relative to the vault, then the closest title. A link that points
        nowhere offers to create the note, so writing a link is also how a
        note gets started.
        """
        raw = target.strip()
        if not raw:
            return
        wanted = raw.lower()
        notes = self.service.index.cached_notes() or self.vault.all_notes()
        by_title = {}
        for n in notes:
            by_title.setdefault(n.title.lower(), n.path)
        hit = by_title.get(wanted)
        if hit is None:
            # "carpeta/Nota" and "Nota.md" both name a file.
            rel = self.vault.vault_root / raw
            for candidate in (rel, rel.with_suffix(".md")):
                if candidate.is_file():
                    hit = candidate
                    break
        if hit is None:
            hit = by_title.get(Path(wanted).stem)
        if hit is not None:
            self.open_note(Path(hit))
            return

        current = self.current_path()
        folder = Path(current).parent if current else self.vault.vault_root
        answer = QMessageBox.question(
            self, "La nota no existe",
            f"No hay ninguna nota llamada «{raw}».\n\n¿Crearla en {folder}?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.Yes,
        )
        if answer != QMessageBox.Yes:
            self._status.setText(f"No existe una nota llamada «{raw}».")
            return
        note = self.service.create_note(raw, folder)
        self.service.index.forget(note.path)
        self.open_note(note.path)

    # ── Command palette ───────────────────────────────────────────────────

    def _commands(self) -> list:
        note = lambda: self.current_note() is not None                  # noqa: E731
        editable = lambda: note() and not self.current_note().is_code   # noqa: E731
        table = self._in_table
        raw_table = lambda: (self._table_view() is self._raw              # noqa: E731
                             and self._raw.in_table())
        pinned = lambda: note() and self.current_note().pinned          # noqa: E731

        def table_cmd(name, *args):
            return lambda: self._table_command(name, *args)

        return [
            Command("Insertar tabla…", "Tabla", lambda: self.insert_table(),
                    "Ctrl+Shift+T", editable),
            Command("Añadir fila abajo", "Tabla", table_cmd("table_add_row", False),
                    "Tab en la última celda", table),
            Command("Añadir fila arriba", "Tabla", table_cmd("table_add_row", True),
                    "", table),
            Command("Añadir columna a la derecha", "Tabla",
                    table_cmd("table_add_column", False), "", table),
            Command("Añadir columna a la izquierda", "Tabla",
                    table_cmd("table_add_column", True), "", table),
            Command("Eliminar fila", "Tabla", table_cmd("table_remove_row"), "", table),
            Command("Eliminar columna", "Tabla", table_cmd("table_remove_column"),
                    "", table),
            Command("Eliminar tabla", "Tabla", table_cmd("table_delete"), "", table),
            Command("Alinear la columna a la izquierda", "Tabla",
                    table_cmd("table_set_alignment", "left"), "", raw_table),
            Command("Centrar la columna", "Tabla",
                    table_cmd("table_set_alignment", "center"), "", raw_table),
            Command("Alinear la columna a la derecha", "Tabla",
                    table_cmd("table_set_alignment", "right"), "", raw_table),
            Command("Alinear todas las tablas", "Tabla", self.align_tables,
                    "Tab dentro de una tabla", editable),

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

            Command("Insertar plantilla…", "Plantillas",
                    self._insert_template, "", editable),
            Command("Nueva nota desde plantilla…", "Plantillas",
                    self._new_note_from_template, ""),
            Command("Abrir nota de hoy", "Diario",
                    self._open_daily_note, "Ctrl+Shift+D"),
            Command("Atajos de teclado…", "Configuración",
                    self._open_hotkeys_dialog, "Ctrl+,"),

            Command("Guardar distribución…", "Distribuciones",
                    lambda: self.window().save_layout_dialog(), ""),
            Command("Cargar distribución…", "Distribuciones",
                    lambda: self.window().load_layout_dialog(), ""),
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

    # ── Hotkeys dialog ────────────────────────────────────────────────────

    def _open_hotkeys_dialog(self):
        from PySide6.QtWidgets import (
            QDialog, QTableWidget, QTableWidgetItem, QHeaderView,
            QDialogButtonBox, QKeySequenceEdit,
        )
        from PySide6.QtCore import Qt as _Qt

        overrides = AppConfig.get_hotkeys()
        defaults = self._get_default_shortcuts()

        dlg = QDialog(self)
        dlg.setWindowTitle("Atajos de teclado")
        dlg.resize(520, 400)
        lay = QVBoxLayout(dlg)

        table = QTableWidget(len(defaults), 3)
        table.setHorizontalHeaderLabels(["Comando", "Por defecto", "Atajo personalizado"])
        table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setSelectionBehavior(QTableWidget.SelectRows)

        for row, (cmd_id, (default_key, _)) in enumerate(defaults.items()):
            name_map = {
                "palette": "Abrir Command Palette",
                "palette_alt": "Command Palette (alternativo)",
                "close_tab": "Cerrar pestaña",
                "save": "Guardar",
                "toggle_task": "Marcar/desmarcar casilla",
                "bold": "Negrita",
                "italic": "Cursiva",
                "toggle_read": "Cambiar modo Lectura/Editor",
                "insert_table": "Insertar tabla",
                "daily_note": "Abrir nota de hoy",
                "hotkeys_dialog": "Atajos de teclado",
            }
            table.setItem(row, 0, QTableWidgetItem(name_map.get(cmd_id, cmd_id)))
            table.setItem(row, 1, QTableWidgetItem(default_key))
            current = overrides.get(cmd_id, default_key)
            edit_item = QTableWidgetItem(current)
            edit_item.setData(_Qt.UserRole, cmd_id)
            edit_item.setFlags(edit_item.flags() | _Qt.ItemIsEditable)
            table.setItem(row, 2, edit_item)

        table.setEditTriggers(QTableWidget.DoubleClicked | QTableWidget.EditKeyPressed)
        lay.addWidget(table)

        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel
                                | QDialogButtonBox.Reset)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        btns.button(QDialogButtonBox.Reset).clicked.connect(
            lambda: [table.item(r, 2).setText(
                list(defaults.values())[r][0])
                for r in range(table.rowCount())])
        lay.addWidget(btns)

        if dlg.exec() != QDialog.Accepted:
            return

        # Detect conflicts
        new_overrides = {}
        for row in range(table.rowCount()):
            cmd_id = table.item(row, 2).data(_Qt.UserRole)
            default_key = table.item(row, 1).text()
            custom_key = table.item(row, 2).text().strip()
            if custom_key and custom_key != default_key:
                new_overrides[cmd_id] = custom_key
            elif cmd_id in overrides:
                AppConfig.clear_hotkey(cmd_id)

        for cmd_id, keys in new_overrides.items():
            AppConfig.set_hotkey(cmd_id, keys)

        # Reinit shortcuts
        for sc in self._shortcuts.values():
            sc.setParent(None)
        self._init_shortcuts()

    # ── Templates ─────────────────────────────────────────────────────────

    def _templates_dir(self):
        return AppConfig.get_templates_dir(self.vault.vault_root)

    def _pick_template(self) -> str | None:
        """Show a dialog listing available templates; return expanded text or None."""
        tmpl_dir = self._templates_dir()
        templates = list_templates(tmpl_dir)
        if not templates:
            QMessageBox.information(
                self, "Sin plantillas",
                f"No hay plantillas en:\n{tmpl_dir}\n\n"
                "Crea archivos .md en esa carpeta para usarlos como plantillas.",
            )
            return None
        names = [p.stem for p in templates]
        name, ok = QInputDialog.getItem(
            self, "Insertar plantilla", "Plantilla:", names, 0, False)
        if not ok:
            return None
        chosen = templates[names.index(name)]
        note = self.current_note()
        ctx = {"title": note.title if note else ""}
        return read_and_expand(chosen, ctx)

    def _insert_template(self):
        text = self._pick_template()
        if text is None:
            return
        editor = self._editor()
        cursor = editor.textCursor()
        cursor.insertText(text)

    def _new_note_from_template(self):
        text = self._pick_template()
        if text is None:
            return
        title, ok = QInputDialog.getText(self, "Nueva nota", "Título:")
        if not ok or not title.strip():
            return
        title = title.strip()
        note = self.service.create_note(title)
        note.save(text.replace("{{title}}", title))
        self.open_note_requested.emit(note.path)

    # ── Daily Notes ───────────────────────────────────────────────────────

    def _open_daily_note(self):
        daily_dir = AppConfig.get_daily_notes_dir(self.vault.vault_root)
        tmpl_path = AppConfig.get_daily_notes_template()
        path = open_or_create_today(self.vault.vault_root, daily_dir, tmpl_path)
        self.open_note_requested.emit(path)

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
        # Re-point workspace detection at the new vault; otherwise the study
        # toolbar keeps reading profiles from the previous vault's .notevault.
        self._workspace_manager = WorkspaceManager(vault.vault_root)
        self._current_workspace = self._workspace_manager.get("general")
        self._reordering = True
        while self._tabs.count():
            self._tabs.removeTab(0)
        self._reordering = False
        self._open.clear()
        self._current = -1
        self._show_placeholder(True)
        QTimer.singleShot(0, self._restore_pinned)

    def _resolve_transclude(self, title: str):
        """Return the body of the note with *title*, or None if not found."""
        note = self.vault.resolve_link(title)
        if note is None:
            return None
        try:
            return note.body
        except Exception:
            return None

    def on_note_moved(self, old_path: Path, new_path: Path):
        """Update any open tab whose path matches old_path after a drag-move."""
        old_path = Path(old_path)
        new_path = Path(new_path)
        for i, note in enumerate(self._open):
            if note.path == old_path:
                note.path = new_path
                self._refresh_tab(i)
                return
            # Also handle notes inside a moved folder
            try:
                rel = note.path.relative_to(old_path)
                note.path = new_path / rel
                self._refresh_tab(i)
            except ValueError:
                pass

    def retheme(self):
        """Repaint what the notes panel colours from Python after the theme
        is toggled: the markdown highlighting and the table grids. Nothing is
        reloaded, so an unsaved edit survives the switch."""
        self._raw.retheme()
        for view in (self._rich, self._read):
            # Restyling goes through the document, so it reaches
            # textChanged: without the guard a theme switch marked the open
            # note as edited and queued a save of a file nobody touched.
            blocked = view.blockSignals(True)
            try:
                style_tables(view.document())
            finally:
                view.blockSignals(blocked)

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

    def _open_from_mention(self, path: Path, line: int = 0):
        """A click on a backlink/mention row opens that note and jumps to the
        exact line of the match, so the jump is visible even when the note is
        already open in another tab."""
        self.open_note(Path(path), int(line or 0))


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
        try:
            self.signals.finished.emit(self.generation, linked, unlinked)
        except RuntimeError:
            # The editor closed while the scan was running.
            pass


class _IndexWarmup(QRunnable):
    """Fill the vault text index once, in the background, so the first note
    the user opens does not wait for three thousand files to be read."""

    def __init__(self, service: NotesService):
        super().__init__()
        self.service = service

    def run(self):
        try:
            self.service.index.notes()
        except Exception:
            pass


class _MentionsFooter(QFrame):
    """Linked / unlinked mentions, pinned under every open note.

    The scan reads every note in the vault, so it runs on a worker thread; a
    result that arrives after the user moved to another note is discarded.
    """

    open_requested = Signal(Path, int)   # (note path, line number of the match)

    def __init__(self, service: NotesService, parent=None):
        super().__init__(parent)
        self.service = service
        self._expanded = True
        self._generation = 0
        self._pending = None
        # One worker, and not a child of this widget: a scan that outlives
        # the panel must still have a live sender to emit from, and two
        # scans at once only fight each other over the index.
        self._pool = QThreadPool()
        self._pool.setMaxThreadCount(1)
        self._signals = _MentionsSignals()
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

        self._title = QLabel("Menciones enlazadas")
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
        if self._expanded and self._pending is not None:
            path, self._pending = self._pending, None
            self.load(path)

    def clear(self):
        self._generation += 1
        self._clear_rows()
        self._count.setText("0")

    def _clear_rows(self):
        while self._body.count():
            item = self._body.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def warm_up(self):
        """Read the vault once at start-up, off the UI thread."""
        self._pool.start(_IndexWarmup(self.service))

    def load(self, path: Path):
        self._generation += 1
        if not self._expanded:
            # Collapsed: nothing would be shown, so nothing is scanned.
            self._pending = Path(path)
            return
        self._clear_rows()
        self._count.setText("…")
        self._body.addWidget(self._muted(
            "Buscando menciones en la vault…" if self.service.index.ready
            else "Leyendo la vault por primera vez…"))
        self._pool.start(
            _MentionsJob(self.service, Path(path), self._generation, self._signals)
        )

    def _show_results(self, generation: int, linked, unlinked):
        if generation != self._generation:
            return
        self._clear_rows()
        self._count.setText(str(len(linked)))
        self._add_section(linked, "No hay backlinks todavía.")

        self._body.addSpacing(8)
        sub = QLabel(f"Menciones sin enlazar  ·  {len(unlinked)}")
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
            lambda _=False, p=mention.path, ln=mention.line_no:
                self.open_requested.emit(Path(p), int(ln or 0))
        )
        return btn

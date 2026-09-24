"""Estudio sub-bar of the Notes module.

Shown on the right of the note area while the active note belongs to a study area
(core/practice/study_area.py): the area's daily queue, the ledger of its disciplines and
concepts, and the error log of its subject. «Practicar ahora» opens the exercise in the
notes editor, which shows it in the practice view.
"""

from pathlib import Path

from PySide6.QtCore import QEvent, Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QButtonGroup, QFrame, QHBoxLayout, QPushButton, QStackedWidget, QVBoxLayout, QWidget,
)

from ... import theme
from ....core import vault_format
from ....core.frontmatter_utils import parse_frontmatter
from ....core.practice.recommender import hub_snapshot
from ....core.practice.study_area import detect_study_area
from ....core.workspace_manager import WorkspaceManager
from ..notes.study_queue_panel import StudyQueuePanel
from .error_log_view import ErrorLogView
from .estudio_common import (
    ACCENT, ACCENT_SOFT, BG_PAGE, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, UI_FONT, ElidedLabel,
    label, primary, rgba,
)
from .ledger_view import LedgerView

SIDEBAR_WIDTH = 310
MIN_HOST_WIDTH = SIDEBAR_WIDTH + 460
TAB_TODAY, TAB_LEDGER, TAB_ERRORS = 0, 1, 2
_DATA_DIRS = ("study_attempts_dir", "study_errors_dir", "study_srs_dir")


def _read_frontmatter(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            head = fh.read(4096)
    except OSError:
        return {}
    if not head.startswith("---"):
        return {}
    try:
        fm, _ = parse_frontmatter(head)
    except Exception:
        return {}
    return fm if isinstance(fm, dict) else {}


def _icon_button(text: str, tip: str) -> QPushButton:
    b = QPushButton(text)
    b.setToolTip(tip)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedSize(24, 24)
    b.setStyleSheet(
        f"QPushButton{{background:transparent;border:none;border-radius:5px;color:{TEXT_DIM};"
        f"font-size:13px;min-width:0px;padding:0px;font-family:{UI_FONT};}}"
        f"QPushButton:hover{{background:#26262e;color:{TEXT};}}")
    return b


def _tab_style(b: QPushButton):
    checked = ACCENT if theme.is_light() else ACCENT_SOFT
    b.setStyleSheet(
        f"QPushButton{{background:transparent;border:none;border-radius:6px;color:{TEXT_DIM};"
        f"font-size:12px;min-width:0px;padding:0 10px;font-family:{UI_FONT};}}"
        f"QPushButton:hover{{color:{TEXT};background:#26262e;}}"
        f"QPushButton:checked{{background:{rgba(ACCENT, 0.18)};color:{checked};"
        "font-weight:600;}")


def _tab(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setCheckable(True)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(28)
    _tab_style(b)
    return b


class StudySideBar(QFrame):
    open_note_requested = Signal(Path)

    def __init__(self, vault, parent=None):
        super().__init__(parent)
        self.setObjectName("studySideBar")
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setStyleSheet(
            f"QFrame#studySideBar{{background:{BG_PAGE};border:none;"
            f"border-left:1px solid {BORDER};}}")
        self.setFixedWidth(SIDEBAR_WIDTH)
        self.vault = vault
        self.area = None
        self.snapshot = None
        self._path = None
        self._stamp = None
        self._dismissed: set = set()
        self._host = None
        self._workspaces = WorkspaceManager(vault.vault_root)
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.setInterval(120)
        self._timer.timeout.connect(self._apply_note)
        self._build()
        self.hide()

    # ── Build ─────────────────────────────────────────────────────────────

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        head = QWidget()
        head.setObjectName("studyHead")
        head.setStyleSheet(f"QWidget#studyHead{{background:{BG_PAGE};"
                           f"border-bottom:1px solid {BORDER};}}")
        hl = QVBoxLayout(head)
        hl.setContentsMargins(12, 8, 8, 10)
        hl.setSpacing(6)
        top = QHBoxLayout()
        top.setSpacing(2)
        kicker = label("ESTUDIO", TEXT_DIM, 10, bold=True)
        kicker.setStyleSheet(kicker.styleSheet() + "letter-spacing:1px;")
        top.addWidget(kicker)
        top.addStretch()
        self.refresh_btn = _icon_button("↻", "Actualizar")
        self.refresh_btn.clicked.connect(self.refresh)
        top.addWidget(self.refresh_btn)
        self.close_btn = _icon_button("✕", "Ocultar hasta cambiar de área")
        self.close_btn.clicked.connect(self._dismiss)
        top.addWidget(self.close_btn)
        hl.addLayout(top)
        self.title_lbl = ElidedLabel("", TEXT, 15, bold=True)
        hl.addWidget(self.title_lbl)
        self.subtitle_lbl = label("", TEXT_FAINT, 11)
        hl.addWidget(self.subtitle_lbl)
        hl.addSpacing(2)
        self.practice_btn = primary("▶  Practicar ahora", 32)
        self.practice_btn.setToolTip("Abre el primer ejercicio de la cola de hoy")
        self.practice_btn.clicked.connect(self._practice_now)
        hl.addWidget(self.practice_btn)
        self.player_btn = QPushButton("🎬  Abrir reproductor")
        self.player_btn.setToolTip("Reproductor para tus películas: subtítulos EN/ES, sombra y minería")
        self.player_btn.setCursor(Qt.PointingHandCursor)
        self.player_btn.setFixedHeight(30)
        self.player_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:6px;"
            f"color:{TEXT};font-size:12px;}}QPushButton:hover{{border-color:{TEXT_DIM};}}")
        self.player_btn.clicked.connect(self._open_player)
        self.player_btn.hide()
        hl.addWidget(self.player_btn)
        tabs = QHBoxLayout()
        tabs.setSpacing(4)
        self._tabs = QButtonGroup(self)
        self._tabs.setExclusive(True)
        self.tab_buttons = []
        for i, text in enumerate(("Hoy", "Ledger", "Errores")):
            b = _tab(text)
            self._tabs.addButton(b, i)
            self.tab_buttons.append(b)
            tabs.addWidget(b)
        tabs.addStretch()
        self._tabs.idClicked.connect(self._show_tab)
        hl.addLayout(tabs)
        lay.addWidget(head)

        self.stack = QStackedWidget()
        root = self.vault.vault_root
        self.queue = StudyQueuePanel(root, note_paths=self.vault.note_paths, auto_refresh=False)
        self.queue.practice_requested.connect(self.open_note_requested.emit)
        self.queue.open_note_requested.connect(self.open_note_requested.emit)
        self.ledger = LedgerView()
        self.ledger.practice_requested.connect(self.open_note_requested.emit)
        self.errors = ErrorLogView(root)
        self.errors.open_note_requested.connect(self.open_note_requested.emit)
        self.errors.data_changed.connect(self.refresh)
        for w in (self.queue, self.ledger, self.errors):
            self.stack.addWidget(w)
        lay.addWidget(self.stack, 1)
        self.tab_buttons[TAB_TODAY].setChecked(True)

    def _show_tab(self, index: int):
        self.tab_buttons[index].setChecked(True)
        self.stack.setCurrentIndex(index)

    # ── Context ───────────────────────────────────────────────────────────

    def set_vault(self, vault):
        self.vault = vault
        self._workspaces = WorkspaceManager(vault.vault_root)
        self.queue.vault_root = vault.vault_root
        self.queue._note_paths = vault.note_paths
        self.errors.set_vault(vault.vault_root)
        self.area, self.snapshot, self._stamp = None, None, None
        self._dismissed.clear()
        self.set_note(None)

    def set_note(self, path):
        """The active note changed; the sub-bar follows it (debounced)."""
        self._path = Path(path) if path else None
        self._timer.start()

    def area_for(self, path: Path | None):
        if path is None:
            return None
        is_dir = path.is_dir()
        if not is_dir and path.suffix.lower() not in (".md", ".canvas"):
            return None
        try:
            rel = path.resolve().relative_to(self.vault.vault_root.resolve()).as_posix()
        except (OSError, ValueError):
            return None
        if is_dir:
            rel += "/_"
        fm = _read_frontmatter(path) if not is_dir and path.suffix.lower() == ".md" else {}
        return detect_study_area(rel, fm, self._workspaces.workspaces())

    def _apply_note(self):
        area = self.area_for(self._path)
        changed = area != self.area
        self.area = area
        if area is None or area.key in self._dismissed:
            self.hide()
            return
        self._watch_host()
        if changed or self._data_stamp() != self._stamp or self.snapshot is None:
            self.refresh()
        self._fit()

    def _data_stamp(self):
        out = []
        for key in _DATA_DIRS:
            try:
                out.append((self.vault.vault_root / vault_format.LAYOUT[key]).stat().st_mtime_ns)
            except OSError:
                out.append(0)
        return tuple(out)

    def refresh(self):
        if self.area is None:
            return
        self.snapshot = hub_snapshot(self.vault.vault_root, self.vault.note_paths(),
                                     area=self.area)
        self._stamp = self._data_stamp()
        for w in (self.queue, self.ledger, self.errors):
            w.set_snapshot(self.snapshot)
        area = self.area
        self.title_lbl.set_full_text(area.title)
        self.title_lbl.setToolTip(area.folder or area.subject_title)
        n = len(self.snapshot.exercises)
        sub = area.subject_title if area.title != area.subject_title else "Materia completa"
        self.subtitle_lbl.setText(f"{sub} · {n} ejercicio{'s' if n != 1 else ''}")
        counts = self.snapshot.queue["counts"]
        self.tab_buttons[TAB_TODAY].setText(f"Hoy  {counts['total']}" if counts["total"]
                                            else "Hoy")
        errs = len(self.snapshot.errors)
        self.tab_buttons[TAB_ERRORS].setText(f"Errores  {errs}" if errs else "Errores")
        self.practice_btn.setEnabled(self.queue.first_exercise() is not None)
        self.player_btn.setVisible(area.subject == "english")

    def _open_player(self):
        from ..english.media_player import open_media_player
        open_media_player(None, None, self.vault.vault_root, self.open_note_requested.emit)

    def retheme(self):
        for b in self.tab_buttons:
            _tab_style(b)
        self.refresh()

    def _practice_now(self):
        self.queue.practice_first()

    def _dismiss(self):
        if self.area is not None:
            self._dismissed.add(self.area.key)
        self.hide()

    # ── Width ─────────────────────────────────────────────────────────────

    def _watch_host(self):
        host = self.parentWidget()
        if host is not None and host is not self._host:
            self._host = host
            host.installEventFilter(self)

    def _fit(self):
        host = self.parentWidget()
        wide = host is None or host.width() >= MIN_HOST_WIDTH
        self.setVisible(wide and self.area is not None and self.area.key not in self._dismissed)

    def eventFilter(self, obj, event):
        if obj is self._host and event.type() == QEvent.Resize and self.area is not None:
            self._fit()
        return False

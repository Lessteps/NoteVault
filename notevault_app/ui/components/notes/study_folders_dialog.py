"""
NoteVault Study Folders Dialog
Create the Mathematics / Programming / English study folders from buttons,
so the user never has to make them by hand. Folders are created at the vault
root; nothing is ever overwritten.
"""

from pathlib import Path

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QCheckBox, QWidget,
)
from PySide6.QtCore import Qt, Signal

from ....core.workspace_manager import WorkspaceManager
from ..comun import TEXT, BORDER, TEXT_DIM, TEXT_FAINT, UI_FONT, BG_CARD

ACCENT = "#7c5af0"
BG_DLG = "#1a1a1e"
GREEN  = "#4ade80"

STUDY_IDS = ["mathematics", "programming", "english"]


class _WorkspaceCard(QFrame):
    create_requested = Signal(str)   # ws_id
    open_requested   = Signal(str)   # ws_id

    def __init__(self, ws: dict, exists: bool, parent=None):
        super().__init__(parent)
        self.ws_id = ws["id"]
        self.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};border-radius:8px;}}"
        )
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 12, 14, 12)
        lay.setSpacing(12)

        icon = QLabel(ws.get("icon", "📁"))
        icon.setStyleSheet("font-size:26px;background:transparent;border:none;")
        lay.addWidget(icon)

        text_col = QVBoxLayout()
        text_col.setSpacing(2)
        name = QLabel(ws["name"])
        name.setStyleSheet(f"color:{TEXT};font-size:14px;font-weight:bold;background:transparent;border:none;")
        text_col.addWidget(name)

        self._status = QLabel()
        text_col.addWidget(self._status)
        lay.addLayout(text_col, stretch=1)

        self._btn = QPushButton()
        self._btn.setCursor(Qt.PointingHandCursor)
        self._btn.setFixedWidth(90)
        lay.addWidget(self._btn)

        self.set_exists(exists)
        self._btn.clicked.connect(self._on_click)

    def set_exists(self, exists: bool):
        self._exists = exists
        if exists:
            self._status.setText("✓ Existe")
            self._status.setStyleSheet(f"color:{GREEN};font-size:11px;background:transparent;border:none;")
            self._btn.setText("Abrir")
            self._btn.setStyleSheet(
                f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:5px;"
                f"color:{TEXT_DIM};font-size:12px;padding:6px 0;}}"
                f"QPushButton:hover{{background:#28282e;color:{TEXT};}}"
            )
        else:
            self._status.setText("No existe todavía")
            self._status.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;")
            self._btn.setText("Crear")
            self._btn.setStyleSheet(
                f"QPushButton{{background:{ACCENT};border:none;border-radius:5px;"
                f"color:#fff;font-size:12px;padding:6px 0;}}"
            )

    def _on_click(self):
        if self._exists:
            self.open_requested.emit(self.ws_id)
        else:
            self.create_requested.emit(self.ws_id)


class StudyFoldersDialog(QDialog):
    """Emits open_note_requested(Path) for a folder's index, and
    folders_changed() whenever something is created."""

    open_note_requested = Signal(Path)
    folders_changed = Signal()

    def __init__(self, ws_mgr: WorkspaceManager, parent=None):
        super().__init__(parent)
        self._ws_mgr = ws_mgr
        self.setWindowTitle("Espacios de estudio")
        self.setMinimumWidth(440)
        self.resize(460, 420)
        self.setStyleSheet(
            f"QDialog{{background:{BG_DLG};color:{TEXT};font-family:{UI_FONT};}}"
            f"QLabel{{color:{TEXT};}}"
        )
        self._cards: dict[str, _WorkspaceCard] = {}
        self._init_ui()

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 16, 20, 16)
        root.setSpacing(12)

        hdr = QLabel("🎓 Espacios de estudio")
        hdr.setStyleSheet(f"color:{TEXT};font-size:16px;font-weight:bold;")
        root.addWidget(hdr)

        sub = QLabel(
            "Crea las carpetas de estudio en la raíz de tu vault. Las herramientas "
            "de cada materia se activan al abrir notas dentro de ellas."
        )
        sub.setWordWrap(True)
        sub.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        root.addWidget(sub)

        self._structure_chk = QCheckBox("Crear estructura sugerida (subcarpetas)")
        self._structure_chk.setChecked(True)
        self._structure_chk.setStyleSheet(
            f"QCheckBox{{color:{TEXT_DIM};font-size:12px;}}"
            f"QCheckBox::indicator{{width:15px;height:15px;}}"
        )
        root.addWidget(self._structure_chk)

        for ws_id in STUDY_IDS:
            ws = self._ws_mgr.get(ws_id)
            if not ws:
                continue
            exists = self._ws_mgr.find_existing_folder(ws_id) is not None
            card = _WorkspaceCard(ws, exists)
            card.create_requested.connect(self._create_one)
            card.open_requested.connect(self._open_one)
            self._cards[ws_id] = card
            root.addWidget(card)

        root.addStretch()

        btn_row = QHBoxLayout()
        self._create_all_btn = QPushButton("Crear las tres")
        self._create_all_btn.setCursor(Qt.PointingHandCursor)
        self._create_all_btn.setStyleSheet(
            f"QPushButton{{background:{ACCENT};border:none;border-radius:5px;"
            f"color:#fff;font-size:12px;padding:8px 16px;}}"
        )
        self._create_all_btn.clicked.connect(self._create_all)
        btn_row.addWidget(self._create_all_btn)
        btn_row.addStretch()

        close = QPushButton("Cerrar")
        close.setCursor(Qt.PointingHandCursor)
        close.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT_DIM};font-size:12px;padding:8px 16px;}}"
            f"QPushButton:hover{{background:#28282e;color:{TEXT};}}"
        )
        close.clicked.connect(self.accept)
        btn_row.addWidget(close)
        root.addLayout(btn_row)

    def _create_one(self, ws_id: str):
        result = self._ws_mgr.ensure_folder(ws_id, self._structure_chk.isChecked())
        if ws_id in self._cards:
            self._cards[ws_id].set_exists(True)
        self.folders_changed.emit()
        if result.get("index"):
            self.open_note_requested.emit(result["index"])

    def _open_one(self, ws_id: str):
        folder = self._ws_mgr.find_existing_folder(ws_id)
        if folder:
            index = folder / "00 Índice.md"
            if index.exists():
                self.open_note_requested.emit(index)

    def _create_all(self):
        last_index = None
        for ws_id in STUDY_IDS:
            if self._ws_mgr.find_existing_folder(ws_id) is None:
                result = self._ws_mgr.ensure_folder(ws_id, self._structure_chk.isChecked())
                if ws_id in self._cards:
                    self._cards[ws_id].set_exists(True)
                if result.get("index"):
                    last_index = result["index"]
        self.folders_changed.emit()
        if last_index:
            self.open_note_requested.emit(last_index)

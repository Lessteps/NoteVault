"""Unresolved error records (the English error log) of the current subject."""

from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHBoxLayout, QPlainTextEdit, QVBoxLayout, QWidget

from ... import theme
from ....core import vault_format
from ....core.practice.error_log import write_error_digest
from ....core.practice.recommender import REPEAT_THRESHOLD, skill_label
from ....core.study_error_manager import StudyErrorManager
from .estudio_common import (
    AMBER, BORDER, RED, TEXT, TEXT_DIM, TEXT_FAINT, badge, card, clear, ghost, inline, label,
    scroll_column,
)


def _recency(err: dict) -> str:
    return err.get("last_seen") or err.get("occurred_at") or ""


class ErrorLogView(QWidget):
    open_note_requested = Signal(Path)
    data_changed = Signal()

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.setObjectName("errorLogView")
        self.vault_root = Path(vault_root)
        self._snapshot = None
        self.resolve_buttons: dict = {}
        col = scroll_column(self)
        top = QHBoxLayout()
        self.stats_lbl = label("", TEXT_FAINT, 11, wrap=True)
        top.addWidget(self.stats_lbl, 1)
        self.digest_btn = ghost("ERROR_LOG.md", 24)
        self.digest_btn.setCheckable(True)
        self.digest_btn.setToolTip("El resumen en inglés que leen las IA antes de corregir")
        self.digest_btn.toggled.connect(self._toggle_digest)
        top.addWidget(self.digest_btn, 0, Qt.AlignTop)
        col.addLayout(top)
        self.digest = QPlainTextEdit()
        self.digest.setReadOnly(True)
        self.digest.setMinimumHeight(240)
        self.digest.setStyleSheet(
            f"QPlainTextEdit{{background:#1c1c20;border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-family:{theme.CODE_FONT_FAMILY};font-size:11px;padding:6px;}}")
        self.digest.hide()
        col.addWidget(self.digest)
        self._list = QVBoxLayout()
        self._list.setSpacing(8)
        col.addLayout(self._list)
        col.addStretch(1)

    def set_vault(self, vault_root: Path):
        self.vault_root = Path(vault_root)

    def set_snapshot(self, snapshot):
        self._snapshot = snapshot
        self._render()
        if self.digest_btn.isChecked():
            self._toggle_digest(True)

    def _toggle_digest(self, on: bool):
        if on:
            path = self.vault_root / vault_format.LAYOUT["study_error_digest"]
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                text = "Todavía no hay ERROR_LOG.md: se genera al corregir el primer intento."
            self.digest.setPlainText(text)
        self.digest.setVisible(on)

    def _render(self):
        clear(self._list)
        self.resolve_buttons = {}
        snap = self._snapshot
        errors = list(snap.errors) if snap else []
        by_id = {e.note_id: e for e in snap.exercises} if snap else {}
        repeated = sum(1 for e in errors if e["repeat_count"] >= REPEAT_THRESHOLD)
        self.stats_lbl.setText(f"{len(errors)} sin resolver · {repeated} repetidos")
        if not errors:
            empty = card("estudioEmpty")
            el = QVBoxLayout(empty)
            el.setContentsMargins(14, 16, 14, 16)
            msg = label("No hay errores sin resolver en esta materia.", TEXT_DIM, 12, wrap=True)
            msg.setAlignment(Qt.AlignCenter)
            el.addWidget(msg)
            self._list.addWidget(empty)
            return
        errors.sort(key=_recency, reverse=True)
        errors.sort(key=lambda e: e["repeat_count"], reverse=True)
        for err in errors:
            self._list.addWidget(self._error_card(err, by_id))

    def _error_card(self, err: dict, by_id: dict):
        c = card("errorCard")
        lay = QVBoxLayout(c)
        lay.setContentsMargins(12, 10, 12, 10)
        lay.setSpacing(4)
        top = QHBoxLayout()
        top.setSpacing(6)
        n = err["repeat_count"]
        top.addWidget(badge(f"×{n}", RED if n >= REPEAT_THRESHOLD else AMBER))
        top.addWidget(badge(err["category"], TEXT_DIM))
        top.addStretch()
        lay.addLayout(top)
        ref = by_id.get(err.get("note_id") or err.get("exercise_id") or "")
        if err.get("discipline"):
            lay.addWidget(label(skill_label(err["discipline"],
                                            ref.skill if ref else err.get("skill", "")),
                                TEXT_FAINT, 10, wrap=True))
        if err.get("anchor"):
            lay.addWidget(label(f"«{err['anchor']}»", TEXT, 12, bold=True, wrap=True))
        description = err.get("description_en") or err.get("explanation") or ""
        if description:
            lay.addWidget(label(inline(description), TEXT, 12, wrap=True, rich=True))
        fix = err.get("fix_en") or err.get("expected") or ""
        if fix:
            lay.addWidget(label(inline("**Fix:** " + fix), TEXT_DIM, 11, wrap=True, rich=True))
        note_txt = ref.title if ref else (err.get("note_id") or err.get("topic") or "")
        seen = _recency(err)[:10]
        lay.addWidget(label(f"Visto {seen}" + (f" · {note_txt}" if note_txt else ""),
                            TEXT_FAINT, 10, wrap=True))
        bottom = QHBoxLayout()
        bottom.setSpacing(6)
        bottom.addStretch()
        source = ref.path if ref else (
            self.vault_root / err["source_note"] if err.get("source_note") else None)
        if source is not None and Path(source).exists():
            open_btn = ghost("Abrir ejercicio", 24)
            open_btn.clicked.connect(lambda _c=False, p=source: self.open_note_requested.emit(
                Path(p)))
            bottom.addWidget(open_btn)
        done = ghost("Marcar resuelto", 24)
        done.clicked.connect(lambda _c=False, i=err["id"]: self._resolve(i))
        self.resolve_buttons[err["id"]] = done
        bottom.addWidget(done)
        lay.addLayout(bottom)
        return c

    def _resolve(self, error_id: str):
        StudyErrorManager(self.vault_root).mark_resolved(error_id)
        write_error_digest(self.vault_root)
        self.data_changed.emit()

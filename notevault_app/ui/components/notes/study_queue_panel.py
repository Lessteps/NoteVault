"""Daily study queue shown in the Estudio sub-bar of the Notes module.

Interleaves (across skills) the recommendations of core/practice/recommender.py with the
exercises and concept cards due in SRS. Exercises open in the notes editor, where the
practice view takes over; cards are reviewed right here (question, answer, self-grade).
"""

from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QFrame, QHBoxLayout, QVBoxLayout, QWidget

from ....core.practice import recommender as rc
from ....core.practice.cards import load_card
from ....core.study_srs_manager import StudySRSManager
from ..estudio.estudio_common import (
    ACCENT, ACCENT_SOFT, AMBER, GREEN, RED, TEAL, TEXT, TEXT_DIM, TEXT_FAINT, badge, card,
    clear, exercise_meta, ghost, inline, label, primary, scroll_column, section,
)

KIND_BADGES = {
    rc.REMEDIATION: ("Corregir error", RED),
    rc.INTEGRATION: ("Integración", TEAL),
    rc.REVIEW: ("Repaso de skill", ACCENT_SOFT),
    rc.SRS_EXERCISE: ("Repaso", ACCENT_SOFT),
    rc.SRS_PROOF: ("Demostración", ACCENT_SOFT),
    rc.SRS_CARD: ("Tarjeta", AMBER),
    rc.NEXT_SKILL: ("Siguiente skill", GREEN),
    rc.CONTINUE: ("Práctica", GREEN),
}
CARD_GRADES = (("Otra vez", 1, RED), ("Difícil", 3, AMBER), ("Bien", 4, GREEN),
               ("Fácil", 5, ACCENT_SOFT))


class _CardReview(QWidget):
    """A concept card inside the queue: question first, answer on demand, then a grade."""
    graded = Signal(int)

    def __init__(self, vault_root: Path, item: dict, parent=None):
        super().__init__(parent)
        self.setObjectName("cardReview")
        self.setStyleSheet("QWidget#cardReview{background:transparent;}")
        self.item = item
        self.card = load_card(vault_root, item)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 2, 0, 0)
        lay.setSpacing(6)
        question = self.card.question if self.card else "(la tarjeta ya no existe en la nota)"
        q = label(inline(question), TEXT, 13, wrap=True, rich=True)
        q.setTextInteractionFlags(Qt.TextSelectableByMouse)
        lay.addWidget(q)
        self.answer = label(inline(self.card.answer if self.card else ""), TEXT_DIM, 12,
                            wrap=True, rich=True)
        self.answer.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.answer.hide()
        lay.addWidget(self.answer)
        self.show_btn = ghost("Mostrar respuesta", 26)
        self.show_btn.clicked.connect(self._reveal)
        lay.addWidget(self.show_btn, 0, Qt.AlignLeft)
        grades = QHBoxLayout()
        grades.setSpacing(4)
        self.grade_btns = []
        for text, quality, colour in CARD_GRADES:
            b = ghost(text, 26)
            b.setStyleSheet(b.styleSheet() + f"QPushButton{{color:{colour};padding:0 8px;}}")
            b.clicked.connect(lambda _c=False, q=quality: self.graded.emit(q))
            b.hide()
            self.grade_btns.append(b)
            grades.addWidget(b)
        grades.addStretch()
        lay.addLayout(grades)
        if self.card is None:
            self.show_btn.setEnabled(False)

    def _reveal(self):
        self.answer.show()
        self.show_btn.hide()
        for b in self.grade_btns:
            b.show()


class StudyQueuePanel(QWidget):
    task_started = Signal(dict)
    practice_requested = Signal(Path)
    open_note_requested = Signal(Path)

    def __init__(self, vault_root, parent=None, note_paths=None, auto_refresh=True):
        super().__init__(parent)
        self.setObjectName("studyQueuePanel")
        self.vault_root = Path(vault_root)
        self._note_paths = note_paths
        self._snapshot = None
        self._rows: list[QFrame] = []
        self._counts = {}
        self._build()
        if auto_refresh:
            self.refresh()

    def _build(self):
        col = scroll_column(self)
        self.stats_lbl = label("", TEXT_FAINT, 11, wrap=True)
        col.addWidget(self.stats_lbl)
        self.tasks_container = QWidget()
        self.tasks_container.setObjectName("queueTasks")
        self.tasks_container.setStyleSheet("QWidget#queueTasks{background:transparent;}")
        self.tasks_lay = QVBoxLayout(self.tasks_container)
        self.tasks_lay.setContentsMargins(0, 0, 0, 0)
        self.tasks_lay.setSpacing(8)
        col.addWidget(self.tasks_container)
        self.gaps_title = section("Sin ejercicios todavía")
        col.addWidget(self.gaps_title)
        self.gaps_lay = QVBoxLayout()
        self.gaps_lay.setSpacing(6)
        col.addLayout(self.gaps_lay)
        col.addStretch(1)

    # ── Data ──────────────────────────────────────────────────────────────

    def _paths(self):
        if self._note_paths is not None:
            return self._note_paths()
        from ....core.vault_manager import VaultManager
        return VaultManager(self.vault_root).note_paths()

    def refresh(self):
        self.set_snapshot(rc.hub_snapshot(self.vault_root, self._paths()))

    def set_snapshot(self, snapshot):
        self._snapshot = snapshot
        queue = snapshot.queue
        self._counts = dict(queue["counts"])
        self._show_counts()
        clear(self.tasks_lay)
        self._rows = []
        items = queue["items"]
        if not items:
            empty = card("estudioEmpty")
            el = QVBoxLayout(empty)
            el.setContentsMargins(14, 16, 14, 16)
            msg = label("Todo al día: no hay repasos ni ejercicios recomendados para hoy.",
                        TEXT_DIM, 12, wrap=True)
            msg.setAlignment(Qt.AlignCenter)
            el.addWidget(msg)
            self.tasks_lay.addWidget(empty)
        for item in items:
            row = self._build_row(item)
            self._rows.append(row)
            self.tasks_lay.addWidget(row)

        clear(self.gaps_lay)
        gaps = queue["gaps"]
        self.gaps_title.setVisible(bool(gaps))
        for rec in gaps:
            line = QHBoxLayout()
            line.setSpacing(6)
            dot = label("○", TEXT_FAINT, 10)
            dot.setFixedWidth(10)
            line.addWidget(dot, 0, Qt.AlignTop)
            line.addWidget(label(rec.message, TEXT_DIM, 11, wrap=True), 1)
            self.gaps_lay.addLayout(line)

    def _show_counts(self):
        c = self._counts
        self.stats_lbl.setText(
            f"{c['srs_exercises']} repasos · {c['recommendations']} recomendaciones"
            f" · {c['cards']} tarjetas · {c['total']} tareas hoy")

    def first_exercise(self):
        if not self._snapshot:
            return None
        return next((i.exercise for i in self._snapshot.queue["items"] if i.exercise), None)

    def practice_first(self):
        ex = self.first_exercise()
        if ex is not None:
            self._practice(ex, None)

    # ── Rows ──────────────────────────────────────────────────────────────

    def _build_row(self, item: rc.QueueItem) -> QFrame:
        row = card("queueRow")
        row.setStyleSheet(row.styleSheet() + f"QFrame#queueRow:hover{{border-color:{ACCENT};}}")
        row.item = item
        lay = QVBoxLayout(row)
        lay.setContentsMargins(12, 10, 12, 10)
        lay.setSpacing(4)
        top = QHBoxLayout()
        top.setSpacing(6)
        text, colour = KIND_BADGES.get(item.kind, ("Tarea", TEXT_DIM))
        top.addWidget(badge(text, colour))
        top.addStretch()
        lay.addLayout(top)

        if item.exercise is not None:
            ex = item.exercise
            lay.addWidget(label(ex.title, TEXT, 13, bold=True, wrap=True))
            lay.addWidget(label(exercise_meta(ex), TEXT_DIM, 11, wrap=True))
            lay.addWidget(label(item.reason, TEXT_FAINT, 11, wrap=True))
            btn = primary("Practicar ahora", 28)
            btn.setObjectName("practiceNowBtn")
            btn.clicked.connect(lambda _c=False, e=ex, it=item: self._practice(e, it))
            lay.addWidget(btn, 0, Qt.AlignRight)
        else:
            source = (item.srs_item or {}).get("source_note", "")
            review = _CardReview(self.vault_root, item.srs_item or {})
            kind = review.card.kind if review.card else ""
            head = QHBoxLayout()
            head.addWidget(label(" · ".join(p for p in (Path(source).stem, kind) if p),
                                 TEXT_FAINT, 11, wrap=True), 1)
            open_btn = ghost("Ver nota", 24)
            open_btn.setToolTip("Abrir la nota del concepto")
            open_btn.clicked.connect(
                lambda _c=False, s=source: self.open_note_requested.emit(self.vault_root / s))
            head.addWidget(open_btn, 0, Qt.AlignTop)
            lay.addLayout(head)
            lay.addWidget(review)
            review.graded.connect(lambda q, r=row, it=item: self._grade_card(r, it, q))
        return row

    def _practice(self, ex, item):
        self.task_started.emit({"task_type": item.kind if item else "exercise",
                                "note_id": ex.note_id, "path": str(ex.path)})
        self.practice_requested.emit(Path(ex.path))

    def _grade_card(self, row: QFrame, item: rc.QueueItem, quality: int):
        StudySRSManager(self.vault_root).review(item.srs_item["id"], quality)
        row.hide()
        self.tasks_lay.removeWidget(row)
        row.deleteLater()
        if row in self._rows:
            self._rows.remove(row)
        self._counts["cards"] = max(0, self._counts.get("cards", 1) - 1)
        self._counts["total"] = max(0, self._counts.get("total", 1) - 1)
        self._show_counts()

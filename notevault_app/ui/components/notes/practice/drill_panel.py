"""Fast-calculation sprint: one item at a time, checked locally, no AI."""

import time

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QLineEdit, QStackedWidget,
)
from PySide6.QtCore import Qt, Signal

from .... import theme
from .....core.practice import drills

TEXT = "#dcdde0"
TEXT_DIM = "#888895"
BORDER = "#33333e"
ACCENT = "#7c5af0"
GREEN = "#3fb950"
RED = "#f2555a"
BG_INPUT = "#1c1c20"


def _primary(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(34)
    b.setStyleSheet(
        f"QPushButton{{background:{ACCENT};border:none;border-radius:7px;"
        "color:#ffffff;font-size:13px;font-weight:600;padding:0 18px;}"
        "QPushButton:hover{background:#6a48e0;}"
    )
    return b


class DrillPanel(QWidget):
    started = Signal()
    finished = Signal(object, str)      # GradeResult, transcript of the sprint

    def __init__(self, parent=None):
        super().__init__(parent)
        self._kind = "arithmetic"
        self._count = 20
        self._difficulty = 2
        self._items: list = []
        self._results: list = []
        self._index = 0
        self._item_started = 0.0
        self._build()

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self._pages = QStackedWidget()
        lay.addWidget(self._pages)

        intro = QWidget()
        il = QVBoxLayout(intro)
        il.setContentsMargins(0, 8, 0, 8)
        il.setSpacing(12)
        self._intro_lbl = QLabel("")
        self._intro_lbl.setWordWrap(True)
        self._intro_lbl.setStyleSheet(f"color:{TEXT};font-size:14px;")
        il.addWidget(self._intro_lbl)
        row = QHBoxLayout()
        self._start_btn = _primary("Comenzar sprint")
        self._start_btn.clicked.connect(self.start)
        row.addWidget(self._start_btn)
        row.addStretch()
        il.addLayout(row)
        self._pages.addWidget(intro)

        run = QWidget()
        rl = QVBoxLayout(run)
        rl.setContentsMargins(0, 8, 0, 8)
        rl.setSpacing(10)
        self._progress_lbl = QLabel("")
        self._progress_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:12px;")
        self._prompt_lbl = QLabel("")
        self._prompt_lbl.setWordWrap(True)
        self._prompt_lbl.setStyleSheet(
            f"color:{TEXT};font-size:28px;font-weight:600;"
            f"font-family:{theme.CODE_FONT_FAMILY};padding:10px 0;")
        self._answer = QLineEdit()
        self._answer.setPlaceholderText("Resultado y Enter")
        self._answer.setFixedHeight(40)
        self._answer.setStyleSheet(
            f"QLineEdit{{background:{BG_INPUT};border:1px solid {BORDER};border-radius:7px;"
            f"color:{TEXT};font-size:18px;padding:0 12px;font-family:{theme.CODE_FONT_FAMILY};}}"
            f"QLineEdit:focus{{border-color:{ACCENT};}}"
        )
        self._answer.returnPressed.connect(self._submit_item)
        self._feedback_lbl = QLabel("")
        self._feedback_lbl.setStyleSheet("font-size:13px;")
        for w in (self._progress_lbl, self._prompt_lbl, self._answer, self._feedback_lbl):
            rl.addWidget(w)
        self._pages.addWidget(run)

        done = QWidget()
        dl = QVBoxLayout(done)
        dl.setContentsMargins(0, 8, 0, 8)
        dl.setSpacing(12)
        self._done_lbl = QLabel("")
        self._done_lbl.setWordWrap(True)
        self._done_lbl.setStyleSheet(f"color:{TEXT};font-size:14px;")
        dl.addWidget(self._done_lbl)
        row2 = QHBoxLayout()
        again = _primary("Otro sprint")
        again.clicked.connect(self.start)
        row2.addWidget(again)
        row2.addStretch()
        dl.addLayout(row2)
        self._pages.addWidget(done)

    # ── Public API ────────────────────────────────────────────────────────

    def prepare(self, kind: str, count: int, difficulty: int):
        self._kind = kind if kind in drills.DRILL_KINDS else "arithmetic"
        self._count = max(1, int(count or 20))
        self._difficulty = max(1, min(5, int(difficulty or 2)))
        label = drills.DRILL_KINDS.get(self._kind, self._kind)
        self._intro_lbl.setText(
            f"<b>{self._count} ejercicios de {label}</b> (dificultad {self._difficulty}).<br>"
            "Escribe cada resultado y pulsa <b>Enter</b>. Se comprueba al instante; "
            "al final se guarda tu precisión y tu velocidad.")
        self._pages.setCurrentIndex(0)

    def is_running(self) -> bool:
        return self._pages.currentIndex() == 1

    def start(self):
        self._items = drills.generate(self._kind, self._count, self._difficulty)
        self._results = []
        self._index = 0
        self._pages.setCurrentIndex(1)
        self._feedback_lbl.setText("")
        self._show_item()
        self.started.emit()

    def stop_early(self):
        if self.is_running():
            self._finish()

    # ── Flow ──────────────────────────────────────────────────────────────

    def _show_item(self):
        item = self._items[self._index]
        self._progress_lbl.setText(f"{self._index + 1} / {len(self._items)}")
        self._prompt_lbl.setText(item.prompt)
        self._answer.clear()
        self._answer.setFocus()
        self._item_started = time.monotonic()

    def _submit_item(self):
        given = self._answer.text().strip()
        if not given or not self.is_running():
            return
        item = self._items[self._index]
        ok = drills.check(item, given)
        self._results.append((item, given, ok, time.monotonic() - self._item_started))
        if ok:
            self._feedback_lbl.setText("✓ Correcto")
            self._feedback_lbl.setStyleSheet(f"color:{theme.tint(GREEN)};font-size:13px;")
        else:
            self._feedback_lbl.setText(f"✗ Era {item.answer}")
            self._feedback_lbl.setStyleSheet(f"color:{theme.tint(RED)};font-size:13px;")
        self._index += 1
        if self._index >= len(self._items):
            self._finish()
        else:
            self._show_item()

    def _finish(self):
        for item in self._items[len(self._results):]:
            self._results.append((item, "", False, 0.0))
        result = drills.summarize(self._results)
        right = sum(1 for r in self._results if r[2])
        answered = [r for r in self._results if r[1]]
        avg = (sum(r[3] for r in answered) / len(answered)) if answered else 0.0
        self._done_lbl.setText(
            f"<b>{right} / {len(self._results)} correctas</b> · {result.score} % · "
            f"{avg:.1f} s por ejercicio respondido.")
        self._pages.setCurrentIndex(2)
        transcript = "\n".join(
            f"{item.prompt} = {given or '—'}  {'✓' if ok else '✗ (' + item.answer + ')'}"
            for item, given, ok, _ in self._results)
        self.finished.emit(result, transcript)

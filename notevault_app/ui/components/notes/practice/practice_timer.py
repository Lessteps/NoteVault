"""Countdown, stopwatch and pomodoro timer shown in the practice view header."""

from PySide6.QtWidgets import QWidget, QHBoxLayout, QVBoxLayout, QLabel, QPushButton, QApplication
from PySide6.QtCore import Qt, QTimer, Signal

from .... import theme
from .....core.practice.timer import TimerSpec

TEXT = "#dcdde0"
TEXT_DIM = "#888895"
BORDER = "#33333e"
ACCENT = "#7c5af0"
RED = "#f2555a"
GREEN = "#3fb950"


def _fmt(seconds: int) -> str:
    seconds = max(0, int(seconds))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


class PracticeTimer(QWidget):
    finished = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._spec = TimerSpec("stopwatch", 0, 0)
        self._phase = "work"
        self._phase_elapsed = 0
        self._work_elapsed = 0
        self._announced = False
        self._tick = QTimer(self)
        self._tick.setInterval(1000)
        self._tick.timeout.connect(self._on_tick)
        self._build()
        self._refresh()

    def _build(self):
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(6)

        col = QVBoxLayout()
        col.setSpacing(0)
        self._phase_lbl = QLabel("")
        self._phase_lbl.setAlignment(Qt.AlignRight)
        self._phase_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:10px;")
        self._time_lbl = QLabel("00:00")
        self._time_lbl.setAlignment(Qt.AlignRight)
        col.addWidget(self._phase_lbl)
        col.addWidget(self._time_lbl)
        lay.addLayout(col)

        self._play_btn = self._button("▶", "Iniciar / pausar el cronómetro")
        self._play_btn.clicked.connect(self.toggle)
        self._reset_btn = self._button("↺", "Reiniciar el cronómetro")
        self._reset_btn.clicked.connect(self.reset)
        lay.addWidget(self._play_btn)
        lay.addWidget(self._reset_btn)

    def _button(self, glyph: str, tip: str) -> QPushButton:
        b = QPushButton(glyph)
        b.setToolTip(tip)
        b.setFixedSize(28, 28)
        b.setCursor(Qt.PointingHandCursor)
        b.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};"
            f"border-radius:6px;color:{TEXT};font-size:12px;padding:0;}}"
            f"QPushButton:hover{{border-color:{ACCENT};color:{ACCENT};}}"
        )
        return b

    # ── Public API ────────────────────────────────────────────────────────

    def configure(self, spec: TimerSpec):
        self._tick.stop()
        self._spec = spec
        self.setVisible(spec.kind != "off")
        self.reset()

    def start(self):
        if self._spec.kind == "off" or self._tick.isActive():
            return
        self._tick.start()
        self._refresh()

    def pause(self):
        self._tick.stop()
        self._refresh()

    def toggle(self):
        if self._tick.isActive():
            self.pause()
        else:
            self.start()

    def reset(self):
        self._tick.stop()
        self._phase = "work"
        self._phase_elapsed = 0
        self._work_elapsed = 0
        self._announced = False
        self._refresh()

    def is_running(self) -> bool:
        return self._tick.isActive()

    def elapsed_seconds(self) -> int:
        return self._work_elapsed

    # ── Ticking ───────────────────────────────────────────────────────────

    def _target(self) -> int:
        if self._phase == "break":
            return self._spec.break_seconds
        return self._spec.seconds

    def _on_tick(self):
        self._phase_elapsed += 1
        if self._phase == "work":
            self._work_elapsed += 1
        kind = self._spec.kind
        if kind == "pomodoro" and self._phase_elapsed >= self._target():
            self._phase = "break" if self._phase == "work" else "work"
            self._phase_elapsed = 0
            QApplication.beep()
            if self._phase == "break":
                self.finished.emit()
        elif kind == "countdown" and not self._announced and self._phase_elapsed >= self._target():
            self._announced = True
            QApplication.beep()
            self.finished.emit()
        self._refresh()

    def _refresh(self):
        kind = self._spec.kind
        over = False
        if kind == "stopwatch":
            shown, phase = _fmt(self._phase_elapsed), "Cronómetro"
        elif kind == "pomodoro":
            shown = _fmt(self._target() - self._phase_elapsed)
            phase = "Pomodoro · trabajo" if self._phase == "work" else "Pomodoro · descanso"
        else:
            remaining = self._target() - self._phase_elapsed
            over = remaining < 0
            shown = ("+" + _fmt(-remaining)) if over else _fmt(remaining)
            phase = "Tiempo extra" if over else "Cuenta atrás"
        if not self._tick.isActive() and (self._phase_elapsed or self._work_elapsed):
            phase += " · en pausa"
        colour = RED if over else (GREEN if self._phase == "break" else TEXT)
        self._time_lbl.setText(shown)
        self._time_lbl.setStyleSheet(
            f"color:{theme.tint(colour)};font-size:20px;font-weight:600;"
            f"font-family:{theme.CODE_FONT_FAMILY};")
        self._phase_lbl.setText(phase)
        self._play_btn.setText("❚❚" if self._tick.isActive() else "▶")

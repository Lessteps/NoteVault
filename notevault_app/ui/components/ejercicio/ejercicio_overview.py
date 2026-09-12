"""
Ejercicio — Vista General
GitHub-style heatmap + per-exercise filter + summary stats.
"""

from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QScrollArea, QFrame, QComboBox,
)
from PySide6.QtCore import Qt, Signal

from ....core.exercise_manager import ExerciseManager
from ..habit_tracker.streak_widget import StreakGrid

BG_PAGE  = "#191919"
BG_CARD  = "#202020"
BORDER   = "#2f2f2f"
TEXT     = "#e6e6e6"
TEXT_DIM = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
ORANGE   = "#ff9632"
BLUE     = "#2383e2"
GREEN    = "#4ade80"

DAY_LABELS = {
    "lunes": "Lunes", "martes": "Martes", "miercoles": "Miércoles",
    "jueves": "Jueves", "viernes": "Viernes", "sabado": "Sábado", "domingo": "Domingo",
}


COMBO_SS = (
    f"QComboBox{{background:#252525;border:1px solid {BORDER};"
    f"border-radius:6px;color:{TEXT};font-size:11px;padding:2px 8px;min-width:120px;}}"
    f"QComboBox::drop-down{{border:none;width:18px;}}"
    f"QComboBox QAbstractItemView{{background:#252525;color:{TEXT};"
    f"selection-background-color:{ORANGE};}}"
)

DAY_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


class EjercicioOverview(QWidget):
    def __init__(self, manager: ExerciseManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._year = date.today().year
        self._selected_id: str = ""   # "" = all exercises
        self._init_ui()

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self._page = QVBoxLayout(content)
        self._page.setContentsMargins(20, 18, 20, 20)
        self._page.setSpacing(14)

        scroll.setWidget(content)
        outer.addWidget(scroll)

    def refresh(self):
        while self._page.count():
            item = self._page.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        today = date.today()
        exercises = self.manager.exercises()

        # ── Title ─────────────────────────────────────────────────────────
        title = QLabel("🏋  Vista General — Ejercicio")
        title.setStyleSheet(
            f"color:{TEXT};font-size:22px;font-weight:700;"
            "background:transparent;border:none;"
        )
        self._page.addWidget(title)

        # ── Summary stat cards ────────────────────────────────────────────
        stats_row = QHBoxLayout()
        stats_row.setSpacing(12)

        # Days trained this week
        from datetime import timedelta
        monday = today - timedelta(days=today.weekday())
        week_days_trained = sum(
            1 for i in range(7)
            if (d := monday + timedelta(days=i)) <= today
            and self.manager.day_pct(d) > 0
        )
        month_days_trained = sum(
            1 for d_num in range(1, today.day + 1)
            if self.manager.day_pct(date(today.year, today.month, d_num)) > 0
        )
        year_days_trained = sum(
            1 for pct in self.manager.range_pct_by_day(today.year).values()
            if pct > 0
        )

        for label, val, sub in [
            ("Esta semana", week_days_trained, "días entrenados"),
            ("Este mes", month_days_trained, "días entrenados"),
            (str(today.year), year_days_trained, "días entrenados"),
        ]:
            card = self._stat_card(label, val, sub)
            stats_row.addWidget(card)
        self._page.addLayout(stats_row)

        # ── Heatmap card ──────────────────────────────────────────────────
        heatmap_card = QFrame()
        heatmap_card.setObjectName("notionCard")
        heatmap_card.setStyleSheet(
            f"#notionCard{{background:{BG_CARD};border-radius:12px;}}"
        )
        hm_lay = QVBoxLayout(heatmap_card)
        hm_lay.setContentsMargins(20, 16, 20, 16)
        hm_lay.setSpacing(12)

        # Filter — 7 day dropdowns
        filter_lbl = QLabel("Filtrar por día / ejercicio:")
        filter_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        hm_lay.addWidget(filter_lbl)

        combos_wrap = QWidget()
        combos_wrap.setStyleSheet("background:transparent;")
        combos_lay = QHBoxLayout(combos_wrap)
        combos_lay.setContentsMargins(0, 0, 0, 0)
        combos_lay.setSpacing(8)

        # "Todos" reset combo
        reset_combo = QComboBox()
        reset_combo.setStyleSheet(COMBO_SS)
        reset_combo.addItem("⊙  Todos los días", "")
        reset_combo.currentIndexChanged.connect(
            lambda i, c=reset_combo: self._on_filter(c.currentData()) if i > 0 else self._on_filter("")
        )
        combos_lay.addWidget(reset_combo)

        self._day_combos: list[QComboBox] = []
        for day_key in DAY_ORDER:
            day_exs = [e for e in exercises if e.get("day") == day_key]
            if not day_exs:
                continue
            day_name = DAY_LABELS.get(day_key, day_key)
            cb = QComboBox()
            cb.setStyleSheet(COMBO_SS)
            cb.addItem(f"{day_name} (todos)", "")
            for ex in day_exs:
                cb.addItem(ex["name"], ex["id"])
            cb.currentIndexChanged.connect(
                lambda i, _cb=cb: self._on_filter(_cb.currentData()) if i > 0 else None
            )
            self._day_combos.append(cb)
            combos_lay.addWidget(cb)

        combos_lay.addStretch()
        hm_lay.addWidget(combos_wrap)

        self._streak = StreakGrid("Racha de Ejercicio")
        self._streak.year_changed.connect(self._on_year_changed)
        hm_lay.addWidget(self._streak)
        self._page.addWidget(heatmap_card)

        self._refresh_heatmap()

        # ── Per-exercise breakdown ────────────────────────────────────────
        breakdown_lbl = QLabel("Desglose por ejercicio")
        breakdown_lbl.setStyleSheet(
            f"color:{TEXT};font-size:14px;font-weight:600;"
            "background:transparent;border:none;"
        )
        self._page.addWidget(breakdown_lbl)

        for day_key in ["lunes", "martes", "miercoles", "jueves",
                        "viernes", "sabado", "domingo"]:
            day_exs = [e for e in exercises if e.get("day") == day_key]
            if not day_exs:
                continue
            day_card = self._make_day_breakdown(day_key, day_exs, today)
            self._page.addWidget(day_card)

        self._page.addStretch()

    def _on_filter(self, exercise_id: str):
        self._selected_id = exercise_id
        self._refresh_heatmap()

    def _on_year_changed(self, year: int):
        self._year = year
        self._refresh_heatmap()

    def _refresh_heatmap(self):
        if not hasattr(self, '_streak'):
            return
        if self._selected_id:
            hist = self.manager.exercise_history(self._selected_id, self._year)
            data = {d: 1.0 if done else 0.0 for d, done in hist.items()}
        else:
            data = self.manager.range_pct_by_day(self._year)
        self._streak.set_year_data(self._year, data)

    def _stat_card(self, label: str, val: int, sub: str) -> QFrame:
        card = QFrame()
        card.setAttribute(Qt.WA_StyledBackground, True)
        card.setMinimumHeight(90)
        card.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};"
            "border-radius:10px;}}"
        )
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 12, 16, 12)
        lay.setSpacing(4)
        l = QLabel(label)
        l.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(l)
        v = QLabel(str(val))
        v.setStyleSheet(
            f"color:{ORANGE};font-size:28px;font-weight:700;"
            "background:transparent;border:none;"
        )
        lay.addWidget(v)
        s = QLabel(sub)
        s.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(s)
        return card

    def _make_day_breakdown(self, day_key: str, exercises: list, today: date) -> QFrame:
        card = QFrame()
        card.setAttribute(Qt.WA_StyledBackground, True)
        card.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border-radius:10px;}}"
        )
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)

        day_lbl = QLabel(DAY_LABELS.get(day_key, day_key))
        day_lbl.setStyleSheet(
            f"color:{ORANGE};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        lay.addWidget(day_lbl)

        for ex in exercises:
            eid = ex["id"]
            # Count completions this year
            hist = self.manager.exercise_history(eid, today.year)
            total = len(hist)
            done = sum(1 for v in hist.values() if v)
            pct = done / total if total else 0.0
            color = GREEN if pct >= 1.0 else (ORANGE if pct >= 0.5 else TEXT_DIM)

            row = QHBoxLayout()
            nm = QLabel(f"{ex['name']}")
            nm.setStyleSheet(
                f"color:{TEXT};font-size:12px;background:transparent;border:none;"
            )
            row.addWidget(nm, stretch=1)
            stat = QLabel(f"{done}/{total}  {int(pct * 100)}%")
            stat.setStyleSheet(
                f"color:{color};font-size:12px;font-weight:600;"
                "background:transparent;border:none;"
            )
            row.addWidget(stat)
            lay.addLayout(row)
        return card

    def set_manager(self, manager: ExerciseManager):
        self.manager = manager
        self.refresh()

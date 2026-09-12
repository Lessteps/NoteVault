"""
GitHub-style contribution heatmap widget.
Shows a 7-row × 53-col grid of colored squares for one year.
"""

import calendar
from datetime import date, timedelta
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QGridLayout,
    QFrame, QComboBox, QSizePolicy,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor

BG        = "#191919"
CELL_EMPTY = "#161b22"   # almost black (no data / 0%)
CELL_LOW   = "#216821"   # light green
CELL_MED   = "#2ea043"   # medium green
CELL_HIGH  = "#4ade80"   # bright green (full)
TEXT_DIM   = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
TEXT       = "#e6e6e6"

CELL_SIZE = 13
CELL_GAP  = 3
MONTH_ABBR = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
              "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
DAY_LABELS = ["Lun", "", "Mié", "", "Vie", "", "Dom"]


def _pct_to_color(pct: float) -> str:
    if pct <= 0:
        return CELL_EMPTY
    if pct < 0.4:
        return CELL_LOW
    if pct < 0.8:
        return CELL_MED
    return CELL_HIGH


class _Cell(QFrame):
    def __init__(self, d: date, pct: float, parent=None):
        super().__init__(parent)
        self.setFixedSize(CELL_SIZE, CELL_SIZE)
        self.setAttribute(Qt.WA_StyledBackground, True)
        color = _pct_to_color(pct)
        self.setStyleSheet(
            f"background:{color};border-radius:2px;border:none;"
        )
        self.setToolTip(f"{d.isoformat()}  {int(pct * 100)}%")


class StreakGrid(QWidget):
    """
    Reusable GitHub contribution grid.

    Usage:
        grid = StreakGrid("Habit Streak")
        grid.set_year_data(year, {date: pct_float, ...})
    """

    year_changed = Signal(int)

    def __init__(self, title: str = "Streak", parent=None):
        super().__init__(parent)
        self._title_str = title
        self._year = date.today().year
        self._data: dict[date, float] = {}
        self.setStyleSheet(f"background:{BG};")
        self._build_skeleton()

    def _build_skeleton(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(8)

        # ── Title row ─────────────────────────────────────────────────────
        title_row = QHBoxLayout()
        title_row.setSpacing(12)

        v_head = QVBoxLayout()
        v_head.setSpacing(2)
        self._title_lbl = QLabel(self._title_str)
        self._title_lbl.setStyleSheet(
            f"color:{TEXT};font-size:16px;font-weight:700;"
            "background:transparent;border:none;"
        )
        v_head.addWidget(self._title_lbl)
        self._streak_lbl = QLabel("Racha: 0 días")
        self._streak_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        v_head.addWidget(self._streak_lbl)
        title_row.addLayout(v_head)
        title_row.addStretch()

        self._year_combo = QComboBox()
        self._year_combo.setFixedWidth(80)
        self._year_combo.setStyleSheet(
            f"QComboBox{{background:#252525;border:1px solid #2f2f2f;"
            f"border-radius:6px;color:{TEXT};font-size:12px;padding:2px 8px;}}"
            f"QComboBox::drop-down{{border:none;}}"
            f"QComboBox QAbstractItemView{{background:#252525;color:{TEXT};"
            f"selection-background-color:#2383e2;}}"
        )
        today_y = date.today().year
        for y in range(today_y - 2, today_y + 2):
            self._year_combo.addItem(str(y), y)
        self._year_combo.setCurrentText(str(self._year))
        self._year_combo.currentIndexChanged.connect(self._on_year_changed)
        title_row.addWidget(self._year_combo)
        outer.addLayout(title_row)

        # ── Grid container ────────────────────────────────────────────────
        self._grid_container = QWidget()
        self._grid_container.setStyleSheet("background:transparent;")
        outer.addWidget(self._grid_container)

    def _on_year_changed(self):
        self._year = self._year_combo.currentData()
        self.year_changed.emit(self._year)
        self._rebuild_grid()

    def set_year_data(self, year: int, data: dict):
        """data = {date: float (0.0-1.0)}"""
        self._data = data
        self._year = year
        idx = self._year_combo.findData(year)
        if idx >= 0:
            self._year_combo.blockSignals(True)
            self._year_combo.setCurrentIndex(idx)
            self._year_combo.blockSignals(False)
        self._rebuild_grid()

    def _rebuild_grid(self):
        # Clear old grid
        old = self._grid_container.layout()
        if old:
            while old.count():
                item = old.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
            import shiboken6
            try:
                shiboken6.delete(old)
            except Exception:
                pass

        layout = QVBoxLayout(self._grid_container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        year = self._year
        today = date.today()

        # Build week columns: find Monday of first week containing Jan 1
        jan1 = date(year, 1, 1)
        start = jan1 - timedelta(days=jan1.weekday())  # Monday before/on Jan 1

        # ── Month labels ──────────────────────────────────────────────────
        month_row = QHBoxLayout()
        month_row.setContentsMargins(30, 0, 0, 0)  # indent for day labels
        month_row.setSpacing(0)

        # Calculate month column positions
        col = 0
        prev_month = None
        current = start
        month_cols: list[tuple[int, int]] = []   # (month, col_index)
        weeks = 0
        while current.year <= year or (current.year == year and current.month <= 12):
            if current.year == year and current.month != prev_month:
                month_cols.append((current.month, col))
                prev_month = current.month
                if len(month_cols) == 12:
                    break
            current += timedelta(weeks=1)
            col += 1
            weeks += 1
            if col > 53:
                break

        # Total weeks to display
        dec31 = date(year, 12, 31)
        end = dec31 + timedelta(days=6 - dec31.weekday())
        total_weeks = ((end - start).days // 7) + 1

        for i, (month, col_idx) in enumerate(month_cols):
            next_col = month_cols[i + 1][1] if i + 1 < len(month_cols) else total_weeks
            span = next_col - col_idx
            lbl = QLabel(MONTH_ABBR[month])
            lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:9px;background:transparent;border:none;"
            )
            lbl.setFixedWidth(span * (CELL_SIZE + CELL_GAP))
            month_row.addWidget(lbl)
        month_row.addStretch()
        layout.addLayout(month_row)

        # ── Day labels + grid ─────────────────────────────────────────────
        grid_row = QHBoxLayout()
        grid_row.setSpacing(6)
        grid_row.setContentsMargins(0, 0, 0, 0)

        # Day labels column
        day_col = QVBoxLayout()
        day_col.setSpacing(CELL_GAP)
        day_col.setContentsMargins(0, 0, 0, 0)
        for i in range(7):
            lbl = QLabel(DAY_LABELS[i])
            lbl.setFixedSize(24, CELL_SIZE)
            lbl.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
            lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:8px;background:transparent;border:none;"
            )
            day_col.addWidget(lbl)
        grid_row.addLayout(day_col)

        # Week columns
        streak = 0
        current_streak = 0
        prev_done = False
        current = start
        for week_idx in range(total_weeks):
            week_col = QVBoxLayout()
            week_col.setSpacing(CELL_GAP)
            week_col.setContentsMargins(0, 0, 0, 0)
            for dow in range(7):
                d = current + timedelta(days=dow)
                if d.year == year and d <= today:
                    pct = self._data.get(d, 0.0)
                    cell = _Cell(d, pct)
                    # Streak calculation
                    if d == today or d == today - timedelta(days=1):
                        if pct >= 1.0:
                            current_streak += 1
                else:
                    cell = QFrame()
                    cell.setFixedSize(CELL_SIZE, CELL_SIZE)
                    if d.year == year:
                        cell.setStyleSheet(
                            "background:#111111;border-radius:2px;border:none;"
                        )
                    else:
                        cell.setStyleSheet(
                            "background:transparent;border:none;"
                        )
                week_col.addWidget(cell)
            grid_row.addLayout(week_col)
            current += timedelta(weeks=1)

        grid_row.addStretch()
        layout.addLayout(grid_row)

        # Compute real streak (consecutive days with pct > 0, ending today)
        streak_count = 0
        check = today
        while True:
            pct = self._data.get(check, 0.0)
            if pct > 0 and check.year == year:
                streak_count += 1
                check -= timedelta(days=1)
            else:
                break
        self._streak_lbl.setText(f"Racha: {streak_count} día{'s' if streak_count != 1 else ''}")

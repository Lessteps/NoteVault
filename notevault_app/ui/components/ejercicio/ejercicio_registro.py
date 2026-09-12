"""
Ejercicio — Registro (database-style weekly log).
Navigate week by week; each day is a collapsible section so the whole
week fits on screen without scrolling.
"""

from datetime import date, timedelta
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QScrollArea, QFrame, QCheckBox, QLineEdit, QSizePolicy, QLayout,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QDoubleValidator, QIntValidator

from ....core.exercise_manager import ExerciseManager

BG_PAGE    = "#191919"
BG_CARD    = "#202020"
BORDER     = "#2f2f2f"
TEXT       = "#e6e6e6"
TEXT_DIM   = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
ORANGE     = "#ff9632"
GREEN      = "#4ade80"
RED        = "#f2555a"

DAY_KEYS   = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
DAY_LABELS = {
    "lunes": "Lunes", "martes": "Martes", "miercoles": "Miércoles",
    "jueves": "Jueves", "viernes": "Viernes", "sabado": "Sábado", "domingo": "Domingo",
}


def _input(placeholder: str, width: int, validator=None) -> QLineEdit:
    e = QLineEdit()
    e.setPlaceholderText(placeholder)
    if width > 0:
        e.setFixedWidth(width)
    else:
        # width 0 means 'take the remaining space' (notes column)
        e.setMinimumWidth(140)
        e.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
    e.setFixedHeight(26)
    e.setStyleSheet(
        f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:5px;"
        f"color:{TEXT};font-size:12px;padding:0 6px;}}"
        f"QLineEdit:focus{{border-color:{ORANGE};}}"
    )
    if validator:
        e.setValidator(validator)
    return e


def _nav_btn(label: str) -> QPushButton:
    btn = QPushButton(label)
    btn.setFixedHeight(30)
    btn.setCursor(Qt.PointingHandCursor)
    btn.setStyleSheet(
        f"QPushButton{{background:#252525;border:1px solid {BORDER};"
        f"border-radius:6px;color:{TEXT_DIM};font-size:12px;padding:0 14px;}}"
        f"QPushButton:hover{{color:{TEXT};border-color:{ORANGE};}}"
    )
    return btn


class EjercicioRegistro(QWidget):
    def __init__(self, manager: ExerciseManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._week_offset = 0        # 0 = current week, -1 = previous, etc.
        self._open_days: set = set() # day keys whose table is unfolded
        self._init_open_days()
        self._init_ui()

    def _init_open_days(self):
        """Start with today's day open (or Monday when browsing another week)."""
        self._open_days = {DAY_KEYS[date.today().weekday()]}

    # ── UI scaffolding ────────────────────────────────────────────────────

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        self._content = QWidget()
        self._content.setStyleSheet(f"background:{BG_PAGE};")
        self._page = QVBoxLayout(self._content)
        self._page.setContentsMargins(20, 18, 20, 20)
        self._page.setSpacing(10)
        self._page.setSizeConstraint(QLayout.SetMinimumSize)

        scroll.setWidget(self._content)
        outer.addWidget(scroll)

    def _monday_of_week(self) -> date:
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        return monday + timedelta(weeks=self._week_offset)

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self):
        while self._page.count():
            item = self._page.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear_layout(item.layout())

        monday = self._monday_of_week()
        sunday = monday + timedelta(days=6)

        # ── Title + week nav ──────────────────────────────────────────────
        nav_row = QHBoxLayout()
        title = QLabel("📋  Registro de Ejercicios")
        title.setStyleSheet(
            f"color:{TEXT};font-size:20px;font-weight:700;"
            "background:transparent;border:none;"
        )
        nav_row.addWidget(title)
        nav_row.addStretch()

        for label, delta in [("← Anterior", -1), ("Hoy", None), ("Siguiente →", 1)]:
            btn = _nav_btn(label)
            if delta is not None:
                btn.clicked.connect(lambda _, d=delta: self._shift(d))
            else:
                btn.clicked.connect(self._go_today)
            nav_row.addWidget(btn)

        self._page.addLayout(nav_row)

        # ── Week label + expand / collapse all ────────────────────────────
        sub_row = QHBoxLayout()
        week_lbl = QLabel(
            f"Semana del {monday.strftime('%d/%m/%Y')} al {sunday.strftime('%d/%m/%Y')}"
        )
        week_lbl.setStyleSheet(
            f"color:{ORANGE};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        sub_row.addWidget(week_lbl)
        sub_row.addStretch()

        exp_all = _nav_btn("⤢  Expandir todo")
        exp_all.clicked.connect(self._expand_all)
        sub_row.addWidget(exp_all)

        col_all = _nav_btn("⤡  Contraer todo")
        col_all.clicked.connect(self._collapse_all)
        sub_row.addWidget(col_all)

        self._page.addLayout(sub_row)

        # ── One collapsible section per day ───────────────────────────────
        today = date.today()
        for i, day_key in enumerate(DAY_KEYS):
            day_date = monday + timedelta(days=i)
            exercises = self.manager.exercises_for_day(day_key)
            if not exercises:
                continue
            self._page.addWidget(
                self._make_day_card(day_key, day_date, exercises, today)
            )

        self._page.addStretch()
        self._content.adjustSize()

    def _make_day_card(self, day_key: str, day_date: date,
                       exercises: list, today: date) -> QFrame:
        log = self.manager.get_log(day_date)
        is_future = day_date > today
        is_open = day_key in self._open_days
        is_today = day_date == today

        card = QFrame()
        card.setObjectName("dayCard")
        card.setAttribute(Qt.WA_StyledBackground, True)
        card.setStyleSheet(
            f"QFrame#dayCard{{background:{BG_CARD};border-radius:12px;"
            f"border:1px solid {ORANGE if is_today else BORDER};}}"
        )
        lay = QVBoxLayout(card)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        # ── Clickable day header ─────────────────────────────────────────
        ids = [e["id"] for e in exercises]
        pct = log.completion_pct(ids)
        done_count = sum(1 for eid in ids if log.is_done(eid))

        header = QPushButton()
        header.setCursor(Qt.PointingHandCursor)
        header.setFixedHeight(40)
        radius = "12px" if not is_open else "12px 12px 0 0"
        header.setStyleSheet(
            f"QPushButton{{background:#1a1a1a;border:none;border-radius:{radius};"
            "text-align:left;}"
            "QPushButton:hover{background:#202028;}"
        )
        h_lay = QHBoxLayout(header)
        h_lay.setContentsMargins(14, 0, 16, 0)
        h_lay.setSpacing(10)

        arrow = QLabel("▾" if is_open else "▸")
        arrow.setFixedWidth(14)
        arrow.setStyleSheet(
            f"color:{ORANGE};font-size:12px;background:transparent;border:none;"
        )
        h_lay.addWidget(arrow)

        day_lbl = QLabel(
            f"{DAY_LABELS.get(day_key, day_key)}  "
            f"<span style='color:{TEXT_FAINT};font-size:11px;'>"
            f"{day_date.strftime('%d %b %Y')}</span>"
        )
        day_lbl.setTextFormat(Qt.RichText)
        day_lbl.setStyleSheet(
            f"color:{ORANGE};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        h_lay.addWidget(day_lbl)

        if is_today:
            hoy = QLabel("HOY")
            hoy.setStyleSheet(
                f"color:#101010;background:{ORANGE};border:none;border-radius:4px;"
                "font-size:9px;font-weight:700;padding:2px 6px;"
            )
            h_lay.addWidget(hoy)

        h_lay.addStretch()

        # Mini progress bar
        bar_bg = QFrame()
        bar_bg.setAttribute(Qt.WA_StyledBackground, True)
        bar_bg.setFixedSize(70, 5)
        bar_bg.setStyleSheet("background:#2c2c2c;border:none;border-radius:3px;")
        bar_lay = QHBoxLayout(bar_bg)
        bar_lay.setContentsMargins(0, 0, 0, 0)
        fill = QFrame()
        fill.setAttribute(Qt.WA_StyledBackground, True)
        fill.setFixedSize(max(1, int(70 * pct)), 5)
        fill.setStyleSheet(
            f"background:{GREEN if pct >= 1.0 else ORANGE};border:none;border-radius:3px;"
        )
        bar_lay.addWidget(fill)
        bar_lay.addStretch()
        h_lay.addWidget(bar_bg)

        badge_color = GREEN if pct >= 1.0 else (ORANGE if pct > 0 else TEXT_FAINT)
        badge = QLabel(f"{done_count}/{len(ids)}")
        badge.setFixedWidth(42)
        badge.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        badge.setStyleSheet(
            f"color:{badge_color};font-size:12px;font-weight:600;"
            "background:transparent;border:none;"
        )
        h_lay.addWidget(badge)

        if is_future:
            future_lbl = QLabel("⏳")
            future_lbl.setToolTip("Día futuro — solo lectura")
            future_lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
            )
            h_lay.addWidget(future_lbl)

        header.clicked.connect(lambda _, k=day_key: self._toggle_day(k))
        lay.addWidget(header)

        if not is_open:
            return card

        # ── Column header ─────────────────────────────────────────────────
        col_hdr = QFrame()
        col_hdr.setAttribute(Qt.WA_StyledBackground, True)
        col_hdr.setFixedHeight(28)
        col_hdr.setStyleSheet(
            f"background:#161616;border:none;border-top:1px solid {BORDER};"
        )
        ch_lay = QHBoxLayout(col_hdr)
        ch_lay.setContentsMargins(16, 0, 16, 0)
        ch_lay.setSpacing(0)
        for txt, w, align in [
            ("✓",         32,  Qt.AlignCenter),
            ("EJERCICIO", 200, Qt.AlignLeft),
            ("SERIES×REP", 110, Qt.AlignCenter),
            ("PESO (kg)", 80,  Qt.AlignCenter),
            ("REPS",      70,  Qt.AlignCenter),
            ("NOTAS",     0,   Qt.AlignLeft),
        ]:
            lbl = QLabel(txt)
            if w:
                lbl.setFixedWidth(w)
            lbl.setAlignment(align | Qt.AlignVCenter)
            lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:9px;font-weight:600;"
                "letter-spacing:0.8px;background:transparent;border:none;"
            )
            ch_lay.addWidget(lbl)
        lay.addWidget(col_hdr)

        # ── Exercise rows ─────────────────────────────────────────────────
        for idx, ex in enumerate(exercises):
            lay.addWidget(self._make_ex_row(ex, idx, log, day_date, is_future))

        return card

    def _make_ex_row(self, ex: dict, idx: int, log, day_date: date,
                     is_future: bool) -> QFrame:
        eid = ex["id"]
        entry = log.entries.get(eid, {})
        is_done = entry.get("done", False)
        is_alt = idx % 2 == 1

        row = QFrame()
        row.setAttribute(Qt.WA_StyledBackground, True)
        bg = "#0d1f0d" if is_done else ("#1c1c1c" if is_alt else BG_CARD)
        row.setStyleSheet(
            f"QFrame{{background:{bg};border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(row)
        lay.setContentsMargins(16, 8, 16, 8)
        lay.setSpacing(0)
        lay.setAlignment(Qt.AlignVCenter)

        cb = QCheckBox()
        cb.setChecked(is_done)
        cb.setFixedWidth(32)
        cb.setEnabled(not is_future)
        cb.setStyleSheet(
            f"QCheckBox::indicator{{width:16px;height:16px;border-radius:3px;"
            f"border:2px solid {'#4ade80' if is_done else '#6a6a72'};}}"
            f"QCheckBox::indicator:checked{{background:#4ade80;border-color:#4ade80;}}"
        )

        name_lbl = QLabel(ex["name"])
        name_lbl.setFixedWidth(200)
        name_lbl.setWordWrap(True)
        name_lbl.setStyleSheet(
            f"color:{GREEN if is_done else TEXT};font-size:12px;"
            "background:transparent;border:none;"
        )

        sets_lbl = QLabel(ex.get("series_reps", ""))
        sets_lbl.setFixedWidth(110)
        sets_lbl.setAlignment(Qt.AlignCenter | Qt.AlignVCenter)
        sets_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )

        weight_in = _input("kg", 70, QDoubleValidator(0, 500, 1))
        weight_in.setText(str(entry.get("weight", "")) if entry.get("weight") else "")
        weight_in.setEnabled(not is_future)

        reps_in = _input("reps", 60, QIntValidator(0, 999))
        reps_in.setText(str(entry.get("reps", "")) if entry.get("reps") else "")
        reps_in.setEnabled(not is_future)

        notes_in = _input("Notas...", 0, None)
        notes_in.setText(entry.get("notes", ""))
        notes_in.setEnabled(not is_future)

        lay.addWidget(cb)
        lay.addWidget(name_lbl)
        lay.addWidget(sets_lbl)
        lay.addWidget(weight_in)
        lay.addSpacing(10)
        lay.addWidget(reps_in)
        lay.addSpacing(10)
        lay.addWidget(notes_in, stretch=1)

        def _save(_eid=eid, _cb=cb, _w=weight_in, _r=reps_in, _n=notes_in,
                  _row=row, _name=name_lbl, _d=day_date):
            done = _cb.isChecked()
            try:
                weight = float(_w.text()) if _w.text() else 0.0
            except ValueError:
                weight = 0.0
            try:
                reps = int(_r.text()) if _r.text() else 0
            except ValueError:
                reps = 0
            self.manager.mark_done(_d, _eid, done, weight, reps, _n.text())
            color = GREEN if done else TEXT
            _name.setStyleSheet(
                f"color:{color};font-size:12px;background:transparent;border:none;"
            )
            done_bg = "#0d1f0d" if done else ("#1c1c1c" if idx % 2 == 1 else BG_CARD)
            _row.setStyleSheet(
                f"QFrame{{background:{done_bg};border-bottom:1px solid {BORDER};}}"
            )
            cb_border = "#4ade80" if done else "#6a6a72"
            _cb.setStyleSheet(
                f"QCheckBox::indicator{{width:16px;height:16px;border-radius:3px;"
                f"border:2px solid {cb_border};}}"
                f"QCheckBox::indicator:checked{{background:#4ade80;border-color:#4ade80;}}"
            )

        cb.stateChanged.connect(lambda _: _save())
        weight_in.editingFinished.connect(_save)
        reps_in.editingFinished.connect(_save)
        notes_in.editingFinished.connect(_save)
        return row

    # ── Interaction ───────────────────────────────────────────────────────

    def _toggle_day(self, day_key: str):
        if day_key in self._open_days:
            self._open_days.discard(day_key)
        else:
            self._open_days.add(day_key)
        self.refresh()

    def _expand_all(self):
        self._open_days = set(DAY_KEYS)
        self.refresh()

    def _collapse_all(self):
        self._open_days = set()
        self.refresh()

    def _shift(self, delta: int):
        self._week_offset += delta
        self.refresh()

    def _go_today(self):
        self._week_offset = 0
        self._init_open_days()
        self.refresh()

    def _clear_layout(self, layout):
        while layout.count():
            item = layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear_layout(item.layout())

    def set_manager(self, manager: ExerciseManager):
        self.manager = manager
        self.refresh()

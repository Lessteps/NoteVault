"""
Habit Tracker — Gestionar Hábitos
Add / remove habits, choose the weekdays each habit is active on and
manage its subtasks. Changes propagate via the habits_changed signal.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QScrollArea, QFrame, QLayout,
)
from PySide6.QtCore import Qt, Signal

from ....core.habit_manager import HabitManager, habit_days, DAY_INITIALS
from .notion_widgets import (
    card_frame, SectionHeader,
    BG_PAGE, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE,
)

ICON_OPTIONS = [
    "🛏", "🍽", "💧", "◉", "🏋", "📖", "✏", "☑",
    "🧘", "🏃", "💊", "🎯", "🧠", "🌿", "🎵", "🔥",
    "⭐", "💪", "🍎", "😴", "🚿", "☕", "🧹", "🛁",
    "📵", "🪥", "🚫", "🧴", "💆", "💻", "📝", "🌙",
]


class _DayToggle(QPushButton):
    """Small square L M X J V S D toggle."""

    def __init__(self, initial: str, active: bool, parent=None):
        super().__init__(initial, parent)
        self.setCheckable(True)
        self.setChecked(active)
        self.setFixedSize(26, 24)
        self.setCursor(Qt.PointingHandCursor)
        self.setStyleSheet(
            f"QPushButton{{background:#1e1e1e;border:1px solid {BORDER};"
            f"border-radius:5px;color:{TEXT_FAINT};font-size:11px;font-weight:600;}}"
            f"QPushButton:hover{{border-color:{BLUE};}}"
            f"QPushButton:checked{{background:{BLUE};border-color:{BLUE};"
            "color:#ffffff;}"
        )


def _small_btn(text: str, color: str = TEXT_DIM) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(24)
    b.setStyleSheet(
        f"QPushButton{{background:#1e1e1e;border:1px solid {BORDER};"
        f"border-radius:5px;color:{color};font-size:11px;padding:0 10px;}}"
        f"QPushButton:hover{{border-color:{BLUE};color:{TEXT};}}"
    )
    return b


def _line_edit(placeholder: str, height: int = 30) -> QLineEdit:
    e = QLineEdit()
    e.setPlaceholderText(placeholder)
    e.setFixedHeight(height)
    e.setStyleSheet(
        f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
        f"color:{TEXT};font-size:12px;padding:0 10px;}}"
        f"QLineEdit:focus{{border-color:{BLUE};}}"
    )
    return e


class HabitManageView(QWidget):
    habits_changed = Signal()

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._selected_icon = ICON_OPTIONS[0]
        self._icon_btns: list = []
        self._new_days: set = set(range(7))
        self._expanded: set = set()      # habit ids whose detail panel is open
        self._init_ui()

    # ── UI scaffolding ────────────────────────────────────────────────────

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = self._scroll_content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(20, 18, 20, 20)
        page.setSpacing(14)
        page.setSizeConstraint(QLayout.SetMinimumSize)

        # ── Card 1: existing habits ───────────────────────────────────────
        list_card = card_frame()
        list_lay = QVBoxLayout(list_card)
        list_lay.setContentsMargins(22, 18, 22, 18)
        list_lay.setSpacing(8)
        list_lay.addWidget(SectionHeader("📋", "Hábitos actuales"))

        hint = QLabel(
            "Pulsa ⚙ en un hábito para elegir sus días y añadir subtareas."
        )
        hint.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        list_lay.addWidget(hint)

        self._habit_list = QVBoxLayout()
        self._habit_list.setSpacing(6)
        list_lay.addLayout(self._habit_list)
        page.addWidget(list_card)

        # ── Card 2: add new habit ─────────────────────────────────────────
        add_card = card_frame()
        add_lay = QVBoxLayout(add_card)
        add_lay.setContentsMargins(22, 18, 22, 18)
        add_lay.setSpacing(12)
        add_lay.addWidget(SectionHeader("➕", "Añadir nuevo hábito"))

        ico_lbl = QLabel("Elige un icono")
        ico_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )
        add_lay.addWidget(ico_lbl)

        cols = 12
        rows_container = QVBoxLayout()
        rows_container.setSpacing(6)
        current_row_lay = None
        for i, ico in enumerate(ICON_OPTIONS):
            if i % cols == 0:
                row_w = QWidget()
                row_w.setStyleSheet("background:transparent;")
                current_row_lay = QHBoxLayout(row_w)
                current_row_lay.setContentsMargins(0, 0, 0, 0)
                current_row_lay.setSpacing(6)
                rows_container.addWidget(row_w)

            btn = QPushButton(ico)
            btn.setFixedSize(34, 34)
            btn.setCursor(Qt.PointingHandCursor)
            btn.setCheckable(True)
            btn.setChecked(i == 0)
            btn.setStyleSheet(
                f"QPushButton{{background:#252525;border:1px solid {BORDER};"
                "border-radius:6px;font-size:16px;}"
                f"QPushButton:hover{{border-color:{BLUE};}}"
                f"QPushButton:checked{{background:{BLUE};border-color:{BLUE};}}"
            )
            btn.clicked.connect(lambda _, ic=ico, b=btn: self._select_icon(ic, b))
            self._icon_btns.append(btn)
            current_row_lay.addWidget(btn)

        if current_row_lay is not None:
            current_row_lay.addStretch()

        add_lay.addLayout(rows_container)

        # Days for the new habit
        days_lbl = QLabel("Días activos")
        days_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )
        add_lay.addWidget(days_lbl)

        days_row = QHBoxLayout()
        days_row.setSpacing(6)
        for i, ini in enumerate(DAY_INITIALS):
            t = _DayToggle(ini, True)
            t.clicked.connect(
                lambda checked, d=i: (self._new_days.add(d) if checked
                                      else self._new_days.discard(d))
            )
            days_row.addWidget(t)
        days_row.addStretch()
        add_lay.addLayout(days_row)

        # Name
        name_lbl = QLabel("Nombre del hábito")
        name_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )
        add_lay.addWidget(name_lbl)

        self._name_input = QLineEdit()
        self._name_input.setPlaceholderText("Ej: Meditación, Ejercicio, Lectura...")
        self._name_input.setFixedHeight(38)
        self._name_input.setStyleSheet(
            f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-size:14px;padding:0 12px;}}"
            f"QLineEdit:focus{{border-color:{BLUE};}}"
        )
        self._name_input.returnPressed.connect(self._add_habit)
        add_lay.addWidget(self._name_input)

        add_btn = QPushButton("Añadir hábito")
        add_btn.setCursor(Qt.PointingHandCursor)
        add_btn.setFixedHeight(38)
        add_btn.setStyleSheet(
            f"QPushButton{{background:{BLUE};border:none;border-radius:8px;"
            "color:#ffffff;font-size:14px;font-weight:600;}}"
            "QPushButton:hover{background:#1a6fc4;}"
        )
        add_btn.clicked.connect(self._add_habit)
        add_lay.addWidget(add_btn)

        self._status_lbl = QLabel("")
        self._status_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        add_lay.addWidget(self._status_lbl)
        page.addWidget(add_card)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Actions ───────────────────────────────────────────────────────────

    def _select_icon(self, icon: str, clicked: QPushButton):
        self._selected_icon = icon
        for btn in self._icon_btns:
            btn.setChecked(btn is clicked)

    def _add_habit(self):
        name = self._name_input.text().strip()
        if not name:
            self._status_lbl.setText("⚠  Escribe un nombre primero.")
            return
        days = sorted(self._new_days) or list(range(7))
        self.manager.add_habit(name, self._selected_icon, days)
        self._name_input.clear()
        self._status_lbl.setText(f"✓  «{name}» añadido.")
        self.habits_changed.emit()
        self.refresh()

    def _remove_habit(self, habit_id: str):
        self.manager.remove_habit(habit_id)
        self._expanded.discard(habit_id)
        self.habits_changed.emit()
        self.refresh()

    def _toggle_expand(self, habit_id: str):
        if habit_id in self._expanded:
            self._expanded.discard(habit_id)
        else:
            self._expanded.add(habit_id)
        self.refresh()

    def _toggle_day(self, habit: dict, day_index: int, checked: bool):
        days = set(habit_days(habit))
        if checked:
            days.add(day_index)
        else:
            days.discard(day_index)
        if not days:                      # never leave a habit with no days
            days = set(range(7))
        self.manager.set_habit_days(habit["id"], sorted(days))
        self.habits_changed.emit()
        self.refresh()

    def _add_subtask(self, habit_id: str, editor: QLineEdit):
        name = editor.text().strip()
        if not name:
            return
        self.manager.add_subtask(habit_id, name)
        editor.clear()
        self.habits_changed.emit()
        self.refresh()

    def _remove_subtask(self, habit_id: str, subtask_id: str):
        self.manager.remove_subtask(habit_id, subtask_id)
        self.habits_changed.emit()
        self.refresh()

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self):
        while self._habit_list.count():
            item = self._habit_list.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        habits = self.manager.habits()
        for h in habits:
            self._habit_list.addWidget(self._habit_block(h))

        if not habits:
            empty = QLabel("No hay hábitos. Añade el primero abajo.")
            empty.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:13px;background:transparent;border:none;"
            )
            self._habit_list.addWidget(empty)

        self._scroll_content.adjustSize()

    def _habit_block(self, h: dict) -> QWidget:
        hid = h["id"]
        block = QFrame()
        block.setAttribute(Qt.WA_StyledBackground, True)
        block.setStyleSheet("QFrame{background:#252525;border-radius:8px;}")
        blay = QVBoxLayout(block)
        blay.setContentsMargins(0, 0, 0, 0)
        blay.setSpacing(0)

        # ── Header row ────────────────────────────────────────────────────
        row = QWidget()
        row.setFixedHeight(46)
        row.setStyleSheet("background:transparent;")
        rlay = QHBoxLayout(row)
        rlay.setContentsMargins(14, 0, 10, 0)
        rlay.setSpacing(10)

        ico = QLabel(h["icon"])
        ico.setStyleSheet("font-size:16px;background:transparent;border:none;")
        rlay.addWidget(ico)

        nm = QLabel(h["name"])
        nm.setStyleSheet(
            f"font-size:13px;color:{TEXT};background:transparent;border:none;"
        )
        rlay.addWidget(nm, stretch=1)

        # Day summary chip
        days = habit_days(h)
        chip_text = ("Todos los días" if len(days) == 7
                     else " ".join(DAY_INITIALS[d] for d in sorted(days)))
        chip = QLabel(chip_text)
        chip.setStyleSheet(
            f"color:{BLUE};font-size:10px;background:#1e1e1e;border:1px solid {BORDER};"
            "border-radius:5px;padding:3px 8px;"
        )
        rlay.addWidget(chip)

        subs = h.get("subtasks") or []
        if subs:
            sub_chip = QLabel(f"☰ {len(subs)}")
            sub_chip.setStyleSheet(
                f"color:{TEXT_DIM};font-size:10px;background:#1e1e1e;"
                f"border:1px solid {BORDER};border-radius:5px;padding:3px 8px;"
            )
            rlay.addWidget(sub_chip)

        gear = QPushButton("⚙")
        gear.setFixedSize(26, 26)
        gear.setCursor(Qt.PointingHandCursor)
        gear.setStyleSheet(
            "QPushButton{background:transparent;border:none;"
            f"color:{'#2383e2' if hid in self._expanded else '#7a7a86'};font-size:14px;}}"
            f"QPushButton:hover{{color:{BLUE};}}"
        )
        gear.clicked.connect(lambda _, _id=hid: self._toggle_expand(_id))
        rlay.addWidget(gear)

        rm = QPushButton("✕")
        rm.setFixedSize(26, 26)
        rm.setCursor(Qt.PointingHandCursor)
        rm.setStyleSheet(
            "QPushButton{background:transparent;border:none;"
            "color:#555560;font-size:14px;}"
            "QPushButton:hover{color:#f2555a;}"
        )
        rm.clicked.connect(lambda _, _id=hid: self._remove_habit(_id))
        rlay.addWidget(rm)

        blay.addWidget(row)

        # ── Detail panel ──────────────────────────────────────────────────
        if hid in self._expanded:
            blay.addWidget(self._detail_panel(h))

        return block

    def _detail_panel(self, h: dict) -> QWidget:
        hid = h["id"]
        panel = QWidget()
        panel.setStyleSheet("background:transparent;")
        play = QVBoxLayout(panel)
        play.setContentsMargins(14, 0, 14, 14)
        play.setSpacing(8)

        sep = QFrame()
        sep.setFixedHeight(1)
        sep.setStyleSheet(f"background:{BORDER};border:none;")
        play.addWidget(sep)

        # Days
        d_lbl = QLabel("Días activos")
        d_lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;font-weight:600;"
            "letter-spacing:0.6px;background:transparent;border:none;"
        )
        play.addWidget(d_lbl)

        active = set(habit_days(h))
        days_row = QHBoxLayout()
        days_row.setSpacing(6)
        for i, ini in enumerate(DAY_INITIALS):
            t = _DayToggle(ini, i in active)
            t.clicked.connect(
                lambda checked, _h=h, _i=i: self._toggle_day(_h, _i, checked)
            )
            days_row.addWidget(t)
        days_row.addStretch()
        play.addLayout(days_row)

        # Subtasks
        s_lbl = QLabel("Subtareas")
        s_lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;font-weight:600;"
            "letter-spacing:0.6px;background:transparent;border:none;"
        )
        play.addWidget(s_lbl)

        for s in h.get("subtasks") or []:
            s_row = QWidget()
            s_row.setFixedHeight(28)
            s_row.setStyleSheet("background:transparent;")
            sl = QHBoxLayout(s_row)
            sl.setContentsMargins(6, 0, 0, 0)
            sl.setSpacing(8)

            bullet = QLabel("•")
            bullet.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:13px;background:transparent;border:none;"
            )
            sl.addWidget(bullet)

            n = QLabel(s["name"])
            n.setStyleSheet(
                f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
            )
            sl.addWidget(n, stretch=1)

            x = QPushButton("✕")
            x.setFixedSize(22, 22)
            x.setCursor(Qt.PointingHandCursor)
            x.setStyleSheet(
                "QPushButton{background:transparent;border:none;"
                "color:#555560;font-size:11px;}"
                "QPushButton:hover{color:#f2555a;}"
            )
            x.clicked.connect(
                lambda _, _h=hid, _s=s["id"]: self._remove_subtask(_h, _s)
            )
            sl.addWidget(x)
            play.addWidget(s_row)

        add_row = QHBoxLayout()
        add_row.setSpacing(8)
        editor = _line_edit("Nueva subtarea...")
        add_row.addWidget(editor, stretch=1)
        add_b = _small_btn("+ Añadir", BLUE)
        add_b.clicked.connect(
            lambda _, _h=hid, _e=editor: self._add_subtask(_h, _e)
        )
        editor.returnPressed.connect(
            lambda _h=hid, _e=editor: self._add_subtask(_h, _e)
        )
        add_row.addWidget(add_b)
        play.addLayout(add_row)

        return panel

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh()

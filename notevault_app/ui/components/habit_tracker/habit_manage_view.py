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

from ....core.habit_manager import HabitManager, DAY_INITIALS, habit_schedule_text
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


class HabitManageView(QWidget):
    habits_changed = Signal()

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._selected_icon = ICON_OPTIONS[0]
        self._icon_btns: list = []
        self._new_days: set = set(range(7))
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
            "Pulsa ⚙ en un hábito para su frecuencia, horario en el calendario, "
            "aviso, color, subtareas y pausa."
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

        more_btn = QPushButton("Añadir con más opciones…")
        more_btn.setCursor(Qt.PointingHandCursor)
        more_btn.setFixedHeight(34)
        more_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:8px;"
            f"color:{BLUE};font-size:13px;}}"
            f"QPushButton:hover{{border-color:{BLUE};}}"
        )
        more_btn.clicked.connect(self._add_with_options)
        add_lay.addWidget(more_btn)

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
        self.habits_changed.emit()
        self.refresh()

    def _add_with_options(self):
        preset = {
            "name": self._name_input.text().strip(),
            "icon": self._selected_icon,
            "days": sorted(self._new_days) or list(range(7)),
        }
        self.open_editor(None, preset)

    def open_editor(self, habit_id=None, preset=None):
        from .habit_editor import HabitEditor
        habit = self.manager.get_habit(habit_id) if habit_id else None
        dialog = HabitEditor(self.manager, habit, preset, self)
        if dialog.exec():
            if habit is None:
                self._name_input.clear()
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

        if h.get("in_calendar"):
            cal = QLabel("📅")
            cal.setToolTip("Aparece en el calendario")
            cal.setStyleSheet("font-size:12px;background:transparent;border:none;")
            rlay.addWidget(cal)

        chip = QLabel(habit_schedule_text(h))
        chip.setFixedHeight(24)
        chip.setAlignment(Qt.AlignCenter)
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
        gear.setToolTip("Editar hábito")
        gear.setStyleSheet(
            "QPushButton{background:transparent;border:none;"
            "color:#7a7a86;font-size:14px;}"
            f"QPushButton:hover{{color:{BLUE};}}"
        )
        gear.clicked.connect(lambda _, _id=hid: self.open_editor(_id))
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
        return block

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh()

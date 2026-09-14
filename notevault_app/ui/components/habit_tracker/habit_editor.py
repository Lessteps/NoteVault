"""
Habit editor: name and icon, how often it repeats and between which dates,
whether and when it shows in Calendario, reminder, colour, subtasks, notes
and pausing.
"""

import re
from datetime import date
from typing import Optional

from PySide6.QtCore import Qt, QPoint
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QLineEdit, QTextEdit,
    QPushButton, QCheckBox, QScrollArea, QFrame, QWidget, QMenu, QMessageBox,
)

from ....core.habit_manager import HabitManager, habit_days, habit_rule
from ....core.recurrence import parse_date
from ..programacion import (
    RecurrencePicker, ColourRow, small_label, time_combo, set_time,
    duration_combo, set_duration, reminder_combo, set_reminder,
)
from ..tareas.tareas_common import flat_btn, primary_btn, line_edit, RED
from .habit_manage_view import ICON_OPTIONS
from .notion_widgets import BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE

CHECK_SS = (
    f"QCheckBox{{color:{TEXT};font-size:13px;spacing:8px;background:transparent;}}"
    f"QCheckBox::indicator{{width:16px;height:16px;border:1px solid #6a6a72;border-radius:4px;"
    "background:transparent;}"
    f"QCheckBox::indicator:checked{{background:{BLUE};border-color:{BLUE};}}"
)


def _section(title: str, hint: str = "") -> tuple:
    card = QFrame()
    card.setObjectName("habitSection")
    card.setStyleSheet(
        f"QFrame#habitSection{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
    lay = QVBoxLayout(card)
    lay.setContentsMargins(16, 14, 16, 16)
    lay.setSpacing(10)
    head = QLabel(title)
    head.setStyleSheet(f"color:{TEXT};font-size:13px;font-weight:600;background:transparent;border:none;")
    lay.addWidget(head)
    if hint:
        sub = QLabel(hint)
        sub.setWordWrap(True)
        sub.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;")
        lay.addWidget(sub)
    return card, lay


class HabitEditor(QDialog):
    """Create (habit=None) or edit a habit. Accepted means it was saved or deleted."""

    def __init__(self, manager: HabitManager, habit: Optional[dict] = None,
                 preset: Optional[dict] = None, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.habit = dict(habit) if habit else None
        base = dict(habit or preset or {})
        self.deleted = False
        self._icon = base.get("icon") or ICON_OPTIONS[0]
        self._subtasks = [dict(s) for s in base.get("subtasks") or []]

        self.setWindowTitle("Editar hábito" if habit else "Nuevo hábito")
        self.setMinimumSize(600, 720)
        self.setStyleSheet(f"QDialog{{background:{BG_PAGE};}}")
        self._build(base)

    # ── UI ────────────────────────────────────────────────────────────────

    def _build(self, h: dict):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(22, 20, 22, 20)
        page.setSpacing(14)

        # Name and icon
        top = QHBoxLayout()
        top.setSpacing(12)
        self.icon_btn = QPushButton(self._icon)
        self.icon_btn.setFixedSize(52, 52)
        self.icon_btn.setCursor(Qt.PointingHandCursor)
        self.icon_btn.setToolTip("Cambiar icono")
        self.icon_btn.setStyleSheet(
            f"QPushButton{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;"
            "font-size:24px;min-width:0px;padding:0px;}"
            f"QPushButton:hover{{border-color:{BLUE};}}")
        self.icon_btn.clicked.connect(self._pick_icon)
        top.addWidget(self.icon_btn)
        self.name = QLineEdit(h.get("name", ""))
        self.name.setPlaceholderText("Nombre del hábito")
        self.name.setStyleSheet(
            f"QLineEdit{{background:transparent;border:none;border-bottom:1px solid {BORDER};"
            f"border-radius:0px;color:{TEXT};font-size:22px;font-weight:600;padding:6px 0px;"
            "font-family:'Segoe UI Variable Text','Segoe UI',sans-serif;}"
            f"QLineEdit:focus{{border-bottom:2px solid {BLUE};}}")
        top.addWidget(self.name, stretch=1)
        page.addLayout(top)

        # Frequency
        card, lay = _section("Frecuencia", "Cuándo toca este hábito. Los porcentajes solo cuentan los días en que toca.")
        self.recurrence = RecurrencePicker(allow_none=False, show_range=True,
                                           start_label="Empieza", end_label="Termina")
        rule = habit_rule(h) if h else None
        self.recurrence.set_value(rule.to_string() if rule else "daily",
                                  parse_date(h.get("start_date")), parse_date(h.get("end_date")))
        lay.addWidget(self.recurrence)
        page.addWidget(card)

        # Calendar
        card, lay = _section("Horario y calendario",
                             "Con una hora, el hábito aparece como un bloque en Calendario y puedes marcarlo desde allí.")
        self.in_calendar = QCheckBox("Mostrar en el calendario")
        self.in_calendar.setStyleSheet(CHECK_SS)
        self.in_calendar.setChecked(bool(h.get("in_calendar")))
        self.in_calendar.toggled.connect(self._sync)
        lay.addWidget(self.in_calendar)

        grid = QGridLayout()
        grid.setHorizontalSpacing(10)
        grid.setVerticalSpacing(4)
        grid.addWidget(small_label("Hora"), 0, 0)
        grid.addWidget(small_label("Duración"), 0, 1)
        grid.addWidget(small_label("Aviso"), 0, 2)
        self.time = time_combo(empty_label="Todo el día")
        set_time(self.time, h.get("time"))
        self.time.currentIndexChanged.connect(self._sync)
        self.duration = duration_combo()
        set_duration(self.duration, h.get("duration_min"))
        self.reminder = reminder_combo()
        set_reminder(self.reminder, h.get("reminder_min"))
        grid.addWidget(self.time, 1, 0)
        grid.addWidget(self.duration, 1, 1)
        grid.addWidget(self.reminder, 1, 2)
        lay.addLayout(grid)

        lay.addWidget(small_label("Color en el calendario"))
        self.colour = ColourRow(h.get("colour") or "#8e24aa")
        lay.addWidget(self.colour)
        page.addWidget(card)

        # Subtasks
        card, lay = _section("Subtareas", "Pasos que se marcan dentro del hábito.")
        self.sub_list = QVBoxLayout()
        self.sub_list.setSpacing(4)
        lay.addLayout(self.sub_list)
        add_row = QHBoxLayout()
        add_row.setSpacing(8)
        self.sub_input = line_edit("Nueva subtarea…", height=30)
        self.sub_input.returnPressed.connect(self._add_subtask)
        add_row.addWidget(self.sub_input, stretch=1)
        add_btn = flat_btn("+ Añadir", BLUE, height=30)
        add_btn.clicked.connect(self._add_subtask)
        add_row.addWidget(add_btn)
        lay.addLayout(add_row)
        page.addWidget(card)
        self._render_subtasks()

        # Notes and state
        card, lay = _section("Notas")
        self.notes = QTextEdit()
        self.notes.setPlainText(h.get("notes", ""))
        self.notes.setPlaceholderText("Por qué lo haces, cómo medirlo, recordatorios…")
        self.notes.setFixedHeight(90)
        self.notes.setStyleSheet(
            f"QTextEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
            "font-size:13px;padding:6px;font-family:'Segoe UI Variable Text','Segoe UI',sans-serif;}"
            f"QTextEdit:focus{{border-color:{BLUE};}}")
        lay.addWidget(self.notes)
        self.paused = QCheckBox("Pausar hábito (deja de contar desde hoy; el historial se conserva)")
        self.paused.setStyleSheet(CHECK_SS)
        self.paused.setChecked(bool(h.get("paused_from")))
        lay.addWidget(self.paused)
        page.addWidget(card)
        page.addStretch()

        scroll.setWidget(content)
        outer.addWidget(scroll, stretch=1)

        # Buttons
        bar = QWidget()
        bar.setStyleSheet(f"background:{BG_PAGE};border-top:1px solid {BORDER};")
        btns = QHBoxLayout(bar)
        btns.setContentsMargins(22, 12, 22, 14)
        btns.setSpacing(8)
        if self.habit:
            delete = flat_btn("🗑  Eliminar", RED, RED, height=34)
            delete.clicked.connect(self._delete)
            btns.addWidget(delete)
        self.error = QLabel("")
        self.error.setStyleSheet(f"color:{RED};font-size:12px;background:transparent;border:none;")
        btns.addWidget(self.error)
        btns.addStretch()
        cancel = flat_btn("Cancelar", height=34)
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = primary_btn("Guardar", height=34)
        save.clicked.connect(self._save)
        btns.addWidget(save)
        outer.addWidget(bar)
        self._sync()

    def _sync(self, *_):
        timed = self.time.currentData() is not None
        on = self.in_calendar.isChecked()
        self.time.setEnabled(on)
        self.duration.setEnabled(on and timed)
        self.reminder.setEnabled(on and timed)
        self.colour.setEnabled(on)

    # ── Icon and subtasks ─────────────────────────────────────────────────

    def _pick_icon(self):
        menu = QMenu(self)
        menu.setStyleSheet(f"QMenu{{background:#202020;border:1px solid {BORDER};padding:6px;}}")
        grid_host = QWidget()
        grid = QGridLayout(grid_host)
        grid.setContentsMargins(4, 4, 4, 4)
        grid.setSpacing(4)
        for i, icon in enumerate(ICON_OPTIONS):
            b = QPushButton(icon)
            b.setFixedSize(36, 36)
            b.setCursor(Qt.PointingHandCursor)
            b.setStyleSheet(
                f"QPushButton{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
                "font-size:18px;min-width:0px;padding:0px;}"
                f"QPushButton:hover{{border-color:{BLUE};}}")
            b.clicked.connect(lambda _c=False, ic=icon: (self._set_icon(ic), menu.close()))
            grid.addWidget(b, i // 8, i % 8)
        from PySide6.QtWidgets import QWidgetAction
        action = QWidgetAction(menu)
        action.setDefaultWidget(grid_host)
        menu.addAction(action)
        menu.exec(self.icon_btn.mapToGlobal(QPoint(0, self.icon_btn.height() + 4)))

    def _set_icon(self, icon: str):
        self._icon = icon
        self.icon_btn.setText(icon)

    def _render_subtasks(self):
        while self.sub_list.count():
            item = self.sub_list.takeAt(0)
            if item.widget():
                item.widget().hide()
                item.widget().deleteLater()
        if not self._subtasks:
            empty = small_label("Sin subtareas")
            self.sub_list.addWidget(empty)
        for index, sub in enumerate(self._subtasks):
            row = QWidget()
            row.setStyleSheet("background:transparent;")
            rl = QHBoxLayout(row)
            rl.setContentsMargins(4, 0, 0, 0)
            rl.setSpacing(8)
            dot = QLabel("•")
            dot.setStyleSheet(f"color:{TEXT_FAINT};background:transparent;border:none;")
            rl.addWidget(dot)
            name = QLabel(sub["name"])
            name.setStyleSheet(f"color:{TEXT_DIM};font-size:13px;background:transparent;border:none;")
            rl.addWidget(name, stretch=1)
            for glyph, tip, delta in (("↑", "Subir", -1), ("↓", "Bajar", 1)):
                move = QPushButton(glyph)
                move.setToolTip(tip)
                move.setFixedSize(24, 24)
                move.setCursor(Qt.PointingHandCursor)
                move.setEnabled(0 <= index + delta < len(self._subtasks))
                move.setStyleSheet(
                    f"QPushButton{{background:transparent;border:none;color:{TEXT_FAINT};"
                    "font-size:13px;min-width:0px;padding:0px;}"
                    f"QPushButton:hover{{color:{BLUE};}}QPushButton:disabled{{color:transparent;}}")
                move.clicked.connect(lambda _c=False, i=index, d=delta: self._move_subtask(i, d))
                rl.addWidget(move)
            remove = QPushButton("✕")
            remove.setFixedSize(24, 24)
            remove.setCursor(Qt.PointingHandCursor)
            remove.setStyleSheet(
                "QPushButton{background:transparent;border:none;color:#555560;font-size:12px;"
                "min-width:0px;padding:0px;}QPushButton:hover{color:#f2555a;}")
            remove.clicked.connect(lambda _c=False, i=index: self._remove_subtask(i))
            rl.addWidget(remove)
            self.sub_list.addWidget(row)

    def _add_subtask(self):
        name = self.sub_input.text().strip()
        if not name:
            return
        base = re.sub(r"[^a-z0-9]", "", name.lower()) or "sub"
        taken = {s["id"] for s in self._subtasks}
        sid, n = base, 2
        while sid in taken:
            sid, n = f"{base}{n}", n + 1
        self._subtasks.append({"id": sid, "name": name})
        self.sub_input.clear()
        self._render_subtasks()

    def _remove_subtask(self, index: int):
        del self._subtasks[index]
        self._render_subtasks()

    def _move_subtask(self, index: int, delta: int):
        other = index + delta
        self._subtasks[index], self._subtasks[other] = self._subtasks[other], self._subtasks[index]
        self._render_subtasks()

    # ── Save / delete ─────────────────────────────────────────────────────

    def _delete(self):
        answer = QMessageBox.question(
            self, "Eliminar hábito",
            f"¿Eliminar «{self.habit['name']}»? Los registros de días pasados se conservan en sus archivos.",
            QMessageBox.Yes | QMessageBox.No)
        if answer == QMessageBox.Yes:
            self.manager.remove_habit(self.habit["id"])
            self.deleted = True
            self.accept()

    def _save(self):
        name = self.name.text().strip()
        if not name:
            self.error.setText("Escribe un nombre")
            self.name.setFocus()
            return
        if not self.recurrence.is_valid():
            self.error.setText("Elige al menos un día")
            return
        rule = self.recurrence.recurrence()
        start = self.recurrence.start()
        end = self.recurrence.end()
        if rule.freq == "every" and start is None:
            start = date.today()
        if start and end and end < start:
            self.error.setText("La fecha de fin es anterior al inicio")
            return

        was_paused = self.habit.get("paused_from") if self.habit else None
        paused_from = (was_paused or date.today().isoformat()) if self.paused.isChecked() else None
        in_calendar = self.in_calendar.isChecked()
        clock = self.time.currentData() if in_calendar else None
        options = dict(
            repeat=rule.to_string(),
            start_date=start.isoformat() if start else None,
            end_date=end.isoformat() if end else None,
            paused_from=paused_from,
            in_calendar=in_calendar,
            time=clock,
            duration_min=self.duration.currentData() if clock else None,
            reminder_min=self.reminder.currentData() if clock else None,
            colour=self.colour.value() if in_calendar else None,
            notes=self.notes.toPlainText().strip() or None,
        )
        if self.habit:
            self.manager.update_habit(self.habit["id"], name=name, icon=self._icon,
                                      subtasks=self._subtasks, **options)
        else:
            created = self.manager.add_habit(name, self._icon, **options)
            if self._subtasks:
                self.manager.update_habit(created["id"], subtasks=self._subtasks)
        self.accept()

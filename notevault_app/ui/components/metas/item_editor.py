"""Side editor for one sub-goal: dates, repetition, time, calendar, measure, habits."""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QCheckBox,
    QTextEdit, QMessageBox,
)

from ....core import goal_manager as gm
from ....core import vault_format
from ....core.store import parse_num, fmt_num
from ..comun import (
    BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, UI_FONT, CHECK_SS, label, combo,
    line_edit, flat_btn, primary_btn,
)
from ..comun.widgets import priority_combo, HabitLinkPicker
from ..programacion import (
    RecurrencePicker, time_combo, set_time, duration_combo, set_duration, reminder_combo,
    set_reminder,
)
from ..tareas.date_picker import DateButton


def _section(text: str):
    return label(text.upper(), TEXT_FAINT, 10, True)


class ItemEditor(QWidget):
    saved = Signal(str)             # item id
    deleted = Signal(str)
    add_child_requested = Signal(str)
    open_full_requested = Signal(str)
    closed = Signal()

    def __init__(self, goal_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.goal_mgr, self.habit_mgr = goal_mgr, habit_mgr
        self.goal = None
        self.item = None
        self.setMinimumWidth(360)
        self.setMaximumWidth(460)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet("QScrollArea{background:transparent;border:none;}")
        box = QFrame()
        box.setObjectName("itemEditor")
        box.setAttribute(Qt.WA_StyledBackground, True)
        box.setStyleSheet(f"QFrame#itemEditor{{background:{BG_CARD};border:1px solid {BORDER};"
                          "border-radius:10px;}")
        v = QVBoxLayout(box)
        v.setContentsMargins(16, 14, 16, 14)
        v.setSpacing(8)

        head = QHBoxLayout()
        self.heading = label("Submeta", TEXT_DIM, 11, True)
        head.addWidget(self.heading)
        head.addStretch()
        close = flat_btn("✕", height=24)
        close.setFixedWidth(30)
        close.clicked.connect(self.closed.emit)
        head.addWidget(close)
        v.addLayout(head)

        self.name = line_edit("Nombre de la submeta", 34)
        self.name.setStyleSheet(self.name.styleSheet().replace("font-size:12px", "font-size:14px"))
        v.addWidget(self.name)

        grid = QGridLayout()
        grid.setHorizontalSpacing(8)
        grid.setVerticalSpacing(6)
        grid.addWidget(label("Estado", TEXT_DIM, 11), 0, 0)
        grid.addWidget(label("Prioridad", TEXT_DIM, 11), 0, 1)
        self.status = combo([(s, s) for s in vault_format.GOAL_ITEM_STATUSES], 30)
        self.priority = priority_combo(2, 30)
        grid.addWidget(self.status, 1, 0)
        grid.addWidget(self.priority, 1, 1)

        grid.addWidget(label("Categoría", TEXT_DIM, 11), 2, 0)
        grid.addWidget(label("Modo de interfaz", TEXT_DIM, 11), 2, 1)
        self.category = combo([], 30)
        self.category.setEditable(True)
        self.is_priority_cb = QCheckBox("⭐ Prioritaria (detallada)")
        self.is_priority_cb.setToolTip("Activa tarjeta visual con métricas e interfaz propia de submeta")
        self.is_priority_cb.setStyleSheet(CHECK_SS)
        grid.addWidget(self.category, 3, 0)
        grid.addWidget(self.is_priority_cb, 3, 1)
        v.addLayout(grid)

        v.addSpacing(4)
        v.addWidget(_section("Fecha y repetición"))
        self.repeat = RecurrencePicker(allow_none=True, start_label="Empieza", end_label="Repetir hasta")
        self.repeat.changed.connect(self._sync_visibility)
        v.addWidget(self.repeat)
        drow = QHBoxLayout()
        self.due_label = label("Fecha límite", TEXT_DIM, 11)
        drow.addWidget(self.due_label)
        self.due = DateButton(None, placeholder="Sin fecha", height=30)
        drow.addWidget(self.due, stretch=1)
        v.addLayout(drow)

        trow = QGridLayout()
        trow.setHorizontalSpacing(8)
        trow.addWidget(label("Hora", TEXT_DIM, 11), 0, 0)
        trow.addWidget(label("Duración", TEXT_DIM, 11), 0, 1)
        self.time = time_combo()
        self.duration = duration_combo()
        trow.addWidget(self.time, 1, 0)
        trow.addWidget(self.duration, 1, 1)
        trow.addWidget(label("Aviso", TEXT_DIM, 11), 2, 0)
        self.reminder = reminder_combo()
        trow.addWidget(self.reminder, 3, 0)
        self.in_calendar = QCheckBox("Mostrar en el calendario")
        self.in_calendar.setStyleSheet(CHECK_SS)
        trow.addWidget(self.in_calendar, 3, 1)
        v.addLayout(trow)

        self.due.changed.connect(lambda d: d and self.in_calendar.setChecked(True))
        self.time.currentIndexChanged.connect(
            lambda _: self.time.currentData() and self.in_calendar.setChecked(True))

        v.addSpacing(4)
        v.addWidget(_section("Meta medible (opcional)"))
        mrow = QHBoxLayout()
        self.target = line_edit("Objetivo, p. ej. 3", 30)
        self.target.setFixedWidth(130)
        self.unit = line_edit("Unidad: h, páginas, km…", 30)
        mrow.addWidget(self.target)
        mrow.addWidget(self.unit, stretch=1)
        v.addLayout(mrow)
        self.value_row = QHBoxLayout()
        self.value = line_edit("Llevas", 30)
        self.value.setFixedWidth(130)
        self.value_row.addWidget(self.value)
        self.value_row.addWidget(label("avance acumulado (submetas únicas)", TEXT_FAINT, 11))
        self.value_row.addStretch()
        v.addLayout(self.value_row)

        v.addSpacing(4)
        v.addWidget(_section("Hábitos conectados"))
        self.habits = HabitLinkPicker(habit_mgr)
        v.addWidget(self.habits)

        v.addSpacing(4)
        v.addWidget(_section("Notas"))
        self.notes = QTextEdit()
        self.notes.setFixedHeight(90)
        self.notes.setStyleSheet(
            f"QTextEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
            f"font-size:12px;padding:4px;font-family:{UI_FONT};}}QTextEdit:focus{{border-color:{BLUE};}}")
        v.addWidget(self.notes)

        buttons = QHBoxLayout()
        self.delete_btn = flat_btn("Eliminar", RED, RED, height=32)
        self.delete_btn.clicked.connect(self._delete)
        buttons.addWidget(self.delete_btn)
        self.child_btn = flat_btn("+ Submeta", height=32)
        self.child_btn.clicked.connect(lambda: self.item and self.add_child_requested.emit(self.item.id))
        buttons.addWidget(self.child_btn)
        self.full_view_btn = flat_btn("🔍 Interfaz ›", BLUE, height=32)
        self.full_view_btn.setToolTip("Abrir la interfaz propia y detallada de esta submeta")
        self.full_view_btn.clicked.connect(lambda: self.item and self.open_full_requested.emit(self.item.id))
        buttons.addWidget(self.full_view_btn)
        buttons.addStretch()
        save = primary_btn("Guardar", height=32)
        save.clicked.connect(self._save)
        buttons.addWidget(save)
        v.addLayout(buttons)
        self.hint = label("", TEXT_FAINT, 11, wrap=True)
        v.addWidget(self.hint)
        v.addStretch()
        scroll.setWidget(box)
        outer.addWidget(scroll)
        self.name.returnPressed.connect(self._save)

    def set_managers(self, goal_mgr, habit_mgr):
        self.goal_mgr, self.habit_mgr = goal_mgr, habit_mgr
        self.habits.habit_mgr = habit_mgr

    def load(self, goal, item):
        self.goal, self.item = goal, item
        branch = not item.is_leaf
        self.heading.setText("Rama (se completa con sus hijas)" if branch else "Submeta")
        self.name.setText(item.name)
        self.status.setCurrentIndex(max(0, self.status.findData(item.status)))
        self.status.setEnabled(not branch)
        self.priority.setCurrentIndex(max(0, self.priority.findData(item.priority)))

        # Categorías sugeridas + existentes
        current_cat = item.category
        cats = ["", "Teoría", "Práctica", "Ejercicios", "Proyectos", "Lectura", "Conceptos", "Repaso"]
        for c in self.goal_mgr.categories(goal.id):
            if c and c not in cats:
                cats.append(c)
        if current_cat and current_cat not in cats:
            cats.append(current_cat)
        self.category.blockSignals(True)
        self.category.clear()
        for c in cats:
            self.category.addItem(c if c else "Sin categoría", c)
        idx = self.category.findData(current_cat)
        if idx >= 0:
            self.category.setCurrentIndex(idx)
        else:
            self.category.setEditText(current_cat)
        self.category.blockSignals(False)

        self.is_priority_cb.setChecked(item.is_priority)

        self.repeat.set_value(item.repeat, item.start, item.repeat_until)
        self.due.set_value(item.due)
        set_time(self.time, item.due_time or None)
        set_duration(self.duration, item.duration_min or 60)
        set_reminder(self.reminder, item.reminder_min)
        self.in_calendar.setChecked(
            item.in_calendar or bool(item.due or item.due_time or item.repeat)
        )
        self.target.setText(fmt_num(item.target) if item.target is not None else "")
        self.unit.setText(item.unit)
        self.value.setText(fmt_num(item.value) if item.value is not None else "")
        self.habits.set_area(goal.area, item.habit_links)
        self.notes.setPlainText(item.notes)
        self.hint.setText("")
        self._sync_visibility()
        self.name.setFocus()
        self.name.selectAll()

    def _sync_visibility(self):
        repeating = bool(self.repeat.rule())
        self.due.setVisible(not repeating)
        self.due_label.setVisible(not repeating)
        for i in range(self.value_row.count()):
            w = self.value_row.itemAt(i).widget()
            if w:
                w.setVisible(not repeating)

        # Límite estricto de 2 paneles de dashboard:
        # Solo submetas de nivel 1 (sin parent) pueden abrir dashboard 2 o tener hijos
        is_root_submeta = not bool(self.item and self.item.parent)
        self.full_view_btn.setVisible(is_root_submeta)
        self.child_btn.setVisible(is_root_submeta)
        self.is_priority_cb.setVisible(is_root_submeta)

    def _save(self):
        if self.item is None:
            return
        if not self.repeat.is_valid():
            self.hint.setText("Elige al menos un día para la repetición.")
            return
        target = parse_num(self.target.text()) if self.target.text().strip() else None
        if target is not None and target <= 0:
            target = None
        rule = self.repeat.rule()
        due_val = None if rule else self.due.value()
        time_val = self.time.currentData() or ""
        in_cal = self.in_calendar.isChecked() or bool(due_val and time_val)
        cat_text = self.category.currentText().strip()
        if cat_text.lower() in ("sin categoría", "sin categoria"):
            cat_text = ""

        fields = dict(
            name=self.name.text().strip() or self.item.name,
            category=cat_text,
            is_priority=self.is_priority_cb.isChecked(),
            priority=self.priority.currentData(),
            repeat=rule,
            start=self.repeat.start() if rule else None,
            repeat_until=self.repeat.end() if rule else None,
            due=due_val,
            due_time=time_val,
            duration_min=self.duration.currentData() if time_val else None,
            reminder_min=self.reminder.currentData() if time_val else None,
            in_calendar=in_cal,
            target=target, unit=self.unit.text().strip() if target else "",
            value=(parse_num(self.value.text()) if self.value.text().strip() and not rule else None),
            habit_links=self.habits.selected(),
            notes=self.notes.toPlainText().strip(),
        )
        if self.item.is_leaf:
            fields["status"] = self.status.currentData()
        if fields["in_calendar"] and not rule and not fields["due"]:
            self.hint.setText("Para verla en el calendario ponle una fecha o una repetición.")
        self.goal_mgr.update_item(self.goal.id, self.item.id, **fields)
        self.hint.setText("Guardado ✓")
        self.saved.emit(self.item.id)

    def _delete(self):
        if self.item is None:
            return
        n = len(self.goal_mgr.descendants(self.item))
        text = f"¿Eliminar «{self.item.name}»" + (f" y sus {n} submetas" if n else "") + \
            "?\nSe mueve a la papelera de la vault."
        if QMessageBox.question(self, "Eliminar submeta", text) != QMessageBox.Yes:
            return
        iid = self.item.id
        self.goal_mgr.delete_item(self.goal.id, iid)
        self.item = None
        self.deleted.emit(iid)

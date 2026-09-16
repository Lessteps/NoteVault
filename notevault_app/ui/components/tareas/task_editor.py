"""
Task editor dialog.
Edits every column of a task plus the markdown body stored in its own
.md file inside {vault}/tareas/.
"""

import re
from datetime import date, datetime
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QTextEdit,
    QPushButton, QWidget, QComboBox,
)
from PySide6.QtCore import Qt

from ....core.task_manager import (
    Task, TaskManager, STATUSES, PRIORITY_MAX,
)
from .tareas_common import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, STAR,
    COMBO_SS, line_edit, combo, flat_btn, primary_btn, hline,
)
from .date_picker import DateButton
from ..programacion import RecurrencePicker, time_combo, set_time
from ..comun.subtasks_widget import SubtasksWidget


def _parse_subtasks_from_markdown(text: str) -> list:
    items = []
    for idx, line in enumerate(text.splitlines()):
        m = re.match(r"^\s*-\s*\[([ xX])\]\s*(.+)$", line)
        if m:
            items.append({
                "id": str(idx),
                "title": m.group(2).strip(),
                "done": m.group(1).lower() == "x",
            })
    return items


def _update_markdown_subtask(text: str, line_idx: int, done: bool) -> str:
    lines = text.splitlines()
    if 0 <= line_idx < len(lines):
        line = lines[line_idx]
        m = re.match(r"^(\s*-\s*\[)([ xX])(\]\s*.+)$", line)
        if m:
            mark = "x" if done else " "
            lines[line_idx] = f"{m.group(1)}{mark}{m.group(3)}"
    return "\n".join(lines)


def _remove_markdown_subtask(text: str, line_idx: int) -> str:
    lines = text.splitlines()
    if 0 <= line_idx < len(lines):
        lines.pop(line_idx)
    return "\n".join(lines)


def _append_markdown_subtask(text: str, title: str) -> str:
    lines = text.splitlines()
    lines.append(f"- [ ] {title}")
    return "\n".join(lines)



class _StarPicker(QWidget):
    def __init__(self, value: int = 1, parent=None):
        super().__init__(parent)
        self.setStyleSheet("background:transparent;")
        self._value = max(1, min(PRIORITY_MAX, value))
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(4)
        self._btns = []
        for i in range(1, PRIORITY_MAX + 1):
            b = QPushButton("★")
            b.setFixedSize(28, 28)
            b.setCursor(Qt.PointingHandCursor)
            b.clicked.connect(lambda _, v=i: self.set_value(v))
            self._btns.append(b)
            lay.addWidget(b)
        lay.addStretch()
        self._sync()

    def _sync(self):
        for i, b in enumerate(self._btns, start=1):
            on = i <= self._value
            b.setStyleSheet(
                f"QPushButton{{background:transparent;border:none;font-size:17px;"
                f"color:{STAR if on else '#4a4a52'};}}"
                f"QPushButton:hover{{color:{STAR};}}"
            )

    def set_value(self, v: int):
        self._value = max(1, min(PRIORITY_MAX, v))
        self._sync()

    def value(self) -> int:
        return self._value


def _field_label(text: str) -> QLabel:
    lbl = QLabel(text)
    lbl.setFixedWidth(110)
    lbl.setStyleSheet(
        f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
    )
    return lbl


class TaskEditor(QDialog):
    """Modal editor. Returns QDialog.Accepted when the task was saved."""

    def __init__(self, manager: TaskManager, task: Task, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.task = task
        self.setWindowTitle(task.name or "Tarea")
        self.setMinimumSize(700, 820)
        self.setStyleSheet(f"QDialog{{background:{BG_PAGE};}}")
        self._deleted = False
        self._build()

    # ── UI ────────────────────────────────────────────────────────────────

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(22, 20, 22, 18)
        lay.setSpacing(12)

        # Title
        self._name = line_edit("Nombre de la tarea", height=40)
        self._name.setText(self.task.name)
        self._name.setStyleSheet(
            f"QLineEdit{{background:transparent;border:none;color:{TEXT};"
            "font-size:22px;font-weight:700;padding:0;}"
        )
        lay.addWidget(self._name)
        lay.addWidget(hline())

        # Property grid
        grid = QGridLayout()
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(9)
        r = 0

        grid.addWidget(_field_label("Estado"), r, 0)
        self._status = combo([(s, s) for s in STATUSES])
        idx = STATUSES.index(self.task.status) if self.task.status in STATUSES else 0
        self._status.setCurrentIndex(idx)
        grid.addWidget(self._status, r, 1)
        r += 1

        grid.addWidget(_field_label("Asignatura"), r, 0)
        self._subject = QComboBox()
        self._subject.setEditable(True)
        self._subject.setFixedHeight(28)
        self._subject.setStyleSheet(COMBO_SS + f"QComboBox{{color:{BLUE};}}")
        self._subject.addItem("")
        for s in self.manager.subjects():
            self._subject.addItem(s)
        self._subject.setCurrentText(self.task.subject)
        self._subject.lineEdit().setPlaceholderText(
            "Elige una o escribe una nueva: Historia, Cálculo..."
        )
        grid.addWidget(self._subject, r, 1)
        r += 1

        grid.addWidget(_field_label("Prioridad"), r, 0)
        self._priority = _StarPicker(self.task.priority)
        grid.addWidget(self._priority, r, 1)
        r += 1

        grid.addWidget(_field_label("Fecha de salida"), r, 0)
        self._start = DateButton(self.task.start, height=28)
        grid.addWidget(self._start, r, 1)
        r += 1

        grid.addWidget(_field_label("Fecha límite"), r, 0)
        due_row = QHBoxLayout()
        due_row.setSpacing(8)
        self._due = DateButton(self.task.due, height=28)
        due_row.addWidget(self._due, stretch=1)
        self._due_time = time_combo(empty_label="Sin hora", height=28)
        self._due_time.setFixedWidth(110)
        self._due_time.setToolTip("Con hora, la tarea aparece a esa hora en Calendario")
        set_time(self._due_time, self.task.due_time)
        due_row.addWidget(self._due_time)
        grid.addLayout(due_row, r, 1)
        r += 1

        grid.addWidget(_field_label("Repetición"), r, 0, Qt.AlignTop)
        rep_box = QVBoxLayout()
        rep_box.setSpacing(8)
        self._repeat = RecurrencePicker(allow_none=True, show_range=False)
        self._repeat.set_value(self.task.repeat)
        self._repeat.changed.connect(self._sync_repeat)
        rep_box.addWidget(self._repeat)
        until_row = QHBoxLayout()
        until_row.setSpacing(8)
        self._until_label = _field_label("Repetir hasta")
        self._until_label.setFixedWidth(90)
        until_row.addWidget(self._until_label)
        self._until = DateButton(self.task.repeat_until, placeholder="Siempre", height=28)
        until_row.addWidget(self._until, stretch=1)
        rep_box.addLayout(until_row)
        self._repeat_hint = QLabel(
            "Al marcarla como completada pasa sola a la siguiente fecha.")
        self._repeat_hint.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;")
        rep_box.addWidget(self._repeat_hint)
        grid.addLayout(rep_box, r, 1)
        r += 1

        grid.addWidget(_field_label("Recordatorio"), r, 0)
        self._reminder = DateButton(
            self.task.reminder, with_time=True,
            placeholder="Sin recordatorio — pulsa para elegir", height=28,
        )
        self._reminder.setToolTip(
            "Fecha y hora del aviso de Windows"
        )
        grid.addWidget(self._reminder, r, 1)
        r += 1

        grid.addWidget(_field_label("Creada"), r, 0)
        created = QLabel(
            self.task.created.strftime("%d/%m/%Y") if self.task.created else "—"
        )
        created.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )
        grid.addWidget(created, r, 1)

        grid.setColumnStretch(1, 1)
        lay.addLayout(grid)
        self._sync_repeat()
        # Subtasks
        self._subtasks = SubtasksWidget(title="Subtareas", colour=BLUE, can_add=True)
        self._subtasks.subtask_added.connect(self._on_subtask_added)
        self._subtasks.subtask_toggled.connect(self._on_subtask_toggled)
        self._subtasks.subtask_deleted.connect(self._on_subtask_deleted)
        lay.addWidget(self._subtasks)
        lay.addWidget(hline())

        # Markdown body
        body_lbl = QLabel("📄  Contenido (markdown)")

        body_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;font-weight:600;"
            "background:transparent;border:none;"
        )
        lay.addWidget(body_lbl)

        self._body = QTextEdit()
        self._body.setPlainText(self.task.body)
        self._reload_subtasks()
        self._body.textChanged.connect(self._reload_subtasks)
        self._body.setPlaceholderText(

            "# Notas de la tarea\n\n- Lo que hay que hacer\n- Recursos\n"
        )
        self._body.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};"
            f"border-radius:8px;color:{TEXT};font-size:13px;padding:10px;}}"
            f"QTextEdit:focus{{border-color:{BLUE};}}"
        )
        lay.addWidget(self._body, stretch=1)

        path_lbl = QLabel(str(self.manager._path(self.task.id)))
        path_lbl.setStyleSheet(
            f"color:#4d4d55;font-size:10px;background:transparent;border:none;"
        )
        lay.addWidget(path_lbl)

        # Buttons
        btns = QHBoxLayout()
        btns.setSpacing(8)
        del_btn = flat_btn("🗑  Eliminar", RED, RED, height=32)
        del_btn.clicked.connect(self._delete)
        btns.addWidget(del_btn)
        btns.addStretch()
        cancel = flat_btn("Cancelar", height=32)
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = primary_btn("Guardar", height=32)
        save.clicked.connect(self._save)
        btns.addWidget(save)
        lay.addLayout(btns)

    # ── Actions ───────────────────────────────────────────────────────────

    @property
    def deleted(self) -> bool:
        return self._deleted

    def _delete(self):
        self.manager.delete(self.task.id)
        self._deleted = True
        self.accept()

    def _reload_subtasks(self):
        items = _parse_subtasks_from_markdown(self._body.toPlainText())
        self._subtasks.set_items(items)

    def _on_subtask_added(self, title: str):
        text = _append_markdown_subtask(self._body.toPlainText(), title)
        self._body.blockSignals(True)
        self._body.setPlainText(text)
        self._body.blockSignals(False)
        self._reload_subtasks()

    def _on_subtask_toggled(self, item_id: str, done: bool):
        try:
            line_idx = int(item_id)
        except ValueError:
            return
        text = _update_markdown_subtask(self._body.toPlainText(), line_idx, done)
        self._body.blockSignals(True)
        self._body.setPlainText(text)
        self._body.blockSignals(False)
        self._reload_subtasks()

    def _on_subtask_deleted(self, item_id: str):
        try:
            line_idx = int(item_id)
        except ValueError:
            return
        text = _remove_markdown_subtask(self._body.toPlainText(), line_idx)
        self._body.blockSignals(True)
        self._body.setPlainText(text)
        self._body.blockSignals(False)
        self._reload_subtasks()

    def _sync_repeat(self):

        repeats = self._repeat.rule() != ""
        for w in (self._until_label, self._until, self._repeat_hint):
            w.setVisible(repeats)

    def _save(self):
        if not self._repeat.is_valid():
            return
        repeat = self._repeat.rule()
        due = self._due.value()
        if repeat and due is None:
            due = date.today()
        reminder = self._reminder.value()
        if isinstance(reminder, datetime):
            reminder = reminder.replace(second=0, microsecond=0)

        reminder_done = self.task.reminder_done
        if reminder != self.task.reminder:
            reminder_done = False   # a new time must fire again

        self.manager.update(
            self.task.id,
            name=self._name.text().strip() or "Sin título",
            status=self._status.currentData(),
            subject=self._subject.currentText().strip(),
            priority=self._priority.value(),
            start=self._start.value(),
            due=due,
            due_time=self._due_time.currentData(),
            repeat=repeat,
            repeat_until=self._until.value() if repeat else None,
            reminder=reminder,
            reminder_done=reminder_done,
            body=self._body.toPlainText(),
        )
        self.accept()

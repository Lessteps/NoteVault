"""
Task editor dialog.
Edits every column of a task plus the markdown body stored in its own
.md file inside {vault}/tareas/.
"""

from datetime import datetime
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
        self.setMinimumSize(680, 640)
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
        self._due = DateButton(self.task.due, height=28)
        grid.addWidget(self._due, r, 1)
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

    def _save(self):
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
            due=self._due.value(),
            reminder=reminder,
            reminder_done=reminder_done,
            body=self._body.toPlainText(),
        )
        self.accept()

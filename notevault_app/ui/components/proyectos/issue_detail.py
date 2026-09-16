"""Issue side panel, as in Jira: every field, children, description and attachments."""

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QCheckBox, QTextEdit,
    QMessageBox,
)

from ....core import vault_format
from ....core.project_manager import TYPE_ICONS, TYPE_COLOURS, T_GOAL, T_SUBTASK
from ..comun import (
    BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, UI_FONT, CHECK_SS, label,
    combo, line_edit, flat_btn, primary_btn, clear_layout, chip, SubtasksWidget,
)

from ..comun.widgets import priority_combo, BlockProgress, Check
from ..comun.attachment_strip import AttachmentStrip
from ..programacion import (
    RecurrencePicker, time_combo, set_time, duration_combo, set_duration,
)
from ..tareas.date_picker import DateButton


def _cap(text):
    return label(text, TEXT_DIM, 11)


class IssueDetail(QWidget):
    saved = Signal(str)
    deleted = Signal(str)
    closed = Signal()
    open_issue = Signal(str)
    create_child = Signal(str)

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        self.issue = None
        self.setMinimumWidth(380)
        self.setMaximumWidth(480)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet("QScrollArea{background:transparent;border:none;}")
        box = QFrame()
        box.setObjectName("issueDetail")
        box.setAttribute(Qt.WA_StyledBackground, True)
        box.setStyleSheet(f"QFrame#issueDetail{{background:{BG_CARD};border:1px solid {BORDER};"
                          "border-radius:10px;}")
        v = QVBoxLayout(box)
        v.setContentsMargins(16, 12, 16, 14)
        v.setSpacing(8)

        head = QHBoxLayout()
        self.key = label("", TEXT_FAINT, 12, True)
        head.addWidget(self.key)
        head.addStretch()
        close = flat_btn("✕", height=24)
        close.setFixedWidth(30)
        close.clicked.connect(self.closed.emit)
        head.addWidget(close)
        v.addLayout(head)
        self.title = line_edit("Título del issue", 36)
        self.title.setStyleSheet(self.title.styleSheet().replace("font-size:12px", "font-size:15px"))
        self.title.returnPressed.connect(self.save)
        v.addWidget(self.title)

        grid = QGridLayout()
        grid.setHorizontalSpacing(8)
        grid.setVerticalSpacing(4)
        self.type = combo([(f"{TYPE_ICONS[t]}  {t}", t) for t in vault_format.ISSUE_TYPES], 30)
        self.status = combo([], 30)
        self.priority = priority_combo(2, 30)
        self.parent = combo([], 30)
        for r, (cap, w) in enumerate((("Tipo", self.type), ("Estado", self.status),
                                      ("Prioridad", self.priority), ("Padre", self.parent))):
            grid.addWidget(_cap(cap), (r // 2) * 2, r % 2)
            grid.addWidget(w, (r // 2) * 2 + 1, r % 2)
        v.addLayout(grid)

        self.subtasks_widget = SubtasksWidget(title="Subtareas", colour=GREEN, can_add=True)
        self.subtasks_widget.subtask_added.connect(self._add_child_subtask)
        self.subtasks_widget.subtask_toggled.connect(self._toggle_child_id)
        self.subtasks_widget.subtask_deleted.connect(self._delete_child_id)
        self.subtasks_widget.subtask_clicked.connect(self.open_issue.emit)
        v.addWidget(self.subtasks_widget)


        v.addWidget(label("FECHAS", TEXT_FAINT, 10, True))
        dates = QGridLayout()
        dates.setHorizontalSpacing(8)
        dates.setVerticalSpacing(4)
        dates.addWidget(_cap("Inicio"), 0, 0)
        dates.addWidget(_cap("Vence"), 0, 1)
        self.start = DateButton(None, placeholder="—", height=30)
        self.due = DateButton(None, placeholder="Sin fecha", height=30)
        dates.addWidget(self.start, 1, 0)
        dates.addWidget(self.due, 1, 1)
        dates.addWidget(_cap("Hora"), 2, 0)
        dates.addWidget(_cap("Estimación"), 2, 1)
        self.time = time_combo()
        self.estimate = duration_combo()
        self.estimate.insertItem(0, "Sin estimar", None)
        dates.addWidget(self.time, 3, 0)
        dates.addWidget(self.estimate, 3, 1)
        dates.addWidget(_cap("Recordatorio"), 4, 0)
        self.reminder = DateButton(None, with_time=True, placeholder="Sin recordatorio", height=30)
        dates.addWidget(self.reminder, 5, 0)
        self.in_calendar = QCheckBox("En el calendario")
        self.in_calendar.setStyleSheet(CHECK_SS)
        dates.addWidget(self.in_calendar, 5, 1)
        v.addLayout(dates)
        v.addWidget(_cap("Repetición"))
        self.repeat = RecurrencePicker(allow_none=True, show_range=False)
        v.addWidget(self.repeat)

        v.addWidget(_cap("Etiquetas (separadas por coma)"))
        self.labels = line_edit("frontend, diseño", 30)
        v.addWidget(self.labels)

        v.addWidget(label("DESCRIPCIÓN", TEXT_FAINT, 10, True))
        self.description = QTextEdit()
        self.description.setPlaceholderText("Markdown. Usa «- [ ] paso» para una checklist.")
        self.description.setFixedHeight(130)
        self.description.setStyleSheet(
            f"QTextEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
            f"font-size:12px;padding:6px;font-family:{UI_FONT};}}QTextEdit:focus{{border-color:{BLUE};}}")
        v.addWidget(self.description)
        self.checklist = label("", TEXT_FAINT, 11)
        v.addWidget(self.checklist)

        v.addWidget(label("ADJUNTOS", TEXT_FAINT, 10, True))
        self.attachments = AttachmentStrip(manager.vault_root, "proyectos", "x")
        self.attachments.changed.connect(self._attachments_changed)
        v.addWidget(self.attachments)

        buttons = QHBoxLayout()
        self.delete_btn = flat_btn("Eliminar", RED, RED, height=32)
        self.delete_btn.clicked.connect(self._delete)
        buttons.addWidget(self.delete_btn)
        buttons.addStretch()
        save = primary_btn("Guardar", height=32)
        save.clicked.connect(self.save)
        buttons.addWidget(save)
        v.addLayout(buttons)
        self.hint = label("", TEXT_FAINT, 11, wrap=True)
        v.addWidget(self.hint)
        v.addStretch()
        scroll.setWidget(box)
        outer.addWidget(scroll)

    def set_manager(self, manager):
        self.manager = manager
        self.attachments.vault_root = manager.vault_root

    def load(self, project, issue):
        self.project, self.issue = project, issue
        self.key.setText(f"{TYPE_ICONS.get(issue.type, '')}  {issue.key}")
        self.title.setText(issue.title)
        self.type.setCurrentIndex(max(0, self.type.findData(issue.type)))
        self.status.clear()
        for c in project.columns:
            self.status.addItem(("✓ " if c == project.done_column else "") + c, c)
        self.status.setCurrentIndex(max(0, self.status.findData(issue.status)))
        self.priority.setCurrentIndex(max(0, self.priority.findData(issue.priority)))
        banned = {issue.id} | {d.id for d in self.manager.descendants(issue)}
        self.parent.clear()
        self.parent.addItem("Sin padre", "")
        for other in sorted(self.manager.issues(project.id), key=lambda i: i.number):
            if other.id not in banned and other.type != T_SUBTASK:
                self.parent.addItem(f"{TYPE_ICONS.get(other.type, '')} {other.key} {other.title}", other.id)
        self.parent.setCurrentIndex(max(0, self.parent.findData(issue.parent)))
        self.start.set_value(issue.start)
        self.due.set_value(issue.due)
        set_time(self.time, issue.due_time or None)
        if issue.estimate_min:
            set_duration(self.estimate, issue.estimate_min)
        else:
            self.estimate.setCurrentIndex(0)
        self.reminder.set_value(issue.reminder)
        self.in_calendar.setChecked(issue.in_calendar)
        self.repeat.set_value(issue.repeat)
        self.labels.setText(", ".join(issue.labels))
        self.description.setPlainText(issue.description)
        done = issue.description.count("- [x]") + issue.description.count("- [X]")
        total = done + issue.description.count("- [ ]")
        self.checklist.setText(f"Checklist: {done}/{total}" if total else "")
        self.attachments.set_owner(issue.id, issue.attachments)
        self.hint.setText("")
        self._render_children()

    def _render_children(self):
        if not self.issue:
            self.subtasks_widget.set_items([])
            return
        kids = self.issue.children
        items = []
        for k in kids:
            items.append({
                "id": k.id,
                "title": f"{k.key}  {k.title}",
                "done": k.is_done,
                "badge": k.status,
            })
        self.subtasks_widget.set_items(items)

    def _add_child_subtask(self, title: str):
        if not self.issue or not self.project:
            return
        child = self.manager.create_issue(
            self.project.id, title, parent=self.issue.id, type=T_SUBTASK,
        )
        self.saved.emit(self.issue.id)
        self._reload()

    def _toggle_child_id(self, kid_id: str, value: bool):
        if not self.project:
            return
        column = self.project.done_column if value else self.project.columns[0]
        self.manager.move(self.project.id, kid_id, column, 10 ** 6)
        self.saved.emit(kid_id)
        QTimer.singleShot(0, self._reload)

    def _delete_child_id(self, kid_id: str):
        if not self.project:
            return
        self.manager.delete_issue(self.project.id, kid_id)
        self.saved.emit(self.issue.id)
        self._reload()

    def _toggle_child(self, kid, value):
        self._toggle_child_id(kid.id, value)


    def _reload(self):
        if self.issue is None:
            return
        fresh = self.manager.get_issue(self.project.id, self.issue.id)
        if fresh:
            self.load(self.manager.get(self.project.id), fresh)

    def _attachments_changed(self, refs):
        if self.issue is not None:
            self.manager.update_issue(self.project.id, self.issue.id, attachments=refs)
            self.saved.emit(self.issue.id)

    def save(self):
        if self.issue is None:
            return
        if not self.repeat.is_valid():
            self.hint.setText("Elige al menos un día para la repetición.")
            return
        rule = self.repeat.rule()
        if rule and not self.due.value():
            self.hint.setText("Un issue que se repite necesita una fecha de vencimiento.")
            return
        fields = dict(
            title=self.title.text().strip() or self.issue.title,
            type=self.type.currentData(), status=self.status.currentData(),
            priority=self.priority.currentData(), parent=self.parent.currentData() or "",
            start=self.start.value(), due=self.due.value(),
            due_time=self.time.currentData() or "", estimate_min=self.estimate.currentData(),
            reminder=self.reminder.value(), in_calendar=self.in_calendar.isChecked(),
            repeat=rule, labels=[s.strip() for s in self.labels.text().split(",") if s.strip()],
            description=self.description.toPlainText().strip(),
        )
        self.manager.update_issue(self.project.id, self.issue.id, **fields)
        self.hint.setText("Guardado ✓")
        iid = self.issue.id
        self.saved.emit(iid)
        QTimer.singleShot(0, self._reload)

    def _delete(self):
        if self.issue is None:
            return
        n = len(self.manager.descendants(self.issue))
        text = f"¿Eliminar {self.issue.key} «{self.issue.title}»" + (f" y sus {n} hijas" if n else "") + \
            "?\nSe mueve a la papelera de la vault."
        if QMessageBox.question(self, "Eliminar issue", text) != QMessageBox.Yes:
            return
        iid = self.issue.id
        self.manager.delete_issue(self.project.id, iid)
        self.issue = None
        self.deleted.emit(iid)

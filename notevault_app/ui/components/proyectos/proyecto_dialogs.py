"""Create / edit a project, including its Kanban workflow."""

from datetime import date

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QListWidget, QListWidgetItem, QCheckBox, QTextEdit,
    QAbstractItemView, QInputDialog, QMessageBox,
)

from ....core import vault_format
from ....core.project_manager import (
    PROJECT_STATUSES, derive_key, TYPE_ICONS, T_GOAL, T_TASK, T_SUBTASK,
)
from ..comun import (
    TEXT, TEXT_DIM, TEXT_FAINT, BORDER, BLUE, UI_FONT, CHECK_SS, line_edit, combo, flat_btn,
    label,
)
from ..comun.widgets import FormDialog, area_combo, ColourPicker, icon_edit, priority_combo
from ..tareas.date_picker import DateButton


class ColumnsEditor(QWidget):
    """Ordered list of columns with rename, add, remove and the done column."""

    def __init__(self, columns, done_column, parent=None):
        super().__init__(parent)
        self.renames: dict = {}
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(4)
        self.list = QListWidget()
        self.list.setFixedHeight(130)
        self.list.setDragDropMode(QAbstractItemView.InternalMove)
        self.list.setStyleSheet(
            f"QListWidget{{background:#1c1c1c;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
            f"font-size:12px;font-family:{UI_FONT};outline:none;}}QListWidget::item{{padding:4px 6px;}}"
            "QListWidget::item:selected{background:rgba(35,131,226,0.25);color:" + TEXT + ";}")
        for c in columns:
            item = QListWidgetItem(c)
            item.setData(Qt.UserRole, c)
            self.list.addItem(item)
        lay.addWidget(self.list)
        row = QHBoxLayout()
        row.setSpacing(4)
        for text, slot in (("+ Columna", self._add), ("Renombrar", self._rename), ("Quitar", self._remove)):
            b = flat_btn(text, height=26)
            b.clicked.connect(slot)
            row.addWidget(b)
        row.addStretch()
        lay.addLayout(row)
        drow = QHBoxLayout()
        drow.addWidget(label("Columna de «hecho»", TEXT_DIM, 11))
        self.done = combo([(c, c) for c in columns], 28)
        self.done.setCurrentIndex(max(0, self.done.findData(done_column)))
        drow.addWidget(self.done, 1)
        lay.addLayout(drow)
        lay.addWidget(label("Arrastra para ordenar. Los issues de una columna quitada pasan a la primera.",
                            TEXT_FAINT, 10, wrap=True))

    def _names(self):
        return [self.list.item(i).text() for i in range(self.list.count())]

    def _sync_done(self):
        current = self.done.currentData()
        self.done.clear()
        for c in self._names():
            self.done.addItem(c, c)
        index = self.done.findData(current)
        self.done.setCurrentIndex(index if index >= 0 else self.done.count() - 1)

    def _add(self):
        name, ok = QInputDialog.getText(self, "Nueva columna", "Nombre:")
        name = name.strip().replace(",", " ")
        if ok and name and name not in self._names():
            item = QListWidgetItem(name)
            item.setData(Qt.UserRole, None)
            self.list.addItem(item)
            self._sync_done()

    def _rename(self):
        item = self.list.currentItem()
        if item is None:
            return
        name, ok = QInputDialog.getText(self, "Renombrar columna", "Nombre:", text=item.text())
        name = name.strip().replace(",", " ")
        if ok and name and name not in self._names():
            original = item.data(Qt.UserRole)
            was_done = self.done.currentData() == item.text()
            item.setText(name)
            if original:
                self.renames[original] = name
            self._sync_done()
            if was_done:
                self.done.setCurrentIndex(self.done.findData(name))

    def _remove(self):
        item = self.list.currentItem()
        if item is None or self.list.count() <= 1:
            return
        self.list.takeItem(self.list.row(item))
        self._sync_done()

    def value(self):
        return self._names(), self.done.currentData(), dict(self.renames)


class ProjectDialog(FormDialog):
    def __init__(self, area_mgr, project=None, taken_keys=(), parent=None):
        super().__init__("Editar proyecto" if project else "Nuevo proyecto", parent, width=540)
        self.project = project
        self._taken = [k for k in taken_keys if not project or k != project.key]
        self.name = self.add_row("Nombre", line_edit("p. ej. Portafolio web", 32))
        self.key = self.add_row("Clave", line_edit("PW", 32))
        self.key.setMaxLength(6)
        self.key.setToolTip("Prefijo de los issues: PW-12")
        self._key_touched = bool(project)
        self.key.textEdited.connect(lambda _t: setattr(self, "_key_touched", True))
        self.name.textChanged.connect(self._suggest_key)
        self.icon = self.add_row("Icono", icon_edit(project.icon if project else "", "🌐"))
        self.status = self.add_row("Estado", combo([(s, s) for s in PROJECT_STATUSES], 32))
        self.area = self.add_row("Área", area_combo(area_mgr, project.area if project else "", 32))
        self.start = self.add_row("Inicio", DateButton(project.start if project else date.today(),
                                                       placeholder="Sin fecha", height=30))
        self.deadline = self.add_row("Entrega", DateButton(project.deadline if project else None,
                                                           placeholder="Sin fecha límite", height=30))
        self.colour = self.add_row("Color", ColourPicker(project.colour if project else "#2383e2",
                                                         ("#2383e2", "#4ade80", "#ff9632", "#f2555a",
                                                          "#a78bfa", "#38bdf8", "#facc15", "#fb7185")))
        self.in_calendar = QCheckBox("Mostrar sus issues con fecha en el calendario general")
        self.in_calendar.setStyleSheet(CHECK_SS)
        self.in_calendar.setChecked(project.in_calendar if project else True)
        self.add_wide(self.in_calendar)
        cols = project.columns if project else list(vault_format.DEFAULT_COLUMNS)
        done = project.done_column if project else "Hecho"
        self.columns = self.add_row("Flujo", ColumnsEditor(cols, done))
        if project:
            self.name.setText(project.name)
            self.key.setText(project.key)
            self.status.setCurrentIndex(max(0, self.status.findData(project.status)))
        self.finish()
        self.name.setFocus()

    def _suggest_key(self, text):
        if not self._key_touched:
            self.key.setText(derive_key(text, self._taken))

    def accept(self):
        if not self.name.text().strip():
            self.name.setFocus()
            return
        key = self.key.text().strip().upper()
        if not key.isalnum():
            QMessageBox.warning(self, "Clave", "La clave solo puede tener letras y números.")
            return
        if key in {k.upper() for k in self._taken}:
            QMessageBox.warning(self, "Clave", f"Ya hay un proyecto con la clave {key}.")
            return
        s, e = self.start.value(), self.deadline.value()
        if s and e and e < s:
            QMessageBox.warning(self, "Fechas", "La entrega es anterior al inicio.")
            return
        super().accept()

    def fields(self) -> dict:
        columns, done, renames = self.columns.value()
        return dict(name=self.name.text().strip(), key=self.key.text().strip().upper(),
                    icon=self.icon.text().strip(), status=self.status.currentData(),
                    area=self.area.currentData() or "", start=self.start.value(),
                    deadline=self.deadline.value(), colour=self.colour.value(),
                    in_calendar=self.in_calendar.isChecked(),
                    _columns=columns, _done=done, _renames=renames)


class CreateIssueDialog(FormDialog):
    """Diálogo completo para crear un issue o plantear una Submeta en el proyecto."""

    def __init__(self, project, manager, initial_type=T_TASK, initial_parent="",
                 initial_status="", parent=None):
        title = "Nueva Submeta" if initial_type == T_GOAL else "Crear issue"
        super().__init__(title, parent, width=460)
        self.project = project
        self.manager = manager

        self.title_input = self.add_row(
            "Título",
            line_edit("p. ej. Fase 1: Arquitectura y modelos" if initial_type == T_GOAL else "Título del issue", 32)
        )
        self.type_combo = self.add_row(
            "Tipo",
            combo([(f"{TYPE_ICONS[t]}  {t}", t) for t in vault_format.ISSUE_TYPES], 32)
        )
        self.type_combo.setCurrentIndex(max(0, self.type_combo.findData(initial_type)))

        self.parent_combo = self.add_row("Padre", combo([], 32))
        self._fill_parents(initial_parent)

        cols = [(c, c) for c in project.columns]
        self.status_combo = self.add_row("Estado", combo(cols, 32))
        if initial_status and self.status_combo.findData(initial_status) >= 0:
            self.status_combo.setCurrentIndex(self.status_combo.findData(initial_status))

        self.priority_combo = self.add_row("Prioridad", priority_combo(2, 32))
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)

        self.finish()
        self.title_input.setFocus()

    def _fill_parents(self, selected_parent=""):
        self.parent_combo.clear()
        self.parent_combo.addItem("Sin padre", "")
        for other in sorted(self.manager.issues(self.project.id), key=lambda i: (i.order, i.number)):
            if other.type in (T_GOAL, T_TASK):
                self.parent_combo.addItem(f"{TYPE_ICONS.get(other.type, '')} {other.key} {other.title}", other.id)
        if selected_parent:
            self.parent_combo.setCurrentIndex(max(0, self.parent_combo.findData(selected_parent)))

    def _on_type_changed(self):
        t = self.type_combo.currentData()
        if t == T_GOAL and self.parent_combo.currentIndex() != 0:
            # Submetas normalmente son raíz o agrupan tareas
            pass

    def accept(self):
        if not self.title_input.text().strip():
            self.title_input.setFocus()
            return
        super().accept()

    def fields(self) -> dict:
        return {
            "title": self.title_input.text().strip(),
            "type": self.type_combo.currentData(),
            "parent": self.parent_combo.currentData() or "",
            "status": self.status_combo.currentData(),
            "priority": self.priority_combo.currentData(),
        }


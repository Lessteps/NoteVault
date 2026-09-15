"""Create / edit dialogs for goals and areas."""

from datetime import date, timedelta

from PySide6.QtWidgets import QTextEdit, QCheckBox, QMessageBox

from ....core.goal_manager import GOAL_STATUS_COLOURS
from ....core import vault_format
from ..comun import TEXT, BORDER, BLUE, UI_FONT, CHECK_SS, line_edit, combo, flat_btn, RED
from ..comun.widgets import (
    FormDialog, priority_combo, area_combo, ColourPicker, icon_edit,
)
from ..tareas.date_picker import DateButton


def _text_edit(text: str = "", height: int = 90) -> QTextEdit:
    e = QTextEdit()
    e.setPlainText(text)
    e.setFixedHeight(height)
    e.setStyleSheet(
        f"QTextEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
        f"font-size:12px;padding:4px;font-family:{UI_FONT};}}QTextEdit:focus{{border-color:{BLUE};}}")
    return e


def _check(text: str, value: bool) -> QCheckBox:
    cb = QCheckBox(text)
    cb.setChecked(value)
    cb.setStyleSheet(CHECK_SS)
    return cb


class GoalDialog(FormDialog):
    def __init__(self, area_mgr, goal=None, preset_area: str = "", parent=None):
        super().__init__("Editar meta" if goal else "Nueva meta", parent, width=520)
        self.goal = goal
        self.name = self.add_row("Nombre", line_edit("p. ej. Ser desarrollador backend", 32))
        self.icon = self.add_row("Icono", icon_edit(goal.icon if goal else "🎯"))
        self.area = self.add_row("Área", area_combo(area_mgr, goal.area if goal else preset_area, 32))
        self.status = self.add_row("Estado", combo([(s, s) for s in vault_format.GOAL_STATUSES], 32))
        self.priority = self.add_row("Prioridad", priority_combo(goal.priority if goal else 2, 32))
        self.start = self.add_row("Inicio", DateButton(goal.start if goal else date.today(),
                                                       placeholder="Sin fecha", height=30))
        self.end = self.add_row("Fin", DateButton(goal.end if goal else None,
                                                  placeholder="Sin fecha de fin", height=30))
        self.colour = self.add_row("Color", ColourPicker(goal.colour if goal else "#3f51b5"))
        self.overview = self.add_wide(_check("Mostrar en la Vista General",
                                             goal.in_overview if goal else True))
        self.description = self.add_row("Descripción", _text_edit(goal.description if goal else ""))
        if goal:
            self.name.setText(goal.name)
            self.status.setCurrentIndex(max(0, self.status.findData(goal.status)))
        self.finish()
        self.name.setFocus()

    def accept(self):
        if not self.name.text().strip():
            self.name.setFocus()
            return
        start, end = self.start.value(), self.end.value()
        if start and end and end < start:
            QMessageBox.warning(self, "Fechas", "La fecha de fin es anterior a la de inicio.")
            return
        super().accept()

    def fields(self) -> dict:
        return dict(name=self.name.text().strip(), icon=self.icon.text().strip(),
                    area=self.area.currentData() or "", status=self.status.currentData(),
                    priority=self.priority.currentData(), start=self.start.value(),
                    end=self.end.value(), colour=self.colour.value(),
                    in_overview=self.overview.isChecked(),
                    description=self.description.toPlainText().strip())


class AreaDialog(FormDialog):
    def __init__(self, area=None, parent=None):
        super().__init__("Editar área" if area else "Nueva área", parent, width=440)
        self.area = area
        self.name = self.add_row("Nombre", line_edit("p. ej. Programación", 32))
        self.icon = self.add_row("Icono", icon_edit(area["icon"] if area else "", "💻"))
        self.colour = self.add_row("Color", ColourPicker(area["colour"] if area else "#3f51b5"))
        self.archive = None
        if area:
            self.name.setText(area["name"])
            self.archive = flat_btn("Archivar área", RED, RED, height=30)
            self.archive.setToolTip("Las metas, proyectos y hábitos no se borran: quedan «Sin área».")
            self.archive.clicked.connect(self._archive)
            self.buttons.insertWidget(0, self.archive)
        self.archived = False
        self.finish()
        self.name.setFocus()

    def _archive(self):
        self.archived = True
        super().accept()

    def accept(self):
        if not self.name.text().strip():
            self.name.setFocus()
            return
        super().accept()

    def fields(self) -> dict:
        return dict(name=self.name.text().strip(), icon=self.icon.text().strip(),
                    colour=self.colour.value())

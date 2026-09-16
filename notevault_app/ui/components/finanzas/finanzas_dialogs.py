"""Dialogs for Finanzas: a movement (gasto, ingreso, ahorro, retiro), a savings goal, a category."""

from datetime import date, datetime

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QCheckBox, QMessageBox, QTextEdit, QHBoxLayout, QWidget

from ....core import store
from ....core import finance_manager as fin
from ..comun import BORDER, BLUE, TEXT, TEXT_FAINT, UI_FONT, CHECK_SS, line_edit, combo, flat_btn, RED, label
from ..comun.widgets import FormDialog, MoneyEdit, ColourPicker, icon_edit
from ..comun.attachment_strip import AttachmentStrip
from ..programacion import RecurrencePicker, time_combo, set_time
from ..tareas.date_picker import DateButton

GOAL_COLOURS = ("#33b679", "#039be5", "#f6bf26", "#f4511e", "#8e24aa", "#e67c73", "#3f51b5", "#616161")


def category_combo(fm, kind: str, value: str = "", height: int = 30):
    items = [("Sin categoría", "")]
    items += [(f"{c['icon']}  {c['name']}".strip(), c["id"]) for c in fm.categories(kind)]
    box = combo(items, height)
    box.setCurrentIndex(max(0, box.findData(value or "")))
    return box


def goal_combo(fm, value: str = "", height: int = 30, empty: str = "Ahorro general"):
    items = [(empty, "")] + [(f"{g['icon']}  {g['name']}", g["id"]) for g in fm.goals()]
    box = combo(items, height)
    box.setCurrentIndex(max(0, box.findData(value or "")))
    return box


class MovementDialog(FormDialog):
    """Create (movement=None) or edit a movement. `self.deleted` is set when removed."""

    def __init__(self, fm, day: date, kind: str = fin.GASTO, movement=None, preset=None, parent=None):
        super().__init__("Editar movimiento" if movement else f"Nuevo {fin.TYPE_LABELS[kind].lower()}",
                         parent, width=520)
        self.fm, self.orig_day, self.movement = fm, day, movement
        self.deleted = False
        base = dict(preset or {}, **(movement or {}))
        self.mid = base.get("id") or store.new_id("mv")
        self.kind = combo([(fin.TYPE_LABELS[t], t) for t in fin.vault_format.MOVEMENT_TYPES], 32)
        self.kind.setCurrentIndex(max(0, self.kind.findData(base.get("type", kind))))
        self.add_row("Tipo", self.kind)
        self.amount = self.add_row("Importe", MoneyEdit(base.get("amount_cents"), height=36))
        self.day = self.add_row("Fecha", DateButton(day, placeholder="Hoy", height=30))
        self.time = self.add_row("Hora", time_combo(empty_label="Sin hora"))
        set_time(self.time, base.get("time") or (None if movement else datetime.now().strftime("%H:%M")))
        self.what = self.add_row("En qué", line_edit("p. ej. Almuerzo", 32))
        self.what.setText(base.get("what", ""))
        self.category_cap = label("Categoría", TEXT_FAINT, 12)
        self.category = category_combo(fm, fin.GASTO, base.get("category", ""), 32)
        self.add_row("Categoría", self.category)
        self.goal = self.add_row("Meta", goal_combo(fm, base.get("goal", ""), 32))
        self.reason = self.add_row("Razón", line_edit("Por qué (opcional)", 32))
        self.reason.setText(base.get("reason", ""))
        self.attachments = self.add_row("Facturas", AttachmentStrip(fm.vault_root, "finanzas", self.mid,
                                                                     base.get("attachments", [])))
        if movement:
            delete = flat_btn("Eliminar", RED, RED, height=32)
            delete.clicked.connect(self._delete)
            self.buttons.insertWidget(0, delete)
        self.kind.currentIndexChanged.connect(self._kind_changed)
        self._kind_changed()
        self.finish()
        self.amount.setFocus()

    def _kind_changed(self, *_):
        kind = self.kind.currentData()
        money = kind in (fin.GASTO, fin.INGRESO)
        current = self.category.currentData()
        self.category.clear()
        if money:
            self.category.addItem("Sin categoría", "")
            for c in self.fm.categories(kind):
                self.category.addItem(f"{c['icon']}  {c['name']}".strip(), c["id"])
            self.category.setCurrentIndex(max(0, self.category.findData(current or "")))
        self.category.setEnabled(money)
        self.goal.setEnabled(not money)

    def _delete(self):
        if QMessageBox.question(self, "Eliminar movimiento",
                                "¿Eliminar este movimiento? Sus facturas van a la papelera.") == QMessageBox.Yes:
            self.fm.delete(self.orig_day, self.movement["id"])
            self.deleted = True
            super().accept()

    def accept(self):
        cents = self.amount.cents()
        if not cents:
            self.amount.setFocus()
            return
        kind = self.kind.currentData()
        fields = dict(what=self.what.text().strip(), reason=self.reason.text().strip(),
                      time=self.time.currentData() or "",
                      category=self.category.currentData() or "" if kind in (fin.GASTO, fin.INGRESO) else "",
                      goal=self.goal.currentData() or "" if kind in (fin.AHORRO, fin.RETIRO) else "",
                      attachments=self.attachments.refs)
        new_day = self.day.value() or self.orig_day
        if self.movement:
            self.fm.update(self.orig_day, self.movement["id"], type=kind, amount_cents=cents, **fields)
            if new_day != self.orig_day:
                self.fm.move(self.movement["id"], self.orig_day, new_day)
        else:
            self.fm.add(new_day, kind, cents, id=self.mid, **fields)
        super().accept()

    def reject(self):
        if not self.movement:
            for ref in self.attachments.refs:     # files pasted into a movement never saved
                fin.ma.remove(self.fm.vault_root, ref, "finanzas-adjuntos")
        super().reject()


class GoalDialog(FormDialog):
    def __init__(self, fm, goal=None, parent=None):
        super().__init__("Editar meta financiera" if goal else "Nueva meta financiera", parent, width=540)
        self.fm, self.goal = fm, goal
        g = goal or {}
        self.name = self.add_row("Nombre", line_edit("p. ej. Moto", 32))
        self.name.setText(g.get("name", ""))
        self.icon = self.add_row("Icono", icon_edit(g.get("icon", "💰"), "🏍"))
        self.target = self.add_row("Objetivo", MoneyEdit(g.get("target_cents"), height=36))
        self.suggested = self.add_row("Aporte sugerido", MoneyEdit(g.get("suggested_cents") or None, height=32,
                                                                   placeholder="Importe que propone la casilla"))
        self.start = self.add_row("Inicio", DateButton(store.parse_day(g["start"]) if g.get("start") else date.today(),
                                                       placeholder="Hoy", height=30))
        self.deadline = self.add_row("Fecha límite", DateButton(store.parse_day(g["deadline"]) if g.get("deadline") else None,
                                                                placeholder="Sin fecha límite", height=30))
        self.colour = self.add_row("Color", ColourPicker(g.get("colour", GOAL_COLOURS[0]), GOAL_COLOURS))
        self.show_daily = QCheckBox("Mostrar en Diario (aparece «Ahorro …» con casilla)")
        self.show_daily.setStyleSheet(CHECK_SS)
        self.show_daily.setChecked(g.get("show_in_daily", True))
        self.add_wide(self.show_daily)
        cadence = g.get("cadence") or {"mode": "rule", "rule": "daily"}
        self.mode = self.add_row("Casilla", combo([("Días concretos (regla)", "rule"),
                                                   ("Una vez por semana", "week"),
                                                   ("Una vez por mes", "month")], 32))
        self.mode.setCurrentIndex(self.mode.findData(cadence["period"] if cadence["mode"] == "period" else "rule"))
        self.rule = RecurrencePicker(allow_none=False, show_range=False)
        self.rule.set_value(cadence.get("rule", "daily"))
        self.add_row("", self.rule)
        self.mode.currentIndexChanged.connect(lambda _i: self.rule.setVisible(self.mode.currentData() == "rule"))
        self.rule.setVisible(self.mode.currentData() == "rule")
        self.status = self.add_row("Estado", combo([(s, s) for s in fin.vault_format.FINANCE_GOAL_STATUSES], 32))
        self.status.setCurrentIndex(max(0, self.status.findData(g.get("status", fin.G_ACTIVE))))
        self.notes = QTextEdit()
        self.notes.setFixedHeight(70)
        self.notes.setPlainText(g.get("notes", ""))
        self.notes.setStyleSheet(
            f"QTextEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
            f"font-size:12px;padding:4px;font-family:{UI_FONT};}}")
        self.add_row("Notas", self.notes)
        self.finish()
        self.name.setFocus()

    def accept(self):
        if not self.name.text().strip():
            self.name.setFocus()
            return
        if not self.target.cents():
            self.target.setFocus()
            return
        if self.mode.currentData() == "rule" and not self.rule.is_valid():
            return
        super().accept()

    def fields(self) -> dict:
        mode = self.mode.currentData()
        cadence = {"mode": "rule", "rule": self.rule.rule()} if mode == "rule" else {"mode": "period", "period": mode}
        start, deadline = self.start.value(), self.deadline.value()
        return dict(name=self.name.text().strip(), icon=self.icon.text().strip() or "💰",
                    target_cents=self.target.cents(), suggested_cents=self.suggested.cents() or 0,
                    start=start.isoformat() if start else "", deadline=deadline.isoformat() if deadline else "",
                    colour=self.colour.value(), show_in_daily=self.show_daily.isChecked(), cadence=cadence,
                    status=self.status.currentData(), notes=self.notes.toPlainText().strip())


class CategoryDialog(FormDialog):
    def __init__(self, category=None, kind: str = fin.GASTO, parent=None):
        super().__init__("Editar categoría" if category else "Nueva categoría", parent, width=440)
        c = category or {}
        self.name = self.add_row("Nombre", line_edit("p. ej. Mascotas", 32))
        self.name.setText(c.get("name", ""))
        self.icon = self.add_row("Icono", icon_edit(c.get("icon", ""), "🐶"))
        self.kind = self.add_row("Tipo", combo([("Gasto", fin.GASTO), ("Ingreso", fin.INGRESO)], 32))
        self.kind.setCurrentIndex(max(0, self.kind.findData(c.get("kind", kind))))
        self.budget = self.add_row("Presupuesto mensual", MoneyEdit(c.get("budget_month_cents") or None, height=32,
                                                                    placeholder="Sin presupuesto"))
        self.colour = self.add_row("Color", ColourPicker(c.get("colour", GOAL_COLOURS[0]), GOAL_COLOURS))
        self.archived = False
        if category:
            arch = flat_btn("Archivar", RED, RED, height=32)
            arch.setToolTip("Los movimientos existentes conservan la categoría")
            arch.clicked.connect(self._archive)
            self.buttons.insertWidget(0, arch)
        self.finish()

    def _archive(self):
        self.archived = True
        super().accept()

    def accept(self):
        if not self.name.text().strip():
            return
        super().accept()

    def fields(self) -> dict:
        return dict(name=self.name.text().strip(), icon=self.icon.text().strip(), kind=self.kind.currentData(),
                    budget_month_cents=self.budget.cents() or 0, colour=self.colour.value())

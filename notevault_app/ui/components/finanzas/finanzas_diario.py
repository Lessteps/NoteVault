"""Diario: the daily-use screen — quick entry, savings checks, the day's table and totals."""

from datetime import date, datetime, timedelta

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QScrollArea, QFrame, QLayout, QPushButton, QDialog,
    QMessageBox,
)

from ....core import finance_manager as fin
from ....core import store
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, UI_FONT, label,
    clear_layout, flat_btn, line_edit,
)
from ..comun.widgets import MoneyEdit, StatTile, Check
from ..comun.spreadsheet import SpreadsheetTable, Column
from ..calendario import long_date
from .finanzas_dialogs import MovementDialog, category_combo, goal_combo

YELLOW = "#eab308"


def big_button(text: str, colour: str) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(46)
    b.setStyleSheet(
        f"QPushButton{{background:{BG_CARD};border:1px solid {BORDER};border-left:4px solid {colour};"
        f"border-radius:10px;color:{TEXT};font-size:15px;font-weight:600;padding:0 22px;min-width:0px;"
        f"font-family:{UI_FONT};}}QPushButton:hover{{border-color:{colour};}}")
    return b


def movement_columns(fm, with_date: bool = False):
    cats = fm.category_map()
    goals = {g["id"]: g for g in fm.goals()}

    def cat_text(v, row):
        if row.get("_kind", "data") != "data":
            return ""
        if row.get("goal"):
            g = goals.get(row["goal"])
            return f"{g['icon']} {g['name']}" if g else "Meta"
        c = cats.get(v or "")
        return f"{c['icon']} {c['name']}".strip() if c else ("—" if row["type"] in (fin.GASTO, fin.INGRESO) else "Ahorro general")

    def amount_text(v, row):
        if v is None:
            return ""
        sign = -1 if row.get("type") in (fin.GASTO, fin.AHORRO) else 1
        return fin.format_money(v * sign if row.get("_kind", "data") == "data" else v, sign=row.get("_kind", "data") == "data")

    def amount_colour(v, row):
        if row.get("_kind", "data") != "data":
            return (GREEN if (v or 0) >= 0 else RED) if row.get("_signed") else None
        return fin.TYPE_COLOURS.get(row.get("type"))

    cols = []
    if with_date:
        cols.append(Column("_date", "Día", 110, fmt=lambda v, r: v.strftime("%a %d/%m").capitalize() if v else ""))
    cols += [
        Column("time", "Hora", 60),
        Column("type", "Tipo", 80, fmt=lambda v, r: fin.TYPE_LABELS.get(v, "") if r.get("_kind", "data") == "data" else "",
               colour=lambda v, r: fin.TYPE_COLOURS.get(v)),
        Column("category", "Categoría", 150, fmt=cat_text),
        Column("what", "En qué"),
        Column("reason", "Razón", 200),
        Column("amount_cents", "Importe", 130, Qt.AlignRight, fmt=amount_text, colour=amount_colour,
               sort_key=lambda v: v or 0),
        Column("attachments", "📎", 36, Qt.AlignCenter,
               fmt=lambda v, r: str(len(v)) if v else ""),
    ]
    return cols


class FinanzasDiario(QWidget):
    data_changed = Signal()

    def __init__(self, fm, parent=None):
        super().__init__(parent)
        self.fm = fm
        self.day = date.today()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(22, 18, 22, 22)
        page.setSpacing(12)
        page.setSizeConstraint(QLayout.SetMinimumSize)

        top = QHBoxLayout()
        top.addWidget(label("💰  Diario", TEXT, 22, True))
        top.addSpacing(12)
        self.subtitle = label("", TEXT_DIM, 14)
        top.addWidget(self.subtitle)
        top.addStretch()
        for text, delta in (("‹", -1), ("Hoy", 0), ("›", 1)):
            b = flat_btn(text, height=30)
            b.clicked.connect(lambda _c=False, d=delta: self._move(d))
            top.addWidget(b)
        page.addLayout(top)

        buttons = QHBoxLayout()
        buttons.setSpacing(10)
        for text, kind, colour in (("+  Gasto", fin.GASTO, RED), ("+  Ingreso", fin.INGRESO, GREEN),
                                   ("+  Ahorro", fin.AHORRO, YELLOW)):
            b = big_button(text, colour)
            b.clicked.connect(lambda _c=False, k=kind: self.open_dialog(k))
            buttons.addWidget(b)
        buttons.addStretch()
        page.addLayout(buttons)

        quick = QFrame()
        quick.setObjectName("quickRow")
        quick.setAttribute(Qt.WA_StyledBackground, True)
        quick.setStyleSheet(f"QFrame#quickRow{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
        q = QHBoxLayout(quick)
        q.setContentsMargins(12, 10, 12, 10)
        q.setSpacing(8)
        q.addWidget(label("Registro rápido", TEXT_FAINT, 11, True))
        self.q_amount = MoneyEdit(height=32)
        self.q_amount.setFixedWidth(140)
        self.q_what = line_edit("En qué", 32)
        self.q_category = category_combo(fm, fin.GASTO, "", 32)
        self.q_category.setFixedWidth(170)
        self.q_reason = line_edit("Razón (opcional)", 32)
        clip = flat_btn("📎", height=32)
        clip.setToolTip("Abrir el formulario completo para adjuntar la factura")
        clip.clicked.connect(self._quick_with_attachment)
        save = flat_btn("Guardar ↵", height=32)
        save.clicked.connect(self._quick_save)
        for w in (self.q_amount, self.q_what, self.q_category, self.q_reason, clip, save):
            q.addWidget(w)
        q.setStretch(2, 1)
        q.setStretch(4, 1)
        for w in (self.q_amount, self.q_what, self.q_reason):
            w.returnPressed.connect(self._quick_save)
        self.q_hint = label("Gasto: escribe el importe, en qué y Enter", TEXT_FAINT, 11)
        page.addWidget(quick)
        page.addWidget(self.q_hint)

        self.checks_box = QVBoxLayout()
        self.checks_box.setSpacing(4)
        page.addLayout(self.checks_box)

        tiles = QHBoxLayout()
        tiles.setSpacing(10)
        self.t_gasto = StatTile("$ 0", "Gastos", RED)
        self.t_ingreso = StatTile("$ 0", "Ingresos", GREEN)
        self.t_ahorro = StatTile("$ 0", "Ahorro", YELLOW)
        self.t_balance = StatTile("$ 0", "Balance del día")
        for t in (self.t_gasto, self.t_ingreso, self.t_ahorro, self.t_balance):
            tiles.addWidget(t)
        page.addLayout(tiles)

        self.table = SpreadsheetTable(movement_columns(fm))
        self.table.setMinimumHeight(260)
        self.table.row_activated.connect(self._edit)
        page.addWidget(self.table)
        page.addWidget(label("Doble clic en una fila para editarla o adjuntar facturas.", TEXT_FAINT, 11))
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

        for key, kind in (("Ctrl+G", fin.GASTO), ("Ctrl+I", fin.INGRESO), ("Ctrl+H", fin.AHORRO)):
            sc = QShortcut(QKeySequence(key), self)
            sc.setContext(Qt.WidgetWithChildrenShortcut)
            sc.activated.connect(lambda k=kind: self.open_dialog(k))

    def set_manager(self, fm):
        self.fm = fm
        self.table.model_.columns = movement_columns(fm)
        self.refresh()

    def _move(self, delta):
        self.day = date.today() if delta == 0 else self.day + timedelta(days=delta)
        self.refresh()

    def refresh(self):
        d = self.day
        self.subtitle.setText(("Hoy, " if d == date.today() else "") + long_date(d) + f" de {d.year}")
        current = self.q_category.currentData()
        self.q_category.clear()
        self.q_category.addItem("Sin categoría", "")
        for c in self.fm.categories(fin.GASTO):
            self.q_category.addItem(f"{c['icon']}  {c['name']}".strip(), c["id"])
        self.q_category.setCurrentIndex(max(0, self.q_category.findData(current or "")))
        self.table.model_.columns = movement_columns(self.fm)

        movements = sorted(self.fm.day(d), key=lambda m: (m.get("time") or "99", m.get("created", "")))
        t = fin.totals(movements)
        self.t_gasto.set(fin.format_money(t[fin.GASTO]))
        self.t_ingreso.set(fin.format_money(t[fin.INGRESO]))
        self.t_ahorro.set(fin.format_money(t[fin.AHORRO] - t[fin.RETIRO]))
        self.t_balance.set(fin.format_money(t["balance"], sign=True), GREEN if t["balance"] >= 0 else RED)
        rows = [dict(m, _day=d) for m in movements]
        if rows:
            rows.append({"_kind": "total", "what": "TOTAL DEL DÍA", "amount_cents": t["balance"],
                         "_signed": True})
        self.table.set_rows(rows)
        self._render_checks()

    def _render_checks(self):
        clear_layout(self.checks_box)
        checks = self.fm.due_checks(self.day)
        if not checks:
            return
        self.checks_box.addWidget(label("AHORROS DE HOY", TEXT_FAINT, 10, True))
        for goal, checked, ids in checks:
            row = QHBoxLayout()
            row.setSpacing(8)
            cb = Check(checked, goal["colour"], 18)
            cb.toggled_by_user.connect(lambda v, g=goal, i=ids, c=cb: self._toggle_saving(g, v, i, c))
            row.addWidget(cb)
            period = {"week": " (esta semana)", "month": " (este mes)"}.get(goal["cadence"].get("period", ""), "")
            row.addWidget(label(f"{goal['icon']}  Ahorro {goal['name']}{period}", TEXT_FAINT if checked else TEXT, 13))
            if goal["suggested_cents"]:
                row.addWidget(label(f"— {fin.format_money(goal['suggested_cents'])}", TEXT_DIM, 12))
            row.addStretch()
            pace = self.fm.pace(goal["id"])
            pct = round(100 * pace["saved"] / goal["target_cents"]) if goal["target_cents"] else 0
            row.addWidget(label(f"llevas {fin.format_money(pace['saved'])} de "
                                f"{fin.format_money(goal['target_cents'])} ({pct} %)", TEXT_FAINT, 11))
            self.checks_box.addLayout(row)

    def _toggle_saving(self, goal, value, ids, cb):
        if value:
            dlg = MovementDialog(self.fm, self.day, fin.AHORRO,
                                 preset={"type": fin.AHORRO, "goal": goal["id"],
                                         "amount_cents": goal["suggested_cents"] or None,
                                         "what": f"Ahorro {goal['name']}"}, parent=self)
            if dlg.exec() != QDialog.Accepted:
                cb.set_checked(False)
                return
        else:
            if QMessageBox.question(self, "Quitar ahorro",
                                    f"¿Quitar el ahorro para «{goal['name']}» registrado "
                                    f"{'hoy' if goal['cadence']['mode'] == 'rule' else 'en este periodo'}?") != QMessageBox.Yes:
                cb.set_checked(True)
                return
            for d, m in self.fm.range(*self._period_of(goal)):
                if m["id"] in ids:
                    self.fm.delete(d, m["id"])
        self._changed()

    def _period_of(self, goal):
        if goal["cadence"]["mode"] == "period":
            return self.fm._period(goal, self.day)
        return self.day, self.day

    def open_dialog(self, kind):
        dlg = MovementDialog(self.fm, self.day, kind, parent=self)
        if dlg.exec() == QDialog.Accepted:
            self._changed()

    def _quick_with_attachment(self):
        preset = {"type": fin.GASTO, "amount_cents": self.q_amount.cents(), "what": self.q_what.text().strip(),
                  "category": self.q_category.currentData() or "", "reason": self.q_reason.text().strip()}
        dlg = MovementDialog(self.fm, self.day, fin.GASTO, preset=preset, parent=self)
        if dlg.exec() == QDialog.Accepted:
            self._clear_quick()
            self._changed()

    def _quick_save(self):
        cents = self.q_amount.cents()
        if not cents:
            self.q_hint.setText("Escribe un importe: 12.500, 12500 o 12,5k")
            self.q_amount.setFocus()
            return
        now = datetime.now().strftime("%H:%M") if self.day == date.today() else ""
        self.fm.add(self.day, fin.GASTO, cents, what=self.q_what.text().strip(),
                    category=self.q_category.currentData() or "", reason=self.q_reason.text().strip(), time=now)
        self.q_hint.setText(f"Guardado: {fin.format_money(cents)} {self.q_what.text().strip()}")
        self._clear_quick()
        self._changed()

    def _clear_quick(self):
        self.q_amount.set_cents(None)
        self.q_what.clear()
        self.q_reason.clear()
        self.q_amount.setFocus()

    def _edit(self, row):
        movement = self.fm.get(self.day, row["id"])
        if movement is None:
            return
        dlg = MovementDialog(self.fm, self.day, movement["type"], movement=movement, parent=self)
        if dlg.exec() == QDialog.Accepted:
            self._changed()

    def _changed(self):
        QTimer.singleShot(0, self.refresh)
        self.data_changed.emit()

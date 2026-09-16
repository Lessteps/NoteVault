"""Semanal, Mensual and Anual: spreadsheet views with subtotals, totals and CSV export."""

from datetime import date, timedelta

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QLayout, QDialog,
)

from ....core import finance_manager as fin
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, RED, GREEN, label, clear_layout, flat_btn,
    combo, line_edit,
)
from ..comun.widgets import StatTile, BlockProgress
from ..comun.spreadsheet import SpreadsheetTable, Column
from ..comun.charts import BarChart, DonutChart
from ..calendario import MONTHS_ES, WEEKDAYS_ES
from .finanzas_dialogs import MovementDialog
from .finanzas_diario import movement_columns

YELLOW = "#eab308"
MONTHS_SHORT = [m[:3].capitalize() for m in MONTHS_ES]


def _money(v, _row=None):
    return "" if v is None else fin.format_money(v)


def _panel():
    f = QFrame()
    f.setObjectName("finPanel")
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"QFrame#finPanel{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
    lay = QVBoxLayout(f)
    lay.setContentsMargins(14, 12, 14, 12)
    lay.setSpacing(8)
    return f, lay


class _SheetView(QWidget):
    """Common frame: title, navigation, filters, CSV, and the sum tiles at the bottom."""

    data_changed = Signal()
    title_text = ""

    def __init__(self, fm, parent=None):
        super().__init__(parent)
        self.fm = fm
        self.anchor = date.today()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self.page = QVBoxLayout(content)
        self.page.setContentsMargins(22, 18, 22, 22)
        self.page.setSpacing(12)
        self.page.setSizeConstraint(QLayout.SetMinimumSize)
        top = QHBoxLayout()
        top.addWidget(label(self.title_text, TEXT, 22, True))
        top.addSpacing(12)
        self.period = label("", TEXT_DIM, 15, True)
        top.addWidget(self.period)
        top.addStretch()
        for text, delta in (("‹", -1), ("Hoy", 0), ("›", 1)):
            b = flat_btn(text, height=30)
            b.clicked.connect(lambda _c=False, d=delta: self._nav(d))
            top.addWidget(b)
        self.page.addLayout(top)
        bar = QHBoxLayout()
        bar.setSpacing(6)
        self.f_kind = combo([("Tipo: todos", "")] + [(fin.TYPE_LABELS[t], t) for t in fin.vault_format.MOVEMENT_TYPES], 28)
        self.f_category = combo([("Categoría: todas", "")], 28)
        self.f_search = line_edit("🔎  Buscar en qué o razón…", 28)
        self.f_search.setFixedWidth(220)
        for w in (self.f_kind, self.f_category):
            w.currentIndexChanged.connect(lambda _i: self.refresh())
            bar.addWidget(w)
        self.f_search.textChanged.connect(lambda _t: self.refresh())
        bar.addWidget(self.f_search)
        self.extra_bar = bar
        bar.addStretch()
        csv = flat_btn("Exportar CSV", height=28)
        csv.clicked.connect(self._export)
        bar.addWidget(csv)
        self.page.addLayout(bar)
        self.body = QVBoxLayout()
        self.body.setSpacing(12)
        self.page.addLayout(self.body)
        tiles = QHBoxLayout()
        tiles.setSpacing(10)
        self.t_gasto = StatTile("$ 0", "Gastos", RED)
        self.t_ingreso = StatTile("$ 0", "Ingresos", GREEN)
        self.t_ahorro = StatTile("$ 0", "Ahorro neto", YELLOW)
        self.t_balance = StatTile("$ 0", "Balance")
        for t in (self.t_gasto, self.t_ingreso, self.t_ahorro, self.t_balance):
            tiles.addWidget(t)
        self.page.addLayout(tiles)
        self.page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)
        self.table = None

    def set_manager(self, fm):
        self.fm = fm
        self.refresh()

    def _nav(self, delta):
        raise NotImplementedError

    def bounds(self):
        raise NotImplementedError

    def _fill_categories(self):
        current = self.f_category.currentData()
        self.f_category.blockSignals(True)
        self.f_category.clear()
        self.f_category.addItem("Categoría: todas", "")
        for c in self.fm.categories(include_archived=True):
            self.f_category.addItem(f"{c['icon']}  {c['name']}".strip(), c["id"])
        self.f_category.setCurrentIndex(max(0, self.f_category.findData(current or "")))
        self.f_category.blockSignals(False)

    def pairs(self):
        first, last = self.bounds()
        return self.fm.search(self.fm.range(first, last), self.f_search.text(),
                              self.f_kind.currentData() or "", self.f_category.currentData() or "")

    def set_tiles(self, t):
        self.t_gasto.set(fin.format_money(t[fin.GASTO]))
        self.t_ingreso.set(fin.format_money(t[fin.INGRESO]))
        self.t_ahorro.set(fin.format_money(t[fin.AHORRO] - t[fin.RETIRO]))
        self.t_balance.set(fin.format_money(t["balance"], sign=True), GREEN if t["balance"] >= 0 else RED)

    def movement_rows(self, pairs, group_label):
        """Rows grouped by day with a SUBTOTAL per day and a final TOTAL."""
        rows, by_day = [], {}
        for d, m in pairs:
            by_day.setdefault(d, []).append(m)
        for d in sorted(by_day):
            movs = sorted(by_day[d], key=lambda m: (m.get("time") or "99", m.get("created", "")))
            rows.append({"_kind": "group", "_label": group_label(d)})
            rows.extend(dict(m, _date=d, _day=d) for m in movs)
            t = fin.totals(movs)
            rows.append({"_kind": "subtotal", "what": f"Subtotal · gastos {fin.format_money(t[fin.GASTO])} · "
                                                      f"ingresos {fin.format_money(t[fin.INGRESO])}",
                         "amount_cents": t["balance"], "_signed": True})
        total = fin.totals(m for _d, m in pairs)
        if pairs:
            rows.append({"_kind": "total", "what": "TOTAL", "amount_cents": total["balance"], "_signed": True})
        return rows, total

    def _edit(self, row):
        d = row.get("_day")
        movement = self.fm.get(d, row["id"]) if d and row.get("id") else None
        if movement is None:
            return
        if MovementDialog(self.fm, d, movement["type"], movement=movement, parent=self).exec() == QDialog.Accepted:
            QTimer.singleShot(0, self.refresh)
            self.data_changed.emit()

    def _export(self):
        if self.table is not None:
            first, last = self.bounds()
            self.table.export_csv(self, f"finanzas_{first.isoformat()}_{last.isoformat()}.csv")


class FinanzasSemanal(_SheetView):
    title_text = "📅  Semanal"

    def __init__(self, fm, parent=None):
        super().__init__(fm, parent)
        self.mode = combo([("Por movimiento", "mov"), ("Por categoría", "cat")], 28)
        self.mode.currentIndexChanged.connect(lambda _i: self.refresh())
        self.extra_bar.insertWidget(0, self.mode)

    def bounds(self):
        return fin.FinanceManager.week_bounds(self.anchor)

    def _nav(self, delta):
        self.anchor = date.today() if delta == 0 else self.anchor + timedelta(days=7 * delta)
        self.refresh()

    def refresh(self):
        self._fill_categories()
        clear_layout(self.body)
        first, last = self.bounds()
        self.period.setText(f"{first.day} {MONTHS_ES[first.month - 1][:3]} – {last.day} "
                            f"{MONTHS_ES[last.month - 1][:3]} {last.year}")
        pairs = self.pairs()
        if self.mode.currentData() == "cat":
            self.table, total = category_matrix(self.fm, pairs, [first + timedelta(days=i) for i in range(7)],
                                                lambda d: WEEKDAYS_ES[d.weekday()][:3].capitalize() + f" {d.day}")
        else:
            self.table = SpreadsheetTable(movement_columns(self.fm))
            rows, total = self.movement_rows(
                pairs, lambda d: f"{WEEKDAYS_ES[d.weekday()].capitalize()} {d.day} de {MONTHS_ES[d.month - 1]}")
            self.table.set_rows(rows)
            self.table.row_activated.connect(self._edit)
        self.table.setMinimumHeight(420)
        self.body.addWidget(self.table)
        self.set_tiles(total)


def category_matrix(fm, pairs, columns, col_label):
    """Categories × columns (days or months) with a TOTAL column and TOTAL row, expenses only."""
    cats = fm.category_map()
    keys = [c.isoformat() if hasattr(c, "isoformat") else str(c) for c in columns]

    def key_of(d):
        if isinstance(columns[0], date):
            return d.isoformat()
        return str(d.month)

    table_cols = [Column("_label", "Categoría", 190)]
    table_cols += [Column(k, col_label(c), 96, Qt.AlignRight, fmt=_money) for k, c in zip(keys, columns)]
    table_cols.append(Column("_total", "TOTAL", 120, Qt.AlignRight, fmt=_money))
    rows: dict = {}
    for d, m in pairs:
        if m["type"] != fin.GASTO:
            continue
        cid = m.get("category", "")
        row = rows.setdefault(cid, {"_label": "", "_total": 0})
        k = key_of(d)
        row[k] = row.get(k, 0) + m["amount_cents"]
        row["_total"] += m["amount_cents"]
    out = []
    for cid, row in sorted(rows.items(), key=lambda kv: -kv[1]["_total"]):
        c = cats.get(cid)
        row["_label"] = f"{c['icon']}  {c['name']}".strip() if c else "Sin categoría"
        out.append(row)
    total_row = {"_kind": "total", "_label": "TOTAL GASTOS", "_total": sum(r["_total"] for r in out)}
    for k in keys:
        total_row[k] = sum(r.get(k, 0) for r in out)
    if out:
        out.append(total_row)
    table = SpreadsheetTable(table_cols)
    table.set_rows(out)
    return table, fin.totals(m for _d, m in pairs)


class FinanzasMensual(_SheetView):
    title_text = "🗓  Mensual"

    def __init__(self, fm, parent=None):
        super().__init__(fm, parent)
        self.mode = combo([("Por movimiento", "mov"), ("Por categoría", "cat")], 28)
        self.mode.currentIndexChanged.connect(lambda _i: self.refresh())
        self.extra_bar.insertWidget(0, self.mode)

    def bounds(self):
        return fin.FinanceManager.month_bounds(self.anchor.year, self.anchor.month)

    def _nav(self, delta):
        if delta == 0:
            self.anchor = date.today()
        else:
            m = self.anchor.month - 1 + delta
            self.anchor = date(self.anchor.year + m // 12, m % 12 + 1, 1)
        self.refresh()

    def refresh(self):
        self._fill_categories()
        clear_layout(self.body)
        first, last = self.bounds()
        self.period.setText(f"{MONTHS_ES[first.month - 1].capitalize()} de {first.year}")
        pairs = self.pairs()
        days = [first + timedelta(days=i) for i in range((last - first).days + 1)]

        charts = QGridLayout()
        charts.setSpacing(12)
        p1, l1 = _panel()
        daily = BarChart("Gasto por día", RED, 190)
        daily.value_format = lambda v: fin.format_money(int(v))
        spent = {d: 0 for d in days}
        for d, m in pairs:
            if m["type"] == fin.GASTO:
                spent[d] += m["amount_cents"]
        daily.set_data([str(d.day) for d in days], [spent[d] / 100 for d in days],
                       highlight={(date.today() - first).days} if first <= date.today() <= last else ())
        daily.value_format = lambda v: fin.format_money(int(v * 100))
        l1.addWidget(daily)
        p2, l2 = _panel()
        donut = DonutChart("Gasto por categoría", 190)
        donut.value_format = lambda v: fin.format_money(int(v * 100))
        cats = self.fm.category_map()
        by_cat = self.fm.by_category(pairs, fin.GASTO)
        donut.set_data([((cats[c]["name"] if c in cats else "Sin categoría"), v / 100,
                         cats[c]["colour"] if c in cats else "#616161") for c, v in
                        sorted(by_cat.items(), key=lambda kv: -kv[1])],
                       fin.format_money(sum(by_cat.values())))
        l2.addWidget(donut)
        charts.addWidget(p1, 0, 0)
        charts.addWidget(p2, 0, 1)
        charts.setColumnStretch(0, 3)
        charts.setColumnStretch(1, 2)
        self.body.addLayout(charts)

        side = QHBoxLayout()
        side.setSpacing(12)
        p3, l3 = _panel()
        l3.addWidget(label("Presupuesto por categoría", TEXT, 12, True))
        budgets = self.fm.budget_used(first.year, first.month)
        if not budgets:
            l3.addWidget(label("Define presupuestos mensuales en Categorías.", TEXT_FAINT, 11))
        for c, used, budget in budgets:
            row = QHBoxLayout()
            name = label(f"{c['icon']}  {c['name']}".strip(), TEXT_DIM, 12)
            name.setFixedWidth(150)
            row.addWidget(name)
            frac = used / budget if budget else 0
            if budget:
                row.addWidget(BlockProgress(min(1.0, frac), RED if frac > 1 else c["colour"]))
            row.addWidget(label(f"{fin.format_money(used)}" + (f" / {fin.format_money(budget)}" if budget else ""),
                                RED if budget and used > budget else TEXT_DIM, 11))
            row.addStretch()
            l3.addLayout(row)
        p4, l4 = _panel()
        this, prev = self.fm.compare_month(first.year, first.month)
        l4.addWidget(label("Comparación con el mes anterior", TEXT, 12, True))
        for key, name in ((fin.GASTO, "Gastos"), (fin.INGRESO, "Ingresos"), (fin.AHORRO, "Ahorro"),
                          ("balance", "Balance")):
            row = QHBoxLayout()
            row.addWidget(label(name, TEXT_DIM, 12))
            row.addStretch()
            diff = this[key] - prev[key]
            pct = f" ({'+' if diff >= 0 else ''}{round(100 * diff / prev[key])} %)" if prev[key] else ""
            good = diff <= 0 if key == fin.GASTO else diff >= 0
            row.addWidget(label(f"{fin.format_money(this[key])}  vs  {fin.format_money(prev[key])}", TEXT, 12))
            row.addWidget(label(f"{fin.format_money(diff, sign=True)}{pct}", GREEN if good else RED, 11))
            l4.addLayout(row)
        side.addWidget(p3, 3)
        side.addWidget(p4, 2)
        self.body.addLayout(side)

        if self.mode.currentData() == "cat":
            self.table, total = category_matrix(self.fm, pairs, days, lambda d: str(d.day))
        else:
            self.table = SpreadsheetTable(movement_columns(self.fm))
            rows, total = self.movement_rows(
                pairs, lambda d: f"{WEEKDAYS_ES[d.weekday()].capitalize()} {d.day}")
            self.table.set_rows(rows)
            self.table.row_activated.connect(self._edit)
        self.table.setMinimumHeight(420)
        self.body.addWidget(self.table)
        self.body.addWidget(label(f"SUMATORIO DE {MONTHS_ES[first.month - 1].upper()}", TEXT_FAINT, 10, True))
        self.set_tiles(total)


class FinanzasAnual(_SheetView):
    title_text = "📊  Anual"

    def bounds(self):
        return date(self.anchor.year, 1, 1), date(self.anchor.year, 12, 31)

    def _nav(self, delta):
        self.anchor = date.today() if delta == 0 else date(self.anchor.year + delta, 1, 1)
        self.refresh()

    def refresh(self):
        self._fill_categories()
        clear_layout(self.body)
        year = self.anchor.year
        self.period.setText(str(year))
        pairs = self.pairs()
        p, lay = _panel()
        chart = BarChart("Balance por mes", GREEN, 190)
        months = [(m, fin.totals([mv for d, mv in pairs if d.month == m])) for m in range(1, 13)]
        chart.set_data(MONTHS_SHORT, [max(0, t[fin.GASTO]) / 100 for _m, t in months], colours=[RED] * 12)
        chart.title = "Gasto por mes"
        chart.value_format = lambda v: fin.format_money(int(v * 100))
        lay.addWidget(chart)
        self.body.addWidget(p)
        cols = [Column("_label", "Mes", 140)]
        for key, name, colour in ((fin.GASTO, "Gastos", RED), (fin.INGRESO, "Ingresos", GREEN),
                                  (fin.AHORRO, "Ahorro", YELLOW), (fin.RETIRO, "Retiros", "#ff9632"),
                                  ("balance", "Balance", None)):
            cols.append(Column(key, name, 150, Qt.AlignRight, fmt=_money,
                               colour=(lambda c: (lambda v, r: c))(colour) if colour else
                               (lambda v, r: GREEN if (v or 0) >= 0 else RED)))
        rows = [dict(t, _label=MONTHS_ES[m - 1].capitalize()) for m, t in months]
        total = fin.totals(mv for _d, mv in pairs)
        rows.append(dict(total, _kind="total", _label=f"TOTAL {year}"))
        self.table = SpreadsheetTable(cols)
        self.table.set_rows(rows)
        self.table.setMinimumHeight(420)
        self.body.addWidget(self.table)
        self.set_tiles(total)

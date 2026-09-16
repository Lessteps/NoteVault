"""Metas financieras (cards + detail with the savings log) and Categorías."""

from datetime import date, timedelta

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QLayout, QDialog, QCheckBox,
    QMessageBox, QStackedWidget,
)

from ....core import finance_manager as fin
from ....core import store
from ....core import module_attachments as ma
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, RED, GREEN, ORANGE, CHECK_SS, label, chip,
    clear_layout, flat_btn, primary_btn,
)
from ..comun.widgets import DashboardCard, BlockProgress, StatTile
from ..comun.charts import LineChart
from ..comun.spreadsheet import SpreadsheetTable, Column
from ..comun.attachment_strip import _Thumb, ImageViewer
from ..calendario import MONTHS_ES
from .finanzas_dialogs import GoalDialog, CategoryDialog, MovementDialog

YELLOW = "#eab308"


def cadence_text(goal) -> str:
    c = goal["cadence"]
    if c["mode"] == "period":
        return "Una vez por semana" if c["period"] == "week" else "Una vez por mes"
    return fin.Recurrence.parse(c["rule"]).describe()


def _scroll_page():
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
    scroll.setWidget(content)
    return scroll, page


class FinanzasMetas(QWidget):
    data_changed = Signal()

    def __init__(self, fm, parent=None):
        super().__init__(parent)
        self.fm = fm
        self.current = None
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self.stack = QStackedWidget()
        lay.addWidget(self.stack)
        board, self.board = _scroll_page()
        detail, self.detail = _scroll_page()
        self.stack.addWidget(board)
        self.stack.addWidget(detail)

    def set_manager(self, fm):
        self.fm = fm
        self.current = None
        self.refresh()

    def refresh(self):
        if self.current and self.fm.get_goal(self.current):
            self.open_goal(self.current)
        else:
            self.current = None
            self.stack.setCurrentIndex(0)
            self._render_board()

    # ── Cards ─────────────────────────────────────────────────────────────

    def _render_board(self):
        clear_layout(self.board)
        top = QHBoxLayout()
        top.addWidget(label("🎯  Metas financieras", TEXT, 22, True))
        top.addStretch()
        new = primary_btn("+  Nueva meta", 30)
        new.clicked.connect(self._new_goal)
        top.addWidget(new)
        self.board.addLayout(top)
        self.board.addWidget(label("Separadas de las metas generales. Actívalas en Diario para ver su casilla "
                                   "«Ahorro …» los días que toque.", TEXT_FAINT, 12, wrap=True))
        goals = self.fm.goals()
        if not goals:
            empty = label("Aún no hay metas de ahorro. Crea una, por ejemplo «Moto».", TEXT_FAINT, 13)
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(140)
            self.board.addWidget(empty)
        grid = QGridLayout()
        grid.setSpacing(14)
        cols = max(1, (self.width() - 44) // 360) if self.width() > 400 else 3
        today = date.today()
        for i, g in enumerate(goals):
            grid.addWidget(self._card(g, today), i // cols, i % cols)
        for c in range(cols):
            grid.setColumnStretch(c, 1)
        self.board.addLayout(grid)
        general = self.fm.general_savings()
        if general:
            self.board.addWidget(label(f"Ahorro general (sin meta): {fin.format_money(general)}", TEXT_DIM, 12))
        self.board.addStretch()

    def _card(self, g, today):
        pace = self.fm.pace(g["id"], today)
        frac = pace["saved"] / g["target_cents"] if g["target_cents"] else 0
        card = DashboardCard(g["colour"])
        card.clicked.connect(lambda gid=g["id"]: self.open_goal(gid))
        b = card.body
        head = QHBoxLayout()
        head.addWidget(label(g["icon"], TEXT, 22))
        head.addWidget(label(g["name"], TEXT, 15, True), 1)
        head.addWidget(chip(g["status"], GREEN if g["status"] == fin.G_DONE else
                            (ORANGE if g["status"] == fin.G_PAUSED else TEXT_DIM)))
        b.addLayout(head)
        prog = QHBoxLayout()
        prog.addWidget(BlockProgress(min(1.0, frac), g["colour"]))
        prog.addStretch()
        b.addLayout(prog)
        b.addWidget(label(f"Llevas {fin.format_money(pace['saved'])} de {fin.format_money(g['target_cents'])} "
                          f"({round(frac * 100)} %)", TEXT, 12))
        b.addWidget(label(f"Falta {fin.format_money(pace['remaining'])}", TEXT_DIM, 12))
        if pace["per_week"]:
            b.addWidget(label(f"Ritmo necesario: {fin.format_money(pace['per_day'])}/día · "
                              f"{fin.format_money(pace['per_week'])}/semana", ORANGE, 11))
        proj = self.fm.projection(g["id"], today)
        if pace["remaining"]:
            b.addWidget(label(f"Proyección: {proj.strftime('%d/%m/%Y')}" if proj else
                              "Proyección: sin ahorros en los últimos 30 días", TEXT_FAINT, 11))
        foot = QHBoxLayout()
        show = QCheckBox("Mostrar en Diario")
        show.setStyleSheet(CHECK_SS)
        show.setChecked(g["show_in_daily"])
        show.toggled.connect(lambda v, gid=g["id"]: self._set(gid, show_in_daily=v))
        foot.addWidget(show)
        foot.addStretch()
        foot.addWidget(label(cadence_text(g), TEXT_FAINT, 11))
        b.addLayout(foot)
        return card

    def _set(self, gid, **fields):
        self.fm.update_goal(gid, **fields)
        self.data_changed.emit()

    def _new_goal(self):
        dlg = GoalDialog(self.fm, None, self)
        if dlg.exec() == QDialog.Accepted:
            f = dlg.fields()
            g = self.fm.create_goal(f.pop("name"), f.pop("target_cents"), **f)
            self.data_changed.emit()
            self.open_goal(g["id"])

    # ── Detail ────────────────────────────────────────────────────────────

    def open_goal(self, gid):
        g = self.fm.get_goal(gid)
        if g is None:
            return
        self.current = gid
        self.stack.setCurrentIndex(1)
        clear_layout(self.detail)
        page = self.detail
        top = QHBoxLayout()
        back = flat_btn("‹  Metas financieras", height=28)
        back.clicked.connect(self._back)
        top.addWidget(back)
        top.addStretch()
        add = primary_btn("+  Ahorro", 30)
        add.clicked.connect(lambda: self._add_movement(g, fin.AHORRO))
        top.addWidget(add)
        withdraw = flat_btn("−  Retiro", height=30)
        withdraw.clicked.connect(lambda: self._add_movement(g, fin.RETIRO))
        top.addWidget(withdraw)
        edit = flat_btn("Editar…", height=30)
        edit.clicked.connect(lambda: self._edit_goal(g))
        top.addWidget(edit)
        delete = flat_btn("Eliminar", RED, RED, height=30)
        delete.clicked.connect(lambda: self._delete_goal(g))
        top.addWidget(delete)
        page.addLayout(top)
        head = QHBoxLayout()
        head.addWidget(label(g["icon"], TEXT, 30))
        head.addWidget(label(g["name"], TEXT, 24, True))
        head.addSpacing(10)
        head.addWidget(chip(g["status"], GREEN if g["status"] == fin.G_DONE else TEXT_DIM))
        head.addWidget(chip(cadence_text(g), TEXT_DIM))
        if g["show_in_daily"]:
            head.addWidget(chip("En Diario", g["colour"]))
        head.addStretch()
        page.addLayout(head)

        pace = self.fm.pace(gid)
        frac = pace["saved"] / g["target_cents"] if g["target_cents"] else 0
        tiles = QHBoxLayout()
        tiles.setSpacing(10)
        tiles.addWidget(StatTile(fin.format_money(pace["saved"]), "Llevas", GREEN,
                                 f"de {fin.format_money(g['target_cents'])} ({round(frac * 100)} %)"))
        tiles.addWidget(StatTile(fin.format_money(pace["remaining"]), "Falta"))
        tiles.addWidget(StatTile(fin.format_money(pace["per_week"]) if pace["per_week"] else "—",
                                 "Ritmo por semana", ORANGE,
                                 f"{pace['days_left']} días a la fecha límite" if pace["days_left"] is not None else
                                 "sin fecha límite"))
        proj = self.fm.projection(gid)
        tiles.addWidget(StatTile(proj.strftime("%d/%m/%Y") if proj else "—", "Proyección", TEXT,
                                 "con el ritmo de los últimos 30 días"))
        page.addLayout(tiles)
        page.addWidget(BlockProgress(min(1.0, frac), g["colour"], blocks=30, block=12))

        hist = self.fm.history(gid)
        if hist["days"]:
            first = hist["days"][0][0]
            last = date.today() if date.today() > hist["days"][-1][0] else hist["days"][-1][0]
            by_day = {d: net for d, net, _m in hist["days"]}
            labels, values, acc = [], [], 0
            d = first
            while d <= last:
                acc += by_day.get(d, 0)
                labels.append(d.strftime("%d/%m"))
                values.append(acc / 100)
                d += timedelta(days=1)
            chart = LineChart("Ahorro acumulado", 220)
            series = [("Ahorrado", values, g["colour"])]
            if g["target_cents"]:
                series.append(("Objetivo", [g["target_cents"] / 100] * len(values), TEXT_FAINT, True))
            chart.set_data(labels, series)
            box = QFrame()
            box.setObjectName("finChart")
            box.setAttribute(Qt.WA_StyledBackground, True)
            box.setStyleSheet(f"QFrame#finChart{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
            bl = QVBoxLayout(box)
            bl.setContentsMargins(14, 12, 14, 12)
            bl.addWidget(chart)
            page.addWidget(box)

        page.addWidget(label("REGISTRO DE AHORROS", TEXT_FAINT, 10, True))
        cols = [Column("_date", "Fecha", 120, fmt=lambda v, r: v.strftime("%d/%m/%Y") if v else ""),
                Column("type", "Tipo", 80, fmt=lambda v, r: fin.TYPE_LABELS.get(v, "") if v else "",
                       colour=lambda v, r: fin.TYPE_COLOURS.get(v)),
                Column("what", "Concepto"),
                Column("reason", "Razón", 240),
                Column("amount_cents", "Importe", 130, Qt.AlignRight,
                       fmt=lambda v, r: "" if v is None else fin.format_money(
                           -v if r.get("type") == fin.RETIRO else v, sign=r.get("_kind", "data") == "data"),
                       colour=lambda v, r: fin.TYPE_COLOURS.get(r.get("type")) if r.get("type") else None),
                Column("attachments", "📎", 36, Qt.AlignCenter, fmt=lambda v, r: str(len(v)) if v else "")]
        rows, month_key, month_sum = [], None, 0
        for d, net, movs in hist["days"]:
            key = f"{d.year}-{d.month:02d}"
            if key != month_key:
                if month_key:
                    rows.append({"_kind": "subtotal", "what": "Subtotal del mes", "amount_cents": month_sum})
                month_key, month_sum = key, 0
                rows.append({"_kind": "group", "_label": f"{MONTHS_ES[d.month - 1].capitalize()} {d.year}"})
            for m in movs:
                rows.append(dict(m, _date=d, _day=d))
            month_sum += net
        if month_key:
            rows.append({"_kind": "subtotal", "what": "Subtotal del mes", "amount_cents": month_sum})
            rows.append({"_kind": "total", "what": "TOTAL AHORRADO", "amount_cents": pace["saved"]})
        table = SpreadsheetTable(cols)
        table.set_rows(rows)
        table.setMinimumHeight(max(160, min(460, 40 + 28 * len(rows))))
        table.row_activated.connect(self._edit_movement)
        page.addWidget(table)
        if not rows:
            page.addWidget(label("Todavía no hay ahorros para esta meta.", TEXT_FAINT, 12))

        refs = [ref for _d, _n, movs in hist["days"] for m in movs for ref in m.get("attachments", [])]
        page.addWidget(label("CAPTURAS Y FACTURAS", TEXT_FAINT, 10, True))
        gallery = QHBoxLayout()
        gallery.setSpacing(6)
        for ref in refs:
            t = _Thumb(self.fm.vault_root, ref)
            t.open_requested.connect(self._open_ref)
            gallery.addWidget(t)
        if not refs:
            gallery.addWidget(label("Sin capturas", TEXT_FAINT, 11))
        gallery.addStretch()
        page.addLayout(gallery)
        if g["notes"]:
            page.addWidget(label(g["notes"], TEXT_DIM, 12, wrap=True))
        page.addStretch()

    def _open_ref(self, ref):
        path = ma.resolve(self.fm.vault_root, ref)
        if path is not None and path.suffix.lower() != ".pdf":
            ImageViewer(path, self).exec()

    def _back(self):
        self.current = None
        self.refresh()

    def _add_movement(self, g, kind):
        preset = {"type": kind, "goal": g["id"], "what": f"{'Ahorro' if kind == fin.AHORRO else 'Retiro'} {g['name']}",
                  "amount_cents": g["suggested_cents"] or None if kind == fin.AHORRO else None}
        if MovementDialog(self.fm, date.today(), kind, preset=preset, parent=self).exec() == QDialog.Accepted:
            self.data_changed.emit()
            QTimer.singleShot(0, lambda: self.open_goal(g["id"]))

    def _edit_movement(self, row):
        d = row.get("_day")
        movement = self.fm.get(d, row.get("id")) if d else None
        if movement and MovementDialog(self.fm, d, movement["type"], movement=movement,
                                       parent=self).exec() == QDialog.Accepted:
            self.data_changed.emit()
            QTimer.singleShot(0, self.refresh)

    def _edit_goal(self, g):
        dlg = GoalDialog(self.fm, g, self)
        if dlg.exec() == QDialog.Accepted:
            self.fm.update_goal(g["id"], **dlg.fields())
            self.fm.refresh_goal_status(g["id"])
            self.data_changed.emit()
            QTimer.singleShot(0, self.refresh)

    def _delete_goal(self, g):
        if QMessageBox.question(self, "Eliminar meta",
                                f"¿Eliminar la meta «{g['name']}»? Va a la papelera; los movimientos "
                                "de ahorro se conservan en el registro diario.") == QMessageBox.Yes:
            self.fm.delete_goal(g["id"])
            self.current = None
            self.data_changed.emit()
            QTimer.singleShot(0, self.refresh)


class FinanzasCategorias(QWidget):
    data_changed = Signal()

    def __init__(self, fm, parent=None):
        super().__init__(parent)
        self.fm = fm
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        scroll, self.page = _scroll_page()
        lay.addWidget(scroll)

    def set_manager(self, fm):
        self.fm = fm
        self.refresh()

    def refresh(self):
        clear_layout(self.page)
        top = QHBoxLayout()
        top.addWidget(label("🏷  Categorías", TEXT, 22, True))
        top.addStretch()
        new = primary_btn("+  Nueva categoría", 30)
        new.clicked.connect(lambda: self._edit(None))
        top.addWidget(new)
        self.page.addLayout(top)
        today = date.today()
        spent = self.fm.by_category(self.fm.month(today.year, today.month), fin.GASTO)
        earned = self.fm.by_category(self.fm.month(today.year, today.month), fin.INGRESO)
        for kind, title, sums in ((fin.GASTO, "GASTOS", spent), (fin.INGRESO, "INGRESOS", earned)):
            self.page.addWidget(label(f"{title} · este mes", TEXT_FAINT, 10, True))
            for c in self.fm.categories(kind):
                row = QHBoxLayout()
                name = label(f"{c['icon']}  {c['name']}".strip(), c["colour"], 13, True)
                name.setFixedWidth(200)
                row.addWidget(name)
                used = sums.get(c["id"], 0)
                if kind == fin.GASTO and c["budget_month_cents"]:
                    frac = used / c["budget_month_cents"]
                    row.addWidget(BlockProgress(min(1.0, frac), RED if frac > 1 else c["colour"]))
                    row.addWidget(label(f"{fin.format_money(used)} / {fin.format_money(c['budget_month_cents'])}",
                                        RED if frac > 1 else TEXT_DIM, 12))
                else:
                    row.addWidget(label(fin.format_money(used), TEXT_DIM, 12))
                row.addStretch()
                edit = flat_btn("Editar", height=26)
                edit.clicked.connect(lambda _c=False, cat=c: self._edit(cat))
                row.addWidget(edit)
                self.page.addLayout(row)
            self.page.addSpacing(8)
        self.page.addStretch()

    def _edit(self, cat):
        dlg = CategoryDialog(cat, parent=self)
        if dlg.exec() != QDialog.Accepted:
            return
        f = dlg.fields()
        if cat is None:
            self.fm.create_category(f["name"], f["kind"], f["icon"], f["colour"], f["budget_month_cents"])
        elif dlg.archived:
            self.fm.archive_category(cat["id"])
        else:
            self.fm.update_category(cat["id"], **f)
        self.data_changed.emit()
        QTimer.singleShot(0, self.refresh)

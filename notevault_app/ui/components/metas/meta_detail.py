"""Detalle de meta: header, stat tiles and the Submetas / Hoy / Historial / Notas tabs."""

from datetime import date

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QStackedWidget, QSplitter, QScrollArea, QFrame,
    QTextEdit, QPushButton, QLayout, QMessageBox,
)

from ....core import goal_manager as gm
from ....core.store import fmt_num
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, ORANGE, UI_FONT,
    label, chip, priority_chip, clear_layout, flat_btn, primary_btn, line_edit,
    PRIORITY_COLOURS, PRIORITY_NAMES,
)
from ..comun.nav import _rgba
from ..comun.widgets import StatTile, BlockProgress
from ..comun.tree_list import TreeList
from ..comun.charts import HeatStrip, BarChart
from .item_editor import ItemEditor
from .metas_hoy import TodayList
from .metas_board import date_line

TABS = (("submetas", "Submetas"), ("hoy", "Hoy"), ("historial", "Historial"), ("notas", "Notas"))


class _Tab(QPushButton):
    def __init__(self, text, parent=None):
        super().__init__(text, parent)
        self.setCheckable(True)
        self.setCursor(Qt.PointingHandCursor)
        self.setFixedHeight(32)
        self.setStyleSheet(
            f"QPushButton{{background:transparent;border:none;border-bottom:2px solid transparent;"
            f"color:{TEXT_DIM};font-size:13px;padding:0 14px;min-width:0px;font-family:{UI_FONT};}}"
            f"QPushButton:hover{{color:{TEXT};}}"
            f"QPushButton:checked{{color:{TEXT};border-bottom:2px solid {BLUE};font-weight:600;}}")


class MetaDetail(QWidget):
    back_requested = Signal()
    edit_goal_requested = Signal(str)
    data_changed = Signal()

    def __init__(self, goal_mgr, area_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        self.goal = None
        self.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(self)
        page.setContentsMargins(22, 14, 22, 14)
        page.setSpacing(10)

        top = QHBoxLayout()
        back = flat_btn("‹  Metas", height=28)
        back.clicked.connect(self.back_requested.emit)
        top.addWidget(back)
        top.addStretch()
        self.edit_btn = flat_btn("Editar meta…", height=28)
        self.edit_btn.clicked.connect(lambda: self.goal and self.edit_goal_requested.emit(self.goal.id))
        top.addWidget(self.edit_btn)
        self.delete_btn = flat_btn("Eliminar", RED, RED, height=28)
        self.delete_btn.clicked.connect(self._delete_goal)
        top.addWidget(self.delete_btn)
        page.addLayout(top)

        head = QHBoxLayout()
        head.setSpacing(10)
        self.icon = label("", TEXT, 28)
        head.addWidget(self.icon)
        self.name = line_edit("", 40)
        self.name.setStyleSheet(
            f"QLineEdit{{background:transparent;border:1px solid transparent;border-radius:6px;"
            f"color:{TEXT};font-size:22px;font-weight:700;padding:0 6px;font-family:{UI_FONT};}}"
            f"QLineEdit:hover{{border-color:{BORDER};}}QLineEdit:focus{{border-color:{BLUE};"
            "background:#202020;}")
        self.name.editingFinished.connect(self._rename)
        head.addWidget(self.name, stretch=1)
        page.addLayout(head)
        self.chips = QHBoxLayout()
        self.chips.setSpacing(6)
        page.addLayout(self.chips)

        self.tiles = QHBoxLayout()
        self.tiles.setSpacing(10)
        self.t_progress = StatTile("0 %", "Progreso", GREEN)
        self.t_items = StatTile("0/0", "Submetas hechas")
        self.t_adh7 = StatTile("—", "Adherencia 7 días")
        self.t_adh30 = StatTile("—", "Adherencia 30 días")
        self.t_streak = StatTile("0", "Mejor racha activa", ORANGE)
        self.t_left = StatTile("—", "Días restantes")
        for t in (self.t_progress, self.t_items, self.t_adh7, self.t_adh30, self.t_streak, self.t_left):
            self.tiles.addWidget(t)
        page.addLayout(self.tiles)
        self.progress_bar = BlockProgress(0, GREEN, blocks=30, block=10)
        page.addWidget(self.progress_bar)

        tabs = QHBoxLayout()
        tabs.setSpacing(0)
        self.tab_buttons = {}
        for key, text in TABS:
            b = _Tab(text)
            b.clicked.connect(lambda _c=False, k=key: self.show_tab(k))
            self.tab_buttons[key] = b
            tabs.addWidget(b)
        tabs.addStretch()
        self.add_btn = primary_btn("+  Submeta", 30)
        self.add_btn.clicked.connect(lambda: self._add_item(""))
        tabs.addWidget(self.add_btn)
        page.addLayout(tabs)

        self.stack = QStackedWidget()
        page.addWidget(self.stack, stretch=1)

        # Submetas
        split = QSplitter(Qt.Horizontal)
        split.setHandleWidth(8)
        split.setChildrenCollapsible(False)
        self.tree = TreeList(("Submeta", "Prioridad", "Programación", "Progreso", "Hábitos"),
                             (90, 170, 90, 130))
        self.tree.checked.connect(self._tree_checked)
        self.tree.itemSelectionChanged.connect(self._tree_selected)
        self.tree.activated_id.connect(self._open_item)
        self.tree.moved.connect(self._tree_moved)
        self.tree.indent_requested.connect(self._indent)
        self.tree.add_child_requested.connect(self._add_item)
        self.tree.delete_requested.connect(self._delete_item)
        split.addWidget(self.tree)
        self.editor = ItemEditor(goal_mgr, habit_mgr)
        self.editor.saved.connect(self._item_saved)
        self.editor.deleted.connect(lambda _i: self._changed(keep_editor=False))
        self.editor.add_child_requested.connect(self._add_item)
        self.editor.closed.connect(lambda: self.editor.hide())
        self.editor.hide()
        split.addWidget(self.editor)
        split.setStretchFactor(0, 1)
        self.stack.addWidget(split)

        # Hoy
        hoy = QWidget()
        hv = QVBoxLayout(hoy)
        hv.setContentsMargins(0, 8, 0, 0)
        self.today = TodayList(goal_mgr, area_mgr)
        self.today.data_changed.connect(lambda: self._changed())
        hv.addWidget(self.today)
        hv.addStretch()
        self.stack.addWidget(self._scroll(hoy))

        # Historial
        hist = QWidget()
        self.hist = QVBoxLayout(hist)
        self.hist.setContentsMargins(0, 8, 0, 0)
        self.hist.setSpacing(8)
        self.hist.setSizeConstraint(QLayout.SetMinimumSize)
        self.stack.addWidget(self._scroll(hist))

        # Notas
        self.notes = QTextEdit()
        self.notes.setPlaceholderText("Describe la meta, por qué importa y cómo sabrás que la lograste…")
        self.notes.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;"
            f"color:{TEXT};font-size:13px;padding:10px;font-family:{UI_FONT};}}")
        self._notes_timer = QTimer(self)
        self._notes_timer.setSingleShot(True)
        self._notes_timer.setInterval(800)
        self._notes_timer.timeout.connect(self._save_notes)
        self.notes.textChanged.connect(self._notes_timer.start)
        self.stack.addWidget(self.notes)
        self.show_tab("submetas")

    def _scroll(self, widget):
        s = QScrollArea()
        s.setWidgetResizable(True)
        s.setFrameShape(QFrame.NoFrame)
        s.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        widget.setStyleSheet(f"background:{BG_PAGE};")
        s.setWidget(widget)
        return s

    def set_managers(self, goal_mgr, area_mgr, habit_mgr):
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        self.editor.set_managers(goal_mgr, habit_mgr)
        self.today.goal_mgr, self.today.area_mgr = goal_mgr, area_mgr
        self.goal = None

    # ── Loading ───────────────────────────────────────────────────────────

    def load(self, gid: str):
        if self.goal is None or self.goal.id != gid:
            self.editor.hide()
        self.goal = self.goal_mgr.get_goal(gid)
        self.refresh()

    def show_tab(self, key):
        for k, b in self.tab_buttons.items():
            b.setChecked(k == key)
        self.stack.setCurrentIndex([k for k, _t in TABS].index(key))
        self.add_btn.setVisible(key == "submetas")
        self._tab = key
        if self.goal is not None:
            self._render_tab()

    def refresh(self):
        if self.goal is None:
            return
        self.goal = self.goal_mgr.get_goal(self.goal.id)
        if self.goal is None:
            self.back_requested.emit()
            return
        g, today = self.goal, date.today()
        self.icon.setText(g.icon or "🎯")
        if not self.name.hasFocus():
            self.name.setText(g.name)
        clear_layout(self.chips)
        area = self.area_mgr.get(g.area) if g.area else None
        self.chips.addWidget(chip(f"{area['icon']} {area['name']}".strip() if area and not area["archived"]
                                  else "Sin área", area["colour"] if area else TEXT_DIM))
        self.chips.addWidget(chip(g.status, gm.GOAL_STATUS_COLOURS.get(g.status, TEXT_DIM)))
        self.chips.addWidget(priority_chip(g.priority))
        text, colour = date_line(g, today)
        self.chips.addWidget(chip(text, colour))
        if g.in_overview:
            self.chips.addWidget(chip("◎ En Vista General", TEXT_FAINT))
        self.chips.addStretch()

        progress = self.goal_mgr.progress(g, today)
        self.t_progress.set(f"{round(progress * 100)} %")
        self.progress_bar.set_fraction(progress, g.colour)
        done, total = self.goal_mgr.counts(g, today)
        self.t_items.set(f"{done}/{total}")
        for tile, days in ((self.t_adh7, 7), (self.t_adh30, 30)):
            adh = self.goal_mgr.adherence(g, days, today)
            tile.set(f"{round(adh * 100)} %" if adh is not None else "—",
                     GREEN if adh is not None and adh >= 0.8 else (ORANGE if adh is not None else TEXT_DIM))
        streaks = [self.goal_mgr.streak(i, g, today) for i in self.goal_mgr.leaves(g.id) if i.repeating]
        self.t_streak.set(str(max(streaks) if streaks else 0))
        left = g.days_left(today)
        if g.is_overdue(today):
            self.t_left.set("Vencida", RED, f"terminó el {g.end.strftime('%d/%m/%Y')}", RED)
        else:
            self.t_left.set("—" if left is None else str(left), TEXT,
                            f"hasta el {g.end.strftime('%d/%m/%Y')}" if g.end else "")
        self._render_tab()

    def _render_tab(self):
        key = getattr(self, "_tab", "submetas")
        if key == "submetas":
            self._render_tree()
        elif key == "hoy":
            self.today.goal_id = self.goal.id
            self.today.day = date.today()
            self.today.refresh()
        elif key == "historial":
            self._render_history()
        elif key == "notas":
            if not self.notes.hasFocus():
                self.notes.blockSignals(True)
                self.notes.setPlainText(self.goal.description)
                self.notes.blockSignals(False)

    # ── Tree ──────────────────────────────────────────────────────────────

    def _render_tree(self):
        g, today = self.goal, date.today()

        def node(item):
            leaf = item.is_leaf
            done = self.goal_mgr.is_done_on(item, today) if leaf else self.goal_mgr.branch_done(item, today)
            prog = self.goal_mgr.item_progress(item, g, today)
            if not leaf:
                progress_text = f"{round(prog * 100)} %"
            elif item.measurable:
                value = self.goal_mgr.value_on(item, today)
                progress_text = f"{fmt_num(value or 0)}/{fmt_num(item.target)} {item.unit}".strip()
            elif item.repeating:
                progress_text = f"{round(prog * 100)} % cumplido"
            else:
                progress_text = "Hecha" if done else item.status
            schedule = item.schedule_text() or "—"
            if item.in_calendar:
                schedule = "📅 " + schedule
            late = not item.repeating and item.due and item.due < today and not done
            habits = []
            for hid in item.habit_links:
                h = self.habit_mgr.get_habit(hid) if self.habit_mgr else None
                if h:
                    habits.append(h.get("icon") or h["name"][:8])
            return {
                "id": item.id,
                "text": item.name + (f"   ({len(item.children)})" if not leaf else ""),
                "checked": done if leaf else None,
                "bold": not leaf,
                "tooltip": item.notes or item.name,
                "columns": [
                    (f"{PRIORITY_NAMES[item.priority]}", PRIORITY_COLOURS[item.priority]),
                    (schedule, RED if late else TEXT_DIM),
                    (progress_text, GREEN if (leaf and done) or prog >= 1 else TEXT_DIM),
                    (" ".join(habits), "#7c5af0"),
                ],
                "children": [node(c) for c in item.children],
            }

        self.tree.set_nodes([node(i) for i in self.goal_mgr.tree(g.id)])

    def _tree_checked(self, iid, value):
        self.goal_mgr.set_done(self.goal.id, iid, date.today(), value)
        self._changed()

    def _tree_selected(self):
        iid = self.tree.current_id()
        if iid and self.editor.isVisible():
            self._open_item(iid)

    def _open_item(self, iid):
        item = self.goal_mgr.get_item(self.goal.id, iid)
        if item is None:
            return
        self.editor.load(self.goal, item)
        self.editor.show()

    def _tree_moved(self, iid, parent, index):
        self.goal_mgr.move_item(self.goal.id, iid, parent, index)
        self._changed()

    def _indent(self, iid, direction):
        self.goal_mgr.indent(self.goal.id, iid, direction)
        self._changed()
        self.tree.select_id(iid)

    def _add_item(self, parent_id):
        if self.goal is None:
            return
        self.show_tab("submetas")
        item = self.goal_mgr.create_item(self.goal.id, "Nueva submeta", parent=parent_id or "")
        self._changed()
        self.tree.select_id(item.id)
        self._open_item(item.id)

    def _delete_item(self, iid):
        item = self.goal_mgr.get_item(self.goal.id, iid)
        if item is None:
            return
        n = len(self.goal_mgr.descendants(item))
        text = f"¿Eliminar «{item.name}»" + (f" y sus {n} submetas" if n else "") + \
            "?\nSe mueve a la papelera de la vault."
        if QMessageBox.question(self, "Eliminar submeta", text) == QMessageBox.Yes:
            self.goal_mgr.delete_item(self.goal.id, iid)
            if self.editor.item and self.editor.item.id == iid:
                self.editor.hide()
            self._changed()

    def _item_saved(self, iid):
        self._changed()
        item = self.goal_mgr.get_item(self.goal.id, iid)
        if item:
            self.editor.item = item

    def _changed(self, keep_editor=True):
        if not keep_editor:
            self.editor.hide()
        self.refresh()
        self.data_changed.emit()

    # ── History ───────────────────────────────────────────────────────────

    def _render_history(self):
        clear_layout(self.hist)
        g, today = self.goal, date.today()
        chart = BarChart("Submetas completadas por día (últimos 30 días)", g.colour, 170)
        counts = self.goal_mgr.daily_counts(g, 30, today)
        chart.set_data([(date.fromordinal(today.toordinal() - 29 + i)).strftime("%d/%m")
                        for i in range(30)], counts)
        self.hist.addWidget(chart)
        repeating = [i for i in self.goal_mgr.leaves(g.id) if i.repeating]
        if repeating:
            self.hist.addWidget(label("REPETITIVAS · últimos 30 días", TEXT_FAINT, 10, True))
        for item in repeating:
            row = QHBoxLayout()
            name = label(item.name, TEXT, 12)
            name.setFixedWidth(220)
            row.addWidget(name)
            strip = HeatStrip(colour=g.colour)
            strip.set_cells(self.goal_mgr.history(g, item, 30, today))
            row.addWidget(strip)
            streak = self.goal_mgr.streak(item, g, today)
            row.addWidget(label(f"🔥 {streak}" if streak else "", ORANGE, 11))
            prog = self.goal_mgr.item_progress(item, g, today)
            row.addWidget(label(f"{round(prog * 100)} % desde el inicio", TEXT_FAINT, 11))
            row.addStretch()
            self.hist.addLayout(row)
        done = sorted([i for i in self.goal_mgr.leaves(g.id) if not i.repeating and i.done_at],
                      key=lambda i: i.done_at, reverse=True)
        self.hist.addSpacing(8)
        self.hist.addWidget(label("COMPLETADAS", TEXT_FAINT, 10, True))
        if not done:
            self.hist.addWidget(label("Todavía ninguna submeta única completada.", TEXT_FAINT, 12))
        for item in done:
            row = QHBoxLayout()
            row.addWidget(label("✓", GREEN, 12))
            row.addWidget(label(item.name, TEXT_DIM, 12), stretch=1)
            row.addWidget(label(item.done_at.strftime("%d/%m/%Y"), TEXT_FAINT, 11))
            self.hist.addLayout(row)
        self.hist.addStretch()

    # ── Goal edits ────────────────────────────────────────────────────────

    def _rename(self):
        if self.goal and self.name.text().strip() and self.name.text().strip() != self.goal.name:
            self.goal_mgr.update_goal(self.goal.id, name=self.name.text().strip())
            self.data_changed.emit()

    def _save_notes(self):
        if self.goal and self.notes.toPlainText().strip() != self.goal.description:
            self.goal_mgr.update_goal(self.goal.id, description=self.notes.toPlainText().strip())
            self.goal = self.goal_mgr.get_goal(self.goal.id)

    def _delete_goal(self):
        if self.goal is None:
            return
        if QMessageBox.question(
                self, "Eliminar meta",
                f"¿Eliminar «{self.goal.name}» con todas sus submetas?\n"
                "Se mueve a la papelera de la vault (.notevault/.papelera/metas). "
                "Si solo quieres ocultarla, márcala como Archivada.") != QMessageBox.Yes:
            return
        self.goal_mgr.delete_goal(self.goal.id)
        self.goal = None
        self.data_changed.emit()
        self.back_requested.emit()

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
    PRIORITY_COLOURS, PRIORITY_NAMES, LinkedFolderNotesWidget,
)
from ..comun.nav import _rgba
from ..comun.widgets import StatTile, BlockProgress
from ..comun.tree_list import TreeList
from ..comun.charts import HeatStrip, BarChart
from .item_editor import ItemEditor
from .metas_hoy import TodayList
from .metas_board import date_line
from .submetas_board import SubmetasBoard
from .submeta_detail import SubmetaDetail

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
    open_note_requested = Signal(str)
    reveal_in_os_requested = Signal(str)

    def __init__(self, goal_mgr, area_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        self.goal = None
        self._submeta_view = "cards"
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
        tabs.addSpacing(14)

        # Selector de vista de submetas (Tarjetas vs Árbol)
        self.submeta_view_box = QWidget()
        sv_lay = QHBoxLayout(self.submeta_view_box)
        sv_lay.setContentsMargins(0, 0, 0, 0)
        sv_lay.setSpacing(4)
        self.btn_view_cards = flat_btn("▦ Tarjetas", height=28)
        self.btn_view_cards.clicked.connect(lambda: self.switch_submeta_view("cards"))
        self.btn_view_tree = flat_btn("📋 Árbol", height=28)
        self.btn_view_tree.clicked.connect(lambda: self.switch_submeta_view("tree"))
        sv_lay.addWidget(self.btn_view_cards)
        sv_lay.addWidget(self.btn_view_tree)
        tabs.addWidget(self.submeta_view_box)

        tabs.addStretch()
        self.add_checklist_btn = flat_btn("📋 + Con Checklist", height=28)
        self.add_checklist_btn.setToolTip("Crear submeta especificando una lista o checklist de subtareas iniciales")
        self.add_checklist_btn.clicked.connect(lambda: self._add_submeta_with_checklist(""))
        tabs.addWidget(self.add_checklist_btn)

        self.add_btn = primary_btn("+  Submeta", 30)
        self.add_btn.clicked.connect(lambda: self._add_submeta_with_checklist(""))
        tabs.addWidget(self.add_btn)
        page.addLayout(tabs)

        self.stack = QStackedWidget()
        page.addWidget(self.stack, stretch=1)

        # ── Pestaña 0: Submetas (Stack con Tarjetas, Árbol y Detalle Propio) ──
        self.submetas_container = QWidget()
        sub_lay = QVBoxLayout(self.submetas_container)
        sub_lay.setContentsMargins(0, 0, 0, 0)
        sub_lay.setSpacing(0)

        self.submetas_stack = QStackedWidget()

        # 0.1: SubmetasBoard (Cards Dashboard)
        self.submetas_board = SubmetasBoard(goal_mgr, habit_mgr)
        self.submetas_board.submeta_opened.connect(self.open_submeta_detail)
        self.submetas_board.new_submeta_requested.connect(lambda: self._add_submeta_with_checklist(""))
        self.submetas_board.data_changed.connect(self._changed)
        self.submetas_stack.addWidget(self.submetas_board)

        # 0.2: Árbol con TreeList y ItemEditor
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
        self.editor.open_full_requested.connect(self.open_submeta_detail)
        self.editor.closed.connect(lambda: self.editor.hide())
        self.editor.hide()
        split.addWidget(self.editor)
        split.setStretchFactor(0, 1)
        self.split = split
        self.submetas_stack.addWidget(split)

        # 0.3: SubmetaDetail (Segundo Dashboard: vista de lista sin sub-dashboards)
        self.submeta_detail = SubmetaDetail(goal_mgr, habit_mgr)
        self.submeta_detail.back_requested.connect(self.close_submeta_detail)
        self.submeta_detail.edit_requested.connect(self._open_item)
        self.submeta_detail.data_changed.connect(self._changed)
        self.submeta_detail.open_note_requested.connect(self.open_note_requested.emit)
        self.submeta_detail.reveal_in_os_requested.connect(self.reveal_in_os_requested.emit)
        self.submetas_stack.addWidget(self.submeta_detail)

        sub_lay.addWidget(self.submetas_stack)
        self.stack.addWidget(self.submetas_container)

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

        # Notas y Carpetas Vinculadas
        notes_box = QWidget()
        notes_lay = QVBoxLayout(notes_box)
        notes_lay.setContentsMargins(0, 8, 0, 0)
        notes_lay.setSpacing(10)

        self.linked_widget = LinkedFolderNotesWidget(vault_root=getattr(goal_mgr, "vault_root", None))
        self.linked_widget.open_note_requested.connect(self.open_note_requested.emit)
        self.linked_widget.reveal_in_os_requested.connect(self.reveal_in_os_requested.emit)
        self.linked_widget.data_changed.connect(self._save_linked)
        notes_lay.addWidget(self.linked_widget)

        notes_lay.addWidget(label("DESCRIPCIÓN Y NOTAS DE LA META", TEXT_FAINT, 10, True))
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
        notes_lay.addWidget(self.notes, 1)
        self.stack.addWidget(notes_box)
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
        self.submetas_board.goal_mgr = goal_mgr
        self.submetas_board.habit_mgr = habit_mgr
        self.submeta_detail.goal_mgr = goal_mgr
        self.submeta_detail.habit_mgr = habit_mgr
        self.linked_widget.set_vault_root(getattr(goal_mgr, "vault_root", None))
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
        is_sub = (key == "submetas")
        is_sub_detail = (self.submetas_stack.currentIndex() == 2)
        self.submeta_view_box.setVisible(is_sub and not is_sub_detail)
        self.add_btn.setVisible(is_sub and not is_sub_detail)
        self._tab = key
        if self.goal is not None:
            self._render_tab()

    def switch_submeta_view(self, view: str):
        self._submeta_view = view
        if view == "cards":
            self.submetas_stack.setCurrentIndex(0)
            self.btn_view_cards.setStyleSheet(
                f"QPushButton{{background:#1e293b;color:#ffffff;border:1px solid {BLUE};"
                f"border-radius:6px;font-weight:700;padding:0 10px;font-size:12px;font-family:{UI_FONT};}}"
            )
            self.btn_view_tree.setStyleSheet(
                f"QPushButton{{background:transparent;color:{TEXT_DIM};border:1px solid {BORDER};"
                f"border-radius:6px;font-weight:500;padding:0 10px;font-size:12px;font-family:{UI_FONT};}}"
                f"QPushButton:hover{{color:{TEXT};}}"
            )
            self.submetas_board.set_goal(self.goal)
        else:
            self.submetas_stack.setCurrentIndex(1)
            self.btn_view_tree.setStyleSheet(
                f"QPushButton{{background:#1e293b;color:#ffffff;border:1px solid {BLUE};"
                f"border-radius:6px;font-weight:700;padding:0 10px;font-size:12px;font-family:{UI_FONT};}}"
            )
            self.btn_view_cards.setStyleSheet(
                f"QPushButton{{background:transparent;color:{TEXT_DIM};border:1px solid {BORDER};"
                f"border-radius:6px;font-weight:500;padding:0 10px;font-size:12px;font-family:{UI_FONT};}}"
                f"QPushButton:hover{{color:{TEXT};}}"
            )
            self._render_tree()

    def open_submeta_detail(self, iid: str):
        item = self.goal_mgr.get_item(self.goal.id, iid)
        if not item:
            return
        self.submeta_detail.load(self.goal, item)
        self.submetas_stack.setCurrentIndex(2)
        self.submeta_view_box.setVisible(False)
        self.add_btn.setVisible(False)

    def close_submeta_detail(self):
        target_idx = 0 if getattr(self, "_submeta_view", "cards") == "cards" else 1
        self.submetas_stack.setCurrentIndex(target_idx)
        self.submeta_view_box.setVisible(self._tab == "submetas")
        self.add_btn.setVisible(self._tab == "submetas")
        self.refresh()

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
            curr_sub_idx = self.submetas_stack.currentIndex()
            is_sub_detail = (curr_sub_idx == 2)
            self.submeta_view_box.setVisible(not is_sub_detail)
            self.add_btn.setVisible(not is_sub_detail)

            if curr_sub_idx == 0:
                self.submetas_board.set_goal(self.goal)
            elif curr_sub_idx == 1:
                self._render_tree()
            elif curr_sub_idx == 2:
                self.submeta_detail.refresh()
        elif key == "hoy":
            self.today.goal_id = self.goal.id
            self.today.day = date.today()
            self.today.refresh()
        elif key == "historial":
            self._render_history()
        elif key == "notas":
            extra = self.goal.extra or {}
            self.linked_widget.set_vault_root(getattr(self.goal_mgr, "vault_root", None))
            self.linked_widget.set_data(
                folder=extra.get("linked_folder", ""),
                notes=extra.get("linked_notes", []),
            )
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
                "checked": done,

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

    def _add_submeta_with_checklist(self, parent_id=""):
        if self.goal is None:
            return
        from .meta_dialogs import SubmetaChecklistDialog
        cats = self.goal_mgr.categories(self.goal.id)
        dlg = SubmetaChecklistDialog(categories=cats, parent=self)
        if dlg.exec() == QDialog.Accepted:
            f = dlg.fields()
            submeta = self.goal_mgr.create_item(
                self.goal.id,
                f["name"],
                parent=parent_id or "",
                category=f.get("category", ""),
                is_priority=f.get("is_priority", True),
            )
            for st_title in f.get("subtasks", []):
                if st_title.strip():
                    self.goal_mgr.create_item(self.goal.id, st_title.strip(), parent=submeta.id)
            self._changed()
            if f.get("is_priority") and not parent_id:
                self.open_submeta_detail(submeta.id)
            else:
                self.show_tab("submetas")
                self.tree.select_id(submeta.id)

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

    def _save_linked(self):
        if not self.goal:
            return
        folder, notes = self.linked_widget.get_data()
        extra = dict(self.goal.extra or {})
        extra["linked_folder"] = folder
        extra["linked_notes"] = notes
        self.goal_mgr.update_goal(self.goal.id, extra=extra)
        self.goal = self.goal_mgr.get_goal(self.goal.id)
        self.data_changed.emit()

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

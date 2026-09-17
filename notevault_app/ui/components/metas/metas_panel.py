"""Metas centre panel: tablero, detalle and Hoy, plus the create/edit dialogs."""

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedWidget, QDialog

from .metas_board import MetasBoard
from .meta_detail import MetaDetail
from .metas_hoy import MetasHoy
from .meta_dialogs import GoalDialog, AreaDialog

BOARD, DETAIL, TODAY = 0, 1, 2


class MetasPanel(QWidget):
    data_changed = Signal()
    view_changed = Signal(str)
    calendar_requested = Signal()
    open_note_requested = Signal(str)
    reveal_in_os_requested = Signal(str)

    def __init__(self, goal_mgr, area_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self.stack = QStackedWidget()
        self.board = MetasBoard(goal_mgr, area_mgr, habit_mgr)
        self.detail = MetaDetail(goal_mgr, area_mgr, habit_mgr)
        self.today = MetasHoy(goal_mgr, area_mgr)
        for w in (self.board, self.detail, self.today):
            self.stack.addWidget(w)
        lay.addWidget(self.stack)

        self.board.goal_opened.connect(self.open_goal)
        self.board.new_goal_requested.connect(self.new_goal)
        self.board.edit_goal_requested.connect(self.edit_goal)
        self.board.data_changed.connect(self.data_changed.emit)
        self.detail.back_requested.connect(self.show_board)
        self.detail.edit_goal_requested.connect(self.edit_goal)
        self.detail.data_changed.connect(self.data_changed.emit)
        self.detail.open_note_requested.connect(self.open_note_requested.emit)
        self.detail.reveal_in_os_requested.connect(self.reveal_in_os_requested.emit)
        self.today.goal_opened.connect(self.open_goal)
        self.today.data_changed.connect(self.data_changed.emit)

    def set_managers(self, goal_mgr, area_mgr, habit_mgr):
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        self.board.set_managers(goal_mgr, area_mgr, habit_mgr)
        self.detail.set_managers(goal_mgr, area_mgr, habit_mgr)
        self.today.set_managers(goal_mgr, area_mgr)
        self.show_board()

    # ── Navigation ────────────────────────────────────────────────────────

    def show_view(self, key: str):
        if key == "hoy":
            self.stack.setCurrentIndex(TODAY)
            self.today.refresh()
        elif key == "calendario":
            self.calendar_requested.emit()
            return
        else:
            self.show_board()
            return
        self.view_changed.emit(key)

    def show_board(self):
        self.stack.setCurrentIndex(BOARD)
        self.board.refresh()
        self.view_changed.emit("tablero")

    def open_goal(self, gid: str, item_id: str = ""):
        self.detail.load(gid)
        if self.detail.goal is None:
            return
        self.stack.setCurrentIndex(DETAIL)
        if item_id:
            self.detail.show_tab("submetas")
            self.detail.tree.select_id(item_id)
            self.detail._open_item(item_id)

    def refresh(self):
        idx = self.stack.currentIndex()
        if idx == DETAIL:
            self.detail.refresh()
        elif idx == TODAY:
            self.today.refresh()
        else:
            self.board.refresh()

    def set_area(self, area):
        self.board.set_area(area)
        if self.stack.currentIndex() != BOARD:
            self.show_board()

    def set_filter(self, key):
        self.board.set_filter(key)
        if self.stack.currentIndex() != BOARD:
            self.show_board()

    # ── Dialogs ───────────────────────────────────────────────────────────

    def new_goal(self):
        preset = self.board.area if self.board.area not in ("*",) else ""
        dlg = GoalDialog(self.area_mgr, None, preset, self)
        if dlg.exec() == QDialog.Accepted:
            f = dlg.fields()
            initial_subs = dlg.initial_submetas()
            goal = self.goal_mgr.create_goal(f.pop("name"), **f)
            for sub_name in initial_subs:
                if sub_name:
                    self.goal_mgr.create_item(goal.id, sub_name)
            self.data_changed.emit()
            self.open_goal(goal.id)

    def edit_goal(self, gid: str):
        goal = self.goal_mgr.get_goal(gid)
        if goal is None:
            return
        dlg = GoalDialog(self.area_mgr, goal, "", self)
        if dlg.exec() == QDialog.Accepted:
            self.goal_mgr.update_goal(gid, **dlg.fields())
            self.data_changed.emit()
            self.refresh()

    def new_area(self):
        dlg = AreaDialog(None, self)
        if dlg.exec() == QDialog.Accepted:
            f = dlg.fields()
            self.area_mgr.create(f["name"], f["icon"], f["colour"])
            self.data_changed.emit()
            self.refresh()

    def edit_area(self, area_id: str):
        area = self.area_mgr.get(area_id)
        if area is None:
            return
        dlg = AreaDialog(area, self)
        if dlg.exec() == QDialog.Accepted:
            if dlg.archived:
                self.area_mgr.archive(area_id)
            else:
                self.area_mgr.update(area_id, **dlg.fields())
            self.data_changed.emit()
            self.refresh()

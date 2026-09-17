"""
Proyectos Panel — tablero de proyectos + proyecto abierto (tipo Jira).
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedWidget, QDialog
from PySide6.QtCore import Signal

from ....core.project_manager import ProjectManager
from .proyectos_board import ProyectosBoard
from .proyecto_view import ProyectoView
from .proyecto_dialogs import ProjectDialog

VIEW_BOARD = 0
VIEW_DETAIL = 1


class ProyectosPanel(QWidget):
    data_changed = Signal()
    project_changed = Signal(str)       # "" when back on the board
    open_note_requested = Signal(object)
    reveal_in_os_requested = Signal(object)

    def __init__(self, manager: ProjectManager, area_mgr=None, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.manager = manager
        self.area_mgr = area_mgr
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        self._stack = QStackedWidget()
        self._board = ProyectosBoard(manager, area_mgr)
        self._view = ProyectoView(manager, area_mgr)
        self._stack.addWidget(self._board)
        self._stack.addWidget(self._view)
        self._board.project_opened.connect(self.open_project)
        self._board.new_requested.connect(self.new_project)
        self._board.edit_requested.connect(self.edit_project)
        self._board.data_changed.connect(self.data_changed.emit)
        self._view.back_requested.connect(self.show_board)
        self._view.edit_requested.connect(self.edit_project)
        self._view.data_changed.connect(self.data_changed.emit)
        self._view.open_note_requested.connect(self.open_note_requested.emit)
        self._view.reveal_in_os_requested.connect(self.reveal_in_os_requested.emit)
        lay.addWidget(self._stack)

    def show_view(self, key: str):
        if key == "detalle" and self._view.project:
            self._stack.setCurrentIndex(VIEW_DETAIL)
            self._view.refresh()
        else:
            self.show_board()

    def show_board(self):
        self._stack.setCurrentIndex(VIEW_BOARD)
        self._board.refresh()
        self.project_changed.emit("")

    def open_project(self, pid: str, issue_id: str = ""):
        self._view.load(pid)
        if self._view.project is None:
            return
        self._stack.setCurrentIndex(VIEW_DETAIL)
        self.project_changed.emit(pid)
        if issue_id:
            self._view.open_issue(issue_id)

    def refresh(self):
        if self._stack.currentIndex() == VIEW_DETAIL:
            self._view.refresh()
        else:
            self._board.refresh()

    def new_project(self):
        dlg = ProjectDialog(self.area_mgr, None, [p.key for p in self.manager.projects()], self)
        if dlg.exec() != QDialog.Accepted:
            return
        f = dlg.fields()
        columns, done, _renames = f.pop("_columns"), f.pop("_done"), f.pop("_renames")
        project = self.manager.create(f.pop("name"), columns=columns, done_column=done, **f)
        self.data_changed.emit()
        self.open_project(project.id)

    def edit_project(self, pid: str):
        project = self.manager.get(pid)
        if project is None:
            return
        dlg = ProjectDialog(self.area_mgr, project, [p.key for p in self.manager.projects()], self)
        if dlg.exec() != QDialog.Accepted:
            return
        f = dlg.fields()
        columns, done, renames = f.pop("_columns"), f.pop("_done"), f.pop("_renames")
        self.manager.update(pid, **f)
        if columns != project.columns or done != project.done_column or renames:
            self.manager.set_columns(pid, columns, done, renames)
        self.data_changed.emit()
        self.refresh()

    def set_manager(self, manager: ProjectManager, area_mgr=None):
        self.manager = manager
        if area_mgr is not None:
            self.area_mgr = area_mgr
        self._board.set_manager(manager, self.area_mgr)
        self._view.set_managers(manager, self.area_mgr)
        self.show_board()

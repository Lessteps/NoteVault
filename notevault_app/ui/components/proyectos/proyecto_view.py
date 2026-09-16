"""An opened project: header, the Resumen/Tablero/Lista/Calendario/Notas tabs and the issue panel."""

from datetime import date

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QStackedWidget, QSplitter, QTextEdit, QPushButton,
    QInputDialog, QMessageBox,
)

from ....core.project_manager import PROJECT_STATUS_COLORS, T_GOAL, T_SUBTASK, T_TASK
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, ORANGE, UI_FONT,
    label, chip, clear_layout, flat_btn, primary_btn, fmt_day,
)
from ..comun.widgets import BlockProgress
from .issue_detail import IssueDetail
from .proyecto_resumen import ProyectoResumen
from .proyecto_tablero import ProyectoTablero
from .proyecto_lista import ProyectoLista
from .proyecto_calendario import ProyectoCalendario

TABS = (("resumen", "Resumen"), ("tablero", "Tablero"), ("lista", "Lista"),
        ("calendario", "Calendario"), ("notas", "Notas"))


class _Tab(QPushButton):
    def __init__(self, text, parent=None):
        super().__init__(text, parent)
        self.setCheckable(True)
        self.setCursor(Qt.PointingHandCursor)
        self.setFixedHeight(34)
        self.setStyleSheet(
            f"QPushButton{{background:transparent;border:none;border-bottom:2px solid transparent;"
            f"color:{TEXT_DIM};font-size:13px;padding:0 14px;min-width:0px;font-family:{UI_FONT};}}"
            f"QPushButton:hover{{color:{TEXT};}}"
            f"QPushButton:checked{{color:{TEXT};border-bottom:2px solid {BLUE};font-weight:600;}}")


class ProyectoView(QWidget):
    back_requested = Signal()
    edit_requested = Signal(str)
    data_changed = Signal()

    def __init__(self, manager, area_mgr=None, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.area_mgr = area_mgr
        self.project = None
        self.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(self)
        page.setContentsMargins(22, 12, 22, 12)
        page.setSpacing(8)

        top = QHBoxLayout()
        back = flat_btn("‹  Proyectos", height=28)
        back.clicked.connect(self.back_requested.emit)
        top.addWidget(back)
        top.addStretch()
        edit = flat_btn("Editar proyecto…", height=28)
        edit.clicked.connect(lambda: self.project and self.edit_requested.emit(self.project.id))
        top.addWidget(edit)
        delete = flat_btn("Eliminar", RED, RED, height=28)
        delete.clicked.connect(self._delete_project)
        top.addWidget(delete)
        page.addLayout(top)

        head = QHBoxLayout()
        head.setSpacing(10)
        self.icon = label("", TEXT, 26)
        head.addWidget(self.icon)
        names = QVBoxLayout()
        names.setSpacing(0)
        self.key = label("", TEXT_FAINT, 11, True)
        self.name = label("", TEXT, 22, True)
        names.addWidget(self.key)
        names.addWidget(self.name)
        head.addLayout(names)
        head.addSpacing(12)
        self.chips = QHBoxLayout()
        self.chips.setSpacing(6)
        head.addLayout(self.chips)
        head.addStretch()
        self.progress = BlockProgress(0, GREEN, blocks=20, block=10)
        head.addWidget(self.progress)
        create = primary_btn("+  Crear issue", 32)
        create.setToolTip("Atajo: C")
        create.clicked.connect(lambda: self.create_issue())
        head.addWidget(create)
        page.addLayout(head)

        tabs = QHBoxLayout()
        tabs.setSpacing(0)
        self.tab_buttons = {}
        for key, text in TABS:
            b = _Tab(text)
            b.clicked.connect(lambda _c=False, k=key: self.show_tab(k))
            self.tab_buttons[key] = b
            tabs.addWidget(b)
        tabs.addStretch()
        page.addLayout(tabs)

        split = QSplitter(Qt.Horizontal)
        split.setHandleWidth(8)
        split.setChildrenCollapsible(False)
        self.stack = QStackedWidget()
        self.resumen = ProyectoResumen(manager)
        self.tablero = ProyectoTablero(manager)
        self.lista = ProyectoLista(manager)
        self.calendario = ProyectoCalendario(manager)
        self.notes = QTextEdit()
        self.notes.setPlaceholderText("Descripción del proyecto, objetivos, enlaces…")
        self.notes.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;color:{TEXT};"
            f"font-size:13px;padding:10px;font-family:{UI_FONT};}}")
        self._notes_timer = QTimer(self)
        self._notes_timer.setSingleShot(True)
        self._notes_timer.setInterval(800)
        self._notes_timer.timeout.connect(self._save_notes)
        self.notes.textChanged.connect(self._notes_timer.start)
        for w in (self.resumen, self.tablero, self.lista, self.calendario, self.notes):
            self.stack.addWidget(w)
        split.addWidget(self.stack)
        self.detail = IssueDetail(manager)
        self.detail.hide()
        split.addWidget(self.detail)
        split.setStretchFactor(0, 1)
        page.addWidget(split, 1)

        for view in (self.resumen, self.tablero, self.lista, self.calendario):
            view.open_issue.connect(self.open_issue)
        self.resumen.show_in_board.connect(self._board_for_goal)
        self.tablero.create_in.connect(lambda col: self.create_issue(status=col))
        self.lista.create_child.connect(lambda pid: self.create_issue(parent=pid))
        for view in (self.tablero, self.lista, self.calendario):
            view.changed.connect(self._changed)
        self.detail.saved.connect(lambda _i: self._changed(keep_detail=True))
        self.detail.deleted.connect(lambda _i: (self.detail.hide(), self._changed()))
        self.detail.closed.connect(self.detail.hide)
        self.detail.open_issue.connect(self.open_issue)
        self.detail.create_child.connect(lambda pid: self.create_issue(parent=pid))

        sc = QShortcut(QKeySequence("C"), self)
        sc.setContext(Qt.WidgetWithChildrenShortcut)
        sc.activated.connect(self._shortcut_create)
        self.show_tab("resumen")

    def set_managers(self, manager, area_mgr):
        self.manager, self.area_mgr = manager, area_mgr
        for view in (self.resumen, self.tablero, self.lista, self.calendario):
            view.manager = manager
        self.detail.set_manager(manager)
        self.project = None

    # ── Loading ───────────────────────────────────────────────────────────

    def load(self, pid: str):
        if self.project is None or self.project.id != pid:
            self.detail.hide()
            self.show_tab("resumen")
        self.project = self.manager.get(pid)
        if self.project is None:
            self.back_requested.emit()
            return
        if self.manager.fix_duplicate_numbers(pid):
            self.data_changed.emit()
        self.refresh()

    def refresh(self):
        if self.project is None:
            return
        self.project = self.manager.get(self.project.id)
        if self.project is None:
            self.back_requested.emit()
            return
        p = self.project
        self.icon.setText(p.icon or "◫")
        self.key.setText(p.key)
        self.name.setText(p.name)
        clear_layout(self.chips)
        self.chips.addWidget(chip(p.status, PROJECT_STATUS_COLORS.get(p.status, TEXT_DIM)))
        area = self.area_mgr.get(p.area) if (self.area_mgr and p.area) else None
        if area and not area["archived"]:
            self.chips.addWidget(chip(f"{area['icon']} {area['name']}".strip(), area["colour"]))
        if p.deadline:
            left = p.days_left()
            colour = RED if p.is_overdue() else (ORANGE if left is not None and left <= 7 else TEXT_DIM)
            self.chips.addWidget(chip(f"⏰ {fmt_day(p.deadline)}", colour))
        if p.in_calendar:
            self.chips.addWidget(chip("📅 En el calendario", TEXT_FAINT))
        self.progress.set_fraction(self.manager.progress(p), p.colour)
        self._render_tab()
        if self.detail.isVisible() and self.detail.issue is not None:
            fresh = self.manager.get_issue(p.id, self.detail.issue.id)
            if fresh is None:
                self.detail.hide()

    def show_tab(self, key):
        self._tab = key
        for k, b in self.tab_buttons.items():
            b.setChecked(k == key)
        self.stack.setCurrentIndex([k for k, _t in TABS].index(key))
        if self.project is not None:
            self._render_tab()

    def _render_tab(self):
        key = self._tab
        if key == "resumen":
            self.resumen.load(self.project)
        elif key == "tablero":
            self.tablero.load(self.project)
        elif key == "lista":
            self.lista.load(self.project)
        elif key == "calendario":
            self.calendario.load(self.project)
        elif key == "notas" and not self.notes.hasFocus():
            self.notes.blockSignals(True)
            self.notes.setPlainText(self.project.description)
            self.notes.blockSignals(False)

    # ── Issues ────────────────────────────────────────────────────────────

    def open_issue(self, iid: str):
        issue = self.manager.get_issue(self.project.id, iid)
        if issue is None:
            return
        self.detail.load(self.project, issue)
        self.detail.show()

    def _shortcut_create(self):
        if self.focusWidget() is not None and self.focusWidget().inherits("QLineEdit") \
                or (self.focusWidget() is not None and self.focusWidget().inherits("QTextEdit")):
            return
        self.create_issue()

    def create_issue(self, status: str = "", parent: str = ""):
        if self.project is None:
            return
        parent_issue = self.manager.get_issue(self.project.id, parent) if parent else None
        kind = T_SUBTASK if parent_issue is not None and parent_issue.type != T_GOAL else T_TASK
        title, ok = QInputDialog.getText(
            self, "Crear issue",
            f"Título{' (hija de ' + parent_issue.key + ')' if parent_issue else ''}:")
        if not ok or not title.strip():
            return
        issue = self.manager.create_issue(self.project.id, title.strip(), status=status or None,
                                          parent=parent or "", type=kind)
        self._changed()
        if issue:
            if parent:
                parent_fresh = self.manager.get_issue(self.project.id, parent)
                if parent_fresh:
                    self.detail.load(self.project, parent_fresh)
            else:
                self.open_issue(issue.id)


    def _board_for_goal(self, goal_id):
        self.show_tab("tablero")
        self.tablero.filter_goal(goal_id)

    def _changed(self, keep_detail=False):
        self.refresh()
        if keep_detail and self.detail.isVisible() and self.detail.issue is not None:
            pass
        self.data_changed.emit()

    def _save_notes(self):
        if self.project and self.notes.toPlainText().strip() != self.project.description:
            self.manager.update(self.project.id, description=self.notes.toPlainText().strip())
            self.project = self.manager.get(self.project.id)

    def _delete_project(self):
        if self.project is None:
            return
        n = len(self.manager.issues(self.project.id))
        if QMessageBox.question(self, "Eliminar proyecto",
                                f"¿Eliminar «{self.project.name}» y sus {n} issues?\n"
                                "Se mueve a la papelera de la vault (.notevault/.papelera/proyectos).\n"
                                "Si solo quieres cerrarlo, cámbialo a «Terminado».") != QMessageBox.Yes:
            return
        self.manager.delete(self.project.id)
        self.project = None
        self.data_changed.emit()
        self.back_requested.emit()

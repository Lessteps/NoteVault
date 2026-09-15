"""Lista (backlog): the issue tree with key, type, status, priority, date and estimate."""

from datetime import date

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QMenu, QMessageBox

from ....core.project_manager import TYPE_ICONS, TYPE_COLOURS, T_SUBTASK, T_GOAL
from ..comun import (
    TEXT_DIM, TEXT_FAINT, RED, GREEN, PRIORITY_NAMES, PRIORITY_COLOURS, label, combo, line_edit,
    fmt_day,
)
from ..comun.tree_list import TreeList, ID_ROLE
from ..programacion import duration_label

SORTS = (("Orden manual", "manual"), ("Clave", "number"), ("Prioridad", "priority"),
         ("Fecha", "due"), ("Estado", "status"))


class ProyectoLista(QWidget):
    open_issue = Signal(str)
    create_child = Signal(str)
    changed = Signal()

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 8, 0, 0)
        lay.setSpacing(8)
        bar = QHBoxLayout()
        self.search = line_edit("🔎  Buscar en el backlog…", 28)
        self.search.setFixedWidth(220)
        self.search.textChanged.connect(lambda _t: self.refresh())
        bar.addWidget(self.search)
        self.sort = combo([(f"Ordenar: {t}", k) for t, k in SORTS], 28)
        self.sort.setFixedWidth(170)
        self.sort.currentIndexChanged.connect(lambda _i: self.refresh())
        bar.addWidget(self.sort)
        self.hide_done = combo([("Mostrar hechas", False), ("Ocultar hechas", True)], 28)
        self.hide_done.currentIndexChanged.connect(lambda _i: self.refresh())
        bar.addWidget(self.hide_done)
        bar.addStretch()
        bar.addWidget(label("Arrastra para cambiar el padre · clic derecho para cambiar estado", TEXT_FAINT, 11))
        lay.addLayout(bar)
        self.tree = TreeList(("Issue", "Clave", "Tipo", "Estado", "Prioridad", "Vence", "Estimación"),
                             (70, 90, 110, 90, 90, 90))
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        try:
            self.tree.customContextMenuRequested.disconnect()
        except (RuntimeError, TypeError):
            pass
        self.tree.customContextMenuRequested.connect(self._menu)
        self.tree.checked.connect(self._checked)
        self.tree.activated_id.connect(self.open_issue.emit)
        self.tree.itemClicked.connect(lambda it, _c: self.open_issue.emit(self.tree.current_id()))
        self.tree.moved.connect(self._moved)
        self.tree.indent_requested.connect(self._indent)
        self.tree.add_child_requested.connect(self.create_child.emit)
        self.tree.delete_requested.connect(self._delete)
        lay.addWidget(self.tree, 1)

    def load(self, project):
        self.project = project
        self.refresh()

    def _sorted(self, issues):
        key = self.sort.currentData()
        if key == "number":
            return sorted(issues, key=lambda i: i.number)
        if key == "priority":
            return sorted(issues, key=lambda i: (-i.priority, i.number))
        if key == "due":
            return sorted(issues, key=lambda i: (i.due or date.max, i.number))
        if key == "status":
            cols = self.project.columns
            return sorted(issues, key=lambda i: (cols.index(i.status) if i.status in cols else 99, i.number))
        return sorted(issues, key=lambda i: (i.order, i.number))

    def refresh(self):
        if self.project is None:
            return
        today = date.today()
        q = self.search.text().strip()
        hide = self.hide_done.currentData()

        def keep(i):
            if hide and i.is_done and not any(not d.is_done for d in self.manager.descendants(i)):
                return False
            return not q or i.matches(q) or any(d.matches(q) for d in self.manager.descendants(i))

        def node(i):
            kids = [node(c) for c in self._sorted(i.children) if keep(c)]
            done_kids = sum(1 for c in i.children if c.is_done)
            return {
                "id": i.id,
                "text": i.title + (f"   ({done_kids}/{len(i.children)})" if i.children else ""),
                "checked": i.is_done if not (i.type == T_GOAL and i.children) else None,
                "bold": bool(i.children), "tooltip": i.description[:300] or i.title,
                "columns": [(i.key, TEXT_FAINT), (f"{TYPE_ICONS.get(i.type, '')} {i.type}", TYPE_COLOURS.get(i.type)),
                            (i.status, GREEN if i.is_done else TEXT_DIM),
                            (PRIORITY_NAMES[i.priority], PRIORITY_COLOURS[i.priority]),
                            (fmt_day(i.due) + (" ↻" if i.repeat else "") if i.due else "—",
                             RED if i.is_overdue(today) else TEXT_DIM),
                            (duration_label(i.estimate_min) if i.estimate_min else "—", TEXT_DIM)],
                "children": kids,
            }

        roots = [i for i in self._sorted(self.manager.tree(self.project.id)) if keep(i)]
        self.tree.set_nodes([node(i) for i in roots])

    def _checked(self, iid, value):
        column = self.project.done_column if value else self.project.columns[0]
        self.manager.move(self.project.id, iid, column, 10 ** 6)
        self._after()

    def _moved(self, iid, parent, index):
        issue = self.manager.get_issue(self.project.id, iid)
        if issue is not None and (issue.parent or None) != parent:
            self.manager.reparent(self.project.id, iid, parent)
        self._after()

    def _indent(self, iid, direction):
        issue = self.manager.get_issue(self.project.id, iid)
        if issue is None:
            return
        siblings = self._sorted([i for i in self.manager.issues(self.project.id) if i.parent == issue.parent])
        pos = siblings.index(issue)
        if direction > 0 and pos > 0:
            self.manager.reparent(self.project.id, iid, siblings[pos - 1].id)
        elif direction < 0 and issue.parent:
            parent = self.manager.get_issue(self.project.id, issue.parent)
            self.manager.reparent(self.project.id, iid, parent.parent if parent else None)
        self._after()
        self.tree.select_id(iid)

    def _delete(self, iid):
        issue = self.manager.get_issue(self.project.id, iid)
        if issue and QMessageBox.question(self, "Eliminar issue",
                                          f"¿Eliminar {issue.key} «{issue.title}» y sus hijas?\n"
                                          "Se mueve a la papelera de la vault.") == QMessageBox.Yes:
            self.manager.delete_issue(self.project.id, iid)
            self._after()

    def _menu(self, pos):
        item = self.tree.itemAt(pos)
        if item is None:
            return
        iid = item.data(0, ID_ROLE)
        menu = QMenu(self)
        menu.addAction("Abrir").triggered.connect(lambda: self.open_issue.emit(iid))
        menu.addAction("+ Crear hija").triggered.connect(lambda: self.create_child.emit(iid))
        status = menu.addMenu("Mover a")
        for c in self.project.columns:
            status.addAction(c).triggered.connect(
                lambda _c=False, col=c: (self.manager.move(self.project.id, iid, col, 10 ** 6), self._after()))
        prio = menu.addMenu("Prioridad")
        for p in (4, 3, 2, 1):
            prio.addAction(PRIORITY_NAMES[p]).triggered.connect(
                lambda _c=False, pr=p: (self.manager.update_issue(self.project.id, iid, priority=pr), self._after()))
        menu.addSeparator()
        menu.addAction("Eliminar…").triggered.connect(lambda: self._delete(iid))
        menu.exec(self.tree.viewport().mapToGlobal(pos))

    def _after(self):
        QTimer.singleShot(0, self.refresh)
        self.changed.emit()

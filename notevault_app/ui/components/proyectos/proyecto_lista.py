"""Lista (backlog): the issue tree with key, type, status, priority, date and estimate."""

import os
import subprocess
from datetime import date
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QMenu, QMessageBox, QDialog, QFileDialog

from ....core.project_manager import TYPE_ICONS, TYPE_COLOURS, T_SUBTASK, T_GOAL
from ..comun import (
    TEXT_DIM, TEXT_FAINT, RED, GREEN, BLUE, PRIORITY_NAMES, PRIORITY_COLOURS, label, combo, line_edit,
    flat_btn, fmt_day,
)
from ..comun.tree_list import TreeList, ID_ROLE
from ..comun.linked_folder_notes_widget import NotePickerDialog
from ..programacion import duration_label

SORTS = (("Orden manual", "manual"), ("Clave", "number"), ("Prioridad", "priority"),
         ("Fecha", "due"), ("Estado", "status"))


class ProyectoLista(QWidget):
    open_issue = Signal(str)
    create_child = Signal(str)
    changed = Signal()
    open_note_requested = Signal(object)
    reveal_in_os_requested = Signal(object)

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 8, 0, 0)
        lay.setSpacing(8)

        bar = QHBoxLayout()
        self.search = line_edit("🔎  Buscar en el backlog…", 28)
        self.search.setFixedWidth(200)
        self.search.textChanged.connect(lambda _t: self.refresh())
        bar.addWidget(self.search)

        self.sort = combo([(f"Ordenar: {t}", k) for t, k in SORTS], 28)
        self.sort.setFixedWidth(160)
        self.sort.currentIndexChanged.connect(lambda _i: self.refresh())
        bar.addWidget(self.sort)

        self.hide_done = combo([("Mostrar hechas", False), ("Ocultar hechas", True)], 28)
        self.hide_done.setFixedWidth(140)
        self.hide_done.currentIndexChanged.connect(lambda _i: self.refresh())
        bar.addWidget(self.hide_done)

        # Acciones directas de vinculación en el panel de lista
        self.btn_link_note = flat_btn("📘 Vincular nota", BLUE, height=28)
        self.btn_link_note.setToolTip("Vincular una nota de la carpeta interna del proyecto al issue seleccionado")
        self.btn_link_note.clicked.connect(self._link_note_to_selected)
        bar.addWidget(self.btn_link_note)

        self.btn_link_external = flat_btn("📎 Archivo externo", "#a855f7", height=28)
        self.btn_link_external.setToolTip("Vincular un archivo externo del sistema al issue seleccionado")
        self.btn_link_external.clicked.connect(self._link_external_to_selected)
        bar.addWidget(self.btn_link_external)

        self.btn_open_notes_folder = flat_btn("📂 Carpeta notas", height=28)
        self.btn_open_notes_folder.setToolTip("Abrir la carpeta interna única de notas de este proyecto en el Explorador")
        self.btn_open_notes_folder.clicked.connect(self._open_project_notes_folder)
        bar.addWidget(self.btn_open_notes_folder)

        bar.addStretch()
        bar.addWidget(label("Arrastra para cambiar padre · clic derecho para más opciones", TEXT_FAINT, 11))
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

            linked_notes = list((i.extra or {}).get("linked_notes", []) or [])
            link_badge = f"  [🔗 {len(linked_notes)}]" if linked_notes else ""
            title_text = i.title + link_badge + (f"   ({done_kids}/{len(i.children)})" if i.children else "")

            tooltip_text = i.description[:300] or i.title
            if linked_notes:
                tooltip_text += "\n\n🔗 Archivos/Notas vinculadas:\n" + "\n".join(f"• {n}" for n in linked_notes)

            return {
                "id": i.id,
                "text": title_text,
                "checked": i.is_done if not (i.type == T_GOAL and i.children) else None,
                "bold": bool(i.children), "tooltip": tooltip_text,
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

    # ── Linking Actions ───────────────────────────────────────────────────────

    def _link_note_to_selected(self):
        iid = self.tree.current_id()
        if not iid:
            QMessageBox.information(
                self, "Vincular nota",
                "Por favor selecciona primero un issue del backlog en la lista."
            )
            return
        self._link_note_for_issue(iid)

    def _link_external_to_selected(self):
        iid = self.tree.current_id()
        if not iid:
            QMessageBox.information(
                self, "Vincular archivo externo",
                "Por favor selecciona primero un issue del backlog en la lista."
            )
            return
        self._link_external_for_issue(iid)

    def _link_note_for_issue(self, iid: str):
        if not self.project:
            return
        issue = self.manager.get_issue(self.project.id, iid)
        if not issue:
            return
        notes_dir = self.manager.notes_dir(self.project.id)
        dlg = NotePickerDialog(
            vault_root=self.manager.vault_root,
            project_notes_dir=notes_dir,
            parent=self,
        )
        if dlg.exec() == QDialog.Accepted and dlg.selected_path:
            p = dlg.selected_path
            try:
                rel = str(p.relative_to(self.manager.vault_root)).replace("\\", "/")
            except (ValueError, AttributeError):
                rel = str(p).replace("\\", "/")
            extra = dict(issue.extra or {})
            linked = list(extra.get("linked_notes") or [])
            if rel not in linked:
                linked.append(rel)
                extra["linked_notes"] = linked
                self.manager.update_issue(self.project.id, iid, extra=extra)
                self._after()

    def _link_external_for_issue(self, iid: str):
        if not self.project:
            return
        issue = self.manager.get_issue(self.project.id, iid)
        if not issue:
            return
        chosen, _ = QFileDialog.getOpenFileName(
            self, f"Vincular archivo externo a {issue.key}", str(Path.home()),
            "Todos los archivos (*.*)"
        )
        if chosen:
            p_str = str(Path(chosen).resolve()).replace("\\", "/")
            extra = dict(issue.extra or {})
            linked = list(extra.get("linked_notes") or [])
            if p_str not in linked:
                linked.append(p_str)
                extra["linked_notes"] = linked
                self.manager.update_issue(self.project.id, iid, extra=extra)
                self._after()

    def _open_project_notes_folder(self):
        if not self.project:
            return
        folder = self.manager.notes_dir(self.project.id)
        try:
            os.startfile(str(folder))
        except Exception:
            subprocess.Popen(["explorer", str(folder)])
        self.reveal_in_os_requested.emit(folder)

    def _open_linked_ref(self, ref: str):
        p = Path(ref)
        if not p.is_absolute() and self.manager.vault_root:
            p = self.manager.vault_root / p
        if not p.exists() and self.project:
            alt_p = self.manager.notes_dir(self.project.id) / Path(ref).name
            if alt_p.exists():
                p = alt_p

        if p.exists():
            if p.suffix.lower() == ".md":
                self.open_note_requested.emit(p)
            else:
                try:
                    os.startfile(str(p))
                except Exception:
                    pass
                self.reveal_in_os_requested.emit(p)
        else:
            QMessageBox.warning(self, "Archivo no encontrado", f"No se encontró el archivo vinculado:\n{ref}")

    def _reveal_linked_ref(self, ref: str):
        p = Path(ref)
        if not p.is_absolute() and self.manager.vault_root:
            p = self.manager.vault_root / p
        if not p.exists() and self.project:
            alt_p = self.manager.notes_dir(self.project.id) / Path(ref).name
            if alt_p.exists():
                p = alt_p

        if p.exists():
            try:
                subprocess.Popen(f'explorer.exe /select,"{p.resolve()}"')
            except Exception:
                try:
                    os.startfile(str(p.parent))
                except Exception:
                    pass
            self.reveal_in_os_requested.emit(p)
        else:
            QMessageBox.warning(self, "Archivo no encontrado", f"No se encontró el archivo vinculado:\n{ref}")

    # ── Context Menu ──────────────────────────────────────────────────────────

    def _menu(self, pos):
        item = self.tree.itemAt(pos)
        if item is None:
            return
        iid = item.data(0, ID_ROLE)
        issue = self.manager.get_issue(self.project.id, iid) if self.project else None

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
        menu.addAction("📘 Vincular nota del proyecto…").triggered.connect(lambda: self._link_note_for_issue(iid))
        menu.addAction("📎 Vincular archivo externo…").triggered.connect(lambda: self._link_external_for_issue(iid))

        # Submenú si tiene notas vinculadas
        if issue and issue.extra and issue.extra.get("linked_notes"):
            linked_list = issue.extra.get("linked_notes")
            sub_notes = menu.addMenu(f"🔗 Notas vinculadas ({len(linked_list)})")
            for ref in linked_list:
                ref_name = Path(ref).name
                sub_notes.addAction(f"Abrir: {ref_name}").triggered.connect(
                    lambda _c=False, r=ref: self._open_linked_ref(r)
                )
                sub_notes.addAction(f"Ver en carpeta: {ref_name}").triggered.connect(
                    lambda _c=False, r=ref: self._reveal_linked_ref(r)
                )

        menu.addSeparator()
        menu.addAction("Eliminar…").triggered.connect(lambda: self._delete(iid))
        menu.exec(self.tree.viewport().mapToGlobal(pos))

    def _after(self):
        QTimer.singleShot(0, self.refresh)
        self.changed.emit()

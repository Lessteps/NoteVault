"""
Proyecto Notas: gestor documental estilo Obsidian para proyectos.
Permite crear carpetas internas y archivos .md dentro de la carpeta del proyecto
(.notevault/proyectos/<project-id>/notas/).
"""

import os
from pathlib import Path
from datetime import datetime

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QSplitter, QTreeWidget, QTreeWidgetItem,
    QTextEdit, QPushButton, QMenu, QInputDialog, QMessageBox, QFrame, QLabel,
)

from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, UI_FONT,
    label, flat_btn, primary_btn, line_edit,
)

FILE_ROLE = Qt.UserRole + 1
IS_DIR_ROLE = Qt.UserRole + 2


class ProyectoNotas(QWidget):
    """Explorador y editor de notas Markdown por proyecto."""
    notes_updated = Signal()

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        self.root_dir: Path = None
        self.current_file: Path = None

        self.setStyleSheet(f"background:{BG_PAGE};")
        main_lay = QVBoxLayout(self)
        main_lay.setContentsMargins(0, 4, 0, 0)
        main_lay.setSpacing(6)

        split = QSplitter(Qt.Horizontal)
        split.setHandleWidth(6)

        # ── Panel Izquierdo: Explorador de Archivos / Carpetas ─────────────
        left_box = QFrame()
        left_box.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};border-radius:8px;}}"
        )
        left_lay = QVBoxLayout(left_box)
        left_lay.setContentsMargins(8, 8, 8, 8)
        left_lay.setSpacing(6)

        # Barra superior de acciones
        top_bar = QHBoxLayout()
        top_bar.addWidget(label("DOCUMENTOS", TEXT_FAINT, 10, True))
        top_bar.addStretch()

        btn_new_note = flat_btn("+ Nota", height=24)
        btn_new_note.setToolTip("Crear nueva nota Markdown (.md)")
        btn_new_note.clicked.connect(self._create_note_prompt)
        top_bar.addWidget(btn_new_note)

        btn_new_folder = flat_btn("+ Carpeta", height=24)
        btn_new_folder.setToolTip("Crear nueva subcarpeta")
        btn_new_folder.clicked.connect(self._create_folder_prompt)
        top_bar.addWidget(btn_new_folder)

        btn_open_dir = flat_btn("📁 Ver en file", height=24)
        btn_open_dir.setToolTip("Abrir carpeta de notas en el explorador de archivos del sistema")
        btn_open_dir.clicked.connect(self._open_in_file_explorer)
        top_bar.addWidget(btn_open_dir)
        left_lay.addLayout(top_bar)

        # Filtro de búsqueda
        self.search = line_edit("🔎 Filtrar notas…", 26)
        self.search.textChanged.connect(self._filter_tree)
        left_lay.addWidget(self.search)

        # Árbol de archivos
        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)
        self.tree.setIndentation(16)
        self.tree.setStyleSheet(
            f"QTreeWidget{{background:transparent;border:none;color:{TEXT};font-size:12px;font-family:{UI_FONT};}}"
            f"QTreeWidget::item{{padding:4px 6px;border-radius:4px;}}"
            f"QTreeWidget::item:hover{{background:rgba(255,255,255,0.05);}}"
            f"QTreeWidget::item:selected{{background:rgba(35,131,226,0.25);color:{TEXT};font-weight:600;}}"
        )
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self._context_menu)
        self.tree.itemClicked.connect(self._on_item_clicked)
        left_lay.addWidget(self.tree, 1)

        split.addWidget(left_box)

        # ── Panel Derecho: Editor Markdown ────────────────────────────────
        right_box = QFrame()
        right_box.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};border-radius:8px;}}"
        )
        right_lay = QVBoxLayout(right_box)
        right_lay.setContentsMargins(12, 10, 12, 10)
        right_lay.setSpacing(6)

        # Barra de título y estado de la nota
        header_bar = QHBoxLayout()
        self.doc_title = label("Selecciona o crea una nota", TEXT, 14, True)
        header_bar.addWidget(self.doc_title)
        header_bar.addStretch()

        self.save_status = label("", TEXT_FAINT, 11)
        header_bar.addWidget(self.save_status)
        right_lay.addLayout(header_bar)

        # Área de edición
        self.editor = QTextEdit()
        self.editor.setPlaceholderText("Escribe aquí en formato Markdown…")
        self.editor.setStyleSheet(
            f"QTextEdit{{background:#1c1c20;border:1px solid {BORDER};border-radius:6px;color:{TEXT};"
            f"font-size:13px;padding:12px;font-family:{UI_FONT};line-height:1.4;}}"
            f"QTextEdit:focus{{border-color:{BLUE};}}"
        )
        self.editor.setEnabled(False)

        # Debounce auto-guardado
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(500)
        self._save_timer.timeout.connect(self._save_current_file)
        self.editor.textChanged.connect(self._on_editor_text_changed)

        right_lay.addWidget(self.editor, 1)

        # Barra de pie: estadísticas del doc
        footer_bar = QHBoxLayout()
        self.doc_stats = label("", TEXT_FAINT, 10)
        footer_bar.addWidget(self.doc_stats)
        footer_bar.addStretch()
        right_lay.addLayout(footer_bar)

        split.addWidget(right_box)
        split.setStretchFactor(0, 1)
        split.setStretchFactor(1, 3)

        main_lay.addWidget(split)

    # ── Carga de Proyecto ──────────────────────────────────────────────────

    def load_project(self, project):
        self.project = project
        if not project:
            self.root_dir = None
            self.current_file = None
            self.editor.clear()
            self.editor.setEnabled(False)
            self.doc_title.setText("Sin proyecto seleccionado")
            return

        # Carpeta de notas del proyecto: .notevault/proyectos/<id>/notas/
        proj_file = self.manager.project_path(project.id)
        self.root_dir = Path(proj_file).parent / "notas"
        self.root_dir.mkdir(parents=True, exist_ok=True)

        # Migración inicial si el proyecto tiene descripción pero no hay notas
        md_files = list(self.root_dir.rglob("*.md"))
        if not md_files:
            initial_content = (project.description or "").strip() or f"# {project.name}\n\nDocumentación del proyecto."
            readme_path = self.root_dir / "General.md"
            try:
                readme_path.write_text(initial_content, encoding="utf-8")
            except Exception:
                pass

        self.refresh_tree()

        # Abrir el primer archivo si no hay ninguno seleccionado
        first_file = self._find_first_file(self.root_dir)
        if first_file:
            self._open_file(first_file)
        else:
            self.current_file = None
            self.editor.clear()
            self.editor.setEnabled(False)
            self.doc_title.setText("Sin notas")
            self.save_status.setText("")

    def _find_first_file(self, folder: Path) -> Path:
        for p in sorted(folder.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
            if p.is_file() and p.suffix.lower() == ".md":
                return p
            elif p.is_dir():
                sub = self._find_first_file(p)
                if sub:
                    return sub
        return None

    # ── Manejo del Árbol ───────────────────────────────────────────────────

    def refresh_tree(self):
        self.tree.clear()
        if not self.root_dir or not self.root_dir.exists():
            return
        self._populate_tree(self.root_dir, self.tree.invisibleRootItem())
        self.tree.expandAll()

    def _populate_tree(self, folder: Path, parent_item):
        entries = sorted(folder.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        for entry in entries:
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                item = QTreeWidgetItem([f"📁 {entry.name}"])
                item.setData(0, FILE_ROLE, str(entry))
                item.setData(0, IS_DIR_ROLE, True)
                parent_item.addChild(item)
                self._populate_tree(entry, item)
            elif entry.suffix.lower() == ".md":
                clean_name = entry.stem
                item = QTreeWidgetItem([f"📝 {clean_name}"])
                item.setData(0, FILE_ROLE, str(entry))
                item.setData(0, IS_DIR_ROLE, False)
                parent_item.addChild(item)

    def _filter_tree(self, text: str):
        q = text.strip().lower()

        def match_item(item):
            matches = q in item.text(0).lower()
            child_matches = False
            for i in range(item.childCount()):
                if match_item(item.child(i)):
                    child_matches = True
            visible = matches or child_matches
            item.setHidden(not visible)
            if visible and q:
                item.setExpanded(True)
            return visible

        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            match_item(root.child(i))

    def _on_item_clicked(self, item, col):
        is_dir = item.data(0, IS_DIR_ROLE)
        path_str = item.data(0, FILE_ROLE)
        if not is_dir and path_str:
            self._open_file(Path(path_str))

    # ── Editor & Auto-Save ────────────────────────────────────────────────

    def _open_file(self, file_path: Path):
        if not file_path or not file_path.exists():
            return
        # Guardar archivo actual antes de cambiar
        if self.current_file and self.current_file.exists() and self._save_timer.isActive():
            self._save_timer.stop()
            self._save_current_file()

        self.current_file = file_path
        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception:
            content = ""

        self.editor.blockSignals(True)
        self.editor.setPlainText(content)
        self.editor.blockSignals(False)
        self.editor.setEnabled(True)

        rel = file_path.relative_to(self.root_dir)
        self.doc_title.setText(f"📝  {str(rel)}")
        self.save_status.setText("Guardado ✓")
        self._update_stats()

    def _on_editor_text_changed(self):
        self.save_status.setText("Modificado…")
        self._update_stats()
        self._save_timer.start()

    def _save_current_file(self):
        if not self.current_file:
            return
        try:
            text = self.editor.toPlainText()
            self.current_file.write_text(text, encoding="utf-8")
            self.save_status.setText(f"Guardado {datetime.now().strftime('%H:%M:%S')} ✓")
            self.notes_updated.emit()
        except Exception as e:
            self.save_status.setText(f"Error al guardar: {e}")

    def _update_stats(self):
        text = self.editor.toPlainText()
        words = len(text.split())
        chars = len(text)
        self.doc_stats.setText(f"{words} palabras · {chars} caracteres")

    # ── Acciones de Creación y Menú Contextual ─────────────────────────────

    def _get_target_dir(self) -> Path:
        item = self.tree.currentItem()
        if item:
            is_dir = item.data(0, IS_DIR_ROLE)
            path = Path(item.data(0, FILE_ROLE))
            return path if is_dir else path.parent
        return self.root_dir

    def _create_note_prompt(self):
        if not self.root_dir:
            return
        target_dir = self._get_target_dir()
        name, ok = QInputDialog.getText(self, "Nueva Nota", "Nombre de la nota:")
        if not ok or not name.strip():
            return
        clean_name = name.strip()
        if not clean_name.lower().endswith(".md"):
            clean_name += ".md"
        file_path = target_dir / clean_name
        if file_path.exists():
            QMessageBox.warning(self, "Nota existente", "Ya existe una nota con ese nombre.")
            return
        try:
            file_path.write_text(f"# {name.strip().replace('.md', '')}\n\n", encoding="utf-8")
            self.refresh_tree()
            self._open_file(file_path)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"No se pudo crear la nota: {e}")

    def _create_folder_prompt(self):
        if not self.root_dir:
            return
        target_dir = self._get_target_dir()
        name, ok = QInputDialog.getText(self, "Nueva Carpeta", "Nombre de la carpeta:")
        if not ok or not name.strip():
            return
        folder_path = target_dir / name.strip()
        if folder_path.exists():
            QMessageBox.warning(self, "Carpeta existente", "Ya existe una carpeta con ese nombre.")
            return
        try:
            folder_path.mkdir(parents=True, exist_ok=True)
            self.refresh_tree()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"No se pudo crear la carpeta: {e}")

    def _context_menu(self, pos):
        item = self.tree.itemAt(pos)
        if not item:
            return
        is_dir = item.data(0, IS_DIR_ROLE)
        path = Path(item.data(0, FILE_ROLE))

        menu = QMenu(self)
        if is_dir:
            act_note = menu.addAction("Nueva nota aquí")
            act_folder = menu.addAction("Nueva subcarpeta")
            menu.addSeparator()
            act_note.triggered.connect(self._create_note_prompt)
            act_folder.triggered.connect(self._create_folder_prompt)

        act_rename = menu.addAction("Renombrar")
        act_delete = menu.addAction("Eliminar")

        action = menu.exec(self.tree.mapToGlobal(pos))
        if action == act_rename:
            self._rename_item(path, is_dir)
        elif action == act_delete:
            self._delete_item(path, is_dir)

    def _rename_item(self, path: Path, is_dir: bool):
        current_name = path.name if is_dir else path.stem
        title = "Renombrar Carpeta" if is_dir else "Renombrar Nota"
        new_name, ok = QInputDialog.getText(self, title, "Nuevo nombre:", text=current_name)
        if not ok or not new_name.strip() or new_name.strip() == current_name:
            return
        clean = new_name.strip() + ("" if is_dir or new_name.endswith(".md") else ".md")
        target = path.parent / clean
        if target.exists():
            QMessageBox.warning(self, "Nombre en uso", "Ya existe un elemento con ese nombre.")
            return
        try:
            path.rename(target)
            if self.current_file == path:
                self.current_file = target
                self.doc_title.setText(f"📝  {str(target.relative_to(self.root_dir))}")
            self.refresh_tree()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"No se pudo renombrar: {e}")

    def _delete_item(self, path: Path, is_dir: bool):
        elem = "la carpeta y todo su contenido" if is_dir else f"la nota «{path.name}»"
        if QMessageBox.question(
            self, "Eliminar", f"¿Estás seguro de eliminar {elem}?",
            QMessageBox.Yes | QMessageBox.No
        ) != QMessageBox.Yes:
            return
        try:
            if is_dir:
                import shutil
                shutil.rmtree(path)
            else:
                path.unlink()
                if self.current_file == path:
                    self.current_file = None
                    self.editor.clear()
                    self.editor.setEnabled(False)
                    self.doc_title.setText("Selecciona o crea una nota")
                    self.save_status.setText("")
            self.refresh_tree()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"No se pudo eliminar: {e}")

    def _open_in_file_explorer(self):
        if not self.root_dir or not self.root_dir.exists():
            return
        try:
            import os
            os.startfile(str(self.root_dir))
        except Exception:
            pass

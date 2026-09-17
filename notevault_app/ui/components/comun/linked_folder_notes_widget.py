"""
Widget reutilizable para conectar Metas, Submetas e Issues con:
1. Una carpeta física observable en el sistema (con selector, creador y botón 'Ver en file').
2. Notas internas del proyecto vinculadas obligatoriamente a su carpeta única (.notevault/proyectos/<id>/notas/).
3. Archivos externos vinculados mediante selector dedicado de archivos del sistema.
"""

import os
import subprocess
from pathlib import Path
from typing import Optional, List

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QFileDialog, QInputDialog, QDialog, QListWidget, QListWidgetItem,
    QLineEdit, QMessageBox,
)

from . import (
    BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, ORANGE, UI_FONT,
    label, flat_btn, primary_btn, clear_layout,
)


class NotePickerDialog(QDialog):
    """
    Buscador y selector rápido de notas.
    Si se proporciona `project_notes_dir`, SOLO permite buscar o crear notas dentro
    de la carpeta interna del proyecto, garantizando la restricción obligatoria.
    """

    def __init__(self, vault_root: Path, project_notes_dir: Optional[Path] = None, parent=None):
        super().__init__(parent)
        self.vault_root = Path(vault_root)
        self.project_notes_dir = Path(project_notes_dir) if project_notes_dir else None
        self.selected_path: Optional[Path] = None

        is_project_mode = bool(self.project_notes_dir)
        self.setWindowTitle("Vincular Nota del Proyecto" if is_project_mode else "Vincular Nota")
        self.resize(520, 460)
        self.setStyleSheet(
            f"QDialog {{ background: #0f172a; color: #f8fafc; font-family: {UI_FONT}; border-radius: 8px; }}"
        )

        lay = QVBoxLayout(self)
        lay.setContentsMargins(16, 16, 16, 16)
        lay.setSpacing(10)

        # Header informativo de alto contraste
        head_box = QFrame()
        head_box.setStyleSheet(
            "QFrame { background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 6px; }"
        )
        h_lay = QVBoxLayout(head_box)
        h_lay.setContentsMargins(8, 6, 8, 6)
        h_lay.setSpacing(2)

        if is_project_mode:
            h_title = label("📘 VINCULAR NOTA INTERNA DEL PROYECTO", "#38bdf8", 11, bold=True)
            try:
                rel_dir = str(self.project_notes_dir.relative_to(self.vault_root)).replace("\\", "/")
            except ValueError:
                rel_dir = str(self.project_notes_dir).replace("\\", "/")
            h_sub = label(f"Carpeta obligatoria: {rel_dir}", "#94a3b8", 11)
            h_lay.addWidget(h_title)
            h_lay.addWidget(h_sub)
        else:
            h_title = label("📘 SELECCIONAR NOTA DE LA VAULT", "#38bdf8", 11, bold=True)
            h_sub = label("Búsqueda general de notas en la vault", "#94a3b8", 11)
            h_lay.addWidget(h_title)
            h_lay.addWidget(h_sub)

        lay.addWidget(head_box)

        # Buscador con alto contraste
        self.search = QLineEdit()
        self.search.setPlaceholderText("🔎  Buscar nota por nombre…")
        self.search.setFixedHeight(32)
        self.search.setStyleSheet(
            "QLineEdit { background: #1e293b; border: 1px solid #334155; border-radius: 6px; "
            "color: #f8fafc; padding: 4px 10px; font-size: 13px; }"
            "QLineEdit:focus { border-color: #38bdf8; background: #243044; }"
        )
        self.search.textChanged.connect(self._filter_list)
        lay.addWidget(self.search)

        # Lista de notas de alto contraste
        self.list_widget = QListWidget()
        self.list_widget.setStyleSheet(
            "QListWidget { background: #1e293b; border: 1px solid #334155; border-radius: 6px; "
            "padding: 6px; color: #f8fafc; font-size: 13px; }"
            "QListWidget::item { padding: 8px 10px; border-radius: 5px; margin-bottom: 2px; }"
            "QListWidget::item:hover { background: #243044; color: #ffffff; }"
            "QListWidget::item:selected { background: #2563eb; color: #ffffff; font-weight: 600; }"
        )
        self.list_widget.itemDoubleClicked.connect(self._accept_item)
        lay.addWidget(self.list_widget, stretch=1)

        # Barra de botones inferior
        bottom = QHBoxLayout()
        bottom.setSpacing(8)

        if is_project_mode:
            btn_new = flat_btn("➕  Crear nota en el proyecto", "#38bdf8", height=30)
            btn_new.setToolTip("Crear un nuevo archivo .md dentro de la carpeta interna del proyecto")
            btn_new.clicked.connect(self._create_project_note)
            bottom.addWidget(btn_new)
        else:
            btn_browse = flat_btn("Explorar archivo en disco…", height=30)
            btn_browse.clicked.connect(self._browse_disk)
            bottom.addWidget(btn_browse)

        bottom.addStretch()

        btn_cancel = flat_btn("Cancelar", height=30)
        btn_cancel.clicked.connect(self.reject)
        bottom.addWidget(btn_cancel)

        btn_ok = primary_btn("Vincular", 30)
        btn_ok.clicked.connect(self._accept_current)
        bottom.addWidget(btn_ok)
        lay.addLayout(bottom)

        self._all_notes: List[Path] = []
        self._load_notes()

    def _load_notes(self):
        self._all_notes = []
        target_dir = self.project_notes_dir if self.project_notes_dir else self.vault_root
        if target_dir and target_dir.exists():
            for p in sorted(target_dir.rglob("*.md"), key=lambda x: x.name.lower()):
                parts = p.parts
                # En project_mode permitimos .notevault porque la carpeta del proyecto vive allí
                if not self.project_notes_dir and any(part.startswith(".") for part in parts):
                    continue
                if any(part in ("__pycache__", "node_modules") for part in parts):
                    continue
                self._all_notes.append(p)
        self._filter_list(self.search.text())

    def _filter_list(self, query: str):
        q = (query or "").lower().strip()
        self.list_widget.clear()
        base_dir = self.project_notes_dir if self.project_notes_dir else self.vault_root

        count = 0
        for p in self._all_notes:
            try:
                rel = str(p.relative_to(base_dir)).replace("\\", "/")
            except ValueError:
                rel = str(p.name)
            if not q or q in rel.lower() or q in p.stem.lower():
                item = QListWidgetItem(f"📘  {rel}")
                item.setData(Qt.UserRole, p)
                self.list_widget.addItem(item)
                count += 1

        if count == 0:
            msg = (
                "ℹ No hay notas en la carpeta del proyecto. Pulsa '+ Crear nota en el proyecto'."
                if self.project_notes_dir else "ℹ No se encontraron notas coincidentes."
            )
            placeholder = QListWidgetItem(msg)
            placeholder.setFlags(Qt.NoItemFlags)
            self.list_widget.addItem(placeholder)
        else:
            self.list_widget.setCurrentRow(0)

    def _create_project_note(self):
        if not self.project_notes_dir:
            return
        name, ok = QInputDialog.getText(
            self, "Nueva nota en el proyecto",
            "Nombre del documento .md (ej. Especificación Técnica):"
        )
        if not ok or not name.strip():
            return
        clean_name = name.strip()
        if not clean_name.lower().endswith(".md"):
            clean_name += ".md"
        note_file = self.project_notes_dir / clean_name
        try:
            if not note_file.exists():
                note_file.parent.mkdir(parents=True, exist_ok=True)
                title = clean_name[:-3]
                note_file.write_text(f"# {title}\n\nDocumento del proyecto.\n", encoding="utf-8")
            self.selected_path = note_file
            self.accept()
        except Exception as err:
            QMessageBox.critical(self, "Error al crear nota", f"No se pudo crear la nota:\n{err}")

    def _accept_item(self, item: QListWidgetItem):
        if item and item.flags() & Qt.ItemIsEnabled:
            self.selected_path = item.data(Qt.UserRole)
            if self.selected_path:
                self.accept()

    def _accept_current(self):
        curr = self.list_widget.currentItem()
        if curr and curr.flags() & Qt.ItemIsEnabled:
            self.selected_path = curr.data(Qt.UserRole)
            if self.selected_path:
                self.accept()

    def _browse_disk(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Seleccionar archivo Markdown", str(self.vault_root),
            "Archivos Markdown (*.md);;Todos los archivos (*.*)"
        )
        if path:
            self.selected_path = Path(path)
            self.accept()


class LinkedFolderNotesWidget(QWidget):
    """
    Componente para asociar una carpeta observable en el sistema y notas/archivos
    vinculados a cualquier Meta, Submeta o Issue.
    """
    open_note_requested = Signal(object)      # Path
    reveal_in_os_requested = Signal(object)   # Path
    data_changed = Signal()

    def __init__(self, vault_root: Path, parent=None, default_folder_prefix: str = "",
                 project_notes_dir: Optional[Path] = None):
        super().__init__(parent)
        self.vault_root = Path(vault_root) if vault_root else None
        self.project_notes_dir: Optional[Path] = Path(project_notes_dir) if project_notes_dir else None
        self.default_folder_prefix = default_folder_prefix
        self._linked_folder: str = ""
        self._linked_notes: List[str] = []

        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 4, 0, 4)
        lay.setSpacing(10)

        # ── 1. Caja de Carpeta Observable ─────────────────────────────────────
        folder_box = QFrame()
        folder_box.setStyleSheet(
            "QFrame { background: #1e293b; border: 1px solid #334155; border-radius: 8px; }"
        )
        f_lay = QVBoxLayout(folder_box)
        f_lay.setContentsMargins(12, 10, 12, 10)
        f_lay.setSpacing(6)

        f_head = QHBoxLayout()
        f_head.addWidget(label("📁 CARPETA OBSERVABLE EN EL SISTEMA", "#38bdf8", 10, bold=True))
        f_head.addStretch()

        self.btn_open_folder = flat_btn("👁  Ver en file", BLUE, height=24)
        self.btn_open_folder.setToolTip("Abrir carpeta en el Explorador de archivos de Windows")
        self.btn_open_folder.clicked.connect(self._open_folder_in_os)
        f_head.addWidget(self.btn_open_folder)

        self.btn_pick_folder = flat_btn("📂  Seleccionar…", height=24)
        self.btn_pick_folder.setToolTip("Seleccionar una carpeta existente en el sistema o vault")
        self.btn_pick_folder.clicked.connect(self._pick_folder)
        f_head.addWidget(self.btn_pick_folder)

        self.btn_create_folder = flat_btn("📁  Crear carpeta", GREEN, height=24)
        self.btn_create_folder.setToolTip("Crear una carpeta física observable para esta entidad")
        self.btn_create_folder.clicked.connect(self._create_folder)
        f_head.addWidget(self.btn_create_folder)

        f_lay.addLayout(f_head)

        self.lbl_folder_path = label("Sin carpeta asignada", "#94a3b8", 12)
        self.lbl_folder_path.setStyleSheet(
            "color: #94a3b8; font-size: 12px; padding: 2px 4px; background: transparent;"
        )
        f_lay.addWidget(self.lbl_folder_path)

        lay.addWidget(folder_box)

        # ── 2. Caja de Backlinks y Archivos Vinculados ─────────────────────────
        notes_box = QFrame()
        notes_box.setStyleSheet(
            "QFrame { background: #1e293b; border: 1px solid #334155; border-radius: 8px; }"
        )
        n_lay = QVBoxLayout(notes_box)
        n_lay.setContentsMargins(12, 10, 12, 10)
        n_lay.setSpacing(8)

        n_head = QHBoxLayout()
        n_head.addWidget(label("🔗 NOTAS Y ARCHIVOS VINCULADOS", "#38bdf8", 10, bold=True))
        n_head.addStretch()

        self.btn_link_note = flat_btn("📘 + Nota del proyecto", BLUE, height=24)
        self.btn_link_note.setToolTip("Vincular una nota de la carpeta interna del proyecto")
        self.btn_link_note.clicked.connect(self._link_internal_note_prompt)
        n_head.addWidget(self.btn_link_note)

        self.btn_link_external = flat_btn("📎 + Archivo externo", "#a855f7", height=24)
        self.btn_link_external.setToolTip("Vincular un archivo externo de cualquier ubicación del sistema")
        self.btn_link_external.clicked.connect(self._link_external_file_prompt)
        n_head.addWidget(self.btn_link_external)

        n_lay.addLayout(n_head)

        self.notes_container = QVBoxLayout()
        self.notes_container.setSpacing(4)
        n_lay.addLayout(self.notes_container)

        self.lbl_no_notes = label("No hay notas ni archivos externos vinculados aún.", "#94a3b8", 11)
        n_lay.addWidget(self.lbl_no_notes)

        lay.addWidget(notes_box)

    # ── Configuración de Proyecto y Vault ─────────────────────────────────────

    def set_vault_root(self, vault_root: Optional[Path]):
        self.vault_root = Path(vault_root) if vault_root else None

    def set_project_notes_dir(self, path: Optional[Path]):
        """Establece la carpeta interna única de notas para el proyecto."""
        self.project_notes_dir = Path(path) if path else None
        if self.project_notes_dir:
            self.btn_link_note.setText("📘 + Nota del proyecto")
            self.btn_link_note.setToolTip(f"Vincular nota desde: {self.project_notes_dir.name}/")
        else:
            self.btn_link_note.setText("📘 + Nota de la vault")
            self.btn_link_note.setToolTip("Buscar y vincular una nota de la vault")
        self._refresh_ui()

    # ── Getters / Setters ─────────────────────────────────────────────────────

    def set_data(self, folder: str = "", notes: Optional[List[str]] = None,
                 linked_folder: str = "", linked_notes: Optional[List[str]] = None,
                 default_folder_suggestion: str = ""):
        f = folder or linked_folder or ""
        n = notes if notes is not None else linked_notes
        self._linked_folder = f.strip()
        self._linked_notes = list(n or [])
        if default_folder_suggestion:
            self.default_folder_prefix = default_folder_suggestion
        self._refresh_ui()

    def get_data(self):
        return self._linked_folder, list(self._linked_notes)

    def get_folder(self) -> str:
        return self._linked_folder

    def get_notes(self) -> List[str]:
        return list(self._linked_notes)

    # ── Resolvers ─────────────────────────────────────────────────────────────

    def _resolve_folder_path(self) -> Optional[Path]:
        if not self._linked_folder:
            return None
        p = Path(self._linked_folder)
        if not p.is_absolute() and self.vault_root:
            p = self.vault_root / p
        return p

    def _resolve_note_path(self, note_ref: str) -> Optional[Path]:
        if not note_ref:
            return None
        clean_ref = note_ref.strip("[]")
        p = Path(clean_ref)
        if p.is_absolute() and p.exists():
            return p

        # 1. Buscar en la carpeta interna del proyecto
        if self.project_notes_dir:
            proj_p = self.project_notes_dir / clean_ref
            if proj_p.exists():
                return proj_p
            if not clean_ref.endswith(".md"):
                proj_p_md = self.project_notes_dir / f"{clean_ref}.md"
                if proj_p_md.exists():
                    return proj_p_md

        # 2. Buscar relativo a la vault
        if self.vault_root:
            vault_p = self.vault_root / clean_ref
            if vault_p.exists():
                return vault_p
            if not clean_ref.endswith(".md"):
                vault_p_md = self.vault_root / f"{clean_ref}.md"
                if vault_p_md.exists():
                    return vault_p_md

            # 3. Búsqueda por nombre de archivo
            for cand in self.vault_root.rglob("*.md"):
                if cand.name.lower() == p.name.lower() or cand.stem.lower() == clean_ref.lower():
                    return cand

        return p if p.is_absolute() else (self.vault_root / clean_ref if self.vault_root else p)

    def _is_internal_project_note(self, note_path: Optional[Path]) -> bool:
        if not note_path:
            return False
        if self.project_notes_dir:
            try:
                note_path.resolve().relative_to(self.project_notes_dir.resolve())
                return True
            except ValueError:
                pass
        return note_path.suffix.lower() == ".md"

    # ── Refresh UI ────────────────────────────────────────────────────────────

    def _refresh_ui(self):
        # 1. Carpeta
        folder = self._resolve_folder_path()
        if folder and folder.exists():
            try:
                rel = str(folder.relative_to(self.vault_root)).replace("\\", "/")
                text = f"📁  {rel}"
            except (ValueError, AttributeError):
                text = f"📁  {folder}"
            self.lbl_folder_path.setText(text)
            self.lbl_folder_path.setStyleSheet("color: #f8fafc; font-size: 12px; font-weight: 600;")
            self.btn_open_folder.setVisible(True)
        elif self._linked_folder:
            self.lbl_folder_path.setText(f"⚠ Carpeta no encontrada: {self._linked_folder}")
            self.lbl_folder_path.setStyleSheet(f"color: {ORANGE}; font-size: 12px;")
            self.btn_open_folder.setVisible(False)
        else:
            self.lbl_folder_path.setText("Sin carpeta asignada")
            self.lbl_folder_path.setStyleSheet("color: #94a3b8; font-size: 12px;")
            self.btn_open_folder.setVisible(False)

        # 2. Notas y Archivos
        clear_layout(self.notes_container)
        has_notes = bool(self._linked_notes)
        self.lbl_no_notes.setVisible(not has_notes)

        for note_ref in self._linked_notes:
            row = QFrame()
            row.setStyleSheet(
                "QFrame { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 2px; }"
                "QFrame:hover { border-color: #38bdf8; background: #1a2234; }"
            )
            r_lay = QHBoxLayout(row)
            r_lay.setContentsMargins(8, 5, 8, 5)
            r_lay.setSpacing(8)

            note_path = self._resolve_note_path(note_ref)
            is_internal = self._is_internal_project_note(note_path)

            if is_internal:
                badge = QLabel("📘 NOTA PROYECTO")
                badge.setStyleSheet(
                    "background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid #0284c7; "
                    "font-size: 10px; font-weight: bold; border-radius: 4px; padding: 2px 6px;"
                )
            else:
                badge = QLabel("📎 ARCHIVO EXTERNO")
                badge.setStyleSheet(
                    "background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid #7e22ce; "
                    "font-size: 10px; font-weight: bold; border-radius: 4px; padding: 2px 6px;"
                )
            r_lay.addWidget(badge)

            display_name = note_ref
            if note_path:
                if self.project_notes_dir:
                    try:
                        display_name = str(note_path.relative_to(self.project_notes_dir)).replace("\\", "/")
                    except ValueError:
                        display_name = note_path.name
                elif self.vault_root:
                    try:
                        display_name = str(note_path.relative_to(self.vault_root)).replace("\\", "/")
                    except ValueError:
                        display_name = note_path.name
                else:
                    display_name = note_path.name

            lbl_note = label(display_name, "#f8fafc", 12, bold=True)
            lbl_note.setToolTip(str(note_path) if note_path else note_ref)
            r_lay.addWidget(lbl_note, stretch=1)

            # Botón: Abrir / Buscar
            btn_locate = flat_btn("🔍  Abrir", BLUE, height=22)
            btn_locate.setToolTip("Abrir nota en el editor o en su aplicación predeterminada")
            btn_locate.clicked.connect(lambda _=False, p=note_path: self._locate_note(p))
            r_lay.addWidget(btn_locate)

            # Botón: Ver en file
            btn_file = flat_btn("👁  Ver en file", TEXT_DIM, height=22)
            btn_file.setToolTip("Mostrar este archivo en el Explorador de Windows")
            btn_file.clicked.connect(lambda _=False, p=note_path: self._reveal_file(p))
            r_lay.addWidget(btn_file)

            # Botón: Desvincular
            btn_unlink = QPushButton("✕")
            btn_unlink.setFixedSize(22, 22)
            btn_unlink.setCursor(Qt.PointingHandCursor)
            btn_unlink.setToolTip("Desvincular este archivo/nota")
            btn_unlink.setStyleSheet(
                f"QPushButton {{ background: transparent; border: none; color: #94a3b8; font-weight: bold; font-size: 13px; }}"
                f"QPushButton:hover {{ color: {RED}; background: rgba(242, 85, 90, 0.2); border-radius: 4px; }}"
            )
            btn_unlink.clicked.connect(lambda _=False, nr=note_ref: self._unlink_note(nr))
            r_lay.addWidget(btn_unlink)

            self.notes_container.addWidget(row)

    # ── Folder Actions ────────────────────────────────────────────────────────

    def _pick_folder(self):
        start_dir = self.vault_root
        existing = self._resolve_folder_path()
        if existing and existing.exists():
            start_dir = existing
        chosen = QFileDialog.getExistingDirectory(
            self, "Seleccionar carpeta observable", str(start_dir)
        )
        if chosen:
            chosen_path = Path(chosen)
            try:
                rel = str(chosen_path.relative_to(self.vault_root)).replace("\\", "/")
                self._linked_folder = rel
            except (ValueError, AttributeError):
                self._linked_folder = str(chosen_path)
            self._refresh_ui()
            self.data_changed.emit()

    def _create_folder(self):
        preset = self.default_folder_prefix or "notas/Proyectos/Nuevo"
        name, ok = QInputDialog.getText(
            self, "Crear carpeta observable",
            "Ruta de la nueva carpeta (relativa a la vault o absoluta):",
            text=preset
        )
        if not ok or not name.strip():
            return
        folder_str = name.strip().replace("\\", "/")
        p = Path(folder_str)
        target_path = p if p.is_absolute() else (self.vault_root / p if self.vault_root else p)
        try:
            target_path.mkdir(parents=True, exist_ok=True)
            try:
                self._linked_folder = str(target_path.relative_to(self.vault_root)).replace("\\", "/")
            except (ValueError, AttributeError):
                self._linked_folder = str(target_path)
            self._refresh_ui()
            self.data_changed.emit()
            QMessageBox.information(
                self, "Carpeta creada",
                f"Se creó la carpeta observable en el sistema:\n{target_path}"
            )
        except Exception as err:
            QMessageBox.critical(self, "Error al crear carpeta", f"No se pudo crear la carpeta:\n{err}")

    def _open_folder_in_os(self):
        folder = self._resolve_folder_path()
        if not folder or not folder.exists():
            QMessageBox.warning(self, "Carpeta no encontrada", "La carpeta asignada no existe en disco.")
            return
        try:
            os.startfile(str(folder))
        except Exception:
            subprocess.Popen(["explorer", str(folder)])
        self.reveal_in_os_requested.emit(folder)

    # ── Link Actions ──────────────────────────────────────────────────────────

    def _link_internal_note_prompt(self):
        """Vincular una nota estrictamente dentro de la carpeta interna del proyecto."""
        dlg = NotePickerDialog(self.vault_root, project_notes_dir=self.project_notes_dir, parent=self)
        if dlg.exec() == QDialog.Accepted and dlg.selected_path:
            path = dlg.selected_path
            try:
                rel = str(path.relative_to(self.vault_root)).replace("\\", "/")
            except (ValueError, AttributeError):
                rel = str(path).replace("\\", "/")
            if rel not in self._linked_notes:
                self._linked_notes.append(rel)
                self._refresh_ui()
                self.data_changed.emit()

    def _link_external_file_prompt(self):
        """Vincular un archivo externo desde cualquier parte del disco."""
        chosen, _ = QFileDialog.getOpenFileName(
            self, "Vincular archivo externo", str(Path.home()),
            "Todos los archivos (*.*)"
        )
        if chosen:
            p = Path(chosen).resolve()
            p_str = str(p).replace("\\", "/")
            if p_str not in self._linked_notes:
                self._linked_notes.append(p_str)
                self._refresh_ui()
                self.data_changed.emit()

    def _unlink_note(self, note_ref: str):
        if note_ref in self._linked_notes:
            self._linked_notes.remove(note_ref)
            self._refresh_ui()
            self.data_changed.emit()

    def _locate_note(self, note_path: Optional[Path]):
        if not note_path or not note_path.exists():
            QMessageBox.warning(self, "Archivo no encontrado", "El archivo vinculado no existe en disco.")
            return
        if note_path.suffix.lower() == ".md":
            self.open_note_requested.emit(note_path)
        else:
            try:
                os.startfile(str(note_path))
            except Exception:
                pass
            self.reveal_in_os_requested.emit(note_path)

    def _reveal_file(self, file_path: Optional[Path]):
        if not file_path or not file_path.exists():
            QMessageBox.warning(self, "Archivo no encontrado", "El archivo no existe en disco.")
            return
        try:
            subprocess.Popen(f'explorer.exe /select,"{file_path.resolve()}"')
        except Exception:
            try:
                os.startfile(str(file_path.parent))
            except Exception:
                pass
        self.reveal_in_os_requested.emit(file_path)

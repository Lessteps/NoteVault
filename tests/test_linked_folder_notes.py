"""Pruebas unitarias para vinculación de carpetas observables, backlinks de notas y exploración."""

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PySide6.QtWidgets import QApplication

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.core.project_manager import ProjectManager
from notevault_app.core.goal_manager import GoalManager
from notevault_app.ui.components.comun.linked_folder_notes_widget import LinkedFolderNotesWidget
from notevault_app.ui.components.notes.notes_sidebar import NotesSidebar

APP = QApplication.instance() or QApplication(sys.argv)


class TestLinkedFolderNotes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="nv_linked_test")
        self.vault_root = Path(self.temp_dir)
        self.vault_mgr = VaultManager(self.vault_root)
        self.notes_service = NotesService(self.vault_mgr)
        self.proj_mgr = ProjectManager(self.vault_root)
        self.goal_mgr = GoalManager(self.vault_root)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_project_issue_linked_folder_notes_persistence(self):
        project = self.proj_mgr.create("Backend Dev")
        folder_path = "backend/codigo"
        linked_notes = ["notas/arquitectura.md", "[[notas/base_datos]]"]

        # Crear issue con extra
        issue = self.proj_mgr.create_issue(
            project.id, "Diseñar API REST",
            extra={"linked_folder": folder_path, "linked_notes": linked_notes}
        )
        self.assertEqual(issue.extra.get("linked_folder"), folder_path)
        self.assertEqual(issue.extra.get("linked_notes"), linked_notes)

        # Actualizar con update_issue
        new_notes = ["notas/arquitectura.md", "notas/endpoints.md"]
        self.proj_mgr.update_issue(
            project.id, issue.id,
            extra={"linked_folder": "backend/api", "linked_notes": new_notes}
        )

        # Recargar de disco
        fresh_proj_mgr = ProjectManager(self.vault_root)
        reloaded = fresh_proj_mgr.get_issue(project.id, issue.id)
        self.assertIsNotNone(reloaded)
        self.assertEqual(reloaded.extra.get("linked_folder"), "backend/api")
        self.assertEqual(reloaded.extra.get("linked_notes"), new_notes)

    def test_goal_and_item_linked_folder_notes_persistence(self):
        # 1. Meta
        goal = self.goal_mgr.create_goal(
            "Dominar Algoritmos",
            extra={"linked_folder": "estudio/algoritmos", "linked_notes": ["notas/grafos.md"]}
        )
        self.assertEqual(goal.extra.get("linked_folder"), "estudio/algoritmos")

        # 2. Submeta
        item = self.goal_mgr.create_item(
            goal.id, "Búsqueda binaria",
            extra={"linked_folder": "estudio/algoritmos/busqueda", "linked_notes": ["notas/binaria.md"]}
        )
        self.assertEqual(item.extra.get("linked_folder"), "estudio/algoritmos/busqueda")
        self.assertEqual(item.extra.get("linked_notes"), ["notas/binaria.md"])

        # Actualizar
        self.goal_mgr.update_item(
            goal.id, item.id,
            extra={"linked_folder": "estudio/algoritmos/busqueda_v2", "linked_notes": ["notas/binaria_ex.md"]}
        )

        # Recargar de disco
        fresh_goal_mgr = GoalManager(self.vault_root)
        reloaded_goal = fresh_goal_mgr.get_goal(goal.id)
        self.assertEqual(reloaded_goal.extra.get("linked_folder"), "estudio/algoritmos")

        reloaded_item = fresh_goal_mgr.get_item(goal.id, item.id)
        self.assertIsNotNone(reloaded_item)
        self.assertEqual(reloaded_item.extra.get("linked_folder"), "estudio/algoritmos/busqueda_v2")
        self.assertEqual(reloaded_item.extra.get("linked_notes"), ["notas/binaria_ex.md"])

    def test_linked_folder_notes_widget(self):
        w = LinkedFolderNotesWidget(vault_root=self.vault_root)
        w.set_data(folder="mi_carpeta", notes=["nota1.md", "[[nota2]]"])
        f, n = w.get_data()
        self.assertEqual(f, "mi_carpeta")
        self.assertEqual(n, ["nota1.md", "[[nota2]]"])

    def test_notes_sidebar_filter_unexpanded_folders(self):
        # Crear estructura profunda de carpetas y notas
        subfolder = self.vault_root / "carpeta_a" / "subcarpeta_b"
        subfolder.mkdir(parents=True, exist_ok=True)
        target_note = subfolder / "algoritmo_dijkstra.md"
        target_note.write_text("# Dijkstra\nCamino mas corto", encoding="utf-8")

        sidebar = NotesSidebar(self.vault_mgr, self.notes_service)
        sidebar.populate_tree()

        # Filtrar por "dijkstra"
        sidebar._filter_tree("dijkstra")

        # Verificar que el item existe y no está oculto
        found = sidebar._find_item(target_note)
        self.assertIsNotNone(found)
        self.assertFalse(found.isHidden())

        # Limpiar filtro
        sidebar._filter_tree("")
        self.assertFalse(found.isHidden())

    def test_project_unique_internal_notes_folder(self):
        project = self.proj_mgr.create("Frontend React")
        notes_dir = self.proj_mgr.notes_dir(project.id)
        self.assertTrue(notes_dir.exists())
        self.assertTrue(notes_dir.is_dir())
        self.assertIn(".notevault", notes_dir.parts)
        self.assertIn("proyectos", notes_dir.parts)
        self.assertEqual(notes_dir.name, "notas")

    def test_note_picker_dialog_restricted_to_project_notes(self):
        from notevault_app.ui.components.comun.linked_folder_notes_widget import NotePickerDialog

        # 1. Crear proyecto y su nota interna
        proj = self.proj_mgr.create("API Node")
        proj_notes = self.proj_mgr.notes_dir(proj.id)
        internal_note = proj_notes / "arquitectura_api.md"
        internal_note.write_text("# Arquitectura API", encoding="utf-8")

        # 2. Crear nota externa a este proyecto (en la raíz u otro proyecto)
        outside_note = self.vault_root / "notas" / "global.md"
        outside_note.parent.mkdir(parents=True, exist_ok=True)
        outside_note.write_text("# Global", encoding="utf-8")

        # 3. Abrir NotePickerDialog con project_notes_dir
        dlg = NotePickerDialog(vault_root=self.vault_root, project_notes_dir=proj_notes)
        dlg._load_notes()

        # Debe contener únicamente la nota interna del proyecto
        self.assertIn(internal_note, dlg._all_notes)
        self.assertNotIn(outside_note, dlg._all_notes)

    def test_linked_widget_identifies_internal_vs_external_files(self):
        proj = self.proj_mgr.create("Devops CI")
        proj_notes = self.proj_mgr.notes_dir(proj.id)
        internal_file = proj_notes / "deploy.md"
        internal_file.write_text("# Deploy", encoding="utf-8")

        external_file = self.vault_root / "external_config.yaml"
        external_file.write_text("env: prod", encoding="utf-8")

        w = LinkedFolderNotesWidget(vault_root=self.vault_root, project_notes_dir=proj_notes)
        w.set_data(notes=[str(internal_file), str(external_file)])

        self.assertTrue(w._is_internal_project_note(internal_file))
        self.assertFalse(w._is_internal_project_note(external_file))

    def test_proyecto_lista_shows_linked_notes_badge(self):
        from notevault_app.ui.components.proyectos.proyecto_lista import ProyectoLista
        proj = self.proj_mgr.create("Microservicios")
        issue = self.proj_mgr.create_issue(
            proj.id, "Configurar Kafka",
            extra={"linked_notes": ["notas/kafka.md", "c:/external/broker.conf"]}
        )

        lista = ProyectoLista(self.proj_mgr)
        lista.load(proj)

        # Buscar el nodo generado
        found_text = None
        for item_dict in [lista.tree.topLevelItem(i) for i in range(lista.tree.topLevelItemCount())]:
            text = item_dict.text(0)
            if "Configurar Kafka" in text:
                found_text = text
                break

        self.assertIsNotNone(found_text)
        self.assertIn("[🔗 2]", found_text)


if __name__ == "__main__":
    unittest.main()

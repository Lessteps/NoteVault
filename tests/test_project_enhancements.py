"""
Tests for Proyectos Enhancements:
- Submeta & Task creation and hierarchy
- Subtasks in Kanban board (omitted from root, attached to parent)
- Updated timestamps on create/update/move
- ProyectoNotas file system & notes management
"""

import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

from PySide6.QtWidgets import QApplication

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

APP = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

from notevault_app.core.project_manager import (
    ProjectManager, T_GOAL, T_TASK, T_SUBTASK,
)
from notevault_app.ui.components.proyectos.proyecto_tablero import ProyectoTablero


class TestProjectEnhancements(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_enh_test"))
        self.pm = ProjectManager(self.vault)
        self.project = self.pm.create("Sistema Web")

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_create_submeta_and_tasks(self):
        # 1. Create a Submeta (T_GOAL)
        submeta = self.pm.create_issue(self.project.id, "Fase 1: Autenticacion", type=T_GOAL)
        self.assertEqual(submeta.type, T_GOAL)
        self.assertTrue(submeta.key.startswith("SW-"))
        self.assertIsNotNone(submeta.updated)

        # 2. Create tasks under the submeta
        task1 = self.pm.create_issue(self.project.id, "Login con OAuth", parent=submeta.id, type=T_TASK)
        task2 = self.pm.create_issue(self.project.id, "Registro de usuarios", parent=submeta.id, type=T_TASK)
        self.assertEqual(task1.parent, submeta.id)
        self.assertEqual(task2.parent, submeta.id)

        # 3. Create subtasks under task1
        subtask1 = self.pm.create_issue(self.project.id, "Validar JWT", parent=task1.id, type=T_SUBTASK)
        self.assertEqual(subtask1.type, T_SUBTASK)
        self.assertEqual(subtask1.parent, task1.id)

        # Refresh from disk
        fresh_pm = ProjectManager(self.vault)
        fresh_issues = fresh_pm.issues(self.project.id)
        by_id = {i.id: i for i in fresh_issues}

        fresh_submeta = by_id[submeta.id]
        self.assertEqual(len(fresh_submeta.children), 2)
        fresh_task1 = by_id[task1.id]
        self.assertEqual(len(fresh_task1.children), 1)
        self.assertEqual(fresh_task1.children[0].id, subtask1.id)

    def test_updated_timestamp_on_update_and_move(self):
        issue = self.pm.create_issue(self.project.id, "Tarea con timestamp")
        initial_updated = issue.updated
        self.assertIsNotNone(initial_updated)

        # Update title/priority
        updated_issue = self.pm.update_issue(self.project.id, issue.id, title="Nuevo titulo", priority=4)
        self.assertIsNotNone(updated_issue.updated)
        self.assertGreaterEqual(updated_issue.updated, initial_updated)

        # Move issue (set status)
        self.pm.set_issue_status(self.project.id, issue.id, "En curso")
        fresh = self.pm.get_issue(self.project.id, issue.id)
        self.assertEqual(fresh.status, "En curso")
        self.assertIsNotNone(fresh.updated)

    def test_kanban_subtasks_in_parent_card(self):
        # Goal -> Task -> Subtask
        goal = self.pm.create_issue(self.project.id, "Meta Core", type=T_GOAL)
        task = self.pm.create_issue(self.project.id, "Tarea Principal", parent=goal.id, type=T_TASK)
        sub1 = self.pm.create_issue(self.project.id, "Subtarea A", parent=task.id, type=T_SUBTASK)
        sub2 = self.pm.create_issue(self.project.id, "Subtarea B", parent=task.id, type=T_SUBTASK)

        # Standalone task without goal
        standalone = self.pm.create_issue(self.project.id, "Tarea Suelta", type=T_TASK)

        # Instantiate ProyectoTablero and check visible_issues
        tablero = ProyectoTablero(self.pm)
        tablero.load(self.project)
        visible = tablero.visible_issues()

        visible_ids = [i[0].id for i in visible]
        # Subtasks must NOT be top-level cards
        self.assertNotIn(sub1.id, visible_ids)
        self.assertNotIn(sub2.id, visible_ids)
        # Main task and standalone task must be present
        self.assertIn(task.id, visible_ids)
        self.assertIn(standalone.id, visible_ids)

        # Verify that task has subtasks attached in card data
        task_item = next(i for i in visible if i[0].id == task.id)[0]
        self.assertEqual(len(task_item.children), 2)
        sub_titles = [c.title for c in task_item.children]
        self.assertIn("Subtarea A", sub_titles)
        self.assertIn("Subtarea B", sub_titles)

    def test_proyecto_notas_directory_structure(self):
        # Test directory structure for project notes
        proj_file = self.pm.project_path(self.project.id)
        notes_dir = Path(proj_file).parent / "notas"
        notes_dir.mkdir(parents=True, exist_ok=True)

        # Create nested folders and notes
        docs_subfolder = notes_dir / "Arquitectura"
        docs_subfolder.mkdir(parents=True, exist_ok=True)

        note1 = notes_dir / "General.md"
        note1.write_text("# Documentacion General\nDetalles del proyecto.", encoding="utf-8")

        note2 = docs_subfolder / "BaseDeDatos.md"
        note2.write_text("# Esquema BD\nTablas y relaciones.", encoding="utf-8")

        self.assertTrue(note1.exists())
        self.assertTrue(note2.exists())
        self.assertEqual(len(list(notes_dir.rglob("*.md"))), 2)

    def test_proyecto_notas_widget_load_and_save(self):
        from notevault_app.ui.components.proyectos.proyecto_notas import ProyectoNotas
        notas = ProyectoNotas(self.pm)
        self.project.description = "# Proyecto Demo\nContenido de prueba."
        notas.load_project(self.project)

        # Should have created General.md with description
        self.assertIsNotNone(notas.current_file)
        self.assertTrue(notas.current_file.exists())
        self.assertIn("Contenido de prueba", notas.editor.toPlainText())

        # Modify content and save
        notas.editor.setPlainText("# Documentacion Actualizada\nNueva linea.")
        notas._save_current_file()

        fresh_content = notas.current_file.read_text(encoding="utf-8")
        self.assertIn("Documentacion Actualizada", fresh_content)


if __name__ == "__main__":
    unittest.main()

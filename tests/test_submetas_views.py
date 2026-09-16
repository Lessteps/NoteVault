"""Pruebas unitarias para las vistas de submetas, categorías temáticas, adherencia y widgets."""

import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PySide6.QtWidgets import QApplication

from notevault_app.core.area_manager import AreaManager
from notevault_app.core.goal_manager import GoalManager, GoalItem
from notevault_app.core.habit_manager import HabitManager
from notevault_app.ui.components.metas.submetas_board import SubmetasBoard
from notevault_app.ui.components.metas.submeta_detail import SubmetaDetail

APP = QApplication.instance() or QApplication(sys.argv)
FIXED_DAY = date(2026, 9, 14)


class TestSubmetasCoreAndViews(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="nv_submetas_test")
        self.vault = Path(self.temp_dir)
        self.area_mgr = AreaManager(self.vault)
        self.habit_mgr = HabitManager(self.vault)
        self.goal_mgr = GoalManager(self.vault, habit_mgr=self.habit_mgr, area_mgr=self.area_mgr)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_submeta_category_and_priority_persistence(self):
        goal = self.goal_mgr.create_goal("Aprender Python", area="programacion")
        item1 = self.goal_mgr.create_item(
            goal.id, "Tipos primitivos y variables",
            category="Teoría", is_priority=True, priority=3
        )
        self.assertEqual(item1.category, "Teoría")
        self.assertTrue(item1.is_priority)

        # Recargar desde disco
        fresh_mgr = GoalManager(self.vault)
        loaded_item = fresh_mgr.get_item(goal.id, item1.id)
        self.assertIsNotNone(loaded_item)
        self.assertEqual(loaded_item.category, "Teoría")
        self.assertTrue(loaded_item.is_priority)

        # Crear otro item con categoría "Práctica"
        item2 = self.goal_mgr.create_item(
            goal.id, "Ejercicios de condicionales",
            category="Práctica", is_priority=False, priority=1
        )
        self.assertEqual(item2.category, "Práctica")
        self.assertFalse(item2.is_priority)

        # Verificar categories() en goal
        cats = self.goal_mgr.categories(goal.id)
        self.assertEqual(cats, ["Práctica", "Teoría"])

    def test_submeta_counts_progress_and_adherence(self):
        goal = self.goal_mgr.create_goal("Dominar Algoritmos")
        parent_item = self.goal_mgr.create_item(
            goal.id, "Recursión y Divide & Conquer",
            category="Teoría", is_priority=True
        )

        # Crear hijas (subtareas / temas prácticos)
        child1 = self.goal_mgr.create_item(goal.id, "Leer capítulo de recursión", parent=parent_item.id)
        child2 = self.goal_mgr.create_item(goal.id, "Resolver 5 ejercicios", parent=parent_item.id)

        # Progreso inicial: 0/2
        done, total = self.goal_mgr.item_counts(parent_item, goal, FIXED_DAY)
        self.assertEqual(total, 2)
        self.assertEqual(done, 0)
        self.assertEqual(self.goal_mgr.item_progress(parent_item, goal, FIXED_DAY), 0.0)

        # Completar child1
        self.goal_mgr.set_done(child1, FIXED_DAY, True)
        done, total = self.goal_mgr.item_counts(parent_item, goal, FIXED_DAY)
        self.assertEqual(done, 1)
        self.assertEqual(total, 2)
        self.assertEqual(self.goal_mgr.item_progress(parent_item, goal, FIXED_DAY), 0.5)

    def test_submetas_board_widget(self):
        goal = self.goal_mgr.create_goal("Backend con FastAPI")
        self.goal_mgr.create_item(goal.id, "Instalación y Config", category="Teoría", priority=3)
        self.goal_mgr.create_item(goal.id, "Crear Endpoints CRUD", category="Práctica", priority=4)
        self.goal_mgr.create_item(goal.id, "Deploy con Docker", category="Proyectos", priority=2)

        board = SubmetasBoard(self.goal_mgr, self.habit_mgr)
        board.set_goal(goal)

        # Verificar chips de categorías renderizados
        self.assertIn("3 submetas", board.lbl_count.text())

        # Filtrar por "Práctica"
        board._select_category("Práctica")
        self.assertEqual(board.active_category, "Práctica")
        self.assertIn("1 submeta", board.lbl_count.text())

        # Volver a "Todas"
        board._select_category("*")
        self.assertIn("3 submetas", board.lbl_count.text())

    def test_submeta_detail_widget(self):
        goal = self.goal_mgr.create_goal("Fullstack")
        item = self.goal_mgr.create_item(
            goal.id, "Diseño de Base de Datos",
            category="Teoría", is_priority=True
        )

        detail = SubmetaDetail(self.goal_mgr, self.habit_mgr)
        detail.load(goal, item)

        self.assertEqual(detail.name.text(), "Diseño de Base de Datos")
        self.assertEqual(detail.t_progress.value.text(), "0 %")

        # Añadir subtarea mediante el widget interactivo
        detail._add_subtask("Crear diagrama ER")
        fresh_item = self.goal_mgr.get_item(goal.id, item.id)
        self.assertEqual(len(fresh_item.children), 1)
        self.assertEqual(fresh_item.children[0].name, "Crear diagrama ER")

        # Marcar la subtarea
        detail._toggle_subtask(fresh_item.children[0].id, True)
        self.assertEqual(detail.t_progress.value.text(), "100 %")


if __name__ == "__main__":
    unittest.main()

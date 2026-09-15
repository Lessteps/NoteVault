"""Core tests for Proyectos tipo Jira (Fase 2)."""

import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from notevault_app.core import vault_format as fmt, reminder_scheduler as sched   # noqa: E402
from notevault_app.core.project_manager import (                                   # noqa: E402
    ProjectManager, ProjectStats, ProjectCalendarSource, migrate_projects, derive_key,
)
from notevault_app.core.schedule_manager import ScheduleManager                     # noqa: E402

D = date(2026, 9, 14)


class Case(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvproj"))
        self.pm = ProjectManager(self.vault)
        self.p = self.pm.create("Portafolio web", deadline=D + timedelta(days=30))

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)


class TestIssues(Case):
    def test_numbers_keys_and_kanban_moves(self):
        a = self.pm.create_issue(self.p.id, "A")
        b = self.pm.create_issue(self.p.id, "B")
        c = self.pm.create_issue(self.p.id, "C")
        self.assertEqual([a.key, b.key, c.key], ["PW-1", "PW-2", "PW-3"])
        self.pm.move(self.p.id, c.id, "Por hacer", 0)
        col = sorted([i for i in self.pm.issues(self.p.id) if i.status == "Por hacer"],
                     key=lambda i: i.order)
        self.assertEqual([i.title for i in col], ["C", "A", "B"])
        self.pm.move(self.p.id, a.id, "Hecho", 0)
        fresh = ProjectManager(self.vault).get_issue(self.p.id, a.id)
        self.assertTrue(fresh.is_done)
        self.assertIsNotNone(fresh.done_at)
        self.pm.move(self.p.id, a.id, "En curso", 0)
        self.assertIsNone(ProjectManager(self.vault).get_issue(self.p.id, a.id).done_at)

    def test_repeating_issue_rolls_forward(self):
        r = self.pm.create_issue(self.p.id, "Revisión", repeat="weekly:0", due=D,
                                 reminder=datetime(2026, 9, 14, 9, 0), reminder_done=True)
        self.pm.move(self.p.id, r.id, "Hecho", 0)
        fresh = ProjectManager(self.vault).get_issue(self.p.id, r.id)
        self.assertEqual(fresh.due, D + timedelta(days=7))
        self.assertEqual(fresh.status, "Por hacer")
        self.assertEqual(fresh.reminder, datetime(2026, 9, 21, 9, 0))
        self.assertFalse(fresh.reminder_done)

    def test_set_columns_renames_and_moves_orphans(self):
        a = self.pm.create_issue(self.p.id, "A", status="En revisión")
        b = self.pm.create_issue(self.p.id, "B", status="Hecho")
        self.pm.set_columns(self.p.id, ["Pendiente", "Haciendo", "Terminado"],
                            renames={"Hecho": "Terminado", "Por hacer": "Pendiente"})
        fresh = ProjectManager(self.vault)
        self.assertEqual(fresh.get(self.p.id).done_column, "Terminado")
        self.assertEqual(fresh.get_issue(self.p.id, a.id).status, "Pendiente")
        self.assertTrue(fresh.get_issue(self.p.id, b.id).is_done)

    def test_tree_reparent_refuses_cycles_and_delete_cascades(self):
        goal = self.pm.create_issue(self.p.id, "Submeta", type="Submeta")
        t = self.pm.create_issue(self.p.id, "T", parent=goal.id)
        s = self.pm.create_issue(self.p.id, "S", parent=t.id, type="Subtarea")
        self.pm.reparent(self.p.id, goal.id, s.id)
        self.assertEqual(self.pm.get_issue(self.p.id, goal.id).parent, "")
        self.assertEqual([i.title for i in self.pm.tree(self.p.id)], ["Submeta"])
        self.pm.delete_issue(self.p.id, goal.id)
        self.assertEqual(self.pm.issues(self.p.id), [])
        trash = self.vault / fmt.LAYOUT["trash_dir"] / "proyectos" / self.p.id
        self.assertEqual(len(list(trash.glob("*.md"))), 3)

    def test_duplicate_numbers_are_fixed(self):
        a = self.pm.create_issue(self.p.id, "A")
        b = self.pm.create_issue(self.p.id, "B")
        b.number = a.number
        self.pm.save_issue(b)
        self.assertEqual(self.pm.fix_duplicate_numbers(self.p.id), 1)
        numbers = sorted(i.number for i in self.pm.issues(self.p.id))
        self.assertEqual(numbers, [1, 2])

    def test_issue_reminders_use_the_shared_rules(self):
        now = datetime(2026, 9, 14, 10, 0)
        i = self.pm.create_issue(self.p.id, "Aviso", reminder=now - timedelta(minutes=3))
        due = sched.due_now(self.pm.all_issues(), now)
        self.assertEqual([r.key for r in due], [f"issue:{i.id}"])
        self.pm.move(self.p.id, i.id, "Hecho", 0)
        self.assertEqual(sched.due_now(self.pm.all_issues(), now), [])


class TestStats(Case):
    def test_submeta_stats_burndown_and_throughput(self):
        goal = self.pm.create_issue(self.p.id, "Lanzar", type="Submeta", created=D - timedelta(days=6))
        a = self.pm.create_issue(self.p.id, "A", parent=goal.id, created=D - timedelta(days=6),
                                 estimate_min=60, due=D - timedelta(days=1))
        b = self.pm.create_issue(self.p.id, "B", parent=goal.id, created=D - timedelta(days=3),
                                 estimate_min=30)
        self.pm.create_issue(self.p.id, "Suelta", created=D)
        self.pm.move(self.p.id, b.id, "Hecho", 0)
        self.pm.update_issue(self.p.id, b.id, done_at=D - timedelta(days=1))
        self.pm.update(self.p.id, start=D - timedelta(days=6))
        stats = ProjectStats(self.pm, self.pm.get(self.p.id), D)
        s = stats.summary()
        self.assertEqual((s["total"], s["done"], s["overdue"]), (3, 1, 1))
        (g, gs), = stats.submetas()
        self.assertEqual((g.id, gs["total"], gs["done"], gs["estimate_min"]), (goal.id, 2, 1, 90))
        days, remaining, ideal = stats.burndown()
        known = dict(zip(days, remaining))
        self.assertEqual(known[D - timedelta(days=6)], 1)
        self.assertEqual(known[D - timedelta(days=3)], 2)
        self.assertEqual(known[D - timedelta(days=1)], 1)
        self.assertEqual(known[D], 2)
        self.assertEqual(stats.throughput(2)[-1][1] + stats.throughput(2)[0][1], 1)


class TestCalendarAndMigration(Case):
    def test_calendar_source(self):
        i = self.pm.create_issue(self.p.id, "Entrega", due=D, due_time="10:00", in_calendar=True,
                                 estimate_min=90)
        self.pm.create_issue(self.p.id, "Oculto", due=D)
        sm = ScheduleManager(self.vault)
        sm.register_source("proyectos", ProjectCalendarSource(self.pm))
        occ = [o for o in sm.day(D) if o.kind == "issue"]
        self.assertEqual([(o.title, o.start, o.duration_min) for o in occ], [("PW-1 Entrega", "10:00", 90)])
        sm.set_done(D, occ[0].id, True)
        self.assertTrue(ProjectManager(self.vault).get_issue(self.p.id, i.id).is_done)

    def test_migration_never_overwrites_and_keeps_old_file_if_target_exists(self):
        folder = self.vault / fmt.LAYOUT["projects_dir"]
        old = folder / "p20260101-bbbbbb.md"
        old.write_text("---\nid: p20260101-bbbbbb\nname: \"X\"\n---\n\n## Tareas\n- [ ] a\n",
                       encoding="utf-8")
        (folder / "p20260101-bbbbbb").mkdir()
        self.assertEqual(migrate_projects(self.vault), [])
        self.assertTrue(old.exists())

    def test_migration_converts_steps(self):
        folder = self.vault / fmt.LAYOUT["projects_dir"]
        (folder / "p20260101-cccccc.md").write_text(
            "---\nid: p20260101-cccccc\nname: \"Viejo\"\nstatus: Pausado\ncolor: \"#f2555a\"\n---\n\n"
            "Desc\n\n## Tareas\n- [x] uno | 2026-01-02\n- [ ] dos\n", encoding="utf-8")
        pm = ProjectManager(self.vault)
        p = pm.get("p20260101-cccccc")
        self.assertEqual((p.name, p.status, p.colour, p.description), ("Viejo", "Pausado", "#f2555a", "Desc"))
        self.assertEqual([(i.title, i.is_done) for i in sorted(pm.issues(p.id), key=lambda i: i.number)],
                         [("uno", True), ("dos", False)])

    def test_derive_key(self):
        self.assertEqual(derive_key("Portafolio web", ["PW"]), "PW2")


if __name__ == "__main__":
    unittest.main()

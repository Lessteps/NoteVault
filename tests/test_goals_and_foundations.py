"""Core tests for the shared foundations (Fase 0) and the Metas module (Fase 1)."""

import json
import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from notevault_app.core import store, vault_format as fmt              # noqa: E402
from notevault_app.core.area_manager import AreaManager                # noqa: E402
from notevault_app.core import module_attachments as ma                # noqa: E402
from notevault_app.core.habit_manager import HabitManager              # noqa: E402
from notevault_app.core.goal_manager import (                          # noqa: E402
    GoalManager, GoalCalendarSource, ITEM_DONE, FILTER_OVERDUE, FILTER_ACTIVE,
)
from notevault_app.core.schedule_manager import ScheduleManager        # noqa: E402

D = date(2026, 9, 14)   # a Monday


class Case(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvgoal"))

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)


class TestStore(Case):
    FIELDS = (("id", "id"), ("name", "str"), ("n", "int"), ("x", "num"), ("flag", "bool"),
              ("day", "date"), ("tags", "list"))

    def test_round_trip_with_escapes_and_unknown_keys(self):
        text = store.dump_doc(self.FIELDS, {"id": "a1", "name": 'Dice "hola" \\ fin', "n": 3,
                                            "x": 2.5, "flag": True, "day": D,
                                            "tags": ["uno", "dos"]},
                              {"futuro": "valor: raro"}, "Cuerpo\n\nlínea")
        self.assertEqual(text,
                         '---\nid: a1\nname: "Dice \\"hola\\" \\\\ fin"\nn: 3\nx: 2.5\nflag: true\n'
                         'day: 2026-09-14\ntags: "uno,dos"\nfuturo: "valor: raro"\n---\n\n'
                         'Cuerpo\n\nlínea\n')
        values, extra, body = store.parse_doc(text, self.FIELDS)
        self.assertEqual(values["name"], 'Dice "hola" \\ fin')
        self.assertEqual(values["tags"], ["uno", "dos"])
        self.assertEqual(extra, {"futuro": "valor: raro"})
        self.assertEqual(body, "Cuerpo\n\nlínea")

    def test_empty_values_are_not_written(self):
        text = store.dump_doc(self.FIELDS, {"id": "a", "name": "", "flag": False, "x": 3.0})
        self.assertEqual(text, "---\nid: a\nx: 3\n---\n")

    def test_trash_never_overwrites(self):
        f = self.vault / "a.txt"
        f.write_text("1", encoding="utf-8")
        store.to_trash(self.vault, f, "t")
        f.write_text("2", encoding="utf-8")
        store.to_trash(self.vault, f, "t")
        names = sorted(p.name for p in (self.vault / fmt.LAYOUT["trash_dir"] / "t").iterdir())
        self.assertEqual(names, ["a 1.txt", "a.txt"])


class TestAreas(Case):
    def test_one_file_per_area_and_bytes(self):
        am = AreaManager(self.vault)
        a = am.create("Programación", "💻", "#3f51b5")
        self.assertEqual(a["id"], "programacion")
        path = self.vault / fmt.LAYOUT["area"].format(id="programacion")
        self.assertEqual(path.read_text(encoding="utf-8"),
                         '{\n  "id": "programacion",\n  "name": "Programación",\n  "icon": "💻",\n'
                         '  "colour": "#3f51b5",\n  "order": 1,\n  "archived": false\n}\n')
        am.create("Programación")
        self.assertEqual([x["id"] for x in am.areas()], ["programacion", "programacion-2"])

    def test_archive_hides_but_keeps(self):
        am = AreaManager(self.vault)
        am.create("Salud")
        am.archive("salud")
        self.assertEqual(am.areas(), [])
        self.assertEqual(am.name_of("salud"), "Sin área")
        self.assertTrue(am.get("salud")["archived"])


class TestModuleAttachments(Case):
    def test_store_resolve_never_overwrite(self):
        src = self.vault / "factura.PNG"
        src.write_bytes(b"x")
        r1 = ma.store_file(self.vault, "finanzas", "mv1", src, D)
        r2 = ma.store_file(self.vault, "finanzas", "mv1", src, D)
        self.assertEqual(r1, "finanzas/adjuntos/2026/09/mv1-1.png")
        self.assertEqual(r2, "finanzas/adjuntos/2026/09/mv1-2.png")
        self.assertTrue(ma.resolve(self.vault, r1).exists())
        self.assertIsNone(ma.resolve(self.vault, "finanzas/adjuntos/no.png"))
        self.assertIsNone(ma.resolve(self.vault, "../fuera.png"))
        with self.assertRaises(ValueError):
            bad = self.vault / "x.exe"
            bad.write_bytes(b"")
            ma.store_file(self.vault, "finanzas", "mv1", bad, D)


class _Provider:
    prefix = "demo:"

    def __init__(self):
        self.done = []

    def occurrences(self, first, last):
        from notevault_app.core.schedule_manager import Occurrence
        return {first: [Occurrence("demo:1", "Demo", "goal_item", first, "08:00", 30, "#fff")]}

    def set_done(self, d, occ_id, done):
        self.done.append((d, occ_id, done))


class TestScheduleSources(Case):
    def test_register_source_merges_and_dispatches(self):
        sm = ScheduleManager(self.vault)
        prov = _Provider()
        sm.register_source("demo", prov)
        self.assertIn("demo:1", [o.id for o in sm.day(D)])
        self.assertIn("demo:1", [o.id for o in sm.range(D, D + timedelta(days=2))[D]])
        sm.set_done(D, "demo:1", True)
        self.assertEqual(prov.done, [(D, "demo:1", True)])


class GoalCase(Case):
    def setUp(self):
        super().setUp()
        self.hm = HabitManager(self.vault)
        self.am = AreaManager(self.vault)
        self.gm = GoalManager(self.vault, self.hm, self.am)
        self.goal = self.gm.create_goal("Ser backend", area="programacion", priority=3,
                                        start=D, end=D + timedelta(days=30))


class TestGoalFormat(GoalCase):
    def test_goal_file(self):
        text = self.gm.goal_path(self.goal.id).read_text(encoding="utf-8")
        today = date.today().isoformat()
        self.assertEqual(text, f'---\nid: {self.goal.id}\nname: "Ser backend"\narea: programacion\n'
                               f'status: "Activa"\npriority: 3\nstart: 2026-09-14\nend: 2026-10-14\n'
                               f'colour: "#3f51b5"\nin_overview: true\ncreated: {today}\n---\n')

    def test_item_file_and_reload(self):
        item = self.gm.create_item(self.goal.id, "Programar 3 horas", repeat="weekly:0,2",
                                   due_time="18:00", duration_min=180, in_calendar=True,
                                   reminder_min=15, target=3, unit="h",
                                   habit_links="coding,math", start=D, notes="Notas")
        fresh = GoalManager(self.vault).get_item(self.goal.id, item.id)
        self.assertEqual(fresh.repeat, "weekly:0,2")
        self.assertEqual(fresh.habit_links, ["coding", "math"])
        self.assertEqual(fresh.target, 3)
        self.assertEqual(fresh.notes, "Notas")
        text = self.gm.item_path(self.goal.id, item.id).read_text(encoding="utf-8")
        self.assertIn('repeat: "weekly:0,2"\n', text)
        self.assertIn('habit_links: "coding,math"\n', text)
        self.assertNotIn("parent:", text)


class TestGoalTree(GoalCase):
    def test_three_levels_move_and_indent(self):
        g = self.goal.id
        a = self.gm.create_item(g, "A")
        b = self.gm.create_item(g, "B")
        c = self.gm.create_item(g, "C")
        a1 = self.gm.create_item(g, "A1", parent=a.id)
        a1x = self.gm.create_item(g, "A1x", parent=a1.id)
        self.assertEqual([i.name for i in self.gm.tree(g)], ["A", "B", "C"])
        self.gm.move_item(g, c.id, None, 0)
        self.assertEqual([i.name for i in self.gm.tree(g)], ["C", "A", "B"])
        self.gm.indent(g, b.id, +1)            # B goes under A, after A1
        fresh = GoalManager(self.vault)
        a_node = next(i for i in fresh.tree(g) if i.name == "A")
        self.assertEqual([i.name for i in a_node.children], ["A1", "B"])
        self.gm.indent(g, b.id, -1)
        self.assertEqual([i.name for i in self.gm.tree(g)], ["C", "A", "B"])
        self.gm.move_item(g, a.id, a1x.id, 0)   # into its own subtree: refused
        self.assertEqual(self.gm.get_item(g, a.id).parent, "")
        self.gm.move_item(g, b.id, None, 1)    # midpoint order between C and A
        self.assertEqual([i.name for i in GoalManager(self.vault).tree(g)], ["C", "B", "A"])

    def test_delete_cascades_to_trash(self):
        g = self.goal.id
        a = self.gm.create_item(g, "A")
        self.gm.create_item(g, "A1", parent=a.id)
        self.gm.delete_item(g, a.id)
        self.assertEqual(self.gm.items(g), [])
        trash = self.vault / fmt.LAYOUT["trash_dir"] / "metas" / g
        self.assertEqual(len(list(trash.glob("*.md"))), 2)


class TestGoalProgress(GoalCase):
    def test_progress_mixes_once_and_repeating(self):
        g = self.goal
        once = self.gm.create_item(g.id, "Única")
        rep = self.gm.create_item(g.id, "Diaria", repeat="daily", start=D)
        branch = self.gm.create_item(g.id, "Rama")
        self.gm.create_item(g.id, "Hija 1", parent=branch.id)
        h2 = self.gm.create_item(g.id, "Hija 2", parent=branch.id)
        today = D + timedelta(days=3)          # 4 scheduled days
        self.gm.set_done(g.id, once.id, D, True)
        self.gm.set_done(g.id, rep.id, D, True)
        self.gm.set_done(g.id, rep.id, D + timedelta(days=1), True)
        self.gm.set_done(g.id, h2.id, D, True)
        # (1 + 2/4 + (0 + 1)/2) / 3
        self.assertAlmostEqual(self.gm.progress(g, today), (1 + 0.5 + 0.5) / 3)
        self.assertEqual(self.gm.streak(rep, g, D + timedelta(days=1)), 2)
        self.assertEqual(self.gm.streak(rep, g, today), 0)
        self.assertAlmostEqual(self.gm.adherence(g, 7, today), 0.5)

    def test_measurable_and_overdue(self):
        g = self.goal
        m = self.gm.create_item(g.id, "3 h", repeat="daily", start=D, target=3, unit="h")
        self.gm.set_done(g.id, m.id, D, False, value=2)
        self.assertFalse(self.gm.is_done_on(self.gm.get_item(g.id, m.id), D))
        self.gm.set_done(g.id, m.id, D, False, value=3.5)
        self.assertTrue(self.gm.is_done_on(self.gm.get_item(g.id, m.id), D))
        late = self.gm.create_item(g.id, "Tarde", due=D - timedelta(days=1))
        self.assertEqual([i.id for i in self.gm.overdue(g, D)], [late.id])
        due = [(x.id, i.id) for x, i in self.gm.items_due_on(D, [g])]
        self.assertIn((g.id, m.id), due)

    def test_end_date_marks_overdue_without_deleting(self):
        self.assertFalse(self.goal.is_overdue(D))
        later = D + timedelta(days=40)
        self.assertTrue(self.goal.is_overdue(later))
        self.assertEqual([x.id for x in self.gm.goals(FILTER_OVERDUE, today=later)], [self.goal.id])
        self.assertTrue(self.gm.goal_path(self.goal.id).exists())


class TestHabitSync(GoalCase):
    def test_marks_unmarks_and_respects_manual(self):
        g = self.goal
        item = self.gm.create_item(g.id, "Programar", repeat="daily", start=D,
                                   habit_links=["coding", "math"])
        day = self.hm.get_day(D)
        day.completed["math"] = True          # ticked by hand first
        self.hm.save_day(day)

        self.gm.set_done(g.id, item.id, D, True)
        fresh = HabitManager(self.vault).get_day(D)
        self.assertTrue(fresh.completed["coding"])
        self.assertTrue(fresh.completed["math"])
        log = json.loads(self.gm.log_path(D).read_text(encoding="utf-8"))
        self.assertEqual(log["habit_marks"], {"coding": [item.key]})

        self.gm.set_done(g.id, item.id, D, False)
        fresh = HabitManager(self.vault).get_day(D)
        self.assertFalse(fresh.completed["coding"])
        self.assertTrue(fresh.completed["math"], "la marca manual se conserva")

    def test_two_sources_keep_the_mark_until_both_untick(self):
        g = self.goal
        a = self.gm.create_item(g.id, "A", repeat="daily", start=D, habit_links=["coding"])
        b = self.gm.create_item(g.id, "B", due=D, habit_links=["coding"])
        self.gm.set_done(g.id, a.id, D, True)
        self.gm.set_done(g.id, b.id, D, True)
        self.gm.set_done(g.id, a.id, D, False)
        self.assertTrue(HabitManager(self.vault).get_day(D).completed["coding"])
        self.gm.set_done(g.id, b.id, D, False)
        self.assertFalse(HabitManager(self.vault).get_day(D).completed["coding"])
        self.assertFalse(self.gm.log_path(D).exists(), "un registro vacío no deja archivo")


class TestGoalCalendar(GoalCase):
    def test_in_calendar_items_become_occurrences(self):
        g = self.goal
        item = self.gm.create_item(g.id, "Leer", repeat="weekly:0", start=D, due_time="07:30",
                                   duration_min=45, reminder_min=10, in_calendar=True)
        self.gm.create_item(g.id, "Oculta", repeat="daily", start=D)
        sm = ScheduleManager(self.vault, habit_mgr=self.hm)
        sm.register_source("metas", GoalCalendarSource(self.gm))
        week = sm.range(D, D + timedelta(days=7))
        ids = [(d, o.id) for d, occs in week.items() for o in occs if o.kind == "goal_item"]
        key = f"goal:{g.id}/{item.id}"
        self.assertEqual(ids, [(D, key), (D + timedelta(days=7), key)])
        sm.set_done(D, key, True)
        self.assertTrue(self.gm.is_done_on(self.gm.get_item(g.id, item.id), D))


class TestPerEntityFiles(GoalCase):
    def test_new_modules_never_write_global_files(self):
        self.am.create("Salud")
        item = self.gm.create_item(self.goal.id, "X", repeat="daily", start=D)
        self.gm.set_done(self.goal.id, item.id, D, True)
        for path in (self.vault / fmt.DATA_DIR).rglob("*"):
            if not path.is_file() or "habits" in path.parts:
                continue
            rel = path.relative_to(self.vault).as_posix()
            per_entity = any(part in rel for part in ("/areas/", "/metas/g"))
            dated = any(ch.isdigit() for ch in path.stem) and "-" in path.stem
            self.assertTrue(per_entity or dated, rel)


if __name__ == "__main__":
    unittest.main()

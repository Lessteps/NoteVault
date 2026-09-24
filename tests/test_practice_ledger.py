"""Phase 6: Skill Ledger, recommender, concept cards, study areas and the Estudio sub-bar."""

import json
import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QPushButton

from notevault_app.core import vault_format
from notevault_app.core.notes_service import NotesService
from notevault_app.core.practice import ledger as lg
from notevault_app.core.practice import recommender as rc
from notevault_app.core.practice.attempts import attempt_key
from notevault_app.core.practice.cards import index_cards, load_card, parse_cards
from notevault_app.core.practice.exercise_index import scan_vault, skill_key
from notevault_app.core.practice.study_area import detect_study_area
from notevault_app.core.study_error_manager import StudyErrorManager
from notevault_app.core.study_srs_manager import StudySRSManager
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.workspace_manager import WorkspaceManager

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

REPO = Path(__file__).resolve().parents[1]
KB = REPO / "docs/knowledge_base/examples"
MATH_AREA = "Matemáticas/1 Lógica y demostración"
CONCEPT_DIR = f"{MATH_AREA}/1.10 Inducción matemática"
EX_DIR = f"{CONCEPT_DIR}/Ejercicios"
TODAY = date(2026, 9, 24)


def ev(days_ago: int, score: int, difficulty: int, mode: str = "implement", hints: int = 0,
       seen: bool = False) -> dict:
    at = datetime(2026, 9, 24, 12) - timedelta(days=days_ago)
    return {"at": at.isoformat(timespec="seconds"), "score": score,
            "verdict": "correct" if score >= 75 else "partial", "mode": mode,
            "hints_used": hints, "solution_seen": seen, "difficulty": difficulty}


def exercise_note(note_id: str, discipline: str, skill: str, mode: str, difficulty: int = 2,
                  subject: str = "programming", extra: str = "") -> str:
    return (f"---\nid: {note_id}\ntitle: {note_id}\nsubject: {subject}\ntype: exercise\n"
            f"discipline: {discipline}\nskill: \"{skill}\"\nmode: {mode}\n"
            f"difficulty: {difficulty}\n{extra}---\n\n# {note_id}\n\n## Enunciado\nHaz algo.\n")


def record_attempt(root: Path, note_id: str, score: int, days_ago: int = 0, mode: str = "",
                   hints: int = 0):
    path = root / vault_format.LAYOUT["study_attempt"].format(id=attempt_key(note_id))
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {
        "note_id": note_id, "note_path": "", "draft": "", "attempts": []}
    at = (datetime.now() - timedelta(days=days_ago)).isoformat(timespec="seconds")
    data["attempts"].append({"at": at, "score": score, "mode": mode, "hints_used": hints,
                             "solution_seen": False,
                             "verdict": "correct" if score >= 75 else "partial"})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


class LedgerReplayTest(unittest.TestCase):
    def test_no_attempts_is_not_started(self):
        self.assertEqual(lg.replay([], TODAY)["status"], lg.NOT_STARTED)

    def test_first_attempt_moves_to_practicing_even_when_failed(self):
        row = lg.replay([ev(3, 20, 2)], TODAY)
        self.assertEqual(row["status"], lg.PRACTICING)
        self.assertEqual(row["attempts"], 1)
        self.assertEqual(row["best"], 20)

    def test_advanced_judgment_mode_without_help_consolidates(self):
        row = lg.replay([ev(10, 60, 2), ev(3, 90, 4, "debug")], TODAY)
        self.assertEqual(row["status"], lg.CONSOLIDATED)
        self.assertTrue(row["judged"])
        self.assertEqual(row["due"], (TODAY - timedelta(days=3) + timedelta(days=7)).isoformat())
        self.assertFalse(row["is_due"])

    def test_advanced_implement_or_hints_do_not_consolidate(self):
        self.assertEqual(lg.replay([ev(3, 95, 5, "implement")], TODAY)["status"], lg.PRACTICING)
        self.assertEqual(lg.replay([ev(3, 95, 5, "debug", hints=1)], TODAY)["status"],
                         lg.PRACTICING)

    def test_three_difficulty_bands_consolidate(self):
        events = [ev(9, 80, 1), ev(6, 80, 3)]
        self.assertEqual(lg.replay(events, TODAY)["status"], lg.PRACTICING)
        row = lg.replay(events + [ev(2, 80, 4)], TODAY)
        self.assertEqual(row["status"], lg.CONSOLIDATED)
        self.assertEqual(row["bands"], ["beginner", "intermediate", "advanced"])

    def test_consolidated_skill_becomes_due_and_review_doubles_interval(self):
        row = lg.replay([ev(20, 90, 4, "refactor")], TODAY)
        self.assertTrue(row["is_due"])
        row = lg.replay([ev(20, 90, 4, "refactor"), ev(1, 85, 2)], TODAY)
        self.assertEqual(row["interval_days"], 14)
        self.assertFalse(row["is_due"])

    def test_failing_a_consolidated_skill_sends_it_back(self):
        row = lg.replay([ev(20, 90, 4, "debug"), ev(1, 10, 2)], TODAY)
        self.assertEqual(row["status"], lg.PRACTICING)
        self.assertEqual(row["lapses"], 1)
        self.assertEqual(row["due"], "")


class _VaultCase(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="nv_ledger_"))
        (self.root / ".notevault").mkdir()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write(self, rel: str, text: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def copy_math(self):
        shutil.copytree(KB / "Matemáticas", self.root / "Matemáticas")

    def scan(self):
        return scan_vault(self.root, VaultManager(self.root).note_paths())


class LedgerStoreTest(_VaultCase):
    def test_math_exercises_get_a_skill_from_their_mode(self):
        self.copy_math()
        refs = {e.note_id: e for e in self.scan().exercises}
        self.assertEqual(refs["mat.logica.induccion.e01"].skill, "01")      # prove
        self.assertEqual(refs["mat.logica.induccion.e04"].skill, "04")      # find_error
        self.assertEqual(refs["mat.logica.induccion.e01"].chapter, CONCEPT_DIR)
        self.assertEqual(skill_key("math_drill", "drill", "", "fractions"), "02")

    def test_ledger_is_built_from_attempts_and_persisted(self):
        self.write("P/a.md", exercise_note("py.a", "python", "06", "debug", 4))
        record_attempt(self.root, "py.a", 92, days_ago=12, mode="debug")
        ledgers = lg.refresh_ledgers(self.root, self.scan().exercises)
        row = lg.skill_status(ledgers, "python", "06")
        self.assertEqual(row["status"], lg.CONSOLIDATED)
        self.assertTrue(row["is_due"])
        self.assertEqual(row["exercises"], 1)
        self.assertEqual(lg.skill_status(ledgers, "python", "01")["status"], lg.NOT_STARTED)
        stored = lg.load_ledger(self.root, "python")
        self.assertEqual(stored["discipline"], "python")
        self.assertEqual(len(stored["skills"]), 15)
        self.assertTrue((self.root / ".notevault/estudio/ledger/python.json").exists())


class RecommenderTest(_VaultCase):
    def snapshot(self, area=None):
        return rc.hub_snapshot(self.root, VaultManager(self.root).note_paths(), area=area)

    def test_next_skill_points_to_an_existing_never_attempted_exercise(self):
        self.write("P/a.md", exercise_note("py.s01.e01", "python", "01", "implement"))
        recs = self.snapshot().recommendations
        nxt = [r for r in recs if r.kind == rc.NEXT_SKILL]
        self.assertEqual(nxt[0].exercise.note_id, "py.s01.e01")
        self.assertEqual(nxt[0].message, "")

    def test_no_exercise_for_the_next_skill_says_so(self):
        self.write("P/a.md", exercise_note("py.s06.e01", "python", "06", "debug"))
        snap = self.snapshot()
        gap = next(r for r in snap.recommendations if r.kind == rc.NEXT_SKILL)
        self.assertIsNone(gap.exercise)
        self.assertIn("No hay ejercicios de Python · 01", gap.message)
        self.assertIn(gap, snap.queue["gaps"])
        follow = [r for r in snap.recommendations if r.kind == rc.NEXT_SKILL and r.exercise]
        self.assertEqual(follow[0].exercise.note_id, "py.s06.e01")

    def test_repeated_anchor_recommends_a_find_error_exercise_of_that_concept(self):
        self.copy_math()
        manager = StudyErrorManager(self.root)
        for note in ("mat.logica.induccion.e01", "mat.logica.induccion.e02"):
            manager.record_error("logical", "mathematics", "math_general", "x",
                                 discipline="math_general", mode="prove",
                                 anchor="assumes the conclusion", note_id=note)
            record_attempt(self.root, note, 50, mode="prove")
        rec = next(r for r in self.snapshot().recommendations if r.kind == rc.REMEDIATION)
        self.assertEqual(rec.exercise.note_id, "mat.logica.induccion.e04")
        self.assertIn("2 veces", rec.reason)

    def test_repeated_anchor_without_debug_exercise_says_so(self):
        self.write("P/a.md", exercise_note("py.s02.e01", "python", "02", "implement"))
        manager = StudyErrorManager(self.root)
        for _ in range(2):
            manager.record_error("logical", "programming", "02", "x", discipline="python",
                                 skill="02", anchor="assumes a key exists", note_id="py.s02.e01")
        rec = next(r for r in self.snapshot().recommendations if r.kind == rc.REMEDIATION)
        self.assertIsNone(rec.exercise)
        self.assertIn("No hay ejercicios de depuración", rec.message)

    def test_integration_when_every_skill_of_the_chapter_is_practicing(self):
        self.write("C/a.md", exercise_note("py.s01", "python", "01", "implement"))
        self.write("C/b.md", exercise_note("py.s02", "python", "02", "implement"))
        record_attempt(self.root, "py.s01", 60)
        self.assertFalse([r for r in self.snapshot().recommendations
                          if r.kind == rc.INTEGRATION])
        record_attempt(self.root, "py.s02", 60)
        rec = next(r for r in self.snapshot().recommendations if r.kind == rc.INTEGRATION)
        self.assertIsNone(rec.exercise)
        self.assertIn("No hay ejercicios de integración de «C»", rec.message)
        self.write("C/i.md", exercise_note("py.int", "python", "01", "implement",
                                           extra="integration: true\n"))
        rec = next(r for r in self.snapshot().recommendations if r.kind == rc.INTEGRATION)
        self.assertEqual(rec.exercise.note_id, "py.int")

    def test_due_consolidated_skill_asks_for_a_fresh_exercise(self):
        self.write("P/a.md", exercise_note("py.s06.e01", "python", "06", "debug", 4))
        self.write("P/b.md", exercise_note("py.s06.e02", "python", "06", "debug", 3))
        record_attempt(self.root, "py.s06.e01", 95, days_ago=12, mode="debug")
        rec = next(r for r in self.snapshot().recommendations if r.kind == rc.REVIEW)
        self.assertEqual(rec.exercise.note_id, "py.s06.e02")

    def test_pick_prefers_never_attempted_then_srs_due(self):
        self.write("P/a.md", exercise_note("e1", "python", "01", "implement", 1))
        self.write("P/b.md", exercise_note("e2", "python", "01", "implement", 2))
        refs = self.scan().exercises
        self.assertEqual(rc.pick_exercise(refs, {"e1"}, {}).note_id, "e2")
        self.assertEqual(rc.pick_exercise(refs, {"e1", "e2"}, {"e1": "2026-09-01"}).note_id,
                         "e1")
        self.assertIsNone(rc.pick_exercise(refs, {"e1", "e2"}, {}))

    def test_daily_queue_interleaves_skills(self):
        for skill in ("01", "02"):
            for n in (1, 2):
                self.write(f"P/{skill}{n}.md", exercise_note(f"e{skill}{n}", "python", skill,
                                                             "implement"))
        srs = StudySRSManager(self.root)
        for note_id in ("e011", "e012", "e021", "e022"):
            srs.register_item(note_id, "exercise", "programming")
        items = self.snapshot().queue["items"]
        skills = [i.exercise.skill for i in items if i.exercise]
        self.assertEqual(len(skills), 4)
        self.assertNotEqual(skills[0], skills[1])


class CardsTest(_VaultCase):
    def test_reference_concept_cards_parse(self):
        text = (KB / f"{CONCEPT_DIR}/1.10 Inducción matemática.md").read_text(encoding="utf-8")
        cards = parse_cards(text)
        self.assertEqual(len(cards), 10)
        self.assertEqual((cards[0].number, cards[0].kind), (1, "definicion"))
        self.assertTrue(cards[0].question.startswith("Enuncia el principio"))
        self.assertTrue(cards[0].answer.startswith("Si $P(n_0)$"))

    def test_parser_is_tolerant(self):
        text = ("# X\n\n## Cards\n### Pregunta suelta\nQ: What is 2+2?\nA: 4\n\n"
                "### T7 - hecho\n- **P**: ¿Capital de Francia?\n- **R**: París,\nsin duda.\n"
                "### T8 · vacía\nsin marcas\n\n## Otra sección\n### T9\n**P:** no cuenta\n")
        cards = parse_cards(text)
        self.assertEqual([c.number for c in cards], [1, 7])
        self.assertEqual(cards[0].answer, "4")
        self.assertEqual(cards[1].kind, "hecho")
        self.assertEqual(cards[1].answer, "París,\nsin duda.")
        self.assertEqual(parse_cards("# Sin tarjetas\n\n## Idea\ntexto\n"), [])

    def test_cards_are_indexed_only_for_studied_concepts(self):
        self.copy_math()
        scan = self.scan()
        self.assertEqual(len(scan.card_notes), 1)
        self.assertEqual(index_cards(self.root, scan.card_notes, scan.exercises, set()), [])
        items = index_cards(self.root, scan.card_notes, scan.exercises,
                            {"mat.logica.induccion.e03"})
        self.assertEqual(len(items), 10)
        self.assertEqual({i["entity_type"] for i in items}, {"card"})
        self.assertEqual(items[2]["entity_id"], "mat.logica.induccion#T3")
        self.assertEqual(load_card(self.root, items[2]).kind, "notacion")
        again = index_cards(self.root, scan.card_notes, scan.exercises,
                            {"mat.logica.induccion.e03"})
        self.assertEqual([i["id"] for i in again], [i["id"] for i in items])

    def test_frontmatter_estudiado_gates_cards_and_no_cards_means_nothing(self):
        self.write("M/c.md", "---\nid: c\nsubject: mathematics\ntype: concept\nestudiado: true\n"
                             "---\n# C\n\n## Tarjetas\n### T1 · definicion\n**P:** ¿Qué?\n"
                             "**R:** Esto.\n")
        self.write("M/plain.md", "---\nid: p\ntype: concept\nestudiado: true\n---\n# P\n")
        scan = self.scan()
        items = index_cards(self.root, scan.card_notes, scan.exercises, set())
        self.assertEqual([i["entity_id"] for i in items], ["c#T1"])


class StudyAreaTest(_VaultCase):
    def area(self, rel, fm=None):
        return detect_study_area(rel, fm, WorkspaceManager(self.root).workspaces())

    def test_detection(self):
        a = self.area(f"{EX_DIR}/1.10-E01 x.md")
        self.assertEqual((a.subject, a.folder, a.title),
                         ("mathematics", MATH_AREA, "1 Lógica y demostración"))
        root = self.area("Matemáticas/00 Temario.md")
        self.assertEqual((root.folder, root.title), ("Matemáticas", "Matemáticas"))
        self.assertEqual(self.area("Programación/Python/x.md").subject, "programming")
        fm_area = self.area("Práctica/x.md", {"subject": "english"})
        self.assertEqual((fm_area.subject, fm_area.folder), ("english", "Práctica"))
        self.assertTrue(fm_area.contains("Práctica/y.md", "english"))
        self.assertFalse(fm_area.contains("Práctica/z.md", "programming"))
        self.assertIsNone(self.area("Diario/x.md", {"subject": "general"}))
        self.assertIsNone(self.area("Nota.md"))

    def test_snapshot_is_scoped_to_the_area(self):
        self.copy_math()
        shutil.copytree(KB / "practice", self.root / "Práctica")
        area = self.area(f"{EX_DIR}/1.10-E01 x.md")
        snap = rc.hub_snapshot(self.root, VaultManager(self.root).note_paths(), area=area)
        self.assertEqual(len(snap.exercises), 7)
        self.assertEqual(set(snap.ledgers), {"math_general"})
        items = [i for i in snap.queue["items"] if i.exercise]
        self.assertTrue(items)
        self.assertTrue(all(i.exercise.rel.startswith(MATH_AREA) for i in items))


class StudySideBarTest(_VaultCase):
    """The Estudio sub-bar through the real notes container and real clicks."""

    def setUp(self):
        super().setUp()
        self.copy_math()
        shutil.copytree(KB / "practice", self.root / "Práctica")
        self.write("Diario/Nota suelta.md", "# Nota suelta\n\nNada de estudio.\n")
        from notevault_app.ui.components.notes.split_notes import SplitNotes
        self.vault = VaultManager(self.root)
        self.notes = SplitNotes(self.vault, NotesService(self.vault))
        self.notes.resize(1400, 900)
        self.notes.show()
        self.bar = self.notes._study

    def tearDown(self):
        self.notes.close()
        self.notes.deleteLater()
        QTest.qWait(20)
        super().tearDown()

    def open(self, rel: str):
        self.notes.open_note(self.root / rel)
        QTest.qWait(300)

    def test_sub_bar_follows_the_study_area_and_practises(self):
        concept = f"{CONCEPT_DIR}/1.10 Inducción matemática.md"
        self.open(concept)
        self.assertTrue(self.bar.isVisible())
        self.assertEqual(self.bar.area.folder, MATH_AREA)
        self.assertEqual(self.bar.title_lbl._full, "1 Lógica y demostración")
        self.assertTrue(all(e.rel.startswith(MATH_AREA) for e in self.bar.snapshot.exercises))
        self.assertEqual(set(self.bar.snapshot.ledgers), {"math_general"})

        self.open("Diario/Nota suelta.md")
        self.assertFalse(self.bar.isVisible())

        self.open(concept)
        self.assertTrue(self.bar.isVisible())
        first = self.bar.queue.first_exercise()
        self.assertIsNotNone(first)
        QTest.mouseClick(self.bar.practice_btn, Qt.LeftButton)
        QTest.qWait(300)
        pane = self.notes._active
        self.assertEqual(pane.current_path(), first.path)
        self.assertEqual(pane._stack.currentIndex(), 4)
        self.assertTrue(self.bar.isVisible())

    def test_ledger_row_click_opens_the_skill_exercise(self):
        self.open(f"{EX_DIR}/1.10-E01 Suma de los primeros impares.md")
        QTest.mouseClick(self.bar.tab_buttons[1], Qt.LeftButton)
        self.assertIs(self.bar.stack.currentWidget(), self.bar.ledger)
        row = self.bar.ledger.skill_rows[("math_general", "04")]
        QTest.mouseClick(row, Qt.LeftButton)
        QTest.qWait(300)
        self.assertEqual(self.notes._active.current_path(), row.exercise.path)
        self.assertEqual(row.exercise.skill, "04")

    def _click_folder(self, explorer, rel: str):
        item = explorer._find_item(self.root / rel)
        self.assertIsNotNone(item, rel)
        tree = explorer._tree
        tree.scrollToItem(item)
        QTest.mouseClick(tree.viewport(), Qt.LeftButton, pos=tree.visualItemRect(item).center())
        QTest.qWait(300)

    def test_clicking_an_area_folder_in_the_explorer_shows_the_sub_bar(self):
        from notevault_app.ui.components.notes.notes_sidebar import NotesSidebar
        self.write("Inglés/Vocabulario/v1.md", "---\nsubject: english\n---\n# v1\n")
        explorer = NotesSidebar(self.vault, NotesService(self.vault))
        explorer.folder_selected.connect(self.notes.show_study_for)
        explorer.resize(300, 900)
        explorer.show()
        try:
            self.assertFalse(self.bar.isVisible())
            self._click_folder(explorer, "Matemáticas")
            self.assertTrue(self.bar.isVisible())
            self.assertEqual(self.bar.area.subject, "mathematics")
            self.assertTrue(self.bar.player_btn.isHidden())
            self._click_folder(explorer, "Inglés")
            self.assertTrue(self.bar.isVisible())
            self.assertEqual(self.bar.area.subject, "english")
            self.assertFalse(self.bar.player_btn.isHidden())
            self._click_folder(explorer, "Diario")
            self.assertFalse(self.bar.isVisible())
        finally:
            explorer.close()
            explorer.deleteLater()

    def test_due_proof_level_shows_in_today_and_opens_the_ladder(self):
        proof = self.root / CONCEPT_DIR / "Demostraciones" / "1.10-T02 Desigualdad de Bernoulli.md"
        StudySRSManager(self.root).register_item(
            entity_id="proof-bernoulli", entity_type="proof_L3", subject="mathematics",
            topic="proof", source_note=str(proof), difficulty=3)
        self.open(f"{CONCEPT_DIR}/1.10 Inducción matemática.md")
        rows = [r for r in self.bar.queue._rows if r.item.kind == "srs_proof"]
        self.assertEqual(len(rows), 1)
        self.assertIn("nivel 3", rows[0].item.reason)
        btn = rows[0].findChild(QPushButton, "practiceNowBtn")
        QTest.mouseClick(btn, Qt.LeftButton)
        QTest.qWait(300)
        pane = self.notes._active
        self.assertEqual(pane.current_path(), proof)
        self.assertEqual(pane._stack.currentIndex(), 5)

    def test_close_hides_until_the_area_changes(self):
        self.open(f"{EX_DIR}/1.10-E01 Suma de los primeros impares.md")
        QTest.mouseClick(self.bar.close_btn, Qt.LeftButton)
        self.assertFalse(self.bar.isVisible())
        self.open(f"{EX_DIR}/1.10-E02 Tres divide a 4 elevado a n menos 1.md")
        self.assertFalse(self.bar.isVisible())
        self.open("Práctica/P-PY-06-E01 Webhook que traga errores.md")
        self.assertTrue(self.bar.isVisible())
        self.assertEqual(self.bar.area.subject, "programming")


if __name__ == "__main__":
    unittest.main()

"""Proof ladder: parsing theorem notes, local L2 checking, level progression, and the
ladder view opened through the real editor."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt, QPoint
from PySide6.QtTest import QTest

from notevault_app.core.practice import ladder
from notevault_app.core.study_srs_manager import StudySRSManager
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes import markdown_editor as me
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor
from notevault_app.ui.components.notes.practice import ladder_view as lv

from tests.test_practice_view import _FakeWorker

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

REPO = Path(__file__).resolve().parents[1]
PROOFS = (REPO / "docs/knowledge_base/examples/Matemáticas/1 Lógica y demostración/"
          "1.10 Inducción matemática/Demostraciones")

L4_REPLY = {
    "score": 85, "verdict": "partial",
    "rubric": [True, True, True, True, False, True],
    "errors": [{"category": "logical", "anchor": "",
                "description": "Step 5 justification does not name the factorisation.",
                "evidence": "porque sí", "fix": "Say that k+1 is factored out."}],
    "feedback": "Buenas justificaciones; la del paso 5 es vaga.",
    "next_step": "¿Qué factor común aparece en el paso 5?",
    "example": "Sacar factor común $k+1$.",
}


def _proof_paths():
    return sorted(PROOFS.glob("*.md"))


class ProofParsingTest(unittest.TestCase):
    def test_example_proofs_parse(self):
        paths = _proof_paths()
        self.assertGreaterEqual(len(paths), 2)
        for path in paths:
            text = path.read_text(encoding="utf-8")
            proof = ladder.parse_proof(text, path)
            self.assertTrue(ladder.is_proof_frontmatter(proof.frontmatter), path.name)
            self.assertTrue(proof.note_id.startswith("mat.logica.induccion.t"), path.name)
            self.assertTrue(proof.statement)
            self.assertTrue(proof.strategy)
            self.assertTrue(proof.key_idea)
            self.assertGreaterEqual(len(proof.hypotheses), 1)
            self.assertGreaterEqual(len(proof.steps), 3, path.name)
            for step in proof.steps:
                self.assertTrue(step.text, path.name)
                self.assertTrue(step.why, path.name)
                self.assertNotIn("**Paso", step.text)
                self.assertNotIn("Por qué", step.text)
            self.assertGreaterEqual(len(proof.variants), 2)
            self.assertIsNotNone(ladder.ladder_note(text, path))
            self.assertEqual(ladder.available_levels(proof), [1, 2, 3, 4, 5, 6])

    def test_first_proof_details(self):
        path = next(p for p in _proof_paths() if "T01" in p.name)
        proof = ladder.parse_proof(path.read_text(encoding="utf-8"), path)
        self.assertEqual(len(proof.steps), 6)
        self.assertIn("P(1)", proof.steps[1].text)
        self.assertIn("caso base", proof.steps[1].why)
        self.assertEqual(len(proof.variants), 3)

    def test_tolerant_formats(self):
        text = ("---\ntype: theorem\nid: t.x\n---\n# T\n## Enunciado\nA.\n## Prueba\n"
                "1. Primer paso. *Por qué:* uno.\n2. **Paso 2**: segundo.\n   Justificación: dos.\n"
                "3. Tercero sin justificación.\n")
        proof = ladder.parse_proof(text)
        self.assertEqual([s.text for s in proof.steps],
                         ["Primer paso.", "segundo.", "Tercero sin justificación."])
        self.assertEqual([s.why for s in proof.steps], ["uno.", "dos.", ""])
        self.assertEqual(ladder.available_levels(proof), [1, 2, 3, 4, 5])

    def test_unparseable_or_other_notes_are_not_ladder_notes(self):
        self.assertIsNone(ladder.ladder_note("---\ntype: theorem\n---\n## Demostración\nTexto.\n"))
        self.assertIsNone(ladder.ladder_note("---\ntype: concept\n---\n## Demostración\n"
                                             "1. a\n2. b\n"))
        self.assertIsNone(ladder.ladder_note("# sin frontmatter\n1. a\n2. b\n"))


class LadderLogicTest(unittest.TestCase):
    def test_local_order_check(self):
        n = 6
        self.assertEqual(ladder.check_order(list(range(n))), [True] * n)
        good = ladder.local_order_result(list(range(n)))
        self.assertEqual(good.score, 100)
        self.assertTrue(ladder.passed(good.score))
        swapped = [0, 1, 3, 2, 4, 5]
        self.assertEqual(ladder.check_order(swapped), [True, True, False, False, True, True])
        bad = ladder.local_order_result(swapped)
        self.assertLess(bad.score, ladder.PASS_SCORE)
        self.assertFalse(ladder.passed(bad.score))
        self.assertEqual(bad.errors[0].category, "logical")

    def test_shuffle_never_identity_and_hidden_steps(self):
        for seed in range(30):
            order = ladder.shuffled_order(6, seed)
            self.assertEqual(sorted(order), list(range(6)))
            self.assertNotEqual(order, list(range(6)))
            hidden = ladder.hidden_steps(6, seed)
            self.assertEqual(len(hidden), 3)
            self.assertTrue(all(0 <= i < 6 for i in hidden))

    def test_unlock_and_drop(self):
        self.assertEqual(ladder.next_level(1, 1, True, 6), 2)
        self.assertEqual(ladder.next_level(3, 3, True, 6), 4)
        self.assertEqual(ladder.next_level(6, 6, True, 6), 6)
        self.assertEqual(ladder.next_level(4, 2, True, 6), 4)
        self.assertEqual(ladder.next_level(4, 4, False, 6), 3)
        self.assertEqual(ladder.next_level(1, 1, False, 6), 1)
        self.assertEqual(ladder.next_level(5, 2, False, 6), 1)

    def test_state_replays_attempts(self):
        atts = [{"mode": "proof_L1", "score": 90}, {"mode": "proof_L2", "score": 100},
                {"mode": "proof_L3", "score": 80}, {"mode": "proof_L4", "score": 30},
                {"mode": "prove", "score": 100}]
        state = ladder.ladder_state(atts, 6)
        self.assertEqual(state.current, 3)
        self.assertEqual(state.passed, {1, 2, 3})
        self.assertTrue(state.unlocked(3))
        self.assertFalse(state.unlocked(4))
        self.assertEqual(state.count[4], 1)
        seen = ladder.ladder_state([{"mode": "proof_L1", "score": 100, "solution_seen": True}], 5)
        self.assertEqual(seen.current, 1)

    def test_messages_carry_the_proof_as_model(self):
        path = _proof_paths()[0]
        proof = ladder.parse_proof(path.read_text(encoding="utf-8"), path)
        rubric = ladder.rubric_for(proof, 4)
        self.assertEqual(len(rubric), len(proof.steps))
        msgs = ladder.build_ladder_messages(
            proof, 4, "respuesta", rubric=rubric, shown=ladder.proof_markdown(proof, False),
            seconds=65, solution_seen=False, recent_errors=[])
        self.assertIn("JSON", msgs[0]["content"])
        self.assertIn(proof.steps[1].why, msgs[1]["content"])
        self.assertIn("respuesta", msgs[1]["content"])


class LadderViewTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_ladder_"))
        (self.dir / ".notevault").mkdir()
        src = next(p for p in _proof_paths() if "T01" in p.name)
        self.path = self.dir / "Matemáticas" / src.name
        self.path.parent.mkdir(parents=True)
        shutil.copy(src, self.path)
        self.plain = self.dir / "Plain.md"
        self.plain.write_text("# Plain\n\nNota normal.\n", encoding="utf-8")
        self.vault = VaultManager(self.dir)
        self.editor = MarkdownEditor(self.vault, NotesService(self.vault))
        self.editor.resize(1100, 900)
        self.view = self.editor._ladder

    def tearDown(self):
        self.editor.deleteLater()
        shutil.rmtree(self.dir, ignore_errors=True)

    def _open(self):
        self.editor.open_note(self.path)
        app.processEvents()

    def _reopen(self):
        self.editor.open_note(self.plain)
        app.processEvents()
        self.assertNotEqual(self.editor._stack.currentIndex(), me.STACK_LADDER)
        self._open()

    def _record(self, level, score):
        from notevault_app.core.practice.attempts import PracticeAttemptStore
        proof = ladder.parse_proof(self.path.read_text(encoding="utf-8"), self.path)
        ex =ladder.level_exercise(proof, level, ladder.rubric_for(proof, level, [0]))
        PracticeAttemptStore(self.dir).record(
            ex, "x.md", answer="a", hints_used=0, seconds=1, solution_seen=False,
            transport="local", result=ladder.local_order_result(list(range(len(proof.steps))))
            if score == 100 else None, quality=3)

    def test_proof_note_opens_in_ladder_view(self):
        self._open()
        self.assertEqual(self.editor._stack.currentIndex(), me.STACK_LADDER)
        self.assertIs(self.editor._stack.currentWidget(), self.view)
        self.assertFalse(self.editor._toolbar_host.isVisible())
        self.assertEqual(self.view.current_level(), 1)
        self.assertNotIn("$", self.view._statement.toPlainText())
        self.assertFalse(self.view._pills[2].isEnabled())

    def test_edit_and_back_to_ladder(self):
        self.editor.show()
        self._open()
        QTest.mouseClick(self.view._edit_btn, Qt.LeftButton)
        app.processEvents()
        self.assertIn(self.editor._stack.currentIndex(), (me.MODE_RICH, me.MODE_RAW, me.MODE_READ))
        self.assertTrue(self.editor._ladder_btn.isVisible())
        self.assertFalse(self.editor._practice_btn.isVisible())
        QTest.mouseClick(self.editor._ladder_btn, Qt.LeftButton)
        app.processEvents()
        self.assertEqual(self.editor._stack.currentIndex(), me.STACK_LADDER)
        self.editor.hide()

    def test_format_shortcuts_do_not_touch_the_note(self):
        self._open()
        before = self.path.read_text(encoding="utf-8")
        self.editor.toggle_bold()
        self.editor.toggle_current_task()
        self.editor.save_current()
        self.assertEqual(self.path.read_text(encoding="utf-8"), before)

    def test_unparseable_theorem_opens_in_editor(self):
        self.path.write_text("---\ntype: theorem\n---\n# T\n## Demostración\nTexto libre.\n",
                             encoding="utf-8")
        self._open()
        self.assertIn(self.editor._stack.currentIndex(), (me.MODE_RICH, me.MODE_RAW, me.MODE_READ))

    def _drag(self, lst, src_pos, dst_pos):
        cards = lst.cards()
        start = cards[src_pos].geometry().center()
        target = cards[dst_pos].geometry()
        end = QPoint(start.x(), target.bottom() - 2 if dst_pos > src_pos else target.top() + 2)
        QTest.mousePress(lst, Qt.LeftButton, Qt.NoModifier, start)
        mid = QPoint(start.x(), (start.y() + end.y()) // 2)
        QTest.mouseMove(lst, QPoint(start.x(), start.y() + (6 if end.y() > start.y() else -6)))
        QTest.mouseMove(lst, mid)
        QTest.mouseMove(lst, end)
        QTest.mouseRelease(lst, Qt.LeftButton, Qt.NoModifier, end)
        app.processEvents()

    def _sort_by_drag(self, lst):
        for target in range(len(lst.order())):
            src = lst.order().index(target)
            if src != target:
                self._drag(lst, src, target)
                self.assertEqual(lst.order()[target], target, lst.order())

    def test_l2_drag_to_order_and_check_locally(self):
        self.editor.show()
        self._record(1, 100)
        self._open()
        self.assertEqual(self.view.current_level(), 2)
        lst = self.view._order_list
        self.assertNotEqual(lst.order(), sorted(lst.order()))
        QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        self.assertTrue(self.view._graded)
        atts = self.view._store.attempts(self.view._proof.note_id)
        self.assertEqual(atts[-1]["mode"], "proof_L2")
        self.assertLess(atts[-1]["score"], 100)
        self.assertEqual(atts[-1]["transport"], "local")
        self.assertIn("bajas a L1", self.view._ladder_lbl.text())

        QTest.mouseClick(self.view._next_level_btn, Qt.LeftButton)
        self.assertEqual(self.view.current_level(), 1)
        self._record(1, 100)
        self._reopen()
        self.assertEqual(self.view.current_level(), 2)
        lst = self.view._order_list
        self._sort_by_drag(lst)
        self.assertEqual(lst.order(), list(range(len(self.view._proof.steps))))
        QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        atts = self.view._store.attempts(self.view._proof.note_id)
        self.assertEqual(atts[-1]["score"], 100)
        self.assertEqual(self.view._state.current, 3)
        self.assertIn("L3", self.view._ladder_lbl.text())
        srs = StudySRSManager(self.dir).all_items()
        self.assertEqual({i["entity_type"] for i in srs}, {"proof_l2"})
        self.editor.hide()

    def test_l4_submission_records_attempt_and_srs(self):
        for level in (1, 2, 3):
            self._record(level, 100)
        self._open()
        self.assertEqual(self.view.current_level(), 4)
        fields = self.view._fields
        self.assertEqual(len(fields), len(self.view._proof.steps))
        for i, ed in enumerate(fields):
            ed.setPlainText(f"justificación {i + 1}")
        self.assertTrue(self.view._timer.is_running())
        with mock.patch.object(lv, "AIWorker",
                               type("W", (_FakeWorker,), {"reply": json.dumps(L4_REPLY)})), \
                mock.patch.object(lv.AppConfig, "get_ai_config",
                                  return_value={"provider": "lmstudio"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        app.processEvents()
        self.assertTrue(self.view._graded)
        self.assertFalse(self.view._result_card.isHidden())
        self.assertIn("85", self.view._score_lbl.text())
        att = self.view._store.attempts(self.view._proof.note_id)[-1]
        self.assertEqual(att["mode"], "proof_L4")
        self.assertEqual(att["transport"], "http")
        self.assertIn("Paso 1 — Por qué: justificación 1", att["answer"])
        items = StudySRSManager(self.dir).all_items()
        self.assertEqual([i["entity_type"] for i in items], ["proof_l4"])
        self.assertEqual(items[0]["entity_id"], "mat.logica.induccion.t01")
        self.assertEqual(self.view._state.current, 5)
        estudio = self.dir / ".notevault" / "estudio"
        self.assertIn("Step 5", (estudio / "errores" / "ERROR_LOG.md").read_text(encoding="utf-8"))

    def test_bridge_handoff_resumes_on_reopen(self):
        from notevault_app.core.practice import handoff
        self._open()
        self.view._fields[0].setPlainText("Inducción sobre n; sumar k+1 a la HI.")
        with mock.patch.object(lv, "_open_url"), \
                mock.patch.object(lv.AppConfig, "get_ai_config",
                                  return_value={"provider": "bridge_antigravity"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        req_id = self.view._req_id
        self.assertTrue(req_id)
        self.assertEqual(handoff.read_request(self.dir, req_id)["mode"], "proof_L1")
        self._reopen()
        self.assertFalse(self.view._submit_btn.isEnabled())
        self.assertEqual(self.view._fields[0].toPlainText(), "Inducción sobre n; sumar k+1 a la HI.")
        self.assertEqual(self.view._req_id, req_id)
        reply = dict(L4_REPLY, rubric=[True, True, True], score=90)
        handoff.response_path(self.dir, req_id).write_text(json.dumps(reply), encoding="utf-8")
        self.view._poll_handoff()
        self.assertTrue(self.view._graded)
        self.assertEqual(self.view._store.attempts(self.view._proof.note_id)[-1]["transport"],
                         "handoff")
        self.assertEqual(self.view._state.current, 2)


if __name__ == "__main__":
    unittest.main()

"""Practice view: opening an exercise note through the real editor shows the practice
view, and a graded submission is stored (attempt, error log, digest, SRS)."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtCore import Qt
from PySide6.QtTest import QTest

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes import markdown_editor as me
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor
from notevault_app.ui.components.notes.practice import practice_view as pv

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

REPO = Path(__file__).resolve().parents[1]
MATH_EX = (REPO / "docs/knowledge_base/examples/Matemáticas/1 Lógica y demostración/"
           "1.10 Inducción matemática/Ejercicios")
SAMPLES = REPO / "docs/knowledge_base/examples/practice"

GOOD_REPLY = {
    "score": 80, "verdict": "partial",
    "rubric": [True, True, True, False, True],
    "errors": [{"category": "logical", "anchor": "",
                "description": "The inductive step does not state the hypothesis explicitly.",
                "evidence": "suponemos que vale", "fix": "Write P(k) before using it."}],
    "feedback": "Bien planteado, pero falta enunciar la hipótesis inductiva.",
    "next_step": "¿Qué afirmación exacta supones cierta para k?",
    "example": "Supongamos P(k): 1+3+…+(2k-1) = k^2.",
}


class _FakeWorker:
    """Stands in for AIWorker: replies synchronously with a canned JSON."""
    reply = json.dumps(GOOD_REPLY)

    def __init__(self, cfg, messages, parent=None):
        self.messages = messages
        self._ok = []
        self._fail = []
        self.finished_ok = _Sig(self._ok)
        self.failed = _Sig(self._fail)

    def start(self):
        for cb in self._ok:
            cb(self.reply)


class _Sig:
    def __init__(self, store):
        self._store = store

    def connect(self, cb):
        self._store.append(cb)


class PracticeViewTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_practice_"))
        (self.dir / ".notevault").mkdir()
        src = sorted(MATH_EX.glob("1.10-E01*.md"))[0]
        self.ex_path = self.dir / "Matemáticas" / src.name
        self.ex_path.parent.mkdir(parents=True)
        shutil.copy(src, self.ex_path)
        self.plain = self.dir / "Plain.md"
        self.plain.write_text("# Plain\n\nNota normal.\n", encoding="utf-8")
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.editor = MarkdownEditor(self.vault, self.service)
        self.editor.resize(1100, 800)
        self.view = self.editor._practice

    def tearDown(self):
        self.editor.deleteLater()
        shutil.rmtree(self.dir, ignore_errors=True)

    def _open(self, path):
        self.editor.open_note(path)
        app.processEvents()

    def test_exercise_note_opens_in_practice_view(self):
        self._open(self.ex_path)
        self.assertIs(self.editor._stack.currentWidget(), self.view)
        self.assertEqual(self.editor._stack.currentIndex(), me.STACK_PRACTICE)
        self.assertFalse(self.editor._toolbar_host.isVisible())
        self.assertTrue(self.view._title_lbl.text())
        self.assertIn("Matemáticas", self.view._chips_lbl.text())

    def test_plain_note_still_opens_in_editor(self):
        self._open(self.plain)
        self.assertIn(self.editor._stack.currentIndex(), (me.MODE_RICH, me.MODE_RAW, me.MODE_READ))
        self.assertFalse(self.editor._practice_btn.isVisible())

    def test_edit_and_back_to_practice(self):
        self.editor.show()
        self._open(self.ex_path)
        QTest.mouseClick(self.view._edit_btn, Qt.LeftButton)
        app.processEvents()
        self.assertNotEqual(self.editor._stack.currentIndex(), me.STACK_PRACTICE)
        self.assertTrue(self.editor._practice_btn.isVisible())
        QTest.mouseClick(self.editor._practice_btn, Qt.LeftButton)
        app.processEvents()
        self.assertEqual(self.editor._stack.currentIndex(), me.STACK_PRACTICE)
        self.editor.hide()

    def test_format_shortcuts_do_not_touch_the_note(self):
        self._open(self.ex_path)
        before = self.ex_path.read_text(encoding="utf-8")
        self.editor.toggle_bold()
        self.editor.toggle_current_task()
        self.editor.save_current()
        self.assertEqual(self.ex_path.read_text(encoding="utf-8"), before)

    def test_hints_reveal_one_at_a_time(self):
        self._open(self.ex_path)
        total = len(self.view._ex.hints)
        self.assertGreaterEqual(total, 1)
        QTest.mouseClick(self.view._hint_btn, Qt.LeftButton)
        self.assertEqual(self.view._hints_shown, 1)
        self.assertIn("Pista 1", self.view._hints_view.toPlainText())
        for _ in range(total + 2):
            QTest.mouseClick(self.view._hint_btn, Qt.LeftButton)
        self.assertEqual(self.view._hints_shown, total)
        self.assertFalse(self.view._hint_btn.isEnabled())

    def test_typing_starts_timer_and_saves_draft(self):
        self._open(self.ex_path)
        self.assertFalse(self.view._timer.is_running())
        self.view._answer.setPlainText("Por inducción sobre n.")
        self.assertTrue(self.view._timer.is_running())
        self.view._save_draft()
        self.assertEqual(self.view._store.draft(self.view._ex.note_id), "Por inducción sobre n.")

    def test_submit_over_http_records_everything(self):
        self._open(self.ex_path)
        self.view._answer.setPlainText("Caso base n=1 y suponemos que vale para k.")
        with mock.patch.object(pv, "AIWorker", _FakeWorker), \
                mock.patch.object(pv.AppConfig, "get_ai_config",
                                  return_value={"provider": "lmstudio"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        app.processEvents()
        self.assertTrue(self.view._graded)
        self.assertFalse(self.view._result_card.isHidden())
        self.assertIn("80", self.view._score_lbl.text())
        atts = self.view._store.attempts(self.view._ex.note_id)
        self.assertEqual(len(atts), 1)
        self.assertEqual(atts[0]["score"], 80)
        self.assertEqual(atts[0]["transport"], "http")
        estudio = self.dir / ".notevault" / "estudio"
        self.assertTrue(any((estudio / "errores").glob("*.json")))
        digest = (estudio / "errores" / "ERROR_LOG.md").read_text(encoding="utf-8")
        self.assertIn("inductive step", digest)
        self.assertTrue(any((estudio / "srs").glob("*.json")))
        self.assertIn("1 intento", self.view._history_lbl.text())

    def test_bad_reply_keeps_waiting(self):
        self._open(self.ex_path)
        self.view._answer.setPlainText("respuesta")
        bad = type("Bad", (_FakeWorker,), {"reply": "no hay JSON aquí"})
        with mock.patch.object(pv, "AIWorker", bad), \
                mock.patch.object(pv.AppConfig, "get_ai_config",
                                  return_value={"provider": "lmstudio"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        self.assertFalse(self.view._graded)
        self.assertTrue(self.view._submit_btn.isEnabled())
        self.assertTrue(self.view._status_lbl.text())

    def test_bridge_writes_handoff_and_pastes(self):
        self._open(self.ex_path)
        self.view._answer.setPlainText("respuesta por puente")
        with mock.patch.object(pv, "_open_url") as opened, \
                mock.patch.object(pv.AppConfig, "get_ai_config",
                                  return_value={"provider": "bridge_claude"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
            self.assertTrue(opened.called)
        reqs = list((self.dir / ".notevault/estudio/handoff/requests").glob("*.json"))
        self.assertEqual(len(reqs), 1)
        self.assertFalse(self.view._paste_btn.isHidden())
        QApplication.clipboard().setText("```json\n" + json.dumps(GOOD_REPLY) + "\n```")
        QTest.mouseClick(self.view._paste_btn, Qt.LeftButton)
        self.assertTrue(self.view._graded)
        self.assertEqual(self.view._store.attempts(self.view._ex.note_id)[0]["transport"], "bridge")

    def test_handoff_response_file_is_picked_up(self):
        self._open(self.ex_path)
        self.view._answer.setPlainText("respuesta por archivo")
        with mock.patch.object(pv, "_open_url"), \
                mock.patch.object(pv.AppConfig, "get_ai_config",
                                  return_value={"provider": "bridge_antigravity"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        req_id = self.view._req_id
        from notevault_app.core.practice import handoff
        resp = handoff.response_path(self.dir, req_id)
        resp.parent.mkdir(parents=True, exist_ok=True)
        resp.write_text(json.dumps(GOOD_REPLY), encoding="utf-8")
        self.view._poll_handoff()
        self.assertTrue(self.view._graded)
        self.assertEqual(self.view._store.attempts(self.view._ex.note_id)[0]["transport"], "handoff")

    def _leave_pending_request(self):
        self._open(self.ex_path)
        self.view._answer.setPlainText("respuesta pendiente")
        with mock.patch.object(pv, "_open_url"), \
                mock.patch.object(pv.AppConfig, "get_ai_config",
                                  return_value={"provider": "bridge_antigravity"}):
            QTest.mouseClick(self.view._submit_btn, Qt.LeftButton)
        req_id = self.view._req_id
        self.assertTrue(req_id)
        other = sorted(MATH_EX.glob("1.10-E02*.md"))[0]
        shutil.copy(other, self.ex_path.parent / other.name)
        self._open(self.ex_path.parent / other.name)
        self.assertIsNone(self.view._req_id)
        self.assertFalse(self.view._poll.isActive())
        return req_id

    def test_pending_request_meta_identifies_the_note(self):
        from notevault_app.core.practice import handoff
        req_id = self._leave_pending_request()
        data = handoff.read_request(self.dir, req_id)
        self.assertEqual(data["note_id"], "mat.logica.induccion.e01")
        self.assertTrue(data["note_path"].endswith(self.ex_path.name))
        self.assertEqual(data["answer"], "respuesta pendiente")

    def test_reopening_note_resumes_pending_request(self):
        from notevault_app.core.practice import handoff
        req_id = self._leave_pending_request()
        self._open(self.ex_path)
        self.assertEqual(self.view._req_id, req_id)
        self.assertTrue(self.view._poll.isActive())
        self.assertFalse(self.view._submit_btn.isEnabled())
        self.assertFalse(self.view._discard_btn.isHidden())
        self.assertEqual(self.view._answer.toPlainText(), "respuesta pendiente")
        resp = handoff.response_path(self.dir, req_id)
        resp.write_text(json.dumps(GOOD_REPLY), encoding="utf-8")
        self.view._poll_handoff()
        self.assertTrue(self.view._graded)
        att = self.view._store.attempts(self.view._ex.note_id)[-1]
        self.assertEqual(att["transport"], "handoff")
        self.assertEqual(handoff.pending_requests(self.dir), [])

    def test_reopening_ingests_response_written_meanwhile(self):
        from notevault_app.core.practice import handoff
        req_id = self._leave_pending_request()
        handoff.response_path(self.dir, req_id).write_text(json.dumps(GOOD_REPLY),
                                                          encoding="utf-8")
        self._open(self.ex_path)
        self.assertTrue(self.view._graded)
        self.assertFalse(self.view._result_card.isHidden())
        self.assertEqual(len(self.view._store.attempts(self.view._ex.note_id)), 1)
        self.assertEqual(handoff.pending_requests(self.dir), [])

    def test_discarding_pending_request(self):
        from notevault_app.core.practice import handoff
        self._leave_pending_request()
        self._open(self.ex_path)
        QTest.mouseClick(self.view._discard_btn, Qt.LeftButton)
        self.assertIsNone(self.view._req_id)
        self.assertTrue(self.view._submit_btn.isEnabled())
        self.assertEqual(handoff.pending_requests(self.dir), [])
        self._open(self.ex_path)
        self.assertIsNone(self.view._req_id)

    def test_math_is_rendered_in_statement_and_hints(self):
        self._open(self.ex_path)
        doc = self.view._statement.document()
        self.assertNotIn("$", doc.toPlainText())
        self.assertIn("￼", doc.toPlainText())
        QTest.mouseClick(self.view._hint_btn, Qt.LeftButton)
        self.assertNotIn("$", self.view._hints_view.toPlainText())

    def test_give_up_without_answer_records_zero(self):
        self._open(self.ex_path)
        with mock.patch.object(QMessageBox, "question", return_value=QMessageBox.Yes):
            QTest.mouseClick(self.view._giveup_btn, Qt.LeftButton)
        self.assertFalse(self.view._solution_box.isHidden())
        atts = self.view._store.attempts(self.view._ex.note_id)
        self.assertEqual(atts[-1]["score"], 0)
        self.assertTrue(atts[-1]["solution_seen"])


@unittest.skipUnless(SAMPLES.exists(), "sample practice notes not written yet")
class DrillAndSamplesTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_drill_"))
        (self.dir / ".notevault").mkdir()
        for src in SAMPLES.glob("*.md"):
            shutil.copy(src, self.dir / src.name)
        self.vault = VaultManager(self.dir)
        self.editor = MarkdownEditor(self.vault, NotesService(self.vault))
        self.editor.resize(1100, 800)
        self.view = self.editor._practice

    def tearDown(self):
        self.editor.deleteLater()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_every_sample_opens_in_practice_view(self):
        for path in sorted(self.dir.glob("*.md")):
            self.editor.open_note(path)
            app.processEvents()
            self.assertEqual(self.editor._stack.currentIndex(), me.STACK_PRACTICE, path.name)
            self.assertIsNotNone(self.view._ex, path.name)
            self.assertTrue(self.view._error_lbl.isHidden(), path.name)

    def test_drill_end_to_end(self):
        drill = next(p for p in self.dir.glob("*.md") if "DRILL" in p.name)
        self.editor.open_note(drill)
        app.processEvents()
        panel = self.view._drill
        self.assertTrue(self.view._exercise_box.isHidden())
        panel.start()
        for i, item in enumerate(list(panel._items)):
            panel._answer.setText(item.answer if i % 2 == 0 else "999999")
            panel._submit_item()
        self.assertTrue(self.view._graded)
        att = self.view._store.attempts(self.view._ex.note_id)[-1]
        self.assertEqual(att["transport"], "local")
        n = len(panel._items)
        self.assertEqual(att["score"], round(100 * ((n + 1) // 2) / n))


if __name__ == "__main__":
    unittest.main()

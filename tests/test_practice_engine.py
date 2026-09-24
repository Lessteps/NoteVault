"""Unit tests for the practice engine (notevault_app/core/practice)."""

import json
import shutil
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

from notevault_app.core import vault_format
from notevault_app.core.study_error_manager import ERROR_CATEGORIES, StudyErrorManager
from notevault_app.core.study_srs_manager import StudySRSManager
from notevault_app.core.practice import drills, handoff
from notevault_app.core.practice.attempts import PracticeAttemptStore, attempt_key
from notevault_app.core.practice.discipline_catalog import (
    DEFAULT_DISCIPLINE, DISCIPLINES, discipline_for, skill_of)
from notevault_app.core.practice.error_log import (
    apply_result, recent_errors, record_grade_errors, write_error_digest)
from notevault_app.core.practice.exercise_note import is_practice_frontmatter, parse_exercise
from notevault_app.core.practice.grading import (
    GradeError, GradeParseError, GradeResult, build_grading_messages, parse_grade_reply,
    quality_from)
from notevault_app.core.practice.modes import MODES, PRACTICE_ALIASES, mode_for
from notevault_app.core.practice.timer import TimerSpec, parse_timer

ROOT = Path(__file__).resolve().parent.parent
MATH_EXERCISES = (ROOT / "docs" / "knowledge_base" / "examples" / "Matemáticas"
                  / "1 Lógica y demostración" / "1.10 Inducción matemática" / "Ejercicios")
SAMPLES = ROOT / "docs" / "knowledge_base" / "examples" / "practice"


def _load(path: Path):
    return parse_exercise(path.read_text(encoding="utf-8"), path)


def _sample(prefix: str):
    return _load(next(SAMPLES.glob(prefix + "*.md")))


def _result(score=70, errors=(), rubric=(True, False, True, True, False)):
    return GradeResult(score=score, verdict="partial", rubric=list(rubric), errors=list(errors),
                       feedback="Bien encaminado.", next_step="Revisa el paso inductivo.",
                       example="P(k+1)", raw="{}")


class TempVaultCase(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_practice_"))

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)


class TestModes(unittest.TestCase):
    def test_catalogue(self):
        self.assertEqual(len(MODES), 16)
        for mode in MODES.values():
            self.assertIn(mode.answer_kind, ("text", "code", "short", "drill"))
            self.assertIsInstance(parse_timer(None, 0, mode.timer), TimerSpec)
            self.assertNotEqual(parse_timer(None, 0, mode.timer).kind, "off")
            self.assertTrue(mode.label and mode.act and mode.judge_focus and mode.subjects)

    def test_mode_for(self):
        self.assertEqual(mode_for({"mode": "debug", "practice": "demostracion"}).id, "debug")
        for practice, mode_id in PRACTICE_ALIASES.items():
            self.assertIn(mode_id, MODES)
            self.assertEqual(mode_for({"practice": practice}).id, mode_id)
        self.assertEqual(mode_for({}).id, "solve")
        self.assertEqual(mode_for({"mode": "nonsense"}).id, "solve")
        self.assertEqual(mode_for(None).id, "solve")


class TestDisciplines(unittest.TestCase):
    def test_catalogue(self):
        self.assertEqual(len(DISCIPLINES), 10)
        expected_skills = {"python": 15, "javascript": 14, "sql": 13, "git": 9}
        for disc in DISCIPLINES.values():
            for mode_id in disc.modes:
                self.assertIn(mode_id, MODES, disc.id)
            self.assertTrue(disc.framing and disc.title and disc.skills)
            codes = [s.code for s in disc.skills]
            self.assertEqual(codes, [f"{i:02d}" for i in range(1, len(codes) + 1)])
            minimum = 2 if disc.subject == "programming" else 3
            for skill in disc.skills:
                self.assertGreaterEqual(len(skill.anchors), minimum, (disc.id, skill.code))
            if disc.id in expected_skills:
                self.assertEqual(len(disc.skills), expected_skills[disc.id], disc.id)

    def test_training_system_titles(self):
        self.assertEqual(skill_of(DISCIPLINES["python"], "08").title, "Debugging deliberado")
        self.assertTrue(skill_of(DISCIPLINES["python"], 6).title.startswith("Manejo de errores"))
        self.assertTrue(skill_of(DISCIPLINES["sql"], "7").title.startswith("Idempotencia"))
        self.assertTrue(skill_of(DISCIPLINES["git"], "07").title.startswith("Corrección"))
        self.assertIsNone(skill_of(DISCIPLINES["git"], "10"))
        self.assertIsNone(skill_of(DISCIPLINES["git"], ""))

    def test_discipline_for(self):
        for subject, disc_id in DEFAULT_DISCIPLINE.items():
            self.assertEqual(discipline_for({"subject": subject}).id, disc_id)
        self.assertEqual(discipline_for({"subject": "programming", "discipline": "sql"}).id,
                         "sql")
        self.assertEqual(discipline_for({"subject": "mathematics", "mode": "drill"}).id,
                         "math_drill")
        self.assertEqual(discipline_for({"subject": "english", "discipline": "bogus"}).id,
                         "english_grammar")


class TestExerciseNote(unittest.TestCase):
    def test_reference_math_exercises(self):
        paths = sorted(MATH_EXERCISES.glob("*.md"))
        self.assertEqual(len(paths), 7)
        for path in paths:
            ex = _load(path)
            fm_practice = ex.frontmatter["practice"]
            self.assertEqual(ex.mode, PRACTICE_ALIASES[fm_practice], path.name)
            self.assertEqual(ex.subject, "mathematics")
            self.assertEqual(ex.discipline, "math_general")
            self.assertTrue(ex.note_id.startswith("mat.logica.induccion.e"))
            self.assertEqual(len(ex.rubric), 5, path.name)
            self.assertTrue(1 <= len(ex.hints) <= 3, path.name)
            self.assertTrue(ex.statement and ex.solution, path.name)
            self.assertGreaterEqual(len(ex.typical_errors), 1)
            for category, text in ex.typical_errors:
                self.assertIn(category, ERROR_CATEGORIES)
                self.assertTrue(text)
            self.assertFalse(ex.rubric[0].startswith("- ["))
            self.assertGreater(ex.minutes, 0)

    def test_first_math_exercise_details(self):
        ex = _load(next(MATH_EXERCISES.glob("1.10-E01*.md")))
        self.assertEqual(ex.title, "Suma de los primeros impares")
        self.assertEqual(ex.mode, "prove")
        self.assertEqual(len(ex.hints), 3)
        self.assertTrue(ex.hints[1].startswith("El término nuevo"))
        self.assertEqual(ex.rubric[0], "Enuncia $P(n)$ explícitamente.")
        self.assertEqual(ex.typical_errors[0][0], "procedural")
        self.assertEqual(parse_timer(ex.timer, ex.minutes, MODES[ex.mode].timer),
                         TimerSpec("countdown", 600, 0))

    def test_sample_notes(self):
        expected = {
            "P-DRILL-01": ("drill", "math_drill", "02"),
            "P-PY-06-E01": ("debug", "python", "06"),
            "P-SQL-07-E01": ("implement", "sql", "07"),
            "P-GIT-07-E01": ("commands", "git", "07"),
            "P-EN-GR-E01": ("rewrite", "english_grammar", "01"),
        }
        self.assertEqual(len(list(SAMPLES.glob("*.md"))), len(expected))
        for prefix, (mode, discipline, skill) in expected.items():
            ex = _sample(prefix)
            self.assertEqual((ex.mode, ex.discipline, ex.skill), (mode, discipline, skill), prefix)
            self.assertIsNotNone(skill_of(DISCIPLINES[discipline], skill))
            self.assertIn(mode, DISCIPLINES[discipline].modes)
            self.assertTrue(ex.statement, prefix)
            if mode == "drill":
                continue
            self.assertEqual(len(ex.rubric), 5, prefix)
            self.assertTrue(1 <= len(ex.hints) <= 3, prefix)
            self.assertTrue(ex.solution, prefix)
            self.assertTrue(ex.typical_errors, prefix)
            for category, _ in ex.typical_errors:
                self.assertIn(category, ERROR_CATEGORIES, prefix)

    def test_sample_specifics(self):
        drill = _sample("P-DRILL-01")
        self.assertEqual((drill.drill, drill.items), ("fractions", 15))
        self.assertEqual(parse_timer(drill.timer, drill.minutes, "stopwatch"),
                         TimerSpec("countdown", 300, 0))
        py = _sample("P-PY-06-E01")
        self.assertEqual(py.code_lang, "python")
        self.assertTrue(25 <= len(py.code.splitlines()) <= 40)
        self.assertNotIn("```", py.code)
        self.assertIn("except Exception", py.code)
        self.assertTrue(py.mastery_signal)
        self.assertEqual(len(py.hints), 3)
        self.assertTrue(_sample("P-SQL-07-E01").mastery_signal)
        self.assertTrue(_sample("P-GIT-07-E01").mastery_signal)
        english = _sample("P-EN-GR-E01")
        self.assertEqual(english.level, "B1")
        self.assertEqual(english.subject, "english")

    def test_is_practice_frontmatter(self):
        self.assertTrue(is_practice_frontmatter({"type": "exercise"}))
        self.assertTrue(is_practice_frontmatter({"type": " Exercise "}))
        self.assertFalse(is_practice_frontmatter({"type": "concept"}))
        self.assertFalse(is_practice_frontmatter({}))
        self.assertFalse(is_practice_frontmatter(None))

    def test_aliases_bullets_fences_and_fallbacks(self):
        text = (
            "---\ntype: exercise\nsubject: programming\nskill: 6\nassistance: nohelp\n---\n\n"
            "# Fix the parser\n\n"
            "## Statement\nFind the bug.\n\n"
            "## Code\n```js\n## not a heading\nconst x = 1;\n```\n\n"
            "## Hints\n- first hint\n  continues here\n2. second hint\n\n"
            "## Rubric\n- [x] (2) one\n- [ ] two\n\n"
            "## Typical errors\n- **Logical** : wrong order\n- plain bullet\n\n"
            "## Mastery signal\nprints 1\n"
        )
        ex = parse_exercise(text, Path("vault/My exercise.md"))
        self.assertEqual(ex.title, "Fix the parser")
        self.assertEqual(ex.note_id, "My exercise")
        self.assertEqual(ex.skill, "06")
        self.assertEqual(ex.discipline, "programming_logic")
        self.assertEqual(ex.assistance, "nohelp")
        self.assertEqual((ex.difficulty, ex.minutes, ex.items), (2, 0, 20))
        self.assertEqual(ex.code_lang, "js")
        self.assertEqual(ex.code, "## not a heading\nconst x = 1;")
        self.assertEqual(ex.hints, ["first hint\ncontinues here", "second hint"])
        self.assertEqual(ex.rubric, ["one", "two"])
        self.assertEqual(ex.typical_errors, [("logical", "wrong order"), ("", "plain bullet")])
        self.assertEqual(ex.mastery_signal, "prints 1")

    def test_note_without_frontmatter_or_sections(self):
        ex = parse_exercise("just text")
        self.assertEqual((ex.note_id, ex.title, ex.subject, ex.mode), ("", "", "general", "solve"))
        self.assertEqual((ex.hints, ex.rubric, ex.path), ([], [], None))


class TestTimer(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_timer("pomodoro"), TimerSpec("pomodoro", 1500, 300))
        for value in ("8m", "8 min", "8", 8, "8 minutos"):
            self.assertEqual(parse_timer(value), TimerSpec("countdown", 480, 0), value)
        self.assertEqual(parse_timer("off").kind, "off")
        self.assertEqual(parse_timer(False).kind, "off")
        self.assertEqual(parse_timer("stopwatch").kind, "stopwatch")

    def test_priority(self):
        self.assertEqual(parse_timer("10m", minutes=30, default="pomodoro").seconds, 600)
        self.assertEqual(parse_timer("", minutes=30, default="pomodoro"),
                         TimerSpec("countdown", 1800, 0))
        self.assertEqual(parse_timer(None, default="pomodoro").kind, "pomodoro")
        self.assertEqual(parse_timer("garbage", default="15m").seconds, 900)
        self.assertEqual(parse_timer(None), TimerSpec("stopwatch", 0, 0))
        self.assertEqual(parse_timer("0m", default="nonsense").kind, "stopwatch")


class TestGrading(unittest.TestCase):
    REPLY = {"score": 80, "verdict": "partial", "rubric": [True, True, False, True, True],
             "errors": [{"category": "logical", "anchor": "", "description": "Circular.",
                         "evidence": "assume P(k+1)", "fix": "Start from P(k)."}],
             "feedback": "Casi.", "next_step": "¿Qué supones?", "example": "P(k) => P(k+1)"}

    def test_messages(self):
        ex = _sample("P-PY-06-E01")
        errors = [{"category": "logical", "anchor": "catches the wrong exception type",
                   "description_en": "Caught ValueError only.", "repeat_count": 2}] * 20
        messages = build_grading_messages(ex, "my answer", hints_used=1, seconds=125,
                                          solution_seen=False, recent_errors=errors)
        self.assertEqual([m["role"] for m in messages], ["system", "user"])
        system, user = messages[0]["content"], messages[1]["content"]
        self.assertIn("never execute", system)
        self.assertIn("except Exception swallows real bugs", system)
        self.assertIn("hypothesis", system)
        self.assertIn("automation task", system)
        self.assertIn('"verdict"', system)
        self.assertIn("my answer", user)
        self.assertIn("def handle_payment_webhook", user)
        self.assertIn("for the judge only", user)
        self.assertIn("Hints used: 1 of 3", user)
        self.assertIn("2 min 5 s", user)
        self.assertEqual(user.count("[x2] logical"), 15)
        english = build_grading_messages(_sample("P-EN-GR-E01"), "x", hints_used=0, seconds=0,
                                         solution_seen=True, recent_errors=[])
        self.assertIn("CEFR level: B1", english[0]["content"])
        self.assertIn("seen before answering: yes", english[1]["content"])

    def test_parse_raw_fenced_embedded(self):
        raw = json.dumps(self.REPLY)
        fenced = "Here you go:\n```json\n" + raw + "\n```\nBye"
        embedded = "Sure! " + raw + " Hope it helps {not json}"
        for text in (raw, fenced, embedded):
            result = parse_grade_reply(text, 5)
            self.assertEqual(result.score, 80)
            self.assertEqual(result.verdict, "partial")
            self.assertEqual(result.rubric, [True, True, False, True, True])
            self.assertEqual(result.errors[0], GradeError("logical", "", "Circular.",
                                                          "assume P(k+1)", "Start from P(k)."))
            self.assertEqual(result.raw, text)

    def test_normalisation(self):
        reply = {"score": "140", "verdict": "Correcto", "rubric": [1, "no"],
                 "errors": [{"category": "weird"}, "plain text", 7]}
        result = parse_grade_reply(json.dumps(reply), 4)
        self.assertEqual((result.score, result.verdict), (100, "correct"))
        self.assertEqual(result.rubric, [True, False, False, False])
        self.assertEqual([e.category for e in result.errors], ["conceptual", "conceptual"])
        self.assertEqual(result.errors[1].description, "plain text")
        self.assertEqual(parse_grade_reply('{"score": -5, "rubric": [true, true, true]}', 2).rubric,
                         [True, True])
        self.assertEqual(parse_grade_reply('{"score": -5}', 0).score, 0)
        self.assertEqual(parse_grade_reply('{"score": 55}', 0).verdict, "partial")
        self.assertEqual(parse_grade_reply('{"score": 10}', 0).verdict, "incorrect")

    def test_garbage(self):
        for text in ("", "no json here", "[1, 2, 3]", "{broken"):
            with self.assertRaises(GradeParseError):
                parse_grade_reply(text, 5)

    def test_quality_table(self):
        table = [(95, 0, False, 5), (90, 0, False, 5), (89, 0, False, 4), (75, 0, False, 4),
                 (60, 0, False, 3), (40, 0, False, 2), (20, 0, False, 1), (19, 0, False, 0),
                 (95, 1, False, 5), (95, 2, False, 4), (95, 0, True, 2), (95, 3, True, 2),
                 (60, 2, True, 2), (10, 2, False, 0)]
        for score, hints, seen, quality in table:
            self.assertEqual(quality_from(_result(score), hints, seen), quality,
                             (score, hints, seen))


class TestAttempts(TempVaultCase):
    def test_round_trip(self):
        ex = _sample("P-SQL-07-E01")
        store = PracticeAttemptStore(self.vault)
        self.assertEqual(store.draft(ex.note_id), "")
        self.assertEqual(store.attempts(ex.note_id), [])
        store.save_draft(ex.note_id, "practice/sql.md", "WITH new_event AS (")
        self.assertEqual(store.draft(ex.note_id), "WITH new_event AS (")
        key = attempt_key(ex.note_id)
        self.assertRegex(key, r"^att_[0-9a-f]{12}$")
        path = self.vault / vault_format.LAYOUT["study_attempt"].format(id=key)
        self.assertTrue(path.exists())

        attempt = store.record(ex, "practice/sql.md", answer="SELECT 1", hints_used=2,
                               seconds=300, solution_seen=False, transport="http",
                               result=_result(errors=[GradeError("logical", "a", "b", "c", "d")]),
                               quality=3)
        self.assertEqual(attempt["score"], 70)
        self.assertEqual(attempt["mode"], "implement")
        self.assertEqual(attempt["errors"][0]["category"], "logical")
        store.record(ex, "practice/sql.md", answer="x", hints_used=0, seconds=10,
                     solution_seen=True, transport="handoff", result=None, quality=0)
        data = store.load(ex.note_id)
        self.assertEqual(data["draft"], "")
        self.assertEqual(data["note_path"], "practice/sql.md")
        self.assertEqual(len(data["attempts"]), 2)
        self.assertEqual(data["attempts"][1]["verdict"], "ungraded")
        on_disk = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(on_disk["note_id"], ex.note_id)
        self.assertEqual(len(on_disk["attempts"]), 2)


class TestErrors(TempVaultCase):
    def test_repeat_detection(self):
        mgr = StudyErrorManager(self.vault)
        kwargs = dict(discipline="python", skill="06", mode="debug",
                      anchor="except Exception swallows real bugs")
        first = mgr.record_error("implementation", "programming", "06", "except Exception",
                                 description_en="Swallows errors.", note_id="n1", **kwargs)
        second = mgr.record_error("logical", "programming", "06", "except Exception:",
                                  description_en="Still swallows.", note_id="n2", **kwargs)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["repeat_count"], 2)
        self.assertEqual(second["note_id"], "n2")
        self.assertEqual(second["description_en"], "Still swallows.")
        self.assertEqual(len(mgr.errors()), 1)

        other_skill = mgr.record_error("implementation", "programming", "07", "x",
                                       **{**kwargs, "skill": "07"})
        self.assertNotEqual(other_skill["id"], first["id"])
        mgr.mark_resolved(first["id"])
        again = mgr.record_error("implementation", "programming", "06", "x", **kwargs)
        self.assertNotEqual(again["id"], first["id"])
        self.assertEqual(again["repeat_count"], 1)
        self.assertEqual(len(mgr.errors()), 3)

    def test_without_anchor_category_decides(self):
        mgr = StudyErrorManager(self.vault)
        a = mgr.record_error("calculation", "mathematics", "02", "1/2+1/3=2/5",
                             discipline="math_drill", skill="02")
        b = mgr.record_error("calculation", "mathematics", "02", "3/4+1/4=4/8",
                             discipline="math_drill", skill="02")
        c = mgr.record_error("procedural", "mathematics", "02", "x",
                             discipline="math_drill", skill="02")
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(b["wrong_answer"], "3/4+1/4=4/8")
        self.assertNotEqual(a["id"], c["id"])

    def test_legacy_records_keep_new_fields_empty(self):
        err = StudyErrorManager(self.vault).record_error("grammar", "english", "tenses", "I go")
        for key in ("discipline", "skill", "mode", "anchor", "description_en", "fix_en",
                    "note_id"):
            self.assertEqual(err[key], "")
        self.assertEqual(err["last_seen"], err["occurred_at"])

    def test_record_grade_errors_recent_and_digest(self):
        ex = _sample("P-PY-06-E01")
        result = _result(errors=[
            GradeError("implementation", "except Exception swallows real bugs",
                       "The handler answers 200 on failures", "return 200, \"ok\"",
                       "Return 500 and log the traceback"),
            GradeError("logical", "", "Range not validated.", "", "Check amount > 0."),
        ])
        record_grade_errors(self.vault, ex, result, "answer")
        record_grade_errors(self.vault, ex, result, "answer")
        StudyErrorManager(self.vault).record_error("grammar", "english", "tenses", "I go")

        recent = recent_errors(self.vault, "programming")
        self.assertEqual(len(recent), 2)
        self.assertTrue(all(e["repeat_count"] == 2 for e in recent))
        self.assertEqual(recent_errors(self.vault, "programming", limit=1)[0]["subject"],
                         "programming")
        logical = next(e for e in recent if e["category"] == "logical")
        self.assertEqual(logical["wrong_answer"], "answer")

        path = write_error_digest(self.vault)
        self.assertEqual(path, self.vault / vault_format.LAYOUT["study_error_digest"])
        text = path.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("# NoteVault learner error log\nGenerated "))
        self.assertIn("## programming", text)
        self.assertIn("## english", text)
        self.assertLess(text.index("## programming"), text.index("## english"))
        self.assertIn('- [x2] implementation · python · anchor: "except Exception swallows '
                      'real bugs" — The handler answers 200 on failures. Fix: Return 500 and '
                      'log the traceback. Last seen ', text)
        self.assertIn(f"in {ex.note_id}.", text)
        self.assertIn("- [x1] grammar", text)

    def test_empty_digest(self):
        text = write_error_digest(self.vault).read_text(encoding="utf-8")
        self.assertIn("No unresolved errors.", text)


class TestApplyResult(TempVaultCase):
    def test_pipeline(self):
        ex = _load(next(MATH_EXERCISES.glob("1.10-E01*.md")))
        result = _result(score=80, errors=[GradeError("logical", "assumes the conclusion in "
                                                      "the inductive step (circular reasoning)",
                                                      "Circular.", "", "Start from P(k).")])
        attempt = apply_result(self.vault, ex, "Mat/E01.md", answer="proof", hints_used=1,
                               seconds=600, solution_seen=False, transport="http",
                               result=result)
        self.assertEqual((attempt["score"], attempt["quality"]), (80, 4))
        self.assertEqual(len(PracticeAttemptStore(self.vault).attempts(ex.note_id)), 1)
        self.assertEqual(len(StudyErrorManager(self.vault).errors()), 1)
        self.assertIn("## mathematics", (self.vault / vault_format.LAYOUT["study_error_digest"])
                      .read_text(encoding="utf-8"))
        items = StudySRSManager(self.vault).all_items()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["entity_id"], ex.note_id)
        self.assertEqual(items[0]["entity_type"], "exercise")
        self.assertEqual(items[0]["topic"], "math_general")
        self.assertEqual(items[0]["repetitions"], 1)
        self.assertEqual(items[0]["history"][0]["grade"], 4)

        apply_result(self.vault, ex, "Mat/E01.md", answer="proof 2", hints_used=0,
                     seconds=300, solution_seen=False, transport="bridge",
                     result=_result(score=95))
        items = StudySRSManager(self.vault).all_items()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["repetitions"], 2)


class TestHandoff(TempVaultCase):
    def test_write_read_close(self):
        self.assertEqual(handoff.pending_requests(self.vault), [])
        req_id = handoff.new_request_id()
        self.assertRegex(req_id, r"^req_\d{14}_[0-9a-f]{6}$")
        messages = [{"role": "system", "content": "judge"}, {"role": "user", "content": "answer"}]
        req_id = handoff.write_request(self.vault, "grade", messages,
                                       {"note_id": "n1", "note_path": "a/b.md", "extra": 1})
        req = self.vault / vault_format.LAYOUT["study_handoff_request"].format(id=req_id)
        data = json.loads(req.read_text(encoding="utf-8"))
        self.assertEqual(data["id"], req_id)
        self.assertEqual(data["kind"], "grade")
        self.assertEqual(data["note_id"], "n1")
        self.assertEqual(data["messages"], messages)
        self.assertEqual(data["response_file"], f"responses/{req_id}.json")
        self.assertEqual(data["extra"], 1)
        prompt = req.with_suffix(".md").read_text(encoding="utf-8")
        self.assertIn("judge", prompt)
        self.assertIn(vault_format.LAYOUT["study_handoff_response"].format(id=req_id), prompt)
        self.assertIn('"verdict"', prompt)
        self.assertEqual(handoff.pending_requests(self.vault), [req_id])

        self.assertIsNone(handoff.read_response(self.vault, req_id))
        resp = handoff.response_path(self.vault, req_id)
        self.assertTrue(resp.parent.is_dir())
        resp.write_text("   ", encoding="utf-8")
        self.assertIsNone(handoff.read_response(self.vault, req_id))
        resp.write_text('{"score": 90}', encoding="utf-8")
        self.assertEqual(parse_grade_reply(handoff.read_response(self.vault, req_id), 0).score,
                         90)

        handoff.close_request(self.vault, req_id)
        self.assertFalse(req.exists())
        self.assertTrue((req.parent / "done" / req.name).exists())
        self.assertTrue((req.parent / "done" / (req_id + ".md")).exists())
        self.assertEqual(handoff.pending_requests(self.vault), [])
        handoff.close_request(self.vault, req_id)

    def test_markdown_response_accepted(self):
        req_id = handoff.write_request(self.vault, "generate", [], {})
        md = handoff.response_path(self.vault, req_id).with_suffix(".md")
        md.write_text("Result:\n```json\n{\"score\": 50}\n```\n", encoding="utf-8")
        self.assertEqual(parse_grade_reply(handoff.read_response(self.vault, req_id), 0).score,
                         50)


class TestDrills(unittest.TestCase):
    def test_generate_and_check_every_kind(self):
        for kind in drills.DRILL_KINDS:
            for difficulty in range(1, 6):
                items = drills.generate(kind, 25, difficulty, seed=difficulty)
                self.assertEqual(len(items), 25)
                for item in items:
                    self.assertEqual(item.kind, kind)
                    self.assertTrue(drills.check(item, item.answer), item)
                    self.assertFalse(drills.check(item, ""), item)
            self.assertEqual(drills.generate(kind, 5, 3, seed=7),
                             drills.generate(kind, 5, 3, seed=7))
        with self.assertRaises(ValueError):
            drills.generate("logarithms", 3)

    def test_wrong_answers_rejected(self):
        for kind in ("arithmetic", "fractions", "powers", "percent"):
            for item in drills.generate(kind, 20, 3, seed=1):
                wrong = str(Fraction(item.answer) + 1)
                self.assertFalse(drills.check(item, wrong), item)
        for item in drills.generate("derivatives", 20, 3, seed=1):
            self.assertFalse(drills.check(item, item.answer + " + 1"), item)

    def test_equivalent_answers(self):
        half = drills.DrillItem("1/4 + 1/4", "1/2", "fractions")
        for given in ("1/2", "2/4", " 3/6 ", "0.5", "0,5"):
            self.assertTrue(drills.check(half, given), given)
        self.assertFalse(drills.check(half, "1/3"))
        self.assertFalse(drills.check(half, "1/0"))
        pct = drills.DrillItem("15 % de 775", "116.25", "percent")
        self.assertTrue(drills.check(pct, "116,25"))
        self.assertTrue(drills.check(pct, "116.250"))
        neg = drills.DrillItem("24 - 39", "-15", "arithmetic")
        self.assertTrue(drills.check(neg, "−15"))
        deriv = drills.DrillItem("d/dx (2x^3)", "6x^2", "derivatives")
        for given in ("6x^2", "6*x**2", "6 x^2", "6X^2", "3x*2x", "6x^2 + 0", "(2x)(3x)"):
            self.assertTrue(drills.check(deriv, given), given)
        for given in ("6x^3", "6x", "x^2", "6y^2", "__import__('os')", "2**2**2**2**2",
                      "6x^2)", "x.real", "[6]"):
            self.assertFalse(drills.check(deriv, given), given)

    def test_summarize(self):
        items = drills.generate("fractions", 4, 2, seed=3)
        results = [(items[0], items[0].answer, True, 3.0),
                   (items[1], items[1].answer, True, 4.0),
                   (items[2], "7/9", False, 5.0),
                   (items[3], "", False, 8.0)]
        grade = drills.summarize(results)
        self.assertEqual(grade.score, 50)
        self.assertEqual(grade.verdict, "partial")
        self.assertEqual(grade.rubric, [True, True, False, False])
        self.assertEqual(len(grade.errors), 2)
        self.assertEqual(grade.errors[0].category, "calculation")
        self.assertEqual(grade.errors[0].description,
                         f"fractions: expected {items[2].answer}, got 7/9")
        self.assertIn("2/4 correctas en 20 s", grade.feedback)
        self.assertIn(items[2].answer, grade.example)
        perfect = drills.summarize([(items[0], items[0].answer, True, 2.0)])
        self.assertEqual((perfect.score, perfect.verdict, perfect.errors), (100, "correct", []))
        self.assertEqual(drills.summarize([]).score, 0)


class TestVaultKeys(unittest.TestCase):
    def test_practice_keys(self):
        expected = {
            "study_attempts_dir": ".notevault/estudio/intentos",
            "study_attempt": ".notevault/estudio/intentos/{id}.json",
            "study_error_digest": ".notevault/estudio/errores/ERROR_LOG.md",
            "study_handoff_dir": ".notevault/estudio/handoff",
            "study_handoff_request": ".notevault/estudio/handoff/requests/{id}.json",
            "study_handoff_response": ".notevault/estudio/handoff/responses/{id}.json",
            "study_ledger_dir": ".notevault/estudio/ledger",
            "study_ledger": ".notevault/estudio/ledger/{id}.json",
        }
        for key, path in expected.items():
            self.assertEqual(vault_format.LAYOUT[key], path)


if __name__ == "__main__":
    unittest.main()

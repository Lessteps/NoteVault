"""The knowledge-base validator accepts the reference concept and catches the
mistakes an author (Antigravity) is likely to make."""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from check_kb_notes import Checker, load_syllabus, DEFAULT_SYLLABUS  # noqa: E402

EXAMPLE = ROOT / "docs" / "knowledge_base" / "examples" / "Matemáticas"
CONCEPT = "1 Lógica y demostración/1.10 Inducción matemática"


def _check(root: Path) -> Checker:
    c = Checker(root, load_syllabus(DEFAULT_SYLLABUS))
    c.run()
    return c


class TestReferenceConcept(unittest.TestCase):
    def test_reference_example_has_no_errors(self):
        c = _check(EXAMPLE)
        self.assertEqual(c.errors, [])

    def test_syllabus_has_all_areas_and_unique_ids(self):
        rows = load_syllabus(DEFAULT_SYLLABUS)
        self.assertGreaterEqual(len(rows), 100)
        ids = [r["id"] for r in rows.values()]
        self.assertEqual(len(ids), len(set(ids)))
        for num, row in rows.items():
            for pre in row["prereqs"]:
                self.assertIn(pre, rows, f"{num} lists unknown prerequisite {pre}")


class TestMistakesAreCaught(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(EXAMPLE, self.tmp / "Matemáticas")
        self.root = self.tmp / "Matemáticas"
        self.folder = self.root / CONCEPT

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _edit(self, rel: str, old: str, new: str):
        p = self.folder / rel
        text = p.read_text(encoding="utf-8")
        self.assertIn(old, text)
        p.write_text(text.replace(old, new, 1), encoding="utf-8")

    def _errors(self) -> str:
        return "\n".join(_check(self.root).errors)

    def test_missing_card_answer(self):
        self._edit("1.10 Inducción matemática.md", "**R:** Si $P(n_0)$", "Si $P(n_0)$")
        self.assertIn("card T1 needs", self._errors())

    def test_unbalanced_math(self):
        self._edit("1.10 Inducción matemática.md", "$P(n)$: la afirmación", "$P(n): la afirmación")
        self.assertIn("unbalanced $", self._errors())

    def test_unquoted_number(self):
        self._edit("1.10 Inducción matemática.md", 'number: "1.10"', "number: 1.10")
        self.assertIn("number must be quoted", self._errors())

    def test_proof_step_without_reason(self):
        self._edit("Demostraciones/1.10-T02 Desigualdad de Bernoulli.md",
                   "   **Por qué:** hipótesis inductiva para un $k$ arbitrario.\n", "")
        self.assertIn("needs an indented '**Por qué:**", self._errors())

    def test_hypothesis_without_counterexample(self):
        self._edit("Demostraciones/1.10-T02 Desigualdad de Bernoulli.md", "- **Sin H2:**", "- Sin la segunda:")
        self.assertIn("Sin H2", self._errors())

    def test_rubric_must_have_five_points(self):
        self._edit("Ejercicios/1.10-E01 Suma de los primeros impares.md",
                   "- [ ] (1) Comprueba el caso base $n=1$.\n", "")
        self.assertIn("exactly 5", self._errors())

    def test_missing_exercise_breaks_mix_and_practice_links(self):
        (self.folder / "Ejercicios" / "1.10-E06 Sellos de 4 y 5.md").unlink()
        errors = self._errors()
        self.assertIn("difficulty mix", errors)
        self.assertIn("no such file", errors)

    def test_missing_prerequisite_connection(self):
        self._edit("1.10 Inducción matemática.md",
                   "- **Requiere** [[1.5 Demostración directa]] — el paso inductivo es una prueba directa\n", "")
        self.assertIn("[[1.5 Demostración directa]]", self._errors())

    def test_title_must_match_syllabus(self):
        old = self.folder / "1.10 Inducción matemática.md"
        text = old.read_text(encoding="utf-8").replace("title: Inducción matemática", "title: Inducción")
        old.write_text(text, encoding="utf-8")
        self.assertIn("title must be 'Inducción matemática'", self._errors())


if __name__ == "__main__":
    unittest.main()

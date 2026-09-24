"""Tests for knowledge-base canvas generator (tools/kb_canvas.py).

Validates:
  - Structure parsing from SYLLABUS_MATH.md
  - Node counts and column composition for reference concept 1.10
  - All edges have non-empty labels
  - No two leaf nodes overlap
  - Every file node points to an existing file
  - Every group bounds all its members
  - Regeneration safety via manifest (.nuevo.canvas on user edits)
"""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core import canvas_format as cf
from tools import kb_canvas

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_MATH = ROOT / "docs" / "knowledge_base" / "examples" / "Matemáticas"
DEFAULT_SYLLABUS = ROOT / "docs" / "knowledge_base" / "SYLLABUS_MATH.md"


class TestKbCanvas(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="nv_kb_canvas_test_"))
        self.vault = self.tmp / "vault"
        self.vault.mkdir()
        (self.vault / ".notevault").mkdir()

        # Copy reference concept 1.10 into temp vault
        dest_math = self.vault / "Matemáticas"
        shutil.copytree(EXAMPLES_MATH, dest_math)

        # Create dummy notes for prerequisites 1.4 and 1.5 so file cards resolve
        area1 = dest_math / "1 Lógica y demostración"
        p14 = area1 / "1.4 Cuantificadores y su negación"
        p14.mkdir(parents=True, exist_ok=True)
        (p14 / "1.4 Cuantificadores y su negación.md").write_text(
            "---\nid: mat.logica.cuantificadores\ntitle: Cuantificadores y su negación\nnumber: \"1.4\"\nsubject: mathematics\ntype: concept\n---\n# 1.4 Cuantificadores y su negación\n",
            encoding="utf-8",
        )

        p15 = area1 / "1.5 Demostración directa"
        p15.mkdir(parents=True, exist_ok=True)
        (p15 / "1.5 Demostración directa.md").write_text(
            "---\nid: mat.logica.demostracion-directa\ntitle: Demostración directa\nnumber: \"1.5\"\nsubject: mathematics\ntype: concept\n---\n# 1.5 Demostración directa\n",
            encoding="utf-8",
        )

        self.c110_dir = area1 / "1.10 Inducción matemática"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_load_structure(self):
        blocks = kb_canvas.load_structure(DEFAULT_SYLLABUS)
        self.assertEqual(len(blocks), 6)
        total_concepts = sum(len(a["concepts"]) for b in blocks for a in b["areas"])
        self.assertEqual(total_concepts, 110)

    def test_reference_concept_1_10_canvas(self):
        c = kb_canvas.read_concept(self.c110_dir)
        doc = kb_canvas.build_concept_canvas(c, self.vault)

        groups = {n.label: n for n in doc.nodes if n.type == "group"}
        leaves = [n for n in doc.nodes if n.type != "group"]

        # A = 2 file cards in Requiere
        self.assertIn("Requiere", groups)
        req_leaves = [
            n for n in leaves
            if groups["Requiere"].x <= n.x <= groups["Requiere"].x + groups["Requiere"].width
            and groups["Requiere"].y <= n.y <= groups["Requiere"].y + groups["Requiere"].height
        ]
        self.assertEqual(len(req_leaves), 2)
        for n in req_leaves:
            self.assertEqual(n.type, "file")

        # B = 4 cards in Concepto
        self.assertIn("1.10 Inducción matemática", groups)
        b_group = groups["1.10 Inducción matemática"]
        b_leaves = [
            n for n in leaves
            if b_group.x <= n.x <= b_group.x + b_group.width
            and b_group.y <= n.y <= b_group.y + b_group.height
        ]
        self.assertEqual(len(b_leaves), 4)

        # C = 3 ejemplos + 3 no-ejemplos
        self.assertIn("Ejemplos", groups)
        self.assertIn("No-ejemplos", groups)
        ex_leaves = [
            n for n in leaves
            if groups["Ejemplos"].x <= n.x <= groups["Ejemplos"].x + groups["Ejemplos"].width
            and groups["Ejemplos"].y <= n.y <= groups["Ejemplos"].y + groups["Ejemplos"].height
        ]
        noex_leaves = [
            n for n in leaves
            if groups["No-ejemplos"].x <= n.x <= groups["No-ejemplos"].x + groups["No-ejemplos"].width
            and groups["No-ejemplos"].y <= n.y <= groups["No-ejemplos"].y + groups["No-ejemplos"].height
        ]
        self.assertEqual(len(ex_leaves), 3)
        self.assertEqual(len(noex_leaves), 3)

        # D = 2 theorem groups: T01 (1+1+1+6+1 = 10) and T02 (1+1+2+6+1 = 11)
        self.assertIn("T01 — Suma de los primeros n naturales", groups)
        self.assertIn("T02 — Desigualdad de Bernoulli", groups)
        t01_group = groups["T01 — Suma de los primeros n naturales"]
        t02_group = groups["T02 — Desigualdad de Bernoulli"]
        t01_leaves = [
            n for n in leaves
            if t01_group.x <= n.x <= t01_group.x + t01_group.width
            and t01_group.y <= n.y <= t01_group.y + t01_group.height
        ]
        t02_leaves = [
            n for n in leaves
            if t02_group.x <= n.x <= t02_group.x + t02_group.width
            and t02_group.y <= n.y <= t02_group.y + t02_group.height
        ]
        self.assertEqual(len(t01_leaves), 10)
        self.assertEqual(len(t02_leaves), 11)

        # E = 5 error cards
        self.assertIn("Errores comunes", groups)
        e_leaves = [
            n for n in leaves
            if groups["Errores comunes"].x <= n.x <= groups["Errores comunes"].x + groups["Errores comunes"].width
            and groups["Errores comunes"].y <= n.y <= groups["Errores comunes"].y + groups["Errores comunes"].height
        ]
        self.assertEqual(len(e_leaves), 5)

        # F = 7 exercise file cards + 3 Se-usa-en cards (text cards pending)
        self.assertIn("Práctica", groups)
        self.assertIn("Se usa en", groups)
        prac_leaves = [
            n for n in leaves
            if groups["Práctica"].x <= n.x <= groups["Práctica"].x + groups["Práctica"].width
            and groups["Práctica"].y <= n.y <= groups["Práctica"].y + groups["Práctica"].height
        ]
        se_usa_leaves = [
            n for n in leaves
            if groups["Se usa en"].x <= n.x <= groups["Se usa en"].x + groups["Se usa en"].width
            and groups["Se usa en"].y <= n.y <= groups["Se usa en"].y + groups["Se usa en"].height
        ]
        self.assertEqual(len(prac_leaves), 7)
        for n in prac_leaves:
            self.assertEqual(n.type, "file")
        self.assertEqual(len(se_usa_leaves), 3)
        for n in se_usa_leaves:
            self.assertEqual(n.type, "text")

        # Every edge has a non-empty label
        self.assertGreater(len(doc.edges), 0)
        for edge in doc.edges:
            self.assertTrue(bool(edge.label and edge.label.strip()), f"Edge {edge.id} has empty label")

        # Every file node points to an existing file
        file_nodes = [n for n in leaves if n.type == "file"]
        for fn in file_nodes:
            target_file = self.vault / fn.file
            self.assertTrue(target_file.exists(), f"File node target {fn.file} does not exist")

        # No two leaf nodes overlap
        for i in range(len(leaves)):
            for j in range(i + 1, len(leaves)):
                a, b = leaves[i], leaves[j]
                overlap = not (
                    a.x + a.width <= b.x
                    or b.x + b.width <= a.x
                    or a.y + a.height <= b.y
                    or b.y + b.height <= a.y
                )
                self.assertFalse(overlap, f"Overlap between node {a.id} ({a.text[:20] if a.text else a.file}) and node {b.id} ({b.text[:20] if b.text else b.file})")

    def test_regeneration_safety_manifest(self):
        c = kb_canvas.read_concept(self.c110_dir)
        doc = kb_canvas.build_concept_canvas(c, self.vault)
        canvas_path = self.c110_dir / f"{c.number} {c.title} — mapa.canvas"

        # 1. First write creates canvas file
        p1 = kb_canvas.write_generated(canvas_path, doc, self.vault)
        self.assertEqual(p1, canvas_path)
        self.assertTrue(canvas_path.exists())

        # 2. Writing identical/unchanged canvas keeps file without .nuevo.canvas
        p2 = kb_canvas.write_generated(canvas_path, doc, self.vault)
        self.assertEqual(p2, canvas_path)
        nuevo_file = self.c110_dir / f"{canvas_path.stem}.nuevo.canvas"
        self.assertFalse(nuevo_file.exists())

        # 3. Simulate user edit on canvas file
        raw = json.loads(canvas_path.read_text(encoding="utf-8"))
        raw["nodes"][0]["text"] = "User edited this card manually"
        canvas_path.write_text(json.dumps(raw), encoding="utf-8")

        # 4. Regenerating now must write to .nuevo.canvas and preserve user edits
        p3 = kb_canvas.write_generated(canvas_path, doc, self.vault)
        self.assertEqual(p3, nuevo_file)
        self.assertTrue(nuevo_file.exists())
        # Check original file preserved user edit
        user_content = json.loads(canvas_path.read_text(encoding="utf-8"))
        self.assertEqual(user_content["nodes"][0]["text"], "User edited this card manually")


if __name__ == "__main__":
    unittest.main()

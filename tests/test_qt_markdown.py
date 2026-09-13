"""
Round-trip tests for the rich editor's markdown serialiser.

Opening a note in the Editor and letting it autosave runs
setMarkdown() -> document_to_markdown(). Anything lost on that trip is
deleted from the user's file, so each construct the importer understands is
asserted to come back out, and to be stable on a second pass.
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PySide6.QtWidgets import QApplication                      # noqa: E402
from PySide6.QtGui import QTextDocument                          # noqa: E402

from notevault_app.core.qt_markdown import (                     # noqa: E402
    document_to_markdown, prepare_markdown, format_markdown_tables,
    display_width, new_table, prepare_for_reading, toggle_task,
)

APP = QApplication.instance() or QApplication(sys.argv)


def roundtrip(markdown: str) -> str:
    doc = QTextDocument()
    doc.setMarkdown(prepare_markdown(markdown))
    return document_to_markdown(doc)


class StableCase(unittest.TestCase):
    def assertStable(self, markdown: str, expected: str = None):
        once = roundtrip(markdown)
        if expected is not None:
            self.assertEqual(once, expected)
        self.assertEqual(roundtrip(once), once, "la segunda pasada cambió el texto")


class TestChecklists(StableCase):
    def test_nested_checklist_keeps_state_and_depth(self):
        md = (
            "- [ ] Sesion de Estudio Frontend\n"
            "    - [ ] Bloque 0 — El navegador\n"
            "        - [x] 0.1 El navegador como runtime\n"
            "            - [ ] Recomendación: recordar\n"
            "        - [ ] 0.2 Lógica sensible\n"
        )
        self.assertStable(md, md)

    def test_empty_checkbox_survives(self):
        self.assertStable("- [ ] \n- [x] hecho\n", "- [ ]\n- [x] hecho\n")


class TestLists(StableCase):
    def test_bullet_characters_are_kept(self):
        md = "* Subpaso 1.1\n    * Objetivo\n"
        self.assertStable(md, md)

    def test_ordered_list_nested_under_bullets(self):
        md = (
            "* Subpaso 1.1 — Extracción Léxica:\n"
            "   * 1.1.2 — Interrogación heurística por unidad.\n"
            "      * Operación: Aplicar las cuatro preguntas.\n"
            "         1. ¿Quién opera? \\rightarrow `Grupo Afectado`.\n"
            "         2. ¿Qué evento? \\rightarrow `Condición / Detonante`.\n"
        )
        out = roundtrip(md)
        self.assertIn("            1. ¿Quién opera? \\rightarrow `Grupo Afectado`.", out)
        self.assertIn("            2. ¿Qué evento?", out)
        self.assertIn("        * Operación:", out)
        self.assertEqual(roundtrip(out), out)


class TestTables(StableCase):
    def test_table_is_aligned_and_alignment_kept(self):
        md = "| Unidad | Cita |\n|:--|:-:|\n| U1 | **hola** |\n| U22 | adiós |\n"
        expected = (
            "| Unidad |   Cita   |\n"
            "| ------ | :------: |\n"
            "| U1     | **hola** |\n"
            "| U22    |  adiós   |\n"
        )
        self.assertStable(md, expected)

    def test_plain_separator_stays_plain(self):
        md = "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n"
        self.assertStable(md, md)

    def test_header_is_not_rebolded(self):
        out = roundtrip("| A | B |\n|---|---|\n| 1 | 2 |\n")
        self.assertNotIn("**", out)

    def test_pipe_inside_cell_is_escaped(self):
        self.assertStable("| a |\n|---|\n| x \\| y |\n")

    def test_line_break_inside_a_cell_stays_in_the_row(self):
        md = "| A | B |\n| --- | --- |\n| • uno<br>• dos | x |\n"
        out = roundtrip(md)
        self.assertEqual(len([l for l in out.splitlines() if l.startswith("|")]), 3, out)
        self.assertIn("• uno<br>• dos", out)
        self.assertEqual(roundtrip(out), out)

    def test_unknown_tag_does_not_swallow_the_rest(self):
        md = "- [x] cabecera Bearer <jwt>\n- [x] Paso 2\n\n# Título\n\n`a<b>` y List<String>\n"
        out = roundtrip(md)
        for piece in ("Bearer <jwt>", "Paso 2", "# Título", "`a<b>`", "List<String>"):
            self.assertIn(piece, out)
        self.assertEqual(roundtrip(out), out)

    def test_hard_break_keeps_every_line(self):
        out = roundtrip("**Módulo:** `web`  \n**Estado:** OK\n")
        self.assertIn("**Módulo:** `web`", out)
        self.assertIn("**Estado:** OK", out)

    def test_new_table_shape(self):
        lines = new_table(3, 2).split("\n")
        self.assertEqual(len(lines), 4)
        self.assertEqual(len({len(l) for l in lines}), 1)


class TestBlocks(StableCase):
    def test_fenced_code_keeps_language_and_lines(self):
        md = "```python\nprint(1)\n    x = 2\n```\n"
        self.assertStable(md, md)

    def test_quote_rule_heading_inline(self):
        md = "# Título\n\n> cita **fuerte**\n\n---\n\nTexto *cursiva* y ~~tachado~~\n"
        self.assertStable(md, md)


class TestImages(StableCase):
    def test_markdown_image(self):
        md = "![foto](attachments/img.png)\n"
        self.assertStable(md, md)

    def test_path_with_spaces(self):
        md = "![](<attachments/mi foto.png>)\n"
        self.assertStable(md, md)

    def test_obsidian_embed_keeps_its_syntax(self):
        md = "![[clip.mp4]]\n\n![[foto.png|300]]\n"
        self.assertStable(md, md)


class TestReading(unittest.TestCase):
    def test_wikilinks_become_links_but_embeds_do_not(self):
        out = prepare_for_reading("Ver [[Nota A|la nota]] y ![[foto.png]]")
        self.assertIn("[la nota](<nv-note:Nota A>)", out)
        self.assertIn("nv-embed:foto.png", out)

    def test_toggle_task_counts_in_order_and_skips_code(self):
        md = "- [ ] uno\n```\n- [ ] no\n```\n    - [x] dos\n1. [ ] tres\n"
        self.assertEqual(toggle_task(md, 1),
                         "- [ ] uno\n```\n- [ ] no\n```\n    - [ ] dos\n1. [ ] tres\n")
        self.assertEqual(toggle_task(md, 2),
                         "- [ ] uno\n```\n- [ ] no\n```\n    - [x] dos\n1. [x] tres\n")

    def test_task_order_matches_the_document(self):
        md = "- [ ] a\n    - [ ] b\n- [x] c\n"
        doc = QTextDocument()
        doc.setMarkdown(prepare_markdown(md))
        tasks, b = [], doc.begin()
        while b.isValid():
            if b.textList() is not None:
                tasks.append(b.text())
            b = b.next()
        self.assertEqual(tasks, ["a", "b", "c"])


class TestRawTables(unittest.TestCase):
    def test_raw_table_is_aligned(self):
        src = "intro\n|a|bb|\n|-|:-:|\n|ccc|d|\nfin"
        self.assertEqual(
            format_markdown_tables(src),
            "intro\n| a   | bb  |\n| --- | :-: |\n| ccc |  d  |\nfin",
        )

    def test_code_fences_are_left_alone(self):
        src = "```\n|a|b|\n|-|-|\n```"
        self.assertEqual(format_markdown_tables(src), src)

    def test_wide_glyphs_count_double(self):
        self.assertEqual(display_width("añ"), 2)
        self.assertEqual(display_width("日本"), 4)


if __name__ == "__main__":
    unittest.main()

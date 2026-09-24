"""LaTeX rendering shared by the practice view and the reading mode."""

import unittest

from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QTextDocument, QTextCharFormat

from notevault_app.ui.components.notes.note_view import NoteTextBrowser
from notevault_app.ui.components.notes.practice import math_render as mr

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


def _images(doc: QTextDocument):
    out = []
    block = doc.begin()
    while block.isValid():
        it = block.begin()
        while not it.atEnd():
            fmt = it.fragment().charFormat()
            if fmt.isImageFormat():
                out.append((block, fmt.toImageFormat()))
            it += 1
        block = block.next()
    return out


class FindMathTest(unittest.TestCase):
    def spans(self, text):
        return [(tex, display) for _, _, tex, display in mr.find_math(text)]

    def test_inline_and_display(self):
        self.assertEqual(self.spans(r"sea $n\ge1$: $$1+3 = n^2.$$"),
                         [(r"n\ge1", False), ("1+3 = n^2.", True)])

    def test_currency_is_not_math(self):
        self.assertEqual(self.spans("cuesta $5 y $10."), [])
        self.assertEqual(self.spans("entre $5 y $10 hay $x$"), [("x", False)])

    def test_escaped_dollar_and_spaces(self):
        self.assertEqual(self.spans(r"precio \$5 y $x^2$"), [("x^2", False)])
        self.assertEqual(self.spans("$ x$"), [])

    def test_math_does_not_cross_paragraphs(self):
        self.assertEqual(self.spans("$a\n\nb$"), [])

    def test_code_is_masked(self):
        md = "`$x$` y\n```\n$y$\n```\n$z$"
        self.assertEqual(self.spans(mr._mask_markdown(md)), [("z", False)])
        html = "<code>$x$</code> y <pre>$y$</pre> $z$"
        self.assertEqual(self.spans(mr._mask_html(html)), [("z", False)])

    def test_unary_minus_is_braced(self):
        self.assertEqual(mr._unary_signs(r"x \ge -1"), r"x \ge {-}1")
        self.assertEqual(mr._unary_signs("a - b"), "a - b")
        self.assertEqual(mr._unary_signs("(-1)^n"), "({-}1)^n")


class RenderTest(unittest.TestCase):
    def test_typeset_returns_images(self):
        f = mr.typeset(r"\sum_{i=1}^{n} i", font_px=15)
        self.assertIsNotNone(f)
        self.assertFalse(f.image.isNull())
        self.assertGreater(f.width, 10)
        self.assertGreaterEqual(f.height, f.label_height)

    def test_bad_formula_falls_back_to_source(self):
        self.assertIsNone(mr.typeset(r"\frac{a}{", font_px=15))
        out = mr.render_math(r"mal: $\frac{a}{$ fin")
        self.assertIn("<code", out)
        self.assertIn(r"$\frac{a}{$", out)

    def test_render_math_html(self):
        out = mr.render_math("con $n=1$ y &lt;code&gt; <code>$y$</code>, precio $5 y $10")
        self.assertEqual(out.count("<img"), 1)
        self.assertIn("data:image/png;base64,", out)
        self.assertIn("<code>$y$</code>", out)
        self.assertIn("$5 y $10", out)

    def test_display_in_html_is_centred(self):
        out = mr.render_math("a<br>$$x^2$$<br>b")
        self.assertIn('<div align="center">', out)
        self.assertNotIn("<br><div", out)

    def test_html_in_document_is_baseline_aligned(self):
        doc = QTextDocument()
        doc.setHtml(mr.render_math("texto $x^2$ texto"))
        mr.typeset_document(doc)
        imgs = _images(doc)
        self.assertEqual(len(imgs), 1)
        self.assertEqual(imgs[0][1].verticalAlignment(), QTextCharFormat.AlignBaseline)

    def test_markdown_document(self):
        md = "Sea $P(n)$ la afirmación:\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$\ny `$no$`."
        doc = QTextDocument()
        doc.setMarkdown(mr.markdown_with_math(md, font_px=15))
        mr.typeset_document(doc)
        imgs = _images(doc)
        self.assertEqual(len(imgs), 2)
        for _, fmt in imgs:
            self.assertTrue(fmt.name().startswith(mr.SCHEME))
            self.assertIsNotNone(mr.math_image(fmt.name()))
            self.assertEqual(fmt.verticalAlignment(), QTextCharFormat.AlignBaseline)
        display_block = imgs[1][0]
        self.assertTrue(display_block.blockFormat().alignment() & 0x4)  # AlignHCenter
        self.assertIn("$no$", doc.toPlainText())

    def test_reading_browser_renders_math(self):
        view = NoteTextBrowser()
        view.load_markdown("La suma $1+2$ vale $3$ y cuesta $5.")
        self.assertEqual(len(_images(view.document())), 2)
        self.assertIn("cuesta $5.", view.document().toPlainText())
        view.math_enabled = False
        view.load_markdown("La suma $1+2$.")
        self.assertEqual(_images(view.document()), [])


if __name__ == "__main__":
    unittest.main()

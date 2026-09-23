"""Unit tests for MarkdownHighlighter Live Preview concealment and formatting."""

import pytest
from PySide6.QtGui import QTextCharFormat, QTextDocument
from PySide6.QtWidgets import QApplication

from notevault_app.ui.components.notes.md_highlighter import MarkdownHighlighter

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


@pytest.fixture
def doc_and_hl():
    doc = QTextDocument()
    hl = MarkdownHighlighter(doc)
    return doc, hl


def get_format(doc: QTextDocument, block_num: int, offset: int) -> QTextCharFormat:
    """Return a safe copy of the character format at `offset` in block `block_num`."""
    block = doc.findBlockByNumber(block_num)
    for r in block.layout().formats():
        if r.start <= offset < r.start + r.length:
            return QTextCharFormat(r.format)
    return QTextCharFormat()


def _is_hidden(fmt: QTextCharFormat) -> bool:
    return fmt.foreground().color().alpha() == 0


def test_heading_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "## Subtitulo\nTexto regular"
    doc.setPlainText(raw)

    # Inactive block: block 0 is inactive
    hl.active_block = -1
    hl.rehighlight()
    fmt_marker = get_format(doc, 0, 0)
    assert _is_hidden(fmt_marker), "Heading markers should be concealed on inactive block"
    assert doc.toPlainText() == raw, "Document bytes must not change"

    # Active block: caret on block 0
    hl.active_block = 0
    hl.rehighlight()
    fmt_active = get_format(doc, 0, 0)
    assert not _is_hidden(fmt_active), "Heading markers should be visible on active block"
    assert doc.toPlainText() == raw


def test_quote_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "> Esta es una cita\nTexto"
    doc.setPlainText(raw)

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, 0)), "Quote marker '>' should be concealed on inactive block"
    assert doc.toPlainText() == raw

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, 0)), "Quote marker '>' should be visible on active block"


def test_bold_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "Palabra **negrita** aqui"
    doc.setPlainText(raw)

    idx = raw.index("**")
    inner_idx = raw.index("negrita")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx)), "Opening '**' should be concealed on inactive block"
    assert get_format(doc, 0, inner_idx).fontWeight() > 500, "Inner text should be bold"
    assert doc.toPlainText() == raw

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx)), "Opening '**' should be visible on active block"


def test_italic_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "Palabra *cursiva* aqui"
    doc.setPlainText(raw)

    idx = raw.index("*")
    inner_idx = raw.index("cursiva")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx)), "Opening '*' should be concealed on inactive block"
    assert get_format(doc, 0, inner_idx).fontItalic(), "Inner text should be italic"

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx)), "Opening '*' should be visible on active block"


def test_inline_code_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "Texto con `codigo` adentro"
    doc.setPlainText(raw)

    idx = raw.index("`")
    inner_idx = raw.index("codigo")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx)), "Backtick should be concealed on inactive block"
    assert get_format(doc, 0, inner_idx).fontFixedPitch(), "Inner text should be mono"

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx)), "Backtick should be visible on active block"


def test_highlight_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "Texto ==resaltado== aqui"
    doc.setPlainText(raw)

    idx = raw.index("==")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx)), "Opening '==' should be concealed on inactive block"

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx)), "Opening '==' should be visible on active block"


def test_strike_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "Texto ~~tachado~~ aqui"
    doc.setPlainText(raw)

    idx = raw.index("~~")
    inner_idx = raw.index("tachado")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx)), "Opening '~~' should be concealed on inactive block"
    assert get_format(doc, 0, inner_idx).fontStrikeOut(), "Inner text should be strikethrough"

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx)), "Opening '~~' should be visible on active block"


def test_bullet_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "- Elemento de lista"
    doc.setPlainText(raw)

    idx = raw.index("-")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx)), "Bullet '-' should be concealed on inactive block"

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx)), "Bullet '-' should be visible on active block"


def test_task_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "- [ ] Tarea pendiente\n- [x] Tarea hecha"
    doc.setPlainText(raw)

    # Line 0 inactive
    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, raw.index("["))), "Checkbox '[' should be concealed on inactive block"
    assert _is_hidden(get_format(doc, 0, raw.index("-"))), "Bullet '-' before checkbox should be concealed"

    # Line 0 active
    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, raw.index("["))), "Checkbox '[' should be visible on active block"
    assert not _is_hidden(get_format(doc, 0, raw.index("-"))), "Bullet '-' should be visible on active block"


def test_wikilink_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "Mira [[carpeta/nota|Mi Nota]] por favor"
    doc.setPlainText(raw)

    idx_bracket = raw.index("[[")
    idx_target = raw.index("carpeta/nota")
    idx_alias = raw.index("Mi Nota")

    hl.active_block = -1
    hl.rehighlight()
    assert _is_hidden(get_format(doc, 0, idx_bracket)), "'[[' should be concealed on inactive block"
    assert _is_hidden(get_format(doc, 0, idx_target)), "Target should be concealed when alias exists"
    assert not _is_hidden(get_format(doc, 0, idx_alias)), "Alias should be visible"

    hl.active_block = 0
    hl.rehighlight()
    assert not _is_hidden(get_format(doc, 0, idx_bracket)), "'[[' should be visible on active block"


def test_document_bytes_untouched(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "# Titulo\n\n- [ ] Tarea con **negrita** y [[enlace|Alias]]\n> Cita con `codigo`"
    doc.setPlainText(raw)

    hl.active_block = -1
    hl.rehighlight()
    assert doc.toPlainText() == raw

    hl.active_block = 2
    hl.rehighlight()
    assert doc.toPlainText() == raw


def test_code_block_no_concealment(doc_and_hl):
    doc, hl = doc_and_hl
    raw = "```python\n# Esto no es un encabezado\nx = 1\n```"
    doc.setPlainText(raw)

    hl.active_block = -1
    hl.rehighlight()
    # In block 1, '# Esto no es...' should NOT be treated as a heading with concealed '#'
    pos_hash = raw.splitlines()[1].index("#")
    assert not _is_hidden(get_format(doc, 1, pos_hash)), "Inside code fence, '#' must not be concealed"
    assert doc.toPlainText() == raw


def test_typography_font_loaded():
    from notevault_app.ui import theme
    from PySide6.QtGui import QFontDatabase
    theme.load_fonts()
    assert "Lexend" in QFontDatabase.families()
    assert theme.NOTE_FONT_FAMILY.startswith("Lexend")

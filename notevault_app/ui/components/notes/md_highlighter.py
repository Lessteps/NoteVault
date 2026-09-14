"""
Syntax highlighting for the raw Markdown mode.

Most notes open in Markdown mode, either because the user chose it or
because the rich Editor would not round-trip them safely, so this is the
surface people actually write in. Without colour it is a wall of grey text;
with it, the source reads the way Obsidian's source mode does: headings
stand out, markers fade, code and tables have their own shade, and a ticked
checkbox is struck through.

Nothing here changes the file. It only paints.
"""

import re

from PySide6.QtGui import QSyntaxHighlighter, QTextCharFormat, QColor, QFont

from ... import theme

# The dark palette is the source of truth; theme.tint() maps it to light.
C_HEADING   = "#a5b4fc"
C_MARKER    = "#666672"       # the #, -, > and | characters themselves
C_CODE      = "#e0a13a"
C_CODE_BG   = "#202024"
C_LINK      = "#2383e2"
C_WIKILINK  = "#7c5af0"
C_TAG       = "#3fb950"
C_QUOTE     = "#888895"
C_DONE      = "#606068"
C_TABLE     = "#7b93d4"
C_HR        = "#44444e"
C_FRONT     = "#888895"

HEADING_SIZES = {1: 1.55, 2: 1.32, 3: 1.16, 4: 1.06, 5: 1.0, 6: 1.0}

IN_CODE = 1
IN_FRONTMATTER = 2


def _fmt(color=None, *, bold=False, italic=False, mono=False, strike=False,
         point_size=None, background=None) -> QTextCharFormat:
    f = QTextCharFormat()
    if color:
        f.setForeground(QColor(theme.tint(color)))
    if background:
        f.setBackground(QColor(theme.tint(background)))
    if bold:
        f.setFontWeight(QFont.Bold)
    if italic:
        f.setFontItalic(True)
    if strike:
        f.setFontStrikeOut(True)
    if mono:
        f.setFontFamilies(["Cascadia Mono", "Consolas", "monospace"])
    if point_size:
        f.setFontPointSize(point_size)
    return f


def _base_point_size(document) -> float:
    """The editor's font in points. The stylesheet sets it in pixels, which
    is what pointSizeF() reports as -1."""
    font = document.defaultFont()
    if font.pointSizeF() > 0:
        return font.pointSizeF()
    if font.pixelSize() > 0:
        return font.pixelSize() * 0.75
    return 10.0


# Inline patterns, applied in order. Earlier rules win over later ones on the
# same span, so links are matched before emphasis.
_INLINE = [
    # ![[embed]] and [[wikilink]]
    (re.compile(r"!?\[\[[^\]\n]+\]\]"), dict(color=C_WIKILINK)),
    # [label](target)
    (re.compile(r"!?\[[^\]\n]*\]\([^)\n]*\)"), dict(color=C_LINK)),
    # bare URL
    (re.compile(r"(?<![(<\w])https?://[^\s)>\]]+"), dict(color=C_LINK)),
    # `code`
    (re.compile(r"(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)"),
     dict(color=C_CODE, mono=True, background=C_CODE_BG)),
    # ***both***, **bold**, *italic*
    (re.compile(r"(?<!\*)\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*(?!\*)"),
     dict(bold=True, italic=True)),
    (re.compile(r"(?<!\*)\*\*(?!\s)(.+?)(?<!\s)\*\*(?!\*)"), dict(bold=True)),
    (re.compile(r"(?<![\*\w])\*(?!\s|\*)(.+?)(?<!\s)\*(?![\*\w])"), dict(italic=True)),
    (re.compile(r"(?<![_\w])__(?!\s)(.+?)(?<!\s)__(?![_\w])"), dict(bold=True)),
    (re.compile(r"(?<![_\w])_(?!\s|_)(.+?)(?<!\s)_(?![_\w])"), dict(italic=True)),
    # ~~struck~~
    (re.compile(r"~~(?!\s)(.+?)(?<!\s)~~"), dict(strike=True, color=C_DONE)),
    # ==highlight==
    (re.compile(r"==(?!\s)(.+?)(?<!\s)=="), dict(color=C_CODE, bold=True)),
    # #tag, but never a heading (which starts the line) and never a colour
    (re.compile(r"(?<![\w&#])#(?!\d)[\w/\-]{2,}"), dict(color=C_TAG)),
]

# Every character any inline rule can start on. A line without one of these
# cannot match any of them.
_INLINE_HINT_RE = re.compile(r"[\[\]`*_~=#!h]")

_FENCE_RE   = re.compile(r"^\s{0,3}(```|~~~)")
_HEADING_RE = re.compile(r"^(\s{0,3})(#{1,6})(\s+)(.*)$")
_QUOTE_RE   = re.compile(r"^\s{0,3}(>+\s?)")
_BULLET_RE  = re.compile(r"^(\s*)([-*+]|\d+[.)])(\s+)")
_TASK_RE    = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+)(\[([ xX])\])(\s*)(.*)$")
_HR_RE      = re.compile(r"^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$")
_TABLE_RE   = re.compile(r"^\s*\|.*")
_FRONT_RE   = re.compile(r"^---\s*$")


class MarkdownHighlighter(QSyntaxHighlighter):
    """Paints a markdown source. Rebuilt whenever the theme changes."""

    def __init__(self, document):
        super().__init__(document)
        self.enabled = True
        self._build_formats()

    def _build_formats(self):
        base = _base_point_size(self.document())
        self.f_marker = _fmt(C_MARKER)
        self.f_heading = {lvl: _fmt(C_HEADING, bold=True, point_size=base * scale)
                          for lvl, scale in HEADING_SIZES.items()}
        self.f_code_block = _fmt(C_CODE, mono=True, background=C_CODE_BG)
        self.f_quote = _fmt(C_QUOTE, italic=True)
        self.f_bullet = _fmt(C_WIKILINK, bold=True)
        self.f_box_open = _fmt(C_MARKER, bold=True)
        self.f_box_done = _fmt(C_TAG, bold=True)
        self.f_done_text = _fmt(C_DONE, strike=True)
        self.f_hr = _fmt(C_HR, bold=True)
        self.f_table = _fmt(C_TABLE)
        self.f_front = _fmt(C_FRONT, italic=True)
        self.f_inline = [(rx, _fmt(**kw)) for rx, kw in _INLINE]

    def retheme(self):
        self._build_formats()
        self.rehighlight()

    # ------------------------------------------------------------------

    def highlightBlock(self, text: str):
        if not self.enabled:
            return
        previous = self.previousBlockState()
        self.setCurrentBlockState(0)

        # YAML frontmatter: only the --- fence that opens the file.
        if previous == IN_FRONTMATTER:
            self.setFormat(0, len(text), self.f_front)
            if not _FRONT_RE.match(text):
                self.setCurrentBlockState(IN_FRONTMATTER)
            return
        if previous <= 0 and _FRONT_RE.match(text) \
                and self.currentBlock().blockNumber() == 0:
            self.setFormat(0, len(text), self.f_front)
            self.setCurrentBlockState(IN_FRONTMATTER)
            return

        # Fenced code: everything between the fences is left alone.
        if _FENCE_RE.match(text):
            self.setFormat(0, len(text), self.f_code_block)
            if previous != IN_CODE:
                self.setCurrentBlockState(IN_CODE)
            return
        if previous == IN_CODE:
            self.setFormat(0, len(text), self.f_code_block)
            self.setCurrentBlockState(IN_CODE)
            return

        if _HR_RE.match(text) and text.strip():
            self.setFormat(0, len(text), self.f_hr)
            return

        body_start = 0
        heading = _HEADING_RE.match(text)
        if heading:
            level = len(heading.group(2))
            self.setFormat(0, len(text), self.f_heading[level])
            self.setFormat(heading.start(2), len(heading.group(2)), self.f_marker)
            body_start = heading.start(4)
        else:
            quote = _QUOTE_RE.match(text)
            if quote:
                self.setFormat(0, len(text), self.f_quote)
                self.setFormat(0, quote.end(1), self.f_marker)
                body_start = quote.end(1)

            task = _TASK_RE.match(text)
            if task:
                self.setFormat(task.start(1), len(task.group(1)), self.f_bullet)
                done = task.group(3) in "xX"
                self.setFormat(task.start(2), len(task.group(2)),
                               self.f_box_done if done else self.f_box_open)
                if done and task.group(5):
                    self.setFormat(task.start(5), len(task.group(5)),
                                   self.f_done_text)
                body_start = max(body_start, task.start(5))
            else:
                bullet = _BULLET_RE.match(text)
                if bullet:
                    self.setFormat(bullet.start(2), len(bullet.group(2)),
                                   self.f_bullet)
                    body_start = max(body_start, bullet.end(3))

            if _TABLE_RE.match(text):
                for i, ch in enumerate(text):
                    if ch == "|" and (i == 0 or text[i - 1] != "\\"):
                        self.setFormat(i, 1, self.f_table)

        self._paint_inline(text, body_start)

    def _paint_inline(self, text: str, start: int):
        # Most lines are plain prose. Running fourteen regexes over each of
        # them is the bulk of the highlighting cost, so a line with none of
        # the characters any of them can match is skipped outright.
        if not _INLINE_HINT_RE.search(text, start):
            return
        taken = [False] * len(text)
        for rx, fmt in self.f_inline:
            for m in rx.finditer(text, start):
                a, b = m.start(), m.end()
                if any(taken[a:b]):
                    continue
                merged = QTextCharFormat(self.format(a))
                merged.merge(fmt)
                self.setFormat(a, b - a, merged)
                for i in range(a, b):
                    taken[i] = True

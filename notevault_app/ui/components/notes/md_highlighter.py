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
from pathlib import Path

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
        f.setFontFixedPitch(True)
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
#
# The third item is the *delimiter length* used for Obsidian-style Live Preview:
# on an inactive line the delimiter runs of that length on each side are
# concealed and only the inner text is styled (``**bold**`` reads as **bold**).
#   None → never conceal, colour the whole match (links, urls, tags)
#   n    → conceal ``n`` characters on each side
#   -1   → conceal ``len(match.group(1))`` on each side (fenced-backtick code)
_INLINE = [
    # ![[embed]]
    (re.compile(r"!\[\[[^\]\n]+\]\]"), dict(color=C_WIKILINK), None),
    # [label](target)
    (re.compile(r"!?\[[^\]\n]*\]\([^)\n]*\)"), dict(color=C_LINK), None),
    # bare URL
    (re.compile(r"(?<![(<\w])https?://[^\s)>\]]+"), dict(color=C_LINK), None),
    # `code`
    (re.compile(r"(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)"),
     dict(color=C_CODE, mono=True, background=C_CODE_BG), -1),
    # ***both***, **bold**, *italic*
    (re.compile(r"(?<!\*)\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*(?!\*)"),
     dict(bold=True, italic=True), 3),
    (re.compile(r"(?<!\*)\*\*(?!\s)(.+?)(?<!\s)\*\*(?!\*)"), dict(bold=True), 2),
    (re.compile(r"(?<![\*\w])\*(?!\s|\*)(.+?)(?<!\s)\*(?![\*\w])"), dict(italic=True), 1),
    (re.compile(r"(?<![_\w])__(?!\s)(.+?)(?<!\s)__(?![_\w])"), dict(bold=True), 2),
    (re.compile(r"(?<![_\w])_(?!\s|_)(.+?)(?<!\s)_(?![_\w])"), dict(italic=True), 1),
    # ~~struck~~
    (re.compile(r"~~(?!\s)(.+?)(?<!\s)~~"), dict(strike=True, color=C_DONE), 2),
    # ==highlight==
    (re.compile(r"==(?!\s)(.+?)(?<!\s)=="), dict(color=C_CODE, bold=True), 2),
    # #tag, but never a heading (which starts the line) and never a colour
    (re.compile(r"(?<![\w&#])#(?!\d)[\w/\-]{2,}"), dict(color=C_TAG), None),
]

# Every character any inline rule can start on. A line without one of these
# cannot match any of them.
_INLINE_HINT_RE = re.compile(r"[\[\]`*_~=#!h]")
_WIKILINK_RE = re.compile(r"(?<!!)\[\[([^\]\n]+)\]\]")

_FENCE_RE   = re.compile(r"^\s{0,3}(```|~~~)")
_HEADING_RE = re.compile(r"^(\s{0,3})(#{1,6})(\s+)(.*)$")
_QUOTE_RE   = re.compile(r"^\s{0,3}(>+\s?)")
_BULLET_RE  = re.compile(r"^(\s*)([-*+]|\d+[.)])(\s+)")
_TASK_RE    = re.compile(r"^(\s*)([-*+]|\d+[.)])(\s+)(\[([ xX])\])(\s*)(.*)$")
_HR_RE      = re.compile(r"^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$")
_TABLE_RE   = re.compile(r"^\s*\|.*")
# The |---|:--:|---| alignment row under a table header: only pipes, dashes,
# colons and spaces, and at least one dash.
_TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$")
_FRONT_RE   = re.compile(r"^---\s*$")


class MarkdownHighlighter(QSyntaxHighlighter):
    """Paints a markdown source. Rebuilt whenever the theme changes."""

    def __init__(self, document):
        super().__init__(document)
        self.enabled = True
        self.active_block: int = -1
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
        # A table row is set in a monospace face so its columns line up into a
        # real grid; the pipes are made invisible (but keep their width) so the
        # painted grid lines show instead. On the caret's row the pipes stay
        # visible so the raw table can still be edited.
        self.f_table_mono = _fmt(mono=True)
        self.f_pipe_hidden = QTextCharFormat()
        self.f_pipe_hidden.setFontFamilies(["Cascadia Mono", "Consolas", "monospace"])
        self.f_pipe_hidden.setForeground(QColor(0, 0, 0, 0))
        self.f_front = _fmt(C_FRONT, italic=True)
        self.f_wikilink_full = _fmt(C_WIKILINK)
        self.f_wikilink_hide = QTextCharFormat()
        self.f_wikilink_hide.setFontPointSize(0.1)
        self.f_wikilink_hide.setForeground(QColor(0, 0, 0, 0))
        self.f_wikilink_show = _fmt(C_WIKILINK)
        self.f_wikilink_show.setFontUnderline(True)
        # A run painted with this vanishes: near-zero size + transparent ink, so
        # concealed markdown markers take no visible space (the same trick the
        # wikilink concealment uses).
        self.f_hide = QTextCharFormat()
        self.f_hide.setFontPointSize(0.1)
        self.f_hide.setForeground(QColor(0, 0, 0, 0))

        # Box & bullet placeholder concealment: transparent foreground with normal font size
        # so the painted checkbox glyph/bullet has dedicated space without text overlap.
        self.f_box_conceal = QTextCharFormat()
        self.f_box_conceal.setForeground(QColor(0, 0, 0, 0))

        self.f_inline = [(rx, _fmt(**kw), dl) for rx, kw, dl in _INLINE]

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
            self.currentBlock().setUserState(IN_CODE)
            return
        if previous == IN_CODE:
            self.setFormat(0, len(text), self.f_code_block)
            self.setCurrentBlockState(IN_CODE)
            self.currentBlock().setUserState(IN_CODE)
            return
        self.currentBlock().setUserState(0)

        if _HR_RE.match(text) and text.strip():
            self.setFormat(0, len(text), self.f_hr)
            return

        # Live Preview: on every line except the one the caret sits on, the raw
        # markers are concealed and only the rendered text remains; the caret's
        # line shows its markers (dimmed) so it can still be edited.
        blk = self.currentBlock().blockNumber()
        active = blk == self.active_block

        body_start = 0
        heading = _HEADING_RE.match(text)
        if heading:
            level = len(heading.group(2))
            self.setFormat(0, len(text), self.f_heading[level])
            if active:
                self.setFormat(heading.start(2), len(heading.group(2)), self.f_marker)
            else:
                # Hide the leading indent, the #'s and the space after them.
                self.setFormat(0, heading.start(4), self.f_hide)
            body_start = heading.start(4)
        else:
            quote = _QUOTE_RE.match(text)
            if quote:
                self.setFormat(0, len(text), self.f_quote)
                self.setFormat(0, quote.end(1),
                               self.f_marker if active else self.f_hide)
                body_start = quote.end(1)

            task = _TASK_RE.match(text)
            if task:
                b_char = task.group(2)
                b_space = task.group(3)
                box_raw = task.group(4)
                done = task.group(5) in "xX"
                body = task.group(7)

                if active:
                    self.setFormat(task.start(2), len(b_char), self.f_bullet)
                    self.setFormat(task.start(4), len(box_raw),
                                   self.f_box_done if done else self.f_box_open)
                else:
                    if b_char in "-*+":
                        self.setFormat(task.start(2), len(b_char) + len(b_space), self.f_hide)
                    self.setFormat(task.start(4), len(box_raw), self.f_box_conceal)

                if done and body:
                    self.setFormat(task.start(7), len(body), self.f_done_text)
                body_start = max(body_start, task.start(7))
            else:
                bullet = _BULLET_RE.match(text)
                if bullet:
                    b_char = bullet.group(2)
                    if active:
                        self.setFormat(bullet.start(2), len(b_char), self.f_bullet)
                    else:
                        if b_char in "-*+":
                            self.setFormat(bullet.start(2), len(b_char), self.f_box_conceal)
                        else:
                            self.setFormat(bullet.start(2), len(b_char), self.f_bullet)
                    body_start = max(body_start, bullet.end(3))

            if _TABLE_RE.match(text):
                # Monospace so the columns line up into a grid.
                self.setFormat(0, len(text), self.f_table_mono)
                if _TABLE_SEP_RE.match(text) and not active:
                    # Hide the |---| alignment row on inactive tables.
                    self.setFormat(0, len(text), self.f_hide)
                else:
                    for i, ch in enumerate(text):
                        if ch == "|" and (i == 0 or text[i - 1] != "\\"):
                            # Visible pipe on the caret's row (editable); an
                            # invisible, width-keeping pipe elsewhere so the
                            # painted grid lines take over.
                            self.setFormat(i, 1,
                                           self.f_table if active else self.f_pipe_hidden)
                # A table row carries no other inline markdown to style, and
                # running the inline rules would break the column alignment.
                return

        self._paint_inline(text, body_start, blk)

    def _paint_inline(self, text: str, start: int, block_num: int = -1):
        # Most lines are plain prose. Running fourteen regexes over each of
        # them is the bulk of the highlighting cost, so a line with none of
        # the characters any of them can match is skipped outright.
        if not _INLINE_HINT_RE.search(text, start):
            return
        taken = [False] * len(text)

        # Wikilinks: expanded with full path on active block, collapsed to filename on inactive blocks
        for m in _WIKILINK_RE.finditer(text, start):
            a, b = m.start(), m.end()
            if any(taken[a:b]):
                continue
            if block_num == self.active_block:
                merged = QTextCharFormat(self.format(a))
                merged.merge(self.f_wikilink_full)
                self.setFormat(a, b - a, merged)
            else:
                inner = m.group(1)
                parts = inner.split("|", 1)
                target = parts[0].strip()
                alias = parts[1].strip() if len(parts) > 1 else ""
                clean_target = target.split("#", 1)[0].strip()

                if alias:
                    alias_start = m.start(1) + len(parts[0]) + 1
                    alias_len = len(alias)
                    self.setFormat(a, alias_start - a, self.f_wikilink_hide)
                    merged = QTextCharFormat(self.format(alias_start))
                    merged.merge(self.f_wikilink_show)
                    self.setFormat(alias_start, alias_len, merged)
                    self.setFormat(alias_start + alias_len, b - (alias_start + alias_len), self.f_wikilink_hide)
                elif "/" in clean_target or "\\" in clean_target:
                    filename = Path(clean_target).name
                    fn_idx = m.group(0).find(filename)
                    if fn_idx != -1:
                        fn_start = a + fn_idx
                        fn_len = len(filename)
                        self.setFormat(a, fn_start - a, self.f_wikilink_hide)
                        merged = QTextCharFormat(self.format(fn_start))
                        merged.merge(self.f_wikilink_show)
                        self.setFormat(fn_start, fn_len, merged)
                        self.setFormat(fn_start + fn_len, b - (fn_start + fn_len), self.f_wikilink_hide)
                    else:
                        fn_start = a + 2
                        fn_len = b - a - 4
                        self.setFormat(a, 2, self.f_wikilink_hide)
                        merged = QTextCharFormat(self.format(fn_start))
                        merged.merge(self.f_wikilink_show)
                        self.setFormat(fn_start, fn_len, merged)
                        self.setFormat(fn_start + fn_len, 2, self.f_wikilink_hide)
                else:
                    fn_start = a + 2
                    fn_len = b - a - 4
                    self.setFormat(a, 2, self.f_wikilink_hide)
                    merged = QTextCharFormat(self.format(fn_start))
                    merged.merge(self.f_wikilink_show)
                    self.setFormat(fn_start, fn_len, merged)
                    self.setFormat(fn_start + fn_len, 2, self.f_wikilink_hide)

            for i in range(a, b):
                taken[i] = True

        active = block_num == self.active_block
        for rx, fmt, dlen in self.f_inline:
            for m in rx.finditer(text, start):
                a, b = m.start(), m.end()
                if any(taken[a:b]):
                    continue
                if dlen is not None and not active:
                    # Live Preview: hide the delimiters, style only the inner
                    # text, so ``**bold**`` reads as bold with no asterisks.
                    dl = len(m.group(1)) if dlen == -1 else dlen
                    if b - a > 2 * dl:
                        merged = QTextCharFormat(self.format(a + dl))
                        merged.merge(fmt)
                        self.setFormat(a, dl, self.f_hide)
                        self.setFormat(a + dl, (b - dl) - (a + dl), merged)
                        self.setFormat(b - dl, dl, self.f_hide)
                        for i in range(a, b):
                            taken[i] = True
                        continue
                merged = QTextCharFormat(self.format(a))
                merged.merge(fmt)
                self.setFormat(a, b - a, merged)
                for i in range(a, b):
                    taken[i] = True

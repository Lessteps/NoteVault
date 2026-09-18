"""
QTextDocument <-> Markdown.

Qt's own QTextDocument.toMarkdown() drops inline formatting in Qt 6.11, so
the rich editor serialises the document itself. Everything the importer
understands has to come back out unchanged, or opening a note in the Editor
and letting it autosave would rewrite the file: task-list checkboxes, nested
lists, tables, fenced code, quotes, rules and images all round-trip here.

The inverse direction is Qt's QTextDocument.setMarkdown(), fed through
`prepare_markdown()` so Obsidian-only syntax survives the trip.
"""

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import (
    QTextDocument, QTextBlock, QTextFragment, QFont, QTextListFormat,
    QTextBlockFormat, QTextCursor, QTextFormat, QTextTable,
)

P = QTextFormat.Property

BASE_FONT_SIZE = 15.0
MONO_HINTS = ("mono", "consolas", "courier", "cascadia")
HEADING_SIZES = {1: 26.0, 2: 21.0, 3: 17.0}
INDENT = "    "

# Obsidian embeds (![[file.png]]) are not markdown. They are loaded as images
# whose name carries this scheme, so the serialiser can write the original
# syntax back instead of silently converting it.
EMBED_SCHEME = "nv-embed:"

_BULLETS = {
    QTextListFormat.ListDisc: "-",
    QTextListFormat.ListCircle: "*",
    QTextListFormat.ListSquare: "+",
}
_ORDERED = (
    QTextListFormat.ListDecimal, QTextListFormat.ListLowerAlpha,
    QTextListFormat.ListUpperAlpha, QTextListFormat.ListLowerRoman,
    QTextListFormat.ListUpperRoman,
)

# Qt's importer silently drops an image with empty alt text and a task item
# with no text. Both get this invisible placeholder on the way in, and the
# serialiser removes it on the way out.
PLACEHOLDER = "\u200b"

# A line break inside one block. Qt's importer drops everything after a
# `<br>` tag, in a paragraph, a list item or a table cell alike, so `<br>` is
# turned into this character on the way in and written back as `<br>` on the
# way out. Shift+Enter in the editor inserts the same character.
LINE_SEP = "\u2028"
# What an image occupies in the document text.
OBJECT_CHAR = "\ufffc"

_EMBED_RE = re.compile(r"!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]")
_EMPTY_ALT_RE = re.compile(r"!\[\]\(")
_EMPTY_TASK_RE = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\])[ \t]*$", re.M)
_TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
_TABLE_SEP_CELL_RE = re.compile(r"^\s*:?-{1,}:?\s*$")


# ── Markdown -> document ──────────────────────────────────────────────────

_FENCE_RE = re.compile(r"^\s{0,3}(```|~~~)")
_CODE_SPAN_RE = re.compile(r"(`+)(.+?)\1")
# Tags the importer renders, or that this module writes itself. Any other
# "<word" is text: `Bearer <jwt>` or `List<String>` in a note is not HTML.
_KNOWN_TAG_RE = re.compile(
    r"<(?:/?(?:span|b|i|u|s|em|strong|sub|sup|code|del|mark|kbd)\b[^<>]*"
    r"|(?:https?|mailto|ftp|file):[^<>\s]*"
    r"|" + re.escape(EMBED_SCHEME) + r"[^<>]*"
    r"|nv-note:[^<>]*)>",
    re.IGNORECASE,
)
_TAG_START_RE = re.compile(r"(?<!\\)<(?=[A-Za-z/!?])")
_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)


def _escape_unknown_tags(line: str) -> str:
    """Escape a "<" that would open an HTML tag Qt does not know.

    Qt's importer treats such a tag as raw HTML and silently drops every
    character after it, to the end of the document.
    """
    out, pos = [], 0
    for m in _CODE_SPAN_RE.finditer(line):
        out.append(_escape_segment(line[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(_escape_segment(line[pos:]))
    return "".join(out)


def _escape_segment(text: str) -> str:
    if "<" not in text:
        return text
    text = _BR_RE.sub(LINE_SEP, text)
    keep = [(m.start(), m.end()) for m in _KNOWN_TAG_RE.finditer(text)]
    # Link destinations written as ](<path with spaces>) are not tags either.
    keep += [(m.start(1), m.end(1)) for m in re.finditer(r"\]\((<[^<>]*>)", text)]

    def escape(m):
        i = m.start()
        if any(a <= i < b for a, b in keep):
            return m.group(0)
        return "\\<"

    return _TAG_START_RE.sub(escape, text)


_RULE_LINE_RE = re.compile(r"^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$")


def prepare_markdown(markdown: str) -> str:
    """Rewrite syntax Qt's importer does not know into syntax it does."""
    lines, fence = [], False
    for line in (markdown or "").split("\n"):
        if _FENCE_RE.match(line):
            fence = not fence
            lines.append(line)
            continue
        if not fence and _RULE_LINE_RE.match(line) and lines and lines[-1].strip():
            # A line of dashes right under a paragraph is a setext heading in
            # CommonMark, so Qt turned the paragraph above into an H2 and the
            # rule vanished — and the autosave then wrote "## Texto" into the
            # file. In Obsidian that line is a horizontal rule, which is what
            # the user typed it for, and one blank line is all it takes.
            lines.append("")
        lines.append(line if fence else _escape_unknown_tags(line))
    markdown = "\n".join(lines)

    text = _EMBED_RE.sub(
        lambda m: (f"![{m.group(2) or PLACEHOLDER}]"
                   f"(<{EMBED_SCHEME}{m.group(1).strip()}>)"),
        markdown or "",
    )
    text = _EMPTY_ALT_RE.sub(f"![{PLACEHOLDER}](", text)
    return _EMPTY_TASK_RE.sub(lambda m: f"{m.group(1)} {PLACEHOLDER}", text)


_WIKILINK_RE = re.compile(r"(?<!!)\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]")
_TASK_LINE_RE = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])")


_TRANSCLUDE_RE = re.compile(r"!\[\[([^\]|#]+?)(?:#([^\]|]*))?\]\]")


def expand_transclusions(markdown: str, resolve_fn, depth: int = 0,
                         _seen: frozenset = frozenset()) -> str:
    """Replace ![[note]] with the body of that note (read-only rendering).

    *resolve_fn(title) -> str | None* returns the body of the note with
    that title, or None if not found. At most 3 levels of nesting;
    cycles are detected via *_seen* (set of already-expanded note titles).
    """
    if depth >= 3:
        return markdown

    def _replace(m: re.Match) -> str:
        ref = m.group(1).strip()
        heading = (m.group(2) or "").strip()
        ref_lower = ref.lower()

        if ref_lower in _seen:
            return f"> *↩ {ref} (referencia circular)*"

        body = resolve_fn(ref)
        if body is None:
            return m.group(0)   # keep original if not found

        if heading:
            # Extract only the section under that heading
            lines = body.splitlines()
            section, in_section, level = [], False, 0
            for line in lines:
                hm = re.match(r"^(#{1,6})\s+(.*)", line)
                if hm:
                    if not in_section and hm.group(2).strip().lower() == heading.lower():
                        in_section = True
                        level = len(hm.group(1))
                        section.append(line)
                    elif in_section and len(hm.group(1)) <= level:
                        break
                    elif in_section:
                        section.append(line)
                elif in_section:
                    section.append(line)
            body = "\n".join(section) if section else body

        nested_seen = _seen | {ref_lower}
        expanded = expand_transclusions(body, resolve_fn, depth + 1, nested_seen)

        block = f"\n\n> **↩ {ref}**\n\n"
        for line in expanded.splitlines():
            block += f"> {line}\n"
        block += "\n"
        return block

    # Only replace ![[...]] that are NOT plain image embeds (those have a known extension)
    def _maybe_replace(m: re.Match) -> str:
        ref = m.group(1).strip()
        from .attachments import IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS, PDF_EXTS
        suffix = Path(ref).suffix.lower()
        if suffix in IMAGE_EXTS | VIDEO_EXTS | AUDIO_EXTS | PDF_EXTS:
            return m.group(0)  # leave image/media embeds alone
        return _replace(m)

    return _TRANSCLUDE_RE.sub(_maybe_replace, markdown)


def prepare_for_reading(markdown: str) -> str:
    """prepare_markdown(), plus wikilinks turned into clickable links.

    Only for the read-only view: this output is never serialised back.
    Shows only the file name when no alias is provided for cleaner visualization.
    """
    def _to_link(m: re.Match) -> str:
        target = m.group(1).strip()
        alias = (m.group(2) or "").strip()
        if alias:
            label = alias
        else:
            clean = target.split("#")[0].strip()
            label = Path(clean).name if ("/" in clean or "\\" in clean) else clean
        return f"[{label}](<nv-note:{target}>)"

    text = _WIKILINK_RE.sub(_to_link, markdown or "")
    return prepare_markdown(text)


def toggle_task(markdown: str, index: int) -> str:
    """Flip the index-th task checkbox in a markdown source.

    Tasks are counted in document order, skipping fenced code, which is the
    order the importer creates task blocks in.
    """
    lines = (markdown or "").split("\n")
    seen, in_code = 0, False
    for i, line in enumerate(lines):
        if line.lstrip().startswith(("```", "~~~")):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = _TASK_LINE_RE.match(line)
        if not m:
            continue
        if seen == index:
            mark = " " if m.group(2) in "xX" else "x"
            lines[i] = m.group(1) + mark + m.group(3) + line[m.end():]
            return "\n".join(lines)
        seen += 1
    return markdown


# ── Document -> markdown ──────────────────────────────────────────────────

def is_mono(fmt) -> bool:
    # Only fontFamilies(): QTextCharFormat.fontFamily() crashes on Qt 6.11.
    families = fmt.fontFamilies()
    if not families:
        return fmt.fontFixedPitch()
    if isinstance(families, str):
        families = [families]
    return any(hint in str(name).lower() for name in families
               for hint in MONO_HINTS)


def _image_markdown(fmt) -> str:
    img = fmt.toImageFormat()
    name = img.name()
    alt = img.stringProperty(P.ImageAltText) if img.hasProperty(P.ImageAltText) else ""
    alt = alt.replace(PLACEHOLDER, "")
    if name.startswith(EMBED_SCHEME):
        target = name[len(EMBED_SCHEME):]
        return f"![[{target}|{alt}]]" if alt else f"![[{target}]]"
    title = img.stringProperty(P.ImageTitle) if img.hasProperty(P.ImageTitle) else ""
    url = f"<{name}>" if " " in name else name
    return f'![{alt}]({url} "{title}")' if title else f"![{alt}]({url})"


def _fragment_markdown(frag: QTextFragment, plain_bold: bool) -> str:
    fmt = frag.charFormat()
    if fmt.isImageFormat():
        return _image_markdown(fmt)

    text = frag.text().replace(OBJECT_CHAR, "")
    if not text:
        return ""

    # Leading/trailing spaces stay outside the markers, or CommonMark reads
    # "** bold **" as literal asterisks.
    lead = text[:len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    core = text.strip()
    if not core:
        return text

    if fmt.isAnchor() and fmt.anchorHref():
        return f"{lead}[{core}]({fmt.anchorHref()}){trail}"
    if is_mono(fmt):
        return f"{lead}`{core}`{trail}"

    bold = fmt.fontWeight() >= QFont.Bold and not plain_bold
    italic = fmt.fontItalic()
    strike = fmt.fontStrikeOut()
    size = fmt.fontPointSize()
    sized = (not plain_bold and size and abs(size - BASE_FONT_SIZE) > 0.6
             and size not in HEADING_SIZES.values())

    if strike:
        core = f"~~{core}~~"
    if bold and italic:
        core = f"***{core}***"
    elif bold:
        core = f"**{core}**"
    elif italic:
        core = f"*{core}*"
    if sized:
        core = f'<span style="font-size:{int(round(size))}px">{core}</span>'
    return lead + core + trail


def inline_markdown(block: QTextBlock, plain_bold: bool = False) -> str:
    """The inline content of one block, with no block-level prefix."""
    parts = []
    it = block.begin()
    while not it.atEnd():
        frag = it.fragment()
        if frag.isValid():
            parts.append(_fragment_markdown(frag, plain_bold))
        it += 1
    return "".join(parts).rstrip()


def _list_line(block: QTextBlock) -> str:
    lst = block.textList()
    lfmt = lst.format()
    pad = INDENT * max(0, lfmt.indent() - 1)
    if lfmt.style() in _ORDERED:
        bullet = f"{lst.itemNumber(block) + 1}."
    else:
        bullet = _BULLETS.get(lfmt.style(), "-")
    marker = block.blockFormat().marker()
    box = {QTextBlockFormat.MarkerType.Checked: "[x] ",
           QTextBlockFormat.MarkerType.Unchecked: "[ ] "}.get(marker, "")
    text = inline_markdown(block).replace(PLACEHOLDER, "")
    return f"{pad}{bullet} {box}{text.replace(LINE_SEP, '<br>')}".rstrip()


def block_to_markdown(block: QTextBlock) -> str:
    """One non-table, non-code block. Kept public for callers and tests."""
    fmt = block.blockFormat()
    if fmt.hasProperty(P.BlockTrailingHorizontalRulerWidth):
        return "---"
    if block.textList() is not None:
        return _list_line(block)

    heading = fmt.headingLevel()
    text = inline_markdown(block, plain_bold=bool(heading))
    if not text:
        return ""
    if heading:
        return "#" * min(6, heading) + " " + text.replace(LINE_SEP, "<br>")
    quote = fmt.intProperty(P.BlockQuoteLevel) if fmt.hasProperty(P.BlockQuoteLevel) else 0
    if quote:
        return "> " * quote + text.replace(LINE_SEP, "<br>")
    return text.replace(LINE_SEP, "<br>")


def _is_code(block: QTextBlock) -> bool:
    return block.blockFormat().hasProperty(P.BlockCodeFence)


def display_width(text: str) -> int:
    """Terminal-style width, so wide glyphs (emoji, CJK) keep columns aligned."""
    width = 0
    for ch in text:
        if unicodedata.combining(ch):
            continue
        width += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return width


def _cell_markdown(doc: QTextDocument, cell, header: bool) -> str:
    parts = []
    block = doc.findBlock(cell.firstPosition())
    while block.isValid() and block.position() <= cell.lastPosition():
        parts.append(inline_markdown(block, plain_bold=header))
        block = block.next()
    text = "<br>".join(p for p in parts if p).replace(LINE_SEP, "<br>")
    return text.replace("|", "\\|")


def _column_alignment(table: QTextTable, column: int) -> str:
    # Alignment is read from a body cell: header cells always come back
    # left-aligned. The importer stamps "left" on both `---` and `:--`, which
    # every renderer shows the same way, so left is written as plain `---`.
    if table.rows() < 2:
        return "none"
    align = table.cellAt(1, column).firstCursorPosition().blockFormat().alignment()
    if align & Qt.AlignHCenter:
        return "center"
    if align & Qt.AlignRight:
        return "right"
    return "none"


def format_table(rows: list, aligns: list) -> str:
    """Render cell text as a GitHub table whose pipes line up."""
    cols = max(len(r) for r in rows)
    rows = [r + [""] * (cols - len(r)) for r in rows]
    aligns = (aligns + ["none"] * cols)[:cols]
    widths = [max(3, max(display_width(r[c]) for r in rows)) for c in range(cols)]

    def pad(text, width, align):
        gap = width - display_width(text)
        if align == "right":
            return " " * gap + text
        if align == "center":
            return " " * (gap // 2) + text + " " * (gap - gap // 2)
        return text + " " * gap

    def sep(width, align):
        if align == "left":
            return ":" + "-" * (width - 1)
        if align == "right":
            return "-" * (width - 1) + ":"
        if align == "center":
            return ":" + "-" * (width - 2) + ":"
        return "-" * width

    lines = ["| " + " | ".join(pad(rows[0][c], widths[c], aligns[c])
                               for c in range(cols)) + " |",
             "| " + " | ".join(sep(widths[c], aligns[c])
                               for c in range(cols)) + " |"]
    for r in rows[1:]:
        lines.append("| " + " | ".join(pad(r[c], widths[c], aligns[c])
                                       for c in range(cols)) + " |")
    return "\n".join(lines)


def table_to_markdown(doc: QTextDocument, table: QTextTable) -> str:
    rows = [[_cell_markdown(doc, table.cellAt(r, c), header=(r == 0))
             for c in range(table.columns())]
            for r in range(table.rows())]
    aligns = [_column_alignment(table, c) for c in range(table.columns())]
    return format_table(rows, aligns)


def document_to_markdown(doc: QTextDocument) -> str:
    chunks = []          # (kind, text); kinds glue or get a blank line
    block = doc.begin()
    while block.isValid():
        table = QTextCursor(block).currentTable()
        if table is not None:
            chunks.append(("table", table_to_markdown(doc, table)))
            block = doc.findBlock(table.lastPosition()).next()
            continue

        if _is_code(block):
            fmt = block.blockFormat()
            fence = fmt.stringProperty(P.BlockCodeFence) or "`"
            lang = fmt.stringProperty(P.BlockCodeLanguage) if fmt.hasProperty(
                P.BlockCodeLanguage) else ""
            lines = []
            while block.isValid() and _is_code(block):
                lines.append(block.text())
                block = block.next()
            fence = fence * 3 if len(fence) < 3 else fence
            chunks.append(("code", f"{fence}{lang}\n" + "\n".join(lines) + f"\n{fence}"))
            continue

        rendered = block_to_markdown(block)
        if rendered:
            kind = "list" if block.textList() is not None else "text"
            chunks.append((kind, rendered))
        block = block.next()

    out = []
    prev = None
    for kind, text in chunks:
        # Consecutive list items, at any depth, are one list and stay glued.
        if out and not (kind == "list" and prev == "list"):
            out.append("")
        out.append(text)
        prev = kind
    body = "\n".join(out).strip("\n")
    return body + "\n" if body else ""


# ── Safety check for the rich editor ──────────────────────────────────────

_WORD_RE = re.compile(r"\w+")
# Words that only exist as markup: entity names and tags the importer
# consumes. Losing them is expected and harmless.
_MARKUP_WORDS = {"amp", "lt", "gt", "quot", "nbsp", "apos", "br", "span",
                 "style", "font", "size", "px"}
_STRUCTURE = {
    "casillas": re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]", re.M),
    "casillas marcadas": re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]", re.M),
    "filas de tabla": re.compile(r"^\s*\|.*\|\s*$", re.M),
    "imágenes": re.compile(r"!\[[^\]]*\]\(|!\[\["),
    "títulos": re.compile(r"^#{1,6}\s+\S", re.M),
}


def roundtrip_markdown(markdown: str) -> str:
    """What the Editor would write back after opening this markdown."""
    doc = QTextDocument()
    doc.setMarkdown(prepare_markdown(markdown))
    return document_to_markdown(doc)


def _outside_fences(text: str) -> str:
    lines, fence = [], False
    for line in text.split("\n"):
        if _FENCE_RE.match(line):
            fence = not fence
            continue
        if not fence:
            lines.append(line)
    return "\n".join(lines)


def _fence_count(text: str) -> int:
    return sum(1 for line in text.split("\n") if _FENCE_RE.match(line))


@lru_cache(maxsize=48)
def rich_edit_problem(markdown: str):
    """Why editing this note in the rich Editor would damage it, or None.

    The Editor saves by re-serialising the document, so a note is only
    editable there when that trip keeps every word, every checkbox, table
    row, image, heading and code fence, and is stable on a second pass.
    Anything else opens in Markdown mode instead.

    The check parses the note twice, which costs a third of a second on the
    longest notes in a real vault, so the answer is cached: reopening a tab
    or coming back to a note never pays for it again.
    """
    from collections import Counter

    once = roundtrip_markdown(markdown)

    missing = Counter(w.lower() for w in _WORD_RE.findall(markdown))
    missing.subtract(w.lower() for w in _WORD_RE.findall(once))
    lost = [w for w, n in missing.items() if n > 0 and w not in _MARKUP_WORDS]
    if lost:
        return f"se perderían {len(lost)} palabras (p. ej. «{lost[0]}»)"

    before, after = _outside_fences(markdown), _outside_fences(once)
    for name, pattern in _STRUCTURE.items():
        if len(pattern.findall(after)) < len(pattern.findall(before)):
            return f"se perderían {name}"
    if _fence_count(once) < _fence_count(markdown):
        return "se perderían bloques de código"
    if once.count("\\") > markdown.count("\\"):
        return "se añadirían barras invertidas"
    if roundtrip_markdown(once) != once:
        return "el texto cambiaría en cada guardado"
    return None


# ── Raw markdown tables ───────────────────────────────────────────────────

def split_row(line: str) -> list:
    inner = line.strip()
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|") and not inner.endswith("\\|"):
        inner = inner[:-1]
    cells, current, escaped = [], [], False
    for ch in inner:
        if ch == "|" and not escaped:
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
        escaped = ch == "\\" and not escaped
    cells.append("".join(current).strip())
    return cells


def sep_align(cell: str) -> str:
    cell = cell.strip()
    if cell.startswith(":") and cell.endswith(":"):
        return "center"
    if cell.endswith(":"):
        return "right"
    if cell.startswith(":"):
        return "left"
    return "none"


def table_span(lines: list, index: int):
    """(first, last) line indices of the table containing lines[index]."""
    if not (0 <= index < len(lines)) or not _TABLE_ROW_RE.match(lines[index]):
        return None
    first = index
    while first > 0 and _TABLE_ROW_RE.match(lines[first - 1]):
        first -= 1
    last = index
    while last + 1 < len(lines) and _TABLE_ROW_RE.match(lines[last + 1]):
        last += 1
    if last - first < 1:
        return None
    if not all(_TABLE_SEP_CELL_RE.match(c) for c in split_row(lines[first + 1])):
        return None
    return first, last


def align_table_lines(lines: list) -> list:
    """Re-pad a raw markdown table so every pipe lines up."""
    rows = [split_row(l) for l in lines]
    aligns = [sep_align(c) for c in rows[1]]
    body = [rows[0]] + rows[2:]
    indent = lines[0][:len(lines[0]) - len(lines[0].lstrip())]
    return [indent + l for l in format_table(body, aligns).split("\n")]


def format_markdown_tables(text: str) -> str:
    """Align every table in a markdown source, leaving fenced code alone."""
    lines = text.split("\n")
    out, i, in_code = [], 0, False
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith(("```", "~~~")):
            in_code = not in_code
        span = None if in_code else table_span(lines, i)
        if span and span[0] == i:
            out.extend(align_table_lines(lines[span[0]:span[1] + 1]))
            i = span[1] + 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def new_table(rows: int, cols: int) -> str:
    header = [f"Columna {c + 1}" for c in range(cols)]
    body = [[""] * cols for _ in range(max(1, rows - 1))]
    return format_table([header] + body, ["none"] * cols)

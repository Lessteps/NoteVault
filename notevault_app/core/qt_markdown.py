"""
QTextDocument -> Markdown.

Qt's own QTextDocument.toMarkdown() silently drops inline formatting in
Qt 6.11 (bold, italic and strikethrough all come back as plain text), so the
rich-text editor cannot rely on it to save. This walks the document itself
and writes the markdown, keeping headings, lists, quotes, code, links and
explicit font sizes.
"""

from PySide6.QtGui import (
    QTextDocument, QTextBlock, QTextFragment, QFont, QTextListFormat,
    QTextBlockFormat,
)

BASE_FONT_SIZE = 15.0
MONO_HINTS = ("mono", "consolas", "courier", "cascadia")

HEADING_SIZES = {1: 26.0, 2: 21.0, 3: 17.0}


def _is_mono(fmt) -> bool:
    # Only fontFamilies(): QTextCharFormat.fontFamily() crashes on Qt 6.11.
    families = fmt.fontFamilies()
    if not families:
        return False
    if isinstance(families, str):
        families = [families]
    for name in families:
        if any(hint in str(name).lower() for hint in MONO_HINTS):
            return True
    return False


def _list_prefix(block: QTextBlock) -> str:
    lst = block.textList()
    if lst is None:
        return ""
    style = lst.format().style()
    indent = max(0, lst.format().indent() - 1)
    pad = "    " * indent
    if style in (QTextListFormat.ListDecimal, QTextListFormat.ListLowerAlpha,
                 QTextListFormat.ListUpperAlpha, QTextListFormat.ListLowerRoman,
                 QTextListFormat.ListUpperRoman):
        return f"{pad}{lst.itemNumber(block) + 1}. "
    return f"{pad}- "


def _fragment_markdown(frag: QTextFragment, heading: int) -> str:
    text = frag.text().replace(" ", "\n").replace("￼", "")
    if not text:
        return ""
    fmt = frag.charFormat()

    # Trailing/leading spaces must stay outside the markers or the markup
    # does not apply ("** bold **" is literal text in CommonMark).
    lead = text[:len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    core = text.strip()
    if not core:
        return text

    if fmt.isAnchor() and fmt.anchorHref():
        return f"{lead}[{core}]({fmt.anchorHref()}){trail}"

    if _is_mono(fmt):
        return f"{lead}`{core}`{trail}"

    # Inside a heading the whole line is already bold and sized; only mark
    # italic and strikethrough so we do not emit "# **Title**".
    bold = fmt.fontWeight() >= QFont.Bold and not heading
    italic = fmt.fontItalic()
    strike = fmt.fontStrikeOut()

    size = fmt.fontPointSize()
    sized = (
        not heading and size
        and abs(size - BASE_FONT_SIZE) > 0.6
        and size not in HEADING_SIZES.values()
    )

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


def block_to_markdown(block: QTextBlock) -> str:
    heading = block.blockFormat().headingLevel()
    parts = []
    it = block.begin()
    while not it.atEnd():
        frag = it.fragment()
        if frag.isValid():
            parts.append(_fragment_markdown(frag, heading))
        it += 1
    text = "".join(parts).rstrip()

    if not text:
        return ""

    prefix = ""
    if heading:
        prefix = "#" * min(6, heading) + " "
    else:
        prefix = _list_prefix(block)
        if not prefix and block.blockFormat().indent() > 0:
            prefix = "> "
    return prefix + text


def document_to_markdown(doc: QTextDocument) -> str:
    lines = []
    block = doc.begin()
    prev_style = None
    while block.isValid():
        rendered = block_to_markdown(block)
        lst = block.textList()
        style = lst.format().style() if lst is not None else None
        if rendered:
            # Items of the same list stay glued together; everything else
            # (including a different list style) gets a blank line.
            same_list = style is not None and style == prev_style
            if lines and not same_list:
                lines.append("")
            lines.append(rendered)
            prev_style = style
        block = block.next()

    out = "\n".join(lines).strip()
    return out + "\n" if out else ""

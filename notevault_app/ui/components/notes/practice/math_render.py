"""LaTeX math (`$…$` inline, `$$…$$` display) rendered as images for Qt rich text.

ziamath typesets the formula to SVG (pure Python, ships its own STIX Two Math font),
QSvgRenderer rasterises it at the screen's device pixel ratio, and the image is placed
so that the formula's baseline sits on the text baseline.

Three entry points:
- `render_math(html)`: HTML in, HTML out (QLabel / setHtml). Images travel as data URIs.
- `markdown_with_math(md)` + `typeset_document(doc)`: for documents built with
  `QTextDocument.setMarkdown`. The first swaps each formula for an `nvmath:` image
  before Qt's importer can mangle the TeX; the second sizes and aligns those images.
A formula ziamath cannot parse is shown as its source in monospace, never raised.
"""

import base64
import hashlib
import html as _html
import math
import re
from collections import OrderedDict
from dataclasses import dataclass
from functools import lru_cache

from PySide6.QtCore import QBuffer, QByteArray, QIODevice, QRectF, QUrl, Qt
from PySide6.QtGui import (
    QFont, QFontMetricsF, QGuiApplication, QImage, QPainter, QTextCharFormat, QTextCursor,
    QTextDocument, QTextImageFormat,
)
from PySide6.QtSvg import QSvgRenderer

from .... import theme

TEXT_COLOUR = "#dcdde0"
SCHEME = "nvmath:"
MATH_SCALE = 1.12
# STIX hairlines (the bars of "=", fraction rules) fade to grey at 13-15 px next to
# Lexend; a thin outline in the fill colour gives them the text's weight.
EMBOLDEN = 0.03
DISPLAY_PAD = 4.0
H_MARGIN = 1.0
ANCHOR_FAMILY = "Arial"
LINE_SEP = "\u2028"
PLACEHOLDER = "\u200b"

_TAG_RE = re.compile(r"<[^>]*>")
_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_CODE_OPEN_RE = re.compile(r"<(code|pre|tt|kbd|samp)\b[^>]*>", re.IGNORECASE)
_FENCE_RE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")
_BLANK_LINE_RE = re.compile(r"\n[ \t>]*\n")

_CODE = "\x01"
_TAG = "\x00"


@dataclass(frozen=True)
class Formula:
    image: QImage
    width: float
    height: float
    font_px: int
    display: bool
    anchor_px: int
    label_image: QImage
    label_height: float


# ── Finding formulas ──────────────────────────────────────────────────────

def find_math(text: str) -> list[tuple[int, int, str, bool]]:
    """(start, end, tex, display) of every formula, in order.

    Pandoc's rules keep prices literal: an opening `$` must be followed by a
    non-space and the next `$` must close it (preceded by a non-space, not followed
    by a digit), so "$5 y $10" stays text. `\\$` is a literal dollar. A formula never crosses a
    blank line or a masked code character.
    """
    out, i, n = [], 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch != "$":
            i += 1
            continue
        if text.startswith("$$", i):
            j = _close(text, i + 2, display=True)
            if j is not None and text[i + 2:j].strip():
                out.append((i, j + 2, text[i + 2:j], True))
                i = j + 2
            else:
                i += 2
            continue
        j = _close(text, i + 1, display=False)
        if j is not None:
            out.append((i, j + 1, text[i + 1:j], False))
            i = j + 1
        else:
            i += 1
    return out


def _close(text: str, k: int, display: bool):
    n = len(text)
    if not display and (k >= n or text[k].isspace() or text[k] == "$"):
        return None
    j = k
    while j < n:
        ch = text[j]
        if ch == "\\":
            j += 2
            continue
        if ch == _CODE:
            return None
        if ch == "\n" and _BLANK_LINE_RE.match(text, j):
            return None
        if ch == "$":
            if display:
                if text.startswith("$$", j):
                    return j
                j += 1
                continue
            if not text[j - 1].isspace() and not (j + 1 < n and text[j + 1].isdigit()):
                return j
            return None
        j += 1
    return None


def _mask_html(text: str) -> str:
    chars = list(text)
    for m in _TAG_RE.finditer(text):
        chars[m.start():m.end()] = _TAG * (m.end() - m.start())
    pos = 0
    while True:
        m = _CODE_OPEN_RE.search(text, pos)
        if not m:
            break
        close = re.compile(rf"</{m.group(1)}\s*>", re.IGNORECASE).search(text, m.end())
        end = close.end() if close else len(text)
        chars[m.start():end] = _CODE * (end - m.start())
        pos = end
    return "".join(chars)


def _mask_markdown(text: str) -> str:
    chars = list(text)
    pos, fence = 0, None
    for line in text.split("\n"):
        end = pos + len(line)
        m = _FENCE_RE.match(line)
        if fence is not None:
            chars[pos:end] = _CODE * len(line)
            if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence):
                fence = None
        elif m:
            fence = m.group(1)
            chars[pos:end] = _CODE * len(line)
        pos = end + 1
    masked = "".join(chars)
    i = 0
    while True:
        i = masked.find("`", i)
        if i < 0:
            break
        run = len(masked[i:]) - len(masked[i:].lstrip("`"))
        close = re.compile(rf"(?<!`)`{{{run}}}(?!`)").search(masked, i + run)
        if not close:
            i += run
            continue
        chars[i:close.end()] = _CODE * (close.end() - i)
        masked = "".join(chars)
        i = close.end()
    return "".join(chars)


# ── Typesetting ───────────────────────────────────────────────────────────

def _dpr() -> float:
    app = QGuiApplication.instance()
    screen = app.primaryScreen() if app is not None else None
    return max(1.0, float(screen.devicePixelRatio())) if screen is not None else 1.0


def _anchor_font(font_px: int) -> QFont:
    font = QFont(ANCHOR_FAMILY)
    font.setPixelSize(max(1, int(font_px)))
    return font


@lru_cache(maxsize=64)
def _descent(anchor_px: int) -> float:
    return QFontMetricsF(_anchor_font(anchor_px)).descent()


_SVG_BOX_RE = re.compile(r'viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"')


_RELATION_CMD_RE = re.compile(
    r"\\(?:ge|le|geq|leq|neq|ne|gt|lt|to|in|notin|iff|implies|impliedby|Rightarrow|"
    r"Leftarrow|Leftrightarrow|rightarrow|leftarrow|mapsto|approx|equiv|sim|simeq|cong|"
    r"cdot|times|div|pm|mp|mid|colon|land|lor|lnot|neg|subset|subseteq|supset|supseteq|"
    r"cup|cap|setminus|quad|qquad|left[(\[{|.]|langle|lvert|lVert|big[lr]?[(\[]?)$")
_UNARY_AFTER = "([{,;:=<>&^_|"


def _unary_signs(tex: str) -> str:
    """Wrap a sign that starts an operand (`-1`, `\\ge -1`, `(-x)`) in braces: ziamath
    otherwise spaces it as a binary operator, where TeX would not."""
    out = []
    for i, ch in enumerate(tex):
        if ch in "+-" and (i == 0 or tex[i - 1] != "\\"):
            before = tex[:i].rstrip()
            if not before or before[-1] in _UNARY_AFTER or _RELATION_CMD_RE.search(before):
                out.append("{" + ch + "}")
                continue
        out.append(ch)
    return "".join(out)


@lru_cache(maxsize=1024)
def _typeset(tex: str, display: bool, font_px: int, colour: str, dpr: float):
    import ziamath

    ziamath.config.svg2 = False  # QSvgRenderer (SVG Tiny) cannot resolve <symbol>/<use href>
    svg = ziamath.Latex(_unary_signs(tex), size=font_px * MATH_SCALE, color=colour, inline=not display,
                        margin=0).svg()
    stroke = f' stroke="{colour}" stroke-width="{font_px * MATH_SCALE * EMBOLDEN:.3f}"'
    svg = svg.replace(f'fill="{colour}"', f'fill="{colour}"{stroke}')
    box = _SVG_BOX_RE.search(svg)
    if not box:
        raise ValueError("ziamath returned no viewBox")
    _, vy, vw, vh = (float(v) for v in box.groups())
    if vw <= 0 or vh <= 0:
        raise ValueError("empty formula")
    renderer = QSvgRenderer(QByteArray(svg.encode("utf-8")))
    if not renderer.isValid():
        raise ValueError("invalid SVG")
    ascent, depth = -vy, vy + vh
    # Qt puts the bottom of an AlignBaseline picture one font descent below the
    # baseline; the anchor font is sized so that descent covers the formula's depth.
    anchor_px = max(1, font_px)
    while _descent(anchor_px) < depth and anchor_px < 8 * font_px:
        anchor_px += 1
    below = max(_descent(anchor_px), depth)
    top = DISPLAY_PAD if display else 0.0
    width = vw + 2 * H_MARGIN
    height = top + ascent + below
    image = QImage(math.ceil(width * dpr), math.ceil(height * dpr),
                   QImage.Format_ARGB32_Premultiplied)
    image.setDevicePixelRatio(1.0)
    image.fill(Qt.transparent)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.Antialiasing)
    renderer.render(painter, QRectF(H_MARGIN * dpr, top * dpr, vw * dpr, vh * dpr))
    painter.end()
    ink = top + ascent + depth
    label = image.copy(0, 0, image.width(), min(image.height(), math.ceil(ink * dpr)))
    return Formula(image, width, height, font_px, display, anchor_px, label, ink)


def typeset(tex: str, *, display: bool = False, font_px: int = 15,
            colour: str | None = None) -> Formula | None:
    """The rendered formula, or None when the TeX cannot be typeset."""
    tex = tex.strip()
    if not tex:
        return None
    try:
        return _typeset(tex, display, int(font_px), colour or theme.tint(TEXT_COLOUR), _dpr())
    except Exception:  # noqa: BLE001 - any parser/renderer failure falls back to source
        return None


def _png_uri(image: QImage) -> str:
    data = QByteArray()
    buf = QBuffer(data)
    buf.open(QIODevice.WriteOnly)
    image.save(buf, "PNG")
    buf.close()
    return "data:image/png;base64," + base64.b64encode(bytes(data)).decode("ascii")


def _img_html(f: Formula) -> str:
    uri = _png_uri(f.label_image)
    _remember(uri, f)
    return (f"<img src=\"{uri}\" width=\"{f.width:.2f}\" height=\"{f.label_height:.2f}\">")


def _source_html(tex: str, display: bool) -> str:
    fence = "$$" if display else "$"
    return (f"<code style=\"font-family:{theme.CODE_FONT_FAMILY};\">"
            f"{_html.escape(fence + tex + fence)}</code>")


# ── HTML ──────────────────────────────────────────────────────────────────

def render_math(text: str, *, font_px: int = 15, colour: str | None = None) -> str:
    """Replace `$…$` / `$$…$$` in HTML with images (display math centred on its own
    line); text inside <code>/<pre> and tag attributes is left alone.

    The images are data URIs, so the HTML works anywhere (a QLabel sits a formula on
    the baseline by its lowest point). Shown in a QTextDocument, call
    `typeset_document(doc)` after `setHtml` for exact baseline alignment."""
    if not text or "$" not in text:
        return text or ""
    masked = _mask_html(text)
    out, pos = [], 0
    for start, end, _, display in find_math(masked):
        raw = _BR_RE.sub(" ", text[start:end])
        if "<" in raw:
            continue
        tex = _html.unescape(raw[2:-2] if display else raw[1:-1])
        f = typeset(tex, display=display, font_px=font_px, colour=colour)
        piece = _img_html(f) if f else _source_html(tex.strip(), display)
        if display:
            before = re.search(r"(?:<br\s*/?>\s*)$", text[pos:start], re.IGNORECASE)
            if before:
                start -= len(before.group(0))
            after = re.match(r"\s*<br\s*/?>", text[end:], re.IGNORECASE)
            if after:
                end += len(after.group(0))
            piece = f"<div align=\"center\">{piece}</div>"
        out.append(text[pos:start])
        out.append(piece)
        pos = end
    out.append(text[pos:])
    return "".join(out)


# ── Markdown documents ────────────────────────────────────────────────────

_REGISTRY: "OrderedDict[str, Formula]" = OrderedDict()
_REGISTRY_MAX = 1500


def _remember(name: str, f: Formula) -> None:
    _REGISTRY[name] = f
    _REGISTRY.move_to_end(name)
    while len(_REGISTRY) > _REGISTRY_MAX:
        _REGISTRY.popitem(last=False)


def _register(tex: str, f: Formula) -> str:
    key = f"{tex}\x00{f.font_px}\x00{f.display}\x00{f.image.cacheKey()}"
    name = f"{SCHEME}{hashlib.sha1(key.encode('utf-8')).hexdigest()[:24]}"
    _remember(name, f)
    return name


def math_image(name: str) -> QImage | None:
    """The image behind an `nvmath:` resource name (for loadResource overrides)."""
    f = _REGISTRY.get(name)
    return f.image if f else None


def _code_span(text: str) -> str:
    longest = max((len(r) for r in re.findall(r"`+", text)), default=0)
    ticks = "`" * (longest + 1)
    return f"{ticks} {text} {ticks}"


def markdown_with_math(markdown: str, *, font_px: int = 15, colour: str | None = None) -> str:
    """Swap each formula of a Markdown source for an `![](nvmath:…)` image. A display
    formula alone on its line becomes its own paragraph; call `typeset_document` on
    the document after `setMarkdown` to size, align and centre the images."""
    if not markdown or "$" not in markdown:
        return markdown or ""
    masked = _mask_markdown(markdown)
    out, pos = [], 0
    for start, end, tex, display in find_math(masked):
        tex = markdown[start + (2 if display else 1):end - (2 if display else 1)]
        tex = tex.replace("\\<", "<").replace(LINE_SEP, " ")
        f = typeset(tex, display=display, font_px=font_px, colour=colour)
        if f is None:
            piece = _code_span(("$$" if display else "$") + tex.strip()
                               + ("$$" if display else "$"))
        else:
            piece = f"![{PLACEHOLDER}]({_register(tex.strip(), f)})"
        if display and f is not None:
            line_start = markdown.rfind("\n", 0, start) + 1
            line_end = markdown.find("\n", end)
            line_end = len(markdown) if line_end < 0 else line_end
            prefix, suffix = markdown[line_start:start], markdown[end:line_end]
            if not prefix.strip() and len(prefix) < 4 and not suffix.strip() \
                    and line_start >= pos:
                out.append(markdown[pos:line_start])
                out.append(f"\n{piece}\n\n")
                pos = line_end
                continue
            piece = f"{LINE_SEP}{piece}{LINE_SEP}"
        out.append(markdown[pos:start])
        out.append(piece)
        pos = end
    out.append(markdown[pos:])
    return "".join(out)


def typeset_document(doc: QTextDocument) -> None:
    """Size and baseline-align every formula image of a document (from
    `markdown_with_math` or `render_math`) and centre the paragraphs that hold only a
    display formula."""
    cursor = QTextCursor(doc)
    cursor.beginEditBlock()
    try:
        block = doc.begin()
        while block.isValid():
            images, other = [], False
            it = block.begin()
            while not it.atEnd():
                frag = it.fragment()
                if frag.isValid():
                    fmt = frag.charFormat()
                    name = fmt.toImageFormat().name() if fmt.isImageFormat() else ""
                    if name in _REGISTRY:
                        images.append((frag.position(), frag.length(), name))
                    elif frag.text().strip(" \t" + LINE_SEP + PLACEHOLDER):
                        other = True
                it += 1
            for position, length, name in images:
                f = _REGISTRY[name]
                doc.addResource(QTextDocument.ImageResource, QUrl(name), f.image)
                fmt = QTextImageFormat()
                fmt.setName(name)
                fmt.setWidth(f.width)
                fmt.setHeight(f.height)
                fmt.setVerticalAlignment(QTextCharFormat.AlignBaseline)
                fmt.setFont(_anchor_font(f.anchor_px))
                span = QTextCursor(doc)
                span.setPosition(position)
                span.setPosition(position + length, QTextCursor.KeepAnchor)
                span.setCharFormat(fmt)
            if len(images) == 1 and not other and _REGISTRY[images[0][2]].display:
                bf = block.blockFormat()
                bf.setAlignment(Qt.AlignHCenter)
                QTextCursor(block).setBlockFormat(bf)
            block = block.next()
    finally:
        cursor.endEditBlock()

"""
The text surfaces a note is shown in.

  NoteTextEdit     the rich Editor mode
  NoteTextBrowser  the read-only Lectura mode
  NoteSourceEdit   the raw Markdown mode, also used for source code files

The rich surfaces behave like Obsidian's live view: nested lists get vertical
indentation guides, task checkboxes toggle on click, Tab and Shift+Tab move a
list item between levels, tables grow with Tab and a context menu, and images
or videos pasted or dropped into the note are copied into an `attachments`
folder beside it.
"""

import re
from functools import lru_cache
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QPoint, QPointF, QRectF, QUrl
from PySide6.QtGui import (
    QPainter, QColor, QPen, QImage, QFont, QTextCursor, QTextDocument,
    QTextListFormat, QTextBlockFormat, QTextImageFormat, QTextTableFormat,
    QTextCharFormat, QTextFormat, QBrush, QTextTable, QDesktopServices,
    QTextFrameFormat, QTextLength,
)
from PySide6.QtWidgets import QTextEdit, QTextBrowser, QMenu, QMessageBox

from ....core import attachments
from ....core.qt_markdown import (
    EMBED_SCHEME, PLACEHOLDER, table_span, align_table_lines, format_table,
    split_row, sep_align, is_mono as _is_mono,
)
from ... import theme
from .md_highlighter import MarkdownHighlighter

Marker = QTextBlockFormat.MarkerType

GUIDE_COLOR = "#3a3a4a"
BORDER = "#33333e"
HEADER_BG = "#26262e"
PAGE_BG = "#1a1a1e"
# Task checkboxes are painted by hand. Qt draws its own marker flush against
# the text, and there is no way to ask it for the gap every note app leaves
# between the box and the label.
BOX_SIZE = 13
BOX_GAP = 7
BOX_BORDER = "#6a6a72"
BOX_DONE = "#7c5af0"
INLINE_CODE_BG = "#2a2a32"
CURRENT_LINE_BG = "#202028"
CODE_BLOCK_BG = "#202024"
QUOTE_BAR = "#4848a0"
# The grid of a table reads as a grid only if its lines are a shade lighter
# than the panel borders around it.
TABLE_BORDER = "#44444e"
TABLE_PADDING = 8
MAX_IMAGE_WIDTH = 900

# Spacing for the rendered views, in pixels.
PARA_GAP = 12
HEADING_GAP = 21
LIST_GAP = 6
CODE_INDENT = 14
QUOTE_INDENT = 20
# One list level, in the raw source. Matches qt_markdown.INDENT so a note
# indented here and a note serialised from the Editor agree.
INDENT_STEP = "    "

# A list item and a quote in a markdown source, for Enter and Tab.
_SOURCE_ITEM_RE = re.compile(
    r"^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?(.*)$")
_SOURCE_QUOTE_RE = re.compile(r"^[ \t]*>+[ \t]?")


# ── Shared behaviour ──────────────────────────────────────────────────────

@lru_cache(maxsize=64)
def _video_poster(name: str, width: int, tint_key: str) -> QImage:
    height = int(width * 9 / 16)
    img = QImage(width, height, QImage.Format_ARGB32_Premultiplied)
    img.fill(Qt.transparent)
    p = QPainter(img)
    p.setRenderHint(QPainter.Antialiasing)
    p.setPen(QPen(QColor(theme.tint(BORDER)), 1))
    p.setBrush(QColor(theme.tint("#111111")))
    p.drawRoundedRect(QRectF(0.5, 0.5, width - 1, height - 1), 10, 10)
    cx, cy, r = width / 2, height / 2 - 12, 28
    p.setPen(Qt.NoPen)
    p.setBrush(QColor(theme.tint("#7c5af0")))
    p.drawEllipse(QPointF(cx, cy), r, r)
    p.setBrush(QColor("#ffffff"))
    tri = [QPointF(cx - 9, cy - 13), QPointF(cx - 9, cy + 13), QPointF(cx + 14, cy)]
    p.drawPolygon(tri)
    font = QFont("Segoe UI")
    font.setPixelSize(13)
    p.setFont(font)
    p.setPen(QColor(theme.tint("#dcdde0")))
    p.drawText(QRectF(12, cy + r + 10, width - 24, 22), Qt.AlignCenter,
               f"▶  {name}")
    font.setPixelSize(10)
    p.setFont(font)
    p.setPen(QColor(theme.tint("#888895")))
    p.drawText(QRectF(12, cy + r + 32, width - 24, 18), Qt.AlignCenter,
               "Clic para reproducir")
    p.end()
    return img


def _missing_image(name: str, width: int) -> QImage:
    img = QImage(width, 46, QImage.Format_ARGB32_Premultiplied)
    img.fill(Qt.transparent)
    p = QPainter(img)
    p.setPen(QPen(QColor(theme.tint("#f2555a")), 1, Qt.DashLine))
    p.drawRoundedRect(QRectF(0.5, 0.5, width - 1, 45), 6, 6)
    font = QFont("Segoe UI")
    font.setPixelSize(12)
    p.setFont(font)
    p.drawText(QRectF(10, 0, width - 20, 46), Qt.AlignVCenter | Qt.AlignLeft,
               f"No se encuentra el adjunto: {name}")
    p.end()
    return img


class _NoteSurface:
    """Mixed into both rich surfaces. The host sets `note_path` and
    `vault_root` whenever a note is loaded."""

    media_activated = None      # replaced by a Signal on each concrete class

    def _init_surface(self):
        self.note_path = None
        self.vault_root = None
        self._cursor_shape = None
        self.viewport().setMouseTracking(True)

    def _set_cursor_shape(self, shape):
        """setCursor() is a window-system call; the mouse moves far more
        often than the shape actually changes."""
        if shape != self._cursor_shape:
            self._cursor_shape = shape
            self.viewport().setCursor(shape)

    # resources ------------------------------------------------------------

    def _resource_name(self, url: QUrl) -> str:
        return url.toString(QUrl.ComponentFormattingOption.FullyDecoded)

    def attachment_path(self, name: str):
        if self.note_path is None:
            return None
        if name.startswith(EMBED_SCHEME):
            name = name[len(EMBED_SCHEME):]
        if name.startswith("file:"):
            name = QUrl(name).toLocalFile()
        return attachments.resolve(Path(self.note_path), name, self.vault_root)

    def _image_width(self) -> int:
        return max(160, min(MAX_IMAGE_WIDTH, self.viewport().width() - 40))

    def _load_note_resource(self, url: QUrl):
        name = self._resource_name(url)
        shown = name[len(EMBED_SCHEME):] if name.startswith(EMBED_SCHEME) else name
        path = self.attachment_path(name)
        width = self._image_width()
        if path is None:
            return _missing_image(Path(shown).name, min(width, 520))
        if attachments.kind_of(path) == "video":
            return _video_poster(Path(path).name, min(width, 560), theme.current())
        image = QImage(str(attachments.fs_path(path)))
        if image.isNull():
            return _missing_image(Path(shown).name, min(width, 520))
        if image.width() > width:
            image = image.scaledToWidth(width, Qt.SmoothTransformation)
        return image

    # indentation guides ---------------------------------------------------

    def _paint_guides(self):
        """Vertical rules: one per nesting level inside a list, and one
        alongside a blockquote, the way Obsidian marks both."""
        doc = self.document()
        layout = doc.documentLayout()
        vp = self.viewport()
        dx = -self.horizontalScrollBar().value()
        dy = -self.verticalScrollBar().value()
        top, bottom = -dy, -dy + vp.height()
        quote_prop = QTextFormat.Property.BlockQuoteLevel

        painter = QPainter(vp)
        guide = QPen(QColor(theme.tint(GUIDE_COLOR)), 1)
        bar = QPen(QColor(theme.tint(QUOTE_BAR)), 3)
        block = self.cursorForPosition(QPoint(0, 0)).block()
        while block.isValid():
            rect = layout.blockBoundingRect(block)
            if rect.top() > bottom:
                break
            if rect.bottom() < top:
                block = block.next()
                continue
            lst = block.textList()
            line = block.layout().lineAt(0)
            fmt = block.blockFormat()
            if lst is not None and line.isValid():
                painter.setPen(guide)
                level = lst.format().indent()
                # Qt lays level n's text out at n steps from the block edge.
                step = line.x() / max(1, level)
                base = rect.left() + dx
                for k in range(1, level):
                    # As in Obsidian, an ancestor's guide falls where that
                    # ancestor's own text starts.
                    x = round(base + k * step) + 0.5
                    painter.drawLine(QPointF(x, rect.top() + dy),
                                     QPointF(x, rect.bottom() + dy))
                if fmt.marker() != Marker.NoMarker:
                    self._paint_checkbox(painter, rect, line, dx, dy,
                                         fmt.marker() == Marker.Checked)
            elif fmt.hasProperty(quote_prop) and fmt.intProperty(quote_prop):
                painter.setPen(bar)
                x = rect.left() + dx + fmt.leftMargin() - QUOTE_INDENT / 2
                painter.drawLine(QPointF(x, rect.top() + dy),
                                 QPointF(x, rect.bottom() + dy))
            block = block.next()
        painter.end()

    def _paint_checkbox(self, painter, rect, line, dx, dy, checked: bool):
        """Cover Qt's marker and draw the box a few pixels to its left.

        Qt paints the marker hard against the first character, which reads as
        one word; every note app leaves a gap there.
        """
        text_x = rect.left() + dx + line.x()
        top = rect.top() + dy + line.y()
        slot = QRectF(text_x - self.document().indentWidth(), top,
                      self.document().indentWidth(), line.height())
        painter.save()
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor(theme.tint(PAGE_BG)))
        painter.drawRect(slot)

        box = QRectF(text_x - BOX_GAP - BOX_SIZE,
                     top + (line.height() - BOX_SIZE) / 2,
                     BOX_SIZE, BOX_SIZE)
        painter.setRenderHint(QPainter.Antialiasing)
        if checked:
            painter.setBrush(QColor(theme.tint(BOX_DONE)))
            painter.setPen(Qt.NoPen)
            painter.drawRoundedRect(box, 3, 3)
            painter.setPen(QPen(QColor("#ffffff"), 2))
            painter.drawPolyline([
                QPointF(box.left() + 3, box.center().y()),
                QPointF(box.center().x() - 0.5, box.bottom() - 3.5),
                QPointF(box.right() - 2.5, box.top() + 3.5),
            ])
        else:
            painter.setBrush(Qt.NoBrush)
            painter.setPen(QPen(QColor(theme.tint(BOX_BORDER)), 1.4))
            painter.drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), 3, 3)
        painter.restore()

    # checkboxes and media -------------------------------------------------

    def _marker_hit(self, pos: QPoint):
        """The task block whose checkbox is under pos, or None."""
        cursor = self.cursorForPosition(pos)
        block = cursor.block()
        if block.blockFormat().marker() == Marker.NoMarker or block.textList() is None:
            return None
        rect = self.document().documentLayout().blockBoundingRect(block)
        dx = -self.horizontalScrollBar().value()
        dy = -self.verticalScrollBar().value()
        line = block.layout().lineAt(0)
        if not line.isValid():
            return None
        text_x = rect.left() + dx + line.x()
        line_top = rect.top() + dy + line.y()
        if not (line_top <= pos.y() <= line_top + line.height()):
            return None
        indent_w = self.document().indentWidth()
        if text_x - indent_w <= pos.x() < text_x:
            return block
        return None

    def _image_at(self, pos: QPoint):
        cursor = self.cursorForPosition(pos)
        for offset in (0, 1):
            c = QTextCursor(cursor)
            if offset:
                if not c.movePosition(QTextCursor.NextCharacter):
                    continue
            fmt = c.charFormat()
            if fmt.isImageFormat():
                return fmt.toImageFormat().name()
        return None

    def _open_media(self, pos: QPoint) -> bool:
        name = self._image_at(pos)
        if not name:
            return False
        path = self.attachment_path(name)
        if path is None:
            return False
        self.media_activated.emit(str(path))
        return True


# ── Editor mode ───────────────────────────────────────────────────────────

class NoteTextEdit(_NoteSurface, QTextEdit):
    media_activated = Signal(str)
    attachment_failed = Signal(str)

    def __init__(self, parent=None):
        QTextEdit.__init__(self, parent)
        self._init_surface()
        self.setAcceptRichText(True)

    def loadResource(self, rtype, url):
        if rtype == QTextDocument.ImageResource:
            return self._load_note_resource(url)
        return super().loadResource(rtype, url)

    def paintEvent(self, event):
        super().paintEvent(event)
        self._paint_guides()

    def load_markdown(self, markdown: str):
        self.document().clear()
        self.document().setMarkdown(markdown)
        style_document(self.document())

    # mouse ----------------------------------------------------------------

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            block = self._marker_hit(event.position().toPoint())
            if block is not None:
                toggle_marker(block)
                return
        super().mousePressEvent(event)

    def mouseDoubleClickEvent(self, event):
        if event.button() == Qt.LeftButton and self._open_media(event.position().toPoint()):
            return
        super().mouseDoubleClickEvent(event)

    def mouseMoveEvent(self, event):
        pos = event.position().toPoint()
        shape = (Qt.PointingHandCursor if self._marker_hit(pos) is not None
                 else Qt.IBeamCursor)
        self._set_cursor_shape(shape)
        super().mouseMoveEvent(event)

    # keyboard -------------------------------------------------------------

    def keyPressEvent(self, event):
        cursor = self.textCursor()
        key, mods = event.key(), event.modifiers()
        table = cursor.currentTable()

        if key in (Qt.Key_Tab, Qt.Key_Backtab) and table is not None:
            self._move_in_table(table, backwards=(key == Qt.Key_Backtab
                                                  or mods & Qt.ShiftModifier))
            return

        block = cursor.block()
        lst = block.textList()
        if key in (Qt.Key_Tab, Qt.Key_Backtab) and lst is not None:
            delta = -1 if (key == Qt.Key_Backtab or mods & Qt.ShiftModifier) else 1
            set_list_level(cursor, lst.format().indent() + delta)
            return

        if key in (Qt.Key_Return, Qt.Key_Enter) and lst is not None \
                and not mods & Qt.ShiftModifier:
            if not block.text().replace(PLACEHOLDER, "").strip():
                # Enter on an empty item climbs a level, then leaves the list.
                set_list_level(cursor, lst.format().indent() - 1)
                return
            was_task = block.blockFormat().marker() != Marker.NoMarker
            super().keyPressEvent(event)
            if was_task:
                new = self.textCursor()
                fmt = new.blockFormat()
                fmt.setMarker(Marker.Unchecked)
                new.setBlockFormat(fmt)
            return

        if key == Qt.Key_Space and not mods and table is None:
            if self._autoformat_list(cursor):
                return

        super().keyPressEvent(event)

    def _autoformat_list(self, cursor: QTextCursor) -> bool:
        """Typing "- ", "* ", "1. ", "[] " or "- [ ] " at the start of a line
        turns it into a list, the way Obsidian and Notion do."""
        block = cursor.block()
        if block.textList() is not None:
            prefix = block.text()[:cursor.positionInBlock()]
            if prefix in ("[]", "[ ]"):
                self._replace_prefix(cursor, len(prefix))
                fmt = cursor.blockFormat()
                fmt.setMarker(Marker.Unchecked)
                cursor.setBlockFormat(fmt)
                return True
            return False
        prefix = block.text()[:cursor.positionInBlock()]
        rules = {
            "-": (QTextListFormat.ListDisc, False),
            "*": (QTextListFormat.ListCircle, False),
            "+": (QTextListFormat.ListSquare, False),
            "1.": (QTextListFormat.ListDecimal, False),
            "[]": (QTextListFormat.ListDisc, True),
            "[ ]": (QTextListFormat.ListDisc, True),
            "- []": (QTextListFormat.ListDisc, True),
            "- [ ]": (QTextListFormat.ListDisc, True),
        }
        if prefix not in rules:
            return False
        style, task = rules[prefix]
        cursor.beginEditBlock()
        self._replace_prefix(cursor, len(prefix))
        fmt = QTextListFormat()
        fmt.setStyle(style)
        fmt.setIndent(1)
        cursor.createList(fmt)
        if task:
            bfmt = cursor.blockFormat()
            bfmt.setMarker(Marker.Unchecked)
            cursor.setBlockFormat(bfmt)
        cursor.endEditBlock()
        return True

    @staticmethod
    def _replace_prefix(cursor: QTextCursor, length: int):
        cursor.movePosition(QTextCursor.StartOfBlock)
        cursor.movePosition(QTextCursor.NextCharacter, QTextCursor.KeepAnchor, length)
        cursor.removeSelectedText()

    def _move_in_table(self, table, backwards: bool):
        cell = table.cellAt(self.textCursor())
        row, col = cell.row(), cell.column()
        if backwards:
            col -= 1
            if col < 0:
                row, col = row - 1, table.columns() - 1
            if row < 0:
                return
        else:
            col += 1
            if col >= table.columns():
                row, col = row + 1, 0
            if row >= table.rows():
                # Only this table changed: restyling the whole document here
                # cost a second on a note full of tables.
                table.appendRows(1)
        self.setTextCursor(table.cellAt(row, col).firstCursorPosition())

    # tables -----------------------------------------------------------------

    def current_table(self):
        return self.textCursor().currentTable()

    def insert_table(self, rows: int = 3, cols: int = 3):
        cursor = self.textCursor()
        cursor.beginEditBlock()
        if cursor.block().text():
            cursor.movePosition(QTextCursor.EndOfBlock)
            cursor.insertBlock(QTextBlockFormat())
        table = cursor.insertTable(rows, cols, _table_format())
        bold = QTextCharFormat()
        bold.setFontWeight(QFont.Bold)
        for c in range(cols):
            table.cellAt(0, c).firstCursorPosition().insertText(f"Columna {c + 1}", bold)
        style_table(table)
        cursor.endEditBlock()
        self.setTextCursor(table.cellAt(1 if rows > 1 else 0, 0).firstCursorPosition())
        self.setFocus()
        return table

    def table_add_row(self, above: bool):
        table = self.current_table()
        if table is None:
            return False
        row = table.cellAt(self.textCursor()).row()
        if above and row == 0:
            row = 1          # the header stays the first row
            above = False
        table.insertRows(row if above else row + 1, 1)
        return True

    def table_add_column(self, left: bool):
        table = self.current_table()
        if table is None:
            return False
        col = table.cellAt(self.textCursor()).column()
        table.insertColumns(col if left else col + 1, 1)
        style_table(table)      # the new header cell needs its shade
        return True

    def table_remove_row(self):
        table = self.current_table()
        if table is None or table.rows() <= 2:
            return False
        row = table.cellAt(self.textCursor()).row()
        if row == 0:
            return False
        table.removeRows(row, 1)
        return True

    def table_remove_column(self):
        table = self.current_table()
        if table is None or table.columns() <= 1:
            return False
        table.removeColumns(table.cellAt(self.textCursor()).column(), 1)
        return True

    def table_delete(self):
        table = self.current_table()
        if table is None:
            return False
        cursor = QTextCursor(self.document())
        cursor.setPosition(table.firstPosition() - 1)
        cursor.setPosition(table.lastPosition() + 1, QTextCursor.KeepAnchor)
        cursor.removeSelectedText()
        return True

    def contextMenuEvent(self, event):
        menu = self.createStandardContextMenu(event.pos())
        if self.current_table() is not None:
            first = menu.actions()[0] if menu.actions() else None
            table_menu = QMenu("Tabla", menu)
            table_menu.addAction("Añadir fila arriba", lambda: self.table_add_row(True))
            table_menu.addAction("Añadir fila abajo", lambda: self.table_add_row(False))
            table_menu.addAction("Añadir columna a la izquierda",
                                 lambda: self.table_add_column(True))
            table_menu.addAction("Añadir columna a la derecha",
                                 lambda: self.table_add_column(False))
            table_menu.addSeparator()
            table_menu.addAction("Eliminar fila", self.table_remove_row)
            table_menu.addAction("Eliminar columna", self.table_remove_column)
            table_menu.addAction("Eliminar tabla", self.table_delete)
            menu.insertMenu(first, table_menu)
            menu.insertSeparator(first)
        menu.exec(event.globalPos())

    # paste and drop ---------------------------------------------------------

    def canInsertFromMimeData(self, source):
        return source.hasImage() or source.hasUrls() or super().canInsertFromMimeData(source)

    def insertFromMimeData(self, source):
        if self.note_path is not None and _insert_attachments(self, source):
            return
        super().insertFromMimeData(source)

    def insert_attachment_file(self, file_path: Path):
        embed_files(self, [Path(file_path)])


# ── Reading mode ──────────────────────────────────────────────────────────

class NoteTextBrowser(_NoteSurface, QTextBrowser):
    media_activated = Signal(str)
    task_toggled = Signal(int)         # index of the task among all tasks
    note_link_activated = Signal(str)  # wikilink target

    def __init__(self, parent=None):
        QTextBrowser.__init__(self, parent)
        self._init_surface()
        self.setOpenLinks(False)
        self.anchorClicked.connect(self._on_anchor)

    def loadResource(self, rtype, url):
        if rtype == QTextDocument.ImageResource:
            return self._load_note_resource(url)
        return super().loadResource(rtype, url)

    def paintEvent(self, event):
        super().paintEvent(event)
        self._paint_guides()

    def load_markdown(self, markdown: str):
        self.document().clear()
        self.document().setMarkdown(markdown)
        style_document(self.document())

    def _on_anchor(self, url: QUrl):
        if url.scheme() == "nv-note":
            self.note_link_activated.emit(
                url.toString(QUrl.ComponentFormattingOption.FullyDecoded)[len("nv-note:"):])
            return
        QDesktopServices.openUrl(url)

    def mousePressEvent(self, event):
        pos = event.position().toPoint()
        if event.button() == Qt.LeftButton:
            block = self._marker_hit(pos)
            if block is not None:
                self.task_toggled.emit(_task_index(block))
                return
            if self._open_media(pos):
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        pos = event.position().toPoint()
        hand = self._marker_hit(pos) is not None or self._image_at(pos) is not None
        self._set_cursor_shape(Qt.PointingHandCursor if hand else Qt.ArrowCursor)
        super().mouseMoveEvent(event)


# ── Markdown mode and code files ──────────────────────────────────────────

class NoteSourceEdit(QTextEdit):
    """The Markdown mode, and the view for source files.

    Most notes live here, so it carries the writing comforts Obsidian's
    source mode has: the markdown is coloured, Enter continues a list or a
    quote, Tab moves an item between levels or re-aligns the table under the
    caret, typing a marker around a selection wraps it, and a right click
    inside a table offers the row and column commands. A code file gets a
    plain editor with none of that.
    """

    table_changed = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.note_path = None
        self._is_code = False
        self.setAcceptRichText(False)
        self.setTabStopDistance(4 * self.fontMetrics().horizontalAdvance(" "))
        self._highlighter = MarkdownHighlighter(self.document())
        self.cursorPositionChanged.connect(self._mark_current_line)

    @property
    def is_code(self) -> bool:
        return self._is_code

    @is_code.setter
    def is_code(self, value: bool):
        value = bool(value)
        if value == self._is_code:
            return
        self._is_code = value
        # A script is not markdown: colouring its `#` lines as headings and
        # its `*` as emphasis would be worse than no colour at all.
        self._highlighter.enabled = not value
        self._repaint_source()

    def retheme(self):
        self._repaint_source(self._highlighter.retheme)
        self._mark_current_line()

    def _repaint_source(self, run=None):
        """Re-run the highlighter without the editor hearing about it.

        Applying formats goes through the document, so it reaches
        textChanged; without this guard, recolouring a note — on a theme
        switch, say — marked it as edited and queued a save of a file
        nobody had touched.
        """
        blocked = self.blockSignals(True)
        try:
            (run or self._highlighter.rehighlight)()
        finally:
            self.blockSignals(blocked)

    def _mark_current_line(self):
        line = QTextEdit.ExtraSelection()
        line.format.setBackground(QColor(theme.tint(CURRENT_LINE_BG)))
        line.format.setProperty(QTextFormat.Property.FullWidthSelection, True)
        cursor = self.textCursor()
        cursor.clearSelection()
        line.cursor = cursor
        self.setExtraSelections([line])

    # keyboard ---------------------------------------------------------------

    def keyPressEvent(self, event):
        key, mods = event.key(), event.modifiers()
        shift = bool(mods & Qt.ShiftModifier)

        if self._is_code:
            if key == Qt.Key_Tab:
                self.textCursor().insertText("    ")
                return
            super().keyPressEvent(event)
            return

        if key in (Qt.Key_Tab, Qt.Key_Backtab):
            back = shift or key == Qt.Key_Backtab
            if not back and self._align_table():
                return
            if self.shift_lines(-1 if back else +1):
                return
            if not back:
                self.textCursor().insertText("    ")
                return
            return

        if key in (Qt.Key_Return, Qt.Key_Enter) and not shift \
                and not self.textCursor().hasSelection():
            if self._continue_block():
                return

        if event.text() and self.textCursor().hasSelection() \
                and self._wrap_selection(event.text()):
            return

        super().keyPressEvent(event)

    def _wrap_selection(self, char: str) -> bool:
        """Typing a marker with text selected wraps it instead of replacing
        it, which is how every note app behaves and how a selection stops
        being destroyed by a stray keystroke."""
        pairs = {"*": ("*", "*"), "_": ("_", "_"), "`": ("`", "`"),
                 "~": ("~", "~"), "[": ("[", "]"), "(": ("(", ")"),
                 "{": ("{", "}"), '"': ('"', '"')}
        pair = pairs.get(char)
        if pair is None:
            return False
        cursor = self.textCursor()
        text = cursor.selectedText().replace(" ", "\n")
        start = min(cursor.anchor(), cursor.position())
        cursor.insertText(pair[0] + text + pair[1])
        cursor.setPosition(start + 1)
        cursor.setPosition(start + 1 + len(text), QTextCursor.KeepAnchor)
        self.setTextCursor(cursor)
        return True

    def _continue_block(self) -> bool:
        """Enter keeps a list, a task list or a quote going, and an empty
        item ends it instead of leaving a dangling bullet behind."""
        cursor = self.textCursor()
        line = cursor.block().text()
        if cursor.positionInBlock() < len(line.rstrip()):
            return False        # mid-line: let Enter split the line normally

        m = _SOURCE_ITEM_RE.match(line)
        if m is None:
            quote = _SOURCE_QUOTE_RE.match(line)
            if quote is None:
                return False
            if not line[quote.end():].strip():
                self._replace_block("")
                return True
            cursor.insertText("\n" + quote.group(0))
            return True

        indent, bullet, space, box, text = m.groups()
        if not (text or "").strip():
            # An empty item: drop a level, or leave the list entirely.
            self._replace_block(indent[:-4] + bullet + space + (box or "")
                                if len(indent) >= 4 else "")
            return True

        if bullet[:-1].isdigit():
            bullet = f"{int(bullet[:-1]) + 1}{bullet[-1]}"
        box = "[ ] " if box else ""
        cursor.insertText(f"\n{indent}{bullet}{space}{box}")
        self.setTextCursor(cursor)
        return True

    def _replace_block(self, text: str):
        cursor = self.textCursor()
        cursor.select(QTextCursor.BlockUnderCursor)
        cursor.removeSelectedText()
        if cursor.block().text() or cursor.position() > 0:
            cursor.insertText("\n" + text)
        else:
            cursor.insertText(text)
        self.setTextCursor(cursor)

    def shift_lines(self, delta: int) -> bool:
        """Indent or outdent every selected line, by one list level."""
        cursor = self.textCursor()
        doc = self.document()
        first = doc.findBlock(min(cursor.anchor(), cursor.position()))
        last = doc.findBlock(max(cursor.anchor(), cursor.position()))
        if first == last and not _SOURCE_ITEM_RE.match(first.text()) \
                and not cursor.hasSelection():
            return False

        edit = QTextCursor(doc)
        edit.beginEditBlock()
        block = first
        while block.isValid():
            text = block.text()
            c = QTextCursor(block)
            if delta > 0:
                if text.strip():
                    c.insertText(INDENT_STEP)
            else:
                strip = 0
                while strip < len(INDENT_STEP) and strip < len(text) \
                        and text[strip] == " ":
                    strip += 1
                if strip:
                    c.movePosition(QTextCursor.NextCharacter,
                                   QTextCursor.KeepAnchor, strip)
                    c.removeSelectedText()
            if block == last:
                break
            block = block.next()
        edit.endEditBlock()
        return True

    # tables -----------------------------------------------------------------

    def _table_here(self):
        """(lines, first, last) of the markdown table under the caret."""
        lines = self.toPlainText().split("\n")
        span = table_span(lines, self.textCursor().blockNumber())
        return (lines, *span) if span else None

    def _write_table(self, lines: list, first: int, last: int, rows: list,
                     aligns: list):
        body = format_table(rows, aligns).split("\n")
        indent = lines[first][:len(lines[first]) - len(lines[first].lstrip())]
        doc = self.document()
        edit = QTextCursor(doc)
        edit.beginEditBlock()
        start = doc.findBlockByNumber(first)
        end = doc.findBlockByNumber(last)
        edit.setPosition(start.position())
        edit.setPosition(end.position() + end.length() - 1, QTextCursor.KeepAnchor)
        edit.insertText("\n".join(indent + l for l in body))
        edit.endEditBlock()
        self.table_changed.emit()

    def _table_parts(self):
        found = self._table_here()
        if found is None:
            return None
        lines, first, last = found
        rows = [split_row(l) for l in lines[first:last + 1]]
        aligns = [sep_align(c) for c in rows[1]]
        body = [rows[0]] + rows[2:]
        row_index = self.textCursor().blockNumber() - first
        row_index = 0 if row_index <= 1 else row_index - 1
        col_index = split_row(
            self.textCursor().block().text()[:self.textCursor().positionInBlock()]
        )
        col_index = max(0, len(col_index) - 1)
        return lines, first, last, body, aligns, row_index, col_index

    def in_table(self) -> bool:
        return self._table_here() is not None

    def table_add_row(self, above: bool) -> bool:
        parts = self._table_parts()
        if parts is None:
            return False
        lines, first, last, body, aligns, row, _col = parts
        if row == 0 and above:
            row = 1          # the header row stays first
            above = False
        body.insert(row if above else row + 1, [""] * len(aligns))
        self._write_table(lines, first, last, body, aligns)
        return True

    def table_add_column(self, left: bool) -> bool:
        parts = self._table_parts()
        if parts is None:
            return False
        lines, first, last, body, aligns, _row, col = parts
        at = col if left else col + 1
        at = max(0, min(at, len(aligns)))
        for i, r in enumerate(body):
            r.insert(at, f"Columna {at + 1}" if i == 0 else "")
        aligns.insert(at, "none")
        self._write_table(lines, first, last, body, aligns)
        return True

    def table_remove_row(self) -> bool:
        parts = self._table_parts()
        if parts is None:
            return False
        lines, first, last, body, aligns, row, _col = parts
        if row == 0 or len(body) <= 2:
            return False
        body.pop(row)
        self._write_table(lines, first, last, body, aligns)
        return True

    def table_remove_column(self) -> bool:
        parts = self._table_parts()
        if parts is None:
            return False
        lines, first, last, body, aligns, _row, col = parts
        if len(aligns) <= 1:
            return False
        for r in body:
            if col < len(r):
                r.pop(col)
        aligns.pop(col)
        self._write_table(lines, first, last, body, aligns)
        return True

    def table_set_alignment(self, how: str) -> bool:
        parts = self._table_parts()
        if parts is None:
            return False
        lines, first, last, body, aligns, _row, col = parts
        aligns[col] = how
        self._write_table(lines, first, last, body, aligns)
        return True

    def table_delete(self) -> bool:
        found = self._table_here()
        if found is None:
            return False
        lines, first, last = found
        doc = self.document()
        edit = QTextCursor(doc)
        edit.beginEditBlock()
        start = doc.findBlockByNumber(first)
        end = doc.findBlockByNumber(last)
        edit.setPosition(start.position())
        edit.setPosition(end.position() + end.length() - 1, QTextCursor.KeepAnchor)
        edit.removeSelectedText()
        edit.deletePreviousChar()
        edit.endEditBlock()
        return True

    def contextMenuEvent(self, event):
        menu = self.createStandardContextMenu(event.pos())
        if not self._is_code and self.in_table():
            first = menu.actions()[0] if menu.actions() else None
            table_menu = QMenu("Tabla", menu)
            table_menu.addAction("Añadir fila arriba", lambda: self.table_add_row(True))
            table_menu.addAction("Añadir fila abajo", lambda: self.table_add_row(False))
            table_menu.addAction("Añadir columna a la izquierda",
                                 lambda: self.table_add_column(True))
            table_menu.addAction("Añadir columna a la derecha",
                                 lambda: self.table_add_column(False))
            table_menu.addSeparator()
            table_menu.addAction("Alinear la columna a la izquierda",
                                 lambda: self.table_set_alignment("left"))
            table_menu.addAction("Centrar la columna",
                                 lambda: self.table_set_alignment("center"))
            table_menu.addAction("Alinear la columna a la derecha",
                                 lambda: self.table_set_alignment("right"))
            table_menu.addSeparator()
            table_menu.addAction("Eliminar fila", self.table_remove_row)
            table_menu.addAction("Eliminar columna", self.table_remove_column)
            table_menu.addAction("Eliminar tabla", self.table_delete)
            menu.insertMenu(first, table_menu)
            menu.insertSeparator(first)
        menu.exec(event.globalPos())

    def _align_table(self) -> bool:
        cursor = self.textCursor()
        lines = self.toPlainText().split("\n")
        line_no = cursor.blockNumber()
        span = table_span(lines, line_no)
        if span is None:
            return False
        first, last = span
        column = cursor.block().text()[:cursor.positionInBlock()].count("|")
        aligned = align_table_lines(lines[first:last + 1])
        edit = QTextCursor(self.document())
        edit.beginEditBlock()
        start = self.document().findBlockByNumber(first)
        end = self.document().findBlockByNumber(last)
        edit.setPosition(start.position())
        edit.setPosition(end.position() + end.length() - 1, QTextCursor.KeepAnchor)
        edit.insertText("\n".join(aligned))
        edit.endEditBlock()
        # Move to the next cell, wrapping onto the next row.
        target_line = line_no
        target_col = column + 1
        if target_col >= aligned[line_no - first].count("|"):
            target_line, target_col = line_no + 1, 1
            if target_line == first + 1:
                target_line += 1
            if target_line > last:
                return True
        text = self.document().findBlockByNumber(target_line).text()
        idx = -1
        for _ in range(target_col):
            idx = text.find("|", idx + 1)
            if idx < 0:
                return True
        c = QTextCursor(self.document().findBlockByNumber(target_line))
        c.movePosition(QTextCursor.NextCharacter, QTextCursor.MoveAnchor, idx + 2)
        self.setTextCursor(c)
        return True

    def canInsertFromMimeData(self, source):
        if not self.is_code and (source.hasImage() or source.hasUrls()):
            return True
        return super().canInsertFromMimeData(source)

    def insertFromMimeData(self, source):
        if not self.is_code and self.note_path is not None \
                and _insert_attachments(self, source):
            return
        self.insertPlainText(source.text())


# ── Helpers ───────────────────────────────────────────────────────────────

def _table_format() -> QTextTableFormat:
    fmt = QTextTableFormat()
    fmt.setBorder(1)
    fmt.setBorderStyle(QTextFrameFormat.BorderStyle.BorderStyle_Solid)
    fmt.setBorderBrush(QBrush(QColor(theme.tint(TABLE_BORDER))))
    fmt.setBorderCollapse(True)
    fmt.setCellPadding(TABLE_PADDING)
    fmt.setCellSpacing(0)
    fmt.setHeaderRowCount(1)
    # A table takes the whole writing width and shares it between its
    # columns, so a long cell wraps onto several lines instead of the table
    # shrinking to its longest line and leaving the page half empty.
    fmt.setWidth(QTextLength(QTextLength.PercentageLength, 100))
    return fmt


def style_table(table: QTextTable):
    """Give one table the grid, and its header row its own shade."""
    base = _table_format()
    fmt = table.format()
    fmt.setBorder(base.border())
    fmt.setBorderStyle(base.borderStyle())
    fmt.setBorderBrush(base.borderBrush())
    fmt.setBorderCollapse(True)
    fmt.setCellPadding(base.cellPadding())
    fmt.setCellSpacing(0)
    fmt.setTopMargin(PARA_GAP)
    fmt.setBottomMargin(PARA_GAP)
    fmt.setWidth(base.width())
    table.setFormat(fmt)
    header = QColor(theme.tint(HEADER_BG))
    for r in range(table.rows()):
        for c in range(table.columns()):
            cell = table.cellAt(r, c)
            cfmt = cell.format().toTableCellFormat()
            cfmt.setVerticalAlignment(QTextCharFormat.AlignTop)
            if r == 0:
                cfmt.setBackground(header)
            cell.setFormat(cfmt)
            _drop_leading_blank(cell)
            if r == 0:
                # The importer loses the header's weight when the table
                # follows a quote. The serialiser writes header cells with
                # plain_bold, so it cannot read this back as emphasis.
                bold = QTextCharFormat()
                bold.setFontWeight(QFont.Bold)
                span = QTextCursor(cell.firstCursorPosition())
                span.setPosition(cell.lastPosition(), QTextCursor.KeepAnchor)
                span.mergeCharFormat(bold)


def _drop_leading_blank(cell):
    """Remove the empty paragraph Qt's importer sometimes puts at the top of
    a cell, which leaves that one cell a line taller than its row.

    The serialiser already skips empty paragraphs inside a cell, so nothing
    that reaches the file changes.
    """
    start = cell.firstCursorPosition()
    if start.block().text():
        return
    end = cell.lastCursorPosition()
    if start.block() == end.block():
        return          # the cell really is empty
    cursor = QTextCursor(start)
    cursor.movePosition(QTextCursor.NextBlock, QTextCursor.KeepAnchor)
    cursor.removeSelectedText()


def style_document(doc: QTextDocument):
    """Give a rendered note the air Obsidian gives it.

    Qt's markdown importer stacks every block flush against the next, which
    reads as a wall of text: paragraphs, headings, quotes and code all run
    together. This adds the spacing, the quote indent and the code-block
    shade after the import.

    Only block margins and backgrounds are touched. `document_to_markdown()`
    reads the heading level, the list, the task marker, the quote level, the
    code fence and the character formats — none of them — so the styling can
    never change what is written back to the file.
    """
    cursor = QTextCursor(doc)
    cursor.beginEditBlock()
    try:
        code_bg = QColor(theme.tint(CODE_BLOCK_BG))
        block = doc.begin()
        first = True
        while block.isValid():
            if QTextCursor(block).currentTable() is not None:
                block = block.next()
                continue
            fmt = block.blockFormat()
            heading = fmt.headingLevel()
            quote = (fmt.intProperty(QTextFormat.Property.BlockQuoteLevel)
                     if fmt.hasProperty(QTextFormat.Property.BlockQuoteLevel) else 0)
            code = fmt.hasProperty(QTextFormat.Property.BlockCodeFence)

            if code:
                fmt.setTopMargin(0)
                fmt.setBottomMargin(0)
                fmt.setLeftMargin(CODE_INDENT)
                fmt.setBackground(code_bg)
            elif heading:
                fmt.setTopMargin(0 if first else HEADING_GAP)
                fmt.setBottomMargin(HEADING_GAP // 3)
                fmt.setLeftMargin(0)
            elif quote:
                fmt.setTopMargin(2)
                fmt.setBottomMargin(2)
                fmt.setLeftMargin(QUOTE_INDENT * quote)
            elif block.textList() is not None:
                fmt.setTopMargin(0)
                fmt.setBottomMargin(LIST_GAP)
            else:
                fmt.setTopMargin(0)
                fmt.setBottomMargin(PARA_GAP)
                fmt.setLeftMargin(0)
            QTextCursor(block).setBlockFormat(fmt)
            first = False
            block = block.next()

        for frame in _iter_frames(doc.rootFrame()):
            if isinstance(frame, QTextTable):
                style_table(frame)
        _shade_inline_code(doc)
    finally:
        cursor.endEditBlock()


def _shade_inline_code(doc: QTextDocument):
    """Put `code spans` on a chip, the way Obsidian does.

    Only the background changes. The serialiser decides what is a code span
    from the font family, which is left alone, so the backticks come back
    exactly as they went in.
    """
    chip = QTextCharFormat()
    chip.setBackground(QColor(theme.tint(INLINE_CODE_BG)))
    fence = QTextFormat.Property.BlockCodeFence
    block = doc.begin()
    while block.isValid():
        if not block.blockFormat().hasProperty(fence):
            it = block.begin()
            while not it.atEnd():
                frag = it.fragment()
                if frag.isValid() and not frag.charFormat().isImageFormat() \
                        and _is_mono(frag.charFormat()):
                    span = QTextCursor(doc)
                    span.setPosition(frag.position())
                    span.setPosition(frag.position() + frag.length(),
                                     QTextCursor.KeepAnchor)
                    span.mergeCharFormat(chip)
                it += 1
        block = block.next()


def style_tables(doc: QTextDocument):
    """Style every table in the document.

    Each setFormat() relaid the whole document out, so a note with 74 tables
    took over a second to restyle — once on open and again on every Tab
    inside a table. Wrapping the pass in a single edit block collapses that
    into one layout and brings it under 20 ms.
    """
    cursor = QTextCursor(doc)
    cursor.beginEditBlock()
    try:
        for frame in _iter_frames(doc.rootFrame()):
            if isinstance(frame, QTextTable):
                style_table(frame)
    finally:
        cursor.endEditBlock()


def _iter_frames(frame):
    for child in frame.childFrames():
        yield child
        yield from _iter_frames(child)


def toggle_marker(block):
    cursor = QTextCursor(block)
    fmt = block.blockFormat()
    fmt.setMarker(Marker.Unchecked if fmt.marker() == Marker.Checked else Marker.Checked)
    cursor.setBlockFormat(fmt)


def _task_index(block) -> int:
    index = 0
    b = block.document().begin()
    while b.isValid() and b != block:
        if b.textList() is not None and b.blockFormat().marker() != Marker.NoMarker:
            index += 1
        b = b.next()
    return index


def set_list_level(cursor: QTextCursor, level: int):
    """Move the current list item to level (1 = top); 0 leaves the list."""
    block = cursor.block()
    lst = block.textList()
    if lst is None:
        return
    style = lst.format().style()
    marker = block.blockFormat().marker()
    cursor.beginEditBlock()
    lst.remove(block)
    bfmt = cursor.blockFormat()
    bfmt.setIndent(0)
    if level <= 0:
        bfmt.setMarker(Marker.NoMarker)
        cursor.setBlockFormat(bfmt)
        cursor.endEditBlock()
        return

    # Join the nearest list above that already sits at this level, so a
    # numbered sub-list keeps counting instead of restarting at 1.
    target = None
    b = block.previous()
    while b.isValid() and b.textList() is not None:
        indent = b.textList().format().indent()
        if indent == level:
            target = b.textList()
            break
        if indent < level:
            break
        b = b.previous()

    cursor.setBlockFormat(bfmt)
    if target is not None:
        target.add(block)
    else:
        fmt = QTextListFormat()
        fmt.setStyle(style)
        fmt.setIndent(level)
        cursor.createList(fmt)
    bfmt = cursor.blockFormat()
    bfmt.setMarker(marker)
    cursor.setBlockFormat(bfmt)
    cursor.endEditBlock()


def _insert_attachments(editor, source) -> bool:
    files = []
    if source.hasUrls():
        files = [Path(u.toLocalFile()) for u in source.urls() if u.isLocalFile()]
    if files:
        embed_files(editor, files)
        return True
    if source.hasImage():
        image = source.imageData()
        if isinstance(image, QImage) and not image.isNull():
            try:
                saved = attachments.import_image_bytes(Path(editor.note_path), image)
            except OSError as e:
                QMessageBox.warning(editor, "No se pudo pegar la imagen", str(e))
                return True
            embed_files(editor, [saved])
            return True
    return False


def embed_files(editor, files: list):
    note = Path(editor.note_path)
    cursor = editor.textCursor()
    cursor.beginEditBlock()
    for f in files:
        try:
            copied = attachments.import_file(note, f)
        except OSError as e:
            QMessageBox.warning(editor, "No se pudo adjuntar",
                                f"{f.name}\n\n{e}")
            continue
        markdown = attachments.markdown_for(note, copied)
        rel = markdown[len("![]("):-1].strip("<>")
        if isinstance(editor, NoteTextEdit):
            if attachments.kind_of(copied) is None:
                link = QTextCharFormat()
                link.setAnchor(True)
                link.setAnchorHref(rel)
                link.setForeground(QColor(theme.tint("#7c5af0")))
                cursor.insertText(copied.name, link)
                cursor.insertText(" ", QTextCharFormat())
            else:
                if cursor.block().text():
                    cursor.insertBlock()
                img = QTextImageFormat()
                img.setName(rel)
                img.setProperty(QTextFormat.Property.ImageAltText, PLACEHOLDER)
                cursor.insertImage(img)
                cursor.insertBlock()
        else:
            text = markdown if attachments.kind_of(copied) else f"[{copied.name}]({rel})"
            cursor.insertText(f"\n{text}\n")
    cursor.endEditBlock()
    editor.setTextCursor(cursor)
    editor.setFocus()

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

from functools import lru_cache
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QPoint, QPointF, QRectF, QUrl
from PySide6.QtGui import (
    QPainter, QColor, QPen, QImage, QFont, QTextCursor, QTextDocument,
    QTextListFormat, QTextBlockFormat, QTextImageFormat, QTextTableFormat,
    QTextCharFormat, QTextFormat, QBrush, QTextTable, QDesktopServices,
    QTextFrameFormat,
)
from PySide6.QtWidgets import QTextEdit, QTextBrowser, QMenu, QMessageBox

from ....core import attachments
from ....core.qt_markdown import (
    EMBED_SCHEME, PLACEHOLDER, table_span, align_table_lines,
)
from ... import theme

Marker = QTextBlockFormat.MarkerType

GUIDE_COLOR = "#3a3a4a"
BORDER = "#33333e"
HEADER_BG = "#26262e"
MAX_IMAGE_WIDTH = 900


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
        self.viewport().setMouseTracking(True)

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
        doc = self.document()
        layout = doc.documentLayout()
        vp = self.viewport()
        dx = -self.horizontalScrollBar().value()
        dy = -self.verticalScrollBar().value()
        top, bottom = -dy, -dy + vp.height()

        painter = QPainter(vp)
        painter.setPen(QPen(QColor(theme.tint(GUIDE_COLOR)), 1))
        block = self.cursorForPosition(QPoint(0, 0)).block()
        while block.isValid():
            rect = layout.blockBoundingRect(block)
            if rect.top() > bottom:
                break
            lst = block.textList()
            line = block.layout().lineAt(0)
            if lst is not None and rect.bottom() >= top and line.isValid():
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
            block = block.next()
        painter.end()

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
        style_tables(self.document())

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
        if self._marker_hit(pos) is not None:
            self.viewport().setCursor(Qt.PointingHandCursor)
        else:
            self.viewport().setCursor(Qt.IBeamCursor)
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
                table.appendRows(1)
                style_tables(self.document())
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
        cursor.endEditBlock()
        style_tables(self.document())
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
        style_tables(self.document())
        return True

    def table_add_column(self, left: bool):
        table = self.current_table()
        if table is None:
            return False
        col = table.cellAt(self.textCursor()).column()
        table.insertColumns(col if left else col + 1, 1)
        style_tables(self.document())
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
        style_tables(self.document())

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
        self.viewport().setCursor(Qt.PointingHandCursor if hand else Qt.ArrowCursor)
        super().mouseMoveEvent(event)


# ── Markdown mode and code files ──────────────────────────────────────────

class NoteSourceEdit(QTextEdit):
    """Plain text. In a note, Tab inside a table re-aligns it; pasted images
    and dropped files become attachments. For code files it is just an
    editor, so neither of those applies."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.note_path = None
        self.is_code = False
        self.setAcceptRichText(False)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_Tab and not self.is_code and self._align_table():
            return
        if event.key() == Qt.Key_Tab and self.is_code:
            self.textCursor().insertText("    ")
            return
        super().keyPressEvent(event)

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
    fmt.setBorderBrush(QBrush(QColor(theme.tint(BORDER))))
    fmt.setBorderCollapse(True)
    fmt.setCellPadding(6)
    fmt.setCellSpacing(0)
    fmt.setHeaderRowCount(1)
    return fmt


def style_tables(doc: QTextDocument):
    """Give every table the same grid, and the header row its own shade."""
    for frame in _iter_frames(doc.rootFrame()):
        if not isinstance(frame, QTextTable):
            continue
        fmt = frame.format()
        base = _table_format()
        fmt.setBorder(base.border())
        fmt.setBorderStyle(base.borderStyle())
        fmt.setBorderBrush(base.borderBrush())
        fmt.setBorderCollapse(True)
        fmt.setCellPadding(base.cellPadding())
        fmt.setCellSpacing(0)
        frame.setFormat(fmt)
        header = QColor(theme.tint(HEADER_BG))
        for c in range(frame.columns()):
            cell = frame.cellAt(0, c)
            cfmt = cell.format()
            cfmt.setBackground(header)
            cell.setFormat(cfmt)


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

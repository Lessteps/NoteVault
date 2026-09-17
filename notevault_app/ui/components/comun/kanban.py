"""
Kanban board: columns of painted cards that can be dragged between columns
and reordered inside one. Optional swimlanes repeat the columns per lane.

The board never moves data itself: a drop emits `moved(card_id, column, lane,
index)` and the owner writes the change and calls `set_cards` again.
"""

from PySide6.QtCore import Qt, Signal, QRectF, QSize, QTimer
from PySide6.QtGui import QColor, QPainter, QPen, QFont
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QListWidget, QListWidgetItem, QScrollArea,
    QFrame, QStyledItemDelegate, QAbstractItemView, QStyle,
)

from ... import theme
from . import (
    BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, UI_FONT, PRIORITY_COLOURS,
    PRIORITY_GLYPHS, label, clear_layout,
)

CARD_ROLE = Qt.UserRole + 10
COLUMN_WIDTH = 270


def _c(colour, alpha=None):
    q = QColor(theme.tint(colour))
    if alpha is not None:
        q.setAlpha(alpha)
    return q


def _font(size, bold=False):
    f = QFont()
    f.setFamilies(["Segoe UI Variable Text", "Segoe UI"])
    f.setPixelSize(size)
    f.setBold(bold)
    return f


class CardDelegate(QStyledItemDelegate):
    """card: {id, key, title, priority, type_icon, due_text, due_colour,
    labels: [str], parent_text, done, subtasks: [...]}"""

    def sizeHint(self, option, index):
        card = index.data(CARD_ROLE) or {}
        width = max(120, option.rect.width() or COLUMN_WIDTH - 24)
        fm_lines = 1 if len(card.get("title", "")) * 7 < width - 30 else 2
        extra = 16 if card.get("parent_text") else 0
        subtasks = card.get("subtasks") or []
        subtask_extra = 0
        if subtasks:
            visible_count = min(len(subtasks), 4)
            subtask_extra = 22 + visible_count * 16 + (14 if len(subtasks) > 4 else 0)
        return QSize(width, 70 + 17 * fm_lines + extra + subtask_extra)

    def paint(self, p: QPainter, option, index):
        card = index.data(CARD_ROLE) or {}
        p.save()
        p.setRenderHint(QPainter.Antialiasing)
        r = QRectF(option.rect).adjusted(2, 3, -2, -3)
        hovered = bool(option.state & QStyle.State_MouseOver)
        selected = bool(option.state & QStyle.State_Selected)
        p.setPen(QPen(_c(BLUE if selected else ("#44444e" if hovered else BORDER)), 1))
        p.setBrush(_c("#252525"))
        p.drawRoundedRect(r, 7, 7)
        prio = int(card.get("priority") or 2)
        p.setPen(Qt.NoPen)
        p.setBrush(_c(PRIORITY_COLOURS.get(prio, TEXT_FAINT)))
        p.drawRoundedRect(QRectF(r.left(), r.top() + 8, 3, r.height() - 16), 1.5, 1.5)

        x, y, w = r.left() + 12, r.top() + 8, r.width() - 22
        if card.get("parent_text"):
            p.setFont(_font(10))
            p.setPen(_c("#a78bfa"))
            p.drawText(QRectF(x, y, w, 14), Qt.AlignLeft | Qt.AlignVCenter,
                       p.fontMetrics().elidedText("◆ " + card["parent_text"], Qt.ElideRight, int(w)))
            y += 16
        p.setFont(_font(13, False))
        p.setPen(_c(TEXT_FAINT if card.get("done") else TEXT))
        title_rect = QRectF(x, y, w, 36)
        p.drawText(title_rect, Qt.AlignLeft | Qt.AlignTop | Qt.TextWordWrap, card.get("title", ""))
        lines = 1 if p.fontMetrics().horizontalAdvance(card.get("title", "")) < w else 2
        y += 18 * lines + 6

        chip_x = x
        p.setFont(_font(10))
        for text in card.get("labels", [])[:3]:
            tw = p.fontMetrics().horizontalAdvance(text) + 12
            if chip_x + tw > r.right() - 8:
                break
            p.setPen(Qt.NoPen)
            p.setBrush(_c("#2c2c2c"))
            p.drawRoundedRect(QRectF(chip_x, y, tw, 16), 4, 4)
            p.setPen(_c(TEXT_DIM))
            p.drawText(QRectF(chip_x, y, tw, 16), Qt.AlignCenter, text)
            chip_x += tw + 4
        if card.get("labels"):
            y += 20

        # Subtasks block inside the parent card
        subtasks = card.get("subtasks") or []
        if subtasks:
            done_cnt = sum(1 for s in subtasks if s.get("done"))
            total_cnt = len(subtasks)
            # Progress line
            p.setFont(_font(10, True))
            p.setPen(_c(TEXT_DIM))
            p.drawText(QRectF(x, y, w - 70, 14), Qt.AlignLeft | Qt.AlignVCenter, f"↳ Subtareas: {done_cnt}/{total_cnt}")
            # Mini progress bar
            bar_w = 60
            bar_h = 4
            bx = r.right() - 10 - bar_w
            by = y + 5
            p.setPen(Qt.NoPen)
            p.setBrush(_c("#333338"))
            p.drawRoundedRect(QRectF(bx, by, bar_w, bar_h), 2, 2)
            if total_cnt > 0 and done_cnt > 0:
                p.setBrush(_c(GREEN))
                p.drawRoundedRect(QRectF(bx, by, bar_w * (done_cnt / total_cnt), bar_h), 2, 2)
            y += 18

            # Paint up to 4 subtask items
            p.setFont(_font(10))
            for s in subtasks[:4]:
                is_done = s.get("done", False)
                s_icon = "☑" if is_done else "☐"
                p.setPen(_c(GREEN if is_done else TEXT_FAINT))
                p.drawText(QRectF(x + 4, y, 14, 14), Qt.AlignLeft | Qt.AlignVCenter, s_icon)

                p.setPen(_c(TEXT_FAINT if is_done else TEXT_DIM))
                title_w = w - 75
                stitle = p.fontMetrics().elidedText(s.get("title", ""), Qt.ElideRight, int(title_w))
                p.drawText(QRectF(x + 20, y, title_w, 14), Qt.AlignLeft | Qt.AlignVCenter, stitle)

                s_status = s.get("status", "")
                if s_status:
                    p.setPen(_c(GREEN if is_done else TEXT_FAINT))
                    p.drawText(QRectF(r.right() - 65, y, 55, 14), Qt.AlignRight | Qt.AlignVCenter, s_status)
                y += 16

            if len(subtasks) > 4:
                p.setPen(_c(TEXT_FAINT))
                p.setFont(_font(9, False))
                p.drawText(QRectF(x + 20, y, w - 20, 14), Qt.AlignLeft | Qt.AlignVCenter, f"+{len(subtasks) - 4} más…")
                y += 14
            y += 4

        y = r.bottom() - 22

        p.setFont(_font(11))
        p.setPen(_c(TEXT_FAINT))
        left = f"{card.get('type_icon', '')} {card.get('key', '')}".strip()
        p.drawText(QRectF(x, y, w / 2, 16), Qt.AlignLeft | Qt.AlignVCenter, left)
        p.setPen(_c(PRIORITY_COLOURS.get(prio, TEXT_FAINT)))
        glyph = PRIORITY_GLYPHS.get(prio, "")
        right = card.get("due_text", "")
        gw = p.fontMetrics().horizontalAdvance(glyph)
        p.drawText(QRectF(r.right() - 10 - gw, y, gw, 16), Qt.AlignRight | Qt.AlignVCenter, glyph)
        if right:
            p.setPen(_c(card.get("due_colour") or TEXT_DIM))
            p.drawText(QRectF(x + w / 2 - 20, y, w / 2 - gw, 16), Qt.AlignRight | Qt.AlignVCenter,
                       right)
        p.restore()


class KanbanColumn(QListWidget):
    dropped = Signal(object, str, object, int)     # source column, card id, lane, index
    card_clicked = Signal(str)

    def __init__(self, column: str, lane=None, parent=None):
        super().__init__(parent)
        self.column = column
        self.lane = lane
        self.setItemDelegate(CardDelegate(self))
        self.setDragDropMode(QAbstractItemView.DragDrop)
        self.setDefaultDropAction(Qt.MoveAction)
        self.setSelectionMode(QAbstractItemView.SingleSelection)
        self.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.setMouseTracking(True)
        self.setSpacing(1)
        self.setFixedWidth(COLUMN_WIDTH)
        self.setMinimumHeight(90)
        self.setStyleSheet(
            "QListWidget{background:transparent;border:none;outline:none;}"
            "QListWidget::item{background:transparent;border:none;}")
        self.itemClicked.connect(lambda it: self.card_clicked.emit(it.data(CARD_ROLE)["id"]))

    def set_cards(self, cards):
        self.clear()
        for card in cards:
            item = QListWidgetItem()
            item.setData(CARD_ROLE, card)
            item.setToolTip(card.get("tooltip", card.get("title", "")))
            self.addItem(item)
        self.fit_height()

    def fit_height(self, minimum: int = 90):
        total = sum(self.sizeHintForRow(i) + 2 for i in range(self.count()))
        self.setFixedHeight(max(minimum, total + 12))

    def dragEnterEvent(self, event):
        if isinstance(event.source(), KanbanColumn):
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if isinstance(event.source(), KanbanColumn):
            event.setDropAction(Qt.MoveAction)
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        source = event.source()
        if not isinstance(source, KanbanColumn) or not source.selectedItems():
            event.ignore()
            return
        card = source.selectedItems()[0].data(CARD_ROLE)
        target = self.itemAt(event.position().toPoint())
        index = self.row(target) if target is not None else self.count()
        if target is not None:
            rect = self.visualItemRect(target)
            if event.position().y() > rect.center().y():
                index += 1
        # Copy, not move: the owner rebuilds the columns from its data.
        event.setDropAction(Qt.CopyAction)
        event.accept()
        self.dropped.emit(source, card["id"], self.lane, index)


class KanbanBoard(QWidget):
    moved = Signal(str, str, object, int)       # card id, column, lane, index in column
    card_clicked = Signal(str)
    add_requested = Signal(str)                 # column

    def __init__(self, parent=None):
        super().__init__(parent)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.NoFrame)
        self.scroll.setStyleSheet("QScrollArea{background:transparent;border:none;}")
        self.inner = QWidget()
        self.inner.setStyleSheet("background:transparent;")
        self.rows = QVBoxLayout(self.inner)
        self.rows.setContentsMargins(0, 0, 0, 0)
        self.rows.setSpacing(14)
        self.scroll.setWidget(self.inner)
        outer.addWidget(self.scroll)
        self.columns: list = []

    def set_cards(self, columns, cards_by_column, lanes=None, done_column: str = ""):
        """columns: [name]; cards_by_column: {(lane, column): [card]} when lanes
        are given, else {column: [card]}; lanes: [(lane_key, title, colour)]."""
        v = self.scroll.verticalScrollBar().value()
        h = self.scroll.horizontalScrollBar().value()
        clear_layout(self.rows)
        self.columns = []
        lane_list = lanes or [(None, "", None)]
        for li, (lane, title, colour) in enumerate(lane_list):
            if lanes:
                self.rows.addWidget(label(title, colour or TEXT_DIM, 12, True))
            row = QHBoxLayout()
            row.setSpacing(12)
            for name in columns:
                cards = cards_by_column.get((lane, name) if lanes else name, [])
                box = QFrame()
                box.setObjectName("kanCol")
                box.setAttribute(Qt.WA_StyledBackground, True)
                box.setStyleSheet(f"QFrame#kanCol{{background:#1a1a1a;border:1px solid {BORDER};"
                                  "border-radius:10px;}")
                bl = QVBoxLayout(box)
                bl.setContentsMargins(8, 8, 8, 8)
                bl.setSpacing(6)
                if li == 0 or not lanes:
                    head = QHBoxLayout()
                    marker = "✓ " if name == done_column else ""
                    head.addWidget(label(f"{marker}{name.upper()}", TEXT_DIM, 11, True))
                    head.addWidget(label(str(len(cards)), TEXT_FAINT, 11))
                    head.addStretch()
                    plus = label("+", TEXT_FAINT, 16)
                    plus.setCursor(Qt.PointingHandCursor)
                    plus.setToolTip(f"Crear en «{name}»")
                    plus.mousePressEvent = lambda _e, n=name: self.add_requested.emit(n)
                    head.addWidget(plus)
                    bl.addLayout(head)
                col = KanbanColumn(name, lane)
                col.set_cards(cards)
                col.dropped.connect(lambda src, cid, lane_key, idx, c=col: self._dropped(c, cid, lane_key, idx))
                col.card_clicked.connect(self.card_clicked.emit)
                bl.addWidget(col)
                bl.addStretch()
                row.addWidget(box, 0, Qt.AlignTop)
                self.columns.append(col)
            row.addStretch()
            self.rows.addLayout(row)
        self.rows.addStretch()
        self.scroll.verticalScrollBar().setValue(v)
        self.scroll.horizontalScrollBar().setValue(h)

    def _dropped(self, column_widget, card_id, lane, index):
        # Deferred: the owner rebuilds the columns, and the drag that is still
        # unwinding must not find its widgets gone.
        column = column_widget.column
        QTimer.singleShot(0, lambda: self.moved.emit(card_id, column, lane, index))

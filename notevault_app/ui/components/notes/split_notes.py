"""Obsidian-style split editor for the notes module.

`SplitNotes` hosts one or more `MarkdownEditor` panes side by side and stacked
in a tree of `QSplitter`s. It exposes the same signals and the slice of the
`MarkdownEditor` API that `MainWindow` and the AI assistant use, delegating each
call either to the **active pane** (the one the user last worked in) or to
**every pane** (theme, vault change, note moved/created/deleted, saving).

Supports:
- Horizontal split (side-by-side, `Ctrl+\\`)
- Vertical split (stacked, `Ctrl+Shift+\\`)
- Drag-and-drop tab splitting and re-docking with visual overlay zones
- Active pane visual accent line (Obsidian-style)
- Equalizing pane sizes
"""

from pathlib import Path

from PySide6.QtCore import QPoint, QRect, QRectF, Qt, Signal
from PySide6.QtGui import (
    QBrush,
    QColor,
    QDragEnterEvent,
    QDragLeaveEvent,
    QDragMoveEvent,
    QDropEvent,
    QFont,
    QKeySequence,
    QPainter,
    QPen,
    QShortcut,
)
from PySide6.QtWidgets import QApplication, QHBoxLayout, QSplitter, QVBoxLayout, QWidget

from ...theme import tint
from ..estudio.study_sidebar import StudySideBar
from .markdown_editor import MarkdownEditor


class _DropOverlay(QWidget):
    """Semi-transparent visual overlay showing tab drop target zones."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WA_NoSystemBackground, True)
        self._target_rect: QRect | None = None
        self._target_label: str = ""

    def set_target(self, rect: QRect | None, label: str):
        self._target_rect = rect
        self._target_label = label
        self.update()

    def paintEvent(self, event):
        if not self._target_rect or not self._target_rect.isValid():
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        accent = QColor(tint("#7c5af0"))
        fill_color = QColor(accent)
        fill_color.setAlpha(45)
        border_color = QColor(accent)
        border_color.setAlpha(210)

        # Highlight rect
        r = QRectF(self._target_rect).adjusted(2, 2, -2, -2)
        painter.setPen(QPen(border_color, 2))
        painter.setBrush(QBrush(fill_color))
        painter.drawRoundedRect(r, 6, 6)

        # Badge pill
        if self._target_label:
            badge_w = min(max(160.0, len(self._target_label) * 9.5), max(60.0, r.width() - 20))
            badge_h = 30.0
            bx = r.center().x() - badge_w / 2.0
            by = r.center().y() - badge_h / 2.0
            badge_rect = QRectF(bx, by, badge_w, badge_h)

            painter.setPen(QPen(border_color, 1.5))
            badge_bg = QColor(24, 25, 34, 220)
            painter.setBrush(QBrush(badge_bg))
            painter.drawRoundedRect(badge_rect, 15, 15)

            painter.setPen(QPen(QColor(255, 255, 255, 240)))
            font = QFont("Lexend")
            font.setPointSize(10)
            font.setBold(True)
            painter.setFont(font)
            painter.drawText(badge_rect, Qt.AlignCenter, self._target_label)

        painter.end()


class SplitNotes(QWidget):
    # Re-emitted from whichever pane produced them, so MainWindow can wire the
    # notes module exactly as it did when there was a single editor.
    note_saved          = Signal(Path)
    active_note_changed = Signal(object)
    open_note_requested = Signal(Path)
    bookmarks_changed   = Signal()
    assistant_toggled   = Signal()
    reveal_requested    = Signal(Path)
    context_action_requested = Signal(str, str, dict)

    # Class-level drag tracking for zero-data-loss tab movement between panes
    _drag_source: tuple[MarkdownEditor, int] | None = None

    def __init__(self, vault, service, parent=None):
        super().__init__(parent)
        self.setObjectName("splitNotes")
        self.setAcceptDrops(True)
        self.vault = vault
        self.service = service
        self._assistant_visible = False

        self._splitter = QSplitter(Qt.Horizontal, self)
        self._config_splitter(self._splitter)

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        body = QHBoxLayout()
        body.setContentsMargins(0, 0, 0, 0)
        body.setSpacing(0)
        body.addWidget(self._splitter, 1)
        # Estudio sub-bar: visible while the active note is inside a study area.
        self._study = StudySideBar(vault)
        self._study.open_note_requested.connect(self.open_note)
        self.active_note_changed.connect(self._study.set_note)
        body.addWidget(self._study)
        root.addLayout(body)

        self._overlay = _DropOverlay(self)
        self._overlay.hide()

        first = self._new_pane()
        self._panes: list[MarkdownEditor] = [first]
        self._active: MarkdownEditor = first
        self._splitter.addWidget(first)
        self._set_active(first)

        # The active pane follows the keyboard focus, like Obsidian.
        app = QApplication.instance()
        if app is not None:
            app.focusChanged.connect(self._on_focus_changed)

        self._split_sc = QShortcut(QKeySequence("Ctrl+\\"), self)
        self._split_sc.setContext(Qt.WindowShortcut)
        self._split_sc.activated.connect(lambda: self.split_pane(orientation=Qt.Horizontal))

        self._split_v_sc = QShortcut(QKeySequence("Ctrl+Shift+\\"), self)
        self._split_v_sc.setContext(Qt.WindowShortcut)
        self._split_v_sc.activated.connect(lambda: self.split_pane(orientation=Qt.Vertical))

    def _config_splitter(self, sp: QSplitter):
        """A splitter whose divider is visually thin but has a comfortable grab
        area. ``setHandleWidth`` in Qt sets the *hit* area too, so a 1px handle
        is nearly impossible to drag; we give it 8px and paint only a 1px line
        in the middle via the stylesheet, matching Obsidian's feel."""
        sp.setChildrenCollapsible(False)
        sp.setHandleWidth(8)
        line = tint("#3a3a44")
        hover = tint("#7c5af0")
        # A near-invisible line at rest, an accent line on hover; the 8px handle
        # is the (transparent) grab area around it.
        sp.setStyleSheet(
            f"QSplitter::handle{{background:{line};}}"
            f"QSplitter::handle:horizontal{{margin:0 3px;}}"
            f"QSplitter::handle:vertical{{margin:3px 0;}}"
            f"QSplitter::handle:hover{{background:{hover};}}"
        )
        return sp

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if hasattr(self, "_overlay") and self._overlay.isVisible():
            self._overlay.setGeometry(0, 0, self.width(), self.height())

    # ── pane lifecycle ────────────────────────────────────────────────────
    def _new_pane(self) -> MarkdownEditor:
        pane = MarkdownEditor(self.vault, self.service)
        pane.note_saved.connect(self.note_saved.emit)
        pane.open_note_requested.connect(self.open_note_requested.emit)
        pane.bookmarks_changed.connect(self.bookmarks_changed.emit)
        pane.assistant_toggled.connect(self.assistant_toggled.emit)
        pane.reveal_requested.connect(self.reveal_requested.emit)
        pane.context_action_requested.connect(self.context_action_requested.emit)
        pane.active_note_changed.connect(
            lambda p, pane=pane: self._on_pane_active_note(pane, p))
        pane.split_requested.connect(lambda pane=pane: self.split_pane(pane, orientation=Qt.Horizontal))
        pane.split_down_requested.connect(lambda pane=pane: self.split_pane(pane, orientation=Qt.Vertical))
        pane.became_empty.connect(lambda pane=pane: self._close_pane(pane))
        pane.set_assistant_visible(self._assistant_visible)
        return pane

    def _parent_splitter(self, widget: QWidget) -> QSplitter | None:
        p = widget.parent()
        while p is not None:
            if isinstance(p, QSplitter):
                return p
            if p is self:
                return None
            p = p.parent()
        return None

    def split_pane(
        self,
        source: MarkdownEditor | None = None,
        orientation: Qt.Orientation = Qt.Horizontal,
        after: bool = True,
        note_to_attach = None,
    ) -> MarkdownEditor:
        source = source or self._active
        new_pane = self._new_pane()
        self._panes.append(new_pane)

        parent_sp = self._parent_splitter(source)
        if parent_sp is None:
            parent_sp = self._splitter

        if parent_sp.orientation() == orientation:
            idx = parent_sp.indexOf(source)
            insert_idx = (idx + 1) if after else idx
            parent_sp.insertWidget(insert_idx, new_pane)
        else:
            # Wrap source into a sub-splitter with the requested orientation
            idx = parent_sp.indexOf(source)
            sizes = parent_sp.sizes()
            sub = QSplitter(orientation, parent_sp)
            self._config_splitter(sub)
            parent_sp.insertWidget(idx, sub)
            if after:
                sub.addWidget(source)
                sub.addWidget(new_pane)
            else:
                sub.addWidget(new_pane)
                sub.addWidget(source)
            parent_sp.setSizes(sizes)
            sub_total = sub.width() if orientation == Qt.Horizontal else sub.height()
            sub.setSizes([max(1, sub_total // 2), max(1, sub_total // 2)])

        self._set_active(new_pane)

        if note_to_attach is not None:
            new_pane.attach_note(note_to_attach)
        else:
            current = source.current_path()
            if current is not None:
                new_pane.open_note(current)

        self._equalize()
        return new_pane

    def _close_pane(self, pane: MarkdownEditor):
        # Always keep at least one pane; an empty one just shows its placeholder.
        if len(self._panes) <= 1 or pane not in self._panes:
            return
        self._panes.remove(pane)
        # Re-run even when the active pane survives: dropping back to a single
        # pane has to clear its split accent strip.
        self._set_active(self._panes[-1] if self._active is pane else self._active)

        parent_sp = self._parent_splitter(pane)
        pane.setParent(None)
        pane.deleteLater()

        # Collapse empty or single-child sub-splitters back into grandparent
        if parent_sp is not None and parent_sp is not self._splitter:
            if parent_sp.count() == 1:
                remaining = parent_sp.widget(0)
                grand_parent = self._parent_splitter(parent_sp) or self._splitter
                idx = grand_parent.indexOf(parent_sp)
                sizes = grand_parent.sizes()
                grand_parent.insertWidget(idx, remaining)
                parent_sp.setParent(None)
                parent_sp.deleteLater()
                grand_parent.setSizes(sizes)
            elif parent_sp.count() == 0:
                parent_sp.setParent(None)
                parent_sp.deleteLater()

        self._equalize()

    def _equalize(self):
        def eq(splitter: QSplitter):
            n = splitter.count()
            if n > 0:
                total = splitter.width() if splitter.orientation() == Qt.Horizontal else splitter.height()
                splitter.setSizes([max(1, total // n)] * n)
            for i in range(n):
                w = splitter.widget(i)
                if isinstance(w, QSplitter):
                    eq(w)
        eq(self._splitter)

    # ── active-pane tracking ──────────────────────────────────────────────
    def _on_focus_changed(self, _old, now):
        if now is None:
            return
        for pane in self._panes:
            try:
                if pane is now or pane.isAncestorOf(now):
                    if pane is not self._active:
                        self._set_active(pane)
                    return
            except RuntimeError:
                pass  # pane already deleted

    def _on_pane_active_note(self, pane: MarkdownEditor, path):
        self._set_active(pane)
        self.active_note_changed.emit(path)

    def _set_active(self, pane: MarkdownEditor):
        self._active = pane
        # The accent strip only means something when there is more than one
        # pane to tell apart; a lone pane keeps the plain tab row.
        split = len(self._panes) > 1
        for p in self._panes:
            try:
                p.set_pane_active(split and p is pane)
            except RuntimeError:
                pass

    # ── drag & drop tab splitting ─────────────────────────────────────────
    def _hit_test_drop(self, pos: QPoint):
        """Determine hovered pane, drop zone, highlight rect, and badge text."""
        for pane in self._panes:
            top_left = pane.mapTo(self, QPoint(0, 0))
            pane_rect = QRect(top_left, pane.size())
            if pane_rect.contains(pos):
                lx = pos.x() - top_left.x()
                ly = pos.y() - top_left.y()
                pw = pane.width()
                ph = pane.height()

                if lx < pw * 0.25:
                    zone = "left"
                    rect = QRect(top_left.x(), top_left.y(), pw // 2, ph)
                    label = "Dividir a la izquierda"
                elif lx > pw * 0.75:
                    zone = "right"
                    rect = QRect(top_left.x() + pw // 2, top_left.y(), pw - pw // 2, ph)
                    label = "Dividir a la derecha"
                elif ly < ph * 0.25:
                    zone = "top"
                    rect = QRect(top_left.x(), top_left.y(), pw, ph // 2)
                    label = "Dividir arriba"
                elif ly > ph * 0.75:
                    zone = "bottom"
                    rect = QRect(top_left.x(), top_left.y() + ph // 2, pw, ph - ph // 2)
                    label = "Dividir abajo"
                else:
                    zone = "center"
                    rect = pane_rect
                    label = "Mover a pestaña"

                return pane, zone, rect, label

        return None, None, None, ""

    def _update_drop_target(self, pos: QPoint):
        pane, zone, rect, label = self._hit_test_drop(pos)
        if pane and rect:
            self._overlay.setGeometry(0, 0, self.width(), self.height())
            self._overlay.set_target(rect, label)
            self._overlay.show()
            self._overlay.raise_()
        else:
            self._overlay.hide()

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasFormat("application/x-notevault-tab") and getattr(SplitNotes, "_drag_source", None):
            event.acceptProposedAction()
            self._update_drop_target(event.position().toPoint())
        else:
            event.ignore()

    def dragMoveEvent(self, event: QDragMoveEvent):
        if event.mimeData().hasFormat("application/x-notevault-tab") and getattr(SplitNotes, "_drag_source", None):
            event.acceptProposedAction()
            self._update_drop_target(event.position().toPoint())
        else:
            event.ignore()

    def dragLeaveEvent(self, event: QDragLeaveEvent):
        self._overlay.hide()
        event.accept()

    def dropEvent(self, event: QDropEvent):
        self._overlay.hide()
        drag_source = getattr(SplitNotes, "_drag_source", None)
        if not (event.mimeData().hasFormat("application/x-notevault-tab") and drag_source):
            event.ignore()
            return

        source_pane, tab_idx = drag_source
        pane, zone, _, _ = self._hit_test_drop(event.position().toPoint())
        if pane is None:
            event.ignore()
            return

        event.acceptProposedAction()

        if zone == "center" and pane is source_pane:
            return

        if zone != "center" and len(source_pane._open) <= 1:
            current_path = source_pane.current_path()
            if current_path:
                if zone == "left":
                    self.split_pane(pane, orientation=Qt.Horizontal, after=False)
                elif zone == "right":
                    self.split_pane(pane, orientation=Qt.Horizontal, after=True)
                elif zone == "top":
                    self.split_pane(pane, orientation=Qt.Vertical, after=False)
                elif zone == "bottom":
                    self.split_pane(pane, orientation=Qt.Vertical, after=True)
            return

        note = source_pane.detach_note(tab_idx)
        if not note:
            return

        if zone == "center":
            pane.attach_note(note)
            self._set_active(pane)
        elif zone == "left":
            self.split_pane(pane, orientation=Qt.Horizontal, after=False, note_to_attach=note)
        elif zone == "right":
            self.split_pane(pane, orientation=Qt.Horizontal, after=True, note_to_attach=note)
        elif zone == "top":
            self.split_pane(pane, orientation=Qt.Vertical, after=False, note_to_attach=note)
        elif zone == "bottom":
            self.split_pane(pane, orientation=Qt.Vertical, after=True, note_to_attach=note)

    # ── API delegated to the ACTIVE pane ──────────────────────────────────
    def show_study_for(self, folder: Path):
        self._study.set_note(folder)

    def open_note(self, path: Path, line: int = 0, new_tab: bool = False):
        self._active.open_note(path, line, new_tab=new_tab)

    def open_note_new_tab(self, path: Path, line: int = 0):
        self._active.open_note_new_tab(path, line)

    def current_path(self):
        return self._active.current_path()

    def current_title(self) -> str:
        return self._active.current_title()

    def current_canvas(self):
        """The canvas open in the active pane, else in any pane, else None."""
        for pane in [self._active] + [p for p in self._panes if p is not self._active]:
            try:
                canvas = pane.current_canvas()
            except RuntimeError:
                continue
            if canvas is not None:
                return canvas
        return None

    def current_body(self) -> str:
        return self._active.current_body()

    def current_selection(self) -> str:
        return self._active.current_selection()

    def insert_markdown(self, text: str):
        self._active.insert_markdown(text)

    def replace_selection(self, text: str) -> bool:
        return self._active.replace_selection(text)

    def save_current(self):
        self._active.save_current()

    # ── API applied to EVERY pane ─────────────────────────────────────────
    def set_vault(self, vault, service):
        self.vault = vault
        self.service = service
        for pane in self._panes:
            pane.set_vault(vault, service)
        self._study.set_vault(vault)

    def set_assistant_visible(self, visible: bool):
        self._assistant_visible = visible
        for pane in self._panes:
            pane.set_assistant_visible(visible)

    def retheme(self):
        for pane in self._panes:
            pane.retheme()
        self._study.retheme()

    def refresh_mentions(self):
        for pane in self._panes:
            pane.refresh_mentions()

    def on_note_moved(self, old_path: Path, new_path: Path):
        for pane in self._panes:
            pane.on_note_moved(old_path, new_path)

    def on_note_created(self, path: Path):
        for pane in self._panes:
            pane.on_note_created(path)

    def on_note_deleted(self, path: Path):
        for pane in self._panes:
            pane.on_note_deleted(path)

    def flush_canvas(self):
        for pane in self._panes:
            pane.flush_canvas()

    def save_all(self):
        for pane in self._panes:
            pane.save_all()

    # ── attributes MainWindow reads ───────────────────────────────────────
    @property
    def _open(self) -> list:
        """Every open note across all panes, for session save."""
        notes: list = []
        for pane in self._panes:
            notes.extend(pane._open)
        return notes

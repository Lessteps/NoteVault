"""
Habit Tracker — Vista Diaria
Agenda-style view: quick check-off of today's habits (only the habits
scheduled for today's weekday), their subtasks, and the daily journal.
"""

from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame, QTextEdit, QLayout,
)
from PySide6.QtCore import Qt, Signal, QTimer

from ....core.habit_manager import HabitManager, MONTH_NAMES
from .notion_widgets import (
    NotionCheck, SectionHeader, ViewPill, ProgressBlocks,
    card_frame, BG_PAGE, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, BLOCK_FILL,
)

DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


class DailyView(QWidget):
    data_changed = Signal()
    manage_requested = Signal()

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._expanded: set = set()   # habit ids with their subtasks unfolded
        self._init_ui()

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = self._scroll_content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(20, 18, 20, 20)
        page.setSpacing(12)
        # Keeps rows at their real height and lets the scroll area scroll
        # instead of squashing the content when subtasks are unfolded.
        page.setSizeConstraint(QLayout.SetMinimumSize)

        card = card_frame()
        card_lay = QVBoxLayout(card)
        card_lay.setContentsMargins(22, 18, 22, 18)
        card_lay.setSpacing(10)

        self._header = SectionHeader("📋", "Agenda de Hoy")
        card_lay.addWidget(self._header)

        pill_row = QHBoxLayout()
        pill_row.addWidget(ViewPill("◈", "Diaria"))
        pill_row.addStretch()
        card_lay.addLayout(pill_row)

        # Summary bar
        self._summary_bar = ProgressBlocks()
        self._summary_lbl = QLabel()
        self._summary_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )
        sum_row = QHBoxLayout()
        sum_row.setSpacing(10)
        sum_row.addWidget(self._summary_bar)
        sum_row.addWidget(self._summary_lbl)
        sum_row.addStretch()
        card_lay.addLayout(sum_row)

        sep = QFrame()
        sep.setFixedHeight(1)
        sep.setStyleSheet(f"background:{BORDER};border:none;")
        card_lay.addWidget(sep)

        self._body = QVBoxLayout()
        self._body.setContentsMargins(0, 0, 0, 0)
        self._body.setSpacing(0)
        card_lay.addLayout(self._body)

        page.addWidget(card)

        # ── Journaling card ────────────────────────────────────────────────
        j_card = card_frame()
        j_lay = QVBoxLayout(j_card)
        j_lay.setContentsMargins(22, 16, 22, 16)
        j_lay.setSpacing(8)

        j_hdr = QHBoxLayout()
        j_title = QLabel("✏  Diario de hoy")
        j_title.setStyleSheet(
            f"color:{TEXT};font-size:14px;font-weight:600;"
            "background:transparent;border:none;"
        )
        j_hdr.addWidget(j_title)
        j_hdr.addStretch()
        self._j_saved_lbl = QLabel("")
        self._j_saved_lbl.setStyleSheet(
            "color:#555560;font-size:11px;background:transparent;border:none;"
        )
        j_hdr.addWidget(self._j_saved_lbl)
        j_lay.addLayout(j_hdr)

        self._journal_edit = QTextEdit()
        self._journal_edit.setMinimumHeight(140)
        self._journal_edit.setPlaceholderText(
            "Escribe aquí tus notas del día, reflexiones, cómo te sentiste..."
        )
        self._journal_edit.setStyleSheet(
            f"QTextEdit{{background:#252525;border:1px solid {BORDER};"
            f"border-radius:8px;color:{TEXT};font-size:13px;padding:10px;}}"
            "QTextEdit:focus{border-color:#3a3a4a;}"
        )
        j_lay.addWidget(self._journal_edit)

        self._j_timer = QTimer(self)
        self._j_timer.setSingleShot(True)
        self._j_timer.setInterval(1200)
        self._j_timer.timeout.connect(self._save_journal)
        self._journal_edit.textChanged.connect(self._j_timer.start)

        page.addWidget(j_card)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self):
        while self._body.count():
            item = self._body.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        today = date.today()
        day_name = DAYS_ES[today.weekday()]
        self._header.set_title(f"{day_name}, {today.day} de {MONTH_NAMES[today.month]}")

        habits = self.manager.habits_for_day(today)
        day = self.manager.get_day(today)

        self._update_summary(day, habits)

        for h in habits:
            self._body.addWidget(self._make_row(h, day))

        if not habits:
            lbl = QLabel("No hay hábitos programados para hoy.")
            lbl.setStyleSheet(
                f"color:{TEXT_DIM};font-size:13px;background:transparent;border:none;"
            )
            self._body.addWidget(lbl)

        # Load journal text (block signal to avoid auto-save on load)
        self._j_timer.stop()
        self._journal_edit.blockSignals(True)
        self._journal_edit.setPlainText(day.journal)
        self._journal_edit.blockSignals(False)
        self._j_saved_lbl.setText("")

        # Let the scroll area recompute its content height (expanded subtasks
        # make the page taller than the viewport).
        self._scroll_content.adjustSize()

    def _update_summary(self, day, habits):
        done = sum(1 for h in habits if day.completed.get(h["id"], False))
        total = len(habits)
        pct = done / total if total else 0.0
        self._summary_bar.set_pct(pct)
        self._summary_lbl.setText(f"{done} / {total} completados")

    def _make_row(self, habit: dict, day) -> QWidget:
        hid = habit["id"]
        checked = day.completed.get(hid, False)
        subs = habit.get("subtasks") or []

        block = QFrame()
        block.setAttribute(Qt.WA_StyledBackground, True)
        block.setStyleSheet(
            f"QFrame{{background:transparent;border-bottom:1px solid {BORDER};}}"
        )
        blay = QVBoxLayout(block)
        blay.setContentsMargins(0, 0, 0, 0)
        blay.setSpacing(0)

        row = QWidget()
        row.setFixedHeight(54)
        row.setStyleSheet("background:transparent;border:none;")
        lay = QHBoxLayout(row)
        lay.setContentsMargins(4, 0, 8, 0)
        lay.setSpacing(14)

        cb = NotionCheck(checked)
        cb.setFixedSize(22, 22)
        lay.addWidget(cb)

        ico = QLabel(habit["icon"])
        ico.setStyleSheet("font-size:20px;background:transparent;border:none;")
        ico.setFixedWidth(30)
        lay.addWidget(ico)

        name_lbl = QLabel(habit["name"])
        name_lbl.setStyleSheet(
            f"font-size:15px;"
            f"font-weight:{'600' if checked else '400'};"
            f"color:{'#606068' if checked else TEXT};"
            "background:transparent;border:none;"
        )
        lay.addWidget(name_lbl, stretch=1)

        if subs:
            done_n, total_n = day.subtask_progress(habit)
            prog = QLabel(f"{done_n}/{total_n}")
            prog.setStyleSheet(
                f"color:{BLOCK_FILL if done_n == total_n else TEXT_DIM};"
                "font-size:11px;background:transparent;border:none;"
            )
            lay.addWidget(prog)

            arrow = QLabel("▾" if hid in self._expanded else "▸")
            arrow.setFixedWidth(18)
            arrow.setAlignment(Qt.AlignCenter)
            arrow.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:12px;background:transparent;border:none;"
            )
            arrow.setCursor(Qt.PointingHandCursor)
            arrow.mousePressEvent = (
                lambda _e, _id=hid: self._toggle_expand(_id)
            )
            lay.addWidget(arrow)

        blay.addWidget(row)

        def _toggle(new_val: bool, _hid=hid, _nlbl=name_lbl):
            _day = self.manager.get_day(date.today())
            _day.completed[_hid] = new_val
            self.manager.save_day(_day)
            self._update_summary(_day, self.manager.habits_for_day(date.today()))
            _nlbl.setStyleSheet(
                f"font-size:15px;"
                f"font-weight:{'600' if new_val else '400'};"
                f"color:{'#606068' if new_val else TEXT};"
                "background:transparent;border:none;"
            )
            self.data_changed.emit()

        cb.toggled_habit.connect(_toggle)

        # ── Subtask list ─────────────────────────────────────────────────
        if subs and hid in self._expanded:
            for s in subs:
                blay.addWidget(self._subtask_row(habit, s, day))

        return block

    def _subtask_row(self, habit: dict, sub: dict, day) -> QWidget:
        hid, sid = habit["id"], sub["id"]
        done = day.subtask_done(hid, sid)

        row = QWidget()
        row.setFixedHeight(34)
        row.setStyleSheet("background:transparent;border:none;")
        lay = QHBoxLayout(row)
        lay.setContentsMargins(46, 0, 8, 6)
        lay.setSpacing(12)

        cb = NotionCheck(done)
        cb.setFixedSize(16, 16)
        lay.addWidget(cb)

        lbl = QLabel(sub["name"])
        lbl.setStyleSheet(
            f"font-size:13px;color:{'#606068' if done else TEXT_DIM};"
            "background:transparent;border:none;"
        )
        lay.addWidget(lbl, stretch=1)

        def _toggle(val: bool, _h=habit, _s=sid, _lbl=lbl):
            _day = self.manager.get_day(date.today())
            _day.set_subtask(_h["id"], _s, val)
            # All subtasks ticked -> the parent habit counts as done.
            d, t = _day.subtask_progress(_h)
            if t:
                _day.completed[_h["id"]] = (d == t)
            self.manager.save_day(_day)
            _lbl.setStyleSheet(
                f"font-size:13px;color:{'#606068' if val else TEXT_DIM};"
                "background:transparent;border:none;"
            )
            self.data_changed.emit()
            self.refresh()

        cb.toggled_habit.connect(_toggle)
        return row

    def _toggle_expand(self, habit_id: str):
        if habit_id in self._expanded:
            self._expanded.discard(habit_id)
        else:
            self._expanded.add(habit_id)
        self.refresh()

    # ── Journal ───────────────────────────────────────────────────────────

    def _save_journal(self):
        day = self.manager.get_day(date.today())
        day.journal = self._journal_edit.toPlainText()
        self.manager.save_day(day)
        self._j_saved_lbl.setText("guardado ✓")

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh()

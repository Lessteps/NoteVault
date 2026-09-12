"""
Tareas — Recordatorios
Lists every task reminder, lets you postpone or dismiss it, and shows
which tasks still have no reminder set.
"""

from datetime import datetime, timedelta
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame, QScrollArea, QLayout,
)
from PySide6.QtCore import Qt, Signal

from ....core.task_manager import TaskManager, Task
from .tareas_common import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT,
    BLUE, GREEN, ORANGE, RED, flat_btn, hline,
)
from .task_editor import TaskEditor


def _section(title: str) -> QLabel:
    lbl = QLabel(title)
    lbl.setStyleSheet(
        f"color:{TEXT_FAINT};font-size:10px;font-weight:700;letter-spacing:0.8px;"
        "background:transparent;border:none;"
    )
    return lbl


class TareasReminders(QWidget):
    data_changed = Signal()

    def __init__(self, manager: TaskManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._init_ui()

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self._page = QVBoxLayout(content)
        self._page.setContentsMargins(18, 16, 18, 18)
        self._page.setSpacing(12)
        self._page.setSizeConstraint(QLayout.SetMinimumSize)

        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self):
        while self._page.count():
            item = self._page.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                while item.layout().count():
                    sub = item.layout().takeAt(0)
                    if sub.widget():
                        sub.widget().deleteLater()

        title = QLabel("🔔  Recordatorios")
        title.setStyleSheet(
            f"color:{TEXT};font-size:20px;font-weight:700;"
            "background:transparent;border:none;"
        )
        self._page.addWidget(title)

        now = datetime.now()
        tasks = self.manager.tasks()
        overdue  = [t for t in tasks if t.reminder and t.reminder <= now
                    and not t.reminder_done]
        upcoming = [t for t in tasks if t.reminder and t.reminder > now]
        done     = [t for t in tasks if t.reminder and t.reminder_done
                    and t.reminder <= now]
        without  = [t for t in tasks if not t.reminder and not t.is_done]

        self._page.addWidget(self._group("VENCIDOS", overdue, RED,
                                         "No hay recordatorios vencidos."))
        self._page.addWidget(self._group("PRÓXIMOS", upcoming, BLUE,
                                         "No hay recordatorios programados."))
        if done:
            self._page.addWidget(self._group("YA AVISADOS", done, TEXT_FAINT, ""))
        self._page.addWidget(
            self._group(f"SIN RECORDATORIO ({len(without)})", without,
                        TEXT_FAINT, "Todas las tareas tienen recordatorio.")
        )
        self._page.addStretch()

    def _group(self, header: str, tasks: list, accent: str,
               empty_text: str) -> QWidget:
        card = QFrame()
        card.setAttribute(Qt.WA_StyledBackground, True)
        card.setObjectName("remCard")
        card.setStyleSheet(
            f"QFrame#remCard{{background:{BG_CARD};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 12, 16, 12)
        lay.setSpacing(8)

        hdr = QLabel(header)
        hdr.setStyleSheet(
            f"color:{accent};font-size:10px;font-weight:700;letter-spacing:0.9px;"
            "background:transparent;border:none;"
        )
        lay.addWidget(hdr)
        lay.addWidget(hline())

        if not tasks:
            e = QLabel(empty_text or "—")
            e.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:12px;background:transparent;border:none;"
            )
            lay.addWidget(e)
            return card

        for t in tasks:
            lay.addWidget(self._row(t, accent))
        return card

    def _row(self, t: Task, accent: str) -> QWidget:
        row = QWidget()
        row.setFixedHeight(38)
        row.setStyleSheet("background:transparent;")
        lay = QHBoxLayout(row)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(10)

        dot = QLabel("●")
        dot.setFixedWidth(12)
        dot.setStyleSheet(
            f"color:{accent};font-size:10px;background:transparent;border:none;"
        )
        lay.addWidget(dot)

        name = QLabel(t.name)
        name.setStyleSheet(
            f"color:{TEXT};font-size:13px;background:transparent;border:none;"
        )
        lay.addWidget(name)

        if t.subject:
            subj = QLabel(t.subject)
            subj.setStyleSheet(
                f"color:{BLUE};font-size:11px;background:#252525;border:none;"
                "border-radius:4px;padding:2px 7px;"
            )
            lay.addWidget(subj)

        lay.addStretch()

        when = QLabel(
            t.reminder.strftime("%d/%m/%Y  %H:%M") if t.reminder else "—"
        )
        when.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(when)

        if t.reminder and not t.reminder_done:
            snooze = flat_btn("+1 día", height=24)
            snooze.clicked.connect(lambda _, _t=t: self._snooze(_t, days=1))
            lay.addWidget(snooze)

            dismiss = flat_btn("✓ Listo", GREEN, GREEN, height=24)
            dismiss.clicked.connect(lambda _, _t=t: self._dismiss(_t))
            lay.addWidget(dismiss)

        edit = flat_btn("Abrir", height=24)
        edit.clicked.connect(lambda _, _t=t: self._open(_t))
        lay.addWidget(edit)
        return row

    # ── Actions ───────────────────────────────────────────────────────────

    def _snooze(self, t: Task, days: int = 1):
        base = t.reminder or datetime.now()
        self.manager.update(t.id, reminder=base + timedelta(days=days),
                            reminder_done=False)
        self.data_changed.emit()
        self.refresh()

    def _dismiss(self, t: Task):
        self.manager.mark_reminder_shown(t.id)
        self.data_changed.emit()
        self.refresh()

    def _open(self, t: Task):
        dlg = TaskEditor(self.manager, t, self)
        dlg.exec()
        self.manager.tasks(force=True)
        self.data_changed.emit()
        self.refresh()

    def set_manager(self, manager: TaskManager):
        self.manager = manager
        self.refresh()

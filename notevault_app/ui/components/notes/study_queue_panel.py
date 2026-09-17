"""
NoteVault Study Queue Panel
Visual daily practice queue displaying interleaved SRS reviews, error remediation, and exercises.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QScrollArea,
    QFrame, QProgressBar
)
from PySide6.QtCore import Qt, Signal

from ..comun import TEXT, BORDER, TEXT_DIM, TEXT_FAINT, UI_FONT
from ....core.study_daily_queue import StudyDailyQueueManager
from ....core.study_exercise_manager import StudyExerciseManager
from .study_exercise_dialog import StudyExerciseDialog

ACCENT = "#7c5af0"
BG_PANEL = "#1a1a1e"
BG_CARD = "#222226"
GREEN = "#3fb950"


class StudyQueuePanel(QWidget):
    task_started = Signal(dict)

    def __init__(self, vault_root, parent=None):
        super().__init__(parent)
        self.vault_root = vault_root
        self.queue_mgr = StudyDailyQueueManager(vault_root)
        self.ex_mgr = StudyExerciseManager(vault_root)
        self._init_ui()
        self.refresh()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(14, 14, 14, 14)
        lay.setSpacing(10)

        # Header
        header = QHBoxLayout()
        title = QLabel("📅 HOY — Práctica Diaria")
        title.setStyleSheet(f"font-size: 15px; font-weight: bold; color: {TEXT};")
        header.addWidget(title)

        header.addStretch()

        self.refresh_btn = QPushButton("↻ Actualizar")
        self.refresh_btn.setCursor(Qt.PointingHandCursor)
        self.refresh_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: 1px solid {BORDER}; "
            f"border-radius: 4px; color: {TEXT_DIM}; font-size: 11px; padding: 4px 8px; }}"
            f"QPushButton:hover {{ background: #28282e; color: {TEXT}; }}"
        )
        self.refresh_btn.clicked.connect(self.refresh)
        header.addWidget(self.refresh_btn)
        lay.addLayout(header)

        # Stats bar
        self.stats_lbl = QLabel("0 repasos pendientes • 0 errores por corregir")
        self.stats_lbl.setStyleSheet(f"color: {TEXT_FAINT}; font-size: 11px;")
        lay.addWidget(self.stats_lbl)

        # Scroll area for tasks
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setStyleSheet(
            f"QScrollArea {{ border: none; background: {BG_PANEL}; }}"
            f"QScrollBar:vertical {{ width: 8px; background: transparent; }}"
            f"QScrollBar::handle:vertical {{ background: {BORDER}; border-radius: 4px; }}"
        )

        self.tasks_container = QWidget()
        self.tasks_lay = QVBoxLayout(self.tasks_container)
        self.tasks_lay.setContentsMargins(0, 0, 0, 0)
        self.tasks_lay.setSpacing(8)
        self.tasks_lay.addStretch()
        self.scroll.setWidget(self.tasks_container)

        lay.addWidget(self.scroll, stretch=1)

    def refresh(self):
        queue = self.queue_mgr.get_queue()

        self.stats_lbl.setText(
            f"{queue['srs_due_count']} repasos SRS • {queue['unresolved_errors_count']} errores por reforzar • {queue['total_tasks']} tareas hoy"
        )

        # Clear existing items (except trailing stretch)
        while self.tasks_lay.count() > 1:
            item = self.tasks_lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        if not queue["interleaved"]:
            empty_card = QFrame()
            empty_card.setStyleSheet(
                f"QFrame {{ background: {BG_CARD}; border: 1px dashed {BORDER}; border-radius: 6px; padding: 20px; }}"
            )
            e_lay = QVBoxLayout(empty_card)
            msg = QLabel("¡Todo al día! No tienes repasos pendientes ni errores pendientes para hoy.")
            msg.setWordWrap(True)
            msg.setAlignment(Qt.AlignCenter)
            msg.setStyleSheet(f"color: {TEXT_DIM}; font-size: 13px;")
            e_lay.addWidget(msg)
            self.tasks_lay.insertWidget(0, empty_card)
            return

        for idx, task in enumerate(queue["interleaved"]):
            card = self._build_task_card(task)
            self.tasks_lay.insertWidget(idx, card)

    def _build_task_card(self, task: dict) -> QFrame:
        card = QFrame()
        card.setStyleSheet(
            f"QFrame {{ background: {BG_CARD}; border: 1px solid {BORDER}; border-radius: 6px; padding: 8px 12px; }}"
            f"QFrame:hover {{ border-color: {ACCENT}; }}"
        )
        c_lay = QHBoxLayout(card)
        c_lay.setContentsMargins(0, 0, 0, 0)
        c_lay.setSpacing(10)

        # Subject icon
        icons = {
            "mathematics": "📐",
            "programming": "💻",
            "english": "🌐",
            "general": "📝",
        }
        icon_lbl = QLabel(icons.get(task.get("subject"), "📝"))
        icon_lbl.setStyleSheet("font-size: 16px;")
        c_lay.addWidget(icon_lbl)

        # Details
        det_lay = QVBoxLayout()
        det_lay.setSpacing(2)

        type_badges = {
            "srs_review": ("REPASO SRS", "#bca6f7", "rgba(124, 90, 240, 0.15)"),
            "error_remediation": ("CORREGIR ERROR", "#f2555a", "rgba(242, 85, 90, 0.15)"),
            "exercise": ("EJERCICIO", "#3fb950", "rgba(63, 185, 80, 0.15)"),
        }
        badge_text, fg, bg = type_badges.get(task["task_type"], ("TAREA", "#dcdde0", "#28282e"))

        top_info = QHBoxLayout()
        badge = QLabel(f" {badge_text} ")
        badge.setStyleSheet(
            f"background: {bg}; color: {fg}; font-size: 9px; font-weight: bold; border-radius: 3px;"
        )
        top_info.addWidget(badge)

        diff = task.get("difficulty", 1)
        stars = "★" * int(diff) + "☆" * (5 - int(diff))
        diff_lbl = QLabel(stars)
        diff_lbl.setStyleSheet(f"color: {TEXT_FAINT}; font-size: 10px;")
        top_info.addWidget(diff_lbl)
        top_info.addStretch()

        det_lay.addLayout(top_info)

        title = QLabel(task.get("title", ""))
        title.setStyleSheet(f"color: {TEXT}; font-size: 12px; font-weight: 500;")
        det_lay.addWidget(title)

        c_lay.addLayout(det_lay, stretch=1)

        # Start button
        btn = QPushButton("Ejecutar")
        btn.setCursor(Qt.PointingHandCursor)
        btn.setStyleSheet(
            f"QPushButton {{ background: #2a2a30; border: 1px solid {BORDER}; "
            f"border-radius: 4px; color: {TEXT}; font-size: 11px; padding: 4px 10px; }}"
            f"QPushButton:hover {{ background: {ACCENT}; color: #ffffff; border-color: {ACCENT}; }}"
        )
        btn.clicked.connect(lambda _=False, t=task: self._start_task(t))
        c_lay.addWidget(btn)

        return card

    def _start_task(self, task: dict):
        self.task_started.emit(task)
        # If task is an exercise, open dialog directly
        if task["task_type"] == "exercise" and "data" in task:
            dlg = StudyExerciseDialog(task["data"], self.ex_mgr, self)
            dlg.attempt_finished.connect(lambda _: self.refresh())
            dlg.exec()

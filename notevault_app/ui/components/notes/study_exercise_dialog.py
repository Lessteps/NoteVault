"""
NoteVault Study Exercise Dialog
Modal interface for executing, submitting, and receiving feedback on study exercises.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QTextEdit, QPushButton,
    QRadioButton, QButtonGroup, QFrame, QScrollArea, QWidget, QSizePolicy
)
from PySide6.QtCore import Qt, Signal

from ..comun import TEXT, BORDER, TEXT_DIM, UI_FONT
from ....core.study_exercise_manager import StudyExerciseManager

ACCENT = "#7c5af0"
BG_DIALOG = "#1a1a1e"
GREEN = "#3fb950"
RED = "#f2555a"


class StudyExerciseDialog(QDialog):
    attempt_finished = Signal(dict)

    def __init__(self, exercise: dict, exercise_manager: StudyExerciseManager, parent=None):
        super().__init__(parent)
        self.ex = dict(exercise)
        self.mgr = exercise_manager
        self.setWindowTitle(f"Ejercicio — {self.ex.get('topic', 'Estudio')}")
        self.setMinimumSize(540, 480)
        self.resize(600, 520)
        self.setStyleSheet(
            f"QDialog {{ background: {BG_DIALOG}; color: {TEXT}; font-family: {UI_FONT}; }}"
            f"QLabel {{ color: {TEXT}; }}"
        )
        self._submitted = False
        self._init_ui()

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 20, 20, 20)
        root.setSpacing(12)

        # Header with tags
        top_bar = QHBoxLayout()
        subj = self.ex.get("subject", "general").capitalize()
        badge = QLabel(f"  {subj} • {self.ex.get('type', 'Recall').upper()}  ")
        badge.setStyleSheet(
            "background: rgba(124, 90, 240, 0.2); color: #bca6f7; "
            "border-radius: 4px; font-size: 11px; font-weight: bold; padding: 3px 6px;"
        )
        top_bar.addWidget(badge)

        diff = self.ex.get("difficulty", 1)
        stars = "★" * int(diff) + "☆" * (5 - int(diff))
        diff_lbl = QLabel(f"Dificultad: {stars}")
        diff_lbl.setStyleSheet(f"color: {TEXT_DIM}; font-size: 11px;")
        top_bar.addWidget(diff_lbl)

        top_bar.addStretch()

        if self.ex.get("source_note"):
            note_lbl = QLabel(f"Origen: {Path(self.ex['source_note']).name}")
            note_lbl.setStyleSheet(f"color: {TEXT_DIM}; font-size: 11px;")
            top_bar.addWidget(note_lbl)

        root.addLayout(top_bar)

        # Prompt card
        prompt_box = QFrame()
        prompt_box.setStyleSheet(
            f"QFrame {{ background: #222226; border: 1px solid {BORDER}; border-radius: 8px; padding: 14px; }}"
        )
        p_lay = QVBoxLayout(prompt_box)
        p_lbl = QLabel(self.ex.get("prompt", ""))
        p_lbl.setWordWrap(True)
        p_lbl.setStyleSheet("font-size: 14px; font-weight: 500; line-height: 1.4;")
        p_lay.addWidget(p_lbl)
        root.addWidget(prompt_box)

        # Input response area based on type
        self.options_group = None
        self.text_input = None

        if self.ex.get("type") == "multiple_choice" and self.ex.get("options"):
            opts_box = QFrame()
            opts_lay = QVBoxLayout(opts_box)
            opts_lay.setSpacing(8)
            self.options_group = QButtonGroup(self)
            for idx, opt in enumerate(self.ex["options"]):
                rb = QRadioButton(opt)
                rb.setCursor(Qt.PointingHandCursor)
                rb.setStyleSheet(
                    f"QRadioButton {{ color: {TEXT}; font-size: 13px; padding: 6px; }}"
                    f"QRadioButton:hover {{ background: #2a2a30; border-radius: 4px; }}"
                )
                self.options_group.addButton(rb, idx)
                opts_lay.addWidget(rb)
            root.addWidget(opts_box)
        else:
            self.text_input = QTextEdit()
            placeholder = (
                "Escribe tu código aquí..." if self.ex.get("type") in ("coding", "debugging")
                else "Escribe tu respuesta aquí..."
            )
            self.text_input.setPlaceholderText(placeholder)
            starter = self.ex.get("code_starter", "")
            if starter:
                self.text_input.setPlainText(starter)
            self.text_input.setStyleSheet(
                f"QTextEdit {{ background: #222226; border: 1px solid {BORDER}; "
                f"border-radius: 6px; color: {TEXT}; font-size: 13px; padding: 10px; "
                f"font-family: {'Cascadia Mono, monospace' if self.ex.get('type') in ('coding', 'debugging') else UI_FONT}; }}"
                f"QTextEdit:focus {{ border-color: {ACCENT}; }}"
            )
            root.addWidget(self.text_input, stretch=1)

        # Feedback box (hidden initially)
        self.feedback_box = QFrame()
        self.feedback_box.setVisible(False)
        self.feedback_box.setStyleSheet(
            f"QFrame {{ background: #1c261e; border: 1px solid {GREEN}; border-radius: 6px; padding: 12px; }}"
        )
        fb_lay = QVBoxLayout(self.feedback_box)
        self.feedback_title = QLabel("Resultado")
        self.feedback_title.setStyleSheet("font-weight: bold; font-size: 13px;")
        self.feedback_desc = QLabel("")
        self.feedback_desc.setWordWrap(True)
        self.feedback_desc.setStyleSheet(f"color: {TEXT}; font-size: 12px;")
        fb_lay.addWidget(self.feedback_title)
        fb_lay.addWidget(self.feedback_desc)
        root.addWidget(self.feedback_box)

        # Buttons
        btn_bar = QHBoxLayout()
        if self.ex.get("hints"):
            hint_btn = QPushButton("💡 Pista")
            hint_btn.setCursor(Qt.PointingHandCursor)
            hint_btn.setStyleSheet(
                f"QPushButton {{ background: transparent; border: 1px solid {BORDER}; "
                f"border-radius: 4px; color: {TEXT_DIM}; padding: 6px 12px; font-size: 12px; }}"
            )
            hint_btn.clicked.connect(self._show_hint)
            btn_bar.addWidget(hint_btn)

        btn_bar.addStretch()

        self.submit_btn = QPushButton("Comprobar Respuesta")
        self.submit_btn.setCursor(Qt.PointingHandCursor)
        self.submit_btn.setStyleSheet(
            f"QPushButton {{ background: {ACCENT}; border: none; border-radius: 5px; "
            f"color: #ffffff; font-weight: bold; padding: 8px 18px; font-size: 13px; }}"
            f"QPushButton:hover {{ background: #6b46e5; }}"
        )
        self.submit_btn.clicked.connect(self._submit)
        btn_bar.addWidget(self.submit_btn)

        self.close_btn = QPushButton("Cerrar")
        self.close_btn.setCursor(Qt.PointingHandCursor)
        self.close_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: 1px solid {BORDER}; "
            f"border-radius: 5px; color: {TEXT}; padding: 8px 16px; font-size: 12px; }}"
        )
        self.close_btn.clicked.connect(self.accept)
        btn_bar.addWidget(self.close_btn)

        root.addLayout(btn_bar)

    def _show_hint(self):
        hints = self.ex.get("hints", [])
        if hints:
            first = hints[0]
            self.feedback_title.setText("💡 Pista:")
            self.feedback_desc.setText(first)
            self.feedback_box.setStyleSheet(
                f"QFrame {{ background: #26241a; border: 1px solid #f6bf26; border-radius: 6px; padding: 12px; }}"
            )
            self.feedback_title.setStyleSheet("font-weight: bold; font-size: 12px; color: #f6bf26;")
            self.feedback_box.setVisible(True)

    def _submit(self):
        if self._submitted:
            self.accept()
            return

        user_ans = ""
        is_correct = False
        expected = self.ex.get("expected_solution", "").strip()

        if self.options_group:
            sel_id = self.options_group.checkedId()
            if sel_id >= 0:
                user_ans = self.ex["options"][sel_id]
                correct_idx = self.ex.get("correct_option_index")
                if correct_idx is not None:
                    is_correct = (sel_id == int(correct_idx))
                elif expected:
                    is_correct = (user_ans.lower() == expected.lower())
        elif self.text_input:
            user_ans = self.text_input.toPlainText().strip()
            if expected:
                is_correct = (user_ans.lower() == expected.lower())
            else:
                # If no strict exact match, count length as non-empty attempt
                is_correct = bool(user_ans)

        # Record attempt
        score = 1.0 if is_correct else 0.0
        updated = self.mgr.record_attempt(
            self.ex["id"],
            user_answer=user_ans,
            is_correct=is_correct,
            score=score,
            feedback="Correcto" if is_correct else f"Solución esperada: {expected}" if expected else "Completado",
        )

        self._submitted = True
        self.feedback_box.setVisible(True)
        if is_correct:
            self.feedback_box.setStyleSheet(
                f"QFrame {{ background: #1c261e; border: 1px solid {GREEN}; border-radius: 6px; padding: 12px; }}"
            )
            self.feedback_title.setText("¡Correcto! ✓")
            self.feedback_title.setStyleSheet(f"font-weight: bold; font-size: 13px; color: {GREEN};")
            self.feedback_desc.setText("Excelente trabajo. Tu progreso y maestría han sido actualizados.")
        else:
            self.feedback_box.setStyleSheet(
                f"QFrame {{ background: #2b1d1d; border: 1px solid {RED}; border-radius: 6px; padding: 12px; }}"
            )
            self.feedback_title.setText("Respuesta incorrecta ✗")
            self.feedback_title.setStyleSheet(f"font-weight: bold; font-size: 13px; color: {RED};")
            sol_msg = f"\nSolución esperada:\n{expected}" if expected else ""
            self.feedback_desc.setText(f"Registrado como error para repetición espaciada.{sol_msg}")

        self.submit_btn.setText("Finalizar")
        if updated:
            self.attempt_finished.emit(updated)

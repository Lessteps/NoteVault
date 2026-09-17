"""
NoteVault Project Rubric Evaluation Dialog
Evaluate a project or issue against a configurable rubric.
Results are stored as a frontmatter field on the issue/project file.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QScrollArea, QWidget, QTextEdit, QGridLayout,
)
from PySide6.QtCore import Qt, Signal

from ..comun import TEXT, BORDER, TEXT_DIM, TEXT_FAINT, UI_FONT, BG_CARD

ACCENT = "#7c5af0"
BG_DLG = "#1a1a1e"
GREEN  = "#4ade80"
AMBER  = "#f59e0b"
RED    = "#f2555a"

DEFAULT_CRITERIA = [
    ("Corrección",      "El resultado es correcto y cumple los requisitos.",        3),
    ("Diseño",          "La solución está bien estructurada y es legible.",          2),
    ("Pruebas",         "Se probaron los casos principales y los límites.",          2),
    ("Documentación",   "El código o entregable está documentado con claridad.",    1),
    ("Eficiencia",      "Se consideraron alternativas y se eligió la más óptima.",  2),
]


def _score_color(score: int, max_score: int) -> str:
    ratio = score / max_score if max_score else 0
    if ratio >= 0.8:
        return GREEN
    if ratio >= 0.5:
        return AMBER
    return RED


class _StarRating(QWidget):
    rating_changed = Signal(int)

    def __init__(self, max_stars: int = 3, parent=None):
        super().__init__(parent)
        self.max_stars = max_stars
        self._value = 0
        self._btns: list[QPushButton] = []
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(2)
        for i in range(1, max_stars + 1):
            b = QPushButton("☆")
            b.setFixedSize(26, 26)
            b.setCursor(Qt.PointingHandCursor)
            b.setCheckable(False)
            b.setStyleSheet(
                "QPushButton{background:transparent;border:none;"
                f"color:{TEXT_FAINT};font-size:16px;padding:0;}}"
                f"QPushButton:hover{{color:{ACCENT};}}"
            )
            b.clicked.connect(lambda _=False, v=i: self.set_value(v))
            self._btns.append(b)
            lay.addWidget(b)
        lay.addStretch()

    def set_value(self, v: int):
        self._value = v
        for i, b in enumerate(self._btns):
            b.setText("★" if i < v else "☆")
            b.setStyleSheet(
                "QPushButton{background:transparent;border:none;"
                + (f"color:{ACCENT};" if i < v else f"color:{TEXT_FAINT};")
                + "font-size:16px;padding:0;}"
                "QPushButton:hover{color:#a78bfa;}"
            )
        self.rating_changed.emit(v)

    def value(self) -> int:
        return self._value


class _CriterionRow(QWidget):
    def __init__(self, name: str, description: str, max_score: int, parent=None):
        super().__init__(parent)
        self.name = name
        self.max_score = max_score

        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 6, 0, 6)
        lay.setSpacing(4)

        top = QHBoxLayout()
        name_lbl = QLabel(name)
        name_lbl.setStyleSheet(f"color:{TEXT};font-size:13px;font-weight:bold;")
        top.addWidget(name_lbl)
        top.addStretch()

        self._stars = _StarRating(max_score)
        top.addWidget(self._stars)

        score_label = QLabel(f"/ {max_score}")
        score_label.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;")
        top.addWidget(score_label)
        lay.addLayout(top)

        desc = QLabel(description)
        desc.setWordWrap(True)
        desc.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        lay.addWidget(desc)

        sep = QFrame()
        sep.setFrameShape(QFrame.HLine)
        sep.setStyleSheet(f"border:none;border-top:1px solid {BORDER};")
        lay.addWidget(sep)

    def get_score(self) -> int:
        return self._stars.value()

    def set_score(self, v: int):
        self._stars.set_value(min(v, self.max_score))


class RubricDialog(QDialog):
    """
    Modal rubric evaluation dialog.
    Call `exec()` → check `result()` → call `get_scores()` to retrieve.
    """

    def __init__(self, title: str = "", existing_scores: dict | None = None,
                 criteria: list | None = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Rúbrica de evaluación")
        self.setMinimumSize(500, 520)
        self.resize(540, 560)
        self.setStyleSheet(
            f"QDialog{{background:{BG_DLG};color:{TEXT};font-family:{UI_FONT};}}"
            f"QLabel{{color:{TEXT};}}"
        )
        self._criteria_rows: list[_CriterionRow] = []
        self._criteria_defs = criteria or DEFAULT_CRITERIA
        self._init_ui(title)
        if existing_scores:
            self._load_scores(existing_scores)

    def _init_ui(self, title: str):
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 16, 20, 16)
        root.setSpacing(10)

        # Header
        hdr = QLabel("📊 Evaluación por rúbrica")
        hdr.setStyleSheet(f"color:{TEXT};font-size:15px;font-weight:bold;")
        root.addWidget(hdr)

        if title:
            sub = QLabel(title)
            sub.setWordWrap(True)
            sub.setStyleSheet(f"color:{TEXT_DIM};font-size:12px;")
            root.addWidget(sub)

        # Criteria scroll
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.NoFrame)
        scroll.setStyleSheet("QScrollArea{background:transparent;border:none;}")
        criteria_widget = QWidget()
        criteria_widget.setStyleSheet("background:transparent;")
        crit_lay = QVBoxLayout(criteria_widget)
        crit_lay.setContentsMargins(0, 0, 0, 0)
        crit_lay.setSpacing(0)

        for name, desc, max_score in self._criteria_defs:
            row = _CriterionRow(name, desc, max_score)
            row.setStyleSheet(f"background:{BG_CARD};border-radius:6px;margin-bottom:6px;")
            row._stars.rating_changed.connect(self._update_total)
            self._criteria_rows.append(row)
            crit_lay.addWidget(row)

        crit_lay.addStretch()
        scroll.setWidget(criteria_widget)
        root.addWidget(scroll, stretch=1)

        # Score summary
        summary_frame = QFrame()
        summary_frame.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};border-radius:6px;padding:8px;}}"
        )
        sf_lay = QHBoxLayout(summary_frame)
        sf_lay.setContentsMargins(12, 8, 12, 8)

        self._score_lbl = QLabel("0 / 0")
        self._score_lbl.setStyleSheet(f"color:{GREEN};font-size:20px;font-weight:bold;")
        sf_lay.addWidget(self._score_lbl)

        self._pct_lbl = QLabel("0%")
        self._pct_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:14px;")
        sf_lay.addWidget(self._pct_lbl)

        sf_lay.addStretch()

        self._grade_lbl = QLabel("Sin evaluar")
        self._grade_lbl.setStyleSheet(f"color:{TEXT_FAINT};font-size:12px;")
        sf_lay.addWidget(self._grade_lbl)
        root.addWidget(summary_frame)

        # Notes
        notes_lbl = QLabel("Comentarios:")
        notes_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        root.addWidget(notes_lbl)

        self._notes_edit = QTextEdit()
        self._notes_edit.setFixedHeight(60)
        self._notes_edit.setPlaceholderText("Observaciones adicionales…")
        self._notes_edit.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT};font-size:12px;padding:6px;}}"
        )
        root.addWidget(self._notes_edit)

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        cancel = QPushButton("Cancelar")
        cancel.setCursor(Qt.PointingHandCursor)
        cancel.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT_DIM};font-size:12px;padding:7px 16px;}}"
            f"QPushButton:hover{{background:#28282e;color:{TEXT};}}"
        )
        cancel.clicked.connect(self.reject)
        btn_row.addWidget(cancel)

        save = QPushButton("Guardar evaluación")
        save.setCursor(Qt.PointingHandCursor)
        save.setStyleSheet(
            f"QPushButton{{background:{ACCENT};border:none;border-radius:5px;"
            f"color:#fff;font-size:12px;padding:7px 18px;}}"
        )
        save.clicked.connect(self.accept)
        btn_row.addWidget(save)
        root.addLayout(btn_row)

        self._update_total()

    def _update_total(self):
        total   = sum(r.get_score() for r in self._criteria_rows)
        max_tot = sum(d[2] for d in self._criteria_defs)
        pct = int(total / max_tot * 100) if max_tot else 0
        color = _score_color(total, max_tot)
        self._score_lbl.setText(f"{total} / {max_tot}")
        self._score_lbl.setStyleSheet(f"color:{color};font-size:20px;font-weight:bold;")
        self._pct_lbl.setText(f"({pct}%)")

        if pct >= 90:
            grade = "A — Excelente"
        elif pct >= 75:
            grade = "B — Bueno"
        elif pct >= 60:
            grade = "C — Aceptable"
        elif pct >= 40:
            grade = "D — Necesita mejora"
        else:
            grade = "F — Insuficiente"
        self._grade_lbl.setText(grade)

    def _load_scores(self, scores: dict):
        for row in self._criteria_rows:
            v = scores.get(row.name, 0)
            row.set_score(int(v))
        notes = scores.get("_notes", "")
        if notes:
            self._notes_edit.setPlainText(notes)

    def get_scores(self) -> dict:
        result = {}
        for row in self._criteria_rows:
            result[row.name] = row.get_score()
        result["_notes"] = self._notes_edit.toPlainText().strip()
        total   = sum(r.get_score() for r in self._criteria_rows)
        max_tot = sum(d[2] for d in self._criteria_defs)
        result["_total"] = total
        result["_max"]   = max_tot
        result["_pct"]   = round(total / max_tot * 100, 1) if max_tot else 0
        return result


def open_rubric(title: str = "", existing_scores: dict | None = None,
                criteria: list | None = None, parent=None) -> dict | None:
    """
    Convenience function: opens the dialog and returns scores dict if accepted, else None.
    """
    dlg = RubricDialog(title, existing_scores, criteria, parent)
    if dlg.exec() == QDialog.Accepted:
        return dlg.get_scores()
    return None

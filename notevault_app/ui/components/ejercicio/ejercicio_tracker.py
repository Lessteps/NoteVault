"""
Ejercicio — Tracker Diario
Table showing exercises for a day with done checkbox, weight and reps inputs.
"""

from datetime import date
from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QScrollArea, QCheckBox, QLineEdit, QPushButton, QSizePolicy, QLayout,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QIntValidator, QDoubleValidator

from ....core.exercise_manager import ExerciseManager

BG_PAGE  = "#191919"
BG_CARD  = "#202020"
BORDER   = "#2f2f2f"
TEXT     = "#e6e6e6"
TEXT_DIM = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
ORANGE   = "#ff9632"
BLUE_LINK = "#7b93d4"
GREEN    = "#4ade80"

DAY_LABELS = {
    "lunes": "Lunes", "martes": "Martes", "miercoles": "Miércoles",
    "jueves": "Jueves", "viernes": "Viernes",
    "sabado": "Sábado", "domingo": "Domingo",
}

SUBTITLES = {
    "lunes": "Top A — Fuerza",
    "martes": "Bottom A — Fuerza",
    "miercoles": "Top B — Hipertrofia",
    "jueves": "Bottom B — Hipertrofia",
    "viernes": "Full Body",
    "sabado": "Cardio / Movilidad",
    "domingo": "Descanso activo",
}


def _input(placeholder: str, width: int, validator=None) -> QLineEdit:
    e = QLineEdit()
    e.setPlaceholderText(placeholder)
    if width > 0:
        e.setFixedWidth(width)
    else:
        # width 0 means 'take the remaining space' (notes column)
        e.setMinimumWidth(140)
        e.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
    e.setFixedHeight(28)
    e.setStyleSheet(
        f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
        f"color:{TEXT};font-size:12px;padding:0 8px;}}"
        f"QLineEdit:focus{{border-color:{ORANGE};}}"
    )
    if validator:
        e.setValidator(validator)
    return e


class EjercicioTracker(QWidget):
    data_changed = Signal()
    # (absolute_video_path, exercise_name, day_key)
    play_video = Signal(str, str, str)

    def __init__(self, manager: ExerciseManager, day_key: str, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.day_key = day_key
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
        self._page.setContentsMargins(20, 18, 20, 20)
        self._page.setSpacing(0)
        self._page.setSizeConstraint(QLayout.SetMinimumSize)

        scroll.setWidget(content)
        outer.addWidget(scroll)

    def refresh(self):
        while self._page.count():
            item = self._page.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        today = date.today()
        exercises = self.manager.exercises_for_day(self.day_key)
        log = self.manager.get_log(today)

        # ── Day header ────────────────────────────────────────────────────
        hdr_row = QHBoxLayout()
        hdr_row.setContentsMargins(0, 0, 0, 16)
        hdr_row.setSpacing(12)

        v = QVBoxLayout()
        v.setSpacing(2)
        name_lbl = QLabel(DAY_LABELS.get(self.day_key, self.day_key))
        name_lbl.setStyleSheet(
            f"color:{TEXT};font-size:22px;font-weight:700;"
            "background:transparent;border:none;"
        )
        v.addWidget(name_lbl)
        sub_lbl = QLabel(SUBTITLES.get(self.day_key, ""))
        sub_lbl.setStyleSheet(
            f"color:{ORANGE};font-size:13px;background:transparent;border:none;"
        )
        v.addWidget(sub_lbl)
        hdr_row.addLayout(v)
        hdr_row.addStretch()

        # Date badge
        date_lbl = QLabel(today.strftime("%d/%m/%Y"))
        date_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:#252525;"
            f"border:1px solid {BORDER};border-radius:6px;padding:4px 10px;"
        )
        hdr_row.addWidget(date_lbl)
        self._page.addLayout(hdr_row)

        if not exercises:
            empty = QLabel(
                "No hay ejercicios para este día.\n"
                "Usa «Gestionar» para añadir ejercicios."
            )
            empty.setAlignment(Qt.AlignCenter)
            empty.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:14px;background:transparent;border:none;"
            )
            self._page.addWidget(empty)
            self._page.addStretch()
            return

        # ── Table card ────────────────────────────────────────────────────
        card = QFrame()
        card.setObjectName("notionCard")
        card.setStyleSheet(f"#notionCard{{background:{BG_CARD};border-radius:12px;}}")
        card_lay = QVBoxLayout(card)
        card_lay.setContentsMargins(0, 0, 0, 0)
        card_lay.setSpacing(0)

        # Header
        head = QFrame()
        head.setAttribute(Qt.WA_StyledBackground, True)
        head.setFixedHeight(34)
        head.setStyleSheet(
            f"background:#1a1a1a;border-top-left-radius:12px;"
            f"border-top-right-radius:12px;border-bottom:1px solid {BORDER};"
        )
        h_lay = QHBoxLayout(head)
        h_lay.setContentsMargins(16, 0, 16, 0)
        h_lay.setSpacing(0)
        for txt, w, align in [
            ("✓",           36,  Qt.AlignCenter),
            ("EJERCICIO",   220, Qt.AlignLeft),
            ("SERIES×REPS", 110, Qt.AlignCenter),
            ("PESO (kg)",   80,  Qt.AlignCenter),
            ("REPS HECHAS", 90,  Qt.AlignCenter),
            ("DESCANSO",    80,  Qt.AlignCenter),
            ("CÓMO HACERLO", 160, Qt.AlignLeft),
            ("NOTAS",        0,  Qt.AlignLeft),
        ]:
            lbl = QLabel(txt)
            if w:
                lbl.setFixedWidth(w)
            lbl.setAlignment(align | Qt.AlignVCenter)
            lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:10px;font-weight:600;"
                "letter-spacing:0.8px;background:transparent;border:none;"
            )
            h_lay.addWidget(lbl)
        card_lay.addWidget(head)

        for idx, ex in enumerate(exercises):
            row = self._make_row(ex, idx, log, today)
            card_lay.addWidget(row)

        self._page.addWidget(card)
        self._page.addStretch()

    def _make_row(self, ex: dict, idx: int, log, today: date) -> QFrame:
        eid = ex["id"]
        entry = log.entries.get(eid, {})
        is_done = entry.get("done", False)
        is_alt = idx % 2 == 1

        row = QFrame()
        row.setAttribute(Qt.WA_StyledBackground, True)
        done_bg = "#0d1f0d" if is_done else ("#1c1c1c" if is_alt else BG_CARD)
        row.setStyleSheet(
            f"QFrame{{background:{done_bg};border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(row)
        lay.setContentsMargins(16, 10, 16, 10)
        lay.setSpacing(0)
        lay.setAlignment(Qt.AlignVCenter)

        # ✓ checkbox
        cb = QCheckBox()
        cb.setChecked(is_done)
        cb.setFixedWidth(36)
        cb.setStyleSheet(
            f"QCheckBox::indicator{{width:18px;height:18px;border-radius:4px;"
            f"border:2px solid {'#4ade80' if is_done else '#6a6a72'};}}"
            f"QCheckBox::indicator:checked{{background:#4ade80;border-color:#4ade80;}}"
        )

        # Exercise name + video link
        name_col = QWidget()
        name_col.setFixedWidth(220)
        name_col.setStyleSheet("background:transparent;")
        n_lay = QVBoxLayout(name_col)
        n_lay.setContentsMargins(0, 0, 8, 0)
        n_lay.setSpacing(3)

        name_lbl = QLabel(ex["name"])
        name_lbl.setWordWrap(True)
        color = GREEN if is_done else TEXT
        name_lbl.setStyleSheet(
            f"color:{color};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        n_lay.addWidget(name_lbl)

        raw_video = ex.get("video_path") or ex.get("video", "")
        if raw_video:
            video_path = Path(raw_video)
            # 1. Try exact filename in videos dir
            if not video_path.is_absolute() or not video_path.exists():
                candidate = self.manager.videos_dir / video_path.name
                if candidate.exists():
                    video_path = candidate
            # 2. Fallback: prefix match (e.g. "5.Facepull" finds the long name)
            if not video_path.exists():
                stem = video_path.stem.lower()
                for f in self.manager.videos_dir.glob("*.mp4"):
                    if f.stem.lower().startswith(stem) or stem.startswith(f.stem.lower()):
                        video_path = f
                        break
            # Only show button if the file was actually found
            if not video_path.exists():
                raw_video = ""
        if raw_video:
            display_name = video_path.name if video_path.name else raw_video
            vid_btn = QPushButton(f"\u25b6  {display_name}")
            vid_btn.setCursor(Qt.PointingHandCursor)
            vid_btn.setStyleSheet(
                f"QPushButton{{background:transparent;border:none;"
                f"color:{BLUE_LINK};font-size:11px;text-align:left;padding:0;}}"
                "QPushButton:hover{color:#a0b8ff;}"
            )
            _path_str = str(video_path)
            _name = ex.get("name", "")
            _dk = self.day_key
            vid_btn.clicked.connect(
                lambda _, p=_path_str, n=_name, dk=_dk:
                    self.play_video.emit(p, n, dk)
            )
            n_lay.addWidget(vid_btn)

        lay.addWidget(cb)
        lay.addWidget(name_col)

        # Series × Reps (planned)
        sets_lbl = QLabel(ex.get("series_reps", ""))
        sets_lbl.setFixedWidth(110)
        sets_lbl.setAlignment(Qt.AlignCenter | Qt.AlignVCenter)
        sets_lbl.setStyleSheet(
            f"color:{TEXT};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        lay.addWidget(sets_lbl)

        # Weight input
        weight_in = _input("0", 80, QDoubleValidator(0, 500, 1))
        weight_in.setText(str(entry.get("weight", "")) if entry.get("weight") else "")
        lay.addWidget(weight_in)
        lay.addSpacing(10)

        # Reps done input
        reps_in = _input("0", 90, QIntValidator(0, 999))
        reps_in.setText(str(entry.get("reps", "")) if entry.get("reps") else "")
        lay.addWidget(reps_in)
        lay.addSpacing(10)

        # Rest
        rest_lbl = QLabel(ex.get("rest", ""))
        rest_lbl.setFixedWidth(80)
        rest_lbl.setAlignment(Qt.AlignCenter | Qt.AlignVCenter)
        rest_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
        )
        lay.addWidget(rest_lbl)
        lay.addSpacing(10)

        # How-to
        how_lbl = QLabel(ex.get("how_to", ""))
        how_lbl.setWordWrap(True)
        how_lbl.setFixedWidth(160)
        how_lbl.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        how_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(how_lbl)
        lay.addSpacing(8)

        # Notes input
        notes_in = _input("Notas...", 0, None)
        notes_in.setText(entry.get("notes", ""))
        notes_in.setSizePolicy(
            notes_in.sizePolicy().horizontalPolicy(),
            notes_in.sizePolicy().verticalPolicy(),
        )
        lay.addWidget(notes_in, stretch=1)

        def _save(_eid=eid, _cb=cb, _w=weight_in, _r=reps_in,
                  _n=notes_in, _row=row, _name=name_lbl):
            done = _cb.isChecked()
            try:
                weight = float(_w.text()) if _w.text() else 0.0
            except ValueError:
                weight = 0.0
            try:
                reps = int(_r.text()) if _r.text() else 0
            except ValueError:
                reps = 0
            notes = _n.text()
            self.manager.mark_done(date.today(), _eid, done, weight, reps, notes)
            done_color = GREEN if done else TEXT
            _name.setStyleSheet(
                f"color:{done_color};font-size:13px;font-weight:600;"
                "background:transparent;border:none;"
            )
            bg = "#0d1f0d" if done else (
                "#1c1c1c" if idx % 2 == 1 else BG_CARD
            )
            _row.setStyleSheet(
                f"QFrame{{background:{bg};border-bottom:1px solid {BORDER};}}"
            )
            self.data_changed.emit()

        cb.stateChanged.connect(lambda _: _save())
        weight_in.editingFinished.connect(_save)
        reps_in.editingFinished.connect(_save)
        notes_in.editingFinished.connect(_save)
        return row

    def set_manager(self, manager: ExerciseManager, vault_path: str = ""):
        self.manager = manager
        self.refresh()

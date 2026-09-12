"""
Ejercicio — Gestionar Ejercicios
Add, edit, delete exercises. Each exercise can have a video file path.
"""

from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QScrollArea, QFrame, QComboBox, QFileDialog, QLayout,
)
from PySide6.QtCore import Qt, Signal

from ....core.exercise_manager import ExerciseManager

BG_PAGE  = "#191919"
BG_CARD  = "#202020"
BORDER   = "#2f2f2f"
TEXT     = "#e6e6e6"
TEXT_DIM = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
ORANGE   = "#ff9632"
BLUE     = "#2383e2"
RED      = "#f2555a"

DAYS = [
    ("lunes",    "Lunes"),
    ("martes",   "Martes"),
    ("miercoles","Miércoles"),
    ("jueves",   "Jueves"),
    ("viernes",  "Viernes"),
    ("sabado",   "Sábado"),
    ("domingo",  "Domingo"),
]


def _field(placeholder: str, text: str = "") -> QLineEdit:
    e = QLineEdit(text)
    e.setPlaceholderText(placeholder)
    e.setFixedHeight(36)
    e.setStyleSheet(
        f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:8px;"
        f"color:{TEXT};font-size:13px;padding:0 12px;}}"
        f"QLineEdit:focus{{border-color:{ORANGE};}}"
    )
    return e


def _label(text: str) -> QLabel:
    lbl = QLabel(text)
    lbl.setStyleSheet(
        f"color:{TEXT_DIM};font-size:12px;background:transparent;border:none;"
    )
    return lbl


class EjercicioManage(QWidget):
    exercises_changed = Signal()

    def __init__(self, manager: ExerciseManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._editing_id: str = ""
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
        self._page.setSpacing(14)
        # Keep rows at their natural height; let the area scroll.
        self._page.setSizeConstraint(QLayout.SetMinimumSize)

        scroll.setWidget(content)
        outer.addWidget(scroll)

    def refresh(self):
        while self._page.count():
            item = self._page.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        # ── Title ─────────────────────────────────────────────────────────
        title = QLabel("⚙  Gestionar ejercicios")
        title.setStyleSheet(
            f"color:{TEXT};font-size:20px;font-weight:700;"
            "background:transparent;border:none;"
        )
        self._page.addWidget(title)

        # ── Exercise list ─────────────────────────────────────────────────
        list_card = QFrame()
        list_card.setObjectName("notionCard")
        list_card.setStyleSheet(
            f"#notionCard{{background:{BG_CARD};border-radius:12px;}}"
        )
        list_lay = QVBoxLayout(list_card)
        list_lay.setContentsMargins(18, 16, 18, 16)
        list_lay.setSpacing(8)

        title2 = QLabel("Ejercicios actuales")
        title2.setStyleSheet(
            f"color:{TEXT};font-size:14px;font-weight:600;"
            "background:transparent;border:none;"
        )
        list_lay.addWidget(title2)

        exercises = self.manager.exercises()
        day_order = [d[0] for d in DAYS]
        grouped: dict[str, list] = {k: [] for k in day_order}
        for ex in exercises:
            grouped.setdefault(ex.get("day", "lunes"), []).append(ex)

        for day_key, day_name in DAYS:
            day_exs = grouped.get(day_key, [])
            if not day_exs:
                continue
            day_hdr = QLabel(day_name)
            day_hdr.setStyleSheet(
                f"color:{ORANGE};font-size:12px;font-weight:600;"
                "background:transparent;border:none;margin-top:6px;"
            )
            list_lay.addWidget(day_hdr)

            for ex in day_exs:
                row = self._make_list_row(ex)
                list_lay.addWidget(row)

        if not exercises:
            empty = QLabel("Sin ejercicios. Añade el primero abajo.")
            empty.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:13px;background:transparent;border:none;"
            )
            list_lay.addWidget(empty)

        self._page.addWidget(list_card)

        # ── Add / Edit form ───────────────────────────────────────────────
        form_card = QFrame()
        form_card.setObjectName("notionCard")
        form_card.setStyleSheet(
            f"#notionCard{{background:{BG_CARD};border-radius:12px;}}"
        )
        form_lay = QVBoxLayout(form_card)
        form_lay.setContentsMargins(18, 16, 18, 16)
        form_lay.setSpacing(10)

        self._form_title = QLabel("➕  Añadir ejercicio")
        self._form_title.setStyleSheet(
            f"color:{TEXT};font-size:14px;font-weight:600;"
            "background:transparent;border:none;"
        )
        form_lay.addWidget(self._form_title)

        # Day selector
        form_lay.addWidget(_label("Día"))
        self._day_combo = QComboBox()
        for key, name in DAYS:
            self._day_combo.addItem(name, key)
        self._day_combo.setFixedHeight(36)
        self._day_combo.setStyleSheet(
            f"QComboBox{{background:#252525;border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-size:13px;padding:0 12px;}}"
            f"QComboBox::drop-down{{border:none;width:24px;}}"
            f"QComboBox QAbstractItemView{{background:#252525;color:{TEXT};"
            f"selection-background-color:{ORANGE};}}"
        )
        form_lay.addWidget(self._day_combo)

        # Name
        form_lay.addWidget(_label("Nombre"))
        self._f_name = _field("Ej: Bench Press, Sentadilla...")
        form_lay.addWidget(self._f_name)

        # Video path
        form_lay.addWidget(_label("Video (ruta del archivo)"))
        vid_row = QHBoxLayout()
        self._f_video = _field("/ruta/al/video.mp4")
        vid_row.addWidget(self._f_video, stretch=1)
        browse_btn = QPushButton("📂")
        browse_btn.setFixedSize(36, 36)
        browse_btn.setCursor(Qt.PointingHandCursor)
        browse_btn.setStyleSheet(
            f"QPushButton{{background:#252525;border:1px solid {BORDER};"
            "border-radius:8px;color:#e6e6e6;font-size:16px;}}"
            f"QPushButton:hover{{border-color:{ORANGE};}}"
        )
        browse_btn.clicked.connect(self._browse_video)
        vid_row.addWidget(browse_btn)
        form_lay.addLayout(vid_row)

        # Series × Reps
        row2 = QHBoxLayout()
        row2.setSpacing(10)
        c1 = QVBoxLayout()
        c1.addWidget(_label("Series × Reps"))
        self._f_sets = _field("4x5")
        c1.addWidget(self._f_sets)
        row2.addLayout(c1)
        c2 = QVBoxLayout()
        c2.addWidget(_label("Descanso"))
        self._f_rest = _field("2-3 min")
        c2.addWidget(self._f_rest)
        row2.addLayout(c2)
        form_lay.addLayout(row2)

        # How to
        form_lay.addWidget(_label("Cómo hacerlo"))
        self._f_howto = _field(
            "Escápulas retraídas, barra baja al pecho..."
        )
        form_lay.addWidget(self._f_howto)

        # Buttons
        btn_row = QHBoxLayout()
        self._save_btn = QPushButton("Guardar ejercicio")
        self._save_btn.setFixedHeight(38)
        self._save_btn.setCursor(Qt.PointingHandCursor)
        self._save_btn.setStyleSheet(
            f"QPushButton{{background:{ORANGE};border:none;border-radius:8px;"
            "color:#000000;font-size:14px;font-weight:600;}}"
            "QPushButton:hover{background:#e08020;}"
        )
        self._save_btn.clicked.connect(self._save_form)
        btn_row.addWidget(self._save_btn, stretch=1)

        cancel_btn = QPushButton("Cancelar")
        cancel_btn.setFixedHeight(38)
        cancel_btn.setCursor(Qt.PointingHandCursor)
        cancel_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};"
            f"border-radius:8px;color:{TEXT_DIM};font-size:14px;}}"
            f"QPushButton:hover{{color:{TEXT};}}"
        )
        cancel_btn.clicked.connect(self._clear_form)
        btn_row.addWidget(cancel_btn)
        form_lay.addLayout(btn_row)

        self._status_lbl = QLabel("")
        self._status_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        form_lay.addWidget(self._status_lbl)
        self._page.addWidget(form_card)
        self._page.addStretch()

    def _make_list_row(self, ex: dict) -> QFrame:
        row = QFrame()
        row.setAttribute(Qt.WA_StyledBackground, True)
        row.setFixedHeight(46)
        row.setStyleSheet("QFrame{background:#252525;border-radius:8px;}")
        lay = QHBoxLayout(row)
        lay.setContentsMargins(14, 0, 10, 0)
        lay.setSpacing(10)

        name = QLabel(ex["name"])
        name.setStyleSheet(
            f"color:{TEXT};font-size:13px;background:transparent;border:none;"
        )
        lay.addWidget(name, stretch=1)

        sets = QLabel(ex.get("series_reps", ""))
        sets.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(sets)

        edit_btn = QPushButton("✎")
        edit_btn.setFixedSize(26, 26)
        edit_btn.setCursor(Qt.PointingHandCursor)
        edit_btn.setStyleSheet(
            "QPushButton{background:transparent;border:none;color:#555560;font-size:14px;}"
            f"QPushButton:hover{{color:{ORANGE};}}"
        )
        eid = ex["id"]
        edit_btn.clicked.connect(lambda _, _id=eid: self._start_edit(_id))
        lay.addWidget(edit_btn)

        rm_btn = QPushButton("✕")
        rm_btn.setFixedSize(26, 26)
        rm_btn.setCursor(Qt.PointingHandCursor)
        rm_btn.setStyleSheet(
            "QPushButton{background:transparent;border:none;color:#555560;font-size:14px;}"
            f"QPushButton:hover{{color:{RED};}}"
        )
        rm_btn.clicked.connect(lambda _, _id=eid: self._remove(_id))
        lay.addWidget(rm_btn)
        return row

    def _browse_video(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Seleccionar video",
            str(Path.home()),
            "Videos (*.mp4 *.mkv *.avi *.mov *.webm);;Todos (*.*)",
        )
        if path:
            self._f_video.setText(path)

    def _save_form(self):
        name = self._f_name.text().strip()
        if not name:
            self._status_lbl.setText("⚠  Escribe un nombre.")
            return
        day_key = self._day_combo.currentData()
        video   = self._f_video.text().strip()
        sets    = self._f_sets.text().strip()
        rest    = self._f_rest.text().strip()
        howto   = self._f_howto.text().strip()

        if self._editing_id:
            self.manager.update_exercise(
                self._editing_id,
                name=name,
                day=day_key,
                video_path=video,
                video=Path(video).name if video else "",
                series_reps=sets,
                rest=rest,
                how_to=howto,
            )
            self._status_lbl.setText(f"✓  «{name}» actualizado.")
        else:
            self.manager.add_exercise(name, day_key, video, sets, rest, howto)
            self._status_lbl.setText(f"✓  «{name}» añadido.")

        self._editing_id = ""
        self.exercises_changed.emit()
        self.refresh()

    def _clear_form(self):
        self._editing_id = ""
        if hasattr(self, '_f_name'):
            self._f_name.clear()
            self._f_video.clear()
            self._f_sets.clear()
            self._f_rest.clear()
            self._f_howto.clear()
            self._form_title.setText("➕  Añadir ejercicio")
            self._status_lbl.setText("")

    def _start_edit(self, exercise_id: str):
        ex = next((e for e in self.manager.exercises() if e["id"] == exercise_id), None)
        if not ex:
            return
        self._editing_id = exercise_id
        self._form_title.setText(f"✎  Editar: {ex['name']}")
        idx = next((i for i, (k, _) in enumerate(DAYS) if k == ex.get("day")), 0)
        self._day_combo.setCurrentIndex(idx)
        self._f_name.setText(ex.get("name", ""))
        self._f_video.setText(ex.get("video_path", "") or ex.get("video", ""))
        self._f_sets.setText(ex.get("series_reps", ""))
        self._f_rest.setText(ex.get("rest", ""))
        self._f_howto.setText(ex.get("how_to", ""))
        self._status_lbl.setText("")
        # Scroll to form
        self._page.parentWidget().ensureWidgetVisible(
            self._page.itemAt(self._page.count() - 2).widget()
            if self._page.count() > 1 else self
        ) if hasattr(self._page.parentWidget(), 'ensureWidgetVisible') else None

    def _remove(self, exercise_id: str):
        self.manager.remove_exercise(exercise_id)
        self.exercises_changed.emit()
        self.refresh()

    def set_manager(self, manager: ExerciseManager):
        self.manager = manager
        self.refresh()

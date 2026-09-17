"""
NoteVault Note Properties Dialog
Interactive dialog to inspect and edit YAML frontmatter properties for a note.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QComboBox,
    QSpinBox, QSlider, QPushButton, QFrame, QFormLayout
)
from PySide6.QtCore import Qt

from ..comun import TEXT, BORDER, TEXT_DIM, UI_FONT
from ....core.frontmatter_utils import (
    VALID_SUBJECTS, VALID_TYPES, VALID_STATUSES, sanitize_properties
)

ACCENT = "#7c5af0"
BG_DIALOG = "#1a1a1e"


class NotePropertiesDialog(QDialog):
    def __init__(self, initial_props: dict, note_title: str = "", parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"Propiedades de la Nota — {note_title or 'Nota'}")
        self.setFixedWidth(460)
        self.setStyleSheet(
            f"QDialog {{ background: {BG_DIALOG}; color: {TEXT}; font-family: {UI_FONT}; }}"
            f"QLabel {{ color: {TEXT}; font-size: 12px; }}"
            f"QLineEdit, QComboBox, QSpinBox {{ background: #252528; border: 1px solid {BORDER}; "
            f"border-radius: 5px; color: {TEXT}; padding: 5px 8px; font-size: 12px; }}"
            f"QLineEdit:focus, QComboBox:focus, QSpinBox:focus {{ border-color: {ACCENT}; }}"
        )

        self._props = dict(initial_props)
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(20, 20, 20, 20)
        lay.setSpacing(14)

        header = QLabel("Metadatos y Configuración de Estudio")
        header.setStyleSheet(f"font-size: 14px; font-weight: bold; color: {TEXT};")
        lay.addWidget(header)

        desc = QLabel("Estas propiedades clasifican la nota para el motor de ejercicios, SRS y maestría.")
        desc.setStyleSheet(f"color: {TEXT_DIM}; font-size: 11px;")
        desc.setWordWrap(True)
        lay.addWidget(desc)

        form = QFormLayout()
        form.setSpacing(10)
        form.setLabelAlignment(Qt.AlignRight)

        # Subject / Materia
        self.subject_cb = QComboBox()
        subject_labels = {
            "mathematics": "📐 Matemáticas",
            "programming": "💻 Programación",
            "english": "🌐 Inglés",
            "general": "📝 General",
        }
        for s in VALID_SUBJECTS:
            self.subject_cb.addItem(subject_labels.get(s, s.capitalize()), s)
        cur_subj = str(self._props.get("subject") or "general").lower()
        idx = self.subject_cb.findData(cur_subj)
        if idx >= 0:
            self.subject_cb.setCurrentIndex(idx)
        form.addRow("Disciplina:", self.subject_cb)

        # Topic / Tema
        self.topic_edit = QLineEdit(str(self._props.get("topic") or ""))
        self.topic_edit.setPlaceholderText("p. ej. Derivadas, Arrays, Past Simple")
        form.addRow("Tema / Topic:", self.topic_edit)

        # Entity Type
        self.type_cb = QComboBox()
        for t in VALID_TYPES:
            self.type_cb.addItem(t.capitalize(), t)
        cur_type = str(self._props.get("type") or "concept").lower()
        t_idx = self.type_cb.findData(cur_type)
        if t_idx >= 0:
            self.type_cb.setCurrentIndex(t_idx)
        form.addRow("Tipo de Entidad:", self.type_cb)

        # Difficulty (1-5)
        self.diff_cb = QComboBox()
        diff_labels = [
            (1, "1 — Muy básico"),
            (2, "2 — Básico"),
            (3, "3 — Intermedio"),
            (4, "4 — Avanzado"),
            (5, "5 — Experto / Maestría"),
        ]
        for val, label in diff_labels:
            self.diff_cb.addItem(label, val)
        cur_diff = int(self._props.get("difficulty") or 1)
        d_idx = self.diff_cb.findData(cur_diff)
        if d_idx >= 0:
            self.diff_cb.setCurrentIndex(d_idx)
        form.addRow("Dificultad:", self.diff_cb)

        # Status
        self.status_cb = QComboBox()
        for st in VALID_STATUSES:
            self.status_cb.addItem(st.capitalize(), st)
        cur_status = str(self._props.get("status") or "learning").lower()
        s_idx = self.status_cb.findData(cur_status)
        if s_idx >= 0:
            self.status_cb.setCurrentIndex(s_idx)
        form.addRow("Estado:", self.status_cb)

        # Mastery % (0.0 to 1.0)
        mastery_lay = QHBoxLayout()
        self.mastery_slider = QSlider(Qt.Horizontal)
        self.mastery_slider.setRange(0, 100)
        cur_mastery = int(float(self._props.get("mastery") or 0.0) * 100)
        self.mastery_slider.setValue(cur_mastery)
        self.mastery_label = QLabel(f"{cur_mastery}%")
        self.mastery_label.setFixedWidth(40)
        self.mastery_slider.valueChanged.connect(lambda v: self.mastery_label.setText(f"{v}%"))
        mastery_lay.addWidget(self.mastery_slider)
        mastery_lay.addWidget(self.mastery_label)
        form.addRow("Maestría:", mastery_lay)

        # Tags
        tags_val = self._props.get("tags", [])
        if isinstance(tags_val, list):
            tags_str = ", ".join(str(t) for t in tags_val)
        else:
            tags_str = str(tags_val or "")
        self.tags_edit = QLineEdit(tags_str)
        self.tags_edit.setPlaceholderText("calculo, formulas, derivadas")
        form.addRow("Etiquetas:", self.tags_edit)

        lay.addLayout(form)

        # Action buttons
        btn_box = QHBoxLayout()
        btn_box.addStretch()

        cancel_btn = QPushButton("Cancelar")
        cancel_btn.setCursor(Qt.PointingHandCursor)
        cancel_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: 1px solid {BORDER}; "
            f"border-radius: 5px; color: {TEXT}; padding: 6px 14px; }}"
            f"QPushButton:hover {{ background: #2a2a2e; }}"
        )
        cancel_btn.clicked.connect(self.reject)
        btn_box.addWidget(cancel_btn)

        save_btn = QPushButton("Guardar Propiedades")
        save_btn.setCursor(Qt.PointingHandCursor)
        save_btn.setStyleSheet(
            f"QPushButton {{ background: {ACCENT}; border: none; "
            f"border-radius: 5px; color: #ffffff; font-weight: bold; padding: 6px 16px; }}"
            f"QPushButton:hover {{ background: #6b46e5; }}"
        )
        save_btn.clicked.connect(self.accept)
        btn_box.addWidget(save_btn)

        lay.addLayout(btn_box)

    def get_properties(self) -> dict:
        tags_raw = self.tags_edit.text().strip()
        tags_list = [t.strip() for t in tags_raw.split(",") if t.strip()]

        data = {
            "subject": self.subject_cb.currentData(),
            "topic": self.topic_edit.text().strip(),
            "type": self.type_cb.currentData(),
            "difficulty": self.diff_cb.currentData(),
            "status": self.status_cb.currentData(),
            "mastery": round(self.mastery_slider.value() / 100.0, 2),
            "tags": tags_list,
        }
        return sanitize_properties(data)

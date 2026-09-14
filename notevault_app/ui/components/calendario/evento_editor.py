"""
Evento Editor Dialog.
Modal dialog to create or edit calendar events.
"""

from datetime import date
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QDateEdit, QTimeEdit, QSpinBox, QTextEdit, QPushButton,
    QWidget, QButtonGroup, QRadioButton, QFormLayout
)
from PySide6.QtCore import Qt, QDate, QTime
from PySide6.QtGui import QColor

COLOR_PRESETS = [
    ("blue", "#2383e2", "Azul"),
    ("orange", "#ff9632", "Naranja"),
    ("purple", "#7c5af0", "Morado"),
    ("green", "#2dd4bf", "Verde"),
    ("red", "#ef4444", "Rojo"),
    ("yellow", "#eab308", "Amarillo"),
]


class EventoEditorDialog(QDialog):
    def __init__(self, parent=None, event_data: dict = None, date_val: date = None):
        super().__init__(parent)
        self.event_data = event_data or {}
        self.date_val = date_val or date.today()
        self.is_edit = bool(self.event_data.get("id"))
        self.is_deleted = False

        self.setWindowTitle("Editar evento" if self.is_edit else "Nuevo evento")
        self.setMinimumWidth(380)
        self.setStyleSheet("""
            QDialog { background-color: #202024; color: #dcdde0; }
            QLabel { color: #dcdde0; font-size: 12px; font-weight: bold; }
            QLineEdit, QDateEdit, QTimeEdit, QSpinBox, QTextEdit {
                background-color: #252525; border: 1px solid #33333e;
                border-radius: 4px; color: #dcdde0; padding: 6px; font-size: 13px;
            }
            QLineEdit:focus, QDateEdit:focus, QTimeEdit:focus, QSpinBox:focus, QTextEdit:focus {
                border-color: #2383e2;
            }
            QPushButton {
                background-color: #252525; border: 1px solid #33333e;
                border-radius: 4px; color: #dcdde0; padding: 6px 14px; font-size: 12px;
            }
            QPushButton:hover { background-color: #2a2a2a; border-color: #2383e2; }
            QPushButton#saveBtn { background-color: #2383e2; color: #ffffff; border: none; font-weight: bold; }
            QPushButton#saveBtn:hover { background-color: #1a6fc4; }
            QPushButton#deleteBtn { background-color: #ef4444; color: #ffffff; border: none; }
            QPushButton#deleteBtn:hover { background-color: #c1393e; }
        """)

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(14)

        form = QFormLayout()
        form.setSpacing(10)

        # Title
        self.title_edit = QLineEdit()
        self.title_edit.setPlaceholderText("Título del evento")
        self.title_edit.setText(self.event_data.get("title", ""))
        form.addRow("Título:", self.title_edit)

        # Date
        self.date_edit = QDateEdit()
        self.date_edit.setCalendarPopup(True)
        d = self.date_val
        if self.is_edit and self.event_data.get("date"):
            try:
                d = date.fromisoformat(self.event_data["date"])
            except ValueError:
                pass
        self.date_edit.setDate(QDate(d.year, d.month, d.day))
        form.addRow("Fecha:", self.date_edit)

        # Start Time
        self.time_edit = QTimeEdit()
        self.time_edit.setDisplayFormat("HH:mm")
        start_str = self.event_data.get("start") or "09:00"
        try:
            h, m = map(int, start_str.split(":"))
            self.time_edit.setTime(QTime(h, m))
        except ValueError:
            self.time_edit.setTime(QTime(9, 0))
        form.addRow("Hora inicio:", self.time_edit)

        # Duration
        self.duration_spin = QSpinBox()
        self.duration_spin.setRange(15, 720)
        self.duration_spin.setSingleStep(15)
        self.duration_spin.setSuffix(" min")
        self.duration_spin.setValue(self.event_data.get("duration_min") or 60)
        form.addRow("Duración:", self.duration_spin)

        # Colour selection
        color_layout = QHBoxLayout()
        color_layout.setSpacing(6)
        self.color_group = QButtonGroup(self)
        selected_colour = self.event_data.get("colour", "orange")

        for idx, (c_name, hex_code, label_txt) in enumerate(COLOR_PRESETS):
            btn = QRadioButton()
            btn.setToolTip(label_txt)
            btn.setStyleSheet(f"""
                QRadioButton::indicator {{
                    width: 20px; height: 20px; border-radius: 10px;
                    background-color: {hex_code}; border: 2px solid transparent;
                }}
                QRadioButton::indicator:checked {{
                    border-color: #ffffff;
                }}
            """)
            if c_name == selected_colour or hex_code == selected_colour or (idx == 0 and not selected_colour):
                btn.setChecked(True)
            self.color_group.addButton(btn, idx)
            color_layout.addWidget(btn)
        color_layout.addStretch()
        form.addRow("Color:", color_layout)

        # Notes
        self.notes_edit = QTextEdit()
        self.notes_edit.setMaximumHeight(80)
        self.notes_edit.setPlaceholderText("Notas u observaciones...")
        self.notes_edit.setPlainText(self.event_data.get("notes", ""))
        form.addRow("Notas:", self.notes_edit)

        layout.addLayout(form)

        # Buttons
        btn_layout = QHBoxLayout()
        if self.is_edit:
            delete_btn = QPushButton("Eliminar")
            delete_btn.setObjectName("deleteBtn")
            delete_btn.setCursor(Qt.PointingHandCursor)
            delete_btn.clicked.connect(self._on_delete)
            btn_layout.addWidget(delete_btn)

        btn_layout.addStretch()

        cancel_btn = QPushButton("Cancelar")
        cancel_btn.setCursor(Qt.PointingHandCursor)
        cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(cancel_btn)

        save_btn = QPushButton("Guardar")
        save_btn.setObjectName("saveBtn")
        save_btn.setCursor(Qt.PointingHandCursor)
        save_btn.clicked.connect(self._on_save)
        btn_layout.addWidget(save_btn)

        layout.addLayout(btn_layout)

    def _on_delete(self):
        self.is_deleted = True
        self.accept()

    def _on_save(self):
        if not self.title_edit.text().strip():
            self.title_edit.setFocus()
            return
        self.accept()

    def get_data(self) -> dict:
        qdate = self.date_edit.date()
        d_val = date(qdate.year(), qdate.month(), qdate.day())

        qtime = self.time_edit.time()
        start_str = f"{qtime.hour():02d}:{qtime.minute():02d}"

        checked_id = self.color_group.checkedId()
        colour = COLOR_PRESETS[checked_id][0] if checked_id >= 0 else "orange"

        res = {
            "title": self.title_edit.text().strip() or "Sin título",
            "date": d_val.isoformat(),
            "start": start_str,
            "duration_min": self.duration_spin.value(),
            "colour": colour,
            "notes": self.notes_edit.toPlainText().strip(),
        }
        if self.is_edit and self.event_data.get("id"):
            res["id"] = self.event_data["id"]
        return res

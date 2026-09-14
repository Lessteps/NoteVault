"""
Rutina Editor Dialog.
Recurring routine template editor with 7 day columns, drag/drop or add blocks,
per-weekday times, active_from/active_until, links to habits/exercises/tasks/projects,
and "Aplicar plantilla" preview.
"""

from datetime import date, timedelta
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QComboBox,
    QCheckBox, QTimeEdit, QSpinBox, QTextEdit, QPushButton, QWidget,
    QStackedWidget, QTableWidget, QTableWidgetItem, QHeaderView, QGroupBox,
    QFormLayout, QMessageBox, QDateEdit, QSplitter
)
from PySide6.QtCore import Qt, QDate, QTime
from ....core import vault_format
from . import weekday_name

COLOR_PRESETS = [
    ("blue", "#2383e2", "Azul"),
    ("teal", "#2dd4bf", "Verde azulado"),
    ("purple", "#7c5af0", "Morado"),
    ("orange", "#ff9632", "Naranja"),
    ("red", "#ef4444", "Rojo"),
    ("yellow", "#eab308", "Amarillo"),
]


class RoutineBlockForm(QDialog):
    """Sub-dialog to create or edit a single routine block."""

    def __init__(self, schedule_mgr, block_data: dict = None, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.data = block_data or {}
        self.is_edit = bool(self.data.get("id"))

        self.setWindowTitle("Editar bloque de rutina" if self.is_edit else "Nuevo bloque de rutina")
        self.setMinimumWidth(420)
        self.setStyleSheet("""
            QDialog { background-color: #202024; color: #dcdde0; }
            QLabel { color: #dcdde0; font-size: 12px; font-weight: bold; }
            QLineEdit, QComboBox, QTimeEdit, QSpinBox, QTextEdit, QDateEdit {
                background-color: #252525; border: 1px solid #33333e;
                border-radius: 4px; color: #dcdde0; padding: 6px; font-size: 12px;
            }
            QCheckBox { color: #dcdde0; font-size: 12px; }
            QPushButton {
                background-color: #252525; border: 1px solid #33333e;
                border-radius: 4px; color: #dcdde0; padding: 6px 14px; font-size: 12px;
            }
            QPushButton:hover { background-color: #2a2a2a; border-color: #2383e2; }
            QPushButton#saveBtn { background-color: #2383e2; color: #ffffff; border: none; font-weight: bold; }
        """)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(12)

        form = QFormLayout()
        form.setSpacing(8)

        # Title
        self.title_edit = QLineEdit()
        self.title_edit.setText(self.data.get("title", ""))
        self.title_edit.setPlaceholderText("Ej. Estudio Backend")
        form.addRow("Título:", self.title_edit)

        # Days checkboxes
        days_layout = QHBoxLayout()
        days_layout.setSpacing(6)
        self.day_checkboxes = {}
        active_days = self.data.get("days", list(vault_format.WEEKDAY_KEYS[:5]))

        day_labels = [("lunes", "L"), ("martes", "M"), ("miercoles", "X"),
                      ("jueves", "J"), ("viernes", "V"), ("sabado", "S"), ("domingo", "D")]
        for k, lbl in day_labels:
            cb = QCheckBox(lbl)
            cb.setChecked(k in active_days)
            self.day_checkboxes[k] = cb
            days_layout.addWidget(cb)
        days_layout.addStretch()
        form.addRow("Días:", days_layout)

        # Start time
        self.time_edit = QTimeEdit()
        self.time_edit.setDisplayFormat("HH:mm")
        st = self.data.get("start") or "08:00"
        try:
            h, m = map(int, st.split(":"))
            self.time_edit.setTime(QTime(h, m))
        except ValueError:
            self.time_edit.setTime(QTime(8, 0))
        form.addRow("Hora inicio:", self.time_edit)

        # Duration
        self.duration_spin = QSpinBox()
        self.duration_spin.setRange(15, 720)
        self.duration_spin.setSingleStep(15)
        self.duration_spin.setSuffix(" min")
        self.duration_spin.setValue(self.data.get("duration_min") or 60)
        form.addRow("Duración:", self.duration_spin)

        # Colour
        self.colour_combo = QComboBox()
        cur_col = self.data.get("colour", "blue")
        for idx, (c_name, hex_code, c_label) in enumerate(COLOR_PRESETS):
            self.colour_combo.addItem(f"{c_label} ({c_name})", c_name)
            if c_name == cur_col:
                self.colour_combo.setCurrentIndex(idx)
        form.addRow("Color:", self.colour_combo)

        # Active range
        self.use_active_from = QCheckBox("Desde:")
        self.date_from = QDateEdit()
        self.date_from.setCalendarPopup(True)
        self.date_from.setEnabled(False)
        if self.data.get("active_from"):
            try:
                af = date.fromisoformat(self.data["active_from"])
                self.date_from.setDate(QDate(af.year, af.month, af.day))
                self.use_active_from.setChecked(True)
                self.date_from.setEnabled(True)
            except ValueError:
                self.date_from.setDate(QDate.currentDate())
        else:
            self.date_from.setDate(QDate.currentDate())
        self.use_active_from.toggled.connect(self.date_from.setEnabled)

        af_lay = QHBoxLayout()
        af_lay.addWidget(self.use_active_from)
        af_lay.addWidget(self.date_from)
        form.addRow("Vigencia desde:", af_lay)

        self.use_active_until = QCheckBox("Hasta:")
        self.date_until = QDateEdit()
        self.date_until.setCalendarPopup(True)
        self.date_until.setEnabled(False)
        if self.data.get("active_until"):
            try:
                au = date.fromisoformat(self.data["active_until"])
                self.date_until.setDate(QDate(au.year, au.month, au.day))
                self.use_active_until.setChecked(True)
                self.date_until.setEnabled(True)
            except ValueError:
                self.date_until.setDate(QDate.currentDate().addDays(30))
        else:
            self.date_until.setDate(QDate.currentDate().addDays(30))
        self.use_active_until.toggled.connect(self.date_until.setEnabled)

        au_lay = QHBoxLayout()
        au_lay.addWidget(self.use_active_until)
        au_lay.addWidget(self.date_until)
        form.addRow("Vigencia hasta:", au_lay)

        # Link to module
        self.link_combo = QComboBox()
        self.link_combo.addItem("Sin vinculación", None)
        # Populate from tasks, projects, habits
        if hasattr(self.schedule_mgr, "task_mgr"):
            for t in self.schedule_mgr.task_mgr.tasks():
                self.link_combo.addItem(f"Tarea: {t.name}", {"type": "task", "id": t.id})
        if hasattr(self.schedule_mgr, "project_mgr"):
            for p in self.schedule_mgr.project_mgr.projects():
                self.link_combo.addItem(f"Proyecto: {p.name}", {"type": "project", "id": p.id})

        existing_links = self.data.get("links", [])
        if existing_links:
            first_link = existing_links[0]
            for i in range(self.link_combo.count()):
                item_data = self.link_combo.itemData(i)
                if item_data and item_data.get("type") == first_link.get("type") and item_data.get("id") == first_link.get("id"):
                    self.link_combo.setCurrentIndex(i)
                    break
        form.addRow("Vincular a:", self.link_combo)

        # Notes
        self.notes_edit = QTextEdit()
        self.notes_edit.setMaximumHeight(60)
        self.notes_edit.setPlainText(self.data.get("notes", ""))
        form.addRow("Notas:", self.notes_edit)

        layout.addLayout(form)

        # Buttons
        btns = QHBoxLayout()
        btns.addStretch()
        cancel_btn = QPushButton("Cancelar")
        cancel_btn.clicked.connect(self.reject)
        btns.addWidget(cancel_btn)

        save_btn = QPushButton("Guardar")
        save_btn.setObjectName("saveBtn")
        save_btn.clicked.connect(self._on_save)
        btns.addWidget(save_btn)

        layout.addLayout(btns)

    def _on_save(self):
        if not self.title_edit.text().strip():
            self.title_edit.setFocus()
            return
        self.accept()

    def get_data(self) -> dict:
        selected_days = [k for k, cb in self.day_checkboxes.items() if cb.isChecked()]
        qt_t = self.time_edit.time()
        start_str = f"{qt_t.hour():02d}:{qt_t.minute():02d}"

        af_str = None
        if self.use_active_from.isChecked():
            qd = self.date_from.date()
            af_str = date(qd.year(), qd.month(), qd.day()).isoformat()

        au_str = None
        if self.use_active_until.isChecked():
            qd = self.date_until.date()
            au_str = date(qd.year(), qd.month(), qd.day()).isoformat()

        link_data = self.link_combo.currentData()
        links = [link_data] if link_data else []

        res = {
            "title": self.title_edit.text().strip(),
            "days": selected_days,
            "start": start_str,
            "duration_min": self.duration_spin.value(),
            "colour": self.link_combo.currentData() if False else self.colour_combo.currentData(),
            "active_from": af_str,
            "active_until": au_str,
            "links": links,
            "notes": self.notes_edit.toPlainText().strip(),
        }
        if self.is_edit and self.data.get("id"):
            res["id"] = self.data["id"]
        return res


class RutinaEditorDialog(QDialog):
    """Dialog to view, add, edit, remove routines and preview template application."""

    def __init__(self, schedule_mgr, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.setWindowTitle("Editor de Rutinas Recurrentes")
        self.resize(850, 550)
        self.setStyleSheet("""
            QDialog { background-color: #1a1a1e; color: #dcdde0; }
            QLabel { color: #dcdde0; font-size: 13px; }
            QTableWidget {
                background-color: #202024; border: 1px solid #33333e;
                color: #dcdde0; gridline-color: #2d2d38;
            }
            QHeaderView::section {
                background-color: #25252b; color: #dcdde0;
                padding: 6px; font-weight: bold; border: 1px solid #33333e;
            }
            QPushButton {
                background-color: #252525; border: 1px solid #33333e;
                border-radius: 4px; color: #dcdde0; padding: 6px 14px; font-size: 12px;
            }
            QPushButton:hover { background-color: #2a2a2a; border-color: #2383e2; }
            QPushButton#addBtn { background-color: #2383e2; color: #ffffff; border: none; font-weight: bold; }
        """)

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Header
        top_bar = QHBoxLayout()
        title_lbl = QLabel("Plantilla Semanal de Rutinas")
        title_lbl.setStyleSheet("font-size: 16px; font-weight: bold; color: #dcdde0;")
        top_bar.addWidget(title_lbl)

        top_bar.addStretch()

        preview_btn = QPushButton("Aplicar plantilla (Vista Previa)")
        preview_btn.clicked.connect(self._show_preview)
        top_bar.addWidget(preview_btn)

        add_btn = QPushButton("+ Nueva Rutina")
        add_btn.setObjectName("addBtn")
        add_btn.setCursor(Qt.PointingHandCursor)
        add_btn.clicked.connect(self._add_routine)
        top_bar.addWidget(add_btn)

        layout.addLayout(top_bar)

        # 7-Column Weekly Table
        self.table = QTableWidget(0, 7)
        self.table.setHorizontalHeaderLabels(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.doubleClicked.connect(self._edit_selected_routine)

        layout.addWidget(self.table, stretch=1)

        # Action bar
        act_bar = QHBoxLayout()
        info_lbl = QLabel("Haga doble clic en una rutina para editarla o eliminarla.")
        info_lbl.setStyleSheet("color: #888895; font-size: 11px;")
        act_bar.addWidget(info_lbl)

        act_bar.addStretch()

        edit_btn = QPushButton("Editar")
        edit_btn.clicked.connect(self._edit_selected_routine)
        act_bar.addWidget(edit_btn)

        del_btn = QPushButton("Eliminar")
        del_btn.clicked.connect(self._delete_selected_routine)
        act_bar.addWidget(del_btn)

        close_btn = QPushButton("Cerrar")
        close_btn.clicked.connect(self.accept)
        act_bar.addWidget(close_btn)

        layout.addLayout(act_bar)

        self._refresh_table()

    def _refresh_table(self):
        routines = self.schedule_mgr.routines()
        self.table.setRowCount(0)

        # Group routines by weekday
        day_routines = {k: [] for k in vault_format.WEEKDAY_KEYS}
        for r in routines:
            for d in r.get("days", []):
                if d in day_routines:
                    day_routines[d].append(r)

        max_rows = max([len(v) for v in day_routines.values()] + [1])
        self.table.setRowCount(max_rows)

        for col_idx, key in enumerate(vault_format.WEEKDAY_KEYS):
            r_list = day_routines[key]
            # sort by start time
            r_list.sort(key=lambda x: x.get("start") or "00:00")
            for row_idx, r in enumerate(r_list):
                st = r.get("start") or "Todo el día"
                dur = f"{r.get('duration_min', 60)}m" if r.get("start") else ""
                txt = f"{r.get('title', 'Rutina')}\n{st} ({dur})"
                item = QTableWidgetItem(txt)
                item.setData(Qt.UserRole, r.get("id"))
                item.setTextAlignment(Qt.AlignCenter)
                self.table.setItem(row_idx, col_idx, item)

    def _add_routine(self):
        dlg = RoutineBlockForm(self.schedule_mgr, parent=self)
        if dlg.exec() == QDialog.Accepted:
            data = dlg.get_data()
            self.schedule_mgr.add_routine(**data)
            self._refresh_table()

    def _get_selected_routine_id(self) -> str | None:
        curr = self.table.currentItem()
        if curr and curr.data(Qt.UserRole):
            return curr.data(Qt.UserRole)
        return None

    def _edit_selected_routine(self):
        rid = self._get_selected_routine_id()
        if not rid:
            return
        routines = self.schedule_mgr.routines()
        target = next((r for r in routines if r.get("id") == rid), None)
        if not target:
            return

        dlg = RoutineBlockForm(self.schedule_mgr, block_data=target, parent=self)
        if dlg.exec() == QDialog.Accepted:
            data = dlg.get_data()
            self.schedule_mgr.update_routine(rid, **data)
            self._refresh_table()

    def _delete_selected_routine(self):
        rid = self._get_selected_routine_id()
        if not rid:
            return
        res = QMessageBox.question(self, "Eliminar Rutina", "¿Eliminar esta rutina de la plantilla?",
                                   QMessageBox.Yes | QMessageBox.No)
        if res == QMessageBox.Yes:
            self.schedule_mgr.remove_routine(rid)
            self._refresh_table()

    def _show_preview(self):
        today = date.today()
        next_week = self.schedule_mgr.range(today, today + timedelta(days=6))

        preview_msg = []
        for d, occs in next_week.items():
            day_str = f"{d.strftime('%d/%m')} ({weekday_name(d)})"
            items = [f"• {o.start or 'Todo el día'} - {o.title}" for o in occs if o.kind == "routine"]
            if not items:
                items = ["• Sin rutinas"]
            preview_msg.append(f"{day_str}:\n" + "\n".join(items))

        QMessageBox.information(
            self,
            "Vista previa - Próximos 7 días",
            "\n\n".join(preview_msg)
        )

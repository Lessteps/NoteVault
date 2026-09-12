"""
Tareas — Vista Tabla
Notion-style database table. Every column is editable straight from the
row: name, subject (dropdown + free text), status, priority stars, dates
via a calendar popup and the reminder date/time.
"""

from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame,
    QPushButton, QCheckBox, QLayout, QComboBox,
)
from PySide6.QtCore import Qt, Signal

from ....core.task_manager import (
    TaskManager, Task, STATUSES, STATUS_COLORS, STATUS_DONE, STATUS_TODO,
    PRIORITY_MAX, fmt_date_short,
)
from .tareas_common import (
    BG_PAGE, BG_CARD, BG_ROW, BG_ROW_ALT, BG_HEAD, BORDER,
    TEXT, TEXT_DIM, TEXT_FAINT, BLUE, GREEN, RED, STAR, COMBO_SS,
    flat_btn, primary_btn, line_edit, combo, vline,
)
from .date_picker import DateButton
from .task_editor import TaskEditor

COL_CHECK    = 30
COL_NAME     = 220
COL_SUBJECT  = 130
COL_STATUS   = 124
COL_PRIO     = 74
COL_START    = 96
COL_DUE      = 96
COL_REMINDER = 118
COL_CREATED  = 88
COL_ACTIONS  = 40

ROW_H = 40


def _head(text: str, width: int, align=Qt.AlignLeft) -> QLabel:
    lbl = QLabel(text)
    lbl.setFixedWidth(width)
    lbl.setAlignment(align | Qt.AlignVCenter)
    lbl.setStyleSheet(
        f"color:{TEXT_FAINT};font-size:10px;font-weight:600;"
        "letter-spacing:0.6px;background:transparent;border:none;padding-left:5px;"
    )
    return lbl


class _Stars(QWidget):
    """Three clickable priority stars."""

    changed = Signal(int)

    def __init__(self, value: int, parent=None):
        super().__init__(parent)
        self.setFixedWidth(COL_PRIO)
        self.setStyleSheet("background:transparent;")
        self._value = max(1, min(PRIORITY_MAX, value))
        lay = QHBoxLayout(self)
        lay.setContentsMargins(4, 0, 0, 0)
        lay.setSpacing(2)
        self._btns = []
        for i in range(1, PRIORITY_MAX + 1):
            b = QPushButton("★")
            b.setFixedSize(20, 24)
            b.setCursor(Qt.PointingHandCursor)
            b.setToolTip(f"Prioridad {i}")
            b.clicked.connect(lambda _=False, v=i: self._pick(v))
            self._btns.append(b)
            lay.addWidget(b)
        lay.addStretch()
        self._sync()

    def _sync(self):
        for i, b in enumerate(self._btns, start=1):
            on = i <= self._value
            b.setStyleSheet(
                "QPushButton{background:transparent;border:none;font-size:14px;"
                f"color:{STAR if on else '#45454d'};}}"
                f"QPushButton:hover{{color:{STAR};}}"
            )

    def value(self) -> int:
        return self._value

    def _pick(self, v: int):
        self._value = v
        self._sync()
        self.changed.emit(v)


class TareasTable(QWidget):
    data_changed = Signal()

    def __init__(self, manager: TaskManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._query = ""
        self._f_status = ""
        self._f_subject = ""
        self._f_priority = 0
        self._hide_done = False
        self._init_ui()

    # ── UI ────────────────────────────────────────────────────────────────

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self._page = QVBoxLayout(content)
        self._page.setContentsMargins(18, 16, 18, 18)
        self._page.setSpacing(12)
        self._page.setSizeConstraint(QLayout.SetMinimumSize)

        # ── Toolbar ───────────────────────────────────────────────────────
        top = QHBoxLayout()
        top.setSpacing(8)

        title = QLabel("☑  Tareas")
        title.setStyleSheet(
            f"color:{TEXT};font-size:20px;font-weight:700;"
            "background:transparent;border:none;"
        )
        top.addWidget(title)
        top.addStretch()

        self._search = line_edit("🔎  Buscar tarea...")
        self._search.setFixedWidth(220)
        self._search.textChanged.connect(self._on_search)
        top.addWidget(self._search)

        new_btn = primary_btn("+  Nueva tarea")
        new_btn.clicked.connect(self._new_task)
        top.addWidget(new_btn)
        self._page.addLayout(top)

        # ── Filters ───────────────────────────────────────────────────────
        filt = QHBoxLayout()
        filt.setSpacing(8)

        f_lbl = QLabel("Filtrar:")
        f_lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        filt.addWidget(f_lbl)

        self._status_cb = combo([("Estado (todos)", "")] + [(s, s) for s in STATUSES])
        self._status_cb.setFixedWidth(150)
        self._status_cb.currentIndexChanged.connect(self._on_filter)
        filt.addWidget(self._status_cb)

        self._subject_cb = combo([("Asignatura (todas)", "")])
        self._subject_cb.setFixedWidth(170)
        self._subject_cb.currentIndexChanged.connect(self._on_filter)
        filt.addWidget(self._subject_cb)

        self._prio_cb = combo([
            ("Prioridad (todas)", 0), ("★", 1), ("★★", 2), ("★★★", 3),
        ])
        self._prio_cb.setFixedWidth(140)
        self._prio_cb.currentIndexChanged.connect(self._on_filter)
        filt.addWidget(self._prio_cb)

        self._hide_cb = QCheckBox("Ocultar completadas")
        self._hide_cb.setCursor(Qt.PointingHandCursor)
        self._hide_cb.setStyleSheet(
            f"QCheckBox{{color:{TEXT_DIM};font-size:11px;}}"
            "QCheckBox::indicator{width:14px;height:14px;border-radius:3px;"
            "border:1px solid #6a6a72;}"
            f"QCheckBox::indicator:checked{{background:{BLUE};border-color:{BLUE};}}"
        )
        self._hide_cb.toggled.connect(self._on_filter)
        filt.addWidget(self._hide_cb)

        clear = flat_btn("Limpiar")
        clear.clicked.connect(self._clear_filters)
        filt.addWidget(clear)

        filt.addStretch()
        self._count_lbl = QLabel("")
        self._count_lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        filt.addWidget(self._count_lbl)
        self._page.addLayout(filt)

        # ── Table card ────────────────────────────────────────────────────
        self._card = QFrame()
        self._card.setObjectName("taskCard")
        self._card.setAttribute(Qt.WA_StyledBackground, True)
        self._card.setStyleSheet(
            f"QFrame#taskCard{{background:{BG_CARD};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        self._card_lay = QVBoxLayout(self._card)
        self._card_lay.setContentsMargins(0, 0, 0, 0)
        self._card_lay.setSpacing(0)
        self._page.addWidget(self._card)
        self._page.addStretch()

        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Filters ───────────────────────────────────────────────────────────

    def _on_search(self, text: str):
        self._query = text
        self.refresh()

    def _on_filter(self, *_):
        self._f_status = self._status_cb.currentData() or ""
        self._f_subject = self._subject_cb.currentData() or ""
        self._f_priority = self._prio_cb.currentData() or 0
        self._hide_done = self._hide_cb.isChecked()
        self.refresh()

    def _clear_filters(self):
        self._search.blockSignals(True)
        self._search.clear()
        self._search.blockSignals(False)
        for cb in (self._status_cb, self._subject_cb, self._prio_cb):
            cb.blockSignals(True)
            cb.setCurrentIndex(0)
            cb.blockSignals(False)
        self._hide_cb.blockSignals(True)
        self._hide_cb.setChecked(False)
        self._hide_cb.blockSignals(False)
        self._query = self._f_status = self._f_subject = ""
        self._f_priority = 0
        self._hide_done = False
        self.refresh()

    def _sync_subjects(self):
        current = self._subject_cb.currentData()
        self._subject_cb.blockSignals(True)
        self._subject_cb.clear()
        self._subject_cb.addItem("Asignatura (todas)", "")
        for s in self.manager.subjects():
            self._subject_cb.addItem(s, s)
        idx = self._subject_cb.findData(current)
        self._subject_cb.setCurrentIndex(idx if idx >= 0 else 0)
        self._subject_cb.blockSignals(False)

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self, keep_filters: bool = True):
        self._sync_subjects()

        while self._card_lay.count():
            item = self._card_lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        self._card_lay.addWidget(self._header_row())

        tasks = self.manager.filtered(
            self._query, self._f_status, self._f_subject,
            self._f_priority, self._hide_done,
        )
        for i, t in enumerate(tasks):
            self._card_lay.addWidget(self._task_row(t, i))

        total = len(self.manager.tasks())
        self._count_lbl.setText(f"{len(tasks)} de {total} tareas")

        if not tasks:
            empty = QLabel(
                "No hay tareas que coincidan.\nPulsa «+ Nueva tarea» para crear una."
            )
            empty.setAlignment(Qt.AlignCenter)
            empty.setFixedHeight(90)
            empty.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:13px;background:transparent;border:none;"
            )
            self._card_lay.addWidget(empty)

    def _header_row(self) -> QWidget:
        w = QFrame()
        w.setAttribute(Qt.WA_StyledBackground, True)
        w.setFixedHeight(30)
        w.setStyleSheet(
            f"background:{BG_HEAD};border:none;border-top-left-radius:10px;"
            f"border-top-right-radius:10px;border-bottom:1px solid {BORDER};"
        )
        lay = QHBoxLayout(w)
        lay.setContentsMargins(8, 0, 8, 0)
        lay.setSpacing(0)
        for text, width in [
            ("✓", COL_CHECK), ("Aa  NOMBRE", COL_NAME),
            ("☰  ASIGNATURA", COL_SUBJECT), ("◌  ESTADO", COL_STATUS),
            ("★  PRIORIDAD", COL_PRIO), ("📤  SALIDA", COL_START),
            ("⏰  LÍMITE", COL_DUE), ("🔔  RECORDATORIO", COL_REMINDER),
            ("📅  CREADA", COL_CREATED), ("", COL_ACTIONS),
        ]:
            lay.addWidget(_head(text, width))
            lay.addWidget(vline())
        lay.addStretch()
        return w

    def _task_row(self, t: Task, index: int) -> QWidget:
        row = QFrame()
        row.setAttribute(Qt.WA_StyledBackground, True)
        row.setFixedHeight(ROW_H)
        bg = BG_ROW_ALT if index % 2 else BG_ROW
        row.setStyleSheet(
            f"QFrame{{background:{bg};border:none;border-bottom:1px solid {BORDER};}}"
        )
        lay = QHBoxLayout(row)
        lay.setContentsMargins(8, 4, 8, 4)
        lay.setSpacing(0)

        # ── done checkbox ────────────────────────────────────────────────
        cb = QCheckBox()
        cb.setFixedWidth(COL_CHECK)
        cb.setCursor(Qt.PointingHandCursor)
        cb.setChecked(t.is_done)
        cb.setToolTip("Marcar como completada")
        cb.setStyleSheet(
            "QCheckBox{background:transparent;}"
            "QCheckBox::indicator{width:15px;height:15px;border-radius:3px;"
            f"border:1px solid {'#4ade80' if t.is_done else '#6a6a72'};margin-left:7px;}}"
            f"QCheckBox::indicator:checked{{background:{GREEN};border-color:{GREEN};}}"
        )
        cb.toggled.connect(lambda checked, _t=t: self._set_done(_t, checked))
        lay.addWidget(cb)
        lay.addWidget(vline())

        # ── name (inline editable, 📄 opens the .md) ─────────────────────
        name_w = QWidget()
        name_w.setFixedWidth(COL_NAME)
        name_w.setStyleSheet("background:transparent;")
        n_lay = QHBoxLayout(name_w)
        n_lay.setContentsMargins(4, 0, 4, 0)
        n_lay.setSpacing(3)

        doc = QPushButton("📄")
        doc.setFixedSize(22, 22)
        doc.setCursor(Qt.PointingHandCursor)
        doc.setToolTip("Abrir el archivo .md de la tarea")
        doc.setStyleSheet(
            "QPushButton{background:transparent;border:none;font-size:12px;}"
            "QPushButton:hover{background:#2c2c2c;border-radius:4px;}"
        )
        doc.clicked.connect(lambda _=False, _t=t: self._open_task(_t))
        n_lay.addWidget(doc)

        name_in = line_edit("", height=26)
        name_in.setText(t.name)
        name_in.setToolTip(t.name)
        name_in.setStyleSheet(
            "QLineEdit{background:transparent;border:none;padding:0 2px;"
            f"color:{'#6b6b74' if t.is_done else TEXT};font-size:13px;}}"
            f"QLineEdit:focus{{background:#262626;border-radius:4px;color:{TEXT};}}"
        )
        name_in.editingFinished.connect(
            lambda _t=t, _e=name_in:
            self._commit(_t, name=_e.text().strip() or "Sin título")
        )
        n_lay.addWidget(name_in, stretch=1)
        lay.addWidget(name_w)
        lay.addWidget(vline())

        # ── subject: editable dropdown of known subjects ─────────────────
        subj = QComboBox()
        subj.setEditable(True)
        subj.setFixedWidth(COL_SUBJECT - 6)
        subj.setFixedHeight(26)
        subj.setToolTip("Elige una asignatura o escribe una nueva")
        subj.setStyleSheet(
            COMBO_SS
            + f"QComboBox{{color:{BLUE};}}"
            + f"QComboBox QLineEdit{{background:transparent;border:none;"
              f"color:{BLUE};font-size:12px;}}"
        )
        subj.addItem("")
        for s in self.manager.subjects():
            subj.addItem(s)
        subj.setCurrentText(t.subject)
        subj.lineEdit().setPlaceholderText("—")
        subj.lineEdit().editingFinished.connect(
            lambda _t=t, _c=subj: self._commit(_t, subject=_c.currentText().strip())
        )
        subj.activated.connect(
            lambda _i, _t=t, _c=subj: self._commit(_t, subject=_c.currentText().strip())
        )
        lay.addWidget(self._pad(subj, COL_SUBJECT))
        lay.addWidget(vline())

        # ── status ───────────────────────────────────────────────────────
        st = combo([(s, s) for s in STATUSES], height=26)
        st.setFixedWidth(COL_STATUS - 6)
        st.setCurrentIndex(STATUSES.index(t.status) if t.status in STATUSES else 0)
        color = STATUS_COLORS.get(t.status, TEXT_DIM)
        st.setStyleSheet(COMBO_SS + f"QComboBox{{color:{color};font-weight:600;}}")
        st.currentIndexChanged.connect(
            lambda _i, _t=t, _c=st: self._commit(_t, status=_c.currentData())
        )
        lay.addWidget(self._pad(st, COL_STATUS))
        lay.addWidget(vline())

        # ── priority ─────────────────────────────────────────────────────
        stars = _Stars(t.priority)
        stars.changed.connect(lambda v, _t=t: self._commit(_t, priority=v))
        lay.addWidget(stars)
        lay.addWidget(vline())

        # ── start date ───────────────────────────────────────────────────
        start = DateButton(t.start)
        start.setFixedWidth(COL_START - 6)
        start.setToolTip("Fecha de salida (cuándo te la asignaron)")
        start.changed.connect(lambda v, _t=t: self._commit(_t, start=v))
        lay.addWidget(self._pad(start, COL_START))
        lay.addWidget(vline())

        # ── due date ─────────────────────────────────────────────────────
        due = DateButton(t.due)
        due.setFixedWidth(COL_DUE - 6)
        due.set_danger(t.is_overdue)
        due.setToolTip("Fecha límite")
        due.changed.connect(lambda v, _t=t: self._commit(_t, due=v))
        lay.addWidget(self._pad(due, COL_DUE))
        lay.addWidget(vline())

        # ── reminder ─────────────────────────────────────────────────────
        rem = DateButton(t.reminder, with_time=True, placeholder="+ recordar")
        rem.setFixedWidth(COL_REMINDER - 6)
        rem.setToolTip("Fecha y hora del aviso de Windows")
        rem.changed.connect(lambda v, _t=t: self._set_reminder(_t, v))
        lay.addWidget(self._pad(rem, COL_REMINDER))
        lay.addWidget(vline())

        # ── created (read only) ──────────────────────────────────────────
        created = QLabel(fmt_date_short(t.created))
        created.setFixedWidth(COL_CREATED)
        created.setAlignment(Qt.AlignVCenter)
        created.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;"
            "border:none;padding-left:5px;"
        )
        lay.addWidget(created)
        lay.addWidget(vline())

        # ── delete ───────────────────────────────────────────────────────
        rm = QPushButton("✕")
        rm.setFixedSize(COL_ACTIONS - 12, 22)
        rm.setCursor(Qt.PointingHandCursor)
        rm.setToolTip("Eliminar tarea")
        rm.setStyleSheet(
            "QPushButton{background:transparent;border:none;color:#55555f;font-size:12px;}"
            f"QPushButton:hover{{color:{RED};}}"
        )
        rm.clicked.connect(lambda _=False, _t=t: self._delete(_t))
        lay.addWidget(self._pad(rm, COL_ACTIONS))
        lay.addStretch()
        return row

    @staticmethod
    def _pad(widget: QWidget, width: int) -> QWidget:
        box = QWidget()
        box.setFixedWidth(width)
        box.setStyleSheet("background:transparent;")
        lay = QHBoxLayout(box)
        lay.setContentsMargins(3, 0, 3, 0)
        lay.setSpacing(0)
        lay.addWidget(widget)
        return box

    # ── Mutations ─────────────────────────────────────────────────────────

    def _commit(self, task: Task, **fields):
        if not any(getattr(task, k, None) != v for k, v in fields.items()):
            return
        self.manager.update(task.id, **fields)
        self.data_changed.emit()
        self.refresh()

    def _set_reminder(self, task: Task, value):
        self.manager.update(task.id, reminder=value, reminder_done=False)
        self.data_changed.emit()
        self.refresh()

    def _set_done(self, task: Task, done: bool):
        new_status = STATUS_DONE if done else STATUS_TODO
        if task.status == new_status:
            return
        self.manager.update(task.id, status=new_status)
        self.data_changed.emit()
        self.refresh()

    def _new_task(self):
        task = self.manager.create("Nueva tarea", due=date.today(),
                                   start=date.today())
        self.manager.tasks(force=True)
        self.data_changed.emit()
        self.refresh()
        self._open_task(task)

    def _open_task(self, task: Task):
        dlg = TaskEditor(self.manager, task, self)
        dlg.exec()
        self.manager.tasks(force=True)
        self.data_changed.emit()
        self.refresh()

    def _delete(self, task: Task):
        self.manager.delete(task.id)
        self.data_changed.emit()
        self.refresh()

    def set_manager(self, manager: TaskManager):
        self.manager = manager
        self.refresh()

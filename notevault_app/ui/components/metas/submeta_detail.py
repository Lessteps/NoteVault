"""Detalle de submeta: interfaz completa y dedicada para una submeta (idéntica a MetaDetail).
Incluye breadcrumb de retorno, StatTiles de progreso y adherencia, barra de bloques,
gestor interactivo de subtareas (checklist) y editor de notas Markdown."""

from datetime import date
from typing import Optional

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QScrollArea, QFrame, QTextEdit,
    QMessageBox, QLayout,
)

from ....core import goal_manager as gm
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, ORANGE, UI_FONT,
    label, chip, priority_chip, clear_layout, flat_btn, primary_btn, line_edit,
)
from ..comun.widgets import StatTile, BlockProgress
from ..comun.subtasks_widget import SubtasksWidget
from .submetas_board import CATEGORY_COLOURS


class SubmetaDetail(QWidget):
    back_requested = Signal()           # Regresar a la vista de la meta padre
    edit_requested = Signal(str)        # Abrir editor lateral de la submeta
    submeta_opened = Signal(str)        # Abrir submeta hija
    data_changed = Signal()

    def __init__(self, goal_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.goal_mgr = goal_mgr
        self.habit_mgr = habit_mgr
        self.goal = None
        self.item = None
        self.setStyleSheet(f"background:{BG_PAGE};")

        page = QVBoxLayout(self)
        page.setContentsMargins(22, 14, 22, 14)
        page.setSpacing(10)

        # ── 1. Barra superior: Breadcrumb y acciones ───────────────────────
        top = QHBoxLayout()
        self.btn_back = flat_btn("‹  Volver a la Meta", height=28)
        self.btn_back.clicked.connect(self.back_requested.emit)
        top.addWidget(self.btn_back)
        top.addStretch()

        self.btn_edit = flat_btn("Editar propiedades…", height=28)
        self.btn_edit.clicked.connect(lambda: self.item and self.edit_requested.emit(self.item.id))
        top.addWidget(self.btn_edit)

        self.btn_delete = flat_btn("Eliminar", RED, RED, height=28)
        self.btn_delete.clicked.connect(self._delete_item)
        top.addWidget(self.btn_delete)
        page.addLayout(top)

        # ── 2. Cabecera: Icono y Nombre editable ───────────────────────────
        head = QHBoxLayout()
        head.setSpacing(10)
        self.icon = label("⭐", TEXT, 26)
        head.addWidget(self.icon)

        self.name = line_edit("", 38)
        self.name.setStyleSheet(
            f"QLineEdit{{background:transparent;border:1px solid transparent;border-radius:6px;"
            f"color:{TEXT};font-size:20px;font-weight:700;padding:0 6px;font-family:{UI_FONT};}}"
            f"QLineEdit:hover{{border-color:{BORDER};}}QLineEdit:focus{{border-color:{BLUE};"
            "background:#1e293b;}}"
        )
        self.name.editingFinished.connect(self._rename)
        head.addWidget(self.name, stretch=1)
        page.addLayout(head)

        # Chips: Categoría, Estado, Prioridad, Programación
        self.chips = QHBoxLayout()
        self.chips.setSpacing(6)
        page.addLayout(self.chips)

        # ── 3. Métricas principales (StatTiles) ────────────────────────────
        self.tiles = QHBoxLayout()
        self.tiles.setSpacing(10)
        self.t_progress = StatTile("0 %", "Progreso", GREEN)
        self.t_subtasks = StatTile("0/0", "Subtareas hechas")
        self.t_adh7 = StatTile("—", "Adherencia 7 días")
        self.t_adh30 = StatTile("—", "Adherencia 30 días")
        self.t_streak = StatTile("0", "Racha activa", ORANGE)
        self.t_left = StatTile("—", "Días restantes")
        for t in (self.t_progress, self.t_subtasks, self.t_adh7, self.t_adh30, self.t_streak, self.t_left):
            self.tiles.addWidget(t)
        page.addLayout(self.tiles)

        self.progress_bar = BlockProgress(0, GREEN, blocks=30, block=10)
        page.addWidget(self.progress_bar)

        # ── 4. Contenido en Scroll: Subtareas y Notas ──────────────────────
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        body_widget = QWidget()
        body_widget.setStyleSheet(f"background:{BG_PAGE};")
        body_lay = QVBoxLayout(body_widget)
        body_lay.setContentsMargins(0, 8, 0, 16)
        body_lay.setSpacing(14)

        # Gestor interactivo de subtareas
        self.subtasks_widget = SubtasksWidget(
            title="Subtareas y Práctica",
            placeholder="Añadir subtarea / tema de práctica (ej. ejercicios, teoría)...",
            colour=GREEN,
        )
        self.subtasks_widget.subtask_added.connect(self._add_subtask)
        self.subtasks_widget.subtask_toggled.connect(self._toggle_subtask)
        self.subtasks_widget.subtask_deleted.connect(self._delete_subtask)
        self.subtasks_widget.subtask_clicked.connect(self.submeta_opened.emit)
        body_lay.addWidget(self.subtasks_widget)

        # Notas / Teoría de la submeta
        lbl_notes = label("Notas, Enlaces y Resumen Teórico", TEXT_DIM, 12, bold=True)
        body_lay.addWidget(lbl_notes)

        self.txt_notes = QTextEdit()
        self.txt_notes.setPlaceholderText("Escribe aquí resúmenes de teoría, enlaces a recursos o notas de esta submeta...")
        self.txt_notes.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-size:13px;padding:10px;font-family:{UI_FONT};}}"
        )
        self.txt_notes.setMinimumHeight(150)

        self._notes_timer = QTimer(self)
        self._notes_timer.setSingleShot(True)
        self._notes_timer.setInterval(800)
        self._notes_timer.timeout.connect(self._save_notes)
        self.txt_notes.textChanged.connect(self._notes_timer.start)
        body_lay.addWidget(self.txt_notes)

        scroll.setWidget(body_widget)
        page.addWidget(scroll, stretch=1)

    def load(self, goal, item):
        self.goal = goal
        self.item = item
        self.btn_back.setText(f"‹  Volver a «{goal.name}»")
        self.refresh()

    def refresh(self):
        if not self.goal or not self.item:
            return

        # Recargar item fresco
        self.item = self.goal_mgr.get_item(self.goal.id, self.item.id)
        if not self.item:
            self.back_requested.emit()
            return

        today = date.today()
        g, it = self.goal, self.item

        # 1. Cabecera
        self.icon.setText("⭐" if it.is_priority else "🎯")
        if not self.name.hasFocus():
            self.name.setText(it.name)

        clear_layout(self.chips)
        if it.category:
            col = CATEGORY_COLOURS.get(it.category.lower(), BLUE)
            self.chips.addWidget(chip(it.category, col))
        self.chips.addWidget(chip(it.status, GREEN if it.status == gm.ITEM_DONE else (BLUE if it.status == gm.ITEM_DOING else TEXT_DIM)))
        self.chips.addWidget(priority_chip(it.priority))

        sched = it.schedule_text()
        if sched:
            self.chips.addWidget(chip(f"📅 {sched}", TEXT_FAINT))

        if it.is_priority:
            self.chips.addWidget(chip("⭐ Prioritaria", "#a855f7"))
        else:
            self.chips.addWidget(chip("☑ Sencilla", TEXT_DIM))

        self.chips.addStretch()

        # 2. Métricas
        prog = self.goal_mgr.item_progress(it, g, today)
        self.t_progress.set(f"{round(prog * 100)} %")
        accent_col = CATEGORY_COLOURS.get(it.category.lower(), g.colour) if it.category else g.colour
        self.progress_bar.set_fraction(prog, accent_col)

        done_cnt, tot_cnt = self.goal_mgr.item_counts(it, g, today)
        self.t_subtasks.set(f"{done_cnt}/{tot_cnt}")

        adh7 = self.goal_mgr.item_adherence(it, g, 7, today)
        self.t_adh7.set(f"{round(adh7 * 100)} %" if adh7 is not None else "—",
                        GREEN if adh7 is not None and adh7 >= 0.8 else (ORANGE if adh7 is not None else TEXT_DIM))

        adh30 = self.goal_mgr.item_adherence(it, g, 30, today)
        self.t_adh30.set(f"{round(adh30 * 100)} %" if adh30 is not None else "—",
                         GREEN if adh30 is not None and adh30 >= 0.8 else (ORANGE if adh30 is not None else TEXT_DIM))

        stk = self.goal_mgr.streak(it, g, today) if it.repeating else 0
        self.t_streak.set(str(stk))

        if it.due:
            if it.due < today and it.status != gm.ITEM_DONE:
                self.t_left.set("Vencida", RED, f"debía terminar el {it.due.strftime('%d/%m/%Y')}", RED)
            else:
                diff = (it.due - today).days
                word = "hoy" if diff == 0 else ("falta 1 día" if diff == 1 else f"faltan {diff} días")
                self.t_left.set(word, TEXT, f"fecha límite: {it.due.strftime('%d/%m/%Y')}")
        else:
            self.t_left.set("—", TEXT_DIM, "Sin fecha límite")

        # 3. Subtareas (hijas directas)
        children_items = []
        for ch in it.children:
            is_ch_done = self.goal_mgr.is_done_on(ch, today)
            cat_badge = f"[{ch.category}]" if ch.category else ""
            children_items.append({
                "id": ch.id,
                "title": ch.name,
                "done": is_ch_done,
                "badge": cat_badge,
            })
        self.subtasks_widget.set_items(children_items)

        # 4. Notas
        if not self.txt_notes.hasFocus():
            self.txt_notes.blockSignals(True)
            self.txt_notes.setPlainText(it.notes)
            self.txt_notes.blockSignals(False)

    def _rename(self):
        new_name = self.name.text().strip()
        if not new_name or not self.item or new_name == self.item.name:
            return
        self.goal_mgr.update_item(self.goal.id, self.item.id, name=new_name)
        self.data_changed.emit()
        self.refresh()

    def _add_subtask(self, title: str):
        if not self.item or not title.strip():
            return
        self.goal_mgr.create_item(self.goal.id, title.strip(), parent=self.item.id)
        self.data_changed.emit()
        self.refresh()

    def _toggle_subtask(self, child_id: str, done: bool):
        child = self.goal_mgr.get_item(self.goal.id, child_id)
        if not child:
            return
        today = date.today()
        self.goal_mgr.set_done(child, today, done)
        self.data_changed.emit()
        self.refresh()

    def _delete_subtask(self, child_id: str):
        child = self.goal_mgr.get_item(self.goal.id, child_id)
        if not child:
            return
        self.goal_mgr.delete_item(self.goal.id, child_id)
        self.data_changed.emit()
        self.refresh()

    def _save_notes(self):
        if not self.item:
            return
        text = self.txt_notes.toPlainText()
        self.goal_mgr.update_item(self.goal.id, self.item.id, notes=text)
        self.data_changed.emit()

    def _delete_item(self):
        if not self.item:
            return
        text = f"¿Eliminar la submeta «{self.item.name}»?\nSe moverá a la papelera."
        if QMessageBox.question(self, "Eliminar submeta", text) != QMessageBox.Yes:
            return
        self.goal_mgr.delete_item(self.goal.id, self.item.id)
        self.data_changed.emit()
        self.back_requested.emit()

"""Tablero de submetas: visualización en tarjetas (dashboard) con progreso, adherencia,
chips de categoría y filtros temáticos (Teoría, Práctica, etc.)."""

from datetime import date
from typing import Optional, List, Dict, Any

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame,
    QPushButton, QMenu, QLayout, QLabel,
)

from ....core import goal_manager as gm
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, GREEN, RED, ORANGE, UI_FONT,
    label, chip, priority_chip, clear_layout, combo, flat_btn, primary_btn, line_edit,
    PRIORITY_COLOURS,
)
from ..comun.widgets import DashboardCard, BlockProgress, Check

CATEGORY_COLOURS = {
    "teoría": "#3b82f6",
    "teoria": "#3b82f6",
    "práctica": "#10b981",
    "practica": "#10b981",
    "ejercicios": "#f59e0b",
    "proyectos": "#8b5cf6",
    "lectura": "#06b6d4",
    "conceptos": "#ec4899",
    "repaso": "#14b8a6",
}


class _CategoryChip(QPushButton):
    def __init__(self, text: str, count: int = 0, colour: str = BLUE, parent=None):
        label_text = f"{text} ({count})" if count > 0 else text
        super().__init__(label_text, parent)
        self.category_name = text
        self.colour = colour
        self.setCheckable(True)
        self.setCursor(Qt.PointingHandCursor)
        self.setFixedHeight(26)
        self.update_style()

    def update_style(self):
        c = self.colour
        if self.isChecked():
            self.setStyleSheet(
                f"QPushButton{{background:{c};color:#ffffff;border:1px solid {c};"
                f"border-radius:13px;padding:0 12px;font-size:11px;font-weight:700;font-family:{UI_FONT};}}"
            )
        else:
            self.setStyleSheet(
                f"QPushButton{{background:#1e293b;color:{TEXT_DIM};border:1px solid {BORDER};"
                f"border-radius:13px;padding:0 12px;font-size:11px;font-weight:500;font-family:{UI_FONT};}}"
                f"QPushButton:hover{{color:{TEXT};border-color:{c};}}"
            )


class SubmetasBoard(QWidget):
    submeta_opened = Signal(str)            # item_id -> abrir interfaz propia
    new_submeta_requested = Signal(str)     # parent_id ("" para raíz)
    submeta_toggled = Signal(str, bool)     # item_id, done
    data_changed = Signal()

    def __init__(self, goal_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.goal_mgr = goal_mgr
        self.habit_mgr = habit_mgr
        self.goal = None
        self.active_category = "*"              # "*" = Todas, "" = Sin categoría, o nombre
        self.query = ""
        self.sort_key = "priority"
        self._columns = 3

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(10)

        # ── 1. Barra superior: Filtros de categoría ────────────────────────
        self.cat_bar = QHBoxLayout()
        self.cat_bar.setContentsMargins(0, 2, 0, 2)
        self.cat_bar.setSpacing(6)
        outer.addLayout(self.cat_bar)

        # ── 2. Barra de herramientas: Búsqueda, orden y botón nueva ────────
        tool_bar = QHBoxLayout()
        tool_bar.setSpacing(8)

        self.lbl_count = label("0 submetas", TEXT_FAINT, 12, True)
        tool_bar.addWidget(self.lbl_count)
        tool_bar.addStretch()

        self.search = line_edit("🔎  Buscar submeta o tema…", 28)
        self.search.setFixedWidth(210)
        self.search.textChanged.connect(self._on_search_changed)
        tool_bar.addWidget(self.search)

        self.sort_combo = combo([
            ("Ordenar: Prioridad", "priority"),
            ("Ordenar: Nombre", "name"),
            ("Ordenar: Progreso", "progress"),
            ("Ordenar: Fecha límite", "due"),
        ], 28)
        self.sort_combo.setFixedWidth(175)
        self.sort_combo.currentIndexChanged.connect(self._on_sort_changed)
        tool_bar.addWidget(self.sort_combo)

        btn_add = primary_btn("+  Submeta con Checklist", 28)
        btn_add.setToolTip("Crear nueva submeta con su checklist de subtareas")
        btn_add.clicked.connect(lambda: self.new_submeta_requested.emit(""))
        tool_bar.addWidget(btn_add)

        outer.addLayout(tool_bar)

        # ── 3. Scroll Area con Cards ───────────────────────────────────────
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self.grid_layout = QGridLayout(content)
        self.grid_layout.setContentsMargins(0, 8, 0, 16)
        self.grid_layout.setHorizontalSpacing(14)
        self.grid_layout.setVerticalSpacing(14)
        self.grid_layout.setSizeConstraint(QLayout.SetMinimumSize)

        scroll.setWidget(content)
        outer.addWidget(scroll, stretch=1)

        self._resize_timer = QTimer(self)
        self._resize_timer.setSingleShot(True)
        self._resize_timer.timeout.connect(self._maybe_reflow)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._resize_timer.start(120)

    def _maybe_reflow(self):
        cols = max(1, (self.width() - 30) // 320)
        if cols != self._columns:
            self._columns = cols
            self.refresh()

    def set_goal(self, goal):
        self.goal = goal
        self.refresh()

    def _on_search_changed(self, text: str):
        self.query = text.strip().lower()
        self.refresh()

    def _on_sort_changed(self):
        self.sort_key = self.sort_combo.currentData()
        self.refresh()

    # ── Render ────────────────────────────────────────────────────────────

    def _category_colour(self, cat: str) -> str:
        k = (cat or "").strip().lower()
        return CATEGORY_COLOURS.get(k, "#6366f1")

    def _render_category_bar(self, all_items: list):
        clear_layout(self.cat_bar)

        # Conteo por categoría
        counts = {}
        for it in all_items:
            c = it.category
            counts[c] = counts.get(c, 0) + 1

        total = len(all_items)
        lbl = label("Categorías:", TEXT_FAINT, 11, bold=True)
        self.cat_bar.addWidget(lbl)

        # Botón "Todas"
        b_all = _CategoryChip("Todas", total, BLUE)
        b_all.setChecked(self.active_category == "*")
        b_all.update_style()
        b_all.clicked.connect(lambda: self._select_category("*"))
        self.cat_bar.addWidget(b_all)

        # Categorías predefinidas y existentes
        categories = []
        for it in all_items:
            if it.category and it.category not in categories:
                categories.append(it.category)

        # Categorías sugeridas si no existen
        presets = ["Teoría", "Práctica", "Ejercicios", "Proyectos"]
        for p in presets:
            if p not in categories and p.lower() in counts:
                categories.append(p)

        for cat in sorted(categories, key=lambda s: s.lower()):
            n = counts.get(cat, 0)
            col = self._category_colour(cat)
            b = _CategoryChip(cat, n, col)
            b.setChecked(self.active_category.lower() == cat.lower())
            b.update_style()
            b.clicked.connect(lambda _c=False, k=cat: self._select_category(k))
            self.cat_bar.addWidget(b)

        # Sin categoría (si hay)
        sin_cat = counts.get("", 0)
        if sin_cat > 0:
            b_none = _CategoryChip("Sin categoría", sin_cat, "#64748b")
            b_none.setChecked(self.active_category == "")
            b_none.update_style()
            b_none.clicked.connect(lambda: self._select_category(""))
            self.cat_bar.addWidget(b_none)

        self.cat_bar.addStretch()

    def _select_category(self, cat: str):
        self.active_category = cat
        self.refresh()

    def refresh(self):
        clear_layout(self.grid_layout)
        if not self.goal:
            self.lbl_count.setText("Sin meta seleccionada")
            return

        today = date.today()
        all_items = self.goal_mgr.items(self.goal.id)
        self._render_category_bar(all_items)

        # Filtrado por categoría
        filtered = all_items
        if self.active_category == "":
            filtered = [i for i in filtered if not i.category]
        elif self.active_category != "*":
            filtered = [i for i in filtered if i.category.lower() == self.active_category.lower()]

        # Filtrado por texto de búsqueda
        if self.query:
            filtered = [i for i in filtered if self.query in i.name.lower() or self.query in i.notes.lower()
                        or self.query in i.category.lower()]

        # Ordenamiento
        if self.sort_key == "priority":
            filtered = sorted(filtered, key=lambda i: (-i.priority, i.order, i.name.lower()))
        elif self.sort_key == "name":
            filtered = sorted(filtered, key=lambda i: i.name.lower())
        elif self.sort_key == "progress":
            filtered = sorted(filtered, key=lambda i: -self.goal_mgr.item_progress(i, self.goal, today))
        elif self.sort_key == "due":
            filtered = sorted(filtered, key=lambda i: (i.due or date.max, -i.priority))

        # Contador
        cat_txt = f" · {self.active_category}" if self.active_category not in ("*", "") else ""
        self.lbl_count.setText(f"{len(filtered)} submeta{'s' if len(filtered) != 1 else ''}{cat_txt}")

        if not filtered:
            empty = label("No se encontraron submetas con los filtros actuales.", TEXT_FAINT, 13)
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(140)
            self.grid_layout.addWidget(empty, 0, 0, 1, self._columns)
            return

        # Renderizar cada submeta como DashboardCard
        for idx, item in enumerate(filtered):
            card = self._create_submeta_card(item, today)
            r = idx // self._columns
            c = idx % self._columns
            self.grid_layout.addWidget(card, r, c)

        for col_idx in range(self._columns):
            self.grid_layout.setColumnStretch(col_idx, 1)

    def _create_submeta_card(self, item, today: date) -> QWidget:
        accent_col = self._category_colour(item.category) if item.category else self.goal.colour
        card = DashboardCard(accent=accent_col)
        card.setMinimumWidth(280)
        card.clicked.connect(lambda iid=item.id: self.submeta_opened.emit(iid))
        b = card.body

        # ── Fila 1: Título, prioridad y categoría ──
        head = QHBoxLayout()
        head.setSpacing(6)

        icon_char = "⭐" if item.is_priority else ("📁" if not item.is_leaf else "•")
        head.addWidget(label(icon_char, TEXT, 14))

        name_lbl = label(item.name, TEXT, 13, bold=True, wrap=True)
        head.addWidget(name_lbl, stretch=1)
        head.addWidget(priority_chip(item.priority), 0, Qt.AlignTop)
        b.addLayout(head)

        # ── Fila 2: Chips de Categoría y Modo ──
        badges = QHBoxLayout()
        badges.setSpacing(4)
        if item.category:
            badges.addWidget(chip(item.category, self._category_colour(item.category)))
        badges.addWidget(chip(item.status, GREEN if item.status == gm.ITEM_DONE else (BLUE if item.status == gm.ITEM_DOING else TEXT_DIM)))
        if item.is_priority:
            badges.addWidget(chip("Detallada", "#a855f7"))
        badges.addStretch()
        b.addLayout(badges)

        # ── Fila 3: Programación / Fechas ──
        sched = item.schedule_text()
        if sched:
            b.addWidget(label(f"📅 {sched}", TEXT_FAINT, 11))

        # ── Fila 4: Barra de Progreso y conteo de subtareas ──
        prog = self.goal_mgr.item_progress(item, self.goal, today)
        done_cnt, tot_cnt = self.goal_mgr.item_counts(item, self.goal, today)

        prow = QHBoxLayout()
        prow.addWidget(BlockProgress(prog, accent_col, blocks=10, block=9))
        prow.addStretch()
        if not item.is_leaf or tot_cnt > 1:
            prow.addWidget(label(f"{done_cnt}/{tot_cnt} subtareas", TEXT_DIM, 11))
        else:
            prow.addWidget(label(f"{round(prog * 100)} %", TEXT_DIM, 11))
        b.addLayout(prow)

        # ── Fila 5: Adherencia y Racha ──
        adh = self.goal_mgr.item_adherence(item, self.goal, 7, today)
        stk = self.goal_mgr.streak(item, self.goal, today) if item.repeating else 0

        stats = QHBoxLayout()
        stats.setSpacing(8)
        if adh is not None:
            stats.addWidget(label(f"Adherencia 7 d: {round(adh * 100)} %", GREEN if adh >= 0.8 else ORANGE, 10))
        if stk > 0:
            stats.addWidget(label(f"🔥 {stk} d racha", ORANGE, 10))
        stats.addStretch()

        # Botón o acción rápida
        if item.is_leaf:
            is_done = self.goal_mgr.is_done_on(item, today)
            cb = Check(is_done, GREEN, size=15)
            cb.toggled_by_user.connect(lambda d, iid=item.id: self._on_quick_check(iid, d))
            cb.setToolTip("Marcar como hecho / pendiente")
            stats.addWidget(cb)
        else:
            btn_open = flat_btn("Ver detalle ›", accent_col, height=22)
            btn_open.clicked.connect(lambda _c=False, iid=item.id: self.submeta_opened.emit(iid))
            stats.addWidget(btn_open)

        b.addLayout(stats)
        return card

    def _on_quick_check(self, item_id: str, done: bool):
        item = self.goal_mgr.get_item(self.goal.id, item_id)
        if not item:
            return
        today = date.today()
        self.goal_mgr.set_done(item, today, done)
        self.data_changed.emit()
        self.refresh()

"""
NoteVault Main Window
Mode-switching 3-panel layout:
  - habits    → HabitLeftPanel   | HabitTrackerPanel        | HabitRightPanel(stats)
  - ejercicio → EjercicioLeft    | EjercicioPanel           | (empty)
  - notas     → FileExplorer     | EditorPanel(placeholder) | Properties
  - tareas / proyectos → TareasLeftPanel | TareasPanel (tabla/calendario/recordatorios)
"""

from pathlib import Path
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QSplitter, QStatusBar,
    QHBoxLayout, QVBoxLayout, QLabel, QStackedWidget,
)
from PySide6.QtCore import Qt, QVariantAnimation, QEasingCurve

from ..config import AppConfig
from ..core.vault_manager import VaultManager
from ..core.habit_manager import HabitManager
from ..core.exercise_manager import ExerciseManager
from ..core.task_manager import TaskManager
from ..core.project_manager import ProjectManager
from ..core.notifier import Notifier, app_icon
from ..core.notes_service import NotesService
from . import theme
from .styles import DARK_THEME_QSS
from .components.icon_rail import IconRail
from .components.notes.notes_sidebar import NotesSidebar
from .components.notes.markdown_editor import MarkdownEditor
from .components.notes.ai_chat_panel import AIChatPanel
from .components.habit_tracker.habit_tracker_panel import HabitTrackerPanel
from .components.habit_right_panel import HabitRightPanel
from .components.habit_left_panel import HabitLeftPanel
from .components.ejercicio.ejercicio_panel import EjercicioPanel
from .components.ejercicio.ejercicio_left_panel import EjercicioLeftPanel
from .components.tareas.tareas_panel import TareasPanel
from .components.tareas.tareas_left_panel import TareasLeftPanel
from .components.proyectos.proyectos_panel import ProyectosPanel
from .components.proyectos.proyectos_left_panel import ProyectosLeftPanel
from .components.dashboard.dashboard_panel import DashboardPanel

CENTER_PANEL_INDEX = 1

MODE_HOME      = "home"
MODE_HABITS    = "habits"
MODE_EJERCICIO = "ejercicio"
MODE_NOTAS     = "notas"
MODE_PROYECTOS = "proyectos"
MODE_TAREAS    = "tareas"


def _placeholder(text: str, obj: str = "centerPanel") -> QWidget:
    w = QWidget()
    w.setObjectName(obj)
    lay = QVBoxLayout(w)
    lbl = QLabel(text)
    lbl.setObjectName("metaLabel")
    lbl.setAlignment(Qt.AlignCenter)
    lay.addWidget(lbl)
    return w


class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()
        self.setWindowTitle("NoteVault")
        self.resize(1400, 880)

        vault_path       = AppConfig.get_active_vault()
        self.vault       = VaultManager(vault_path)
        self.habits      = HabitManager(vault_path)
        self.exercise_mgr = ExerciseManager(vault_path)
        self.tasks       = TaskManager(vault_path)
        self.projects    = ProjectManager(vault_path)
        self.notes       = NotesService(self.vault)

        self._mode = MODE_HOME
        self._navigator_width = 220
        self._inspector_width = 190
        self._chat_width      = 340
        self._nav_anim        = None
        self._insp_anim       = None
        self._assistant_visible = AppConfig.get_assistant_visible()

        self._init_ui()
        self._switch_mode(MODE_HOME)

    # ── Build UI ──────────────────────────────────────────────────────────

    def _init_ui(self):
        theme.install()
        self._theme = AppConfig.get_theme()
        theme.set_theme(self._theme)
        self.setStyleSheet(DARK_THEME_QSS)

        # ── Icon rail ─────────────────────────────────────────────────────
        self.icon_rail = IconRail()
        self.icon_rail.navigator_toggled.connect(self.toggle_explorer)
        self.icon_rail.home_requested.connect(
            lambda: self._switch_mode(MODE_HOME))
        self.icon_rail.habit_tracker_requested.connect(
            lambda: self._switch_mode(MODE_HABITS))
        self.icon_rail.ejercicio_requested.connect(
            lambda: self._switch_mode(MODE_EJERCICIO))
        self.icon_rail.proyectos_requested.connect(
            lambda: self._switch_mode(MODE_PROYECTOS))
        self.icon_rail.notas_requested.connect(
            lambda: self._switch_mode(MODE_NOTAS))
        self.icon_rail.tareas_requested.connect(
            lambda: self._switch_mode(MODE_TAREAS))
        self.icon_rail.theme_toggled.connect(self.toggle_theme)
        self.icon_rail.set_theme_glyph(self._theme == "dark")

        # ── Left stack ────────────────────────────────────────────────────
        self._left_stack = QStackedWidget()
        self._left_stack.setMinimumWidth(0)
        self._left_stack.setMaximumWidth(420)

        self._explorer       = NotesSidebar(self.vault, self.notes)
        self._explorer.vault_switch_requested.connect(self._on_vault_switch)
        self._habit_left     = HabitLeftPanel(self.habits)
        self._ejercicio_left = EjercicioLeftPanel()
        self._tareas_left    = TareasLeftPanel()
        self._proj_left      = ProyectosLeftPanel(self.projects)
        self._left_empty     = QWidget()
        self._left_empty.setObjectName("sidebarPanel")

        self._left_stack.addWidget(self._explorer)        # 0 — notas
        self._left_stack.addWidget(self._habit_left)      # 1 — habits
        self._left_stack.addWidget(self._ejercicio_left)  # 2 — ejercicio
        self._left_stack.addWidget(self._left_empty)      # 3 — others
        self._left_stack.addWidget(self._tareas_left)     # 4 — tareas
        self._left_stack.addWidget(self._proj_left)       # 5 — proyectos

        # ── Center stack ──────────────────────────────────────────────────
        self._center_stack = QStackedWidget()

        self._habit_panel    = HabitTrackerPanel(self.habits)
        self._ejercicio_panel = EjercicioPanel(self.exercise_mgr)
        self._notas_center   = MarkdownEditor(self.vault, self.notes)
        self._tareas_panel   = TareasPanel(self.tasks)
        self._proj_panel     = ProyectosPanel(self.projects)
        self._dashboard      = DashboardPanel(
            self.habits, self.exercise_mgr, self.tasks, self.projects)

        self._center_stack.addWidget(self._habit_panel)     # 0
        self._center_stack.addWidget(self._ejercicio_panel) # 1
        self._center_stack.addWidget(self._notas_center)    # 2
        self._center_stack.addWidget(self._tareas_panel)    # 3 — tareas
        self._center_stack.addWidget(self._proj_panel)      # 4 — proyectos
        self._center_stack.addWidget(self._dashboard)       # 5 — vista general

        # ── Right stack ───────────────────────────────────────────────────
        self._right_stack = QStackedWidget()

        self._habit_right  = HabitRightPanel(self.habits)
        self._notas_right  = AIChatPanel(self._notas_center)
        self._right_empty  = QWidget()
        self._right_empty.setObjectName("chatPanel")
        self._right_stack.addWidget(self._habit_right)  # 0
        self._right_stack.addWidget(self._right_empty)  # 1 — ejercicio (none)
        self._right_stack.addWidget(self._notas_right)  # 2

        # ── Wiring ────────────────────────────────────────────────────────
        self._habit_left.view_requested.connect(self._habit_panel.show_view)
        self._habit_panel.view_changed.connect(self._habit_left.set_active)
        self._habit_panel.data_changed.connect(self._habit_right.refresh_stats)
        self._habit_panel.habits_changed.connect(self._habit_panel.refresh_all)
        self._habit_panel.habits_changed.connect(self._habit_right.refresh_stats)
        self._ejercicio_left.view_requested.connect(self._ejercicio_panel.show_view)
        self._tareas_left.view_requested.connect(self._tareas_panel.show_view)
        self._tareas_panel.reminders_changed.connect(
            self._tareas_left.set_reminder_count)
        self._tareas_panel.notify_requested.connect(self._notify)
        self._proj_left.board_requested.connect(self._proj_panel.show_board)
        self._proj_left.project_requested.connect(self._proj_panel.open_project)
        self._proj_panel.data_changed.connect(self._proj_left.refresh)
        self._dashboard.go_habits.connect(lambda: self._switch_mode(MODE_HABITS))
        self._dashboard.go_ejercicio.connect(lambda: self._switch_mode(MODE_EJERCICIO))
        self._dashboard.go_tareas.connect(lambda: self._switch_mode(MODE_TAREAS))
        self._dashboard.go_proyectos.connect(lambda: self._switch_mode(MODE_PROYECTOS))
        self._dashboard.go_notas.connect(lambda: self._switch_mode(MODE_NOTAS))

        # ── Notes module ──────────────────────────────────────────────
        self._explorer.note_selected.connect(self._notas_center.open_note)
        self._explorer.note_selected_at_line.connect(self._notas_center.open_note)
        self._explorer.bookmarks_changed.connect(
            self._notas_center.refresh_mentions)
        self._notas_center.active_note_changed.connect(self._on_note_changed)
        self._notas_center.open_note_requested.connect(
            self._notas_center.open_note)
        # note_saved is NOT connected to populate_tree: auto-save fires every
        # 1.2 s and a full tree rebuild on each save would freeze the UI.
        # New notes are added to the tree by new_note() in NotesSidebar itself.
        self._notas_center.bookmarks_changed.connect(
            self._explorer.refresh_bookmarks)
        self._notas_center.assistant_toggled.connect(self.toggle_assistant)
        self._notas_center.set_assistant_visible(self._assistant_visible)
        self._notas_center.reveal_requested.connect(self._reveal_in_explorer)
        self._notas_right.close_requested.connect(self.toggle_assistant)
        self._notas_right.insert_requested.connect(
            self._notas_center.insert_markdown)
        self._notas_right.replace_requested.connect(
            self._notas_center.replace_selection)
        self._notas_right.new_note_requested.connect(self._ai_new_note)

        # ── Main splitter ─────────────────────────────────────────────────
        self.main_splitter = QSplitter(Qt.Horizontal)
        self.main_splitter.setChildrenCollapsible(True)
        self.main_splitter.setHandleWidth(1)
        self.main_splitter.addWidget(self._left_stack)
        self.main_splitter.addWidget(self._center_stack)
        self.main_splitter.addWidget(self._right_stack)

        self.main_splitter.setCollapsible(0, True)
        self.main_splitter.setCollapsible(CENTER_PANEL_INDEX, False)
        self.main_splitter.setCollapsible(2, True)
        self.main_splitter.setStretchFactor(CENTER_PANEL_INDEX, 1)
        self._right_stack.setMinimumWidth(140)
        self._right_stack.setMaximumWidth(520)

        # ── Central widget ────────────────────────────────────────────────
        central = QWidget()
        central_layout = QHBoxLayout(central)
        central_layout.setContentsMargins(0, 0, 0, 0)
        central_layout.setSpacing(0)
        central_layout.addWidget(self.icon_rail)
        central_layout.addWidget(self.main_splitter, stretch=1)
        self.setCentralWidget(central)

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage(f"Vault: {self.vault.vault_root.name}")

        # Desktop notifications (Windows toast through the tray icon)
        assets = Path(__file__).resolve().parent.parent.parent / "assets"
        self.setWindowIcon(app_icon(assets))
        self.notifier = Notifier(self, assets)
        if self.notifier.tray is not None:
            self.notifier.tray.activated.connect(lambda _r: self._raise_window())

    # ── Mode switching ────────────────────────────────────────────────────

    def _switch_mode(self, mode: str):
        self._mode = mode
        for k in ["home", "habits", "ejercicio", "proyectos", "notas", "tareas"]:
            self.icon_rail.set_active(k, k == mode)

        if mode == MODE_HOME:
            self._left_stack.setCurrentIndex(3)
            self._center_stack.setCurrentIndex(5)
            self._right_stack.setCurrentIndex(1)
            self._dashboard.refresh()
            self.status_bar.showMessage("Vista General")

        elif mode == MODE_HABITS:
            self._left_stack.setCurrentIndex(1)
            self._center_stack.setCurrentIndex(0)
            self._right_stack.setCurrentIndex(0)
            self._habit_right.refresh_stats()
            self.status_bar.showMessage("Habit Tracker")

        elif mode == MODE_EJERCICIO:
            self._left_stack.setCurrentIndex(2)
            self._center_stack.setCurrentIndex(1)
            self._right_stack.setCurrentIndex(1)
            self.status_bar.showMessage("Ejercicio")

        elif mode == MODE_NOTAS:
            self._left_stack.setCurrentIndex(0)
            self._center_stack.setCurrentIndex(2)
            self._right_stack.setCurrentIndex(2)
            self.status_bar.showMessage("Notas")

        elif mode == MODE_TAREAS:
            self._left_stack.setCurrentIndex(4)
            self._center_stack.setCurrentIndex(3)
            self._right_stack.setCurrentIndex(1)
            self._tareas_panel.refresh_current()
            self.status_bar.showMessage("Tareas")

        elif mode == MODE_PROYECTOS:
            self._left_stack.setCurrentIndex(5)
            self._center_stack.setCurrentIndex(4)
            self._right_stack.setCurrentIndex(1)
            self._proj_left.refresh()
            self._proj_panel.refresh()
            self.status_bar.showMessage("Proyectos")

        self._apply_mode_layout()

    def _apply_mode_layout(self):
        show_left  = self._mode in (MODE_HABITS, MODE_NOTAS, MODE_EJERCICIO,
                                    MODE_PROYECTOS, MODE_TAREAS)
        show_right = (self._mode == MODE_HABITS
                      or (self._mode == MODE_NOTAS and self._assistant_visible))

        self._left_stack.setVisible(show_left)
        self._right_stack.setVisible(show_right)

        total = max(self.main_splitter.width(), 900)
        left  = self._navigator_width if show_left else 0
        right = self._inspector_width if show_right else 0
        if self._mode == MODE_NOTAS:
            left = max(left, 250)
            right = self._chat_width if show_right else 0
        self.main_splitter.setSizes([left, max(320, total - left - right), right])

    def showEvent(self, event):
        super().showEvent(event)
        self._apply_mode_layout()

    # ── Panel toggle ──────────────────────────────────────────────────────

    def _animate_panel(self, index: int, anim_attr: str, width_attr: str):
        sizes   = self.main_splitter.sizes()
        current = sizes[index]
        if current > 0:
            setattr(self, width_attr, current)
            target = 0
        else:
            target = getattr(self, width_attr) or 220

        anim = QVariantAnimation(self)
        anim.setDuration(200)
        anim.setEasingCurve(QEasingCurve.OutCubic)
        anim.setStartValue(current)
        anim.setEndValue(target)
        anim.valueChanged.connect(lambda v: self._apply_width(index, int(v)))
        setattr(self, anim_attr, anim)
        anim.start()

    def _apply_width(self, index: int, width: int):
        sizes = self.main_splitter.sizes()
        delta = width - sizes[index]
        sizes[index] = width
        sizes[CENTER_PANEL_INDEX] = max(0, sizes[CENTER_PANEL_INDEX] - delta)
        self.main_splitter.setSizes(sizes)

    def toggle_explorer(self):
        if self._mode == MODE_NOTAS:
            self._animate_panel(0, "_nav_anim", "_navigator_width")

    def toggle_assistant(self):
        """Show or hide the AI panel in Notas, and remember the choice.

        Visibility is toggled instead of animating the splitter to zero: the
        panel has a minimum width, so shrinking it by size stopped at that
        minimum and the button appeared to do nothing.
        """
        if self._mode != MODE_NOTAS:
            return
        if self._assistant_visible:
            width = self.main_splitter.sizes()[2]
            if width > 0:
                self._chat_width = width
        self._assistant_visible = not self._assistant_visible
        AppConfig.set_assistant_visible(self._assistant_visible)
        self._notas_center.set_assistant_visible(self._assistant_visible)
        self._apply_mode_layout()

    def _reveal_in_explorer(self, path: Path):
        if self._mode == MODE_NOTAS:
            self._explorer.reveal(path)

    # ── Vault switching ───────────────────────────────────────────────────

    def _on_vault_switch(self, vault_path: Path):
        AppConfig.set_active_vault(vault_path)
        self.vault        = VaultManager(vault_path)
        self.habits       = HabitManager(vault_path)
        self.exercise_mgr = ExerciseManager(vault_path)
        self.tasks        = TaskManager(vault_path)
        self.projects     = ProjectManager(vault_path)
        self.notes = NotesService(self.vault)
        self._explorer.set_vault(self.vault, self.notes)
        self._notas_center.set_vault(self.vault, self.notes)
        self._habit_panel.set_manager(self.habits)
        self._habit_right.set_manager(self.habits)
        self._habit_left.manager = self.habits
        self._ejercicio_panel.set_manager(self.exercise_mgr)
        self._tareas_panel.set_manager(self.tasks)
        self._proj_panel.set_manager(self.projects)
        self._proj_left.set_manager(self.projects)
        self._dashboard.set_managers(
            self.habits, self.exercise_mgr, self.tasks, self.projects)
        self.status_bar.showMessage(f"Vault: {vault_path.name}")

    # ── Notes helpers ─────────────────────────────────────────────────────

    def _on_note_changed(self, path):
        """Keep the explorer in sync with the active editor tab."""
        self._explorer.set_active_note(path)
        if path is not None:
            AppConfig.set_last_note(self.vault.vault_root, path)

    def _ai_new_note(self, title: str, body: str):
        """Turn an assistant reply into a real note next to the current one."""
        current = self._notas_center.current_path()
        folder = current.parent if current else self.vault.vault_root
        note = self.notes.create_note(title, folder)
        note.path.write_text(
            note.raw.rstrip() + "\n\n" + body.strip() + "\n", encoding="utf-8"
        )
        self._explorer.populate_tree(note.path)
        self._notas_center.open_note(note.path)
        self.status_bar.showMessage(f"Nota creada: {note.path.name}", 5000)

    # ── Notifications ──────────────────────

    def _notify(self, title: str, body: str):
        self.notifier.notify(title, body)
        self.status_bar.showMessage("\U0001F514 " + title, 10000)
        if self._mode == MODE_HOME:
            self._dashboard.refresh()

    def _raise_window(self):
        self.showNormal()
        self.raise_()
        self.activateWindow()

    def closeEvent(self, event):
        try:
            self.notifier.shutdown()
        except Exception:
            pass
        super().closeEvent(event)

    # ── Theme ─────────────────────────────────────────────────────────────

    def toggle_theme(self):
        self._theme = "light" if self._theme == "dark" else "dark"
        AppConfig.set_theme(self._theme)
        theme.set_theme(self._theme)

        # Global sheet first, then every panel's own stylesheet.
        self.setStyleSheet(DARK_THEME_QSS)
        theme.restyle(self)
        self._rebuild_views()

        self.icon_rail.set_theme_glyph(self._theme == "dark")
        self.status_bar.showMessage(
            "Tema claro" if self._theme == "light" else "Tema oscuro", 4000
        )

    def _rebuild_views(self):
        """Redraw the panels that paint their rows from Python, so the new
        palette reaches the widgets they create on the fly."""
        self._explorer.populate_tree()
        self._explorer.refresh_bookmarks()
        self._habit_panel.refresh_all()
        self._habit_right.refresh_stats()
        self._ejercicio_panel.refresh_current()
        self._tareas_panel.refresh_current()
        self._proj_left.refresh()
        self._proj_panel.refresh()
        self._dashboard.refresh()

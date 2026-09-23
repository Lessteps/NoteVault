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
from PySide6.QtCore import Qt, QVariantAnimation, QEasingCurve, QTimer, QSize

from ..config import AppConfig
from ..core.vault_manager import VaultManager
from ..core.layouts import list_layouts, save_layout, load_layout, capture_layout
from ..core.habit_manager import HabitManager
from ..core.exercise_manager import ExerciseManager
from ..core.task_manager import TaskManager
from ..core.project_manager import ProjectManager, ProjectCalendarSource
from ..core import reminder_scheduler
from ..core.schedule_manager import ScheduleManager
from ..core.area_manager import AreaManager
from ..core.goal_manager import GoalManager, GoalCalendarSource
from ..core.finance_manager import FinanceManager, FinanceCalendarSource
from ..core.notifier import Notifier, app_icon
from ..core.notes_service import NotesService
from . import theme
from .styles import DARK_THEME_QSS
from .components.icon_rail import IconRail
from .components.notes.notes_sidebar import NotesSidebar
from .components.notes.split_notes import SplitNotes
from .components.notes.ai_chat_panel import AIChatPanel
from .components.notes.concept_map_panel import ConceptMapPanel
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
from .components.calendario.calendario_panel import CalendarioPanel
from .components.calendario.calendario_left_panel import CalendarioLeftPanel
from .components.metas.metas_panel import MetasPanel
from .components.metas.metas_left_panel import MetasLeftPanel
from .components.finanzas.finanzas_panel import FinanzasPanel, FinanzasLeftPanel

CENTER_PANEL_INDEX = 1

MODE_HOME       = "home"
MODE_CALENDARIO = "calendario"
MODE_HABITS     = "habits"
MODE_EJERCICIO  = "ejercicio"
MODE_NOTAS      = "notas"
MODE_PROYECTOS  = "proyectos"
MODE_TAREAS     = "tareas"
MODE_METAS      = "metas"
MODE_FINANZAS   = "finanzas"
ALL_MODES = (MODE_HOME, MODE_CALENDARIO, MODE_HABITS, MODE_EJERCICIO, MODE_PROYECTOS,
             MODE_METAS, MODE_FINANZAS, MODE_NOTAS, MODE_TAREAS)


def _placeholder(text: str, obj: str = "centerPanel") -> QWidget:
    w = QWidget()
    w.setObjectName(obj)
    lay = QVBoxLayout(w)
    lbl = QLabel(text)
    lbl.setObjectName("metaLabel")
    lbl.setAlignment(Qt.AlignCenter)
    lay.addWidget(lbl)
    return w


class _ResponsiveStackedWidget(QStackedWidget):
    """Reports size hints based on the current page to enable responsive shrinking."""

    def minimumSizeHint(self):
        w = self.currentWidget()
        if w is not None:
            sz = w.minimumSizeHint()
            return QSize(min(sz.width(), 320), min(sz.height(), 200))
        return QSize(320, 200)

    def sizeHint(self):
        w = self.currentWidget()
        return w.sizeHint() if w is not None else super().sizeHint()


class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()
        self.setWindowTitle("NoteVault")
        self.resize(1400, 880)

        vault_path        = AppConfig.get_active_vault()
        self._create_managers(vault_path)

        self._mode = MODE_HOME
        self._navigator_width = 220
        self._inspector_width = 190
        self._chat_width      = 340
        self._nav_anim        = None
        self._insp_anim       = None
        self._assistant_visible = AppConfig.get_assistant_visible()
        self._user_hidden_right = False
        self._user_hidden_left  = False
        self._auto_collapsed_right = False
        self._auto_collapsed_left  = False

        self.setMinimumSize(480, 360)
        self._init_ui()
        self._init_web()
        self._switch_mode(MODE_HOME)

    def _create_managers(self, vault_path):
        """One manager per module, shared by every panel that shows its data."""
        self.vault        = VaultManager(vault_path)
        self.habits       = HabitManager(vault_path)
        self.exercise_mgr = ExerciseManager(vault_path)
        self.tasks        = TaskManager(vault_path)
        self.projects     = ProjectManager(vault_path)
        self.areas        = AreaManager(vault_path)
        self.goals        = GoalManager(vault_path, habit_mgr=self.habits, area_mgr=self.areas)
        self.schedule_mgr = ScheduleManager(
            vault_path, habit_mgr=self.habits, exercise_mgr=self.exercise_mgr,
            task_mgr=self.tasks, project_mgr=self.projects)
        self.schedule_mgr.register_source("metas", GoalCalendarSource(self.goals))
        self.schedule_mgr.register_source("proyectos", ProjectCalendarSource(self.projects))
        self.finances     = FinanceManager(vault_path)
        self.schedule_mgr.register_source("finanzas", FinanceCalendarSource(self.finances))
        self.notes        = NotesService(self.vault)

    # ── Build UI ──────────────────────────────────────────────────────────

    def _init_ui(self):
        theme.load_fonts()
        theme.install()
        self._theme = AppConfig.get_theme()
        theme.set_theme(self._theme)
        self.setStyleSheet(DARK_THEME_QSS)

        # ── Icon rail ─────────────────────────────────────────────────────
        self.icon_rail = IconRail()
        self.icon_rail.navigator_toggled.connect(self.toggle_explorer)
        self.icon_rail.home_requested.connect(
            lambda: self._switch_mode(MODE_HOME))
        self.icon_rail.calendario_requested.connect(
            lambda: self._switch_mode(MODE_CALENDARIO))
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
        self.icon_rail.metas_requested.connect(
            lambda: self._switch_mode(MODE_METAS))
        self.icon_rail.finanzas_requested.connect(
            lambda: self._switch_mode(MODE_FINANZAS))
        self.icon_rail.theme_toggled.connect(self.toggle_theme)
        self.icon_rail.set_theme_glyph(self._theme == "dark")

        # ── Left stack ────────────────────────────────────────────────────
        self._left_stack = QStackedWidget()
        self._left_stack.setMinimumWidth(0)
        self._left_stack.setMaximumWidth(420)

        self._explorer        = NotesSidebar(self.vault, self.notes)
        self._explorer.vault_switch_requested.connect(self._on_vault_switch)
        self._habit_left      = HabitLeftPanel(self.habits)
        self._ejercicio_left  = EjercicioLeftPanel()
        self._tareas_left     = TareasLeftPanel()
        self._proj_left       = ProyectosLeftPanel(self.projects)
        self._calendario_left = CalendarioLeftPanel(self.schedule_mgr)
        self._left_empty      = QWidget()
        self._left_empty.setObjectName("sidebarPanel")

        self._left_stack.addWidget(self._explorer)        # 0 — notas
        self._left_stack.addWidget(self._habit_left)      # 1 — habits
        self._left_stack.addWidget(self._ejercicio_left)  # 2 — ejercicio
        self._left_stack.addWidget(self._left_empty)      # 3 — others
        self._left_stack.addWidget(self._tareas_left)     # 4 — tareas
        self._left_stack.addWidget(self._proj_left)       # 5 — proyectos
        self._left_stack.addWidget(self._calendario_left) # 6 — calendario
        self._metas_left = MetasLeftPanel(self.goals, self.areas)
        self._left_stack.addWidget(self._metas_left)      # 7 — metas
        self._finanzas_left = FinanzasLeftPanel(self.finances)
        self._left_stack.addWidget(self._finanzas_left)   # 8 — finanzas

        # ── Center stack ──────────────────────────────────────────────────
        self._center_stack = _ResponsiveStackedWidget()

        self._habit_panel      = HabitTrackerPanel(self.habits)
        self._ejercicio_panel  = EjercicioPanel(self.exercise_mgr)
        self._notas_center     = SplitNotes(self.vault, self.notes)
        self._notas_map        = ConceptMapPanel(self.vault, self.notes)
        self._tareas_panel     = TareasPanel(self.tasks)
        self._proj_panel       = ProyectosPanel(self.projects, self.areas)
        self._dashboard        = DashboardPanel(
            self.habits, self.exercise_mgr, self.tasks, self.projects,
            goals=self.goals, areas=self.areas, finances=self.finances)
        self._calendario_panel = CalendarioPanel(self.schedule_mgr)

        self._center_stack.addWidget(self._habit_panel)      # 0
        self._center_stack.addWidget(self._ejercicio_panel)  # 1
        self._center_stack.addWidget(self._notas_center)     # 2
        self._center_stack.addWidget(self._tareas_panel)     # 3 — tareas
        self._center_stack.addWidget(self._proj_panel)       # 4 — proyectos
        self._center_stack.addWidget(self._dashboard)        # 5 — vista general
        self._center_stack.addWidget(self._calendario_panel) # 6 — calendario
        self._metas_panel = MetasPanel(self.goals, self.areas, self.habits)
        self._center_stack.addWidget(self._metas_panel)      # 7 — metas
        self._finanzas_panel = FinanzasPanel(self.finances)
        self._finanzas_left.view_requested.connect(self._finanzas_panel.show_view)
        self._finanzas_panel.view_changed.connect(self._finanzas_left.set_view)
        self._finanzas_panel.data_changed.connect(self._finanzas_left.refresh)
        self._center_stack.addWidget(self._finanzas_panel)   # 8 — finanzas
        self._center_stack.addWidget(self._notas_map)        # 9 — generador de mapas

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
        self._proj_panel.project_changed.connect(
            lambda pid: self._proj_left.set_active(pid or "__board__"))
        self._proj_left.new_requested.connect(self._proj_panel.new_project)
        self._proj_panel.open_note_requested.connect(self.open_note_at_path)
        self._proj_panel.reveal_in_os_requested.connect(self.reveal_in_os)
        self._calendario_left.view_requested.connect(self._calendario_panel.show_view)
        self._calendario_left.date_selected.connect(self._calendario_panel.set_date)
        self._calendario_left.filters_changed.connect(self._calendario_panel.set_filters)
        self._calendario_panel.view_changed.connect(self._calendario_left.set_active_view)
        self._calendario_panel.date_changed.connect(self._calendario_left.set_active_date)
        self._calendario_panel.status_message.connect(
            lambda msg: self.status_bar.showMessage(msg, 4000))
        self._calendario_panel.notify_requested.connect(self._notify)
        self._calendario_panel.open_habits_requested.connect(self._open_habit_editor)
        self._calendario_left.create_requested.connect(self._calendario_panel.create_new)
        self._dashboard.go_habits.connect(lambda: self._switch_mode(MODE_HABITS))
        self._dashboard.go_ejercicio.connect(lambda: self._switch_mode(MODE_EJERCICIO))
        self._dashboard.go_tareas.connect(lambda: self._switch_mode(MODE_TAREAS))
        self._dashboard.go_proyectos.connect(lambda: self._switch_mode(MODE_PROYECTOS))
        self._dashboard.go_notas.connect(lambda: self._switch_mode(MODE_NOTAS))
        self._dashboard.go_metas.connect(lambda: self._switch_mode(MODE_METAS))
        self._dashboard.go_finanzas.connect(lambda: self._switch_mode(MODE_FINANZAS))
        self._dashboard.goal_opened.connect(self._open_goal)
        self._calendario_panel.open_module_requested.connect(self._open_module_link)

        self._metas_left.view_requested.connect(self._metas_panel.show_view)
        self._metas_left.area_selected.connect(self._metas_panel.set_area)
        self._metas_left.filter_changed.connect(self._metas_panel.set_filter)
        self._metas_left.new_goal_requested.connect(self._metas_panel.new_goal)
        self._metas_left.new_area_requested.connect(self._metas_panel.new_area)
        self._metas_left.edit_area_requested.connect(self._metas_panel.edit_area)
        self._metas_panel.view_changed.connect(self._metas_left.set_view)
        self._metas_panel.data_changed.connect(self._metas_left.refresh)
        self._metas_panel.calendar_requested.connect(self._goals_calendar)
        self._metas_panel.open_note_requested.connect(self.open_note_at_path)
        self._metas_panel.reveal_in_os_requested.connect(self.reveal_in_os)

        # ── Notes module ──────────────────────────────────────────────
        self._explorer.note_selected.connect(self._open_notes_path)
        self._explorer.note_selected_new_tab.connect(
            lambda p: self._open_notes_path(p, new_tab=True)
        )
        self._explorer.note_selected_at_line.connect(self._open_notes_path)
        self._explorer.note_moved.connect(self._notas_center.on_note_moved)
        self._explorer.note_created.connect(self._notas_center.on_note_created)
        self._explorer.note_deleted.connect(self._notas_center.on_note_deleted)
        self._explorer.bookmarks_changed.connect(
            self._notas_center.refresh_mentions)
        # Concept-map generator: reachable from the explorer's 🗺 Mapa button.
        self._explorer.generate_map_requested.connect(self._show_map_generator)
        self._notas_map.map_created.connect(self._on_map_created)
        self._notas_map.open_requested.connect(self._open_notes_path)
        self._notas_center.active_note_changed.connect(self._on_note_changed)
        self._notas_center.open_note_requested.connect(self._open_notes_path)
        # note_saved is NOT connected to populate_tree: auto-save fires every
        # 1.2 s and a full tree rebuild on each save would freeze the UI.
        # New notes are added to the tree by new_note() in NotesSidebar itself.
        self._notas_center.bookmarks_changed.connect(
            self._explorer.refresh_bookmarks)
        self._notas_center.assistant_toggled.connect(self.toggle_assistant)
        self._notas_center.set_assistant_visible(self._assistant_visible)
        self._notas_center.reveal_requested.connect(self._reveal_in_explorer)
        self._notas_center.context_action_requested.connect(self._on_context_action_requested)
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
        self._center_stack.setMinimumWidth(320)
        self._left_stack.setMinimumWidth(0)
        self._right_stack.setMinimumWidth(0)
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

        self._agenda_timer = QTimer(self)
        self._agenda_timer.setInterval(30_000)
        self._agenda_timer.timeout.connect(
            lambda: self.notifier.check_schedule_reminders(self.schedule_mgr))
        self._agenda_timer.timeout.connect(self._check_issue_reminders)
        self._agenda_timer.start()

    def _check_issue_reminders(self):
        """Project issues remind with the same rules as tasks; the flag syncs."""
        try:
            issues = self.projects.all_issues()
            for r in reminder_scheduler.stale(issues):
                pid = next((i.project for i in issues if i.id == r.task_id), None)
                if pid:
                    self.projects.update_issue(pid, r.task_id, reminder_done=True)
            due = reminder_scheduler.due_now(issues)
        except Exception:
            return
        if not due:
            return
        for r in due:
            pid = next((i.project for i in issues if i.id == r.task_id), None)
            if pid:
                self.projects.update_issue(pid, r.task_id, reminder_done=True)
        if len(due) == 1:
            self._notify("Recordatorio de issue", due[0].body)
        else:
            self._notify(f"{len(due)} recordatorios de issues", "\n".join("• " + r.body for r in due))

    # ── Mode switching ────────────────────────────────────────────────────

    def _switch_mode(self, mode: str):
        self._mode = mode
        for k in ALL_MODES:
            self.icon_rail.set_active(k, k == mode)

        if mode == MODE_HOME:
            self._left_stack.setCurrentIndex(3)
            self._center_stack.setCurrentIndex(5)
            self._right_stack.setCurrentIndex(1)
            self._dashboard.refresh()
            self.status_bar.showMessage("Vista General")

        elif mode == MODE_CALENDARIO:
            self._left_stack.setCurrentIndex(6)
            self._center_stack.setCurrentIndex(6)
            self._right_stack.setCurrentIndex(1)
            self._calendario_panel.refresh_current()
            self.status_bar.showMessage("Calendario")

        elif mode == MODE_HABITS:
            self._left_stack.setCurrentIndex(1)
            self._center_stack.setCurrentIndex(0)
            self._right_stack.setCurrentIndex(0)
            self._habit_panel.refresh_all()
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

        elif mode == MODE_METAS:
            self._left_stack.setCurrentIndex(7)
            self._center_stack.setCurrentIndex(7)
            self._right_stack.setCurrentIndex(1)
            self.habits.reload()
            self._metas_left.refresh()
            self._metas_panel.refresh()
            self.status_bar.showMessage("Metas")

        elif mode == MODE_FINANZAS:
            self._left_stack.setCurrentIndex(8)
            self._center_stack.setCurrentIndex(8)
            self._right_stack.setCurrentIndex(1)
            self._refresh_finanzas()
            self.status_bar.showMessage("Finanzas")

        self._apply_mode_layout()

    def _refresh_finanzas(self):
        self._finanzas_panel.refresh()
        self._finanzas_left.refresh()

    def _open_goal(self, gid: str, item_id: str = ""):
        self._switch_mode(MODE_METAS)
        self._metas_panel.open_goal(gid, item_id)

    def _goals_calendar(self):
        self._switch_mode(MODE_CALENDARIO)
        self._calendario_panel.show_view("semana")

    def _open_module_link(self, source: str, link: dict):
        if source == "metas":
            self._open_goal(link.get("id", ""), link.get("item", ""))
        elif source == "proyectos":
            self._switch_mode(MODE_PROYECTOS)
            if link.get("id"):
                self._proj_panel.open_project(link["id"], link.get("issue", ""))
        elif source == "finanzas":
            self._switch_mode(MODE_FINANZAS)
            if link.get("id"):
                self._finanzas_panel.open_goal(link["id"])

    def _apply_mode_layout(self):
        show_left  = self._mode in (MODE_HABITS, MODE_NOTAS, MODE_EJERCICIO,
                                    MODE_PROYECTOS, MODE_TAREAS, MODE_CALENDARIO,
                                    MODE_METAS, MODE_FINANZAS)

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
            self._user_hidden_left = self._left_stack.isVisible()
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
        self._user_hidden_right = not self._assistant_visible
        AppConfig.set_assistant_visible(self._assistant_visible)
        self._notas_center.set_assistant_visible(self._assistant_visible)
        self._apply_mode_layout()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        w = self.width()

        # Breakpoint 1: < 900px auto-collapse right stack (assistant)
        if w < 900:
            if self._right_stack.isVisible() and not self._auto_collapsed_right:
                self._auto_collapsed_right = True
                self._right_stack.setVisible(False)
        elif w >= 900:
            if self._auto_collapsed_right:
                self._auto_collapsed_right = False
                if not self._user_hidden_right and (
                    self._mode == MODE_HABITS
                    or (self._mode == MODE_NOTAS and self._assistant_visible)
                ):
                    self._right_stack.setVisible(True)

        # Breakpoint 2: < 680px also auto-collapse left stack (explorer/nav)
        if w < 680:
            if self._left_stack.isVisible() and not self._auto_collapsed_left:
                self._auto_collapsed_left = True
                self._left_stack.setVisible(False)
        elif w >= 680:
            if self._auto_collapsed_left:
                self._auto_collapsed_left = False
                if not self._user_hidden_left:
                    show_left = self._mode in (
                        MODE_HABITS, MODE_NOTAS, MODE_EJERCICIO,
                        MODE_PROYECTOS, MODE_TAREAS, MODE_CALENDARIO,
                        MODE_METAS, MODE_FINANZAS,
                    )
                    self._left_stack.setVisible(show_left)

    def _reveal_in_explorer(self, path: Path):
        if self._mode == MODE_NOTAS:
            self._explorer.reveal(path)

    def open_note_at_path(self, note_path):
        """Switch to Notas mode, reveal the note in the explorer and open it in the editor."""
        if not note_path:
            return
        p = Path(note_path)
        if not p.is_absolute():
            p = self.vault.vault_root / p
        if not p.exists():
            return
        if p.suffix.lower() not in (".md", ".canvas"):
            try:
                import os
                os.startfile(str(p))
            except Exception:
                pass
            return
        self._switch_mode(MODE_NOTAS)
        self._open_notes_path(p)
        self._explorer.reveal(p)

    def _open_notes_path(self, path, line: int = 0, new_tab: bool = False):
        """Open a file in the notes workspace (editor handles both .md and .canvas)."""
        if not path:
            return
        # Coming back from the map generator: show the editor again.
        self._center_stack.setCurrentWidget(self._notas_center)
        self._notas_center.open_note(Path(path), line, new_tab=new_tab)

    def _show_map_generator(self):
        """Swap the notes centre to the concept-map generator."""
        self._switch_mode(MODE_NOTAS)
        self._center_stack.setCurrentWidget(self._notas_map)

    def _on_map_created(self, path):
        """A map was written: refresh the tree so it shows up."""
        self._explorer.populate_tree()
        self._explorer.reveal(Path(path))

    def new_canvas(self, folder=None):
        """Create a new .canvas in the given folder (or the vault root) and open it."""
        from .components.notes.canvas_actions import create_canvas
        p = create_canvas(self.vault, self.notes, folder)
        if p is None:
            return None
        self._switch_mode(MODE_NOTAS)
        self._explorer.populate_tree()
        self._notas_center.open_note(p)
        self._explorer.reveal(p)
        return p

    def reveal_in_os(self, path_str):
        """Open file or folder in system file explorer."""
        if not path_str:
            return
        p = Path(path_str)
        if not p.is_absolute():
            p = self.vault.vault_root / p
        if not p.exists():
            return
        try:
            import os
            import subprocess
            if p.is_dir():
                os.startfile(str(p))
            else:
                subprocess.Popen(f'explorer.exe /select,"{p.resolve()}"')
        except Exception:
            pass

    def _open_habit_editor(self, habit_id: str):
        from .components.habit_tracker.habit_tracker_panel import VIEW_MANAGE
        self._switch_mode(MODE_HABITS)
        self._habit_panel.show_view(VIEW_MANAGE)
        self._habit_left.set_active(VIEW_MANAGE)
        if habit_id:
            self._habit_panel._manage.open_editor(habit_id)

    # ── Vault switching ───────────────────────────────────────────────────

    def _on_vault_switch(self, vault_path: Path):
        AppConfig.set_active_vault(vault_path)
        self._create_managers(vault_path)
        self._calendario_panel.set_manager(self.schedule_mgr)
        self._calendario_left.schedule_mgr = self.schedule_mgr
        self._metas_panel.set_managers(self.goals, self.areas, self.habits)
        self._metas_left.set_managers(self.goals, self.areas)
        self._finanzas_panel.set_manager(self.finances)
        self._finanzas_left.set_manager(self.finances)
        self._explorer.set_vault(self.vault, self.notes)
        self._notas_center.set_vault(self.vault, self.notes)
        self._notas_map.set_vault(self.vault, self.notes)
        self._web.set_vault(vault_path)
        self._habit_panel.set_manager(self.habits)
        self._habit_right.set_manager(self.habits)
        self._habit_left.manager = self.habits
        self._ejercicio_panel.set_manager(self.exercise_mgr)
        self._tareas_panel.set_manager(self.tasks)
        self._proj_panel.set_manager(self.projects, self.areas)
        self._proj_left.set_manager(self.projects)
        self._dashboard.set_managers(
            self.habits, self.exercise_mgr, self.tasks, self.projects,
            goals=self.goals, areas=self.areas, finances=self.finances)
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

    # ── Distribuciones (layouts) ──────────────────────────────────────────

    def save_layout_dialog(self):
        """Prompt for a name and save the current panel distribution."""
        from PySide6.QtWidgets import QInputDialog
        vault_root = self.vault.vault_root
        names = list_layouts(vault_root)
        default = f"Distribución {len(names) + 1}"
        name, ok = QInputDialog.getText(
            self, "Guardar distribución", "Nombre:", text=default)
        if not ok or not name.strip():
            return
        self._do_save_layout(name.strip())
        self.status_bar.showMessage(f"Distribución guardada: {name.strip()}", 4000)

    def _do_save_layout(self, name: str):
        sizes = self.main_splitter.sizes()
        open_notes = []
        active_note = None
        for note in self._notas_center._open:
            try:
                rel = note.path.relative_to(self.vault.vault_root).as_posix()
                open_notes.append(rel)
            except ValueError:
                pass
        active = self._notas_center.current_path()
        if active:
            try:
                active_note = active.relative_to(self.vault.vault_root).as_posix()
            except ValueError:
                pass
        data = capture_layout(
            splitter_sizes=sizes,
            left_visible=self._left_stack.isVisible(),
            right_visible=self._right_stack.isVisible(),
            open_notes=open_notes,
            active_note=active_note,
        )
        data["mode"] = self._mode
        save_layout(self.vault.vault_root, name, data)

    def load_layout_dialog(self):
        """Show a picker and restore the chosen distribution."""
        from PySide6.QtWidgets import QInputDialog
        vault_root = self.vault.vault_root
        names = list_layouts(vault_root)
        if not names:
            self.status_bar.showMessage("No hay distribuciones guardadas.", 4000)
            return
        name, ok = QInputDialog.getItem(
            self, "Cargar distribución", "Distribución:", names, 0, False)
        if not ok:
            return
        data = load_layout(vault_root, name)
        if not data:
            self.status_bar.showMessage(f"No se encontró: {name}", 4000)
            return
        self._apply_layout(data)
        self.status_bar.showMessage(f"Distribución cargada: {name}", 4000)

    def _apply_layout(self, data: dict):
        mode = data.get("mode", self._mode)
        self._switch_mode(mode)

        sizes = data.get("splitter_sizes")
        if sizes and len(sizes) == 3:
            self.main_splitter.setSizes(sizes)

        open_notes = data.get("open_notes", [])
        active_note = data.get("active_note")
        vault_root = self.vault.vault_root
        if open_notes and mode == MODE_NOTAS:
            for rel in open_notes:
                p = vault_root / rel
                if p.exists():
                    self._notas_center.open_note(p)
            if active_note:
                ap = vault_root / active_note
                if ap.exists():
                    self._notas_center.open_note(ap)

    # ── WEB module (opened only from the Ctrl+P command palette) ──────────

    def _init_web(self):
        from PySide6.QtGui import QShortcut, QKeySequence
        from .components.web import controller as web_controller
        from .components.notes.command_palette import register_global_commands
        self._web = web_controller()
        self._web.set_vault(self.vault.vault_root)
        self._web.add_to_canvas_requested.connect(self._add_web_page_to_canvas)
        register_global_commands(self._web_commands)
        # Inside Notas the editor owns Ctrl+P; everywhere else this one opens
        # the same palette with the app-wide commands (WEB).
        keys = AppConfig.get_hotkeys().get("palette", "Ctrl+P") or "Ctrl+P"
        self._global_palette = QShortcut(QKeySequence(keys), self)
        self._global_palette.setContext(Qt.WindowShortcut)
        self._global_palette.activated.connect(self._open_global_palette)
        self._center_stack.currentChanged.connect(self._sync_global_palette)
        self._sync_global_palette()

    def _sync_global_palette(self, *_):
        self._global_palette.setEnabled(
            self._center_stack.currentWidget() is not self._notas_center)

    def _open_global_palette(self):
        from .components.notes.command_palette import CommandPalette, global_commands
        palette = CommandPalette(global_commands(), self)
        if palette.popup_over(self._center_stack) and palette.chosen is not None:
            palette.chosen.run()

    def _web_commands(self) -> list:
        from .components.notes.command_palette import Command
        has_canvas = lambda: self._notas_center.current_canvas() is not None  # noqa: E731
        return [
            Command("Abrir navegador WEB", "WEB", self._web.open_window),
            Command("Abrir una dirección en WEB…", "WEB", self._web_open_url),
            Command("Restricciones de contenido…", "WEB", self._web_restrictions),
            Command("Añadir página web al canvas…", "WEB", self._web_card_prompt,
                    "", has_canvas),
        ]

    def _web_open_url(self):
        from PySide6.QtWidgets import QInputDialog
        url, ok = QInputDialog.getText(self, "WEB", "Dirección o búsqueda:")
        if ok and url.strip():
            self._web.open_window(url.strip())

    def _web_restrictions(self):
        if self._web.open_window():
            self._web.window().show_restrictions()

    def _web_card_prompt(self):
        canvas = self._notas_center.current_canvas()
        if canvas is not None:
            canvas._pick_and_add_link()

    def _add_web_page_to_canvas(self, url: str, title: str):
        from PySide6.QtWidgets import QMessageBox
        canvas = self._notas_center.current_canvas()
        win = self._web.window(create=False)
        if canvas is None:
            QMessageBox.information(
                win or self, "Añadir al canvas",
                "Abre primero un canvas en Notas; la página se añadirá en el centro de lo que "
                "estés viendo.")
            return
        canvas.add_web_page(url, title)
        if win is not None:
            win.statusBar().showMessage("Página añadida al canvas", 4000)

    def closeEvent(self, event):
        try:
            self._web.shutdown()
            win = self._web.window(create=False)
            if win is not None:
                win.close()
        except Exception:
            pass
        try:
            self._notas_center.flush_canvas()
        except Exception:
            pass
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
        self._notas_center.retheme()
        self._habit_panel.refresh_all()
        self._habit_right.refresh_stats()
        self._ejercicio_panel.refresh_current()
        self._tareas_panel.refresh_current()
        self._proj_left.refresh()
        self._proj_panel.refresh()
        self._metas_left.refresh()
        self._metas_panel.refresh()
        self._refresh_finanzas()
        self._dashboard.refresh()

    def _on_context_action_requested(self, action_id: str, context_text: str, meta: dict):
        if not self._assistant_visible:
            self.toggle_assistant()

        prompts = {
            "solve": f"Resuelve o simplifica paso a paso la siguiente expresión matemática de la nota:\n\n```text\n{context_text}\n```",
            "derive": f"Calcula la derivada simbólica paso a paso de la siguiente expresión:\n\n```text\n{context_text}\n```",
            "integrate": f"Calcula la integral simbólica paso a paso de la siguiente expresión:\n\n```text\n{context_text}\n```",
            "graph": f"Analiza matemáticamente y describe las propiedades para graficar (raíces, asíntotas, máximos y mínimos) de la función:\n\n```text\n{context_text}\n```",
            "latex": f"Convierte o formatea la siguiente expresión a LaTeX limpio y profesional:\n\n```text\n{context_text}\n```",
            "decompose": f"Descompón paso a paso la solución del siguiente problema e identifica el método utilizado:\n\n```text\n{context_text}\n```",
            "verify": f"Verifica la corrección matemática y el razonamiento del siguiente desarrollo, señalando cualquier error:\n\n```text\n{context_text}\n```",
            "run": f"Analiza y simula la ejecución paso a paso del siguiente código, indicando la salida esperada y posibles fallos:\n\n```python\n{context_text}\n```",
            "test": f"Diseña una suite completa de pruebas unitarias para el siguiente código, cubriendo casos normales y casos límite:\n\n```python\n{context_text}\n```",
            "debug": f"Depura el siguiente código. Identifica el error exacto, explica la causa raíz y propón la solución corregida:\n\n```python\n{context_text}\n```",
            "explain": f"Explica de forma didáctica y clara la lógica del siguiente fragmento, incluyendo complejidad algorítmica si aplica:\n\n```text\n{context_text}\n```",
            "optimize": f"Optimiza el siguiente código para mejorar su eficiencia temporal y espacial, explicando las mejoras:\n\n```python\n{context_text}\n```",
            "variant": f"Genera una variante desafiante del siguiente problema para entrenar la misma habilidad:\n\n```text\n{context_text}\n```",
            "translate": f"Traduce de forma fluida y precisa el siguiente texto, añadiendo notas lingüísticas si es necesario:\n\n```text\n{context_text}\n```",
            "vocabulary": f"Extrae el vocabulario clave del siguiente texto con su significado contextual, categoría gramatical, pronunciación IPA y ejemplo:\n\n```text\n{context_text}\n```",
            "grammar": f"Explica la estructura gramatical utilizada en el siguiente texto, reglas, excepciones y posibles errores comunes:\n\n```text\n{context_text}\n```",
            "cloze": f"Genera un ejercicio tipo cloze (rellenar huecos) basado en el siguiente texto con opciones múltiples y solución explicada:\n\n```text\n{context_text}\n```",
            "listening": f"Genera un guión de comprensión auditiva con preguntas de opción múltiple y vocabulario clave a partir de:\n\n```text\n{context_text}\n```",
            "questions": f"Formula 5 preguntas de comprensión y reflexión activa basadas en:\n\n```text\n{context_text}\n```",
            "summarize": f"Sintetiza los puntos fundamentales del siguiente contenido en 5 ideas clave con formato markdown:\n\n```text\n{context_text}\n```",
            "flashcard": f"Crea una tarjeta de recuperación activa (pregunta frontal y respuesta detallada al reverso) sobre:\n\n```text\n{context_text}\n```",
            "extract_concepts": f"Extrae y define los conceptos principales presentes en:\n\n```text\n{context_text}\n```",
            "link_concepts": f"Identifica conceptos relacionados y prerrequisitos para vincular con otras notas a partir de:\n\n```text\n{context_text}\n```",
            "exercise": f"Genera un ejercicio interactivo de práctica activa adecuado al nivel del siguiente tema:\n\n```text\n{context_text}\n```",
        }

        query = prompts.get(action_id, f"Analiza y explica en profundidad el siguiente contenido:\n\n{context_text}")
        self._notas_right.ask(query)

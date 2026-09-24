"""
The single place that names the vault file format.

`docs/VAULT_FORMAT.md` is the human contract; this module is the machine one.
`tests/test_vault_format.py` fails when the two stop agreeing, which is what
stops the desktop app from quietly breaking the Android client.
"""

FORMAT_VERSION = 4

# Every module stores its data inside this single folder, so a vault travels
# as one unit: one Syncthing folder instead of four at the vault root.
DATA_DIR = ".notevault"

# Folders owned by the modules, only at the root of the vault.
RESERVED_DIRS = (DATA_DIR,)

# Where the module folders lived in FORMAT_VERSION 1. `migrate_vault()` in
# vault_manager moves these under DATA_DIR the first time a vault is opened.
LEGACY_DIRS = ("habits", "ejercicio", "tareas", "proyectos")

BOOKMARKS_FILE = ".notevault-bookmarks.json"

# Per-module layout, relative to the vault root.
LAYOUT = {
    "data_dir":          DATA_DIR,
    "habits_dir":        f"{DATA_DIR}/habits",
    "habits_config":     f"{DATA_DIR}/habits/habits_config.json",
    "habits_day":        f"{DATA_DIR}/habits/{{year}}/{{month:02d}}/{{date}}.md",
    "exercise_dir":      f"{DATA_DIR}/ejercicio",
    "exercises":         f"{DATA_DIR}/ejercicio/exercises.json",
    "exercise_day":      f"{DATA_DIR}/ejercicio/{{year}}/{{month:02d}}/{{date}}.json",
    "exercise_videos_dir": f"{DATA_DIR}/ejercicio/videos",
    "tasks_dir":         f"{DATA_DIR}/tareas",
    "task":              f"{DATA_DIR}/tareas/{{id}}.md",
    "projects_dir":      f"{DATA_DIR}/proyectos",
    "project":           f"{DATA_DIR}/proyectos/{{id}}/{{id}}.md",
    "project_issues_dir": f"{DATA_DIR}/proyectos/{{id}}/issues",
    "issue":             f"{DATA_DIR}/proyectos/{{project}}/issues/{{id}}.md",
    "project_v3":        f"{DATA_DIR}/proyectos/{{id}}.md",
    "bookmarks":         BOOKMARKS_FILE,
    "trash_dir":         f"{DATA_DIR}/.papelera",
    "areas_dir":         f"{DATA_DIR}/areas",
    "area":              f"{DATA_DIR}/areas/{{id}}.json",
    "goals_dir":         f"{DATA_DIR}/metas",
    "goal":              f"{DATA_DIR}/metas/{{id}}/goal.md",
    "goal_items_dir":    f"{DATA_DIR}/metas/{{id}}/items",
    "goal_item":         f"{DATA_DIR}/metas/{{goal}}/items/{{id}}.md",
    "goal_log_day":      f"{DATA_DIR}/metas/registro/{{year}}/{{month:02d}}/{{date}}.json",
    "finance_dir":       f"{DATA_DIR}/finanzas",
    "finance_category":  f"{DATA_DIR}/finanzas/categorias/{{id}}.json",
    "finance_goal":      f"{DATA_DIR}/finanzas/metas/{{id}}.json",
    "finance_day":       f"{DATA_DIR}/finanzas/{{year}}/{{month:02d}}/{{date}}.json",
    "finance_attachments": f"{DATA_DIR}/finanzas/adjuntos/{{year}}/{{month:02d}}",
    "agenda_dir":        f"{DATA_DIR}/agenda",
    "agenda_routines":   f"{DATA_DIR}/agenda/routines.json",
    "agenda_events_dir": f"{DATA_DIR}/agenda/events",
    "agenda_events_day": f"{DATA_DIR}/agenda/events/{{year}}/{{month:02d}}/{{date}}.json",
    "agenda_settings":   f"{DATA_DIR}/agenda/settings.json",
    "workspaces_dir":    f"{DATA_DIR}/workspaces",
    "workspace":         f"{DATA_DIR}/workspaces/{{id}}.json",
    "study_dir":         f"{DATA_DIR}/estudio",
    "study_exercises_dir": f"{DATA_DIR}/estudio/ejercicios",
    "study_exercise":    f"{DATA_DIR}/estudio/ejercicios/{{id}}.json",
    "study_srs_dir":     f"{DATA_DIR}/estudio/srs",
    "study_srs_item":    f"{DATA_DIR}/estudio/srs/{{id}}.json",
    "study_errors_dir":  f"{DATA_DIR}/estudio/errores",
    "study_error":       f"{DATA_DIR}/estudio/errores/{{id}}.json",
    "study_goals_dir":   f"{DATA_DIR}/estudio/metas",
    "study_goal":        f"{DATA_DIR}/estudio/metas/{{id}}.json",
    "study_projects_dir": f"{DATA_DIR}/estudio/proyectos",
    "study_project":     f"{DATA_DIR}/estudio/proyectos/{{id}}.json",
    "study_attempts_dir": f"{DATA_DIR}/estudio/intentos",
    "study_attempt":     f"{DATA_DIR}/estudio/intentos/{{id}}.json",
    "study_error_digest": f"{DATA_DIR}/estudio/errores/ERROR_LOG.md",
    "study_handoff_dir": f"{DATA_DIR}/estudio/handoff",
    "study_handoff_request": f"{DATA_DIR}/estudio/handoff/requests/{{id}}.json",
    "study_handoff_response": f"{DATA_DIR}/estudio/handoff/responses/{{id}}.json",
    "study_ledger_dir":  f"{DATA_DIR}/estudio/ledger",
    "study_ledger":      f"{DATA_DIR}/estudio/ledger/{{id}}.json",
    "kb_canvas_manifest": f"{DATA_DIR}/estudio/kb_canvas_manifest.json",
    "web_dir":           f"{DATA_DIR}/web",
    "web_bookmarks":     f"{DATA_DIR}/web/marcadores.json",
    "web_restrictions":  f"{DATA_DIR}/web/restricciones.json",
    "web_history_day":   f"{DATA_DIR}/web/historial/{{year}}/{{month:02d}}/{{date}}.json",
    "web_usage_day":     f"{DATA_DIR}/web/uso/{{year}}/{{month:02d}}/{{date}}.json",
}

# 0 = Monday, matching datetime.date.weekday().
WEEKDAY_KEYS = ("lunes", "martes", "miercoles", "jueves",
                "viernes", "sabado", "domingo")

DATE_FMT = "%Y-%m-%d"
DATETIME_FMT = "%Y-%m-%dT%H:%M"

# Enumerations a client must accept verbatim.
TASK_STATUSES = ("Sin empezar", "En progreso", "Completado", "Bloqueado")
PROJECT_STATUSES = ("Planeado", "En curso", "Pausado", "Terminado")
PRIORITY_RANGE = (1, 3)

# Frontmatter keys, per entity. A client that reads a key it does not know
# must write it back untouched.
TASK_KEYS = ("id", "name", "created", "start", "due", "status", "subject",
             "priority", "reminder", "reminder_done")
PROJECT_KEYS = ("id", "name", "status", "color", "created", "start", "deadline")

# Optional keys, written only when set. Task ones go after TASK_KEYS, in this
# order, with a value containing ":" in double quotes.
TASK_OPTIONAL_KEYS = ("repeat", "repeat_until")
HABIT_OPTIONAL_KEYS = ("repeat", "start_date", "end_date", "paused_from", "time",
                       "duration_min", "in_calendar", "reminder_min", "colour", "notes",
                       "area")

# Repetition rules (core/recurrence.py): "daily", "weekly:0,2,4", "every:3",
# "monthly:1,15". Weekday 0 is Monday; day 31 means the last day of shorter months.
RECURRENCE_KINDS = ("daily", "weekly", "every", "monthly")

# ── FORMAT_VERSION 4: Áreas, Metas, Proyectos (tipo Jira) y Finanzas ─────────
#
# Markdown entities use the typed frontmatter of core/store.py: each tuple is
# (key, type) in write order. Types: id, str, int, num, bool, date, datetime,
# list. Empty values are not written.

PRIORITIES = ("Baja", "Media", "Alta", "Urgente")      # 1..4
PRIORITY_RANGE_V4 = (1, 4)

AREA_KEYS = ("id", "name", "icon", "colour", "order", "archived")

GOAL_STATUSES = ("Activa", "En pausa", "Completada", "Archivada")
GOAL_ITEM_STATUSES = ("Pendiente", "En curso", "Hecha")

GOAL_FIELDS = (
    ("id", "id"), ("name", "str"), ("area", "id"), ("status", "str"),
    ("priority", "int"), ("start", "date"), ("end", "date"), ("icon", "str"),
    ("colour", "str"), ("in_overview", "bool"), ("order", "num"), ("created", "date"),
)

GOAL_ITEM_FIELDS = (
    ("id", "id"), ("goal", "id"), ("parent", "id"), ("name", "str"),
    ("status", "str"), ("priority", "int"), ("order", "num"), ("start", "date"),
    ("due", "date"), ("due_time", "str"), ("duration_min", "int"),
    ("repeat", "str"), ("repeat_until", "date"), ("in_calendar", "bool"),
    ("reminder_min", "int"), ("target", "num"), ("unit", "str"), ("value", "num"),
    ("habit_links", "list"), ("done_at", "date"), ("created", "date"),
)

PROJECT_V4_STATUSES = PROJECT_STATUSES
DEFAULT_COLUMNS = ("Por hacer", "En curso", "En revisión", "Hecho")
ISSUE_TYPES = ("Submeta", "Tarea", "Subtarea", "Error", "Mejora")

PROJECT_FIELDS = (
    ("id", "id"), ("key", "id"), ("name", "str"), ("status", "str"),
    ("area", "id"), ("colour", "str"), ("icon", "str"), ("created", "date"),
    ("start", "date"), ("deadline", "date"), ("columns", "list"),
    ("done_column", "str"), ("in_calendar", "bool"),
)

ISSUE_FIELDS = (
    ("id", "id"), ("number", "int"), ("type", "str"), ("parent", "id"),
    ("title", "str"), ("status", "str"), ("priority", "int"), ("order", "num"),
    ("estimate_min", "int"), ("labels", "list"), ("created", "date"),
    ("start", "date"), ("due", "date"), ("due_time", "str"), ("repeat", "str"),
    ("repeat_until", "date"), ("in_calendar", "bool"), ("reminder", "datetime"),
    ("reminder_done", "bool"), ("done_at", "date"), ("attachments", "list"),
    ("updated", "datetime"),
)

MOVEMENT_TYPES = ("gasto", "ingreso", "ahorro", "retiro")
FINANCE_GOAL_STATUSES = ("Activa", "En pausa", "Cumplida")
CATEGORY_KEYS = ("id", "name", "icon", "colour", "kind", "budget_month_cents",
                 "order", "archived")
FINANCE_GOAL_KEYS = ("id", "name", "icon", "colour", "target_cents", "currency",
                     "start", "deadline", "show_in_daily", "cadence",
                     "suggested_cents", "status", "created", "notes")
MOVEMENT_KEYS = ("id", "type", "amount_cents", "currency", "category", "goal",
                 "what", "reason", "time", "attachments", "created")
DEFAULT_CURRENCY = "COP"

# Files attached to module entities (facturas, capturas).
ATTACHMENT_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".pdf")

# Marker that Syncthing leaves on a colliding file.
SYNC_CONFLICT_MARKER = ".sync-conflict-"


def is_sync_conflict(name: str) -> bool:
    return SYNC_CONFLICT_MARKER in str(name)

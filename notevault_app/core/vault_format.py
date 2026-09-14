"""
The single place that names the vault file format.

`docs/VAULT_FORMAT.md` is the human contract; this module is the machine one.
`tests/test_vault_format.py` fails when the two stop agreeing, which is what
stops the desktop app from quietly breaking the Android client.
"""

FORMAT_VERSION = 3

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
    "project":           f"{DATA_DIR}/proyectos/{{id}}.md",
    "bookmarks":         BOOKMARKS_FILE,
    "agenda_dir":        f"{DATA_DIR}/agenda",
    "agenda_routines":   f"{DATA_DIR}/agenda/routines.json",
    "agenda_events_dir": f"{DATA_DIR}/agenda/events",
    "agenda_events_day": f"{DATA_DIR}/agenda/events/{{year}}/{{month:02d}}/{{date}}.json",
    "agenda_settings":   f"{DATA_DIR}/agenda/settings.json",
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

# Marker that Syncthing leaves on a colliding file.
SYNC_CONFLICT_MARKER = ".sync-conflict-"


def is_sync_conflict(name: str) -> bool:
    return SYNC_CONFLICT_MARKER in str(name)

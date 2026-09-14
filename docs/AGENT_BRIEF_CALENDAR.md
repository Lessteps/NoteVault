# Agent brief — the Calendar module (time & scheduling)

**Audience:** an AI agent with no memory of this project.
**Status:** not built yet. This document is the specification.
**Read first, in this order:** `CLAUDE.md`, `docs/AI_HANDBOOK.md` (whole file),
`docs/VAULT_FORMAT.md`. They describe the app, the visual language and the file
format. This brief only covers the new module and assumes you have read them.

The owner's problem, in his words, is *time and general organisation*. He wants a
routine that repeats daily, adapts when a day is different, and shows habits,
tasks and projects on one timeline. That is what this module is for. Every label
the user sees is in **Spanish**; every comment, identifier and document you write
is in **English**.

---

## 0. Ground rules you must not break

1. **`FULLSTACK_FACTORY` is never modified.** Not a file, not a line.
2. **`NoteVault.exe` is rebuilt and copied to the repo root after every change**
   (`python -m PyInstaller NoteVault.spec --noconfirm`, then copy
   `dist/NoteVault.exe` over `NoteVault.exe`). The owner launches the app from
   the .exe, never from a command line. A change that is not in the .exe does
   not exist for him. If the copy fails with "Device or resource busy" the app
   is open — say so and ask him to close it.
3. **All module data lives in one folder**, `<vault>/.notevault/`. The owner
   syncs a single folder with Syncthing and cannot connect three.
4. **A file format change is made in `notevault_app/core/vault_format.py` and
   `notevault_mobile/lib/core/vault_format.dart` together**, and the writers
   must stay byte-identical. `python tests/test_vault_format.py` on the desktop
   and `flutter test` on mobile both have to pass.
5. **Never autosave a re-serialisation that loses content.** See
   `rich_edit_problem()` in `core/qt_markdown.py` for the existing guarantee.
6. **Verify visually.** Instantiate the widget, `widget.grab().save(...)`, and
   look at the image before calling UI work done. Code that imports cleanly is
   not evidence that it looks right.

---

## 1. What exists today (the parts you will connect)

| Module | Manager | Data on disk |
|---|---|---|
| Hábitos | `core/habit_manager.py` | `.notevault/habits/habits_config.json`, `.notevault/habits/YYYY/MM/YYYY-MM-DD.md` |
| Ejercicio | `core/exercise_manager.py` | `.notevault/ejercicio/exercises.json`, `.notevault/ejercicio/YYYY/MM/YYYY-MM-DD.json` |
| Tareas | `core/task_manager.py` | `.notevault/tareas/<id>.md` (YAML frontmatter + body) |
| Proyectos | `core/project_manager.py` | `.notevault/proyectos/<id>.md` |
| Notas | `core/notes_service.py` | any `.md` outside `.notevault/` |

The window is `ui/main_window.py`: a left icon rail, then a three-panel splitter
(left stack / centre stack / right stack), one index per module. Adding a module
means adding a left panel, a centre panel, an icon-rail entry and a `MODE_*`
constant, following exactly what `MODE_TAREAS` does.

**What tasks and projects already have:** tasks carry `start`, `due`,
`reminder` and `reminder_done` in their frontmatter; projects carry dates too.
Read the real frontmatter keys from `docs/VAULT_FORMAT.md` before writing any —
do not invent key names, and do not drop keys you did not recognise when you
save (the current `TaskManager.save` already loses unknown keys; fix that as
part of this work).

---

## 2. What to build

A **Google-Calendar-like module**, in Spanish, called **Calendario**, that:

- shows Día / Semana / Mes / Agenda views with the same interaction model as
  Google Calendar (click an empty slot to create, drag to move, drag an edge to
  resize, click an event to open it);
- draws **habits**, **exercise sessions**, **tasks** and **projects** on the
  same grid, each with its own colour;
- lets the owner give a **time and a date** to a task and to a project, so it
  appears on the grid;
- supports a **recurring daily routine** with per-weekday variations and
  one-off exceptions, which is the actual point of the module.

Split it into the six phases below. Each phase is a separate, reviewable change
that leaves the app working.

---

## 3. Phase 1 — the schedule format (do this before any UI)

Create `notevault_app/core/schedule_format.py` (and mirror it later in Dart).
This is the contract; get it right first, because everything else reads it.

### 3.1 Files

```
.notevault/agenda/
├── routines.json          recurring blocks — the weekly template
├── events/
│   └── YYYY/MM/YYYY-MM-DD.json    one-off events and per-day overrides
└── settings.json          day start/end hour, first weekday, default durations
```

Add these to `vault_format.LAYOUT` with the same style as the existing entries,
bump `FORMAT_VERSION` to 3, and extend `tests/test_vault_format.py` and the
conformance fixtures. Mirror the whole thing in `vault_format.dart` in the same
commit.

### 3.2 `routines.json` — a JSON array of routine blocks

```json
[
  {
    "id": "rt_estudio_manana",
    "title": "Estudio backend",
    "kind": "routine",
    "days": ["lunes", "martes", "miercoles", "jueves", "viernes"],
    "start": "07:30",
    "duration_min": 90,
    "colour": "blue",
    "links": [{"type": "habit", "id": "programar"}],
    "active_from": "2026-09-01",
    "active_until": null,
    "notes": ""
  }
]
```

Rules:
- `days` uses the **existing Spanish weekday keys** already in
  `vault_format.py` (`lunes martes miercoles jueves viernes sabado domingo`) —
  reuse the constant, never redefine it.
- `start` is `HH:MM`, 24-hour, local time. There is no timezone field: the app
  is single-user and the vault syncs between his own devices. Write this
  assumption in the format doc so a later agent does not "fix" it wrongly.
- `duration_min` is an integer. An all-day block uses `"start": null` and
  `"duration_min": null`.
- `links` connects a block to something that already exists. `type` is one of
  `habit`, `exercise`, `task`, `project`, `note`; `id` is that module's own id
  (a habit's id, an exercise's `id`, a task's filename stem, a project's
  filename stem, a note's vault-relative path). A block may link to several
  things or to none.
- `active_from` / `active_until` bound the whole block, so a routine can be
  retired without deleting its history.

### 3.3 `events/YYYY/MM/YYYY-MM-DD.json` — what actually happened that day

```json
{
  "date": "2026-09-14",
  "events": [
    {
      "id": "ev_1731600000_a3f2",
      "title": "Clase de cálculo",
      "kind": "event",
      "start": "10:00",
      "duration_min": 120,
      "colour": "orange",
      "links": [],
      "done": false,
      "notes": ""
    }
  ],
  "overrides": {
    "rt_estudio_manana": {"status": "moved", "start": "09:00", "duration_min": 60}
  }
}
```

`overrides` is how a variable day works, and it is the heart of the feature.
A routine block is **not** copied into every day file. The day file only records
the difference:

| `status` | meaning |
|---|---|
| `skipped` | the block does not happen today |
| `moved` | it happens, at the `start` / `duration_min` given here |
| `done` | it happened as planned |

A day with no file is a day where the routine ran as written. This keeps the
vault small, keeps Syncthing quiet, and means editing the routine
retroactively changes the past the way the owner expects.

### 3.4 Writing rules (non-negotiable, they are what keeps mobile in sync)

- JSON written with `json.dumps(data, indent=2, ensure_ascii=False)` plus a
  trailing newline — identical to what the exercise manager does now. Copy its
  `save` method rather than writing a new one.
- Ids are opaque strings: `rt_` + slug for routines, `ev_` + unix seconds + 4
  random hex for events. Never renumber, never reuse.
- Unknown keys in a file you load are **preserved on save**. A newer app version
  or the phone may have written them.

---

## 4. Phase 2 — `core/schedule_manager.py`

A manager in the shape of the existing ones (`ExerciseManager` is the closest
model: same constructor signature, same lazy load, same cache invalidation).

Required API:

```python
class ScheduleManager:
    def __init__(self, vault_root: Path): ...

    # routines
    def routines(self) -> list[dict]
    def add_routine(self, **fields) -> dict
    def update_routine(self, routine_id: str, **fields)
    def remove_routine(self, routine_id: str)

    # one day, fully resolved
    def day(self, d: date) -> list[Occurrence]

    # a range, for the week and month views
    def range(self, first: date, last: date) -> dict[date, list[Occurrence]]

    # editing a single occurrence
    def move(self, d: date, occurrence_id: str, start: str, duration_min: int)
    def skip(self, d: date, occurrence_id: str)
    def set_done(self, d: date, occurrence_id: str, done: bool)
```

`Occurrence` is a dataclass — the merged view of a routine plus its override,
or a one-off event, plus anything pulled in from the other modules:

```python
@dataclass
class Occurrence:
    id: str
    title: str
    kind: str            # routine | event | habit | exercise | task | project
    date: date
    start: Optional[str]        # "HH:MM", None = all day
    duration_min: Optional[int]
    colour: str
    links: list[dict]
    done: bool
    source: str          # "routine" | "event" | module name — where to write back
    editable: bool       # a task's time is edited in the task, not here
```

**`day()` is the function everything else depends on. It must:**
1. read `routines.json`, keep blocks whose `days` contains this weekday and
   whose `active_from`/`active_until` window contains the date;
2. apply the day file's `overrides` (drop `skipped`, shift `moved`, mark `done`);
3. append the day file's own `events`;
4. append **derived** occurrences from the other modules:
   - every task whose `due` (or `start`) is this date, `kind="task"`,
     `editable=False` unless the task has a time,
   - every project whose date range covers this date, `kind="project"`,
   - the exercise session for this weekday if `exercises_for_day()` is not
     empty, `kind="exercise"`, linking to the tracker,
   - habits that are scheduled for this weekday, `kind="habit"`;
5. sort by `start`, all-day items first;
6. **never write anything.** `day()` is pure.

Cache per date and invalidate on write. `range()` over a month must not read a
file per module per day — read each module's data once and index it by date.

### Performance requirement
The notes editor was rewritten this week because it re-read the whole vault on
every interaction and froze the window for seconds. Do not repeat that mistake.
Budget: **`range()` over a month must stay under 50 ms** with the owner's real
vault. Measure it with `time.perf_counter()` and put the number in your commit
message. If a module's data is expensive to read, cache it the way
`core/vault_index.py` caches note text (read once, validate by mtime).

---

## 5. Phase 3 — giving tasks and projects a time

Tasks already have `start`, `due` and `reminder`. Add an **hour** without
breaking the format: keep the date keys as they are and add optional
`start_time` / `due_time` (`"HH:MM"`) beside them. Do **not** turn `due` into a
datetime string — the phone parses it as a date today and would break.

- `ui/components/tareas/` — in the task editor, put a time field next to each
  date field, empty by default. An empty time means an all-day item.
- `ui/components/proyectos/` — the same for a project's dates.
- Both must round-trip: `TaskManager.save` currently **drops frontmatter keys it
  does not know about**. Fix that first (load the raw frontmatter, update the
  keys you own, write the rest back untouched) or this phase will silently
  delete data.
- Mirror both in `notevault_mobile/lib/core/task_manager.dart` and
  `project_manager.dart`, and extend `test/conformance_test.dart`.

---

## 6. Phase 4 — the calendar UI

New package `ui/components/calendario/`:

```
calendario_panel.py        centre panel, holds the view stack
calendario_left_panel.py   left panel: view switcher, mini month, filters
vista_dia.py               day grid
vista_semana.py            week grid (7 columns)
vista_mes.py               month grid
vista_agenda.py            flat chronological list
evento_editor.py           create / edit dialog
rutina_editor.py           the recurring-block editor
```

### Visual language — copy it, do not invent it
Read `docs/AI_HANDBOOK.md` §4 for the palette and then match the existing
panels exactly: `#1a1a1e` page, `#202024` cards, `#33333e` borders, `#dcdde0`
text, `#888895` dim, accent per module (hábitos purple `#7c5af0`, ejercicio
orange `#ff9632`, proyectos `#a78bfa`, tareas blue `#2383e2`). Every colour that
is not in a stylesheet goes through `theme.tint()` so the light theme works —
this is checked by toggling the theme and taking a screenshot.

### Day and week grid — the specific behaviours to match Google Calendar
- Hour rows down the left (`settings.json` gives the first and last hour,
  default 06:00–23:00), a light line per hour and a fainter one per half hour.
- A **red "now" line** across today's column, moved by a `QTimer` once a minute.
- An event is a rounded rect with its accent as a 3 px left bar, title, and
  time when the block is tall enough. Overlapping events split the column
  width — implement the standard interval-packing: sort by start, group events
  that overlap transitively, then lay each group out in the minimum number of
  columns.
- **Click an empty slot** → create an event starting at that slot, snapped to
  15 minutes, with the default duration from settings.
- **Drag an event** → change its time (and its day, in week view).
- **Drag the bottom edge** → change its duration. Snap to 15 minutes.
- **Click an event** → open `evento_editor`.
- Dragging a *derived* occurrence (`editable=False`) shows a status-bar message
  saying where to edit it instead, and does not move.
- Keyboard: `T` today, `←`/`→` previous/next period, `D`/`S`/`M`/`A` to switch
  view, `Ctrl+N` new event. Use `QShortcut` with `Qt.WindowShortcut`, not
  `WidgetWithChildrenShortcut` — the widget-scoped variant silently does
  nothing whenever the focus is in a side panel, which is a bug this project has
  already had and fixed once.

### Month view
A 6×7 grid of day cells; each cell lists up to three occurrences then "+N más".
Clicking a day switches to the day view. The current month's days are `#1a1a1e`,
neighbouring months `#171717`, today gets an accent ring.

### Left panel
View switcher (Día / Semana / Mes / Agenda) styled like
`ejercicio_left_panel.py`, a mini month for navigation, and per-kind checkboxes
to show or hide hábitos / ejercicio / tareas / proyectos / rutinas. Persist the
filter state with `AppConfig`, the way `get/set_assistant_visible()` does.

---

## 7. Phase 5 — the recurring routine builder

`rutina_editor.py`, reachable from the left panel as "Rutinas".

- A weekly template: seven columns, a block list per weekday, drag a block from
  one day to another to copy it.
- A block has: title, time, duration, colour, weekdays, and links to a habit,
  an exercise day, a task or a project (a combo filled from that module's real
  data — never a free-text id).
- **Variability** is the point. Give it: per-weekday times for the same block
  (Monday 07:30, Saturday 10:00), `active_from` / `active_until`, and a
  "skip this day" action reachable from the calendar grid itself.
- A "Aplicar plantilla" preview showing the next 7 days as they will look,
  before saving.

---

## 8. Phase 6 — reminders

`core/notifier.py` already sends Windows toasts through the tray icon, and the
tasks module already has a reminder loop — read both before adding a third
mechanism. The calendar should feed the existing notifier, not replace it.
On mobile, reminders go through the scheduler already in
`notevault_mobile/lib/core/` (`flutter_local_notifications`); mirror the trigger
times only, not the delivery code.

---

## 9. Definition of done for each phase

A phase is done when **all** of these hold:

1. `python tests/test_vault_format.py` and `python tests/test_qt_markdown.py`
   pass. Note: `test_vault_format.py` currently fails one of 34 assertions
   because a conformance fixture records "today" and was generated on
   2026-09-12 — regenerate the fixtures with
   `python tests/test_vault_format.py --write` **and** re-run the mobile
   `flutter test` in the same change, or leave it alone and say you did.
2. You drove the real `MainWindow` on a scratch vault (back up
   `AppConfig.SETTINGS_FILE` and restore it afterwards), exercised every view,
   and nothing raised.
3. You took screenshots of each new view in **both themes** and looked at them.
4. You measured the timings the phase asks for and put the numbers in the commit
   message.
5. `NoteVault.exe` was rebuilt and copied to the repo root.
6. `docs/AI_HANDBOOK.md` and `docs/VAULT_FORMAT.md` were updated in the same
   commit, and `notevault_mobile/docs/` got the copies.

---

## 10. Things already fixed — do not "fix" them again

- Notes are read through `core/vault_index.py`, an mtime-validated in-memory
  copy of every note. Do not call `vault.all_notes()` in a loop or in a UI
  handler.
- `rich_edit_problem()` decides whether a note may be opened in the rich editor.
  The result is cached and the mode is settled once per open. Do not call it per
  keystroke.
- Table styling is batched in one `beginEditBlock`; unbatched it cost over a
  second per note.
- Task checkboxes in the rendered views are painted by hand
  (`_paint_checkbox`), because Qt draws its marker flush against the text.
- `[[wikilinks]]` open their note on Ctrl+click in Editor and Markdown mode and
  on plain click in Lectura, creating the note if it does not exist.
- A line of dashes under a paragraph is forced to a horizontal rule rather than
  a setext heading, in `prepare_markdown()`.
- `VaultManager` normalises a vault root that points at `.notevault` to its
  parent, and `migrate_vault()` lifts a nested `.notevault/.notevault` back one
  level. Selecting the data folder as the vault is the mistake that stranded the
  owner's exercise videos once already.

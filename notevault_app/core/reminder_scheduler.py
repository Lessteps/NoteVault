"""
Reminder rules shared by every NoteVault client.

The desktop app polls this on a timer; the Android app will call the same
rules to decide which local notifications to register with the system. The
logic lives here, free of Qt, so the two can never drift apart.

Two ideas matter for a multi-device setup:

  · `due_now()` is what a client shows *right now*, and marking a reminder as
    shown writes `reminder_done: true` into the task file. That flag syncs, so
    whichever device fires first stops the other from firing again.

  · `upcoming()` is what a mobile client needs instead: the reminders it must
    hand to the operating system ahead of time. iOS caps pending local
    notifications at 64, and Android drops them on reboot, so a client asks
    for a bounded window and re-registers whenever the vault changes.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

# A reminder older than this is stale: the device was off, or the vault was
# not opened for days. Fire it once on catch-up rather than silently swallow
# it, but never fire a reminder from last month.
STALE_AFTER = timedelta(days=2)

# What a mobile client pre-registers with the OS in one go.
DEFAULT_WINDOW = timedelta(days=14)
DEFAULT_MAX_PENDING = 60


@dataclass
class ScheduledReminder:
    """One notification a client should show or register."""
    task_id: str
    when: datetime
    title: str
    body: str
    overdue: bool = False

    @property
    def key(self) -> str:
        """Stable id, so re-registering replaces instead of duplicating."""
        return f"task:{self.task_id}"


def _describe(task) -> tuple:
    subject = f" · {task.subject}" if task.subject else ""
    limit = f" · vence {task.due.strftime('%d/%m')}" if task.due else ""
    when = task.reminder.strftime("%H:%M") if task.reminder else ""
    return (task.name, f"{task.name}{subject}{limit}  ({when})".strip())


def build(task, now: Optional[datetime] = None) -> Optional[ScheduledReminder]:
    """Turn a task into a reminder, or None when it does not need one."""
    now = now or datetime.now()
    if not task.reminder or task.reminder_done:
        return None
    if task.is_done:
        return None
    title, body = _describe(task)
    return ScheduledReminder(
        task_id=task.id,
        when=task.reminder,
        title=title,
        body=body,
        overdue=task.reminder < now,
    )


def due_now(tasks, now: Optional[datetime] = None) -> list:
    """Reminders whose time has arrived and that nobody has shown yet.

    Anything older than STALE_AFTER is skipped and should be marked as shown
    by the caller, so a laptop opened after a week does not dump a pile of
    week-old notifications on the user.
    """
    now = now or datetime.now()
    out = []
    for task in tasks:
        reminder = build(task, now)
        if reminder is None or reminder.when > now:
            continue
        if now - reminder.when > STALE_AFTER:
            continue
        out.append(reminder)
    out.sort(key=lambda r: r.when)
    return out


def stale(tasks, now: Optional[datetime] = None) -> list:
    """Reminders too old to be worth showing. Mark them shown, do not fire."""
    now = now or datetime.now()
    out = []
    for task in tasks:
        reminder = build(task, now)
        if reminder is None:
            continue
        if now - reminder.when > STALE_AFTER:
            out.append(reminder)
    return out


def upcoming(tasks, now: Optional[datetime] = None,
             window: timedelta = DEFAULT_WINDOW,
             limit: int = DEFAULT_MAX_PENDING) -> list:
    """Future reminders a client should hand to the OS, soonest first.

    Bounded by both a time window and a count, because both mobile platforms
    cap how many pending notifications an app may hold.
    """
    now = now or datetime.now()
    horizon = now + window
    out = []
    for task in tasks:
        reminder = build(task, now)
        if reminder is None:
            continue
        if now < reminder.when <= horizon:
            out.append(reminder)
    out.sort(key=lambda r: r.when)
    return out[:limit]


def summarize(reminders: list) -> tuple:
    """Collapse several reminders into one notification (title, body)."""
    if not reminders:
        return ("", "")
    if len(reminders) == 1:
        r = reminders[0]
        return ("Recordatorio de tarea", "• " + r.body)
    lines = ["• " + r.body for r in reminders]
    return (f"{len(reminders)} recordatorios de tareas", "\n".join(lines))

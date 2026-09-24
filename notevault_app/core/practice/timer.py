"""Timer specs for practice sessions (pure logic, no Qt)."""

import re
from dataclasses import dataclass

POMODORO_WORK = 25 * 60
POMODORO_BREAK = 5 * 60

_MINUTES_RE = re.compile(r"^(\d+)\s*(?:m|min|mins|minute|minutes|minuto|minutos)?$")


@dataclass(frozen=True)
class TimerSpec:
    kind: str
    seconds: int
    break_seconds: int


def _parse(value) -> TimerSpec | None:
    if value is False:
        return TimerSpec("off", 0, 0)
    text = str(value if value is not None else "").strip().lower()
    if not text:
        return None
    if text == "pomodoro":
        return TimerSpec("pomodoro", POMODORO_WORK, POMODORO_BREAK)
    if text in ("stopwatch", "cronometro", "cronómetro", "libre"):
        return TimerSpec("stopwatch", 0, 0)
    if text in ("off", "none", "no", "false"):
        return TimerSpec("off", 0, 0)
    m = _MINUTES_RE.match(text)
    if m and int(m.group(1)) > 0:
        return TimerSpec("countdown", int(m.group(1)) * 60, 0)
    return None


def parse_timer(value: str | None, minutes: int = 0, default: str = "stopwatch") -> TimerSpec:
    """Frontmatter `timer`, then frontmatter `minutes` (countdown), then the mode default."""
    spec = _parse(value)
    if spec:
        return spec
    try:
        mins = int(minutes or 0)
    except (TypeError, ValueError):
        mins = 0
    if mins > 0:
        return TimerSpec("countdown", mins * 60, 0)
    return _parse(default) or TimerSpec("stopwatch", 0, 0)

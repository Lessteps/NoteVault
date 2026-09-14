"""
Repetition rules shared by habits, tasks and calendar routines.

A rule is stored as one short string so it fits a JSON value and a YAML
frontmatter line alike:

    daily            every day
    weekly:0,2,4     on those weekdays (0 = Monday)
    every:3          every 3 days, counted from the anchor date
    monthly:1,15     on those days of the month (31 = last day of short months)

An empty string or "none" means the item does not repeat. The first and last
day a rule applies are stored beside it (start_date / end_date on habits,
repeat_until on tasks), never inside the string.
"""

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Iterator, Optional

NONE = "none"
DAILY = "daily"
WEEKLY = "weekly"
EVERY = "every"
MONTHLY = "monthly"
FREQS = (NONE, DAILY, WEEKLY, EVERY, MONTHLY)

WORKDAYS = (0, 1, 2, 3, 4)
WEEKEND = (5, 6)
ALL_DAYS = (0, 1, 2, 3, 4, 5, 6)

_WEEKDAY_SHORT = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")
_WEEKDAY_LONG = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")


def _ints(text: str, low: int, high: int) -> list:
    out = set()
    for part in text.split(","):
        try:
            value = int(part.strip())
        except ValueError:
            continue
        if low <= value <= high:
            out.add(value)
    return sorted(out)


@dataclass
class Recurrence:
    freq: str = NONE
    weekdays: list = field(default_factory=list)     # WEEKLY
    every: int = 1                                    # EVERY
    month_days: list = field(default_factory=list)   # MONTHLY

    # ── Parsing ───────────────────────────────────────────────────────────

    @classmethod
    def parse(cls, text: Optional[str]) -> "Recurrence":
        text = (text or "").strip().lower()
        if not text or text == NONE:
            return cls()
        kind, _, args = text.partition(":")
        if kind == DAILY:
            return cls(DAILY)
        if kind == WEEKLY:
            days = _ints(args, 0, 6)
            if len(days) == 7:
                return cls(DAILY)
            return cls(WEEKLY, weekdays=days) if days else cls()
        if kind == EVERY:
            try:
                n = int(args)
            except ValueError:
                return cls()
            return cls(DAILY) if n == 1 else cls(EVERY, every=max(2, min(365, n)))
        if kind == MONTHLY:
            days = _ints(args, 1, 31)
            return cls(MONTHLY, month_days=days) if days else cls()
        return cls()

    @classmethod
    def from_weekdays(cls, days) -> "Recurrence":
        days = sorted({int(d) for d in days if 0 <= int(d) <= 6})
        if len(days) == 7:
            return cls(DAILY)
        return cls(WEEKLY, weekdays=days) if days else cls()

    def to_string(self) -> str:
        if self.freq == DAILY:
            return DAILY
        if self.freq == WEEKLY and self.weekdays:
            return f"{WEEKLY}:{','.join(str(d) for d in sorted(self.weekdays))}"
        if self.freq == EVERY and self.every > 1:
            return f"{EVERY}:{self.every}"
        if self.freq == MONTHLY and self.month_days:
            return f"{MONTHLY}:{','.join(str(d) for d in sorted(self.month_days))}"
        return ""

    @property
    def repeats(self) -> bool:
        return self.to_string() != ""

    # ── Matching ──────────────────────────────────────────────────────────

    def occurs_on(self, d: date, anchor: Optional[date] = None,
                  until: Optional[date] = None) -> bool:
        """True when the rule lands on d. anchor is the first possible day."""
        if anchor is not None and d < anchor:
            return False
        if until is not None and d > until:
            return False
        if self.freq == NONE or not self.repeats:
            return anchor is not None and d == anchor
        if self.freq == DAILY:
            return True
        if self.freq == WEEKLY:
            return d.weekday() in self.weekdays
        if self.freq == EVERY:
            start = anchor or d
            return (d - start).days % self.every == 0
        if self.freq == MONTHLY:
            last = calendar.monthrange(d.year, d.month)[1]
            return any(min(day, last) == d.day for day in self.month_days)
        return False

    def next_after(self, d: date, anchor: Optional[date] = None,
                   until: Optional[date] = None) -> Optional[date]:
        """The first day after d the rule lands on, or None."""
        if not self.repeats:
            return None
        probe = d + timedelta(days=1)
        for _ in range(800):
            if until is not None and probe > until:
                return None
            if self.occurs_on(probe, anchor, until):
                return probe
            probe += timedelta(days=1)
        return None

    def weekdays_mask(self) -> list:
        """Weekdays for clients that only understand a weekday list."""
        if self.freq == WEEKLY:
            return list(self.weekdays)
        return list(ALL_DAYS)

    # ── Wording ───────────────────────────────────────────────────────────

    def describe(self) -> str:
        if self.freq == DAILY:
            return "Todos los días"
        if self.freq == WEEKLY:
            days = tuple(sorted(self.weekdays))
            if days == WORKDAYS:
                return "Días laborables (lun a vie)"
            if days == WEEKEND:
                return "Fines de semana"
            if len(days) == 1:
                return f"Cada {_WEEKDAY_LONG[days[0]]}"
            return "Cada " + ", ".join(_WEEKDAY_SHORT[i] for i in days)
        if self.freq == EVERY:
            return f"Cada {self.every} días"
        if self.freq == MONTHLY:
            days = sorted(self.month_days)
            if len(days) == 1:
                return f"Cada mes el día {days[0]}"
            return "Cada mes los días " + ", ".join(str(x) for x in days)
        return "No se repite"


def dates_between(rule: Recurrence, first: date, last: date,
                  anchor: Optional[date] = None, until: Optional[date] = None) -> Iterator[date]:
    d = first
    while d <= last:
        if rule.occurs_on(d, anchor, until):
            yield d
        d += timedelta(days=1)


def parse_date(value) -> Optional[date]:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()) if value else None
    except ValueError:
        return None

"""
Calendario UI components package.
"""

from datetime import date
from typing import Optional

MONTHS_ES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre")
WEEKDAYS_ES = ("lunes", "martes", "miércoles", "jueves", "viernes",
               "sábado", "domingo")

# Google Calendar's event colours, with their Spanish names.
GCAL_COLOURS = (
    ("#d50000", "Tomate"), ("#e67c73", "Flamenco"), ("#f4511e", "Mandarina"),
    ("#f6bf26", "Plátano"), ("#33b679", "Salvia"), ("#0b8043", "Albahaca"),
    ("#039be5", "Pavo real"), ("#3f51b5", "Arándano"), ("#7986cb", "Lavanda"),
    ("#8e24aa", "Uva"), ("#616161", "Grafito"),
)
DEFAULT_COLOUR = "#039be5"

# Colour names written by the first version of the module.
_NAMED_COLOURS = {
    "blue": "#039be5", "orange": "#f4511e", "purple": "#8e24aa",
    "teal": "#33b679", "green": "#33b679", "red": "#d50000", "yellow": "#f6bf26",
}


def month_name(d: date) -> str:
    return MONTHS_ES[d.month - 1]


def weekday_name(d: date) -> str:
    return WEEKDAYS_ES[d.weekday()]


def long_date(d: date) -> str:
    return f"{weekday_name(d).capitalize()}, {d.day} de {month_name(d)}"


def event_colour(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_COLOUR
    if value.startswith("#"):
        return value
    return _NAMED_COLOURS.get(value, DEFAULT_COLOUR)


def colour_name(value: Optional[str]) -> str:
    hexa = event_colour(value).lower()
    return next((name for h, name in GCAL_COLOURS if h == hexa), "Personalizado")


def parse_hm(value: Optional[str]) -> Optional[int]:
    """'HH:MM' -> minutes since midnight."""
    if not value:
        return None
    try:
        h, m = value.split(":")
        return int(h) * 60 + int(m)
    except ValueError:
        return None


def hm(minutes: int) -> str:
    """Minutes since midnight -> 'HH:MM', the on-disk format."""
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def fmt_hm(minutes: int) -> str:
    """Minutes since midnight -> '8:00', the display format."""
    return f"{minutes // 60}:{minutes % 60:02d}"


def fmt_range(start: int, end: int) -> str:
    return f"{fmt_hm(start)} – {fmt_hm(end)}"


def fmt_duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    if not h:
        return f"{m} min"
    return f"{h} h" if not m else f"{h} h {m} min"

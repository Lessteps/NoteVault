"""
Calendario UI components package.
"""

from datetime import date

MONTHS_ES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre")
WEEKDAYS_ES = ("lunes", "martes", "miércoles", "jueves", "viernes",
               "sábado", "domingo")


def month_name(d: date) -> str:
    return MONTHS_ES[d.month - 1]


def weekday_name(d: date) -> str:
    return WEEKDAYS_ES[d.weekday()]

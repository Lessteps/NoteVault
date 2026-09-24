"""Validation helpers shared by the module APIs.

Everything the UI sends is untrusted: values are type-checked, clamped and
stripped of line breaks before they reach a manager, because several
managers write them verbatim into YAML frontmatter (a newline in a name
would inject new keys into the file).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Optional

from ..errors import ApiError

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def one_line(value: Any, max_len: int = 300) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"[\r\n\t\x00-\x1f]+", " ", text).strip()
    return text[:max_len]


def opt_date(value: Any) -> Optional[date]:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ApiError(f"Fecha inválida: {value}") from None


def opt_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value)[:16])
    except ValueError:
        raise ApiError(f"Fecha y hora inválidas: {value}") from None


def opt_time(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not _TIME_RE.match(text):
        raise ApiError(f"Hora inválida: {value}")
    return text


def clamp_int(value: Any, low: int, high: int, default: int) -> int:
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def iso(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def body_text(value: Any, max_bytes: int = 2 * 1024 * 1024) -> str:
    text = "" if value is None else str(value)
    if len(text.encode("utf-8")) > max_bytes:
        raise ApiError("El texto es demasiado largo.")
    # A line that is exactly --- would end the frontmatter early on reload.
    return "\n".join("—" if ln.strip() == "---" else ln for ln in text.splitlines())

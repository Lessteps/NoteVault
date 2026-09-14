"""
Schedule file format specification and serialization helpers.

This module defines the JSON structure and serialization rules for:
  - .notevault/agenda/routines.json
  - .notevault/agenda/events/YYYY/MM/YYYY-MM-DD.json
  - .notevault/agenda/settings.json

Writing rules:
  - Output format: json.dumps(data, indent=2, ensure_ascii=False) + '\\n'
  - Opaque IDs: rt_* for routines, ev_<timestamp>_<4hex> for events.
  - Unknown keys loaded from files are preserved on save.
  - Times are 24-hour "HH:MM" local time strings without timezone.
"""

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from . import vault_format

DEFAULT_SETTINGS: Dict[str, Any] = {
    "day_start_hour": 6,
    "day_end_hour": 23,
    "first_weekday": "lunes",
    "default_duration_min": 60,
}


def dump_json(data: Union[Dict, List]) -> str:
    """Serialize JSON with 2-space indentation and a trailing newline."""
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def load_json(path: Path) -> Union[Dict, List, None]:
    """Safely load JSON data from disk if file exists."""
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8")
        return json.loads(text)
    except Exception:
        return None


def generate_routine_id(title: str = "") -> str:
    """Generate an opaque routine id starting with 'rt_'."""
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    suffix = uuid.uuid4().hex[:6]
    if slug:
        return f"rt_{slug[:20]}_{suffix}"
    return f"rt_{suffix}"


def generate_event_id() -> str:
    """Generate an opaque event id: ev_<timestamp>_<4hex>."""
    ts = int(time.time())
    rand_hex = uuid.uuid4().hex[:4]
    return f"ev_{ts}_{rand_hex}"


def validate_time(val: Optional[str]) -> Optional[str]:
    """Ensure time string matches 'HH:MM' or return None."""
    if not val:
        return None
    val = val.strip()
    if re.match(r"^\d{2}:\d{2}$", val):
        return val
    return None


def sanitize_routine(routine: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure routine dict has all required fields while preserving unknown keys."""
    out = dict(routine)
    out.setdefault("id", generate_routine_id(out.get("title", "")))
    out.setdefault("title", "Sin título")
    out.setdefault("kind", "routine")
    
    # Standard Spanish weekday keys
    days = out.get("days")
    if not isinstance(days, list):
        days = list(vault_format.WEEKDAY_KEYS[:5])
    out["days"] = [d for d in days if d in vault_format.WEEKDAY_KEYS]
    
    out["start"] = validate_time(out.get("start"))
    out["duration_min"] = out.get("duration_min") if isinstance(out.get("duration_min"), int) else None
    out.setdefault("colour", "blue")
    
    links = out.get("links")
    out["links"] = links if isinstance(links, list) else []
    
    out.setdefault("active_from", None)
    out.setdefault("active_until", None)
    out.setdefault("notes", "")
    return out


def sanitize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure event dict has all required fields while preserving unknown keys."""
    out = dict(event)
    out.setdefault("id", generate_event_id())
    out.setdefault("title", "Sin título")
    out.setdefault("kind", "event")
    out["start"] = validate_time(out.get("start"))
    out["duration_min"] = out.get("duration_min") if isinstance(out.get("duration_min"), int) else None
    out.setdefault("colour", "orange")
    
    links = out.get("links")
    out["links"] = links if isinstance(links, list) else []
    out.setdefault("done", False)
    out.setdefault("notes", "")
    return out


def sanitize_day_file(data: Optional[Dict[str, Any]], date_str: str) -> Dict[str, Any]:
    """Ensure day file structure contains date, events, and overrides."""
    out = dict(data) if isinstance(data, dict) else {}
    out["date"] = date_str
    
    raw_events = out.get("events")
    if isinstance(raw_events, list):
        out["events"] = [sanitize_event(ev) for ev in raw_events if isinstance(ev, dict)]
    else:
        out["events"] = []
        
    raw_overrides = out.get("overrides")
    if isinstance(raw_overrides, dict):
        out["overrides"] = raw_overrides
    else:
        out["overrides"] = {}
        
    return out


def sanitize_settings(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Ensure settings structure has defaults while preserving unknown keys."""
    out = dict(DEFAULT_SETTINGS)
    if isinstance(data, dict):
        out.update(data)
    return out

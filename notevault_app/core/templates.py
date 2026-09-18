"""Template engine for NoteVault.

Templates are plain .md files that may contain variables:
  {{title}}           — note title (or "Nueva nota" if unknown)
  {{date}}            — today in YYYY-MM-DD
  {{time}}            — current time HH:MM
  {{date:%d/%m/%Y}}   — date with custom strftime format
  {{datetime}}        — date + time
"""

import re
from datetime import datetime
from pathlib import Path
from typing import Optional


_VAR_RE = re.compile(r"\{\{(\w+)(?::([^}]*))?\}\}")


def expand_template(text: str, ctx: Optional[dict] = None) -> str:
    """Replace template variables in *text* using *ctx* + current datetime."""
    now = datetime.now()
    base = {
        "title": "",
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M"),
        "datetime": now.strftime("%Y-%m-%d %H:%M"),
    }
    if ctx:
        base.update(ctx)

    def replace(m: re.Match) -> str:
        key = m.group(1)
        fmt = m.group(2)
        if key == "date" and fmt:
            return now.strftime(fmt)
        if key == "datetime" and fmt:
            return now.strftime(fmt)
        return base.get(key, m.group(0))

    return _VAR_RE.sub(replace, text)


def list_templates(templates_dir: Path) -> list[Path]:
    """Return all .md files directly inside *templates_dir*, sorted by name."""
    if not templates_dir.is_dir():
        return []
    return sorted(templates_dir.glob("*.md"), key=lambda p: p.name.lower())


def read_and_expand(template_path: Path, ctx: Optional[dict] = None) -> str:
    """Read a template file and expand its variables."""
    raw = template_path.read_text(encoding="utf-8", errors="replace")
    return expand_template(raw, ctx)

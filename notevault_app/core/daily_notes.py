"""Daily Notes support for NoteVault.

Creates or opens the note for today in a configurable vault subfolder.
"""

from datetime import date
from pathlib import Path
from typing import Optional

from .templates import read_and_expand


def today_path(daily_dir: Path) -> Path:
    """Return the expected path for today's note (may not exist yet)."""
    return daily_dir / f"{date.today().isoformat()}.md"


def open_or_create_today(
    vault_root: Path,
    daily_dir: Path,
    template_path: Optional[Path] = None,
    title: Optional[str] = None,
) -> Path:
    """Return the path to today's daily note, creating it if needed.

    Idempotent: if the file already exists it is returned unchanged.
    """
    daily_dir.mkdir(parents=True, exist_ok=True)
    path = today_path(daily_dir)
    if path.exists():
        return path

    today_str = date.today().isoformat()
    note_title = title or today_str
    ctx = {"title": note_title, "date": today_str}

    if template_path and template_path.exists():
        content = read_and_expand(template_path, ctx)
    else:
        content = (
            f"---\ntitle: {note_title}\ndate: {today_str}\ntags: []\n---\n\n"
            f"# {note_title}\n\n"
        )

    path.write_text(content, encoding="utf-8")
    return path

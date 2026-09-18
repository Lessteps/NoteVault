"""Saved panel distributions (layouts) for NoteVault.

Each layout records the splitter sizes, which panels are visible, and
which notes are open. Stored as JSON files in <vault>/.notevault/layouts/.

Deliberately called "distribuciones" in the UI to avoid confusion with
study workspaces (also called "workspaces" in the codebase).
"""

import json
from pathlib import Path
from typing import Optional


LAYOUTS_DIR = "layouts"


def _layouts_dir(vault_root: Path) -> Path:
    from .vault_format import DATA_DIR
    d = vault_root / DATA_DIR / LAYOUTS_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


def list_layouts(vault_root: Path) -> list[str]:
    """Return layout names (stems of .json files) sorted alphabetically."""
    d = _layouts_dir(vault_root)
    return sorted(p.stem for p in d.glob("*.json"))


def save_layout(vault_root: Path, name: str, data: dict) -> Path:
    """Serialize *data* to <layouts>/<name>.json. Overwrites if exists."""
    name = name.strip().replace("/", "_").replace("\\", "_")
    if not name:
        raise ValueError("Layout name cannot be empty")
    path = _layouts_dir(vault_root) / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False),
                    encoding="utf-8")
    return path


def load_layout(vault_root: Path, name: str) -> Optional[dict]:
    """Load a layout by name. Returns None if not found."""
    path = _layouts_dir(vault_root) / f"{name}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def delete_layout(vault_root: Path, name: str) -> bool:
    path = _layouts_dir(vault_root) / f"{name}.json"
    if path.exists():
        path.unlink()
        return True
    return False


def capture_layout(splitter_sizes: list[int],
                   left_visible: bool,
                   right_visible: bool,
                   open_notes: list[str],
                   active_note: Optional[str] = None) -> dict:
    """Build the layout dict from current window state."""
    return {
        "version": 1,
        "splitter_sizes": splitter_sizes,
        "left_visible": left_visible,
        "right_visible": right_visible,
        "open_notes": open_notes,
        "active_note": active_note,
    }

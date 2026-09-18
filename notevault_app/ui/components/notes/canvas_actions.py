"""Helpers to create ``.canvas`` files from the UI."""

import re
from pathlib import Path

from PySide6.QtWidgets import QInputDialog

from ....core import canvas_format as cf

_BAD = re.compile(r'[\\/:*?"<>|]+')


def _safe_name(name: str) -> str:
    name = _BAD.sub("_", (name or "").strip()) or "Sin título"
    return name


def _unique(folder: Path, stem: str) -> Path:
    candidate = folder / f"{stem}{cf.CANVAS_EXT}"
    n = 1
    while candidate.exists():
        candidate = folder / f"{stem} {n}{cf.CANVAS_EXT}"
        n += 1
    return candidate


def create_canvas(vault, notes_service, folder=None, name=None, parent=None):
    """Ask for a name (unless given) and create an empty ``.canvas``.

    Returns the created Path, or None if the user cancelled.
    """
    if name is None:
        name, ok = QInputDialog.getText(parent, "Nuevo canvas",
                                        "Nombre del canvas:", text="Canvas")
        if not ok:
            return None
    stem = _safe_name(name)
    base = Path(folder) if folder else Path(vault.vault_root)
    if not base.exists():
        base = Path(vault.vault_root)
    path = _unique(base, stem)
    cf.create_empty(path)
    return path

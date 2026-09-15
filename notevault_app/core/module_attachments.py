"""
Files attached to module entities: invoices in Finanzas, screenshots in an
issue. Unlike note attachments they live inside the data folder, so they
travel with the vault and reach the phone:

    .notevault/<module>/adjuntos/AAAA/MM/<owner-id>-<n>.<ext>

References are stored relative to `.notevault/`, e.g.
"finanzas/adjuntos/2026/09/mv20260914-0f1e2d-1.png".
"""

import shutil
from datetime import date
from pathlib import Path
from typing import Optional

from . import vault_format


def _data_root(vault_root: Path) -> Path:
    return Path(vault_root) / vault_format.DATA_DIR


def folder_for(vault_root: Path, module: str, day: date) -> Path:
    return _data_root(vault_root) / module / "adjuntos" / f"{day.year}" / f"{day.month:02d}"


def _next_name(folder: Path, owner: str, ext: str) -> Path:
    n = 1
    while True:
        candidate = folder / f"{owner}-{n}{ext}"
        if not candidate.exists():
            return candidate
        n += 1


def is_supported(path) -> bool:
    return Path(str(path)).suffix.lower() in vault_format.ATTACHMENT_EXTS


def store_file(vault_root: Path, module: str, owner: str, source: Path,
               day: Optional[date] = None) -> str:
    """Copy source in and return its reference. Never overwrites."""
    source = Path(source)
    ext = source.suffix.lower()
    if ext not in vault_format.ATTACHMENT_EXTS:
        raise ValueError(f"Tipo de archivo no admitido: {ext or source.name}")
    folder = folder_for(vault_root, module, day or date.today())
    folder.mkdir(parents=True, exist_ok=True)
    target = _next_name(folder, owner, ".jpg" if ext == ".jpeg" else ext)
    shutil.copy2(source, target)
    return target.relative_to(_data_root(vault_root)).as_posix()


def store_image(vault_root: Path, module: str, owner: str, image,
                day: Optional[date] = None) -> str:
    """Save a pasted QImage (Win+Shift+S, Ctrl+V) as PNG and return its reference."""
    folder = folder_for(vault_root, module, day or date.today())
    folder.mkdir(parents=True, exist_ok=True)
    target = _next_name(folder, owner, ".png")
    if not image.save(str(target), "PNG"):
        raise OSError(f"No se pudo guardar la imagen en {target}")
    return target.relative_to(_data_root(vault_root)).as_posix()


def resolve(vault_root: Path, reference: str) -> Optional[Path]:
    """Absolute path of a reference, or None when the file is not (yet) synced."""
    if not reference:
        return None
    ref = Path(reference)
    if ref.is_absolute() or ".." in ref.parts:
        return None
    path = _data_root(vault_root) / ref
    return path if path.exists() else None


def remove(vault_root: Path, reference: str, bucket: str):
    """Send an attachment to the trash instead of deleting it."""
    from . import store
    path = resolve(vault_root, reference)
    if path is not None:
        store.to_trash(vault_root, path, bucket)

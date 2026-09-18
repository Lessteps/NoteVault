"""
Attachments embedded in notes.

Like Obsidian, a file dropped or pasted into a note is copied next to it,
into an `attachments` folder beside the note, and referenced with a path
relative to the note so the vault stays portable between machines.
"""

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

ATTACHMENTS_DIR = "attachments"

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}
PDF_EXTS   = {".pdf"}

_UNSAFE = re.compile(r'[\\/:*?"<>|]+')


def kind_of(path) -> Optional[str]:
    ext = Path(str(path)).suffix.lower()
    if ext in IMAGE_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in PDF_EXTS:
        return "pdf"
    return None


def fs_path(path) -> Path:
    """A path Windows can open even past the 260-character MAX_PATH limit."""
    p = Path(path)
    if sys.platform != "win32":
        return p
    text = str(p.resolve()) if not p.is_absolute() else str(p)
    if len(text) < 248 or text.startswith("\\\\?\\"):
        return p
    if text.startswith("\\\\"):
        return Path("\\\\?\\UNC\\" + text[2:])
    return Path("\\\\?\\" + text)


def _unique(folder: Path, name: str) -> Path:
    stem, suffix = Path(name).stem, Path(name).suffix
    candidate = folder / name
    n = 1
    while fs_path(candidate).exists():
        candidate = folder / f"{stem} {n}{suffix}"
        n += 1
    return candidate


def attachments_folder(note_path: Path) -> Path:
    return Path(note_path).parent / ATTACHMENTS_DIR


def import_file(note_path: Path, source: Path) -> Path:
    """Copy source beside the note and return the copied file.

    A file already inside this note's attachments folder is referenced where
    it is instead of being duplicated.
    """
    source = Path(source)
    folder = attachments_folder(note_path)
    try:
        if source.resolve().parent == folder.resolve():
            return source
    except OSError:
        pass
    fs_path(folder).mkdir(parents=True, exist_ok=True)
    safe = _UNSAFE.sub("_", source.name).strip() or "archivo"
    target = _unique(folder, safe)
    shutil.copy2(fs_path(source), fs_path(target))
    return target


def import_image_bytes(note_path: Path, image) -> Path:
    """Save a pasted QImage as a PNG beside the note."""
    folder = attachments_folder(note_path)
    fs_path(folder).mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = _unique(folder, f"Pegado {stamp}.png")
    if not image.save(str(fs_path(target)), "PNG"):
        raise OSError(f"No se pudo guardar la imagen en {target}")
    return target


def markdown_for(note_path: Path, attachment: Path) -> str:
    """The embed to write for an attachment, relative to the note."""
    try:
        rel = Path(attachment).relative_to(Path(note_path).parent).as_posix()
    except ValueError:
        rel = Path(attachment).as_posix()
    target = f"<{rel}>" if " " in rel else rel
    return f"![]({target})"


def resolve(note_path: Path, name: str, vault_root: Optional[Path] = None):
    """Find the file an embed points to, the way Obsidian looks it up.

    A relative path is tried against the note's folder first, then its
    attachments folder, then the vault root; a bare filename finally falls
    back to a search of the vault.
    """
    name = name.strip()
    if not name:
        return None
    note_dir = Path(note_path).parent
    raw = Path(name)
    candidates = [raw] if raw.is_absolute() else [
        note_dir / raw,
        note_dir / ATTACHMENTS_DIR / raw.name,
    ]
    if vault_root is not None and not raw.is_absolute():
        candidates.append(Path(vault_root) / raw)
    for c in candidates:
        if fs_path(c).exists():
            return c
    if vault_root is not None and raw.name == name:
        return _find_in_vault(Path(vault_root), raw.name)
    return None


_search_cache: dict = {}
MAX_SEARCH_DIRS = 3000


def _find_in_vault(root: Path, filename: str):
    """Bounded, pruned search: images load while painting, so this must never
    walk node_modules or a whole code tree."""
    import os
    from .vault_manager import IGNORED_DIRS

    key = (str(root), filename.lower())
    if key in _search_cache:
        return _search_cache[key]

    found, visited = None, 0
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
        visited += 1
        match = next((f for f in files if f.lower() == filename.lower()), None)
        if match:
            found = Path(folder) / match
            break
        if visited >= MAX_SEARCH_DIRS:
            break
    _search_cache[key] = found
    return found

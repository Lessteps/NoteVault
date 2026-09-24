"""Timestamp links to a moment of a media file in the vault.

Format: `[mm:ss](nv://media?file=<vault-relative path, percent-encoded>&t=<seconds>)`.
"""

from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

from ..attachments import AUDIO_EXTS, VIDEO_EXTS

MEDIA_EXTS = VIDEO_EXTS | AUDIO_EXTS | {".mpg", ".mpeg", ".wmv", ".opus", ".wma"}


def is_media_file(path) -> bool:
    return Path(str(path)).suffix.lower() in MEDIA_EXTS


def format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    h, rest = divmod(total, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _seconds_text(seconds: float) -> str:
    value = round(max(0.0, float(seconds)), 1)
    return str(int(value)) if value == int(value) else f"{value:.1f}"


def vault_relative(path: Path, vault_root: Path | None) -> str:
    path = Path(path)
    if vault_root is not None:
        try:
            return path.resolve().relative_to(Path(vault_root).resolve()).as_posix()
        except (ValueError, OSError):
            pass
    return path.as_posix()


def media_url(rel_path: str, seconds: float) -> str:
    return f"nv://media?file={quote(str(rel_path).replace(chr(92), '/'), safe='/')}&t={_seconds_text(seconds)}"


def media_link(rel_path: str, seconds: float, label: str | None = None) -> str:
    return f"[{label or format_timestamp(seconds)}]({media_url(rel_path, seconds)})"


def parse_media_url(url: str) -> tuple[str, float] | None:
    """(file, seconds) of an `nv://media?...` url, or None when it is not one."""
    parts = urlsplit(str(url or "").strip())
    if parts.scheme.lower() != "nv" or parts.netloc.lower() != "media" or parts.path not in ("", "/"):
        return None
    query = parse_qs(parts.query, keep_blank_values=True)
    file = (query.get("file") or [""])[0].strip()
    if not file:
        return None
    raw_t = (query.get("t") or ["0"])[0].strip().lower().rstrip("s")
    try:
        seconds = max(0.0, float(raw_t or 0))
    except ValueError:
        seconds = _clock_seconds(raw_t)
    return file, seconds


def _clock_seconds(text: str) -> float:
    try:
        total = 0.0
        for part in text.split(":"):
            total = total * 60 + float(part)
        return max(0.0, total)
    except ValueError:
        return 0.0


def resolve_media(file: str, vault_root: Path | None) -> Path:
    path = Path(file)
    if not path.is_absolute() and vault_root is not None:
        path = Path(vault_root) / path
    return path

"""Reproductor de inglés: the learner's own films and audio with dual
subtitles, and sentence mining into practice notes.

The page never sees disk paths: every media file gets an opaque id here and
is streamed by the local media server. Files come from the system file
dialog or from `nv://media` links inside the vault (confined to it); the app
never searches for or downloads content.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Any

from ...core.english.media_links import format_timestamp, is_media_file, vault_relative
from ...core.english.mining import CEFR_LEVELS, MiningError, write_mined_note
from ...core.english.subtitles import SUBTITLE_EXTS, find_sibling_subtitles, load_subtitles, pair_tracks
from ..errors import ApiError

MAX_MEDIA = 32
MAX_SUB_BYTES = 5 * 1024 * 1024


class EnglishPlayerApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel, _resolve and _window."""

    def _en_registry(self) -> dict:
        reg = getattr(self, "_en_media_reg", None)
        if reg is None:
            reg = self._en_media_reg = {}
        return reg

    def _en_server(self):
        media = getattr(self, "_media", None)
        if media is None:
            from ..media import MediaServer
            media = self._media = MediaServer()
        return media

    def _en_entry(self, media_id: str) -> dict:
        entry = self._en_registry().get(str(media_id))
        if entry is None:
            raise ApiError("Ese archivo ya no está abierto en el reproductor.")
        return entry

    def _en_load(self, path: Path, seconds: float = 0.0) -> dict:
        if not path.is_file() or not is_media_file(path):
            raise ApiError("Eso no es un archivo de audio o video.")
        reg = self._en_registry()
        for mid, e in reg.items():
            if e["path"] == path:
                break
        else:
            if len(reg) >= MAX_MEDIA:
                reg.pop(next(iter(reg)))
            mid = secrets.token_hex(8)
            en, es = find_sibling_subtitles(path)
            reg[mid] = {"path": path, "en": en, "es": es}
        entry = reg[mid]
        return {"id": mid, "url": self._en_server().url_for(path), "name": path.name,
                "seconds": max(0.0, float(seconds or 0)), **self._en_pairs(entry)}

    def _en_pairs(self, entry: dict) -> dict:
        def read(p):
            if p is None:
                return []
            if p.stat().st_size > MAX_SUB_BYTES:
                raise ApiError("El archivo de subtítulos es demasiado grande.")
            return load_subtitles(p)
        en, es = read(entry["en"]), read(entry["es"])
        primary, secondary = (en, es) if en else (es, [])
        pairs = pair_tracks(primary, secondary)
        if not en and es:
            pairs = [p.__class__(p.start, p.end, "", p.en) for p in pairs]
        return {"pairs": [{"start": p.start, "end": p.end, "en": p.en, "es": p.es} for p in pairs],
                "en_file": entry["en"].name if entry["en"] else "",
                "es_file": entry["es"].name if entry["es"] else ""}

    def _en_dialog(self, types: tuple) -> Path | None:
        window = getattr(self, "_window", None)
        if window is None:
            raise ApiError("Elegir archivos solo está disponible en la app de escritorio.")
        import webview
        chosen = window.create_file_dialog(webview.OPEN_DIALOG, file_types=types)
        if not chosen:
            return None
        return Path(chosen[0] if isinstance(chosen, (list, tuple)) else chosen)

    def en_player_pick(self) -> dict:
        """Choose a film or audio with the system dialog (anywhere on disk)."""
        path = self._en_dialog(("Audio y video (*.mp4;*.mkv;*.webm;*.mov;*.avi;*.m4v;*.mp3;*.m4a;*.wav;*.ogg;*.flac;*.opus)",
                                "Todos los archivos (*.*)"))
        if path is None:
            return {"ok": False}
        with self._lock:
            return dict(self._en_load(path), ok=True)

    def en_player_open(self, file: str, seconds: float = 0.0) -> dict:
        """Open a vault file (an `nv://media` link or a file of the explorer)."""
        rel = str(file or "").replace("\\", "/").strip()
        if rel.startswith("/") or (len(rel) > 1 and rel[1] == ":"):
            raise ApiError("Los enlaces de medios solo abren archivos del vault.")
        with self._lock:
            return dict(self._en_load(self._resolve(rel), _float(seconds)), ok=True)

    def en_player_subtitles(self, media_id: str, track: str) -> dict:
        """Choose the English or Spanish subtitle file by hand."""
        if track not in ("en", "es"):
            raise ApiError("Pista inválida.")
        path = self._en_dialog(("Subtítulos (*.srt;*.vtt)",))
        if path is None:
            return {"ok": False}
        if path.suffix.lower() not in SUBTITLE_EXTS:
            raise ApiError("Elige un archivo .srt o .vtt.")
        with self._lock:
            entry = self._en_entry(media_id)
            entry[track] = path
            try:
                return dict(self._en_pairs(entry), ok=True)
            except (OSError, ValueError) as e:
                raise ApiError(f"No se pudieron leer los subtítulos: {e}") from None

    def en_player_link(self, media_id: str, seconds: float) -> dict:
        """A timestamp link to paste in a note: [mm:ss](nv://media?…)."""
        from ...core.english.media_links import media_link
        with self._lock:
            entry = self._en_entry(media_id)
            return {"link": media_link(vault_relative(entry["path"], self._root), _float(seconds))}

    def en_player_mine(self, media_id: str, fields: Any) -> dict:
        """Turn a line into a practice note (translate or cloze) in Inglés/Minería."""
        if not isinstance(fields, dict):
            raise ApiError("Datos inválidos.")
        level = str(fields.get("level") or "B1").upper()
        if level not in CEFR_LEVELS:
            raise ApiError("Nivel inválido.")
        with self._lock:
            entry = self._en_entry(media_id)
            try:
                path = write_mined_note(
                    self._root, str(fields.get("sentence") or "")[:1000],
                    media_rel=vault_relative(entry["path"], self._root),
                    seconds=_float(fields.get("seconds")),
                    mode="cloze" if fields.get("mode") == "cloze" else "translate",
                    target=str(fields.get("target") or "")[:200], level=level,
                    reference_es=str(fields.get("reference_es") or "")[:1000])
            except MiningError as e:
                raise ApiError(str(e)) from None
            return {"path": self._rel(path), "stamp": format_timestamp(_float(fields.get("seconds")))}


def _float(v: Any) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(f, 10 ** 7))

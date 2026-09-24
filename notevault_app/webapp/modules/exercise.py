"""Ejercicio: the bridge over core.exercise_manager (weekly routine, daily
logs with weight and reps, videos)."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ...core.exercise_manager import ExerciseManager
from ...ui.components.ejercicio.exercise_data import DAYS
from ..errors import ApiError
from .common import clamp_int, one_line, opt_date

DAY_KEYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
GLYPHS = ["💪", "🦵", "💪", "🦵", "🔥", "🚶", "😴"]


def _day_key(d: date) -> str:
    return DAY_KEYS[d.weekday()]


def _num(value: Any, lo: float, hi: float) -> float:
    try:
        v = float(str(value).replace(",", ".")) if value not in (None, "") else 0.0
    except ValueError:
        raise ApiError(f"Número inválido: {value}") from None
    if v != v or not lo <= v <= hi:
        raise ApiError(f"Número inválido: {value}")
    return v


class ExerciseApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _window and _mgrs()."""

    def _ex(self) -> ExerciseManager:
        return self._mgrs().exercise

    def _ex_date(self, value: Any) -> date:
        d = opt_date(value)
        if d is None:
            raise ApiError("Fecha inválida.")
        return d

    def _ex_dict(self, mgr: ExerciseManager, e: dict) -> dict:
        path = mgr.resolve_video(e)
        return {"id": e["id"], "day": e.get("day", ""), "name": e.get("name", ""),
                "video": e.get("video", ""), "video_path": e.get("video_path", ""),
                "series_reps": e.get("series_reps", ""), "rest": e.get("rest", ""),
                "how_to": e.get("how_to", ""), "has_video": path is not None,
                "video_name": path.name if path else ""}

    def ex_meta(self) -> dict:
        subtitles = {d["key"]: d.get("subtitle", "") for d in DAYS}
        names = {d["key"]: d.get("name", "") for d in DAYS}
        return {"days": [{"key": k, "name": names.get(k, k.capitalize()), "subtitle": subtitles.get(k, ""),
                          "glyph": GLYPHS[i]} for i, k in enumerate(DAY_KEYS)]}

    def ex_list(self) -> list:
        with self._lock:
            mgr = self._ex()
            return [self._ex_dict(mgr, e) for e in mgr.exercises()]

    def ex_days(self, first: str, last: str) -> list:
        """Each day of a range with its exercises and what was logged."""
        with self._lock:
            a, b = self._ex_date(first), self._ex_date(last)
            if b < a or (b - a).days > 31:
                raise ApiError("Rango de fechas inválido.")
            mgr = self._ex()
            out = []
            d = a
            while d <= b:
                exs = mgr.exercises_for_day(_day_key(d))
                log = mgr.get_log(d)
                out.append({"date": d.isoformat(), "day": _day_key(d),
                            "exercises": [self._ex_dict(mgr, e) for e in exs],
                            "log": {e["id"]: log.entries.get(e["id"], {}) for e in exs},
                            "pct": mgr.day_pct(d)})
                d += timedelta(days=1)
            return out

    def ex_mark(self, day: str, exercise_id: str, done: bool, weight: Any = 0, reps: Any = 0,
                notes: str = "") -> dict:
        with self._lock:
            d = self._ex_date(day)
            mgr = self._ex()
            if not any(e["id"] == exercise_id for e in mgr.exercises()):
                raise ApiError("Ese ejercicio ya no existe.")
            mgr.mark_done(d, str(exercise_id), bool(done), _num(weight, 0, 2000),
                          int(_num(reps, 0, 10000)), one_line(notes, 300))
            return {"ok": True, "pct": mgr.day_pct(d)}

    def ex_overview(self, year: int = 0, exercise_id: str = "") -> dict:
        """Days trained this week / month / year, the year grid and a
        breakdown per exercise."""
        with self._lock:
            mgr = self._ex()
            today = date.today()
            y = clamp_int(year or today.year, 1970, 3000, today.year)
            monday = today - timedelta(days=today.weekday())
            week = sum(1 for i in range(7) if (d := monday + timedelta(days=i)) <= today and mgr.day_pct(d) > 0)
            month = sum(1 for n in range(1, today.day + 1) if mgr.day_pct(date(today.year, today.month, n)) > 0)
            year_pcts = mgr.range_pct_by_day(today.year)
            if exercise_id:
                hist = mgr.exercise_history(str(exercise_id), y)
                grid = {d.isoformat(): (1.0 if v else 0.0) for d, v in hist.items()}
            else:
                grid = {d.isoformat(): p for d, p in mgr.range_pct_by_day(y).items()}
            breakdown = []
            for key in DAY_KEYS:
                rows = []
                for e in mgr.exercises_for_day(key):
                    hist = mgr.exercise_history(e["id"], today.year)
                    done = sum(1 for v in hist.values() if v)
                    rows.append({"id": e["id"], "name": e.get("name", ""), "done": done, "total": len(hist)})
                if rows:
                    breakdown.append({"day": key, "rows": rows})
            return {"week": week, "month": month, "year": sum(1 for p in year_pcts.values() if p > 0),
                    "grid": grid, "breakdown": breakdown}

    # ── routine ───────────────────────────────────────────────────────────

    @staticmethod
    def _ex_fields(fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos inválidos.")
        day = fields.get("day", "lunes")
        if day not in DAY_KEYS:
            raise ApiError("Día inválido.")
        video_path = one_line(fields.get("video_path"), 1000)
        if video_path and Path(video_path).suffix.lower() not in ExerciseManager.VIDEO_EXTS:
            raise ApiError("Eso no es un video (mp4, mov, webm, mkv, m4v, avi).")
        return {"day": day, "name": one_line(fields.get("name"), 120) or "Ejercicio",
                "video_path": video_path, "series_reps": one_line(fields.get("series_reps"), 120),
                "rest": one_line(fields.get("rest"), 60), "how_to": str(fields.get("how_to") or "")[:4000]}

    def ex_save(self, exercise_id: str, fields: dict) -> dict:
        with self._lock:
            f = self._ex_fields(fields)
            mgr = self._ex()
            if not exercise_id:
                e = mgr.add_exercise(f["name"], f["day"], f["video_path"], f["series_reps"], f["rest"], f["how_to"])
                return self._ex_dict(mgr, e)
            if not any(e["id"] == exercise_id for e in mgr.exercises()):
                raise ApiError("Ese ejercicio ya no existe.")
            if f["video_path"]:
                f["video"] = Path(f["video_path"]).name
            mgr.update_exercise(str(exercise_id), **f)
            return self._ex_dict(mgr, next(e for e in mgr.exercises() if e["id"] == exercise_id))

    def ex_remove(self, exercise_id: str) -> dict:
        with self._lock:
            mgr = self._ex()
            if not any(e["id"] == exercise_id for e in mgr.exercises()):
                raise ApiError("Ese ejercicio ya no existe.")
            mgr.remove_exercise(str(exercise_id))
            return {"ok": True}

    def ex_link_videos(self) -> dict:
        with self._lock:
            return self._ex().link_videos()

    # ── videos ────────────────────────────────────────────────────────────

    def _ex_video(self, exercise_id: str) -> Path:
        mgr = self._ex()
        e = next((x for x in mgr.exercises() if x["id"] == exercise_id), None)
        if e is None:
            raise ApiError("Ese ejercicio ya no existe.")
        path = mgr.resolve_video(e)
        if path is None:
            raise ApiError("No se encontró el video. Vincúlalo en «Gestionar ejercicios».")
        if path.suffix.lower() not in ExerciseManager.VIDEO_EXTS:
            raise ApiError("Eso no es un video.")
        return path.resolve()

    def ex_video_url(self, exercise_id: str) -> dict:
        """A local streaming URL for the in-app player."""
        with self._lock:
            path = self._ex_video(str(exercise_id))
            media = getattr(self, "_media", None)
            if media is None:
                from ..media import MediaServer
                media = self._media = MediaServer()
            return {"url": media.url_for(path), "name": path.name}

    def ex_open_video(self, exercise_id: str) -> dict:
        """Open the video in the system player instead."""
        from .files import open_with_system
        with self._lock:
            open_with_system(self._ex_video(str(exercise_id)))
            return {"ok": True}

    def ex_pick_video(self, exercise_id: str) -> dict:
        """Pick a video with the system dialog and copy it into the vault."""
        window = self._window
        if window is None:
            raise ApiError("Solo disponible en la app de escritorio.")
        import webview
        exts = " ".join(f"*{e}" for e in ExerciseManager.VIDEO_EXTS)
        chosen = window.create_file_dialog(webview.OPEN_DIALOG, file_types=(f"Videos ({exts})",))
        if not chosen:
            return {"ok": False}
        source = Path(chosen[0] if isinstance(chosen, (list, tuple)) else chosen)
        if source.suffix.lower() not in ExerciseManager.VIDEO_EXTS:
            raise ApiError("Eso no es un video.")
        with self._lock:
            mgr = self._ex()
            if not any(e["id"] == exercise_id for e in mgr.exercises()):
                raise ApiError("Ese ejercicio ya no existe.")
            mgr.import_video(str(exercise_id), source)
            return {"ok": True}

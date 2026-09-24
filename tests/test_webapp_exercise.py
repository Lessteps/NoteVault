"""Ejercicio through the web bridge, and the local video streaming server."""

import shutil
import tempfile
import unittest
import urllib.request
from datetime import date
from pathlib import Path

from notevault_app.core.exercise_manager import ExerciseManager
from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestExerciseApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_ex_"))
        self.api = NoteVaultApi(self.dir)
        self.today = date.today().isoformat()

    def tearDown(self):
        media = getattr(self.api, "_media", None)
        if media:
            media.shutdown()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_mark_writes_the_same_log(self):
        day = self.api.ex_days(self.today, self.today)[0]
        ex = day["exercises"][0]
        self.api.ex_mark(self.today, ex["id"], True, "42,5", 8, "fácil")
        entry = ExerciseManager(self.dir).get_log(date.today()).entries[ex["id"]]
        self.assertEqual((entry["done"], entry["weight"], entry["reps"]), (True, 42.5, 8))
        self.assertGreater(self.api.ex_overview()["week"], 0)
        with self.assertRaises(ApiError):
            self.api.ex_mark(self.today, ex["id"], True, "mucho")

    def test_routine_edits(self):
        e = self.api.ex_save("", {"day": "lunes", "name": "Dominadas", "series_reps": "3×8"})
        self.assertTrue(any(x["id"] == e["id"] for x in self.api.ex_list()))
        self.api.ex_save(e["id"], {"day": "martes", "name": "Dominadas lastradas"})
        self.assertEqual(next(x for x in self.api.ex_list() if x["id"] == e["id"])["day"], "martes")
        for bad in ({"day": "festivo"}, {"day": "lunes", "video_path": "C:/secretos.txt"}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.ex_save("", bad)
        self.api.ex_remove(e["id"])
        self.assertFalse(any(x["id"] == e["id"] for x in self.api.ex_list()))

    def test_video_is_streamed_with_ranges(self):
        videos = self.dir / ".notevault" / "ejercicio" / "videos"
        e = self.api.ex_list()[0]
        mgr = ExerciseManager(self.dir)
        videos = mgr.videos_dir
        videos.mkdir(parents=True, exist_ok=True)
        (videos / "clip.mp4").write_bytes(bytes(range(256)) * 40)
        self.api.ex_save(e["id"], {"day": e["day"], "name": e["name"], "video_path": str(videos / "clip.mp4")})
        url = self.api.ex_video_url(e["id"])["url"]
        self.assertTrue(url.startswith("http://127.0.0.1:"))
        req = urllib.request.Request(url, headers={"Range": "bytes=10-19"})
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.status, 206)
            self.assertEqual(r.read(), bytes(range(10, 20)))
        base = url.rsplit("/", 1)[0]
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(base + "/deadbeef")
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(base.rsplit("/", 1)[0] + "/../../etc/passwd")

    def test_missing_video(self):
        e = self.api.ex_save("", {"day": "lunes", "name": "Sin video"})
        with self.assertRaises(ApiError):
            self.api.ex_video_url(e["id"])


if __name__ == "__main__":
    unittest.main()

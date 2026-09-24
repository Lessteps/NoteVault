"""Reproductor de inglés through the bridge: vault media with sibling
subtitles, opaque ids, timestamp links and sentence mining."""

import shutil
import tempfile
import unittest
import urllib.request
from pathlib import Path

from notevault_app.webapp.api import ApiError, NoteVaultApi

EN = "1\n00:00:01,000 --> 00:00:03,000\nHello there.\n\n2\n00:00:04,000 --> 00:00:06,000\n<i>How are you?</i>\n"
ES = "1\n00:00:01,100 --> 00:00:03,000\nHola.\n\n2\n00:00:04,000 --> 00:00:06,000\n¿Cómo estás?\n"


class TestEnglishPlayer(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_player_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        (self.dir / "Pelis").mkdir()
        (self.dir / "Pelis" / "film.mp4").write_bytes(b"\x00" * 2048)
        (self.dir / "Pelis" / "film.en.srt").write_text(EN, encoding="utf-8")
        (self.dir / "Pelis" / "film.es.srt").write_text(ES, encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        self.addCleanup(lambda: getattr(self.api, "_media", None) and self.api._media.shutdown())

    def test_open_pairs_and_streams(self):
        out = self.api.en_player_open("Pelis/film.mp4", 4)
        self.assertEqual([p["en"] for p in out["pairs"]], ["Hello there.", "How are you?"])
        self.assertEqual(out["pairs"][1]["es"], "¿Cómo estás?")
        self.assertEqual(out["seconds"], 4)
        self.assertNotIn(str(self.dir), repr(out))                 # no disk paths reach the page
        with urllib.request.urlopen(out["url"]) as r:
            self.assertEqual(len(r.read()), 2048)
        self.assertEqual(self.api.en_player_open("Pelis/film.mp4")["id"], out["id"])

    def test_confined(self):
        for bad in ("../x.mp4", "/etc/passwd", "C:/x.mp4", "Pelis/film.en.srt"):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.en_player_open(bad)
        with self.assertRaises(ApiError):
            self.api.en_player_pick()                              # no desktop window here

    def test_link_and_mining(self):
        mid = self.api.en_player_open("Pelis/film.mp4")["id"]
        self.assertEqual(self.api.en_player_link(mid, 65)["link"], "[01:05](nv://media?file=Pelis/film.mp4&t=65)")
        out = self.api.en_player_mine(mid, {"sentence": "How are you?", "seconds": 4, "mode": "cloze",
                                            "target": "are", "level": "a2", "reference_es": "¿Cómo estás?"})
        text = (self.dir / out["path"]).read_text(encoding="utf-8")
        self.assertIn("type: exercise", text)
        self.assertIn("How _____ you?", text)
        with self.assertRaises(ApiError):
            self.api.en_player_mine(mid, {"sentence": "  "})
        with self.assertRaises(ApiError):
            self.api.en_player_mine("nope", {"sentence": "x"})


if __name__ == "__main__":
    unittest.main()

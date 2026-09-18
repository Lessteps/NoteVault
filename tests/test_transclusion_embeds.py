"""Tests for transclusion (Phase 5) and attachment kind_of extension."""

import unittest
from pathlib import Path

from notevault_app.core.qt_markdown import expand_transclusions
from notevault_app.core.attachments import kind_of


class TestKindOf(unittest.TestCase):
    def test_image(self):
        self.assertEqual(kind_of(Path("img.png")), "image")

    def test_video(self):
        self.assertEqual(kind_of(Path("clip.mp4")), "video")

    def test_audio_mp3(self):
        self.assertEqual(kind_of(Path("song.mp3")), "audio")

    def test_audio_wav(self):
        self.assertEqual(kind_of(Path("sound.wav")), "audio")

    def test_pdf(self):
        self.assertEqual(kind_of(Path("doc.pdf")), "pdf")

    def test_unknown(self):
        self.assertIsNone(kind_of(Path("file.txt")))


_NOTES = {
    "nota a": "Contenido de la nota A.\n\nSegunda línea.",
    "nota b": "Este es B. ![[Nota A]]",
    "nota c": "# Introduccion\n\nTexto intro.\n\n# Desarrollo\n\nTexto desarrollo.",
}


def _resolve(title: str):
    return _NOTES.get(title.lower())


class TestExpandTransclusions(unittest.TestCase):
    def test_basic_transclusion(self):
        md = "Antes\n\n![[Nota A]]\n\nDespués"
        result = expand_transclusions(md, _resolve)
        self.assertIn("Contenido de la nota A", result)
        self.assertIn("↩ Nota A", result)

    def test_unknown_ref_kept_as_is(self):
        md = "![[Nota Inexistente]]"
        result = expand_transclusions(md, _resolve)
        self.assertIn("![[Nota Inexistente]]", result)

    def test_image_embed_not_transcluded(self):
        md = "![[foto.png]]"
        result = expand_transclusions(md, _resolve)
        self.assertEqual(result, md)   # kept as-is

    def test_circular_reference_does_not_hang(self):
        notes = {
            "a": "![[b]]",
            "b": "![[a]]",
        }
        result = expand_transclusions("![[a]]", lambda t: notes.get(t.lower()))
        # Should not raise or loop forever; may contain circular notice
        self.assertIsInstance(result, str)

    def test_max_depth(self):
        notes = {
            "d1": "![[d2]]",
            "d2": "![[d3]]",
            "d3": "![[d4]]",
            "d4": "deep content",
        }
        result = expand_transclusions("![[d1]]", lambda t: notes.get(t.lower()))
        self.assertIsInstance(result, str)

    def test_heading_extraction(self):
        md = "![[Nota C#Desarrollo]]"
        result = expand_transclusions(md, _resolve)
        self.assertIn("Texto desarrollo", result)
        self.assertNotIn("Texto intro", result)

    def test_no_transclusions_unchanged(self):
        md = "Texto normal [[link]] y más texto."
        result = expand_transclusions(md, _resolve)
        self.assertEqual(result, md)


if __name__ == "__main__":
    unittest.main()

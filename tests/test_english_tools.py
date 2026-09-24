"""English toolset (Phase 7): subtitles, timestamp links, sentence mining and the
player, driven through the real editor and real clicks."""

import math
import shutil
import struct
import tempfile
import time
import unittest
import wave
from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices, QTextCursor
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from notevault_app.core.english import media_links, mining, subtitles
from notevault_app.core.english.subtitles import Cue, SentencePair
from notevault_app.core.practice.exercise_note import parse_exercise
from notevault_app.core.notes_service import NotesService
from notevault_app.core.vault_manager import VaultManager
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor, STACK_PRACTICE

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

SRT = """1
00:00:01,000 --> 00:00:03,500
<i>I've been meaning</i> to tell you
<font color="#ffff00">something.</font>

2
00:00:04,000 --> 00:00:06,000
{\\an8}Tom &amp; Jerry&nbsp;are here.
3
00:00:07,000 --> 00:00:08,000
Missing blank line before this index.

this line has no timing --> nothing

4
00:00:10,000 --> 00:00:09,000
End before start: skipped.

5
00:00:11,000 --> 00:00:12,500
42
"""

VTT = """WEBVTT - demo

NOTE this is a comment
spanning two lines

STYLE
::cue { color: yellow }

intro
00:01.100 --> 00:02.000 align:start position:10%
Hace tiempo que

00:02.050 --> 00:03.400
<c.yellow>quiero decirte</c> algo.

00:00:04.100 --> 00:00:05.900
Tom y Jerry están aquí.
"""


def _wait(ms: int):
    end = time.time() + ms / 1000
    while time.time() < end:
        app.processEvents()
        time.sleep(0.01)


def _write_wav(path: Path, seconds: float = 4.0, rate: int = 8000):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(3000 * math.sin(i / 8)))
                               for i in range(int(rate * seconds))))


class SubtitleParsingTest(unittest.TestCase):
    def test_srt_cleans_tags_and_survives_malformed_blocks(self):
        cues = subtitles.parse_subtitles(SRT)
        self.assertEqual([c.start for c in cues], [1000, 4000, 7000, 11000])
        self.assertEqual(cues[0].text, "I've been meaning to tell you\nsomething.")
        self.assertEqual(cues[0].line, "I've been meaning to tell you something.")
        self.assertEqual(cues[0].end, 3500)
        self.assertEqual(cues[1].text, "Tom & Jerry are here.")
        self.assertEqual(cues[2].text, "Missing blank line before this index.")
        self.assertEqual(cues[3].text, "42")

    def test_vtt_header_notes_styles_ids_and_short_times(self):
        cues = subtitles.parse_subtitles(VTT)
        self.assertEqual([(c.start, c.end) for c in cues],
                         [(1100, 2000), (2050, 3400), (4100, 5900)])
        self.assertEqual(cues[1].text, "quiero decirte algo.")
        self.assertNotIn("color", " ".join(c.text for c in cues))

    def test_crlf_bom_and_garbage(self):
        text = "﻿1\r\n00:00:01,5 --> 00:00:02,25\r\nHi there\r\n\r\n"
        cues = subtitles.parse_subtitles(text)
        self.assertEqual(cues, [Cue(1500, 2250, "Hi there")])
        self.assertEqual(subtitles.parse_subtitles("not a subtitle file\n\n--> \n"), [])
        self.assertEqual(subtitles.parse_subtitles(""), [])

    def test_encodings(self):
        folder = Path(tempfile.mkdtemp(prefix="nv_subs_"))
        try:
            body = "1\n00:00:01,000 --> 00:00:02,000\n¿Qué tal, señora?\n"
            (folder / "a.srt").write_bytes(body.encode("cp1252"))
            (folder / "b.srt").write_bytes(body.encode("utf-8-sig"))
            (folder / "c.srt").write_bytes(body.encode("utf-8"))
            for name in ("a.srt", "b.srt", "c.srt"):
                cues = subtitles.load_subtitles(folder / name)
                self.assertEqual(cues[0].text, "¿Qué tal, señora?", name)
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def test_pairing_by_overlap(self):
        en = subtitles.parse_subtitles(SRT)[:3]
        es = [Cue(1100, 2000, "Hace tiempo que"), Cue(2050, 3400, "quiero decirte algo."),
              Cue(3900, 6100, "Tom y Jerry están aquí."), Cue(20000, 21000, "sin pareja")]
        pairs = subtitles.pair_tracks(en, es)
        self.assertEqual(len(pairs), 3)
        self.assertEqual(pairs[0].es, "Hace tiempo que quiero decirte algo.")
        self.assertEqual(pairs[1].es, "Tom y Jerry están aquí.")
        self.assertEqual(pairs[2].es, "")
        self.assertEqual(subtitles.pair_tracks(en)[0].es, "")
        straddle = [Cue(3000, 4600, "a caballo")]
        self.assertEqual(subtitles.pair_tracks(en, straddle)[1].es, "a caballo")

    def test_cue_lookup(self):
        cues = subtitles.parse_subtitles(SRT)
        self.assertEqual(subtitles.cue_at(cues, 0), -1)
        self.assertEqual(subtitles.cue_at(cues, 1000), 0)
        self.assertEqual(subtitles.cue_at(cues, 3499), 0)
        self.assertEqual(subtitles.cue_at(cues, 3500), -1)
        self.assertEqual(subtitles.cue_before(cues, 3700), 0)
        self.assertEqual(subtitles.cue_at(cues, 4000), 1)
        self.assertEqual(subtitles.cue_at(cues, 99999), -1)
        self.assertEqual(subtitles.cue_before(cues, 99999), 3)
        self.assertEqual(subtitles.cue_at([], 10), -1)

    def test_sibling_subtitles(self):
        folder = Path(tempfile.mkdtemp(prefix="nv_sib_"))
        try:
            media = folder / "My Film.mkv"
            media.write_bytes(b"")
            (folder / "My Film.srt").write_text("x", encoding="utf-8")
            (folder / "My Film.ES.vtt").write_text("x", encoding="utf-8")
            (folder / "Other.en.srt").write_text("x", encoding="utf-8")
            self.assertEqual(subtitles.find_sibling_subtitles(media),
                             (folder / "My Film.srt", folder / "My Film.ES.vtt"))
            (folder / "My Film.en.srt").write_text("x", encoding="utf-8")
            self.assertEqual(subtitles.find_sibling_subtitles(media)[0], folder / "My Film.en.srt")
        finally:
            shutil.rmtree(folder, ignore_errors=True)


class MediaLinkTest(unittest.TestCase):
    def test_round_trip_with_spaces_and_accents(self):
        link = media_links.media_link("Inglés/Películas/The Film (2020).mp4", 83.44)
        self.assertEqual(link, "[01:23](nv://media?file=Ingl%C3%A9s/Pel%C3%ADculas/"
                               "The%20Film%20%282020%29.mp4&t=83.4)")
        url = link[link.index("(") + 1:-1]
        self.assertEqual(media_links.parse_media_url(url),
                         ("Inglés/Películas/The Film (2020).mp4", 83.4))

    def test_parse_variants_and_rejects(self):
        self.assertEqual(media_links.parse_media_url("nv://media?file=a.mp4&t=90"), ("a.mp4", 90.0))
        self.assertEqual(media_links.parse_media_url("nv://media/?file=a.mp4&t=1:02:03"),
                         ("a.mp4", 3723.0))
        self.assertEqual(media_links.parse_media_url("nv://media?file=a.mp4"), ("a.mp4", 0.0))
        self.assertEqual(media_links.parse_media_url("nv://media?file=a.mp4&t=zz"), ("a.mp4", 0.0))
        for bad in ("nv://media?t=3", "https://media?file=a.mp4", "nv://note?file=a.mp4",
                    "nv-note:Foo", "", None):
            self.assertIsNone(media_links.parse_media_url(bad), bad)

    def test_timestamp_format(self):
        self.assertEqual(media_links.format_timestamp(0), "00:00")
        self.assertEqual(media_links.format_timestamp(59.9), "00:59")
        self.assertEqual(media_links.format_timestamp(3725), "1:02:05")

    def test_media_kinds(self):
        self.assertTrue(media_links.is_media_file("x/Film.MKV"))
        self.assertTrue(media_links.is_media_file("a.mp3"))
        self.assertFalse(media_links.is_media_file("a.md"))


class MiningTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_mine_"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_translate_note_parses_as_practice(self):
        text = mining.build_mined_note(
            "No, it's not: \"really\" a big deal.", media_rel="Inglés/Películas/Film.mp4",
            seconds=83.4, reference_es="No es para tanto.")
        ex = parse_exercise(text, Path("x.md"))
        self.assertEqual(ex.frontmatter["type"], "exercise")
        self.assertEqual(ex.subject, "english")
        self.assertEqual(ex.discipline, "english_vocabulary")
        self.assertEqual(ex.mode, "translate")
        self.assertEqual(ex.level, "B1")
        self.assertEqual(ex.note_id, "en.mining.film.83400")
        self.assertIn("[01:23](nv://media?file=Ingl%C3%A9s/Pel%C3%ADculas/Film.mp4&t=83.4)",
                      ex.statement)
        self.assertIn("No, it's not", ex.statement)
        self.assertEqual(len(ex.hints), 2)
        self.assertEqual(len(ex.rubric), 3)
        self.assertIn("**Traducción:**", ex.solution)
        self.assertIn("No es para tanto.", ex.solution)
        self.assertTrue(ex.title.startswith("No, it's not"))

    def test_cloze_note(self):
        text = mining.build_mined_note("I'm looking forward to seeing you.", media_rel="f.mp4",
                                       seconds=5, mode="cloze", target="looking forward", level="c1")
        ex = parse_exercise(text)
        self.assertEqual(ex.mode, "cloze")
        self.assertEqual(ex.level, "C1")
        self.assertIn("I'm _____ to seeing you.", ex.statement)
        self.assertIn("**looking forward**", ex.solution)
        with self.assertRaises(mining.MiningError):
            mining.build_mined_note("Hello there.", media_rel="f.mp4", seconds=1, mode="cloze",
                                    target="goodbye")
        with self.assertRaises(mining.MiningError):
            mining.build_mined_note("   ", media_rel="f.mp4", seconds=1)

    def test_written_in_mining_folder_without_overwriting(self):
        a = mining.write_mined_note(self.dir, "Let's call it a day.", media_rel="f.mp4", seconds=19)
        b = mining.write_mined_note(self.dir, "Let's call it a day.", media_rel="f.mp4", seconds=19)
        self.assertEqual(a.parent, self.dir / "Inglés" / "Minería")
        self.assertNotEqual(a, b)
        self.assertTrue(a.exists() and b.exists())
        self.assertNotIn(":", a.name)


class _EditorCase(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_en_tools_"))
        (self.dir / ".notevault").mkdir()
        self.films = self.dir / "Inglés" / "Películas"
        self.films.mkdir(parents=True)
        self.media = self.films / "Demo clip.wav"
        _write_wav(self.media)
        (self.films / "Demo clip.en.srt").write_text(
            "1\n00:00:00,500 --> 00:00:01,500\nI've been meaning to tell you.\n\n"
            "2\n00:00:02,000 --> 00:00:03,500\nDon't worry, it's not a big deal.\n",
            encoding="utf-8")
        (self.films / "Demo clip.es.srt").write_text(
            "1\n00:00:00,600 --> 00:00:01,400\nQuería decírtelo.\n\n"
            "2\n00:00:02,100 --> 00:00:03,400\nTranquilo, no es para tanto.\n",
            encoding="utf-8")
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.editor = MarkdownEditor(self.vault, self.service)
        self.editor.resize(1100, 800)

    def tearDown(self):
        from notevault_app.ui.components.english import media_player
        win = media_player.player_window()
        if win is not None:
            win.player.stop()
            win.player.setSource(QUrl())
            win.close()
            win.deleteLater()
            media_player._WINDOW = None
        self.editor.deleteLater()
        app.processEvents()
        shutil.rmtree(self.dir, ignore_errors=True)

    def _player(self):
        from notevault_app.ui.components.english import media_player
        return media_player.player_window()


class MinedNoteInEditorTest(_EditorCase):
    def test_mined_note_opens_in_practice_view(self):
        path = mining.write_mined_note(
            self.dir, "Don't worry, it's not a big deal.",
            media_rel="Inglés/Películas/Demo clip.wav", seconds=2.0)
        self.editor.open_note(path)
        app.processEvents()
        self.assertEqual(self.editor._stack.currentIndex(), STACK_PRACTICE)
        self.assertEqual(self.editor._stack.currentIndex(), 4)

    def test_timestamp_link_in_practice_view_opens_player(self):
        path = mining.write_mined_note(
            self.dir, "Don't worry, it's not a big deal.",
            media_rel="Inglés/Películas/Demo clip.wav", seconds=2.0)
        self.editor.open_note(path)
        self.editor.show()
        app.processEvents()
        browser = self.editor._practice._statement
        at = browser.document().find("00:02")
        self.assertFalse(at.isNull())
        cursor = QTextCursor(browser.document())
        cursor.setPosition(at.selectionStart() + 2)
        point = browser.cursorRect(cursor).center()
        self.assertTrue(browser.anchorAt(point).startswith("nv://media"))
        QTest.mouseClick(browser.viewport(), Qt.LeftButton, Qt.NoModifier, point)
        app.processEvents()
        win = self._player()
        self.assertIsNotNone(win)
        self.assertEqual(win.media_path, self.media)


class PlayerTest(_EditorCase):
    def test_nv_media_link_opens_player_at_time(self):
        QDesktopServices.openUrl(QUrl(
            "nv://media?file=Ingl%C3%A9s/Pel%C3%ADculas/Demo%20clip.wav&t=2.5"))
        win = self._player()
        self.assertIsNotNone(win)
        self.assertEqual(win.media_path, self.media)
        self.assertEqual(len(win.pairs), 2)
        self.assertEqual(win.pairs[1].es, "Tranquilo, no es para tanto.")
        _wait(600)
        self.assertGreaterEqual(win.position(), 2400)
        self.assertLessEqual(win.position(), 4000)

    def test_link_click_in_editor_opens_player(self):
        note = self.dir / "Diario.md"
        note.write_text("# Diario\n\nVer [00:02](nv://media?file=Ingl%C3%A9s/Pel%C3%ADculas/"
                        "Demo%20clip.wav&t=2) otra vez.\n", encoding="utf-8")
        self.editor.open_note(note)
        self.editor.show()
        app.processEvents()
        rich = self.editor._rich
        self.assertIs(self.editor._stack.currentWidget(), rich)
        at = rich.document().find("00:02")
        self.assertFalse(at.isNull())
        cursor = QTextCursor(rich.document())
        cursor.setPosition(at.selectionStart() + 2)
        point = rich.cursorRect(cursor).center()
        self.assertTrue(rich.anchorAt(point).startswith("nv://media"))
        QTest.mouseClick(rich.viewport(), Qt.LeftButton, Qt.NoModifier, point)
        win = self._player()
        self.assertIsNotNone(win)
        self.assertEqual(win.media_path, self.media)

    def test_media_file_opens_in_player_not_as_note(self):
        tabs = len(self.editor._open)
        self.editor.open_note(self.media)
        self.assertEqual(len(self.editor._open), tabs)
        self.assertEqual(self._player().media_path, self.media)

    def test_sentence_click_and_mining_through_the_ui(self):
        opened = []
        from notevault_app.ui.components.english.media_player import open_media_player
        win = open_media_player(self.media, None, self.dir, opened.append, autoplay=False)
        win.resize(1200, 760)
        _wait(300)
        self.assertEqual(win.sentences.count(), 2)
        rect = win.sentences.visualItemRect(win.sentences.item(1))
        QTest.mouseClick(win.sentences.viewport(), Qt.LeftButton, Qt.NoModifier, rect.center())
        self.assertEqual(win._current, 1)
        self.assertLess(abs(win.position() - 2000), 400)
        win.player.pause()

        QTest.mouseClick(win.mine_btn, Qt.LeftButton)
        dialog = win._mine_dialog
        self.assertTrue(dialog.isVisible())
        self.assertEqual(dialog.sentence.text(), "Don't worry, it's not a big deal.")
        QTest.mouseClick(dialog.cloze_rb, Qt.LeftButton)
        QTest.keyClicks(dialog.target, "big deal")
        QTest.mouseClick(dialog.create_btn, Qt.LeftButton)
        notes = list((self.dir / "Inglés" / "Minería").glob("*.md"))
        self.assertEqual(len(notes), 1)
        self.assertEqual(opened, notes)
        ex = parse_exercise(notes[0].read_text(encoding="utf-8"), notes[0])
        self.assertEqual(ex.mode, "cloze")
        self.assertIn("it's not a _____.", ex.statement)
        self.assertIn("Demo%20clip.wav&t=2", ex.statement)

    def test_toggles_and_navigation_buttons(self):
        from notevault_app.ui.components.english.media_player import open_media_player
        win = open_media_player(self.media, None, self.dir, autoplay=False)
        _wait(300)
        win.seek_ms(2200)
        self.assertEqual(win.sub_en.text(), "Don't worry, it's not a big deal.")
        self.assertEqual(win.sub_es.text(), "Tranquilo, no es para tanto.")
        QTest.mouseClick(win.es_toggle, Qt.LeftButton)
        self.assertEqual(win.sub_es.text(), "")
        QTest.mouseClick(win.en_toggle, Qt.LeftButton)
        self.assertEqual(win.sub_en.text(), "")
        QTest.mouseClick(win.prev_btn, Qt.LeftButton)
        self.assertEqual(win._current, 0)
        QTest.mouseClick(win.next_btn, Qt.LeftButton)
        self.assertEqual(win._current, 1)
        win.player.pause()
        QTest.mouseClick(win.shadow_btn, Qt.LeftButton)
        self.assertTrue(win.shadow_panel.isVisibleTo(win))
        self.assertFalse(win.continue_btn.isEnabled())


if __name__ == "__main__":
    unittest.main()

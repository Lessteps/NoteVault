"""Tests for backlinks/mentions: clickable rows that jump to the line, and
automatic refresh after a note is saved."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication, QPushButton
from PySide6.QtCore import Qt

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestBacklinks(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_bl_"))
        (self.dir / "Target.md").write_text("# Target\n\ncuerpo\n", encoding="utf-8")
        (self.dir / "Source.md").write_text(
            "# Source\n\nlinea dos\nenlaza a [[Target]] aqui\n", encoding="utf-8")
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.editor = MarkdownEditor(self.vault, self.service)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _target_note(self):
        return next(n for n in self.service.index.notes() if n.title == "Target")

    def test_mentions_detects_link_and_line(self):
        linked, unlinked = self.service.mentions(self._target_note())
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0].title, "Source")
        self.assertEqual(linked[0].line_no, 4)   # the [[Target]] line

    def test_row_click_emits_path_and_line(self):
        linked, unlinked = self.service.mentions(self._target_note())
        foot = self.editor._mentions
        foot._show_results(foot._generation, linked, unlinked)

        received = []
        foot.open_requested.connect(lambda p, ln: received.append((Path(p), ln)))

        btns = self._buttons(foot._body)
        rows = [b for b in btns if "·" in b.text()]
        self.assertTrue(rows)
        rows[0].click()

        self.assertEqual(len(received), 1)
        self.assertEqual(received[0][0], self.dir / "Source.md")
        self.assertEqual(received[0][1], 4)

    def test_open_from_mention_jumps_to_line(self):
        # Opening via a mention should switch to the note and place the cursor
        # on the given line without raising.
        self.editor._open_from_mention(self.dir / "Source.md", 4)
        self.assertEqual(self.editor.current_path(), self.dir / "Source.md")

    def test_save_schedules_mentions_refresh(self):
        self.editor.open_note(self.dir / "Target.md")
        self.assertFalse(self.editor._mentions_refresh.isActive())
        self.editor.note_saved.emit(self.dir / "Target.md")
        self.assertTrue(self.editor._mentions_refresh.isActive())

    def test_wikilink_plain_click_follows(self):
        # A plain left-click (no Ctrl) on a [[wikilink]] must follow it now.
        from PySide6.QtGui import QMouseEvent
        from PySide6.QtCore import QPointF, QEvent
        from notevault_app.ui.components.notes.note_view import NoteTextEdit

        edit = NoteTextEdit()
        edit.load_markdown("ver [[Target]] aqui")
        fired = []
        edit.note_link_activated.connect(fired.append)
        # Pretend the cursor under the click sits on the wikilink.
        edit._wikilink_under = lambda pos: "Target"
        ev = QMouseEvent(QEvent.MouseButtonPress, QPointF(5, 5),
                         Qt.LeftButton, Qt.LeftButton, Qt.NoModifier)
        self.assertTrue(edit._follow_wikilink(ev))
        self.assertEqual(fired, ["Target"])

    def _buttons(self, layout):
        out = []
        for i in range(layout.count()):
            it = layout.itemAt(i)
            w = it.widget()
            if isinstance(w, QPushButton):
                out.append(w)
            elif w is not None:
                out.extend(w.findChildren(QPushButton))
            elif it.layout():
                out.extend(self._buttons(it.layout()))
        return out


    def test_mentions_detects_subfolder_and_ext_links(self):
        (self.dir / "Subfolder").mkdir(exist_ok=True)
        (self.dir / "OtherSource.md").write_text(
            "# Other\n\nEnlace: [[Subfolder/Target.md]]\n", encoding="utf-8")
        self.service.index.clear()
        linked, unlinked = self.service.mentions(self._target_note())
        titles = [m.title for m in linked]
        self.assertIn("OtherSource", titles)

    def test_mentions_space_underscore_equivalence(self):
        """[[Note Name]] should match a file called Note_Name.md (Obsidian compat)."""
        (self.dir / "Note_With_Underscores.md").write_text(
            "# Note With Underscores\n\ncuerpo\n", encoding="utf-8")
        (self.dir / "Linker.md").write_text(
            "# Linker\n\nVer [[Note With Underscores]] aqui\n", encoding="utf-8")
        self.vault = type(self.vault)(self.dir)
        self.service = type(self.service)(self.vault)
        target = next(n for n in self.service.index.notes()
                      if n.path.name == "Note_With_Underscores.md")
        from notevault_app.core.vault_manager import Note as VNote
        note = VNote(target.path, self.dir)
        linked, _ = self.service.mentions(note)
        titles = [m.title for m in linked]
        self.assertIn("Linker", titles)

    def test_mentions_underscore_in_link_matches_spaced_file(self):
        """[[Note_Name]] should match a file called 'Note Name.md'."""
        (self.dir / "Note Name.md").write_text(
            "# Note Name\n\ncuerpo\n", encoding="utf-8")
        (self.dir / "Linker2.md").write_text(
            "# Linker2\n\nVer [[Note_Name]] aqui\n", encoding="utf-8")
        self.vault = type(self.vault)(self.dir)
        self.service = type(self.service)(self.vault)
        target = next(n for n in self.service.index.notes()
                      if n.path.name == "Note Name.md")
        from notevault_app.core.vault_manager import Note as VNote
        note = VNote(target.path, self.dir)
        linked, _ = self.service.mentions(note)
        titles = [m.title for m in linked]
        self.assertIn("Linker2", titles)

    def _reload(self):
        """Rebuild vault + service so the index re-reads the temp dir."""
        self.vault = type(self.vault)(self.dir)
        self.service = type(self.service)(self.vault)

    def _note(self, filename):
        from notevault_app.core.vault_manager import Note as VNote
        return VNote(self.dir / filename, self.dir)

    def test_mentions_detects_inline_alias_link(self):
        """[[D1]] should match a note whose frontmatter has aliases: [D1]."""
        (self.dir / "1.Problem_Statement.md").write_text(
            "---\ntitle: Problem Statement\naliases: [D1, PS]\n---\n# PS\n",
            encoding="utf-8")
        (self.dir / "Roadmap.md").write_text(
            "# Roadmap\n\nEmpezar por [[D1]] y luego seguir\n", encoding="utf-8")
        self._reload()
        linked, _ = self.service.mentions(self._note("1.Problem_Statement.md"))
        self.assertIn("Roadmap", [m.title for m in linked])

    def test_mentions_detects_frontmatter_title_link(self):
        """[[Problem Statement]] should match a file 1.Problem_Statement.md
        whose frontmatter title is 'Problem Statement'."""
        (self.dir / "1.Problem_Statement.md").write_text(
            "---\ntitle: Problem Statement\n---\n# PS\n", encoding="utf-8")
        (self.dir / "Index.md").write_text(
            "# Index\n\nVer [[Problem Statement]]\n", encoding="utf-8")
        self._reload()
        linked, _ = self.service.mentions(self._note("1.Problem_Statement.md"))
        self.assertIn("Index", [m.title for m in linked])

    def test_mentions_detects_block_style_aliases(self):
        (self.dir / "Core.md").write_text(
            "---\naliases:\n  - Nucleo\n  - Kernel\n---\n# Core\n", encoding="utf-8")
        (self.dir / "Ref.md").write_text(
            "# Ref\n\nBasado en [[Kernel]]\n", encoding="utf-8")
        self._reload()
        linked, _ = self.service.mentions(self._note("Core.md"))
        self.assertIn("Ref", [m.title for m in linked])

    def test_get_backlinks_delegates_to_mentions(self):
        """VaultManager.get_backlinks must find alias-based backlinks too."""
        (self.dir / "Alpha.md").write_text(
            "---\naliases: [A1]\n---\n# Alpha\n", encoding="utf-8")
        (self.dir / "Beta.md").write_text(
            "# Beta\n\nDepende de [[A1]]\n", encoding="utf-8")
        self._reload()
        backlinks = self.vault.get_backlinks(self._note("Alpha.md"))
        self.assertIn("Beta", [n.title for n in backlinks])

    def test_resolve_link_exact_wins_over_partial(self):
        (self.dir / "Plan.md").write_text("# Plan\n", encoding="utf-8")
        (self.dir / "Planning_Doc.md").write_text("# Planning Doc\n", encoding="utf-8")
        self._reload()
        note = self.vault.resolve_link("Plan")
        self.assertIsNotNone(note)
        self.assertEqual(note.path.name, "Plan.md")

    def test_resolve_link_by_alias(self):
        (self.dir / "1.Problem_Statement.md").write_text(
            "---\naliases: [D1]\n---\n# PS\n", encoding="utf-8")
        self._reload()
        note = self.vault.resolve_link("D1")
        self.assertIsNotNone(note)
        self.assertEqual(note.path.name, "1.Problem_Statement.md")

    def test_attachments_folder_notes_are_not_indexed(self):
        """A .md copy living inside a note's attachments/ folder must never be
        indexed as a note, or it shows up as a phantom note and a duplicate
        backlink (real bug seen in the FULLSTACK vault)."""
        att = self.dir / "attachments"
        att.mkdir()
        (att / "Copy.md").write_text("# Copy\n\n[[Target]]\n", encoding="utf-8")
        self._reload()
        names = [p.name for p in self.vault.note_paths()]
        self.assertNotIn("Copy.md", names)
        linked, _ = self.service.mentions(self._note("Target.md"))
        self.assertNotIn("Copy", [m.title for m in linked])

    def test_prepare_for_reading_shows_only_filename(self):
        from notevault_app.core.qt_markdown import prepare_for_reading
        src = "1. [[PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement.md]] (D1)\n2. [[path/to/note.md|Mi Alias]]"
        res = prepare_for_reading(src)
        self.assertIn("[1.Problem_Statement.md](<nv-note:PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement.md>)", res)
        self.assertIn("[Mi Alias](<nv-note:path/to/note.md>)", res)

    def test_clean_mention_line_shows_only_filename(self):
        line = "1. [[PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement.md]] (D1)"
        cleaned = self.editor._mentions._clean_mention_line(line)
        self.assertEqual(cleaned, "1. [[1.Problem_Statement.md]] (D1)")

    def test_highlighter_wikilink_collapsing(self):
        from notevault_app.ui.components.notes.note_view import NoteSourceEdit
        edit = NoteSourceEdit()
        edit.setPlainText("Line 0: [[folder/file.md]]\nLine 1: [[folder2/file2.md]]")
        hl = edit._highlighter

        # Block 0 active, block 1 inactive
        hl.active_block = 0
        hl.rehighlight()
        b0_fmts = hl.document().findBlockByNumber(0).layout().formats()
        b1_fmts = hl.document().findBlockByNumber(1).layout().formats()
        # Active line has 1 format (full link), inactive line has 3 (hide, show, hide)
        self.assertEqual(len(b0_fmts), 1)
        self.assertEqual(len(b1_fmts), 3)

        # Now switch active block to 1
        hl.active_block = 1
        hl.rehighlight()
        b0_fmts_after = hl.document().findBlockByNumber(0).layout().formats()
        b1_fmts_after = hl.document().findBlockByNumber(1).layout().formats()
        self.assertEqual(len(b0_fmts_after), 3)
        self.assertEqual(len(b1_fmts_after), 1)

    def test_highlighter_simple_wikilink_hides_brackets(self):
        from notevault_app.ui.components.notes.note_view import NoteSourceEdit
        edit = NoteSourceEdit()
        edit.setPlainText("Line 0: [[Note.md]]\nLine 1: [[Note2.md]]")
        hl = edit._highlighter

        hl.active_block = 0
        hl.rehighlight()
        b0_fmts = hl.document().findBlockByNumber(0).layout().formats()
        b1_fmts = hl.document().findBlockByNumber(1).layout().formats()
        # Active line: 1 format (full [[Note.md]] shown as one colored span)
        self.assertEqual(len(b0_fmts), 1)
        # Inactive line: 3 formats (hide "[[", show "Note2.md", hide "]]")
        self.assertEqual(len(b1_fmts), 3)

    def test_linkify_mention_replaces_unlinked_word(self):
        doc = self.dir / "UnlinkedDoc.md"
        doc.write_text("Hello world\nThis refers to Target and nothing else\nGoodbye", encoding="utf-8")
        self.service.index.update(doc, doc.read_text(encoding="utf-8"))

        ok = self.service.linkify_mention(doc, 2, "Target")
        self.assertTrue(ok)
        new_text = doc.read_text(encoding="utf-8")
        self.assertIn("This refers to [[Target]] and nothing else", new_text)

        # After linkifying, target mentions should show it as linked
        target_note = self._target_note()
        linked, unlinked = self.service.mentions(target_note)
        self.assertTrue(any(Path(m.path) == doc and m.linked for m in linked))

    def test_linkify_mention_handles_spaces_and_underscores(self):
        doc = self.dir / "DocWithUnder.md"
        doc.write_text("Line 1\nMentioning Note_Name here\nLine 3", encoding="utf-8")
        self.service.index.update(doc, doc.read_text(encoding="utf-8"))

        ok = self.service.linkify_mention(doc, 2, "Note Name")
        self.assertTrue(ok)
        new_text = doc.read_text(encoding="utf-8")
        self.assertIn("[[Note Name]]", new_text)

    def test_mentions_footer_unlinked_row_has_link_button(self):
        from notevault_app.ui.components.notes.markdown_editor import _MentionsFooter
        from PySide6.QtWidgets import QPushButton
        footer = _MentionsFooter(self.service)
        target = self.dir / "Target.md"
        footer.load(target)
        from notevault_app.core.notes_service import Mention
        unlinked_m = Mention(self.dir / "A.md", "A", 1, "Mentioning Target plainly", False)
        row = footer._row(unlinked_m)
        btns = row.findChildren(QPushButton)
        btn_labels = [b.text() for b in btns]
        self.assertIn("Enlazar", btn_labels)

    def test_markdown_editor_lifecycle_methods(self):
        from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor
        editor = MarkdownEditor(self.vault, self.service)
        note = self.dir / "Target.md"
        editor.open_note(note)
        self.assertEqual(editor.current_note().path, note)

        # on_note_moved updates open tab
        new_path = self.dir / "Target_Renamed.md"
        editor.on_note_moved(note, new_path)
        self.assertEqual(editor.current_note().path, new_path)

        # on_note_deleted closes open tab
        editor.on_note_deleted(new_path)
        self.assertIsNone(editor.current_note())

    def test_nested_deliverable_folders_backlinks_and_transclusions(self):
        """E1 Regression Test: Verify that notes in deeply nested deliverable folders
        (mirroring FULLSTACK_DEVELOPMENT structure) are indexed, their backlinks
        are detected, and ![[note]] transclusions expand properly without broken image errors.
        """
        sub = self.dir / "PHASE_0_PROBLEM_RECOGNITION" / "1.Problem_Statement"
        sub.mkdir(parents=True, exist_ok=True)

        target_file = sub / "example_step_1_problem_statement.md"
        target_file.write_text(
            "# Example Step 1 Problem Statement\n\nContenido de ejemplo transcluido.\n",
            encoding="utf-8"
        )

        source_file = sub / "1.Problem_Statement.md"
        source_file.write_text(
            "# 1. Problem Statement\n\n![[example_step_1_problem_statement]]\n\nVer [[example_step_1_problem_statement]]\n",
            encoding="utf-8"
        )

        self._reload()
        all_notes = list(self.vault.note_paths())
        self.assertIn(target_file, all_notes)
        self.assertIn(source_file, all_notes)

        # Check backlinks detection
        from notevault_app.core.vault_manager import Note as VNote
        target_vnote = VNote(target_file, self.dir)
        linked, unlinked = self.service.mentions(target_vnote)
        linked_titles = [m.title for m in linked]
        self.assertIn("1.Problem_Statement", linked_titles)

        # Check transclusion expansion in editor
        from notevault_app.core.qt_markdown import expand_transclusions
        editor = MarkdownEditor(self.vault, self.service)
        expanded = expand_transclusions(source_file.read_text(encoding="utf-8"), editor._resolve_transclude)
        self.assertIn("Contenido de ejemplo transcluido", expanded)
        self.assertNotIn("No se encuentra el adjunto", expanded)

    def test_mentions_middle_click_opens_new_tab(self):
        """Middle-clicking a mention row button must emit open_in_new_tab_requested."""
        linked, unlinked = self.service.mentions(self._target_note())
        foot = self.editor._mentions
        foot._show_results(foot._generation, linked, unlinked)

        received_new_tab = []
        foot.open_in_new_tab_requested.connect(lambda p, ln: received_new_tab.append((Path(p), ln)))

        btns = self._buttons(foot._body)
        rows = [b for b in btns if "·" in b.text()]
        self.assertTrue(rows)

        # Simulate middle-click on the mention button
        from PySide6.QtGui import QMouseEvent
        from PySide6.QtCore import QPointF, QEvent
        ev = QMouseEvent(QEvent.MouseButtonPress, QPointF(5, 5),
                         Qt.MiddleButton, Qt.MiddleButton, Qt.NoModifier)
        rows[0].mousePressEvent(ev)

        self.assertEqual(len(received_new_tab), 1)
        self.assertEqual(received_new_tab[0][0], self.dir / "Source.md")

    def test_markdown_editor_open_note_new_tab(self):
        """Opening a note with new_tab=True creates a second open tab for the same file."""
        note_p = self.dir / "Target.md"
        self.editor.open_note(note_p)
        self.assertEqual(len(self.editor._open), 1)

        # Normal open_note reuses tab
        self.editor.open_note(note_p, new_tab=False)
        self.assertEqual(len(self.editor._open), 1)

        # open_note_new_tab creates new tab
        self.editor.open_note_new_tab(note_p)
        self.assertEqual(len(self.editor._open), 2)

    def test_tree_middle_click_emits_new_tab(self):
        """Middle-clicking an item in NotesSidebar tree emits note_selected_new_tab."""
        from notevault_app.ui.components.notes.notes_sidebar import NotesSidebar
        from PySide6.QtGui import QMouseEvent
        from PySide6.QtCore import QPointF, QEvent

        sidebar = NotesSidebar(self.vault, self.service)
        sidebar.populate_tree()

        received = []
        sidebar.note_selected_new_tab.connect(received.append)

        # Find Target.md item in the tree
        target_item = sidebar._find_item(self.dir / "Target.md")
        self.assertIsNotNone(target_item)

        # Tree rect for item
        rect = sidebar._tree.visualItemRect(target_item)
        ev = QMouseEvent(QEvent.MouseButtonPress, QPointF(rect.center().x(), rect.center().y()),
                         Qt.MiddleButton, Qt.MiddleButton, Qt.NoModifier)
        sidebar._tree.mousePressEvent(ev)

        self.assertEqual(len(received), 1)
        self.assertEqual(received[0], self.dir / "Target.md")


if __name__ == "__main__":
    unittest.main()

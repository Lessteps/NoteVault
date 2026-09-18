"""Tests for core/tag_index.py (Phase 3)."""

import unittest
from dataclasses import dataclass
from pathlib import Path

from notevault_app.core.tag_index import TagIndex, _extract_inline_tags, _extract_fm_tags


@dataclass
class _FakeNote:
    path: Path
    title: str
    text: str
    lower: str = ""

    def __post_init__(self):
        self.lower = self.text.lower()


def _note(name: str, text: str) -> _FakeNote:
    return _FakeNote(path=Path(f"/vault/{name}.md"), title=name, text=text)


class TestExtractInlineTags(unittest.TestCase):
    def test_basic_tag(self):
        self.assertIn("python", _extract_inline_tags("Hello #python world"))

    def test_multiple_tags(self):
        tags = _extract_inline_tags("#math #algebra and #calculus")
        self.assertEqual(set(tags), {"math", "algebra", "calculus"})

    def test_tag_in_code_fence_ignored(self):
        text = "```\n#not-a-tag\n```\nreal #tag"
        tags = _extract_inline_tags(text)
        self.assertIn("tag", tags)
        self.assertNotIn("not-a-tag", tags)

    def test_no_tag_inside_word(self):
        tags = _extract_inline_tags("color#red")
        self.assertNotIn("red", tags)

    def test_empty_body(self):
        self.assertEqual(_extract_inline_tags(""), [])


class TestExtractFmTags(unittest.TestCase):
    def test_inline_list(self):
        fm = "title: T\ntags: [math, science]"
        self.assertEqual(set(_extract_fm_tags(fm)), {"math", "science"})

    def test_yaml_list(self):
        fm = "title: T\ntags:\n  - python\n  - code"
        self.assertEqual(set(_extract_fm_tags(fm)), {"python", "code"})

    def test_single_tag(self):
        fm = "tags: soltag"
        self.assertIn("soltag", _extract_fm_tags(fm))

    def test_no_tags_field(self):
        fm = "title: T\ndate: 2024-01-01"
        self.assertEqual(_extract_fm_tags(fm), [])


class TestTagIndexBuild(unittest.TestCase):
    def _build(self, notes):
        idx = TagIndex()
        idx.build(notes)
        return idx

    def test_indexes_body_tags(self):
        n = _note("note1", "---\ntitle: T\n---\n\nHello #python")
        idx = self._build([n])
        self.assertIn(Path("/vault/note1.md"), idx.paths_for_tag("python"))

    def test_indexes_frontmatter_tags(self):
        n = _note("note2", "---\ntitle: T\ntags: [math]\n---\n\nBody")
        idx = self._build([n])
        self.assertIn(Path("/vault/note2.md"), idx.paths_for_tag("math"))

    def test_repeated_tag_counts_once_per_note(self):
        n = _note("note3", "---\ntags: [python]\n---\n\n#python #python")
        idx = self._build([n])
        paths = idx.paths_for_tag("python")
        self.assertEqual(len(paths), 1)

    def test_all_tags_sorted_by_count(self):
        notes = [
            _note("a", "---\ntags: [x]\n---\n"),
            _note("b", "---\ntags: [x]\n---\n"),
            _note("c", "---\ntags: [y]\n---\n"),
        ]
        idx = self._build(notes)
        tags = [t for t, _ in idx.all_tags_sorted()]
        self.assertEqual(tags[0], "x")

    def test_tags_for_path(self):
        n = _note("n", "---\ntags: [a, b]\n---\n\n#c")
        idx = self._build([n])
        tags = set(idx.tags_for_path(Path("/vault/n.md")))
        self.assertIn("a", tags)
        self.assertIn("b", tags)
        self.assertIn("c", tags)


if __name__ == "__main__":
    unittest.main()

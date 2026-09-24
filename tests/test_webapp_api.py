"""The web UI's Python bridge: behaviour, and above all that nothing a page
sends can reach outside the vault or into NoteVault's internal folders."""

import json
import os
import shutil
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from notevault_app.webapp.api import ApiError, NoteVaultApi, public_methods
from notevault_app.webapp.devserver import serve_in_thread

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


class ApiTestBase(unittest.TestCase):
    def setUp(self):
        self.base = Path(tempfile.mkdtemp(prefix="nv_web_"))
        self.dir = self.base / "vault"
        self.dir.mkdir()
        (self.dir / "Programación").mkdir()
        (self.dir / "Programación" / "Spec.md").write_text(
            "---\nstatus: in-progress\ndue: 2025-03-30\ntags: [python, api]\n---\n"
            "# Spec\n\nVer [[Target]].\n", encoding="utf-8")
        (self.dir / "Target.md").write_text("# Target\n\ncuerpo\n", encoding="utf-8")
        (self.dir / "Programación" / "script.py").write_text("print(1)\n", encoding="utf-8")
        (self.dir / "attachments").mkdir()
        (self.dir / "attachments" / "pic.png").write_bytes(PNG_1PX)
        (self.dir / "attachments" / "notes.txt").write_text("x", encoding="utf-8")
        (self.dir / ".trash").mkdir()
        (self.dir / ".trash" / "old.md").write_text("secret", encoding="utf-8")
        # A file next to the vault, which must never be reachable.
        (self.base / "outside.md").write_text("outside", encoding="utf-8")
        (self.base / "outside.png").write_bytes(PNG_1PX)
        self.api = NoteVaultApi(self.dir)

    def tearDown(self):
        shutil.rmtree(self.base, ignore_errors=True)


class TestApiBehaviour(ApiTestBase):
    def test_list_root_folders_first_and_hides_internal(self):
        names = [e["name"] for e in self.api.list_dir("")]
        self.assertEqual(names[0], "Programación")
        self.assertIn("Target", names)
        self.assertNotIn(".trash", names)
        self.assertNotIn("attachments", names)
        folder = self.api.list_dir("")[0]
        self.assertEqual(folder["type"], "folder")
        self.assertTrue(folder["has_children"])

    def test_list_subfolder_paths_are_vault_relative(self):
        entries = self.api.list_dir("Programación")
        paths = {e["path"] for e in entries}
        self.assertIn("Programación/Spec.md", paths)
        self.assertIn("Programación/script.py", paths)

    def test_read_note_splits_frontmatter_and_is_json_safe(self):
        note = self.api.read_note("Programación/Spec.md")
        self.assertEqual(note["title"], "Spec")
        self.assertEqual(note["frontmatter"]["status"], "in-progress")
        self.assertEqual(note["frontmatter"]["tags"], ["python", "api"])
        self.assertTrue(note["body"].startswith("# Spec"))
        json.dumps(note)   # every value must serialise

    def test_write_round_trip_is_byte_identical(self):
        raw = "---\na: 1\n---\n# T\r\n\r\nline with CRLF\r\n- [x] done\n"
        res = self.api.write_note("Target.md", raw)
        self.assertTrue(res["ok"])
        self.assertEqual((self.dir / "Target.md").read_bytes(), raw.encode("utf-8"))
        self.assertEqual(self.api.read_note("Target.md")["raw"], raw)

    def test_write_detects_external_change(self):
        note = self.api.read_note("Target.md")
        os.utime(self.dir / "Target.md", (1, 1))       # someone else touched it
        res = self.api.write_note("Target.md", "new", note["modified"])
        self.assertFalse(res["ok"])
        self.assertTrue(res["conflict"])
        self.assertEqual((self.dir / "Target.md").read_text(encoding="utf-8"),
                         "# Target\n\ncuerpo\n")

    def test_write_with_matching_mtime_saves(self):
        note = self.api.read_note("Target.md")
        res = self.api.write_note("Target.md", "new", note["modified"])
        self.assertTrue(res["ok"])

    def test_create_rename_move_delete_to_trash(self):
        created = self.api.create_note("Nueva", "Programación")["path"]
        self.assertEqual(created, "Programación/Nueva.md")
        renamed = self.api.rename(created, "Renombrada")["path"]
        self.assertEqual(renamed, "Programación/Renombrada.md")
        moved = self.api.move(renamed, "")["path"]
        self.assertEqual(moved, "Renombrada.md")
        self.api.delete(moved)
        self.assertFalse((self.dir / "Renombrada.md").exists())
        self.assertTrue((self.dir / ".trash" / "Renombrada.md").exists())

    def test_folder_cannot_move_into_itself(self):
        self.api.create_folder("Sub", "Programación")
        with self.assertRaises(ApiError):
            self.api.move("Programación", "Programación/Sub")

    def test_resolve_link_and_mentions(self):
        self.assertEqual(self.api.resolve_link("Target")["path"], "Target.md")
        self.assertIsNone(self.api.resolve_link("Nope")["path"])
        linked = self.api.mentions("Target.md")["linked"]
        self.assertEqual([m["path"] for m in linked], ["Programación/Spec.md"])

    def test_search_and_bookmarks(self):
        hits = self.api.search("cuerpo")
        self.assertTrue(any(h["path"] == "Target.md" for h in hits))
        self.assertTrue(self.api.toggle_bookmark("Target.md")["bookmarked"])
        self.assertEqual([b["path"] for b in self.api.bookmarks()], ["Target.md"])
        self.assertFalse(self.api.toggle_bookmark("Target.md")["bookmarked"])

    def test_read_attachment_image(self):
        res = self.api.read_attachment("Target.md", "pic.png")
        self.assertTrue(res["data_url"].startswith("data:image/png;base64,"))


class TestApiSecurity(ApiTestBase):
    """Paths come from a web page; treat every one as hostile."""

    ESCAPES = [
        "../outside.md", "Programación/../../outside.md", "..\\outside.md",
        "/etc/passwd", "C:/Windows/win.ini", "c:\\windows\\win.ini",
        "\\\\server\\share\\x.md", "Target.md\x00.png",
    ]

    def test_reads_cannot_escape_the_vault(self):
        for p in self.ESCAPES:
            with self.subTest(p=p), self.assertRaises(ApiError):
                self.api.read_note(p)

    def test_writes_cannot_escape_the_vault(self):
        for p in self.ESCAPES:
            with self.subTest(p=p), self.assertRaises(ApiError):
                self.api.write_note(p, "pwned")
        self.assertEqual((self.base / "outside.md").read_text(), "outside")

    def test_other_operations_cannot_escape(self):
        for call in (lambda: self.api.list_dir("../"),
                     lambda: self.api.delete("../outside.md"),
                     lambda: self.api.rename("../outside.md", "x"),
                     lambda: self.api.move("Target.md", "../"),
                     lambda: self.api.create_note("x", "../"),
                     lambda: self.api.toggle_bookmark("../outside.md")):
            with self.assertRaises(ApiError):
                call()
        self.assertTrue((self.base / "outside.md").exists())

    def test_internal_folders_are_off_limits(self):
        for call in (lambda: self.api.read_note(".trash/old.md"),
                     lambda: self.api.write_note(".notevault/x.md", "x"),
                     lambda: self.api.list_dir(".trash"),
                     lambda: self.api.create_folder(".hidden")):
            with self.assertRaises(ApiError):
                call()

    @unittest.skipIf(os.name == "nt", "symlinks need privileges on Windows")
    def test_symlink_out_of_vault_is_refused(self):
        (self.dir / "link.md").symlink_to(self.base / "outside.md")
        with self.assertRaises(ApiError):
            self.api.read_note("link.md")
        with self.assertRaises(ApiError):
            self.api.write_note("link.md", "pwned")
        self.assertEqual((self.base / "outside.md").read_text(), "outside")

    def test_only_notes_and_existing_code_are_written(self):
        for p in ("evil.exe", "evil.bat", "x.html", "Programación/new.py"):
            with self.subTest(p=p), self.assertRaises(ApiError):
                self.api.write_note(p, "x")
        self.assertTrue(self.api.write_note("Programación/script.py", "print(2)\n")["ok"])

    def test_attachments_are_confined_and_image_only(self):
        for name in ("../outside.png", str(self.base / "outside.png"),
                     "/etc/passwd", "notes.txt"):
            with self.subTest(name=name), self.assertRaises(ApiError):
                self.api.read_attachment("Target.md", name)

    def test_open_external_only_web_and_mail(self):
        from unittest import mock
        with mock.patch("notevault_app.webapp.api.webbrowser.open") as opened:
            self.assertTrue(self.api.open_external("https://example.com/x")["ok"])
            self.api.open_external("mailto:a@b.c")
            for bad in ("file:///etc/passwd", "javascript:alert(1)",
                        "C:/Windows/system32/calc.exe", "http:///nohost", ""):
                with self.subTest(bad=bad), self.assertRaises(ApiError):
                    self.api.open_external(bad)
            self.assertEqual(opened.call_count, 2)

    def test_note_index_lists_notes_not_internal(self):
        paths = {n["path"] for n in self.api.note_index()}
        self.assertIn("Programación/Spec.md", paths)
        self.assertNotIn(".trash/old.md", paths)

    def test_resolve_link_never_points_outside(self):
        self.assertIsNone(self.api.resolve_link("../outside")["path"])
        self.assertIsNone(self.api.resolve_link("../outside.md")["path"])

    def test_closing_waits_for_unsaved_notes_once(self):
        from unittest import mock
        window = mock.Mock()
        self.api._attach_window(window)
        self.assertTrue(self.api._on_closing())          # nothing unsaved
        self.api.set_unsaved(2)
        self.assertFalse(self.api._on_closing())         # flush first
        import time
        for _ in range(50):
            if window.run_js.called:
                break
            time.sleep(0.01)
        window.run_js.assert_called_once()
        self.assertTrue(self.api._on_closing())          # second request closes

    def test_no_public_state_for_pywebview_to_walk(self):
        public_attrs = [n for n in vars(self.api) if not n.startswith("_")]
        self.assertEqual(public_attrs, [])
        self.assertNotIn("_resolve", public_methods())


class TestDevServer(ApiTestBase):
    def setUp(self):
        super().setUp()
        self.dist = self.base / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<html><head></head><body></body></html>")
        self.server, self.url, self.token = serve_in_thread(self.api, 0, self.dist)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def _call(self, method, args, token=None, host=None):
        req = urllib.request.Request(
            self.url + "api/" + method, method="POST",
            data=json.dumps({"args": args}).encode(),
            headers={"X-NoteVault-Token": self.token if token is None else token,
                     "Content-Type": "application/json"})
        if host:
            req.add_header("Host", host)
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())

    def test_call_with_token(self):
        self.assertEqual(self._call("resolve_link", ["Target"])["result"]["path"],
                         "Target.md")

    def test_rejects_missing_token_foreign_host_and_private_methods(self):
        for kwargs in ({"token": "wrong"}, {"host": "evil.example:80"}):
            with self.subTest(kwargs=kwargs), \
                    self.assertRaises(urllib.error.HTTPError) as cm:
                self._call("list_dir", [""], **kwargs)
            self.assertEqual(cm.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self._call("_resolve", ["Target.md"])
        self.assertEqual(cm.exception.code, 404)

    def test_api_errors_are_400_not_crashes(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self._call("read_note", ["../outside.md"])
        self.assertEqual(cm.exception.code, 400)

    def test_index_has_strict_csp_and_token_is_same_origin_only(self):
        with urllib.request.urlopen(self.url, timeout=5) as r:
            csp = r.headers["Content-Security-Policy"]
        # Same policy as the app: no inline scripts ('unsafe-eval' only
        # because pywebview's bridge needs new Function).
        self.assertIn("script-src 'self' 'unsafe-eval';", csp)
        self.assertNotIn("unsafe-inline';", csp.split("script-src")[1].split(";")[0])
        with urllib.request.urlopen(self.url + "__nv_dev_token", timeout=5) as r:
            self.assertEqual(json.loads(r.read())["token"], self.token)
            self.assertIsNone(r.headers.get("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()


class TestMixinNames(unittest.TestCase):
    def test_module_mixins_do_not_shadow_each_other(self):
        """Every module mixin must give its helpers distinct names: with
        multiple inheritance a duplicate silently resolves to one of them."""
        from notevault_app.webapp.api import NoteVaultApi
        seen: dict = {}
        for base in NoteVaultApi.__mro__:
            if base is object:
                continue
            for name in vars(base):
                if name.startswith("__"):
                    continue
                self.assertNotIn(name, seen, f"{name} defined in {seen.get(name)} and {base.__name__}")
                seen[name] = base.__name__


class TestHomeOverview(unittest.TestCase):
    def test_overview_is_json_and_counts_today(self):
        import json
        import shutil
        import tempfile
        from datetime import date
        from pathlib import Path
        from notevault_app.webapp.api import NoteVaultApi
        root = Path(tempfile.mkdtemp(prefix="nv_home_"))
        try:
            api = NoteVaultApi(root)
            today = date.today().isoformat()
            api.tasks_create({"name": "Hoy", "due": today})
            h = api.habits_list()[0]
            api.habits_set_done(today, h["id"], True)
            o = api.home_overview()
            json.dumps(o)
            self.assertEqual([t["name"] for t in o["tasks"]["today"]], ["Hoy"])
            self.assertTrue(next(x for x in o["habits"] if x["id"] == h["id"])["done"])
        finally:
            shutil.rmtree(root, ignore_errors=True)

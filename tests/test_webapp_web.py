"""WEB through the bridge: bookmarks, rules (with the relax phrase) and the
browser-window monitor that blocks, records history and meters time."""

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from notevault_app.core.web_store import UsageMeter, WebStore
from notevault_app.webapp.api import ApiError, NoteVaultApi
from notevault_app.webapp.modules.web import BrowserSession


class FakeWindow:
    def __init__(self, url):
        self.url = url
        self.html = None

    def get_current_url(self):
        return self.url

    def load_html(self, html):
        self.html = html
        self.url = "about:blank"

    def evaluate_js(self, _js):
        return "Título"


class TestWebApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_web_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.api = NoteVaultApi(self.dir)

    def test_bookmarks(self):
        b = self.api.web_bookmark_add("Docs", "docs.python.org")
        self.assertEqual(b["url"], "https://docs.python.org")
        self.assertEqual(len(self.api.web_overview()["bookmarks"]), 1)
        # Anything that is not a web address becomes a search, never a script.
        self.assertTrue(self.api.web_bookmark_add("x", "javascript:alert(1)")["url"].startswith("https://"))
        with self.assertRaises(ApiError):
            self.api.web_bookmark_add("x", "file:///etc/passwd")
        self.assertTrue(self.api.web_bookmark_remove("https://docs.python.org")["ok"])

    def test_rules_and_relax_phrase(self):
        r = self.api.web_overview()["restrictions"]
        r = self.api.web_preset(r, "Redes sociales")
        r["confirm_to_relax"] = True
        self.assertTrue(self.api.web_restrictions_save(r)["ok"])
        self.assertFalse(self.api.web_check("https://m.facebook.com/x")["allowed"])
        loose = dict(r, blocked_domains=[])
        self.assertTrue(self.api.web_restrictions_save(loose)["needs_phrase"])
        self.assertFalse(self.api.web_check("facebook.com")["allowed"])
        self.assertTrue(self.api.web_restrictions_save(loose, "Quiero desbloquear")["ok"])
        self.assertTrue(self.api.web_check("facebook.com")["allowed"])

    def test_open_blocked_and_system_fallback(self):
        self.api.web_restrictions_save({"enabled": True, "blocked_domains": ["tiktok.com"]})
        self.assertTrue(self.api.web_open("tiktok.com")["blocked"])
        with mock.patch("webbrowser.open") as op:
            self.assertTrue(self.api.web_open("example.com")["system"])
        op.assert_called_once_with("https://example.com")
        with self.assertRaises(ApiError):
            self.api.web_open("file:///etc/passwd")

    def test_browser_session(self):
        ws = WebStore(self.dir)
        ws.save_restrictions(ws.restrictions().from_dict({"blocked_patterns": ["youtube.com/shorts"],
                                                          "daily_limits": {"example.com": 1}}))
        meter = UsageMeter(ws)
        win = FakeWindow("https://example.com/a")
        s = BrowserSession(win, ws, meter)
        self.assertEqual(s.poll(0), "ok")
        self.assertEqual(ws.history()[-1]["title"], "Título")
        s.poll(70)                                   # 70 s on example.com
        self.assertGreaterEqual(meter.today()["example.com"], 60)
        self.assertEqual(s.poll(71), "blocked")      # over the 1-minute limit
        self.assertIn("límite diario", win.html)
        win.url = "https://www.youtube.com/shorts/abc"
        self.assertEqual(s.poll(72), "blocked")


if __name__ == "__main__":
    unittest.main()

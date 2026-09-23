"""WEB module data: URLs, content restrictions, bookmarks, history, usage.

Pure logic, no Qt: what the browser decides to block and what it writes to
``.notevault/web/`` (docs/VAULT_FORMAT.md, section "Web").
"""
import json
import shutil
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

from notevault_app.core import vault_format as fmt
from notevault_app.core.web_store import (
    Restrictions, UsageMeter, WebStore, domain_matches, host_of, normalize_url,
)


class TestUrls(unittest.TestCase):
    def test_bare_host_gets_https(self):
        self.assertEqual(normalize_url("github.com"), "https://github.com")
        self.assertEqual(normalize_url("docs.qt.io/qt-6/"), "https://docs.qt.io/qt-6/")

    def test_host_with_port_is_not_a_scheme(self):
        self.assertEqual(normalize_url("example.com:8080"), "https://example.com:8080")
        self.assertEqual(normalize_url("localhost:8000"), "http://localhost:8000")

    def test_words_become_a_search(self):
        self.assertTrue(normalize_url("como usar qt").startswith("https://www.google.com/search?q="))

    def test_full_urls_untouched(self):
        for u in ("https://a.com/x?y=1", "about:blank", "file:///C:/a.html"):
            self.assertEqual(normalize_url(u), u)

    def test_host_of_strips_www(self):
        self.assertEqual(host_of("https://www.YouTube.com/watch?v=1"), "youtube.com")

    def test_domain_covers_subdomains_only(self):
        self.assertTrue(domain_matches("m.youtube.com", "youtube.com"))
        self.assertTrue(domain_matches("youtube.com", "www.youtube.com"))
        self.assertFalse(domain_matches("notyoutube.com", "youtube.com"))


class TestRestrictions(unittest.TestCase):
    def test_blocked_domain(self):
        r = Restrictions(blocked_domains=["tiktok.com"])
        self.assertFalse(r.check("https://www.tiktok.com/@x")[0])
        self.assertTrue(r.check("https://github.com")[0])

    def test_pattern_blocks_only_that_section(self):
        r = Restrictions(blocked_patterns=["youtube.com/shorts"])
        self.assertFalse(r.check("https://www.youtube.com/shorts/abc")[0])
        self.assertTrue(r.check("https://www.youtube.com/watch?v=abc")[0])

    def test_focus_mode_allows_only_listed(self):
        r = Restrictions(mode="allowlist", allowed_domains=["qt.io"])
        self.assertTrue(r.check("https://doc.qt.io/x")[0])
        ok, reason = r.check("https://reddit.com")
        self.assertFalse(ok)
        self.assertIn("enfoque", reason)

    def test_daily_limit(self):
        r = Restrictions(daily_limits={"youtube.com": 30})
        self.assertTrue(r.check("https://youtube.com", {"youtube.com": 29 * 60})[0])
        self.assertFalse(r.check("https://m.youtube.com", {"youtube.com": 20 * 60,
                                                            "m.youtube.com": 10 * 60})[0])

    def test_disabled_and_internal_pages_pass(self):
        self.assertTrue(Restrictions(enabled=False, blocked_domains=["a.com"]).check("https://a.com")[0])
        self.assertTrue(Restrictions(mode="allowlist").check("about:blank")[0])

    def test_presets_merge_without_duplicates(self):
        r = Restrictions(blocked_domains=["tiktok.com"])
        r.apply_preset("Shorts y Reels")
        r.apply_preset("Shorts y Reels")
        self.assertEqual(r.blocked_domains.count("tiktok.com"), 1)
        self.assertIn("youtube.com/shorts", r.blocked_patterns)

    def test_relaxation_detection(self):
        old = Restrictions(blocked_domains=["a.com"], daily_limits={"b.com": 30})
        tighter = Restrictions(blocked_domains=["a.com", "c.com"], daily_limits={"b.com": 20})
        self.assertFalse(tighter.is_relaxation_of(old))
        self.assertTrue(Restrictions(daily_limits={"b.com": 30}).is_relaxation_of(old))
        self.assertTrue(Restrictions(blocked_domains=["a.com"],
                                     daily_limits={"b.com": 45}).is_relaxation_of(old))
        self.assertTrue(Restrictions(enabled=False, blocked_domains=["a.com"],
                                     daily_limits={"b.com": 30}).is_relaxation_of(old))

    def test_roundtrip(self):
        r = Restrictions(mode="allowlist", allowed_domains=["qt.io"], blocked_domains=["x.com"],
                         blocked_patterns=["/shorts"], daily_limits={"youtube.com": 15},
                         confirm_to_relax=True)
        self.assertEqual(Restrictions.from_dict(r.to_dict()), r)

    def test_from_dict_cleans_input(self):
        r = Restrictions.from_dict({"blocked_domains": ["https://www.TikTok.com/foo", ""],
                                    "daily_limits": {"www.youtube.com": "20", "bad": "x"}})
        self.assertEqual(r.blocked_domains, ["tiktok.com"])
        self.assertEqual(r.daily_limits, {"youtube.com": 20})


class TestWebStore(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="nvweb"))
        self.store = WebStore(self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_files_live_in_the_documented_layout(self):
        self.store.add_bookmark("Qt", "https://doc.qt.io")
        self.store.save_restrictions(Restrictions(blocked_domains=["x.com"]))
        self.store.add_history("https://doc.qt.io", "Qt", datetime(2026, 9, 23, 10, 0, 0))
        self.store.add_usage("doc.qt.io", 60, date(2026, 9, 23))
        for key, kw in (("web_bookmarks", {}), ("web_restrictions", {}),
                        ("web_history_day", dict(year=2026, month=9, date="2026-09-23")),
                        ("web_usage_day", dict(year=2026, month=9, date="2026-09-23"))):
            path = self.root / fmt.LAYOUT[key].format(**kw)
            self.assertTrue(path.exists(), key)
            self.assertTrue(str(path.relative_to(self.root)).replace("\\", "/")
                            .startswith(".notevault/web/"))

    def test_bookmarks(self):
        self.store.add_bookmark("Qt", "https://doc.qt.io")
        self.store.add_bookmark("Qt again", "https://doc.qt.io")    # no duplicate
        self.assertEqual(len(self.store.bookmarks()), 1)
        self.assertTrue(self.store.is_bookmarked("https://doc.qt.io"))
        self.assertTrue(self.store.remove_bookmark("https://doc.qt.io"))
        self.assertEqual(self.store.bookmarks(), [])

    def test_history_skips_repeats_and_non_web(self):
        t = datetime(2026, 9, 23, 9, 0, 0)
        self.store.add_history("https://a.com", "A", t)
        self.store.add_history("https://a.com", "A", t)
        self.store.add_history("about:blank", "", t)
        self.store.add_history("https://b.com", "B", t)
        self.assertEqual([h["url"] for h in self.store.history(t.date())],
                         ["https://a.com", "https://b.com"])
        self.assertEqual(self.store.history_days(), [t.date()])
        self.store.clear_history()
        self.assertEqual(self.store.history(t.date()), [])

    def test_usage_meter_flushes_to_disk(self):
        m = UsageMeter(self.store)
        m.tick("youtube.com", 5)
        m.tick("youtube.com", 5)
        self.assertEqual(m.today()["youtube.com"], 10)       # visible before flushing
        m.flush()
        self.assertEqual(self.store.usage()["youtube.com"], 10)
        path = self.root / fmt.LAYOUT["web_usage_day"].format(
            year=date.today().year, month=date.today().month, date=date.today().isoformat())
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"youtube.com": 10})


if __name__ == "__main__":
    unittest.main()

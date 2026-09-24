"""Desktop notifications: the text never reaches a command line."""

import unittest
from unittest import mock

from notevault_app.webapp import notify


class TestNotify(unittest.TestCase):
    EVIL = 'x"; Remove-Item C:\\ -Recurse; $(calc) `whoami`'

    def test_windows_passes_text_in_env(self):
        with mock.patch("shutil.which", return_value="powershell.exe"):
            argv, env = notify.command("Título", self.EVIL, platform="win32")
        self.assertNotIn(self.EVIL, " ".join(argv))
        self.assertEqual(env["NV_BODY"], self.EVIL)
        self.assertIn("$env:NV_BODY", argv[-1])

    def test_macos_and_linux(self):
        argv, env = notify.command("T", self.EVIL, platform="darwin")
        self.assertNotIn(self.EVIL, " ".join(argv))
        self.assertEqual(env["NV_BODY"], self.EVIL)
        with mock.patch("shutil.which", return_value="/usr/bin/notify-send"):
            argv, _ = notify.command("T", "a\nb", platform="linux")
        self.assertEqual(argv[-3:], ["--", "T", "a b"])
        with mock.patch("shutil.which", return_value=None):
            self.assertIsNone(notify.command("T", "b", platform="linux"))

    def test_notify_never_raises(self):
        with mock.patch.object(notify, "command", return_value=(["/nonexistent/bin"], {})):
            self.assertFalse(notify.notify("a", "b"))


if __name__ == "__main__":
    unittest.main()

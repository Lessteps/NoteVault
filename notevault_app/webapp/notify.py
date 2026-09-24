"""Desktop notifications without Qt: a Windows toast through PowerShell, the
macOS notification center through osascript, notify-send on Linux.

The text never becomes part of a command line or script: it travels in
environment variables (Windows, macOS) or as a plain argv item (Linux).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

# PowerShell's own AppUserModelID: toasts shown with it always appear.
_PS_APP_ID = r"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
_PS_SCRIPT = (
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, "
    "ContentType = WindowsRuntime] > $null;"
    "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent("
    "[Windows.UI.Notifications.ToastTemplateType]::ToastText02);"
    "$x = $t.GetElementsByTagName('text');"
    "$x.Item(0).AppendChild($t.CreateTextNode($env:NV_TITLE)) > $null;"
    "$x.Item(1).AppendChild($t.CreateTextNode($env:NV_BODY)) > $null;"
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:NV_APP)"
    ".Show([Windows.UI.Notifications.ToastNotification]::new($t))"
)
_OSA_SCRIPT = ('display notification (system attribute "NV_BODY") '
               'with title (system attribute "NV_TITLE")')


def _clean(text: str, limit: int) -> str:
    return " ".join(str(text or "").split())[:limit]


def command(title: str, body: str, platform: str = sys.platform) -> tuple[list, dict] | None:
    """(argv, extra env) for this platform, or None when none is available."""
    title, body = _clean(title, 120) or "NoteVault", _clean(body, 400)
    if platform.startswith("win"):
        exe = shutil.which("powershell") or shutil.which("pwsh")
        if not exe:
            return None
        return ([exe, "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", _PS_SCRIPT],
                {"NV_TITLE": title, "NV_BODY": body, "NV_APP": _PS_APP_ID})
    if platform == "darwin":
        return (["osascript", "-e", _OSA_SCRIPT], {"NV_TITLE": title, "NV_BODY": body})
    exe = shutil.which("notify-send")
    if not exe:
        return None
    return ([exe, "--app-name=NoteVault", "--", title, body], {})


def notify(title: str, body: str) -> bool:
    """Show a notification; False when the system offers no way to."""
    cmd = command(title, body)
    if cmd is None:
        return False
    argv, extra = cmd
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        subprocess.Popen(argv, env={**os.environ, **extra}, stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
    except OSError:
        return False
    return True

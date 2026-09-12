"""
Desktop notifications.

Uses a QSystemTrayIcon balloon message, which Windows renders as a real
notification in the Action Center. Falls back to a normal message box when
no system tray is available.
"""

from pathlib import Path
from PySide6.QtWidgets import QSystemTrayIcon, QMessageBox, QApplication
from PySide6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont
from PySide6.QtCore import Qt

APP_NAME = "NoteVault"


def _fallback_icon() -> QIcon:
    """A small orange 'N' badge, used when the .ico file is missing."""
    pm = QPixmap(64, 64)
    pm.fill(Qt.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.Antialiasing)
    p.setBrush(QColor("#ff9632"))
    p.setPen(Qt.NoPen)
    p.drawRoundedRect(2, 2, 60, 60, 14, 14)
    p.setPen(QColor("#191919"))
    f = QFont()
    f.setPointSize(30)
    f.setBold(True)
    p.setFont(f)
    p.drawText(pm.rect(), Qt.AlignCenter, "N")
    p.end()
    return QIcon(pm)


def app_icon(assets_dir: Path = None) -> QIcon:
    if assets_dir:
        ico = Path(assets_dir) / "notevault.ico"
        if ico.exists():
            icon = QIcon(str(ico))
            if not icon.isNull():
                return icon
    return _fallback_icon()


class Notifier:
    """Owns the tray icon and pushes desktop notifications through it."""

    def __init__(self, parent=None, assets_dir: Path = None):
        self._parent = parent
        self._icon = app_icon(assets_dir)
        self._tray = None
        self.available = QSystemTrayIcon.isSystemTrayAvailable()
        if self.available:
            self._tray = QSystemTrayIcon(self._icon, parent)
            self._tray.setToolTip(APP_NAME)
            self._tray.show()

    @property
    def tray(self):
        return self._tray

    def notify(self, title: str, body: str, msecs: int = 12000) -> bool:
        """Show a desktop notification. Returns True if the tray was used."""
        if self._tray is not None and QSystemTrayIcon.supportsMessages():
            self._tray.showMessage(
                title, body, QSystemTrayIcon.Information, msecs
            )
            QApplication.beep()
            return True

        box = QMessageBox(self._parent)
        box.setWindowTitle(title)
        box.setIcon(QMessageBox.Information)
        box.setText(title)
        box.setInformativeText(body)
        box.setStandardButtons(QMessageBox.Ok)
        box.show()
        return False

    def shutdown(self):
        if self._tray is not None:
            self._tray.hide()

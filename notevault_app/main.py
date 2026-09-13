"""
NoteVault Desktop — Entry Point
Initializes QApplication and launches the MainWindow.
"""

import sys
from pathlib import Path
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt, QCoreApplication

from .ui import theme
from .ui.main_window import MainWindow


def run():
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )

    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
        for p in [base_dir / "PySide6" / "plugins", base_dir / "plugins"]:
            if p.exists():
                QCoreApplication.addLibraryPath(str(p))

    app = QApplication(sys.argv)
    app.setApplicationName("NoteVault")
    app.setOrganizationName("NoteVault")

    # Must run before the first widget is created: it routes every widget
    # stylesheet through the active palette.
    theme.install()

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    run()

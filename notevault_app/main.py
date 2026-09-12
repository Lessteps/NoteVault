"""
NoteVault Desktop — Entry Point
Initializes QApplication and launches the MainWindow.
"""

import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt

from .ui import theme
from .ui.main_window import MainWindow


def run():
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )

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

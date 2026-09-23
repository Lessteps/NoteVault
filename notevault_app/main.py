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

    # QtWebEngine (the WEB module, loaded on demand) requires this before the
    # QApplication exists; it is harmless when WEB is never opened.
    QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)

    if any(a.startswith("--web-selftest") for a in sys.argv):
        from .ui.components.web.selftest import run_selftest
        sys.exit(run_selftest(sys.argv))

    app = QApplication(sys.argv)
    app.setApplicationName("NoteVault")
    app.setOrganizationName("NoteVault")

    # Load friendly fonts before theme installation
    theme.load_fonts()

    # Must run before the first widget is created: it routes every widget
    # stylesheet through the active palette.
    theme.install()

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    run()

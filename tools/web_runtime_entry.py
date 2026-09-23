"""Entry script for the WEB runtime bundle (see web_runtime.spec).

It is never run by users. Importing QtWebEngineWidgets here is what makes
PyInstaller collect Chromium, QtWebEngineProcess.exe and its resources into
``dist/web_runtime/_internal``; NoteVault.exe then loads them from the
``web_runtime`` folder next to it the first time the WEB module opens.
"""
import PySide6.QtWebEngineCore      # noqa: F401
import PySide6.QtWebEngineWidgets   # noqa: F401

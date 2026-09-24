"""
NoteVault — the new interface (HTML + CSS + TypeScript in a pywebview window).

    python run_web.py            # the built UI (frontend/dist)
    python run_web.py --dev      # the Vite dev server (npm run dev) with hot reload
    python run_web.py --debug    # also open the browser devtools

Build the UI once before the first run:

    cd frontend && npm install && npm run build

The classic Qt app (python run_app.py) keeps working alongside while the
remaining modules are migrated.
"""

from __future__ import annotations

import sys
from pathlib import Path

DEV_URL = "http://localhost:5173"


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)            # PyInstaller bundle
    return Path(__file__).resolve().parent


def main() -> int:
    try:
        import webview
    except ImportError:
        print("Falta pywebview:  pip install pywebview", file=sys.stderr)
        return 1

    from notevault_app.config import AppConfig
    from notevault_app.webapp.api import NoteVaultApi

    dev = "--dev" in sys.argv
    debug = "--debug" in sys.argv
    index = _base_dir() / "frontend" / "dist" / "index.html"
    if not dev and not index.is_file():
        print("La interfaz no está compilada. Ejecuta:\n"
              "    cd frontend && npm install && npm run build", file=sys.stderr)
        return 1

    api = NoteVaultApi()
    dark = AppConfig.get_theme() != "light"
    window = webview.create_window(
        "NoteVault",
        url=DEV_URL if dev else str(index),
        js_api=api,
        width=1480,
        height=920,
        min_size=(900, 600),
        background_color="#0b0b10" if dark else "#f5efe4",
        text_select=True,
    )

    # Unsaved notes are flushed before the window really closes.
    api._attach_window(window)
    window.events.closing += api._on_closing

    # Keep localStorage (open folders, panel widths) between sessions.
    storage = Path.home() / ".notevault" / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(debug=debug, private_mode=False, storage_path=str(storage))
    return 0


if __name__ == "__main__":
    sys.exit(main())

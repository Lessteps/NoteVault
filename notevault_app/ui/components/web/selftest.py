"""
``NoteVault.exe --web-selftest=<result.json>``: proves the packaged exe can
load the separate web_runtime folder and render a page, without opening the
main window or touching the vault. Used after every build.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWidgets import QApplication


def run_selftest(argv) -> int:
    arg = next(a for a in argv if a.startswith("--web-selftest"))
    out = Path(arg.split("=", 1)[1]) if "=" in arg else Path.home() / "nv_web_selftest.json"
    app = QApplication.instance() or QApplication([argv[0]])
    result = {"frozen": bool(getattr(sys, "frozen", False)), "ok": False}

    def finish(code=0):
        out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        app.exit(code)

    try:
        from ....core import web_runtime
        ns = web_runtime.load()
        result["runtime_dir"] = str(web_runtime.runtime_dir())
        view = ns.QWebEngineView()
        view.resize(420, 300)
        view.show()

        def check_net():
            net = ns.QWebEngineView()
            net.resize(420, 300)

            def done(ok):
                result["network_page_loaded"] = bool(ok)
                result["network_title"] = net.title()
                finish(0)
            net.loadFinished.connect(done)
            net.setUrl(QUrl("https://example.com"))
            check_net.view = net

        def on_loaded(ok):
            result["local_page_loaded"] = bool(ok)
            img = view.grab().toImage()
            result["pixel"] = img.pixelColor(200, 150).name()
            result["title"] = view.title()
            result["ok"] = bool(ok) and view.title() == "nv-ok"
            check_net()
        view.loadFinished.connect(on_loaded)
        view.setHtml("<title>nv-ok</title><body style='margin:0;background:#00ff00'></body>")
        QTimer.singleShot(40000, lambda: (result.setdefault("timeout", True), finish(1)))
    except Exception as exc:                     # report, never crash silently
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["trace"] = traceback.format_exc()
        finish(1)
        return 1
    return app.exec()

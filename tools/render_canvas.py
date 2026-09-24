"""Offscreen canvas renderer (tools/render_canvas.py).

Renders a .canvas file to a high-resolution PNG image using the real
NoteVault CanvasView offscreen widget.

Usage:
  python tools/render_canvas.py <path/to/file.canvas> <path/to/output.png>
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PySide6.QtCore import Qt, QCoreApplication
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QApplication

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.canvas.view import CanvasView
from tools.kb_canvas import find_vault_root


def render(canvas_file: Path, out_png: Path) -> None:
    canvas_file = canvas_file.resolve()
    out_png = out_png.resolve()
    if not canvas_file.is_file():
        raise FileNotFoundError(f"Canvas file not found: {canvas_file}")

    vault_root = find_vault_root(canvas_file)

    app = QApplication.instance() or QApplication(["render_canvas", "-platform", "offscreen"])
    app.setFont(QFont("Segoe UI", 10))

    vm = VaultManager(vault_root)
    svc = NotesService(vm)
    view = CanvasView(vault=vm, service=svc)

    view.resize(2400, 1400)
    view.load(canvas_file)
    view.zoom_to_fit()

    # Process events so scene items, fonts, and layouts finalize
    QCoreApplication.processEvents()
    QCoreApplication.processEvents()

    # Use CanvasView's built-in scene renderer to generate a crisp PNG
    view.export_to_png(out_png)
    print(f"Rendered {canvas_file.name} -> {out_png}")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("Usage: python tools/render_canvas.py <file.canvas> <out.png>")
        return 1
    canvas_file = Path(argv[1])
    out_png = Path(argv[2])
    try:
        render(canvas_file, out_png)
        return 0
    except Exception as ex:
        print(f"Error rendering {canvas_file}: {ex}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

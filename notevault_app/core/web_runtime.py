"""
Lazy loader for QtWebEngine (Chromium), used only by the WEB module.

QtWebEngine weighs ~350 MB. NoteVault.exe is a one-file build that unpacks
everything on every launch, so bundling Chromium in it would slow down every
start even for people who never open WEB. Instead it ships as a separate
folder next to the exe:

    NoteVault.exe
    web_runtime/                 built by  python tools/build_web_runtime.py
        VERSION                  PySide6 version it was built from
        _internal/PySide6/       QtWebEngine*.pyd, Qt6WebEngineCore.dll,
                                 QtWebEngineProcess.exe, resources/, ...

``load()`` points Python and Windows at that folder and imports the modules.
The Qt6Core/Gui/Widgets already loaded by the exe are reused (Windows keeps
one DLL per name), so both folders must come from the same PySide6 version;
``VERSION`` guards that. From source (python run_app.py) the regular PySide6
install is used and nothing here is needed.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

RUNTIME_DIR_NAME = "web_runtime"


class WebRuntimeMissing(RuntimeError):
    """QtWebEngine cannot be loaded; the message says why, in Spanish."""


_loaded = None
_dll_handles = []


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def runtime_dir() -> Path:
    from ..config import PROJECT_ROOT
    return PROJECT_ROOT / RUNTIME_DIR_NAME


def _qt_dir() -> Path:
    return runtime_dir() / "_internal" / "PySide6"


def available() -> bool:
    if not is_frozen():
        try:
            import importlib.util
            return importlib.util.find_spec("PySide6.QtWebEngineWidgets") is not None
        except Exception:
            return False
    return (_qt_dir() / "QtWebEngineWidgets.pyd").exists()


def _prepare_frozen():
    qt = _qt_dir()
    if not (qt / "QtWebEngineWidgets.pyd").exists():
        raise WebRuntimeMissing(
            "No se encontró el motor web (carpeta «web_runtime» junto a NoteVault.exe).\n"
            "Constrúyelo con:  python tools/build_web_runtime.py")
    import PySide6
    stamp = runtime_dir() / "VERSION"
    built_with = stamp.read_text(encoding="utf-8").strip() if stamp.exists() else ""
    if built_with and built_with != PySide6.__version__:
        raise WebRuntimeMissing(
            f"El motor web se construyó con PySide6 {built_with} pero la app usa "
            f"{PySide6.__version__}.\nReconstrúyelo con:  python tools/build_web_runtime.py")
    os.environ.setdefault("QTWEBENGINEPROCESS_PATH", str(qt / "QtWebEngineProcess.exe"))
    os.environ.setdefault("QTWEBENGINE_RESOURCES_PATH", str(qt / "resources"))
    os.environ.setdefault("QTWEBENGINE_LOCALES_PATH",
                          str(qt / "translations" / "qtwebengine_locales"))
    for d in (qt, qt.parent):
        try:
            _dll_handles.append(os.add_dll_directory(str(d)))
        except (OSError, AttributeError):
            pass
    os.environ["PATH"] = str(qt) + os.pathsep + os.environ.get("PATH", "")
    if str(qt) not in list(PySide6.__path__):
        PySide6.__path__.append(str(qt))


def load():
    """Import QtWebEngine and return a namespace with the classes WEB uses.
    Raises WebRuntimeMissing with a user-facing message when it cannot."""
    global _loaded
    if _loaded is not None:
        return _loaded
    if is_frozen():
        _prepare_frozen()
    try:
        from PySide6 import QtWebEngineCore, QtWebEngineWidgets
    except ImportError as exc:
        raise WebRuntimeMissing(f"No se pudo cargar el motor web: {exc}") from exc

    class _NS:
        pass
    ns = _NS()
    ns.core = QtWebEngineCore
    ns.widgets = QtWebEngineWidgets
    ns.QWebEngineView = QtWebEngineWidgets.QWebEngineView
    ns.QWebEnginePage = QtWebEngineCore.QWebEnginePage
    ns.QWebEngineProfile = QtWebEngineCore.QWebEngineProfile
    ns.QWebEngineSettings = QtWebEngineCore.QWebEngineSettings
    ns.QWebEngineDownloadRequest = QtWebEngineCore.QWebEngineDownloadRequest
    _loaded = ns
    return ns

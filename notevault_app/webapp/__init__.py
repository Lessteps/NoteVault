"""
NoteVault web UI backend.

The new interface (frontend/, HTML + CSS + TypeScript) talks to the existing
Python logic in notevault_app.core through `NoteVaultApi`. The desktop window
is a pywebview window (run_web.py); a small localhost HTTP bridge
(devserver.py) exposes the same API for development and automated tests.
"""

from .api import NoteVaultApi, ApiError

__all__ = ["NoteVaultApi", "ApiError"]

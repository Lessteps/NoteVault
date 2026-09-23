"""WEB module: the built-in browser (opened from the Ctrl+P command palette)
and the live web cards of the canvas. Nothing here imports QtWebEngine at
module level; it is loaded on first use through core.web_runtime."""

from .controller import WebController, controller  # noqa: F401

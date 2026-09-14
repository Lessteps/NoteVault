"""
NoteVault theming.

Every panel writes its own Qt stylesheet with the dark palette hard-coded.
Rather than duplicating each of those stylesheets, the dark palette is the
single source of truth and, when the light theme is active, every colour is
re-tinted on its way into Qt.

`install()` patches QWidget.setStyleSheet once at start-up so that all widget
stylesheets go through `skin()`, and remembers the untinted original on the
widget so `restyle()` can repaint everything when the theme is toggled.
Colours used outside a stylesheet (QColor, QPainter) must call `tint()`.
"""

import re
from PySide6.QtWidgets import QWidget

DARK = "dark"
LIGHT = "light"

RAW_CSS_PROPERTY = "_nvRawCss"

_current = DARK
_installed = False

# ---------------------------------------------------------------------------
# Dark -> light colour map.
#
# The light theme is a warm cream palette matching the global QSS in
# styles.py: paper background, near-black warm text, and accents darkened so
# they stay legible on a light surface.
# ---------------------------------------------------------------------------

_DARK_TO_LIGHT = {
    # ── Surfaces ────────────────────────────────────────────────────────
    "#191919": "#f5efe4",   # page background
    "#1a1a1e": "#f5efe4",   # page background (global qss)
    "#171717": "#efe8da",   # calendar cell outside the current month
    "#111111": "#e8e0d0",   # deepest well
    "#161616": "#ece4d4",   # table header strip
    "#1a1a1a": "#ece4d4",   # card / day header strip
    "#202028": "#e7dcc6",   # day header hover
    "#2a2a32": "#e7dcc6",   # calendar nav hover
    "#202020": "#fffaf1",   # card surface
    "#1f1f1f": "#fffaf1",   # card surface (tareas)
    "#1c1c1c": "#fffaf1",   # table row / calendar cell
    "#232323": "#f6f0e4",   # alternate table row
    "#1e1e1e": "#efe7d8",   # small button / day toggle
    "#252525": "#efe7d8",   # inputs, chips, flat buttons
    "#262626": "#ffffff",   # inline editor focus
    "#2a2a2a": "#e7dcc6",   # elevated surface
    "#2c2c2c": "#e7dcc6",   # pill background / progress track
    "#26262e": "#e7dcc6",   # nav hover
    "#202024": "#efe7d8",   # panel background (global qss)
    "#0d1f0d": "#e6f2e2",   # completed row tint
    "#161b22": "#e2dbcc",   # streak: no data
    "#216821": "#a9d9a4",   # streak: low
    "#2ea043": "#4fae5e",   # streak: medium

    # ── Borders ─────────────────────────────────────────────────────────
    "#2f2f2f": "#d7c8ab",
    "#33333e": "#d7c8ab",
    "#3a3a4a": "#c4b291",

    # ── Text ────────────────────────────────────────────────────────────
    "#e6e6e6": "#2b2620",   # primary
    "#dcdde0": "#2b2620",
    "#000000": "#2b2620",
    "#101010": "#2b2620",   # text drawn on an accent badge
    "#aaaaae": "#463f33",
    "#9b9b9b": "#5f5747",   # dim
    "#888895": "#5f5747",
    "#6f6f6f": "#857b66",   # faint
    "#666672": "#857b66",
    "#7a7a86": "#857b66",
    "#606068": "#9c9079",   # completed / muted
    "#63636c": "#9c9079",
    "#6b6b74": "#9c9079",
    "#555560": "#a2967e",
    "#55555f": "#a2967e",
    "#5a5a64": "#a2967e",
    "#4d4d55": "#aa9e86",   # file path hint
    "#6a6a72": "#a89b82",   # unchecked checkbox border
    "#4a4a52": "#bcab8d",   # star: off (editor)
    "#45454d": "#bcab8d",   # star: off (table)
    "#3d3d45": "#bcab8d",   # calendar "+" button

    # ── Accents ─────────────────────────────────────────────────────────
    "#2383e2": "#1a6fc4",   # blue
    "#1a6fc4": "#14589e",   # blue hover
    "#7b93d4": "#3557b7",   # video link
    "#a0b8ff": "#2a4ba8",
    "#a78bfa": "#6d4fd8",   # purple (proyectos)
    "#7c5af0": "#5548d6",
    "#a5b4fc": "#4c3fb0",
    "#4ade80": "#2f8f3e",   # green
    "#3fb950": "#2f8f3e",
    "#ff9632": "#c76a00",   # orange (ejercicio)
    "#e08020": "#a85c00",
    "#e0a13a": "#a66f12",
    "#f2555a": "#c1393e",   # red
    "#e8d44d": "#c08c00",   # star: on
    "#c9c9cf": "#cfc4ae",   # progress blocks: empty
}

# Colours that only appear in the global sheet (styles.py).
_DARK_TO_LIGHT.update({
    "#14141a": "#f0e8d8",   # icon rail
    "#1e1e22": "#f0e8d8",
    "#222228": "#eee5d5",
    "#20202a": "#ece2d0",
    "#1a2232": "#e2ecf8",   # blue-tinted card
    "#1a2e1c": "#e3f0e0",   # green-tinted card
    "#2e1a1c": "#f8e2df",   # red-tinted card
    "#281e0e": "#f7ecd8",   # amber-tinted card
    "#252534": "#e2d9f2",
    "#2e2e36": "#dfd2b8",
    "#2e2e38": "#dfd2b8",
    "#303048": "#d6c9ef",
    "#303038": "#d9cdb5",
    "#44444e": "#c4b291",
    "#383844": "#c4b291",
    "#505060": "#b3a081",
    "#4848a0": "#8f7fd8",
    "#383855": "#c9bce8",
    "#585868": "#a99c81",
    "#6366f1": "#5548d6",
    "#fbfbfd": "#171310",   # "brightest" hover -> darkest on light
})

# Colours used by the calendario module.
_DARK_TO_LIGHT.update({
    "#25252b": "#efe7d8",   # nav buttons, event chips
    "#2d2d38": "#d7c8ab",   # month cell border, table grid
    "#2f2f38": "#e2d6bf",   # week column separator
    "#2dd4bf": "#0f8c7d",   # teal
    "#eab308": "#a87a00",   # yellow
})

_HEX_RE = re.compile(r"#[0-9a-fA-F]{6}\b")
_WHITE_RGBA_RE = re.compile(r"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,")


def current() -> str:
    return _current


def is_light() -> bool:
    return _current == LIGHT


def set_theme(name: str):
    """Switch the active theme. Call restyle() afterwards to repaint."""
    global _current
    _current = LIGHT if name == LIGHT else DARK


def tint(color: str) -> str:
    """Map a single colour for the active theme (for QColor and friends)."""
    if _current != LIGHT:
        return color
    return _DARK_TO_LIGHT.get(color.lower(), color)


def skin(css: str) -> str:
    """Re-tint every colour inside a Qt stylesheet for the active theme."""
    if _current != LIGHT or not css:
        return css
    out = _HEX_RE.sub(
        lambda m: _DARK_TO_LIGHT.get(m.group(0).lower(), m.group(0)), css
    )
    # White overlays (hover washes) become dark washes on a light surface.
    return _WHITE_RGBA_RE.sub("rgba(0, 0, 0,", out)


def install():
    """Route every widget stylesheet through skin(). Safe to call twice."""
    global _installed
    if _installed:
        return
    original = QWidget.setStyleSheet

    def _themed_set_stylesheet(widget, css):
        try:
            widget.setProperty(RAW_CSS_PROPERTY, css)
        except Exception:
            pass
        original(widget, skin(css))

    QWidget.setStyleSheet = _themed_set_stylesheet
    _installed = True


def restyle(root: QWidget):
    """Re-apply every stored stylesheet under root using the active theme."""
    for w in [root] + root.findChildren(QWidget):
        raw = w.property(RAW_CSS_PROPERTY)
        if raw:
            w.setStyleSheet(raw)

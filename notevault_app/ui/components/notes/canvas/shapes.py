"""Flowchart shape geometry and definitions for programming logic in Canvas.

Defines the 10 standard flowchart shape kinds, their display names, default
dimensions, and path generators.
"""

from PySide6.QtCore import QPointF, QRectF
from PySide6.QtGui import QPainterPath

SHAPE_INFO = {
    "start_end": {
        "name": "Inicio / Fin",
        "desc": "Terminal de flujo (óvalo/estadio)",
        "default_size": (140.0, 50.0),
    },
    "process": {
        "name": "Proceso",
        "desc": "Operación o instrucción (rectángulo)",
        "default_size": (160.0, 60.0),
    },
    "decision": {
        "name": "Decisión",
        "desc": "Condicional si/no (rombo)",
        "default_size": (150.0, 80.0),
    },
    "io": {
        "name": "Entrada / Salida",
        "desc": "Lectura o escritura de datos (paralelogramo)",
        "default_size": (160.0, 60.0),
    },
    "connector": {
        "name": "Conector",
        "desc": "Punto de enlace o salto (círculo)",
        "default_size": (60.0, 60.0),
    },
    "predefined": {
        "name": "Subrutina",
        "desc": "Proceso predefinido o función (doble borde)",
        "default_size": (160.0, 60.0),
    },
    "database": {
        "name": "Base de datos",
        "desc": "Almacenamiento persistente (cilindro)",
        "default_size": (140.0, 80.0),
    },
    "manual_input": {
        "name": "Entrada manual",
        "desc": "Dato ingresado por usuario (trapecio)",
        "default_size": (160.0, 60.0),
    },
    "display": {
        "name": "Documento / Pantalla",
        "desc": "Salida de visualización o informe",
        "default_size": (160.0, 70.0),
    },
    "comment": {
        "name": "Comentario",
        "desc": "Nota explicativa o anotación",
        "default_size": (150.0, 60.0),
    },
}


def shape_path(kind: str, w: float, h: float) -> QPainterPath:
    """Return the outer boundary path for the given flowchart shape kind."""
    w = max(20.0, float(w))
    h = max(20.0, float(h))
    path = QPainterPath()

    if kind == "start_end":
        r = min(h / 2.0, w / 2.0)
        path.moveTo(r, 0)
        path.lineTo(w - r, 0)
        path.arcTo(w - 2 * r, 0, 2 * r, h, 90, -180)
        path.lineTo(r, h)
        path.arcTo(0, 0, 2 * r, h, 270, -180)
        path.closeSubpath()

    elif kind == "process":
        path.addRoundedRect(0, 0, w, h, 4, 4)

    elif kind == "decision":
        path.moveTo(w / 2.0, 0)
        path.lineTo(w, h / 2.0)
        path.lineTo(w / 2.0, h)
        path.lineTo(0, h / 2.0)
        path.closeSubpath()

    elif kind == "io":
        slant = min(24.0, w * 0.18)
        path.moveTo(slant, 0)
        path.lineTo(w, 0)
        path.lineTo(w - slant, h)
        path.lineTo(0, h)
        path.closeSubpath()

    elif kind == "connector":
        path.addEllipse(0, 0, w, h)

    elif kind == "predefined":
        path.addRoundedRect(0, 0, w, h, 4, 4)

    elif kind == "database":
        eh = min(h * 0.22, 18.0)
        path.moveTo(0, eh / 2.0)
        # top ellipse
        path.arcTo(0, 0, w, eh, 180, -180)
        path.lineTo(w, h - eh / 2.0)
        # bottom half ellipse
        path.arcTo(0, h - eh, w, eh, 0, -180)
        path.lineTo(0, eh / 2.0)
        path.closeSubpath()

    elif kind == "manual_input":
        slope = min(h * 0.25, 18.0)
        path.moveTo(0, slope)
        path.lineTo(w, 0)
        path.lineTo(w, h)
        path.lineTo(0, h)
        path.closeSubpath()

    elif kind == "display":
        wave_h = min(h * 0.18, 14.0)
        base_y = h - wave_h
        path.moveTo(0, 0)
        path.lineTo(w, 0)
        path.lineTo(w, base_y)
        path.cubicTo(w * 0.75, base_y - wave_h * 0.7,
                     w * 0.25, h + wave_h * 0.4,
                     0, base_y)
        path.closeSubpath()

    elif kind == "comment":
        path.addRoundedRect(0, 0, w, h, 3, 3)

    else:
        path.addRoundedRect(0, 0, w, h, 4, 4)

    return path


def shape_internal_paths(kind: str, w: float, h: float) -> list[QPainterPath]:
    """Return decorative interior lines (subroutine borders, database curves, etc.)."""
    w = max(20.0, float(w))
    h = max(20.0, float(h))
    internals = []

    if kind == "predefined":
        inset = min(16.0, w * 0.15)
        p1 = QPainterPath()
        p1.moveTo(inset, 0)
        p1.lineTo(inset, h)
        internals.append(p1)

        p2 = QPainterPath()
        p2.moveTo(w - inset, 0)
        p2.lineTo(w - inset, h)
        internals.append(p2)

    elif kind == "database":
        eh = min(h * 0.22, 18.0)
        p = QPainterPath()
        p.arcMoveTo(0, 0, w, eh, 180)
        p.arcTo(0, 0, w, eh, 180, -180)
        internals.append(p)

    return internals

"""
Áreas de vida shared by Metas, Proyectos and Hábitos.

    .notevault/areas/<area-id>.json
    {"id": "programacion", "name": "Programación", "icon": "💻",
     "colour": "#3f51b5", "order": 2, "archived": false}

One file per area, so creating an area on the phone and another on the
desktop never collide. Deleting an area only archives it: goals, projects
and habits that point to it keep their `area` and show as "Sin área" while
it is archived.
"""

from pathlib import Path
from typing import Optional

from . import store, vault_format

NO_AREA = ""

SUGGESTED_AREAS = (
    ("Programación", "💻", "#3f51b5"),
    ("Estudio", "📚", "#8e24aa"),
    ("Salud", "💪", "#33b679"),
    ("Finanzas", "💰", "#f6bf26"),
    ("Personal", "🌱", "#e67c73"),
)


def sanitize_area(raw: dict, fallback_id: str = "") -> dict:
    raw = raw if isinstance(raw, dict) else {}
    order = raw.get("order")
    return {
        "id": str(raw.get("id") or fallback_id),
        "name": str(raw.get("name") or "Área"),
        "icon": str(raw.get("icon") or ""),
        "colour": str(raw.get("colour") or "#7986cb"),
        "order": order if isinstance(order, (int, float)) and not isinstance(order, bool) else 0,
        "archived": bool(raw.get("archived", False)),
    }


class AreaManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["areas_dir"]
        self._cache: Optional[list] = None
        self._stamp = None

    def _path(self, area_id: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["area"].format(id=area_id)

    def _dir_stamp(self):
        try:
            files = sorted(self.dir.glob("*.json"))
            return tuple((f.name, f.stat().st_mtime_ns) for f in files)
        except OSError:
            return ()

    def areas(self, include_archived: bool = False) -> list:
        stamp = self._dir_stamp()
        if self._cache is None or stamp != self._stamp:
            out = []
            for name, _m in stamp:
                path = self.dir / name
                if vault_format.is_sync_conflict(name):
                    continue
                data = store.load_json(path)
                if isinstance(data, dict):
                    out.append(sanitize_area(data, path.stem))
            out.sort(key=lambda a: (a["order"], a["name"].lower()))
            self._cache, self._stamp = out, stamp
        return [dict(a) for a in self._cache if include_archived or not a["archived"]]

    def get(self, area_id: str) -> Optional[dict]:
        return next((a for a in self.areas(True) if a["id"] == area_id), None)

    def name_of(self, area_id: str) -> str:
        area = self.get(area_id) if area_id else None
        return area["name"] if area and not area["archived"] else "Sin área"

    def _save(self, area: dict):
        store.write_json(self._path(area["id"]), sanitize_area(area))
        self._cache = None

    def create(self, name: str, icon: str = "", colour: str = "#7986cb") -> dict:
        existing = {a["id"] for a in self.areas(True)}
        base = store.slug(name)
        area_id, n = base, 2
        while area_id in existing:
            area_id, n = f"{base}-{n}", n + 1
        order = max([a["order"] for a in self.areas(True)] or [0]) + 1
        area = sanitize_area({"id": area_id, "name": name.strip() or "Área",
                              "icon": icon, "colour": colour, "order": order})
        self._save(area)
        return area

    def update(self, area_id: str, **fields) -> Optional[dict]:
        area = self.get(area_id)
        if area is None:
            return None
        area.update({k: v for k, v in fields.items() if k in vault_format.AREA_KEYS and k != "id"})
        self._save(area)
        return area

    def archive(self, area_id: str, archived: bool = True):
        return self.update(area_id, archived=archived)

    def reorder(self, ids: list):
        for i, area_id in enumerate(ids):
            area = self.get(area_id)
            if area and area["order"] != i:
                area["order"] = i
                self._save(area)

    def create_suggested(self):
        have = {a["name"].lower() for a in self.areas(True)}
        for name, icon, colour in SUGGESTED_AREAS:
            if name.lower() not in have:
                self.create(name, icon, colour)

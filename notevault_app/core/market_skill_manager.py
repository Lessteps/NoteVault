"""
NoteVault Market Skill Manager
Manages the catalog of market-relevant transferable programming and technical skills.
Stores individual skills in .notevault/estudio/habilidades/<skill_id>.json.
"""

from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

DEFAULT_MARKET_SKILLS = [
    {
        "id": "problem_decomposition",
        "name": "Descomposición de Problemas",
        "category": "logic",
        "technology": "Agnóstico",
        "difficulty": 2,
        "market_demand": "critical",
        "prerequisites": [],
        "description": "Dividir problemas complejos en subproblemas independientes y funciones modulares.",
        "mastery": 0.0,
    },
    {
        "id": "algorithm_design",
        "name": "Diseño de Algoritmos y Complejidad",
        "category": "logic",
        "technology": "Python / JS",
        "difficulty": 3,
        "market_demand": "high",
        "prerequisites": ["problem_decomposition"],
        "description": "Seleccionar y optimizar algoritmos analizando complejidad temporal Big-O y espacial.",
        "mastery": 0.0,
    },
    {
        "id": "debugging",
        "name": "Depuración y Análisis de Errores",
        "category": "logic",
        "technology": "General",
        "difficulty": 2,
        "market_demand": "critical",
        "prerequisites": [],
        "description": "Lectura de trazas de error, hipótesis sistemáticas y fijación de causas raíz.",
        "mastery": 0.0,
    },
    {
        "id": "rest_apis",
        "name": "APIs RESTful y Manejo HTTP",
        "category": "backend",
        "technology": "FastAPI / Node.js",
        "difficulty": 3,
        "market_demand": "critical",
        "prerequisites": ["problem_decomposition"],
        "description": "Diseño de endpoints REST, códigos de estado HTTP, validación de payloads y serialización.",
        "mastery": 0.0,
    },
    {
        "id": "sql_postgresql",
        "name": "Bases de Datos y Consultas SQL",
        "category": "backend",
        "technology": "PostgreSQL / SQLite",
        "difficulty": 3,
        "market_demand": "critical",
        "prerequisites": [],
        "description": "Modelado de datos relacional, integridad referencial, JOINs, transacciones y consultas agregadas.",
        "mastery": 0.0,
    },
    {
        "id": "react_state",
        "name": "React y Gestión de Estado",
        "category": "frontend",
        "technology": "React / TypeScript",
        "difficulty": 3,
        "market_demand": "high",
        "prerequisites": ["problem_decomposition"],
        "description": "Componentes modulares, Hooks (useState, useEffect), flujo unidireccional y renderizado eficiente.",
        "mastery": 0.0,
    },
]


def sanitize_skill(raw: dict[str, Any], fallback_id: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    s_id = str(raw.get("id") or fallback_id or "").strip()
    prereqs = raw.get("prerequisites", [])
    if isinstance(prereqs, str):
        prereqs = [prereqs]
    elif not isinstance(prereqs, list):
        prereqs = []

    mastery = float(raw.get("mastery") or 0.0)
    mastery = round(max(0.0, min(1.0, mastery)), 2)

    return {
        "id": s_id,
        "name": str(raw.get("name") or s_id.replace("_", " ").title()),
        "category": str(raw.get("category") or "logic").lower(),
        "technology": str(raw.get("technology") or "General"),
        "difficulty": max(1, min(5, int(raw.get("difficulty") or 1))),
        "market_demand": str(raw.get("market_demand") or "medium"),
        "prerequisites": [str(p) for p in prereqs],
        "description": str(raw.get("description") or ""),
        "mastery": mastery,
        "exercises_count": int(raw.get("exercises_count") or 0),
    }


class MarketSkillManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / ".notevault" / "estudio" / "habilidades"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[dict[str, dict[str, Any]]] = None
        self._stamp = None
        self._ensure_defaults()

    def _path(self, skill_id: str) -> Path:
        return self.dir / f"{skill_id}.json"

    def _ensure_defaults(self):
        for default in DEFAULT_MARKET_SKILLS:
            p = self._path(default["id"])
            if not p.exists():
                store.write_json(p, sanitize_skill(default))

    def _dir_stamp(self):
        try:
            files = sorted(self.dir.glob("*.json"))
            return tuple((f.name, f.stat().st_mtime_ns) for f in files)
        except OSError:
            return ()

    def skills(self, category: Optional[str] = None) -> list[dict[str, Any]]:
        stamp = self._dir_stamp()
        if self._cache is None or stamp != self._stamp:
            out = {}
            for name, _ in stamp:
                p = self.dir / name
                if vault_format.is_sync_conflict(name):
                    continue
                data = store.load_json(p)
                if isinstance(data, dict):
                    clean = sanitize_skill(data, p.stem)
                    out[clean["id"]] = clean
            self._cache, self._stamp = out, stamp

        items = list(self._cache.values())
        if category:
            cat_low = category.lower()
            items = [s for s in items if s["category"] == cat_low]
        items.sort(key=lambda s: (s["category"], s["difficulty"], s["name"]))
        return [dict(s) for s in items]

    def get(self, skill_id: str) -> Optional[dict[str, Any]]:
        self.skills() # refresh cache if needed
        return self._cache.get(skill_id) if self._cache else None

    def update_mastery(self, skill_id: str, new_mastery: float) -> Optional[dict[str, Any]]:
        skill = self.get(skill_id)
        if not skill:
            return None
        skill["mastery"] = round(max(0.0, min(1.0, float(new_mastery))), 2)
        clean = sanitize_skill(skill)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

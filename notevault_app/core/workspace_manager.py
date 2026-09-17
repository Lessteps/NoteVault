"""
NoteVault Workspace Manager
Manages specialized learning workspace profiles (Mathematics, Programming, English, General).
Stores each profile in .notevault/workspaces/<workspace-id>.json.
"""

import json
from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

DEFAULT_WORKSPACES = [
    {
        "id": "mathematics",
        "name": "Matemáticas",
        "icon": "📐",
        "folders": ["Matemáticas", "Matematicas", "Math", "Mathematics"],
        "features": {
            "calculator": True,
            "graphing": True,
            "latex": True,
            "flashcards": True,
            "exercise_generation": True,
            "spaced_repetition": True,
            "code_execution": False,
            "debugging": False,
            "testing": False,
            "vocabulary": False,
            "grammar": False,
            "listening": False,
            "reading": False,
            "speaking": False,
            "writing": False,
        },
        "system_prompt": (
            "Actúa como un profesor experto y generador de ejercicios de matemáticas. "
            "Prioriza el razonamiento paso a paso, la descomposición de fórmulas y la dificultad progresiva."
        ),
    },
    {
        "id": "programming",
        "name": "Programación",
        "icon": "💻",
        "folders": ["Programación", "Programacion", "Programming", "Coding", "Code"],
        "features": {
            "calculator": False,
            "graphing": False,
            "latex": False,
            "flashcards": True,
            "exercise_generation": True,
            "spaced_repetition": True,
            "code_execution": True,
            "debugging": True,
            "testing": True,
            "projects": True,
            "vocabulary": False,
            "grammar": False,
            "listening": False,
            "reading": False,
            "speaking": False,
            "writing": False,
        },
        "system_prompt": (
            "Actúa como un mentor senior y generador de ejercicios de programación. "
            "Prioriza el razonamiento transferible, la descomposición de problemas, algoritmos limpios y testing."
        ),
    },
    {
        "id": "english",
        "name": "Inglés",
        "icon": "🌐",
        "folders": ["Inglés", "Ingles", "English", "Idiomas", "Languages"],
        "features": {
            "calculator": False,
            "graphing": False,
            "latex": False,
            "flashcards": True,
            "exercise_generation": True,
            "spaced_repetition": True,
            "code_execution": False,
            "debugging": False,
            "testing": False,
            "vocabulary": True,
            "grammar": True,
            "listening": True,
            "reading": True,
            "speaking": True,
            "writing": True,
        },
        "system_prompt": (
            "Act as an immersive English language tutor and exercise generator. "
            "Prioritize contextual vocabulary retrieval, natural expressions, grammar accuracy, and active communication."
        ),
    },
    {
        "id": "general",
        "name": "General",
        "icon": "📝",
        "folders": [],
        "features": {
            "calculator": False,
            "graphing": False,
            "latex": True,
            "flashcards": True,
            "exercise_generation": True,
            "spaced_repetition": True,
            "code_execution": False,
            "debugging": False,
            "testing": False,
            "vocabulary": False,
            "grammar": False,
            "listening": False,
            "reading": False,
            "speaking": False,
            "writing": False,
        },
        "system_prompt": (
            "Actúa como un tutor de estudio activo. Prioriza la comprensión conceptual, "
            "la recuperación activa (active recall) y la síntesis clara."
        ),
    },
]


def sanitize_workspace(raw: dict[str, Any], fallback_id: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    ws_id = str(raw.get("id") or fallback_id or "general").strip().lower()
    features = raw.get("features", {})
    if not isinstance(features, dict):
        features = {}

    folders = raw.get("folders", [])
    if isinstance(folders, str):
        folders = [folders]
    elif not isinstance(folders, list):
        folders = []

    return {
        "id": ws_id,
        "name": str(raw.get("name") or ws_id.capitalize()),
        "icon": str(raw.get("icon") or "📁"),
        "folders": [str(f) for f in folders],
        "features": {str(k): bool(v) for k, v in features.items()},
        "system_prompt": str(raw.get("system_prompt") or ""),
    }


class WorkspaceManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["workspaces_dir"]
        self._cache: Optional[list[dict[str, Any]]] = None
        self._stamp = None
        self._ensure_defaults()

    def _path(self, ws_id: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["workspace"].format(id=ws_id)

    def _ensure_defaults(self):
        self.dir.mkdir(parents=True, exist_ok=True)
        for default in DEFAULT_WORKSPACES:
            p = self._path(default["id"])
            if not p.exists():
                store.write_json(p, sanitize_workspace(default))

    def _dir_stamp(self):
        try:
            files = sorted(self.dir.glob("*.json"))
            return tuple((f.name, f.stat().st_mtime_ns) for f in files)
        except OSError:
            return ()

    def workspaces(self) -> list[dict[str, Any]]:
        stamp = self._dir_stamp()
        if self._cache is None or stamp != self._stamp:
            out = []
            for name, _ in stamp:
                path = self.dir / name
                if vault_format.is_sync_conflict(name):
                    continue
                data = store.load_json(path)
                if isinstance(data, dict):
                    out.append(sanitize_workspace(data, path.stem))
            # Sort with 'general' last
            out.sort(key=lambda w: (1 if w["id"] == "general" else 0, w["name"].lower()))
            self._cache, self._stamp = out, stamp
        return [dict(w) for w in self._cache]

    def get(self, ws_id: str) -> Optional[dict[str, Any]]:
        ws_id = ws_id.strip().lower()
        return next((w for w in self.workspaces() if w["id"] == ws_id), None)

    def save(self, workspace_data: dict[str, Any]) -> dict[str, Any]:
        clean = sanitize_workspace(workspace_data)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

    def detect_for_path(self, rel_path: str, frontmatter: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """
        Detect which workspace profile applies to a given relative note path.
        Priority:
          1. Explicit frontmatter 'workspace' or 'subject' property
          2. Folder match against configured workspace folder names
          3. Default 'general' workspace
        """
        all_ws = self.workspaces()
        general = self.get("general") or sanitize_workspace(DEFAULT_WORKSPACES[-1])

        # 1. Frontmatter check
        if frontmatter and isinstance(frontmatter, dict):
            explicit = str(frontmatter.get("workspace") or frontmatter.get("subject") or "").strip().lower()
            if explicit:
                for ws in all_ws:
                    if ws["id"] == explicit or ws["name"].lower() == explicit:
                        return ws

        # 2. Path components check
        clean_path = Path(rel_path.replace("\\", "/"))
        parts = [p.lower() for p in clean_path.parts]

        for ws in all_ws:
            if ws["id"] == "general":
                continue
            candidates = [f.lower() for f in ws.get("folders", [])] + [ws["id"].lower(), ws["name"].lower()]
            for part in parts:
                if part in candidates:
                    return ws

        return general

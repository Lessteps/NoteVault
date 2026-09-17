"""
NoteVault Workspace Manager
Manages specialized learning workspace profiles (Mathematics, Programming, English, General).
Stores each profile in .notevault/workspaces/<workspace-id>.json.
"""

import json
import unicodedata
from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

# How many leading folder components of a note's path are inspected when
# guessing its workspace. Keeps `PROJECTS/app/code/note.md` from being read
# as Programming just because a deep folder is called "code".
DETECT_MAX_DEPTH = 2


def _norm(text: str) -> str:
    """Case-fold + NFC-normalise, so accents that arrive from Android/Syncthing
    as decomposed characters (NFD) still match 'Matemáticas'."""
    return unicodedata.normalize("NFC", str(text)).strip().lower()


DEFAULT_WORKSPACES = [
    {
        "id": "mathematics",
        "name": "Matemáticas",
        "icon": "📐",
        "folders": ["Matemáticas", "Matematicas", "Math", "Mathematics"],
        "starter_folders": ["Álgebra", "Cálculo", "Estadística", "Fórmulas"],
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
        "starter_folders": ["Fundamentos", "Algoritmos", "Proyectos", "Snippets"],
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
        "starter_folders": ["Vocabulario", "Gramática", "Lecturas", "Writing"],
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

    starter = raw.get("starter_folders", [])
    if isinstance(starter, str):
        starter = [starter]
    elif not isinstance(starter, list):
        starter = []

    return {
        "id": ws_id,
        "name": str(raw.get("name") or ws_id.capitalize()),
        "icon": str(raw.get("icon") or "📁"),
        "folders": [str(f) for f in folders],
        "starter_folders": [str(f) for f in starter],
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

    # ── Study folder creation ────────────────────────────────────────────

    def folder_name(self, ws_id: str) -> str:
        """The canonical folder name to create for a workspace."""
        ws = self.get(ws_id)
        if ws and ws.get("folders"):
            return ws["folders"][0]
        return (ws or {}).get("name", ws_id.capitalize())

    def find_existing_folder(self, ws_id: str) -> Optional[Path]:
        """Return an already-present top-level folder for this workspace, if any
        of its known name variants exists (accent-insensitive). Else None."""
        ws = self.get(ws_id)
        if not ws:
            return None
        variants = {_norm(f) for f in ws.get("folders", [])}
        variants.add(_norm(ws["name"]))
        try:
            entries = list(self.vault_root.iterdir())
        except (OSError, ValueError):
            return None
        for entry in entries:
            try:
                if entry.is_dir() and _norm(entry.name) in variants:
                    return entry
            except OSError:
                continue
        return None

    def ensure_folder(self, ws_id: str, with_structure: bool = True) -> dict[str, Any]:
        """Create the study folder at the vault root if it does not exist.

        Never overwrites anything. Returns:
          {"path": Path, "created": bool, "index": Path|None, "subfolders": [Path]}
        """
        ws = self.get(ws_id)
        if not ws:
            raise ValueError(f"workspace desconocido: {ws_id}")

        existing = self.find_existing_folder(ws_id)
        created = existing is None
        folder = existing or (self.vault_root / self.folder_name(ws_id))
        folder.mkdir(parents=True, exist_ok=True)

        subfolders: list[Path] = []
        if with_structure:
            for sub in ws.get("starter_folders", []):
                sp = folder / sub
                if not sp.exists():
                    sp.mkdir(parents=True, exist_ok=True)
                subfolders.append(sp)

        # An index note carries `subject:` so the workspace is recognised even
        # if the folder is later renamed. Written only when absent.
        index = folder / "00 Índice.md"
        if not index.exists():
            body = (
                f"---\n"
                f"title: Índice de {ws['name']}\n"
                f"subject: {ws['id']}\n"
                f"topic: {ws['name']}\n"
                f"type: index\n"
                f"difficulty: 1\n"
                f"mastery: 0.0\n"
                f"tags: [estudio, {ws['id']}]\n"
                f"---\n\n"
                f"# {ws.get('icon', '')} {ws['name']}\n\n"
                f"Espacio de estudio de {ws['name']}. "
                f"Crea aquí tus notas; las herramientas de {ws['name']} se activan solas.\n"
            )
            try:
                index.write_text(body, encoding="utf-8")
            except OSError:
                index = None
        else:
            index = index if index.exists() else None

        return {
            "path": folder,
            "created": created,
            "index": index,
            "subfolders": subfolders,
        }

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

        # 1. Frontmatter check (subject/workspace wins over any folder guess)
        if frontmatter and isinstance(frontmatter, dict):
            explicit = _norm(frontmatter.get("workspace") or frontmatter.get("subject") or "")
            if explicit:
                for ws in all_ws:
                    if _norm(ws["id"]) == explicit or _norm(ws["name"]) == explicit:
                        return ws

        # 2. Path components check — only the first DETECT_MAX_DEPTH folders,
        #    never the filename, so a deep stray folder can't flip the mode.
        clean_path = Path(rel_path.replace("\\", "/"))
        dir_parts = [_norm(p) for p in clean_path.parts[:-1]][:DETECT_MAX_DEPTH]

        for ws in all_ws:
            if ws["id"] == "general":
                continue
            candidates = {_norm(f) for f in ws.get("folders", [])}
            candidates.add(_norm(ws["id"]))
            candidates.add(_norm(ws["name"]))
            if any(part in candidates for part in dir_parts):
                return ws

        return general

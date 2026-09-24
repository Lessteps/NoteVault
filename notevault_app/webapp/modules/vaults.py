"""Choosing the vault: recent ones, a folder picked with the system dialog,
or a new one. The page cannot open arbitrary folders: in the desktop window
a path must be a recent vault or one the user just picked."""

from __future__ import annotations

import re
from pathlib import Path

from ...config import AppConfig
from ..errors import ApiError

CODE_MARKERS = {"package.json", "pyproject.toml", "setup.py", "Cargo.toml", "go.mod",
                "pom.xml", "build.gradle", "Makefile", "CMakeLists.txt", ".git"}


def _scan(folder: Path, cap: int = 400) -> dict:
    info = {"markdown": 0, "folders": 0, "code_markers": 0, "truncated": False,
            "obsidian": (folder / ".obsidian").is_dir()}
    try:
        entries = list(folder.iterdir())
    except (OSError, ValueError):
        return info
    for entry in entries[:cap]:
        try:
            if entry.is_dir():
                if not entry.name.startswith("."):
                    info["folders"] += 1
            elif entry.suffix.lower() == ".md":
                info["markdown"] += 1
            if entry.name in CODE_MARKERS:
                info["code_markers"] += 1
        except OSError:
            continue
    info["truncated"] = len(entries) > cap
    return info


class VaultsApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _window and _open()."""

    def _vault_allowed(self) -> set:
        picked = getattr(self, "_picked_vaults", None)
        if picked is None:
            picked = self._picked_vaults = set()
        return picked

    def vault_list(self) -> list:
        with self._lock:
            out = []
            seen = set()
            for p in [self._root, *AppConfig.get_recent_vaults()]:
                key = str(Path(p).resolve())
                if key in seen:
                    continue
                seen.add(key)
                info = _scan(Path(p))
                out.append({"path": key, "name": Path(p).name, "current": Path(p).resolve() == self._root,
                            "exists": Path(p).is_dir(), **info})
            return out

    def vault_pick(self) -> dict:
        """System folder dialog (desktop window only)."""
        window = self._window
        if window is None:
            return {"ok": False, "fallback": True}
        import webview
        chosen = window.create_file_dialog(webview.FOLDER_DIALOG, directory=str(Path.home()))
        if not chosen:
            return {"ok": False}
        folder = Path(chosen[0] if isinstance(chosen, (list, tuple)) else chosen).resolve()
        self._vault_allowed().add(str(folder))
        return {"ok": True, "path": str(folder), "name": folder.name, **_scan(folder)}

    def vault_create(self, name: str) -> dict:
        """Pick where, then create a folder with a welcome note."""
        clean = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", str(name or "")).strip().strip(".")[:80]
        if not clean:
            raise ApiError("La vault necesita un nombre.")
        picked = self.vault_pick()
        if not picked.get("ok"):
            return picked
        folder = Path(picked["path"]) / clean
        try:
            folder.mkdir(parents=True, exist_ok=True)
            welcome = folder / "Bienvenida.md"
            if not welcome.exists():
                welcome.write_text(
                    f"# {clean}\n\nEsta es tu nueva vault. Crea notas y carpetas desde el explorador.\n\n"
                    "Enlaza otras notas escribiendo [[Nombre de la nota]].\n", encoding="utf-8")
        except OSError as e:
            raise ApiError(f"No se pudo crear: {e}") from None
        self._vault_allowed().add(str(folder.resolve()))
        return {"ok": True, "path": str(folder.resolve()), "name": clean}

    def vault_open(self, path: str) -> dict:
        with self._lock:
            folder = Path(str(path or "")).expanduser()
            try:
                folder = folder.resolve()
            except OSError:
                raise ApiError("Carpeta no válida.") from None
            recent = {str(Path(p).resolve()) for p in AppConfig.get_recent_vaults()}
            allowed = str(folder) in recent or str(folder) in self._vault_allowed() or self._window is None
            if not allowed:
                raise ApiError("Elige la carpeta con el diálogo del sistema.")
            if not folder.is_dir():
                raise ApiError(f"No existe la carpeta: {folder}")
            self._open(folder)
            AppConfig.set_active_vault(folder)
            return {"ok": True, "name": folder.name, "path": str(folder)}

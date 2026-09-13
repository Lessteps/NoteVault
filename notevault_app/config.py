"""
NoteVault Configuration
Manages vault paths, UI settings, and recent vaults list.
"""

import json
import os
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent

if getattr(sys, "frozen", False):
    PROJECT_ROOT = Path(sys.executable).resolve().parent
else:
    PROJECT_ROOT = APP_DIR.parent

# App data directory (settings, not vault content)
APP_DATA_DIR = Path.home() / ".notevault"
SETTINGS_FILE = APP_DATA_DIR / "settings.json"
APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Default vault location
DEFAULT_VAULT = Path.home() / "NoteVault"


class AppConfig:
    # ── Settings file ─────────────────────────────────────────────────────

    @staticmethod
    def _read() -> dict:
        if SETTINGS_FILE.exists():
            try:
                return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    @staticmethod
    def _write(data: dict):
        try:
            SETTINGS_FILE.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8"
            )
        except Exception as e:
            print(f"Error saving settings: {e}")

    # ── Theme ──────────────────────────────────────────────────────────────

    @staticmethod
    def get_theme() -> str:
        return AppConfig._read().get("theme", "dark")

    @staticmethod
    def set_theme(theme: str):
        s = AppConfig._read()
        s["theme"] = "light" if theme == "light" else "dark"
        AppConfig._write(s)

    # ── Active vault ───────────────────────────────────────────────────────

    @staticmethod
    def get_active_vault() -> Path:
        """Return the last opened vault. Falls back to ~/NoteVault."""
        s = AppConfig._read()
        p = s.get("active_vault")
        if p:
            candidate = Path(p)
            if candidate.exists() and candidate.is_dir():
                return candidate
        DEFAULT_VAULT.mkdir(parents=True, exist_ok=True)
        return DEFAULT_VAULT

    @staticmethod
    def set_active_vault(vault_path: Path):
        s = AppConfig._read()
        s["active_vault"] = str(vault_path)
        # Add to recent list
        recent = s.get("recent_vaults", [])
        vault_str = str(vault_path)
        if vault_str in recent:
            recent.remove(vault_str)
        recent.insert(0, vault_str)
        s["recent_vaults"] = recent[:10]  # keep last 10
        AppConfig._write(s)

    @staticmethod
    def get_recent_vaults() -> list[Path]:
        s = AppConfig._read()
        paths = []
        for p in s.get("recent_vaults", []):
            candidate = Path(p)
            if candidate.exists() and candidate.is_dir():
                paths.append(candidate)
        return paths

    # ── Last open note ─────────────────────────────────────────────────────

    @staticmethod
    def get_last_note(vault: Path) -> Path | None:
        s = AppConfig._read()
        vault_settings = s.get("vaults", {}).get(str(vault), {})
        p = vault_settings.get("last_note")
        if p:
            candidate = Path(p)
            if candidate.exists():
                return candidate
        return None

    @staticmethod
    def set_last_note(vault: Path, note_path: Path):
        s = AppConfig._read()
        vaults = s.setdefault("vaults", {})
        vault_settings = vaults.setdefault(str(vault), {})
        vault_settings["last_note"] = str(note_path)
        AppConfig._write(s)

    @staticmethod
    def get_pinned_tabs(vault: Path) -> list[Path]:
        """Pinned editor tabs for this vault that still exist, in order."""
        s = AppConfig._read()
        rels = s.get("vaults", {}).get(str(vault), {}).get("pinned_tabs", [])
        out = []
        for rel in rels:
            candidate = Path(vault) / rel
            if candidate.exists():
                out.append(candidate)
        return out

    @staticmethod
    def set_pinned_tabs(vault: Path, paths: list):
        rels = []
        for p in paths:
            try:
                rels.append(Path(p).relative_to(vault).as_posix())
            except ValueError:
                continue
        s = AppConfig._read()
        s.setdefault("vaults", {}).setdefault(str(vault), {})["pinned_tabs"] = rels
        AppConfig._write(s)

    @staticmethod
    def get_assistant_visible() -> bool:
        return AppConfig._read().get("assistant_visible", True)

    @staticmethod
    def set_assistant_visible(visible: bool):
        s = AppConfig._read()
        s["assistant_visible"] = bool(visible)
        AppConfig._write(s)

    # ── AI assistant ───────────────────────────────────────────────────────

    @staticmethod
    def get_ai_config() -> dict:
        return AppConfig._read().get("ai", {})

    @staticmethod
    def set_ai_config(cfg: dict):
        s = AppConfig._read()
        s["ai"] = cfg
        AppConfig._write(s)

    # ── Window geometry ────────────────────────────────────────────────────

    @staticmethod
    def get_window_state() -> dict:
        return AppConfig._read().get("window", {})

    @staticmethod
    def set_window_state(state: dict):
        s = AppConfig._read()
        s["window"] = state
        AppConfig._write(s)

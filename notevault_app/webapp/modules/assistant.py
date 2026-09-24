"""Asistente: chat about the open note with a local server (LM Studio,
Ollama…), an API (OpenAI, Anthropic) or a web chat through the clipboard.

The API key is stored where the classic app keeps it and never goes back to
the page: the settings only report whether one is set."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ...config import AppConfig
from ...core import ai_client as ai
from ...core.frontmatter_utils import parse_frontmatter
from ...core.workspace_manager import WorkspaceManager
from ..errors import ApiError
from .common import one_line

MAX_HISTORY = 40
MAX_TEXT = 60_000


def _public(cfg: ai.AIConfig) -> dict:
    return {"provider": cfg.provider, "base_url": cfg.base_url, "model": cfg.model,
            "has_key": bool(cfg.api_key), "temperature": cfg.temperature,
            "max_tokens": cfg.max_tokens, "include_note": cfg.include_note,
            "is_bridge": cfg.is_bridge}


class AssistantApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _resolve()."""

    @staticmethod
    def _ai_cfg() -> ai.AIConfig:
        return ai.AIConfig.from_dict(AppConfig.get_ai_config())

    def ai_settings(self) -> dict:
        cfg = self._ai_cfg()
        return {"config": _public(cfg),
                "providers": [{"key": p.key, "label": p.label, "hint": p.hint, "needs_key": p.needs_key,
                               "needs_url": p.needs_url, "default_url": p.default_url,
                               "default_model": p.default_model, "bridge": p.bridge} for p in ai.PROVIDERS]}

    def ai_settings_save(self, fields: dict) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos inválidos.")
        cfg = self._ai_cfg()
        provider = fields.get("provider", cfg.provider)
        if provider not in ai.PROVIDER_BY_KEY:
            raise ApiError("Proveedor desconocido.")
        cfg.provider = provider
        if "base_url" in fields:
            url = one_line(fields["base_url"], 300)
            parsed = urlparse(url)
            if url and (parsed.scheme not in ("http", "https") or not parsed.netloc):
                raise ApiError("La URL debe empezar por http:// o https://")
            cfg.base_url = url or ai.PROVIDER_BY_KEY[provider].default_url
        if "model" in fields:
            cfg.model = one_line(fields["model"], 200) or ai.PROVIDER_BY_KEY[provider].default_model
        if fields.get("clear_key"):
            cfg.api_key = ""
        elif fields.get("api_key"):
            cfg.api_key = one_line(fields["api_key"], 400)
        if "temperature" in fields:
            try:
                cfg.temperature = max(0.0, min(2.0, float(fields["temperature"])))
            except (TypeError, ValueError):
                raise ApiError("Temperatura inválida.") from None
        if "max_tokens" in fields:
            try:
                cfg.max_tokens = max(64, min(32_000, int(fields["max_tokens"])))
            except (TypeError, ValueError):
                raise ApiError("Máximo de tokens inválido.") from None
        if "include_note" in fields:
            cfg.include_note = bool(fields["include_note"])
        AppConfig.set_ai_config(cfg.to_dict())
        return _public(cfg)

    def ai_models(self) -> list:
        """The models the configured server offers (not under the API lock:
        this is a network call)."""
        try:
            return ai.list_models(self._ai_cfg())
        except ai.AIError as e:
            raise ApiError(str(e)) from None

    def ai_test(self) -> dict:
        cfg = self._ai_cfg()
        if cfg.is_bridge:
            return {"ok": True, "reply": "Modo web: no hay conexión que probar."}
        try:
            reply = ai.send_chat(cfg, [{"role": "user", "content": "Responde solo con: OK"}])
        except ai.AIError as e:
            raise ApiError(str(e)) from None
        return {"ok": True, "reply": reply[:200]}

    def ai_workspace(self, note_rel: str) -> dict:
        """The study workspace of a note (Matemáticas, Programación, Inglés or General)."""
        with self._lock:
            path = self._resolve(note_rel)
            fm, _ = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
            ws = WorkspaceManager(self._root).detect_for_path(note_rel, fm if isinstance(fm, dict) else {})
            return {"id": ws.get("id", "general"), "name": ws.get("name", "General"), "icon": ws.get("icon", "")}

    def ai_chat(self, history: list, question: str, note_rel: str = "", selection: str = "") -> dict:
        """Ask about the open note. With a web chat the prompt comes back to
        be copied, together with the site to open."""
        if not isinstance(history, list):
            raise ApiError("Historial inválido.")
        q = str(question or "").strip()[:MAX_TEXT]
        if not q:
            raise ApiError("Escribe una pregunta.")
        clean = []
        for m in history[-MAX_HISTORY:]:
            if isinstance(m, dict) and m.get("role") in ("user", "assistant"):
                clean.append({"role": m["role"], "content": str(m.get("content") or "")[:MAX_TEXT]})
        title = body = ws_prompt = ""
        if note_rel:
            with self._lock:
                path = self._resolve(note_rel)
                raw = path.read_text(encoding="utf-8", errors="replace")
                fm, body = parse_frontmatter(raw)
                title = path.stem
                ws = WorkspaceManager(self._root).detect_for_path(note_rel, fm if isinstance(fm, dict) else {})
                ws_prompt = ws.get("system_prompt", "") if ws.get("id") != "general" else ""
        cfg = self._ai_cfg()
        messages = ai.build_messages(cfg, clean, q, title, body, str(selection or "")[:MAX_TEXT],
                                     workspace_prompt=ws_prompt)
        if cfg.is_bridge:
            return {"bridge": True, "prompt": ai.build_bridge_prompt(messages),
                    "url": ai.BRIDGE_URLS.get(cfg.provider, ""), "label": cfg.info.label}
        try:
            return {"reply": ai.send_chat(cfg, messages)}
        except ai.AIError as e:
            raise ApiError(str(e)) from None

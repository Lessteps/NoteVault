"""Asistente through the web bridge: settings never leak the API key, the
note is sent as context, web chats go through the clipboard."""

import json
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

from notevault_app.webapp.api import ApiError, NoteVaultApi


class _Fake(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        _Fake.seen.append(body)
        out = json.dumps({"choices": [{"message": {"content": "respuesta de prueba"}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        out = json.dumps({"data": [{"id": "m1"}, {"id": "m2"}]}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(out)


class TestAssistantApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_ai_"))
        (self.dir / "Matemáticas").mkdir()
        (self.dir / "Matemáticas" / "Derivadas.md").write_text("# Derivadas\n\nLa regla de la cadena.\n", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        self.store = {}
        patcher = mock.patch("notevault_app.webapp.modules.assistant.AppConfig")
        cfg = patcher.start()
        self.addCleanup(patcher.stop)
        cfg.get_ai_config.side_effect = lambda: dict(self.store)
        cfg.set_ai_config.side_effect = lambda d: self.store.update(d)
        self.srv = HTTPServer(("127.0.0.1", 0), _Fake)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        _Fake.seen = []

    def tearDown(self):
        self.srv.shutdown()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_key_is_stored_but_never_returned(self):
        out = self.api.ai_settings_save({"provider": "openai", "api_key": "sk-secreta"})
        self.assertTrue(out["has_key"])
        self.assertNotIn("sk-secreta", json.dumps(self.api.ai_settings()))
        self.assertEqual(self.store["api_key"], "sk-secreta")
        self.api.ai_settings_save({"provider": "openai", "model": "gpt"})        # keeps the key
        self.assertEqual(self.store["api_key"], "sk-secreta")
        self.api.ai_settings_save({"provider": "openai", "clear_key": True})
        self.assertEqual(self.store["api_key"], "")

    def test_bad_settings(self):
        for bad in ({"provider": "skynet"}, {"provider": "openai", "base_url": "file:///etc"},
                    {"provider": "openai", "temperature": "caliente"}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.ai_settings_save(bad)

    def test_chat_sends_the_note_and_workspace(self):
        url = f"http://127.0.0.1:{self.srv.server_address[1]}/v1"
        self.api.ai_settings_save({"provider": "lmstudio", "base_url": url, "model": "m1"})
        self.assertEqual(self.api.ai_models(), ["m1", "m2"])
        r = self.api.ai_chat([{"role": "user", "content": "hola"}, {"role": "system", "content": "inyectado"}],
                             "¿Qué es?", "Matemáticas/Derivadas.md", "cadena")
        self.assertEqual(r["reply"], "respuesta de prueba")
        sent = json.dumps(_Fake.seen[-1]["messages"], ensure_ascii=False)
        self.assertIn("regla de la cadena", sent)
        self.assertNotIn("inyectado", sent)        # history cannot add system turns
        self.assertEqual(self.api.ai_workspace("Matemáticas/Derivadas.md")["id"], "mathematics")

    def test_web_chat_returns_the_prompt(self):
        self.api.ai_settings_save({"provider": "bridge_claude"})
        r = self.api.ai_chat([], "Explica", "Matemáticas/Derivadas.md")
        self.assertTrue(r["bridge"])
        self.assertTrue(r["url"].startswith("https://claude.ai"))
        self.assertIn("Explica", r["prompt"])

    def test_notes_outside_the_vault_are_refused(self):
        with self.assertRaises(ApiError):
            self.api.ai_chat([], "x", "../secreto.md")


if __name__ == "__main__":
    unittest.main()

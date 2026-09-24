"""Canvas files through the web bridge: Obsidian-compatible JSON, input
validated, confined to the vault."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestCanvasApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_canvas_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        (self.dir / "Nota.md").write_text("# Nota\n\nhola\n", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        self.rel = self.api.canvas_create("Mapa")["path"]

    def test_create_read_write_round_trip(self):
        self.assertEqual(self.rel, "Mapa.canvas")
        self.assertEqual(self.api.canvas_create("Mapa")["path"], "Mapa 1.canvas")
        data = self.api.canvas_read(self.rel)
        doc = {"nodes": [
            {"id": "a", "type": "text", "x": 0, "y": 0, "width": 200, "height": 80, "text": "Hola", "color": "4"},
            {"id": "b", "type": "file", "x": 300, "y": 0, "width": 200, "height": 80, "file": "Nota.md"},
            {"id": "c", "type": "nv-shape", "x": 0, "y": 200, "width": 160, "height": 60, "text": "¿x?",
             "nv": {"shape": "decision"}},
            {"id": "d", "type": "nv-drawing", "x": 0, "y": 400, "width": 100, "height": 100,
             "nv": {"strokes": [{"points": [[0, 0], [10, 10]], "color": "2", "width": 3}]}},
        ], "edges": [{"id": "e1", "fromNode": "a", "toNode": "b", "fromSide": "right", "toSide": "left"}]}
        r = self.api.canvas_write(self.rel, doc, data["modified"])
        self.assertTrue(r["ok"])
        on_disk = json.loads((self.dir / self.rel).read_text(encoding="utf-8"))
        self.assertEqual([n["id"] for n in on_disk["nodes"]], ["a", "b", "c", "d"])
        self.assertEqual(on_disk["nodes"][0]["color"], "4")
        self.assertEqual(on_disk["nodes"][2]["nv"]["shape"], "decision")
        self.assertEqual(on_disk["edges"][0]["toNode"], "b")
        # A stale write is refused, not silently overwritten.
        self.assertTrue(self.api.canvas_write(self.rel, doc, data["modified"] - 100)["conflict"])

    def test_bad_input_is_dropped(self):
        doc = {"nodes": [
            {"id": "a", "type": "text", "x": float("nan"), "y": 1e30, "width": -5, "text": "x", "color": "red;"},
            {"id": "a", "type": "text"},                      # duplicate id
            {"id": "../x", "type": "text"},
            {"id": "z", "type": "script"},
        ], "edges": [{"id": "e", "fromNode": "a", "toNode": "ghost"}]}
        self.api.canvas_write(self.rel, doc)
        out = self.api.canvas_read(self.rel)["doc"]
        self.assertEqual(len(out["nodes"]), 1)
        n = out["nodes"][0]
        self.assertEqual((n["x"], n["y"], n["width"]), (0, 10_000_000, 10))
        self.assertNotIn("color", n)
        self.assertEqual(out["edges"], [])

    def test_lists(self):
        (self.dir / "img").mkdir()
        (self.dir / "img" / "a.png").write_bytes(b"\x89PNG")
        (self.dir / ".trash").mkdir()
        (self.dir / ".trash" / "b.png").write_bytes(b"x")
        self.assertEqual([i["path"] for i in self.api.canvas_images()], ["img/a.png"])
        self.assertIn("Mapa.canvas", [c["path"] for c in self.api.canvas_list()])
        self.assertTrue(self.api.canvas_media("img/a.png")["data_url"].startswith("data:image/png;base64,"))

    def test_confined(self):
        for bad in ("../x.canvas", "Nota.md", ".trash/x.canvas"):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.canvas_read(bad)
        with self.assertRaises(ApiError):
            self.api.canvas_media("Nota.md")
        self.assertFalse(self.api.canvas_file_info("../../etc/passwd")["exists"])
        info = self.api.canvas_file_info("Nota.md")
        self.assertEqual(info["kind"], "note")
        self.assertIn("hola", info["text"])


if __name__ == "__main__":
    unittest.main()


class TestConceptMapApi(unittest.TestCase):
    SPEC = "title: T\nlayout: radial\nnodes:\n  - {id: a, title: Centro, role: root}\n  - {id: b, title: Hoja}\nedges:\n  - {from: a, to: b}\n"

    def setUp(self):
        from unittest import mock
        self.dir = Path(tempfile.mkdtemp(prefix="nv_map_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        (self.dir / "Ctx.md").write_text("contexto importante", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        p = mock.patch("notevault_app.webapp.modules.assistant.AppConfig")
        self.addCleanup(p.stop)
        p.start().get_ai_config.return_value = {"provider": "lmstudio", "base_url": "http://127.0.0.1:9/v1", "model": "m"}

    def test_yaml_order_builds_without_ai(self):
        out = self.api.map_generate(self.SPEC, [], name="Mapa")
        self.assertEqual(out["path"], "Mapa.canvas")
        doc = self.api.canvas_read(out["path"])["doc"]
        self.assertEqual(len(doc["nodes"]), 2)
        self.assertEqual(self.api.map_build(self.SPEC, "", "Mapa")["path"], "Mapa 1.canvas")

    def test_ai_reply_is_built_and_context_sent(self):
        from unittest import mock
        with mock.patch("notevault_app.core.ai_client.send_chat", return_value="```yaml\n" + self.SPEC + "```") as send:
            out = self.api.map_generate("mapa de algo", ["Ctx.md"], template="", name="IA")
        self.assertTrue(out["ok"])
        self.assertIn("contexto importante", send.call_args[0][1][1]["content"])

    def test_bad_input(self):
        self.assertFalse(self.api.map_build("nodes: [1, 2]")["ok"])
        self.assertFalse(self.api.map_build("- a\n- b")["ok"])
        self.assertFalse(self.api.map_build("{{{")["ok"])
        with self.assertRaises(ApiError):
            self.api.map_generate("x", ["../fuera.md"])
        self.assertTrue(self.api.map_templates())

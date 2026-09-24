"""Proyectos through the web bridge: same files as the Qt module, safe input."""

import base64
import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.project_manager import ProjectManager
from notevault_app.webapp.api import ApiError, NoteVaultApi

PNG = base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()


class TestProjectsApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_proj_"))
        self.api = NoteVaultApi(self.dir)
        self.p = self.api.projects_create({"name": "Portafolio web", "status": "En curso"})

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_create_and_board_numbers(self):
        self.assertEqual(self.p["key"], "PW")
        x = self.api.projects_issue_create(self.p["id"], {"title": "Hero", "priority": 3})
        self.assertEqual(x["key"], "PW-1")
        card = self.api.projects_list()[0]
        self.assertEqual(card["summary"]["total"], 1)
        # The Qt manager reads the same files.
        self.assertEqual(ProjectManager(self.dir).issues(self.p["id"])[0].title, "Hero")

    def test_kanban_move_to_done_stamps_done_at(self):
        x = self.api.projects_issue_create(self.p["id"], {"title": "Hero"})
        self.api.projects_issue_move(self.p["id"], x["id"], "Hecho", 0)
        issue = self.api.projects_get(self.p["id"])["issues"][0]
        self.assertTrue(issue["done"])
        self.assertIsNotNone(issue["done_at"])
        with self.assertRaises(ApiError):
            self.api.projects_issue_move(self.p["id"], x["id"], "Inventada", 0)

    def test_children_and_reparent(self):
        goal = self.api.projects_issue_create(self.p["id"], {"title": "MVP", "type": "Submeta"})
        task = self.api.projects_issue_create(self.p["id"], {"title": "Login"})
        self.api.projects_issue_update(self.p["id"], task["id"], {"parent": goal["id"]})
        data = self.api.projects_get(self.p["id"])
        by = {i["id"]: i for i in data["issues"]}
        self.assertEqual(by[goal["id"]]["children"], [task["id"]])
        self.assertEqual(data["stats"]["submetas"][0]["total"], 1)

    def test_columns_rename_keeps_issues(self):
        x = self.api.projects_issue_create(self.p["id"], {"title": "Hero", "status": "En curso"})
        self.api.projects_update(self.p["id"], {
            "columns": ["Backlog", "Haciendo", "Listo"], "done_column": "Listo",
            "renames": {"En curso": "Haciendo"}})
        issue = self.api.projects_get(self.p["id"])["issues"][0]
        self.assertEqual(issue["status"], "Haciendo")
        self.assertEqual(issue["id"], x["id"])

    def test_fields_cannot_inject_frontmatter(self):
        x = self.api.projects_issue_create(self.p["id"], {"title": "a\nstatus: Hecho"})
        self.api.projects_issue_update(self.p["id"], x["id"], {
            "labels": ["ui,ux", "x\ny"], "linked_notes": ["Notas/A.md"], "linked_folder": "Docs"})
        text = next((self.dir / ".notevault").rglob(f"{x['id']}.md")).read_text(encoding="utf-8")
        self.assertNotIn("\nstatus: Hecho", text.split("---")[1].replace('title: "a status: Hecho"', ""))
        issue = self.api.projects_get(self.p["id"])["issues"][0]
        self.assertEqual(issue["labels"], ["ui ux", "x y"])
        self.assertEqual(issue["linked_notes"], ["Notas/A.md"])
        for bad in ({"status": "Nope"}, {"type": "Épica"}, {"due_time": "7pm"}, {"attachments": ["../../x.png"]}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.projects_issue_update(self.p["id"], x["id"], bad)

    def test_project_notes_are_confined(self):
        made = self.api.projects_note_create(self.p["id"], "", "Idea")
        self.api.projects_note_write(self.p["id"], made["path"], "# Idea\n\ntexto\n")
        self.assertIn("texto", self.api.projects_note_read(self.p["id"], "Idea.md")["raw"])
        for bad in ("../Otro.md", "/etc/passwd", ".oculto.md", "x/../../y.md"):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.projects_note_write(self.p["id"], bad, "x")

    def test_attachments(self):
        x = self.api.projects_issue_create(self.p["id"], {"title": "Captura"})
        ref = self.api.attach_add("proyectos", x["id"], "shot.png", PNG)["ref"]
        self.api.projects_issue_update(self.p["id"], x["id"], {"attachments": [ref]})
        self.assertTrue(self.api.attach_read(ref)["data_url"].startswith("data:image/png;base64,"))
        for bad in (("notas", "x", "a.png", PNG), ("proyectos", "../x", "a.png", PNG),
                    ("proyectos", "x", "a.exe", PNG)):
            with self.subTest(bad=bad[:3]), self.assertRaises(ApiError):
                self.api.attach_add(*bad)
        with self.assertRaises(ApiError):
            self.api.attach_read("../secret.png")
        self.api.attach_remove(ref)
        with self.assertRaises(ApiError):
            self.api.attach_read(ref)

    def test_delete_goes_to_trash(self):
        self.api.projects_delete(self.p["id"])
        self.assertEqual(self.api.projects_list(), [])
        self.assertTrue(list((self.dir / ".notevault" / ".papelera").rglob("*.md")))


if __name__ == "__main__":
    unittest.main()

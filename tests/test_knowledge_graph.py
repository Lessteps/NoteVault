"""
Unit tests for KnowledgeGraph engine and typed relationships.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.knowledge_graph import KnowledgeGraph


class TestKnowledgeGraph(unittest.TestCase):
    def setUp(self):
        self.vault_dir = Path(tempfile.mkdtemp(prefix="nv_kg_test_"))

    def tearDown(self):
        shutil.rmtree(self.vault_dir, ignore_errors=True)

    def test_build_nodes_and_typed_edges(self):
        # Note 1: Functions
        n1 = self.vault_dir / "Functions.md"
        n1.write_text(
            "---\nsubject: mathematics\ntopic: calculus\ntype: concept\n---\n# Functions",
            encoding="utf-8"
        )

        # Note 2: Derivatives (requires Functions)
        n2 = self.vault_dir / "Derivatives.md"
        n2.write_text(
            "---\nsubject: mathematics\ntopic: calculus\nrequires: [Functions]\n---\n# Derivatives\nSee also [[Optimization]]",
            encoding="utf-8"
        )

        # Note 3: Optimization
        n3 = self.vault_dir / "Optimization.md"
        n3.write_text(
            "---\nsubject: mathematics\ntopic: calculus\n---\n# Optimization",
            encoding="utf-8"
        )

        kg = KnowledgeGraph(self.vault_dir)
        graph = kg.build_graph()

        self.assertEqual(graph["total_nodes"], 3)
        self.assertEqual(graph["total_edges"], 2)

        # Check prerequisite edge
        prereq_edge = next((e for e in graph["edges"] if e["relation_type"] == "prerequisite"), None)
        self.assertIsNotNone(prereq_edge)
        self.assertEqual(prereq_edge["source"], "Functions.md")
        self.assertEqual(prereq_edge["target"], "Derivatives.md")

        # Check related wikilink edge
        related_edge = next((e for e in graph["edges"] if e["relation_type"] == "related"), None)
        self.assertIsNotNone(related_edge)
        self.assertEqual(related_edge["source"], "Derivatives.md")
        self.assertEqual(related_edge["target"], "Optimization.md")


if __name__ == "__main__":
    unittest.main()

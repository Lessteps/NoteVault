"""
NoteVault Knowledge Graph Engine
Builds an interactive pedagogical graph of learning entities, wikilinks, and typed relationships.
Relationship types: prerequisite, related, part_of, uses, applied_by, practiced_by, common_error.
"""

from pathlib import Path
from typing import Any, Optional

from .vault_manager import VaultManager
from .frontmatter_utils import parse_frontmatter


class KnowledgeGraph:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.vault = VaultManager(self.vault_root)

    def build_graph(self) -> dict[str, Any]:
        """
        Scan all vault notes and construct the knowledge graph.
        Returns:
          {
            "nodes": [{"id", "title", "subject", "topic", "type", "mastery", "difficulty"}],
            "edges": [{"source", "target", "relation_type"}],
          }
        """
        notes = self.vault.all_notes()
        nodes = []
        edges = []
        nodes_by_title: dict[str, str] = {} # title.lower() -> node_id

        # 1. Build nodes
        for note in notes:
            node_id = str(note.rel_path.as_posix())
            fm, _ = parse_frontmatter(note.raw)

            subj = str(fm.get("subject") or "general").lower()
            topic = str(fm.get("topic") or "").strip()
            ntype = str(fm.get("type") or "concept").lower()
            difficulty = int(fm.get("difficulty") or 1)
            mastery = float(fm.get("mastery") or 0.0)

            node = {
                "id": node_id,
                "title": note.title,
                "subject": subj,
                "topic": topic,
                "type": ntype,
                "difficulty": difficulty,
                "mastery": mastery,
            }
            nodes.append(node)
            nodes_by_title[note.title.lower()] = node_id

        # 2. Build edges from frontmatter relations and wikilinks
        for note in notes:
            source_id = str(note.rel_path.as_posix())
            fm, _ = parse_frontmatter(note.raw)

            # Prerequisite relations
            prereqs = fm.get("prerequisites") or fm.get("requires", [])
            if isinstance(prereqs, str):
                prereqs = [prereqs]
            for p in prereqs:
                target_title = str(p).strip().lower()
                target_id = nodes_by_title.get(target_title)
                if target_id:
                    edges.append({
                        "source": target_id,
                        "target": source_id,
                        "relation_type": "prerequisite",
                    })

            # Uses / Used by
            uses_list = fm.get("uses", [])
            if isinstance(uses_list, str):
                uses_list = [uses_list]
            for u in uses_list:
                target_title = str(u).strip().lower()
                target_id = nodes_by_title.get(target_title)
                if target_id:
                    edges.append({
                        "source": source_id,
                        "target": target_id,
                        "relation_type": "uses",
                    })

            # Wikilinks (general bidirectional related links)
            for link in note.wikilinks:
                target_title = link.strip().lower()
                target_id = nodes_by_title.get(target_title)
                if target_id and target_id != source_id:
                    # Check if already added with a specific relation
                    exists = any(
                        e["source"] == source_id and e["target"] == target_id
                        for e in edges
                    )
                    if not exists:
                        edges.append({
                            "source": source_id,
                            "target": target_id,
                            "relation_type": "related",
                        })

        return {
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }

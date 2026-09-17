"""
NoteVault Knowledge Graph Engine
Builds an interactive pedagogical graph of learning entities, wikilinks, and typed relationships.
Relationship types: prerequisite, related, part_of, uses, applied_by, practiced_by, common_error.
"""

from pathlib import Path
from typing import Any, Optional

from .vault_manager import VaultManager
from .frontmatter_utils import parse_frontmatter


def _safe_int(value: Any, default: int = 0) -> int:
    """Parse a frontmatter value to int, tolerating strings like 'Beginner'."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


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

        # Parse each note's frontmatter exactly once and reuse below.
        fm_by_note: dict[int, dict] = {}

        # 1. Build nodes
        for note in notes:
            node_id = str(note.rel_path.as_posix())
            fm, _ = parse_frontmatter(note.raw)
            fm_by_note[id(note)] = fm

            subj = str(fm.get("subject") or "general").lower()
            topic = str(fm.get("topic") or "").strip()
            ntype = str(fm.get("type") or "concept").lower()
            difficulty = _safe_int(fm.get("difficulty"), 1)
            mastery = _safe_float(fm.get("mastery"), 0.0)

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

        # Track edges by (source, target) so dedup stays O(1) instead of O(E²).
        edge_pairs: set[tuple[str, str]] = set()

        # 2. Build edges from frontmatter relations and wikilinks
        for note in notes:
            source_id = str(note.rel_path.as_posix())
            fm = fm_by_note.get(id(note)) or {}

            # Prerequisite relations
            prereqs = fm.get("prerequisites") or fm.get("requires", [])
            if isinstance(prereqs, str):
                prereqs = [prereqs]
            for p in prereqs:
                target_title = str(p).strip().lower()
                target_id = nodes_by_title.get(target_title)
                if target_id and (target_id, source_id) not in edge_pairs:
                    edge_pairs.add((target_id, source_id))
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
                if target_id and (source_id, target_id) not in edge_pairs:
                    edge_pairs.add((source_id, target_id))
                    edges.append({
                        "source": source_id,
                        "target": target_id,
                        "relation_type": "uses",
                    })

            # Wikilinks (general bidirectional related links)
            for link in note.wikilinks:
                target_title = link.strip().lower()
                target_id = nodes_by_title.get(target_title)
                if target_id and target_id != source_id \
                        and (source_id, target_id) not in edge_pairs:
                    edge_pairs.add((source_id, target_id))
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

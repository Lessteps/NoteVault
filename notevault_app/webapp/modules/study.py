"""Estudio: the study side panel of Notas — the area's daily queue (exercises
to practise, spaced reviews, concept cards), its ledger of skills and the
error log of its subject. Same data and rules as the classic app."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from ...core import vault_format
from ...core.frontmatter_utils import parse_frontmatter
from ...core.practice import recommender as rc
from ...core.practice.cards import load_card
from ...core.practice.discipline_catalog import DISCIPLINES, skill_of
from ...core.practice.error_log import write_error_digest
from ...core.practice.ledger import BANDS, attempt_passed
from ...core.practice.modes import MODES
from ...core.practice.study_area import detect_study_area
from ...core.study_error_manager import StudyErrorManager
from ...core.study_srs_manager import StudySRSManager
from ...core.workspace_manager import WorkspaceManager
from ..errors import ApiError


def _exercise(ex, rel: str) -> dict:
    disc = DISCIPLINES.get(ex.discipline)
    skill = skill_of(disc, ex.skill) if disc and ex.skill else None
    mode = MODES.get(ex.mode)
    return {"path": rel, "note_id": ex.note_id, "title": ex.title, "discipline": disc.title if disc else ex.discipline,
            "skill": f"{ex.skill} {skill.title.split(' (')[0]}" if skill else ex.skill,
            "mode": mode.label if mode else ex.mode, "difficulty": ex.difficulty}


class StudyApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel, _resolve and _vault."""

    def _study_area(self, rel: str):
        path = self._resolve(rel, allow_root=True)
        is_dir = path.is_dir()
        if not is_dir and path.suffix.lower() not in (".md", ".canvas"):
            return None
        r = self._rel(path) if path != self._root else ""
        if is_dir:
            r += "/_"
        fm: dict = {}
        if not is_dir and path.suffix.lower() == ".md":
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    parsed, _ = parse_frontmatter(fh.read(4096))
                fm = parsed if isinstance(parsed, dict) else {}
            except OSError:
                fm = {}
        return detect_study_area(r, fm, WorkspaceManager(self._root).workspaces())

    def _study_rel(self, p) -> str:
        try:
            return self._rel(Path(p))
        except (ValueError, OSError):
            return ""

    def study_area(self, rel: str) -> dict | None:
        """The study area of a note, or None when it is not in one."""
        with self._lock:
            area = self._study_area(rel)
            if area is None:
                return None
            return {"subject": area.subject, "folder": area.folder, "title": area.title,
                    "subject_title": area.subject_title}

    def study_snapshot(self, rel: str) -> dict:
        with self._lock:
            area = self._study_area(rel)
            if area is None:
                raise ApiError("Esta nota no está en un área de estudio.")
            snap = rc.hub_snapshot(self._root, self._vault.note_paths(), area=area)
            srs = StudySRSManager(self._root)
            items = []
            for it in snap.queue["items"]:
                row: dict[str, Any] = {"kind": it.kind, "title": it.title, "reason": it.reason}
                if it.exercise is not None:
                    row["exercise"] = _exercise(it.exercise, self._study_rel(it.exercise.path))
                elif it.srs_item:
                    card = load_card(self._root, it.srs_item)
                    row["card"] = {"srs_id": it.srs_item.get("id"),
                                   "source": str(it.srs_item.get("source_note") or ""),
                                   "kind": card.kind if card else "",
                                   "question": card.question if card else "",
                                   "answer": card.answer if card else "",
                                   "missing": card is None}
                items.append(row)
            attempted = {nid for nid, d in snap.attempts.items() if d.get("attempts")}
            today = date.today().isoformat()
            due = {i["entity_id"]: i["next_review"] for i in snap.srs_items
                   if i.get("entity_type") == "exercise" and i["next_review"] <= today}
            ledgers = []
            for ledger in snap.ledgers.values():
                rows = []
                for row in ledger["skills"]:
                    refs = [e for e in snap.exercises if e.discipline == ledger["discipline"] and e.skill == row["code"]]
                    ex = rc.pick_exercise(refs, attempted, due) or (refs[0] if refs else None)
                    rows.append({
                        "code": row["code"], "title": row["title"].split(" (")[0], "status": row["status"],
                        "label": row["label"], "best": row.get("best"), "is_due": bool(row.get("is_due")),
                        "due": row.get("due") or "", "interval_days": row.get("interval_days"),
                        "bands": [b for b in BANDS if b in (row.get("bands") or [])],
                        "exercises": row["exercises"], "attempted": row["attempted_exercises"],
                        "practice": self._study_rel(ex.path) if ex else "",
                        "practice_title": ex.title if ex else "",
                    })
                ledgers.append({"title": ledger["title"], "skills": rows})
            chapters: dict = {}
            for e in snap.exercises:
                chapters.setdefault(e.chapter, [e.chapter_title, []])[1].append(e)
            concept_rows = []
            for key in sorted(chapters):
                title, refs = chapters[key]
                done, best = 0, None
                for e in refs:
                    atts = snap.attempts.get(e.note_id, {}).get("attempts", [])
                    if any(attempt_passed(a) for a in atts):
                        done += 1
                    scores = [int(a.get("score") or 0) for a in atts if a.get("verdict") != "ungraded"]
                    if scores:
                        best = max(best or 0, max(scores))
                concept_rows.append({"title": title, "done": done, "total": len(refs), "best": best})
            by_id = {e.note_id: e for e in snap.exercises}
            errors = []
            for err in snap.errors:
                ref = by_id.get(err.get("note_id") or err.get("exercise_id") or "")
                source = self._study_rel(ref.path) if ref else ""
                if not source and err.get("source_note"):
                    p = self._root / str(err["source_note"])
                    source = self._study_rel(p) if p.exists() else ""
                errors.append({
                    "id": err["id"], "repeat_count": err["repeat_count"], "category": err["category"],
                    "skill": rc.skill_label(err["discipline"], ref.skill if ref else err.get("skill", ""))
                    if err.get("discipline") else "",
                    "anchor": err.get("anchor") or "",
                    "description": err.get("description_en") or err.get("explanation") or "",
                    "fix": err.get("fix_en") or err.get("expected") or "",
                    "seen": (err.get("last_seen") or err.get("occurred_at") or "")[:10],
                    "note": ref.title if ref else (err.get("note_id") or err.get("topic") or ""),
                    "source": source,
                })
            errors.sort(key=lambda e: e["seen"], reverse=True)
            errors.sort(key=lambda e: e["repeat_count"], reverse=True)
            srs.all_items()          # warm: grading a card right after is cheap
            return {
                "area": {"subject": area.subject, "title": area.title, "subject_title": area.subject_title,
                         "folder": area.folder},
                "exercises": len(snap.exercises),
                "queue": {"items": items, "gaps": [g.message for g in snap.queue["gaps"] if g.message],
                          "counts": snap.queue["counts"]},
                "ledgers": ledgers, "concepts": concept_rows, "errors": errors,
            }

    def study_card_grade(self, srs_id: str, quality: int) -> dict:
        with self._lock:
            try:
                q = int(quality)
            except (TypeError, ValueError):
                raise ApiError("Calificación inválida.") from None
            if q not in (1, 3, 4, 5):
                raise ApiError("Calificación inválida.")
            if StudySRSManager(self._root).review(str(srs_id), q) is None:
                raise ApiError("Esa tarjeta ya no existe.")
            return {"ok": True}

    def study_error_resolve(self, error_id: str) -> dict:
        with self._lock:
            if StudyErrorManager(self._root).mark_resolved(str(error_id)) is None:
                raise ApiError("Ese error ya no existe.")
            write_error_digest(self._root)
            return {"ok": True}

    def study_error_digest(self) -> dict:
        with self._lock:
            path = self._root / vault_format.LAYOUT["study_error_digest"]
            try:
                return {"text": path.read_text(encoding="utf-8")}
            except OSError:
                return {"text": "Todavía no hay ERROR_LOG.md: se genera al corregir el primer intento."}


STUDY_IDS = ("mathematics", "programming", "english")


class StudyFoldersApi:
    """The Mathematics / Programming / English study folders, created from
    buttons at the vault root (nothing is ever overwritten)."""

    def study_folders(self) -> list:
        with self._lock:
            ws = WorkspaceManager(self._root)
            out = []
            for wid in STUDY_IDS:
                w = ws.get(wid)
                if not w:
                    continue
                folder = ws.find_existing_folder(wid)
                index = folder / "00 Índice.md" if folder else None
                out.append({"id": wid, "name": w["name"], "icon": w.get("icon", "📁"),
                            "exists": folder is not None,
                            "index": self._study_rel(index) if index and index.exists() else ""})
            return out

    def study_folder_create(self, ws_id: str, with_structure: bool = True) -> dict:
        if ws_id not in STUDY_IDS:
            raise ApiError("Espacio de estudio desconocido.")
        with self._lock:
            res = WorkspaceManager(self._root).ensure_folder(ws_id, bool(with_structure))
            return {"path": self._rel(res["path"]), "created": res["created"],
                    "index": self._study_rel(res["index"]) if res.get("index") else ""}

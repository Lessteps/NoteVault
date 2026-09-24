"""Práctica: exercise notes (frontmatter `type: exercise`) answered in the
app and graded by an AI teacher (HTTP, a web chat through the clipboard, or
a handoff file another agent answers). Every attempt lands in
.notevault/estudio like in the classic app: attempts, error log, SRS."""

from __future__ import annotations

import re
import secrets
import time
from pathlib import Path
from typing import Any

from ...config import AppConfig
from ...core import ai_client as ai
from ...core.practice import drills, handoff, modes
from ...core.practice.attempts import PracticeAttemptStore
from ...core.practice.discipline_catalog import discipline_for, skill_of
from ...core.practice.error_log import apply_result, recent_errors
from ...core.practice.exercise_note import ExerciseNote, is_practice_frontmatter, parse_exercise
from ...core.practice.grading import (
    GradeParseError, GradeResult, build_grading_messages, parse_grade_reply,
)
from ...core.practice.timer import parse_timer
from ...core.frontmatter_utils import parse_frontmatter
from ..errors import ApiError

MAX_ANSWER = 60_000
_REQ_RE = re.compile(r"^req_\d{14}_[0-9a-f]{6}$")
DRILL_TTL = 3 * 3600


def _result_dict(r: GradeResult) -> dict:
    return {"score": r.score, "verdict": r.verdict, "rubric": list(r.rubric),
            "errors": [{"category": e.category, "anchor": e.anchor, "description": e.description,
                        "evidence": e.evidence, "fix": e.fix} for e in r.errors],
            "feedback": r.feedback, "next_step": r.next_step, "example": r.example}


def _history(attempts: list) -> list:
    return [{"at": a.get("at", ""), "score": int(a.get("score") or 0), "verdict": a.get("verdict", ""),
             "quality": a.get("quality"), "seconds": a.get("seconds", 0), "transport": a.get("transport", "")}
            for a in attempts[-30:]]


def _int(v: Any, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return lo


class PracticeApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel and _resolve."""

    def _exercise(self, rel: str) -> tuple[Path, ExerciseNote]:
        path = self._resolve(rel)
        if not path.is_file() or path.suffix.lower() != ".md":
            raise ApiError("No es una nota.")
        text = path.read_text(encoding="utf-8", errors="replace")
        fm, _ = parse_frontmatter(text)
        if not is_practice_frontmatter(fm):
            raise ApiError("Esta nota no es un ejercicio (type: exercise).")
        try:
            return path, parse_exercise(text, path)
        except Exception as e:  # noqa: BLE001 - shown to the learner
            raise ApiError(f"No se pudo leer el ejercicio: {e}") from None

    def practice_load(self, rel: str) -> dict:
        with self._lock:
            path, ex = self._exercise(rel)
            mode = modes.MODES.get(ex.mode) or modes.mode_for(ex.frontmatter)
            disc = discipline_for(ex.frontmatter)
            skill = skill_of(disc, ex.skill) if ex.skill else None
            spec = parse_timer(ex.timer, ex.minutes, mode.timer)
            store = PracticeAttemptStore(self._root)
            data = store.load(ex.note_id)
            pending = None
            reqs = handoff.pending_for_note(self._root, ex.note_id)
            if reqs:
                r = reqs[-1]
                pending = {"id": str(r.get("id")), "answer": str(r.get("answer") or ""),
                           "hints_used": _int(r.get("hints_used"), 0, 50),
                           "seconds": _int(r.get("seconds"), 0, 10 ** 7),
                           "solution_seen": bool(r.get("solution_seen"))}
            return {
                "path": self._rel(path), "note_id": ex.note_id, "title": ex.title,
                "subject": ex.subject, "discipline": disc.title,
                "skill": f"{ex.skill} {skill.title}" if skill else "",
                "mode": {"id": mode.id, "label": mode.label, "answer_kind": mode.answer_kind},
                "difficulty": ex.difficulty, "level": ex.level, "assistance": ex.assistance,
                "timer": {"kind": spec.kind, "seconds": spec.seconds, "break_seconds": spec.break_seconds},
                "statement": ex.statement, "code": ex.code, "code_lang": ex.code_lang,
                "hints": ex.hints, "has_solution": bool(ex.solution.strip()),
                "rubric": ex.rubric,
                "drill": {"kind": ex.drill if ex.drill in drills.DRILL_KINDS else "arithmetic",
                          "label": drills.DRILL_KINDS.get(ex.drill, "Aritmética"), "items": ex.items}
                if mode.answer_kind == "drill" else None,
                "draft": data["draft"], "history": _history(data["attempts"]), "pending": pending,
            }

    def practice_solution(self, rel: str) -> dict:
        with self._lock:
            _path, ex = self._exercise(rel)
            return {"solution": ex.solution}

    def practice_save_draft(self, rel: str, text: str) -> dict:
        with self._lock:
            path, ex = self._exercise(rel)
            PracticeAttemptStore(self._root).save_draft(ex.note_id, self._rel(path), str(text or "")[:MAX_ANSWER])
            return {"ok": True}

    def _practice_messages(self, ex: ExerciseNote, answer: str, hints: int, seconds: int, seen: bool) -> list:
        try:
            recent = recent_errors(self._root, ex.subject)
        except Exception:  # noqa: BLE001 - the log is optional context
            recent = []
        return build_grading_messages(ex, answer, hints_used=hints, seconds=seconds,
                                      solution_seen=seen, recent_errors=recent)

    def _practice_apply(self, path: Path, ex: ExerciseNote, result: GradeResult, transport: str,
                        answer: str, hints: int, seconds: int, seen: bool) -> dict:
        attempt = apply_result(self._root, ex, self._rel(path), answer=answer, hints_used=hints,
                               seconds=seconds, solution_seen=seen, transport=transport, result=result)
        history = _history(PracticeAttemptStore(self._root).attempts(ex.note_id))
        return {"graded": True, "result": _result_dict(result), "quality": attempt.get("quality"),
                "history": history}

    def _practice_request(self, path: Path, ex: ExerciseNote, messages: list, answer: str,
                          hints: int, seconds: int, seen: bool) -> str:
        for old in handoff.pending_for_note(self._root, ex.note_id):
            handoff.close_request(self._root, old["id"])
        meta = {"note_id": ex.note_id, "note_path": self._rel(path), "subject": ex.subject,
                "mode": ex.mode, "answer": answer, "hints_used": hints, "seconds": seconds,
                "solution_seen": seen}
        return handoff.write_request(self._root, "grade", messages, meta)

    def practice_grade(self, rel: str, answer: str, hints_used: int = 0, seconds: int = 0,
                       solution_seen: bool = False, via: str = "") -> dict:
        """Grade an answer. With an HTTP provider the reply comes back graded;
        with a web chat (or via="handoff") a request file is written and the
        page waits for the reply (pasted, or written by an agent)."""
        answer = str(answer or "").strip()[:MAX_ANSWER]
        if not answer:
            raise ApiError("Escribe una respuesta antes de entregarla.")
        hints, secs, seen = _int(hints_used, 0, 50), _int(seconds, 0, 10 ** 7), bool(solution_seen)
        with self._lock:
            path, ex = self._exercise(rel)
            PracticeAttemptStore(self._root).save_draft(ex.note_id, self._rel(path), answer)
            messages = self._practice_messages(ex, answer, hints, secs, seen)
            cfg = self._ai_cfg()
            if via == "handoff" or cfg.is_bridge:
                req = self._practice_request(path, ex, messages, answer, hints, secs, seen)
                out = {"graded": False, "request": req,
                       "request_file": f".notevault/estudio/handoff/requests/{req}.md",
                       "response_file": handoff.response_path(self._root, req).as_posix(),
                       "request_path": (self._root / f".notevault/estudio/handoff/requests/{req}.md").as_posix()}
                if via != "handoff":
                    out.update(bridge=True, prompt=ai.build_bridge_prompt(messages),
                               url=ai.BRIDGE_URLS.get(cfg.provider, ""), label=cfg.info.label)
                return out
        # The network call runs outside the lock: the rest of the app stays usable.
        try:
            reply = ai.send_chat(cfg, messages)
        except ai.AIError as e:
            raise ApiError(f"No se pudo corregir: {e}") from None
        with self._lock:
            path, ex = self._exercise(rel)
            try:
                result = parse_grade_reply(reply, len(ex.rubric))
            except GradeParseError as e:
                raise ApiError(str(e)) from None
            return self._practice_apply(path, ex, result, "http", answer, hints, secs, seen)

    def practice_reply(self, rel: str, request: str, text: str = "") -> dict:
        """Finish a pending request with a pasted reply (text) or, without
        text, with the response file if an agent wrote it."""
        request = str(request or "")
        if not _REQ_RE.match(request):
            raise ApiError("Solicitud inválida.")
        with self._lock:
            path, ex = self._exercise(rel)
            req = handoff.read_request(self._root, request)
            if not req or req.get("note_id") != ex.note_id:
                raise ApiError("Esa solicitud ya no está pendiente.")
            transport = "bridge" if text else "handoff"
            reply = str(text or "") or handoff.read_response(self._root, request)
            if not reply:
                return {"graded": False, "waiting": True}
            try:
                result = parse_grade_reply(reply, len(ex.rubric))
            except GradeParseError as e:
                raise ApiError(str(e)) from None
            handoff.close_request(self._root, request)
            return self._practice_apply(
                path, ex, result, transport, str(req.get("answer") or ""),
                _int(req.get("hints_used"), 0, 50), _int(req.get("seconds"), 0, 10 ** 7),
                bool(req.get("solution_seen")))

    def practice_discard(self, rel: str, request: str) -> dict:
        request = str(request or "")
        if not _REQ_RE.match(request):
            raise ApiError("Solicitud inválida.")
        with self._lock:
            _path, ex = self._exercise(rel)
            req = handoff.read_request(self._root, request)
            if req and req.get("note_id") == ex.note_id:
                handoff.close_request(self._root, request)
            return {"ok": True}

    def practice_give_up(self, rel: str, seconds: int = 0, hints_used: int = 0) -> dict:
        """Seeing the solution without an answer counts as a failed attempt."""
        with self._lock:
            path, ex = self._exercise(rel)
            result = GradeResult(
                score=0, verdict="incorrect", rubric=[False] * len(ex.rubric), errors=[],
                feedback="Viste la solución sin entregar una respuesta.",
                next_step="Estudia la solución y vuelve a escribirla de memoria mañana, sin mirarla.",
                example="", raw="")
            out = self._practice_apply(path, ex, result, "local", "", _int(hints_used, 0, 50),
                                       _int(seconds, 0, 10 ** 7), True)
            out["solution"] = ex.solution
            return out

    # ── drills: generated and checked here, so answers never reach the page early ──

    def _drills(self) -> dict:
        if not hasattr(self, "_drill_sessions_store"):
            self._drill_sessions_store = {}
        now = time.monotonic()
        for k in [k for k, v in self._drill_sessions_store.items() if now - v["at"] > DRILL_TTL]:
            del self._drill_sessions_store[k]
        return self._drill_sessions_store

    def practice_drill_start(self, rel: str) -> dict:
        with self._lock:
            path, ex = self._exercise(rel)
            kind = ex.drill if ex.drill in drills.DRILL_KINDS else "arithmetic"
            items = drills.generate(kind, min(ex.items, 200), ex.difficulty)
            sid = secrets.token_hex(8)
            self._drills()[sid] = {"at": time.monotonic(), "rel": self._rel(path), "items": items, "results": []}
            return {"session": sid, "prompts": [i.prompt for i in items]}

    def practice_drill_check(self, session: str, index: int, given: str, seconds: float = 0) -> dict:
        with self._lock:
            s = self._drills().get(str(session))
            if not s:
                raise ApiError("La sesión de cálculo terminó.")
            i = _int(index, 0, 10 ** 6)
            if i != len(s["results"]) or i >= len(s["items"]):
                raise ApiError("Respuesta fuera de orden.")
            item = s["items"][i]
            given = str(given or "")[:200]
            ok = drills.check(item, given)
            try:
                secs = max(0.0, min(3600.0, float(seconds)))
            except (TypeError, ValueError):
                secs = 0.0
            s["results"].append((item, given, ok, secs))
            return {"ok": ok, "answer": item.answer}

    def practice_drill_finish(self, session: str, seconds: int = 0) -> dict:
        with self._lock:
            s = self._drills().pop(str(session), None)
            if not s:
                raise ApiError("La sesión de cálculo terminó.")
            results = s["results"] + [(item, "", False, 0.0) for item in s["items"][len(s["results"]):]]
            result = drills.summarize(results)
            transcript = "\n".join(f"{item.prompt} = {given or '—'}  {'✓' if ok else '✗ (' + item.answer + ')'}"
                                   for item, given, ok, _ in results)
            path, ex = self._exercise(s["rel"])
            return self._practice_apply(path, ex, result, "local", transcript, 0, _int(seconds, 0, 10 ** 7), False)

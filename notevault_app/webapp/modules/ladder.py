"""Escalera de demostración: practice a theorem note level by level (L1
strategy … L6 variant). L2 (ordering) is checked here; the other levels are
graded by the AI like Práctica. Steps a level hides never reach the page."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ...core import ai_client as ai
from ...core.practice import handoff, ladder
from ...core.practice.attempts import PracticeAttemptStore
from ...core.practice.error_log import apply_result, recent_errors
from ...core.practice.grading import GradeParseError, GradeResult, parse_grade_reply
from ...core.practice.timer import parse_timer
from ..errors import ApiError
from .practice import MAX_ANSWER, _REQ_RE, _history, _int, _result_dict


def _clean_fields(data: Any, n: int) -> list[str]:
    fields = data.get("fields") if isinstance(data, dict) else None
    if not isinstance(fields, list):
        return []
    return [str(f or "")[:MAX_ANSWER] for f in fields[:max(1, n)]]


class LadderApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel, _resolve and _ai_cfg."""

    def _proof(self, rel: str) -> tuple[Path, ladder.ProofNote]:
        path = self._resolve(rel)
        if not path.is_file() or path.suffix.lower() != ".md":
            raise ApiError("No es una nota.")
        proof = ladder.ladder_note(path.read_text(encoding="utf-8", errors="replace"), path)
        if proof is None:
            raise ApiError("No se pudieron leer los pasos de esta demostración: ábrela en el editor.")
        return path, proof

    def _ladder_state(self, proof: ladder.ProofNote) -> tuple[ladder.LadderState, list]:
        atts = PracticeAttemptStore(self._root).attempts(proof.note_id)
        top = max(ladder.available_levels(proof))
        return ladder.ladder_state(atts, top), atts

    def _ladder_level_check(self, proof: ladder.ProofNote, level: Any, unlocked: bool = False) -> int:
        lv = _int(level, 0, 99)
        if lv not in ladder.available_levels(proof):
            raise ApiError("Nivel inválido.")
        if unlocked and not self._ladder_state(proof)[0].unlocked(lv):
            raise ApiError(f"El nivel {lv} todavía está bloqueado: supera antes el anterior.")
        return lv

    @staticmethod
    def _draft_key(proof: ladder.ProofNote, level: int) -> str:
        return f"{proof.note_id}#L{level}"

    def ladder_load(self, rel: str) -> dict:
        with self._lock:
            path, proof = self._proof(rel)
            state, atts = self._ladder_state(proof)
            levels = ladder.available_levels(proof)
            pending = None
            for req in handoff.pending_for_note(self._root, proof.note_id):
                if ladder.level_of(req.get("mode")) in levels:
                    pending = {"id": str(req.get("id")), "level": ladder.level_of(req.get("mode"))}
            return {
                "path": self._rel(path), "title": proof.title, "subject": proof.subject,
                "technique": proof.technique, "difficulty": proof.difficulty,
                "statement": ladder.statement_markdown(proof), "steps": len(proof.steps),
                "levels": [{"number": n, "label": ladder.LEVELS[n].label} for n in levels],
                "state": {"current": state.current, "passed": sorted(state.passed),
                          "best": {str(k): v for k, v in state.best.items()},
                          "count": {str(k): v for k, v in state.count.items()}},
                "history": [dict(h, level=ladder.level_of(a.get("mode")))
                            for h, a in zip(_history(atts), atts[-30:])],
                "pending": pending,
            }

    def ladder_level(self, rel: str, level: int) -> dict:
        """What one level shows: the steps it may reveal, never the hidden ones."""
        with self._lock:
            _path, proof = self._proof(rel)
            lv = self._ladder_level_check(proof, level, unlocked=True)
            state, _ = self._ladder_state(proof)
            store = PracticeAttemptStore(self._root)
            try:
                draft = json.loads(store.draft(self._draft_key(proof, lv)) or "{}")
            except ValueError:
                draft = {}
            draft = draft if isinstance(draft, dict) else {}
            n = len(proof.steps)
            seed = f"{proof.note_id}:{lv}:{state.count.get(lv, 0)}"
            info = ladder.LEVELS[lv]
            spec = parse_timer(info.timer, 0, "stopwatch")
            out: dict = {"level": lv, "label": info.label, "task": info.task,
                         "timer": {"kind": spec.kind, "seconds": spec.seconds, "break_seconds": spec.break_seconds},
                         "fields": _clean_fields(draft, n)}
            if lv == 2:
                order = draft.get("order")
                if not (isinstance(order, list) and sorted(order) == list(range(n))):
                    order = ladder.shuffled_order(n, seed)
                out["order"] = order
                out["steps"] = [{"text": s.text} for s in proof.steps]
            elif lv == 3:
                hidden = draft.get("hidden")
                if not (isinstance(hidden, list) and hidden and all(isinstance(i, int) and 0 <= i < n for i in hidden)):
                    hidden = ladder.hidden_steps(n, seed)
                out["hidden"] = sorted(hidden)
                out["steps"] = [{"text": "", "why": ""} if i in hidden else {"text": s.text, "why": s.why}
                                for i, s in enumerate(proof.steps)]
            elif lv == 4:
                out["steps"] = [{"text": s.text} for s in proof.steps]
            elif lv == 6:
                v = draft.get("variant")
                out["variants"] = proof.variants
                out["variant"] = v if isinstance(v, int) and 0 <= v < len(proof.variants) \
                    else state.count.get(6, 0) % max(1, len(proof.variants))
            return out

    def ladder_save_draft(self, rel: str, level: int, data: dict) -> dict:
        with self._lock:
            path, proof = self._proof(rel)
            lv = self._ladder_level_check(proof, level)
            clean = self._ladder_data(proof, lv, data)
            empty = not any(f.strip() for f in clean["fields"]) and "order" not in clean
            PracticeAttemptStore(self._root).save_draft(
                self._draft_key(proof, lv), self._rel(path), "" if empty else json.dumps(clean, ensure_ascii=False))
            return {"ok": True}

    def _ladder_data(self, proof: ladder.ProofNote, lv: int, data: Any) -> dict:
        n = len(proof.steps)
        data = data if isinstance(data, dict) else {}
        out: dict = {"fields": _clean_fields(data, n)}
        if lv == 2:
            order = data.get("order")
            if not (isinstance(order, list) and sorted(order) == list(range(n))):
                raise ApiError("Orden inválido.")
            out["order"] = [int(i) for i in order]
        if lv == 3:
            hidden = data.get("hidden")
            if not (isinstance(hidden, list) and hidden and all(isinstance(i, int) and 0 <= i < n for i in hidden)):
                raise ApiError("Pasos ocultos inválidos.")
            out["hidden"] = sorted(set(hidden))
        if lv == 6:
            v = data.get("variant")
            if not (isinstance(v, int) and 0 <= v < len(proof.variants)):
                raise ApiError("Variante inválida.")
            out["variant"] = v
        return out

    @staticmethod
    def _ladder_answer(lv: int, d: dict) -> str:
        texts = [t.strip() for t in d["fields"]]
        if lv == 2:
            return "Orden: " + ", ".join(str(i + 1) for i in d["order"])
        if lv == 3:
            return "\n\n".join(f"Paso {i + 1}: {t}" for i, t in zip(d["hidden"], texts))
        if lv == 4:
            return "\n\n".join(f"Paso {i + 1} — Por qué: {t}" for i, t in enumerate(texts))
        return texts[0] if texts else ""

    @staticmethod
    def _ladder_shown(proof: ladder.ProofNote, lv: int, d: dict) -> str:
        if lv == 3:
            return "\n".join(f"{i + 1}. [HIDDEN — the learner writes this step]" if i in d["hidden"]
                             else f"{i + 1}. {s.text}" + (f" (Por qué: {s.why})" if s.why else "")
                             for i, s in enumerate(proof.steps))
        if lv == 4:
            return ladder.proof_markdown(proof, with_why=False)
        return "Only the theorem statement."

    def _ladder_finish(self, path: Path, proof: ladder.ProofNote, lv: int, d: dict, result: GradeResult,
                       transport: str, answer: str, seconds: int, seen: bool) -> dict:
        before, _ = self._ladder_state(proof)
        rubric = ladder.rubric_for(proof, lv, d.get("hidden"))
        ex = ladder.level_exercise(proof, lv, rubric)
        attempt = apply_result(self._root, ex, self._rel(path), answer=answer, hints_used=0, seconds=seconds,
                               solution_seen=seen, transport=transport, result=result,
                               entity_type=ladder.mode_id(lv))
        PracticeAttemptStore(self._root).save_draft(self._draft_key(proof, lv), self._rel(path), "")
        after, _ = self._ladder_state(proof)
        ok = ladder.passed(result.score, seen)
        top = max(ladder.available_levels(proof))
        if ok and lv == top:
            msg = "Escalera completada: repasa cuando te lo pida el repaso espaciado."
        elif ok and after.current > before.current:
            msg = f"Nivel superado · se desbloquea L{after.current}"
        elif ok:
            msg = "Nivel superado"
        elif after.current < before.current:
            msg = f"No superado · bajas a L{after.current}"
        else:
            msg = "No superado · repite este nivel"
        return {"graded": True, "result": _result_dict(result), "quality": attempt.get("quality"),
                "rubric": rubric, "passed": ok, "message": msg, "current": after.current}

    def ladder_grade(self, rel: str, level: int, data: dict, seconds: int = 0,
                     solution_seen: bool = False, via: str = "") -> dict:
        secs, seen = _int(seconds, 0, 10 ** 7), bool(solution_seen)
        with self._lock:
            path, proof = self._proof(rel)
            lv = self._ladder_level_check(proof, level, unlocked=True)
            d = self._ladder_data(proof, lv, data)
            answer = self._ladder_answer(lv, d)
            if lv == 2:
                return self._ladder_finish(path, proof, lv, d, ladder.local_order_result(d["order"]),
                                           "local", answer, secs, seen)
            texts = [t.strip() for t in d["fields"]]
            expected = len(d["hidden"]) if lv == 3 else len(proof.steps) if lv == 4 else 1
            if len(texts) < expected or not all(texts[:expected]):
                raise ApiError("Completa todos los huecos antes de entregar." if expected > 1
                               else "Escribe una respuesta antes de entregarla.")
            try:
                recent = recent_errors(self._root, proof.subject)
            except Exception:  # noqa: BLE001 - optional context
                recent = []
            variant = proof.variants[d["variant"]] if lv == 6 else ""
            messages = ladder.build_ladder_messages(
                proof, lv, answer, rubric=ladder.rubric_for(proof, lv, d.get("hidden")),
                shown=self._ladder_shown(proof, lv, d), seconds=secs, solution_seen=seen,
                recent_errors=recent, variant=variant)
            PracticeAttemptStore(self._root).save_draft(self._draft_key(proof, lv), self._rel(path),
                                                        json.dumps(d, ensure_ascii=False))
            cfg = self._ai_cfg()
            if via == "handoff" or cfg.is_bridge:
                for old in handoff.pending_for_note(self._root, proof.note_id):
                    handoff.close_request(self._root, old["id"])
                meta = {"note_id": proof.note_id, "note_path": self._rel(path), "subject": proof.subject,
                        "mode": ladder.mode_id(lv), "level": lv, "answer": answer, "hints_used": 0,
                        "seconds": secs, "solution_seen": seen, **d}
                req = handoff.write_request(self._root, "grade", messages, meta)
                out = {"graded": False, "request": req,
                       "request_path": (self._root / f".notevault/estudio/handoff/requests/{req}.md").as_posix(),
                       "response_file": handoff.response_path(self._root, req).as_posix()}
                if via != "handoff":
                    out.update(bridge=True, prompt=ai.build_bridge_prompt(messages),
                               url=ai.BRIDGE_URLS.get(cfg.provider, ""), label=cfg.info.label)
                return out
        try:
            reply = ai.send_chat(cfg, messages)
        except ai.AIError as e:
            raise ApiError(f"No se pudo corregir: {e}") from None
        with self._lock:
            path, proof = self._proof(rel)
            rubric = ladder.rubric_for(proof, lv, d.get("hidden"))
            try:
                result = parse_grade_reply(reply, len(rubric))
            except GradeParseError as e:
                raise ApiError(str(e)) from None
            return self._ladder_finish(path, proof, lv, d, result, "http", answer, secs, seen)

    def ladder_reply(self, rel: str, request: str, text: str = "") -> dict:
        request = str(request or "")
        if not _REQ_RE.match(request):
            raise ApiError("Solicitud inválida.")
        with self._lock:
            path, proof = self._proof(rel)
            req = handoff.read_request(self._root, request)
            if not req or req.get("note_id") != proof.note_id:
                raise ApiError("Esa solicitud ya no está pendiente.")
            lv = self._ladder_level_check(proof, ladder.level_of(req.get("mode")))
            reply = str(text or "") or handoff.read_response(self._root, request)
            if not reply:
                return {"graded": False, "waiting": True}
            d = self._ladder_data(proof, lv, req)
            rubric = ladder.rubric_for(proof, lv, d.get("hidden"))
            try:
                result = parse_grade_reply(reply, len(rubric))
            except GradeParseError as e:
                raise ApiError(str(e)) from None
            handoff.close_request(self._root, request)
            return self._ladder_finish(path, proof, lv, d, result, "bridge" if text else "handoff",
                                       str(req.get("answer") or ""), _int(req.get("seconds"), 0, 10 ** 7),
                                       bool(req.get("solution_seen")))

    def ladder_discard(self, rel: str, request: str) -> dict:
        request = str(request or "")
        if not _REQ_RE.match(request):
            raise ApiError("Solicitud inválida.")
        with self._lock:
            _path, proof = self._proof(rel)
            req = handoff.read_request(self._root, request)
            if req and req.get("note_id") == proof.note_id:
                handoff.close_request(self._root, request)
            return {"ok": True}

    def ladder_proof(self, rel: str) -> dict:
        with self._lock:
            _path, proof = self._proof(rel)
            parts = []
            if proof.strategy:
                parts.append(f"**Estrategia:** {proof.strategy}")
            if proof.key_idea:
                parts.append(f"**Idea clave:** {proof.key_idea}")
            parts.append(ladder.proof_markdown(proof))
            return {"proof": "\n\n".join(parts)}

    def ladder_give_up(self, rel: str, level: int, data: dict, seconds: int = 0) -> dict:
        """Seeing the proof with nothing written counts as a failed attempt."""
        with self._lock:
            path, proof = self._proof(rel)
            lv = self._ladder_level_check(proof, level)
            d = self._ladder_data(proof, lv, data)
            rubric = ladder.rubric_for(proof, lv, d.get("hidden"))
            result = GradeResult(score=0, verdict="incorrect", rubric=[False] * len(rubric), errors=[],
                                 feedback="Viste la demostración sin entregar una respuesta.",
                                 next_step="Estudia la demostración y vuelve a este nivel mañana, sin mirarla.",
                                 example="", raw="")
            out = self._ladder_finish(path, proof, lv, d, result, "local", "", _int(seconds, 0, 10 ** 7), True)
            out["proof"] = self.ladder_proof(rel)["proof"]
            return out

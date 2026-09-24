"""File handoff transport: request/response files that an editor agent processes."""

import os
import secrets
from datetime import datetime
from pathlib import Path

from .. import store, vault_format
from ..ai_client import build_bridge_prompt
from .grading import JSON_CONTRACT


def new_request_id() -> str:
    return f"req_{datetime.now().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(3)}"


def _request_path(vault_root: Path, req_id: str) -> Path:
    return Path(vault_root) / vault_format.LAYOUT["study_handoff_request"].format(id=req_id)


def response_path(vault_root: Path, req_id: str) -> Path:
    return Path(vault_root) / vault_format.LAYOUT["study_handoff_response"].format(id=req_id)


def _instructions(kind: str, response_rel: str) -> str:
    if kind == "grade":
        what = ("Write ONLY the grade JSON object below (no prose, no code fence) to this file, "
                "encoded as UTF-8:\n\n" + JSON_CONTRACT)
    else:
        what = "Write your complete reply, exactly as the messages above ask, to this file."
    return (f"# Instructions for the agent\n\n"
            f"Process the request above. Response file (relative to the vault root): "
            f"`{response_rel}`\n\n{what}\n\n"
            "Do not modify any other file of the vault.")


def write_request(vault_root: Path, kind: str, messages: list[dict], meta: dict) -> str:
    req_id = new_request_id()
    response_rel = vault_format.LAYOUT["study_handoff_response"].format(id=req_id)
    data = {
        "id": req_id,
        "kind": kind,
        "created": datetime.now().isoformat(timespec="seconds"),
        "note_id": str(meta.get("note_id") or ""),
        "note_path": str(meta.get("note_path") or ""),
        "messages": messages,
        "response_file": f"responses/{req_id}.json",
    }
    for key, value in meta.items():
        data.setdefault(key, value)
    path = _request_path(vault_root, req_id)
    store.write_json(path, data)
    prompt = build_bridge_prompt(messages) + "\n\n---\n\n" + _instructions(kind, response_rel)
    store.write_text(path.with_suffix(".md"), prompt + "\n")
    response_path(vault_root, req_id).parent.mkdir(parents=True, exist_ok=True)
    return req_id


def read_response(vault_root: Path, req_id: str) -> str | None:
    path = response_path(vault_root, req_id)
    for candidate in (path, path.with_suffix(".md")):
        try:
            text = candidate.read_text(encoding="utf-8-sig")
        except OSError:
            continue
        if text.strip():
            return text
    return None


def close_request(vault_root: Path, req_id: str) -> None:
    path = _request_path(vault_root, req_id)
    done = path.parent / "done"
    for src in (path, path.with_suffix(".md")):
        if src.exists():
            done.mkdir(parents=True, exist_ok=True)
            os.replace(src, done / src.name)


def pending_requests(vault_root: Path) -> list[str]:
    """Ids of the requests not closed yet, oldest first."""
    folder = _request_path(vault_root, "x").parent
    try:
        return sorted(p.stem for p in folder.glob("req_*.json")
                      if not vault_format.is_sync_conflict(p.name))
    except OSError:
        return []


def read_request(vault_root: Path, req_id: str) -> dict | None:
    data = store.load_json(_request_path(vault_root, req_id), None)
    return data if isinstance(data, dict) else None


def pending_for_note(vault_root: Path, note_id: str, kind: str = "grade") -> list[dict]:
    """The open requests of one note, oldest first (a note reopened later resumes them)."""
    if not note_id:
        return []
    out = []
    for req_id in pending_requests(vault_root):
        data = read_request(vault_root, req_id)
        if data and data.get("note_id") == note_id and data.get("kind") == kind:
            data.setdefault("id", req_id)
            out.append(data)
    return out

"""
Small storage helpers shared by the Metas, Proyectos and Finanzas modules.

Those modules keep one file per entity (or per day), so two devices syncing
the same vault never write the same file for unrelated changes. Every writer
here is deterministic: the mobile client reproduces the same bytes, which
`tests/test_vault_format.py` checks through the conformance fixtures.

Frontmatter contract (docs/VAULT_FORMAT.md, "Frontmatter tipado"):

    ---
    key: value            one line per key, in the entity's fixed key order,
    ---                   then unknown keys in the order they were read
                          (blank line)
    body                  markdown, only when not empty

A key whose value is empty (None, "", [] or False for optional flags) is not
written. Value encoding depends on the key's declared type:

    id        bare                    g20260914-a1b2c3
    str       double-quoted, with \\ and \" escaped
    int       digits                  3
    num       integer if whole, else shortest decimal   2.5
    bool      true / false
    date      YYYY-MM-DD
    datetime  YYYY-MM-DDTHH:MM
    list      comma-separated inside double quotes   "coding,math"
"""

import json
import os
import re
import shutil
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from . import vault_format

_KEY_RE = re.compile(r"^([a-z_0-9]+):[ \t]*(.*)$")


# ── Ids ───────────────────────────────────────────────────────────────────

def new_id(prefix: str, day: Optional[date] = None) -> str:
    """'g20260914-a1b2c3': a letter, the creation day and 6 random hex digits."""
    day = day or date.today()
    return f"{prefix}{day.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"


def slug(text: str) -> str:
    """'Programación y más' -> 'programacion-y-mas' (ids for areas, categories)."""
    table = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    out = re.sub(r"[^a-z0-9]+", "-", (text or "").translate(table).lower()).strip("-")
    return out or "x"


# ── Value encoding ────────────────────────────────────────────────────────

def quote(text: str) -> str:
    return '"' + str(text).replace("\\", "\\\\").replace('"', '\\"') + '"'


def unquote(raw: str) -> str:
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] == '"':
        out, i, inner = [], 0, raw[1:-1]
        while i < len(inner):
            ch = inner[i]
            if ch == "\\" and i + 1 < len(inner):
                nxt = inner[i + 1]
                out.append({"n": "\n", "t": "\t"}.get(nxt, nxt))
                i += 2
                continue
            out.append(ch)
            i += 1
        return "".join(out)
    if len(raw) >= 2 and raw[0] == raw[-1] == "'":
        return raw[1:-1].replace("''", "'")
    return raw


def fmt_num(value) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    f = float(value)
    if f.is_integer():
        return str(int(f))
    return repr(round(f, 6))


def parse_num(raw):
    try:
        f = float(str(raw).strip().replace(",", "."))
    except ValueError:
        return None
    return int(f) if f.is_integer() else f


def parse_int(raw) -> Optional[int]:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    try:
        return int(str(raw).strip())
    except ValueError:
        return None


def parse_day(raw) -> Optional[date]:
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    try:
        return date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        return None


def parse_dt(raw) -> Optional[datetime]:
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).strip())
    except ValueError:
        return None


def split_list(raw) -> list:
    if isinstance(raw, (list, tuple)):
        items = raw
    else:
        items = str(raw or "").split(",")
    return [s.strip() for s in items if str(s).strip()]


def encode(kind: str, value) -> Optional[str]:
    """The text after 'key: ', or None when the key must not be written."""
    if value is None:
        return None
    if kind == "bool":
        return "true" if value else None
    if kind == "bool0":                      # a flag whose false is meaningful
        return "true" if value else "false"
    if kind == "id":
        return str(value) if str(value) else None
    if kind == "str":
        return quote(value) if str(value) != "" else None
    if kind == "int":
        return str(int(value))
    if kind == "num":
        return fmt_num(value)
    if kind == "date":
        return value.isoformat() if isinstance(value, date) else (str(value) or None)
    if kind == "datetime":
        if isinstance(value, datetime):
            return value.isoformat(timespec="minutes")
        return str(value) or None
    if kind == "list":
        items = split_list(value)
        return quote(",".join(items)) if items else None
    raise ValueError(kind)


def decode(kind: str, raw: str):
    text = unquote(raw)
    if kind in ("bool", "bool0"):
        return text.strip().lower() == "true"
    if kind in ("id", "str"):
        return text
    if kind == "int":
        return parse_int(text)
    if kind == "num":
        return parse_num(text) if text.strip() else None
    if kind == "date":
        return parse_day(text) if text.strip() else None
    if kind == "datetime":
        return parse_dt(text) if text.strip() else None
    if kind == "list":
        return split_list(text)
    raise ValueError(kind)


# ── Frontmatter documents ─────────────────────────────────────────────────

def read_doc(path: Path, fields) -> Optional[tuple]:
    """(values, extra, body) or None when the file cannot be read.

    `fields` is the entity's ((key, type), ...) contract. Keys not in it land
    in `extra` as raw strings and are written back untouched.
    """
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    return parse_doc(text, fields)


def parse_doc(text: str, fields) -> tuple:
    types = dict(fields)
    values, extra, body = {}, {}, []
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return values, extra, text.strip()
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
        m = _KEY_RE.match(lines[i])
        if not m:
            continue
        key, raw = m.group(1), m.group(2)
        if key in types:
            values[key] = decode(types[key], raw)
        else:
            extra[key] = unquote(raw)
    if end is not None:
        body = lines[end + 1:]
    return values, extra, "\n".join(body).strip()


def dump_doc(fields, values: dict, extra: Optional[dict] = None, body: str = "") -> str:
    out = ["---"]
    for key, kind in fields:
        text = encode(kind, values.get(key))
        if text is not None:
            out.append(f"{key}: {text}")
    for key, value in (extra or {}).items():
        if str(value) != "":
            out.append(f"{key}: {quote(value)}")
    out.append("---")
    body = (body or "").strip()
    if body:
        out.append("")
        out.append(body)
    return "\n".join(out) + "\n"


# ── Files ─────────────────────────────────────────────────────────────────

def write_text(path: Path, text: str):
    """Write through a temporary file so a crash never leaves half a file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    os.replace(tmp, path)


def dump_json(data) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def load_json(path: Path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path: Path, data):
    write_text(path, dump_json(data))


def trash_dir(vault_root: Path) -> Path:
    return Path(vault_root) / vault_format.LAYOUT["trash_dir"]


def to_trash(vault_root: Path, path: Path, bucket: str) -> Optional[Path]:
    """Move a file or folder to .notevault/.papelera/<bucket>/, never overwriting."""
    path = Path(path)
    if not path.exists():
        return None
    folder = trash_dir(vault_root) / bucket
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / path.name
    n = 1
    while target.exists():
        target = folder / f"{path.stem} {n}{path.suffix}"
        n += 1
    shutil.move(str(path), str(target))
    return target


class MtimeCache:
    """Remember a parsed value per path until the file's mtime changes."""

    def __init__(self):
        self._data: dict = {}

    def get(self, path: Path, loader):
        path = Path(path)
        try:
            mtime = path.stat().st_mtime_ns
        except OSError:
            self._data.pop(str(path), None)
            return loader(None)
        hit = self._data.get(str(path))
        if hit and hit[0] == mtime:
            return hit[1]
        value = loader(path)
        self._data[str(path)] = (mtime, value)
        return value

    def forget(self, path: Optional[Path] = None):
        if path is None:
            self._data.clear()
        else:
            self._data.pop(str(Path(path)), None)

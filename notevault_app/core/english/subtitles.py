"""Subtitle files (.srt / .vtt): parsing, EN+ES pairing and cue lookup.

Times are integer milliseconds. Parsing is line oriented so a file with a
missing blank line, a stray index or a broken timing line loses only the
damaged cue, never the rest of the track.
"""

import bisect
import html
import re
from dataclasses import dataclass
from pathlib import Path

SUBTITLE_EXTS = (".srt", ".vtt")
ENCODINGS = ("utf-8-sig", "cp1252", "latin-1")

EN_TAGS = {"en", "eng", "english", "en-us", "en-gb", "ingles", "inglés"}
ES_TAGS = {"es", "spa", "spanish", "es-419", "es-es", "es-mx", "espanol", "español"}

_TIME = r"(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?"
_TIMING_RE = re.compile(rf"^\s*{_TIME}\s*-->\s*{_TIME}")
_TAG_RE = re.compile(r"<[^>\n]*>")
_ASS_RE = re.compile(r"\{\\[^}]*\}")
_SPACES_RE = re.compile(r"[ \t]+")


@dataclass(frozen=True)
class Cue:
    start: int
    end: int
    text: str

    @property
    def line(self) -> str:
        return " ".join(part.strip() for part in self.text.splitlines() if part.strip())


@dataclass(frozen=True)
class SentencePair:
    start: int
    end: int
    en: str
    es: str = ""


def _ms(h, m, s, frac) -> int:
    frac = (frac or "0").ljust(3, "0")[:3]
    return ((int(h or 0) * 60 + int(m)) * 60 + int(s)) * 1000 + int(frac)


def clean_text(text: str) -> str:
    text = _ASS_RE.sub("", text or "")
    text = _TAG_RE.sub("", text)
    text = html.unescape(text).replace(" ", " ")
    lines = [_SPACES_RE.sub(" ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def parse_subtitles(text: str) -> list[Cue]:
    """Cues of an SRT or WebVTT text, sorted by start. Bad cues are skipped."""
    lines = (text or "").replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿").split("\n")
    cues: list[Cue] = []
    current = None
    body: list[str] = []
    skipping = False

    def flush(before_timing=False):
        if current is None:
            return
        while before_timing and body and body[-1].strip().isdigit():
            body.pop()
        cleaned = clean_text("\n".join(body))
        if cleaned and current[1] > current[0]:
            cues.append(Cue(current[0], current[1], cleaned))

    for raw in lines:
        m = _TIMING_RE.match(raw)
        if m:
            flush(before_timing=True)
            g = m.groups()
            current = (_ms(*g[0:4]), _ms(*g[4:8]))
            body = []
            skipping = False
            continue
        stripped = raw.strip()
        if current is None or skipping:
            if not stripped:
                skipping = False
            continue
        if not stripped:
            flush()
            current, body = None, []
            continue
        if not body and re.match(r"^(NOTE|STYLE|REGION)\b", stripped):
            skipping = True
            continue
        body.append(raw)
    flush()
    cues.sort(key=lambda c: (c.start, c.end))
    return cues


def read_text_file(path: Path) -> str:
    data = Path(path).read_bytes()
    for enc in ENCODINGS:
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def load_subtitles(path: Path) -> list[Cue]:
    return parse_subtitles(read_text_file(path))


def pair_tracks(primary: list[Cue], secondary: list[Cue] | None = None) -> list[SentencePair]:
    """One pair per primary cue; each secondary cue joins the primary cue it
    overlaps the most, so a split or merged translation still lines up."""
    assigned: dict[int, list[Cue]] = {}
    starts = [c.start for c in primary]
    for sub in secondary or []:
        lo = max(0, bisect.bisect_right(starts, sub.start) - 3)
        best, best_overlap = -1, 0
        for i in range(lo, len(primary)):
            cue = primary[i]
            if cue.start >= sub.end:
                break
            overlap = min(cue.end, sub.end) - max(cue.start, sub.start)
            if overlap > best_overlap:
                best, best_overlap = i, overlap
        if best >= 0:
            assigned.setdefault(best, []).append(sub)
    return [
        SentencePair(c.start, c.end, c.line, " ".join(s.line for s in assigned.get(i, [])))
        for i, c in enumerate(primary)
    ]


def cue_at(cues, ms: int) -> int:
    """Index of the cue shown at `ms`, or -1 between cues."""
    i = bisect.bisect_right([c.start for c in cues], ms) - 1
    if i >= 0 and ms < cues[i].end:
        return i
    return -1


def cue_before(cues, ms: int) -> int:
    """Index of the last cue that started at or before `ms`, or -1."""
    return bisect.bisect_right([c.start for c in cues], ms) - 1


def subtitle_tag(media: Path, candidate: Path) -> str | None:
    """'en', 'es', '' (untagged) or None when `candidate` is not a subtitle of `media`."""
    name, stem = candidate.name.lower(), media.stem.lower()
    ext = candidate.suffix.lower()
    if ext not in SUBTITLE_EXTS or not name.startswith(stem + "."):
        return None
    tag = name[len(stem) + 1:-len(ext)].strip(".")
    if not tag:
        return ""
    last = tag.split(".")[-1]
    if last in EN_TAGS:
        return "en"
    if last in ES_TAGS:
        return "es"
    return None


def find_sibling_subtitles(media: Path) -> tuple[Path | None, Path | None]:
    """(english, spanish) subtitle files next to `media`; an untagged file
    counts as English when no English one is tagged."""
    media = Path(media)
    found: dict[str, Path] = {}
    try:
        entries = sorted(media.parent.iterdir(), key=lambda p: (p.suffix.lower() != ".srt", p.name))
    except OSError:
        return None, None
    for entry in entries:
        if not entry.is_file():
            continue
        tag = subtitle_tag(media, entry)
        if tag is not None and tag not in found:
            found[tag] = entry
    return found.get("en") or found.get(""), found.get("es")

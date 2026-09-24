"""Which study area a note belongs to, for the Estudio sub-bar of the Notes module.

A study area is a subject root folder (e.g. `Matemáticas`) or one of its first-level
folders (e.g. `Matemáticas/1 Lógica y demostración`). All the detection rules live in
detect_study_area() so they can be adjusted in one place.
"""

import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath

STUDY_SUBJECTS = ("mathematics", "programming", "english")


@dataclass(frozen=True)
class StudyArea:
    subject: str
    folder: str       # vault-relative posix folder that scopes the area; "" = whole subject
    title: str
    subject_title: str
    by_subject: bool = False  # the folder alone does not identify the subject

    @property
    def key(self) -> tuple:
        return (self.subject, self.folder)

    def contains(self, rel_path: str, subject: str = "") -> bool:
        if self.by_subject and subject != self.subject:
            return False
        if self.folder:
            return rel_path.startswith(self.folder + "/")
        return subject == self.subject


def _norm(text: str) -> str:
    plain = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    return plain.strip().lower()


def detect_study_area(rel_path: str, frontmatter: dict | None,
                      workspaces: list[dict]) -> StudyArea | None:
    """The study area of a note (vault-relative path) or None when it is not in one.

    1. A folder of the path named like a study workspace (Matemáticas, Programación,
       Inglés and their aliases) is the subject root; the area is the folder right below
       it when the note sits deeper, else the root itself.
    2. Otherwise a frontmatter `subject:` of a study subject makes the note's own folder
       the area, restricted to notes of that subject.
    """
    parts = PurePosixPath(str(rel_path).replace("\\", "/")).parts[:-1]
    names = {ws["id"]: ws for ws in workspaces if ws.get("id") in STUDY_SUBJECTS}
    for i, part in enumerate(parts):
        for ws_id, ws in names.items():
            candidates = {_norm(f) for f in ws.get("folders", [])} | {_norm(ws_id),
                                                                      _norm(ws["name"])}
            if _norm(part) in candidates:
                root = "/".join(parts[:i + 1])
                if len(parts) > i + 1:
                    return StudyArea(ws_id, f"{root}/{parts[i + 1]}", parts[i + 1], part)
                return StudyArea(ws_id, root, part, part)
    subject = _norm((frontmatter or {}).get("subject") or "")
    if subject in names:
        folder = "/".join(parts)
        title = parts[-1] if parts else names[subject]["name"]
        return StudyArea(subject, folder, title, names[subject]["name"], by_subject=True)
    return None

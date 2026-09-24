"""Validate math knowledge-base notes against docs/knowledge_base/templates.

    python tools/check_kb_notes.py <folder> [--syllabus <SYLLABUS_MATH.md>]

<folder> is the subject root (Matemáticas), one area folder or one concept
folder. Checks concept, theorem and exercise notes (frontmatter, file names,
sections, counts, card/step/rubric formats, LaTeX delimiters) and each concept
folder as a whole (exercise mix, one proof note per key result). Prints
``ERROR``/``WARN`` lines and ``N problem(s), M warning(s)``; exits 1 on errors.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from notevault_app.core.frontmatter_utils import parse_frontmatter  # noqa: E402

DEFAULT_SYLLABUS = ROOT / "docs" / "knowledge_base" / "SYLLABUS_MATH.md"

CONCEPT_SECTIONS = ["Idea en una frase", "Intuición", "Definición formal", "Notación",
                    "Ejemplos", "No-ejemplos", "Resultados clave", "Errores comunes",
                    "Conexiones", "Tarjetas", "Práctica"]
THEOREM_SECTIONS = ["Enunciado", "Hipótesis", "Conclusión", "Estrategia", "Idea clave",
                    "Demostración", "Si se quita una hipótesis", "Variantes para practicar"]
EXERCISE_SECTIONS = ["Enunciado", "Pistas", "Solución", "Rúbrica", "Errores típicos"]

CARD_TYPES = {"definicion", "enunciado", "ejemplo", "contraejemplo", "notacion",
              "hipotesis", "estrategia", "conexion", "error"}
RELATIONS = ("Requiere", "Se usa en", "Equivale a", "Generaliza",
             "Caso particular de", "Contrasta con")
TECHNIQUES = {"directa", "contrarreciproco", "contradiccion", "casos", "induccion",
              "induccion-fuerte", "construccion", "doble-inclusion", "contraejemplo", "otra"}
PRACTICES = {"demostracion", "calculo", "problema", "contraejemplo", "verdadero_falso",
             "encontrar_error", "explicar"}
CRITICAL_PRACTICES = {"contraejemplo", "verdadero_falso", "encontrar_error"}
ERROR_KINDS = ("conceptual", "logical", "procedural", "calculation")
STATUSES = {"draft", "reviewed", "locked"}
ID_RE = re.compile(r"^mat(\.[a-z0-9-]+)+$")
BAD_NAME_CHARS = set('<>:"/\\|?*')

COMMON_KEYS = ["id", "title", "number", "subject", "type", "difficulty", "status", "verified"]
CONCEPT_KEYS = COMMON_KEYS + ["area", "topic", "prerequisites", "sources", "tags"]
THEOREM_KEYS = COMMON_KEYS + ["concept", "technique"]
EXERCISE_KEYS = COMMON_KEYS + ["concept", "practice", "minutes"]


def load_syllabus(path: Path) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*(\d+\.\d+)\s*\|(.*)\|\s*$", line)
        if not m:
            continue
        cells = [c.strip() for c in m.group(2).split("|")]
        if len(cells) != 4:
            continue
        title, cid, results, prereqs = cells
        rows[m.group(1)] = {
            "title": title, "id": cid,
            "results": [] if results in ("—", "-", "") else [r.strip() for r in results.split(" ; ")],
            "prereqs": [] if prereqs in ("—", "-", "") else [p.strip() for p in prereqs.split(",")],
        }
    return rows


def sections(body: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    cur, buf = None, []
    for line in body.splitlines():
        m = re.match(r"^## (.+?)\s*$", line)
        if m:
            if cur is not None:
                out.append((cur, "\n".join(buf).strip()))
            cur, buf = m.group(1), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        out.append((cur, "\n".join(buf).strip()))
    return out


def bullets(text: str) -> list[str]:
    return [ln for ln in text.splitlines() if ln.startswith("- ")]


def links(text: str) -> list[str]:
    return re.findall(r"\[\[([^\]|#]+)", text)


def words(text: str) -> int:
    return len(re.findall(r"\S+", text))


class Checker:
    def __init__(self, root: Path, syllabus: dict[str, dict]):
        self.root = root
        self.syl = syllabus
        self.by_number = syllabus
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.ids: dict[str, Path] = {}
        self.stems: set[str] = set()

    def err(self, p: Path, msg: str):
        self.errors.append(f"ERROR {self._rel(p)}: {msg}")

    def warn(self, p: Path, msg: str):
        self.warnings.append(f"WARN  {self._rel(p)}: {msg}")

    def _rel(self, p: Path) -> str:
        try:
            return str(p.relative_to(self.root))
        except ValueError:
            return str(p)

    # ── generic ─────────────────────────────────────────────────────────
    def run(self) -> None:
        files = sorted(p for p in self.root.rglob("*.md") if not p.name.startswith("00 "))
        self.stems = {p.stem for p in self.root.rglob("*.md")}
        parsed = []
        for p in files:
            text = p.read_text(encoding="utf-8")
            fm, body = parse_frontmatter(text)
            if not fm:
                self.warn(p, "no frontmatter: not a knowledge note, skipped")
                continue
            parsed.append((p, text, fm, body))
        for p, text, fm, body in parsed:
            kind = fm.get("type")
            if kind not in ("concept", "theorem", "exercise"):
                self.warn(p, f"type '{kind}' is not concept/theorem/exercise, skipped")
                continue
            self.common(p, text, fm, body)
            {"concept": self.concept, "theorem": self.theorem, "exercise": self.exercise}[kind](p, fm, body)

    def common(self, p: Path, text: str, fm: dict, body: str) -> None:
        keys = {"concept": CONCEPT_KEYS, "theorem": THEOREM_KEYS, "exercise": EXERCISE_KEYS}[fm["type"]]
        for k in keys:
            if k not in fm or fm[k] in ("", None):
                self.err(p, f"frontmatter key '{k}' missing or empty")
        raw_fm = text.split("---", 2)[1] if text.startswith("---") else ""
        if not re.search(r'^number:\s*"[^"]+"\s*$', raw_fm, re.M):
            self.err(p, 'number must be quoted, e.g. number: "1.10"')
        for line in raw_fm.splitlines():
            if re.match(r"^\w+:\s*\[", line) and any("," in item for item in re.findall(r'"([^"]*)"', line)):
                self.err(p, f"comma inside a list item (the app splits lists on commas): {line.strip()}")
        cid = str(fm.get("id", ""))
        if not ID_RE.match(cid):
            self.err(p, f"id '{cid}' does not match mat.<area>.<slug>[...]")
        elif cid in self.ids:
            self.err(p, f"duplicate id '{cid}' (also in {self._rel(self.ids[cid])})")
        else:
            self.ids[cid] = p
        if fm.get("subject") != "mathematics":
            self.err(p, "subject must be mathematics")
        if fm.get("status") not in STATUSES:
            self.err(p, f"status must be one of {sorted(STATUSES)}")
        if not isinstance(fm.get("verified"), bool):
            self.err(p, "verified must be true or false")
        d = fm.get("difficulty")
        if not (isinstance(d, int) and 1 <= d <= 5):
            self.err(p, "difficulty must be an integer 1-5")
        title, number = str(fm.get("title", "")), str(fm.get("number", ""))
        if BAD_NAME_CHARS & set(title):
            self.err(p, f"title has a character Windows forbids in file names: {title}")
        if p.name != f"{number} {title}.md":
            self.err(p, f"file name must be '{number} {title}.md'")
        h1 = re.search(r"^# (.+?)\s*$", body, re.M)
        if not h1 or h1.group(1) != f"{number} {title}":
            self.err(p, f"first heading must be '# {number} {title}'")
        self.latex(p, body)
        for target in links(body):
            if target.strip() not in self.stems:
                self.warn(p, f"link [[{target}]] has no note yet")

    def latex(self, p: Path, body: str) -> None:
        body = re.sub(r"```.*?```", "", body, flags=re.S)
        for para in re.split(r"\n\s*\n", body):
            if para.count("$$") % 2:
                self.err(p, f"unbalanced $$ in: {para.strip()[:60]!r}")
                continue
            inline = re.sub(r"\\\$", "", para.replace("$$", ""))
            if inline.count("$") % 2:
                self.err(p, f"unbalanced $ in: {para.strip()[:60]!r}")
        if re.search(r"\\\(|\\\[", body):
            self.err(p, r"use $...$ and $$...$$, not \( \) or \[ \]")
        for line in body.splitlines():
            if line.lstrip().startswith("|") and "$" in line:
                self.warn(p, "math inside a table row: '|' in math breaks tables")

    def order(self, p: Path, secs: list[tuple[str, str]], wanted: list[str]) -> dict[str, str]:
        names = [s for s, _ in secs]
        if names != wanted:
            self.err(p, f"sections must be exactly, in order: {wanted}; found {names}")
        return dict(secs)

    # ── concept ─────────────────────────────────────────────────────────
    def concept(self, p: Path, fm: dict, body: str) -> None:
        number, title = str(fm.get("number")), str(fm.get("title"))
        folder = p.parent
        if folder.name != f"{number} {title}":
            self.err(p, f"concept folder must be named '{number} {title}'")
        if folder.parent.name != str(fm.get("area")):
            self.err(p, f"area '{fm.get('area')}' does not match the area folder '{folder.parent.name}'")
        row = self.by_number.get(number)
        if self.syl and row is None:
            self.err(p, f"number {number} is not in the syllabus")
        if row:
            if row["title"] != title:
                self.err(p, f"title must be '{row['title']}' (syllabus)")
            if row["id"] != fm.get("id"):
                self.err(p, f"id must be '{row['id']}' (syllabus)")
            prereq_ids = {self.by_number[n]["id"] for n in row["prereqs"] if n in self.by_number}
            missing = prereq_ids - set(fm.get("prerequisites") or [])
            if missing:
                self.err(p, f"prerequisites missing syllabus ids: {sorted(missing)}")

        s = self.order(p, sections(body), CONCEPT_SECTIONS)
        idea = s.get("Idea en una frase", "")
        if not idea or words(idea) > 45 or "$$" in idea:
            self.err(p, "Idea en una frase: one sentence, 1-45 words, no $$")
        n = words(s.get("Intuición", ""))
        if not 80 <= n <= 250:
            self.err(p, f"Intuición must have 80-250 words (has {n})")
        if len(re.findall(r"^### Ejemplo \d+", s.get("Ejemplos", ""), re.M)) < 3:
            self.err(p, "Ejemplos needs at least 3 '### Ejemplo N — ...'")
        if len(re.findall(r"^### No-ejemplo \d+", s.get("No-ejemplos", ""), re.M)) < 2:
            self.err(p, "No-ejemplos needs at least 2 '### No-ejemplo N — ...'")
        if len(bullets(s.get("Errores comunes", ""))) < 3:
            self.err(p, "Errores comunes needs at least 3 bullets")
        self.connections(p, s.get("Conexiones", ""), row)
        self.cards(p, s.get("Tarjetas", ""))
        self.concept_folder(p, s, row)

    def connections(self, p: Path, text: str, row) -> None:
        rel = "|".join(re.escape(r) for r in RELATIONS)
        required = set()
        for b in bullets(text):
            m = re.match(rf"^- \*\*({rel})\*\* \[\[(.+?)\]\] — (.+)$", b)
            if not m:
                self.err(p, f"Conexiones bullet must be '- **<Relación>** [[Nota]] — por qué': {b[:70]}")
                continue
            if len(m.group(3)) > 50:
                self.warn(p, f"Conexiones reason over 50 characters (it becomes an arrow label): {m.group(3)}")
            if m.group(1) == "Requiere":
                required.add(m.group(2))
        if row:
            for num in row["prereqs"]:
                pre = self.by_number.get(num)
                if pre and f"{num} {pre['title']}" not in required:
                    self.err(p, f"Conexiones needs '- **Requiere** [[{num} {pre['title']}]] — ...'")

    def cards(self, p: Path, text: str) -> None:
        heads = list(re.finditer(r"^### T(\d+) · (\S+)\s*$", text, re.M))
        if not 8 <= len(heads) <= 15:
            self.err(p, f"Tarjetas must have 8-15 cards '### T<n> · <tipo>' (has {len(heads)})")
        nums = [int(h.group(1)) for h in heads]
        if nums != list(range(1, len(nums) + 1)):
            self.err(p, f"card numbers must be T1..T{len(nums)} without gaps: {nums}")
        types = [h.group(2) for h in heads]
        for t in types:
            if t not in CARD_TYPES:
                self.err(p, f"card type '{t}' not in {sorted(CARD_TYPES)}")
        if len(set(types)) < 4 or "definicion" not in types:
            self.err(p, "Tarjetas needs at least 4 different types including definicion")
        for i, h in enumerate(heads):
            end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
            block = text[h.end():end]
            if not re.search(r"^\*\*P:\*\* \S", block, re.M) or not re.search(r"^\*\*R:\*\* \S", block, re.M):
                self.err(p, f"card T{h.group(1)} needs a '**P:** ...' line and a '**R:** ...' line")

    def concept_folder(self, p: Path, s: dict, row) -> None:
        folder = p.parent
        ex_files = sorted((folder / "Ejercicios").glob("*.md"))
        th_files = sorted((folder / "Demostraciones").glob("*.md"))
        practice = set(links(s.get("Práctica", "")))
        for f in ex_files + th_files:
            if f.stem not in practice:
                self.err(p, f"Práctica must link [[{f.stem}]]")
        for target in practice - {f.stem for f in ex_files + th_files}:
            self.err(p, f"Práctica links [[{target}]] but no such file in Ejercicios/ or Demostraciones/")
        key_links = set(links(s.get("Resultados clave", "")))
        for f in th_files:
            if f.stem not in key_links:
                self.err(p, f"Resultados clave must link [[{f.stem}]]")
        if row is not None:
            if len(th_files) < len(row["results"]):
                self.err(p, f"needs {len(row['results'])} proof notes in Demostraciones/ "
                            f"(one per key result), has {len(th_files)}")
            for i, f in enumerate(th_files):
                fm, _ = parse_frontmatter(f.read_text(encoding="utf-8"))
                if i < len(row["results"]) and fm.get("title") != row["results"][i]:
                    self.err(p, f"{f.name}: title must be the syllabus key result "
                                f"T{i + 1:02d} verbatim: '{row['results'][i]}'")
            if row["results"] and len(bullets(s.get("Resultados clave", ""))) != len(row["results"]):
                self.err(p, f"Resultados clave needs one bullet per syllabus key result ({len(row['results'])})")

        exs = []
        for f in ex_files:
            fm, _ = parse_frontmatter(f.read_text(encoding="utf-8"))
            exs.append(fm)
        if len(exs) < 6:
            self.err(p, f"needs at least 6 exercises in Ejercicios/ (has {len(exs)})")
            return
        diffs = [e.get("difficulty") for e in exs if isinstance(e.get("difficulty"), int)]
        easy = sum(1 for d in diffs if d <= 2)
        mid = sum(1 for d in diffs if d == 3)
        hard = sum(1 for d in diffs if d >= 4)
        if easy < 2 or mid < 2 or hard < 2:
            self.err(p, f"exercise difficulty mix needs >=2 easy (1-2), >=2 medium (3), >=2 hard (4-5); "
                        f"has {easy}/{mid}/{hard}")
        kinds = {e.get("practice") for e in exs}
        if len(kinds) < 3:
            self.err(p, f"exercises need at least 3 different practice types (has {sorted(map(str, kinds))})")
        if not kinds & CRITICAL_PRACTICES:
            self.err(p, f"at least one exercise must be {sorted(CRITICAL_PRACTICES)}")

    def _concept_id_of(self, p: Path) -> str:
        folder = p.parent.parent
        for f in folder.glob("*.md"):
            fm, _ = parse_frontmatter(f.read_text(encoding="utf-8"))
            if fm.get("type") == "concept":
                return str(fm.get("id", ""))
        return ""

    def _child(self, p: Path, fm: dict, folder: str, letter: str) -> None:
        if p.parent.name != folder:
            self.err(p, f"must live in the concept's '{folder}/' folder")
        number = str(fm.get("number", ""))
        m = re.match(rf"^(\d+\.\d+)-{letter}(\d{{2}})$", number)
        if not m:
            self.err(p, f"number must look like '1.10-{letter}01'")
            return
        concept_id = self._concept_id_of(p)
        if concept_id and fm.get("concept") != concept_id:
            self.err(p, f"concept must be '{concept_id}'")
        want = f"{fm.get('concept')}.{letter.lower()}{m.group(2)}"
        if fm.get("id") != want:
            self.err(p, f"id must be '{want}'")
        if p.parent.parent.name.split(" ", 1)[0] != m.group(1):
            self.err(p, f"number prefix {m.group(1)} does not match the concept folder")

    # ── theorem ─────────────────────────────────────────────────────────
    def theorem(self, p: Path, fm: dict, body: str) -> None:
        self._child(p, fm, "Demostraciones", "T")
        if fm.get("technique") not in TECHNIQUES:
            self.err(p, f"technique must be one of {sorted(TECHNIQUES)}")
        s = self.order(p, sections(body), THEOREM_SECTIONS)
        hyps = re.findall(r"^- \*\*H(\d+):\*\* \S", s.get("Hipótesis", ""), re.M)
        if not hyps or [int(h) for h in hyps] != list(range(1, len(hyps) + 1)):
            self.err(p, "Hipótesis needs bullets '- **H1:** ...', '- **H2:** ...' numbered without gaps")
        if words(s.get("Estrategia", "")) > 30:
            self.err(p, "Estrategia must be at most 30 words")
        if not s.get("Idea clave", "").strip():
            self.err(p, "Idea clave is empty")
        self.proof(p, s.get("Demostración", ""))
        removed = set(re.findall(r"^- \*\*Sin H(\d+):\*\* \S", s.get("Si se quita una hipótesis", ""), re.M))
        for h in hyps:
            if h not in removed:
                self.err(p, f"Si se quita una hipótesis needs '- **Sin H{h}:** ...'")
        if len(bullets(s.get("Variantes para practicar", ""))) < 2:
            self.err(p, "Variantes para practicar needs at least 2 bullets")

    def proof(self, p: Path, text: str) -> None:
        lines = [ln for ln in text.splitlines() if ln.strip()]
        steps, i = [], 0
        while i < len(lines):
            m = re.match(r"^(\d+)\. \*\*Paso:\*\* (.+)$", lines[i])
            if not m:
                self.err(p, f"Demostración line is not a step: {lines[i][:70]!r}")
                i += 1
                continue
            why = re.match(r"^\s+\*\*Por qué:\*\* (.+)$", lines[i + 1]) if i + 1 < len(lines) else None
            if not why:
                self.err(p, f"step {m.group(1)} needs an indented '**Por qué:** ...' line under it")
                i += 1
            else:
                if len(why.group(1)) > 80:
                    self.warn(p, f"step {m.group(1)}: Por qué over 80 characters")
                i += 2
            steps.append((int(m.group(1)), m.group(2)))
        if len(steps) < 3:
            self.err(p, "Demostración needs at least 3 steps")
        if [n for n, _ in steps] != list(range(1, len(steps) + 1)):
            self.err(p, "steps must be numbered 1..n without gaps")
        if steps and "\\blacksquare" not in steps[-1][1]:
            self.err(p, r"the last step must end with $\blacksquare$")

    # ── exercise ────────────────────────────────────────────────────────
    def exercise(self, p: Path, fm: dict, body: str) -> None:
        self._child(p, fm, "Ejercicios", "E")
        if fm.get("practice") not in PRACTICES:
            self.err(p, f"practice must be one of {sorted(PRACTICES)}")
        mins = fm.get("minutes")
        if not (isinstance(mins, int) and mins > 0):
            self.err(p, "minutes must be a positive integer")
        s = self.order(p, sections(body), EXERCISE_SECTIONS)
        if not s.get("Enunciado", "").strip() or not s.get("Solución", "").strip():
            self.err(p, "Enunciado and Solución must not be empty")
        hints = [int(n) for n in re.findall(r"^### Pista (\d+)\s*$", s.get("Pistas", ""), re.M)]
        if not 1 <= len(hints) <= 3 or hints != list(range(1, len(hints) + 1)):
            self.err(p, "Pistas needs 1-3 '### Pista N' headings numbered from 1")
        rub = s.get("Rúbrica", "")
        ok = re.findall(r"^- \[ \] \(1\) \S", rub, re.M)
        if len(ok) != 5 or len(bullets(rub)) != 5:
            self.err(p, "Rúbrica needs exactly 5 lines '- [ ] (1) ...'")
        kinds = "|".join(ERROR_KINDS)
        errs = bullets(s.get("Errores típicos", ""))
        if not errs:
            self.err(p, "Errores típicos needs at least 1 bullet")
        for b in errs:
            if not re.match(rf"^- \*\*({kinds}):\*\* \S", b):
                self.err(p, f"Errores típicos bullet must start '- **<{kinds}>:** ': {b[:60]}")


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:]]
    syllabus = DEFAULT_SYLLABUS
    if "--syllabus" in args:
        i = args.index("--syllabus")
        syllabus = Path(args[i + 1])
        del args[i:i + 2]
    if len(args) != 1:
        print(__doc__)
        return 2
    folder = Path(args[0])
    if not folder.is_dir():
        print(f"not a folder: {folder}")
        return 2
    c = Checker(folder, load_syllabus(syllabus))
    c.run()
    for line in c.errors + c.warnings:
        print(line)
    print(f"{len(c.errors)} problem(s), {len(c.warnings)} warning(s)")
    return 1 if c.errors else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))

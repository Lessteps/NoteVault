"""Knowledge-base canvas generator (tools/kb_canvas.py).

Builds:
  - Concept canvas: <concept folder>/<number> <title> — mapa.canvas
  - Area map:       <area folder>/00 Mapa — <area n> <area title>.canvas
  - Subject map:    <subject root>/00 Mapa de Matemáticas.canvas

CLI usage (run from C:\\PROGRAMMING\\PROJECTS\\NoteVault):
  python tools/kb_canvas.py concept "<concept folder>"
  python tools/kb_canvas.py area    "<area folder>"
  python tools/kb_canvas.py subject "<subject root>"
  python tools/kb_canvas.py all     "<subject root>"
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from notevault_app.core import canvas_format as cf  # noqa: E402
from notevault_app.core.canvas_methodology import estimate_height  # noqa: E402
from notevault_app.core.frontmatter_utils import parse_frontmatter  # noqa: E402
from tools.check_kb_notes import bullets, load_syllabus, sections  # noqa: E402

DEFAULT_SYLLABUS = ROOT / "docs" / "knowledge_base" / "SYLLABUS_MATH.md"

# ── Constants from §2.1 of canvas-knowledge-base/SKILL.md ────────────
CARD_W = 420        # concept core cards
EX_W = 380          # example / no-example / error cards
THM_W = 380         # theorem column width (cards and shapes)
FILE_W, FILE_H = 300, 120
PAD, TOP = 24, 48   # group padding / space for the group label
VGAP = 72           # vertical gap between chained cards
STACK_GAP = 28      # vertical gap between stacked, unconnected cards
COL_GAP = 260       # horizontal gap between columns
BLOCK_GAP = 90      # vertical gap between two groups in the same column
SHAPE_MIN_H = 90
CHAR_W, LABEL_PAD, MARGIN = 7.2, 28.0, 36.0


def gap_for(label: str) -> float:
    """Horizontal room for an arrow whose label must stay readable."""
    return max(COL_GAP, len(label) * CHAR_W + LABEL_PAD + 2 * MARGIN)


def truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len - 1].rstrip() + "…"


# ── Builder ──────────────────────────────────────────────────────────
class _Builder:
    def __init__(self):
        self.doc = cf.CanvasDoc()

    def text(self, x: float, y: float, w: float, md: str, color: str = "") -> cf.CanvasNode:
        h = estimate_height(md, w)
        n = cf.CanvasNode(id=cf.new_id(), type="text", x=x, y=y, width=w,
                          height=h, text=md.strip(), color=color)
        self.doc.nodes.append(n)
        return n

    def file_card(self, x: float, y: float, vault_rel_path: str, color: str = "") -> cf.CanvasNode:
        n = cf.CanvasNode(id=cf.new_id(), type="file", x=x, y=y, width=FILE_W,
                          height=FILE_H, file=vault_rel_path, color=color)
        self.doc.nodes.append(n)
        return n

    def shape(self, x: float, y: float, w: float, text: str, kind: str, color: str = "") -> cf.CanvasNode:
        h = max(SHAPE_MIN_H, estimate_height(text, w - 40) + 20)
        n = cf.CanvasNode(id=cf.new_id(), type="nv-shape", x=x, y=y, width=w,
                          height=h, text=text.strip(), color=color, nv={"shape": kind})
        self.doc.nodes.append(n)
        return n

    def group(self, label: str, members: list[cf.CanvasNode], color: str = "",
              pad: float = PAD, top: float = TOP) -> cf.CanvasNode:
        leaves = [m for m in members if m.type != "group"]
        if not leaves:
            x0, y0, x1, y1 = 0.0, 0.0, 100.0, 100.0
        else:
            x0 = min(m.x for m in leaves) - pad
            y0 = min(m.y for m in leaves) - top
            x1 = max(m.x + m.width for m in leaves) + pad
            y1 = max(m.y + m.height for m in leaves) + pad
        g = cf.CanvasNode(id=cf.new_id(), type="group", x=x0, y=y0, width=x1 - x0,
                          height=y1 - y0, label=label, color=color, nv={"zIndex": -2})
        self.doc.nodes.append(g)
        return g

    def edge(self, a: cf.CanvasNode, b: cf.CanvasNode, label: str,
             fs: str = "right", ts: str = "left", color: str = "",
             nv_extra: Optional[dict] = None) -> cf.CanvasEdge:
        nv_data = dict(nv_extra or {})
        edge = cf.CanvasEdge(id=cf.new_id(), fromNode=a.id, toNode=b.id,
                             fromSide=fs, toSide=ts, fromEnd="none", toEnd="arrow",
                             color=color, label=label, nv=nv_data)
        self.doc.edges.append(edge)
        return edge


# ── Data structures ──────────────────────────────────────────────────
@dataclass
class Connection:
    kind: str           # "Requiere" | "Se usa en" | "Equivale a"
    target_title: str   # e.g. "1.4 Cuantificadores y su negación"
    reason: str


@dataclass
class Theorem:
    title: str
    number: str
    enunciado: str
    hipotesis: list[str]
    conclusion: str
    estrategia: str
    idea_clave: str
    pasos: list[tuple[str, str]]    # [(paso_text, why_text), ...]


@dataclass
class ExerciseInfo:
    path: Path
    vault_rel_path: str
    title: str
    number: str
    difficulty: int
    practice: str


@dataclass
class Concept:
    folder: Path
    note_path: Path
    vault_rel_path: str
    number: str
    title: str
    idea_en_una_frase: str
    intuicion: str
    definicion_formal: str
    notacion: str
    ejemplos: list[tuple[str, str]]        # [(heading, text), ...]
    no_ejemplos: list[tuple[str, str]]     # [(heading, text), ...]
    errores_comunes: list[str]
    requiere: list[Connection]
    se_usa_en: list[Connection]
    theorems: list[Theorem]
    exercises: list[ExerciseInfo]


# ── Public helper functions ──────────────────────────────────────────
def find_vault_root(path: Path) -> Path:
    """Walk up from path until finding a directory containing '.notevault'."""
    p = path.resolve()
    if p.is_file():
        p = p.parent
    for cur in [p] + list(p.parents):
        if (cur / ".notevault").is_dir():
            return cur
    return p


def load_structure(syllabus_path: Path) -> list[dict]:
    """Parse syllabus headings into blocks, areas and concept numbers."""
    if not syllabus_path.exists():
        return []
    text = syllabus_path.read_text(encoding="utf-8")
    blocks: list[dict] = []
    cur_block: Optional[dict] = None
    cur_area: Optional[dict] = None

    for line in text.splitlines():
        mb = re.match(r"^##\s+Block\s+([IVXLCDM]+)\s+[—–-]\s+(.+)$", line)
        if mb:
            cur_block = {"block": mb.group(1), "title": mb.group(2).strip(), "areas": []}
            blocks.append(cur_block)
            cur_area = None
            continue
        ma = re.match(r"^###\s+(\d+)\s+(.+)$", line)
        if ma:
            cur_area = {"n": ma.group(1), "title": ma.group(2).strip(), "concepts": []}
            if cur_block is not None:
                cur_block["areas"].append(cur_area)
            continue
        mc = re.match(r"^\|\s*(\d+\.\d+)\s*\|", line)
        if mc and cur_area is not None:
            cur_area["concepts"].append(mc.group(1))

    return blocks


_NOTE_CACHE: dict[Path, dict[str, str]] = {}


def get_vault_notes_index(vault_root: Path) -> dict[str, str]:
    if vault_root in _NOTE_CACHE:
        return _NOTE_CACHE[vault_root]
    idx: dict[str, str] = {}
    math_dir = vault_root / "Matemáticas"
    search_dir = math_dir if math_dir.is_dir() else vault_root
    for f in search_dir.rglob("*.md"):
        # Don't index temporary or hidden folders
        if any(part.startswith(".") for part in f.parts):
            continue
        try:
            rel = f.relative_to(vault_root).as_posix()
        except ValueError:
            rel = f.as_posix()
        idx[f.stem.strip()] = rel
        idx[f.name] = rel
    _NOTE_CACHE[vault_root] = idx
    return idx


def _resolve_note(target: str, vault_root: Path) -> Optional[str]:
    """Given target like '1.4 Cuantificadores y su negación', finds vault-rel path."""
    clean = target.strip()
    idx = get_vault_notes_index(vault_root)
    if clean in idx:
        return idx[clean]
    if f"{clean}.md" in idx:
        return idx[f"{clean}.md"]
    return None


def read_concept(folder: Path) -> Concept:
    """Read and parse all notes of one concept folder (§3.1)."""
    concept_files = [f for f in folder.glob("*.md") if not f.name.startswith("00 ")]
    if not concept_files:
        raise ValueError(f"No concept markdown file in {folder}")
    note_path = concept_files[0]
    fm, body = parse_frontmatter(note_path.read_text(encoding="utf-8"))
    s = dict(sections(body))

    vault_root = find_vault_root(folder)
    try:
        vault_rel_path = note_path.relative_to(vault_root).as_posix()
    except ValueError:
        vault_rel_path = note_path.as_posix()

    # Parse ejemplos
    ejemplos: list[tuple[str, str]] = []
    ej_text = s.get("Ejemplos", "")
    for block in re.split(r"(?m)^###\s+", ej_text):
        if not block.strip():
            continue
        lines = block.splitlines()
        ejemplos.append((lines[0].strip(), "\n".join(lines[1:]).strip()))

    # Parse no-ejemplos
    no_ejemplos: list[tuple[str, str]] = []
    noej_text = s.get("No-ejemplos", "")
    for block in re.split(r"(?m)^###\s+", noej_text):
        if not block.strip():
            continue
        lines = block.splitlines()
        no_ejemplos.append((lines[0].strip(), "\n".join(lines[1:]).strip()))

    # Parse errores comunes
    errores = [b[2:].strip() for b in bullets(s.get("Errores comunes", ""))]

    # Parse conexiones
    requiere: list[Connection] = []
    se_usa_en: list[Connection] = []
    for b in bullets(s.get("Conexiones", "")):
        m = re.match(r"^- \*\*(Requiere|Se usa en|Equivale a)\*\* \[\[(.+?)\]\] — (.+)$", b)
        if m:
            kind, tgt, rsn = m.group(1), m.group(2).strip(), m.group(3).strip()
            conn = Connection(kind=kind, target_title=tgt, reason=rsn)
            if kind == "Requiere":
                requiere.append(conn)
            elif kind == "Se usa en":
                se_usa_en.append(conn)

    # Parse theorems from Demostraciones/
    theorems: list[Theorem] = []
    dem_folder = folder / "Demostraciones"
    if dem_folder.is_dir():
        for tf in sorted(dem_folder.glob("*.md")):
            tfm, tbody = parse_frontmatter(tf.read_text(encoding="utf-8"))
            ts = dict(sections(tbody))
            hyps = re.findall(r"(?m)^- \*\*H\d+:\*\*\s*(.+)$", ts.get("Hipótesis", ""))
            pasos: list[tuple[str, str]] = []
            lines = [ln for ln in ts.get("Demostración", "").splitlines() if ln.strip()]
            i = 0
            while i < len(lines):
                mp = re.match(r"^\d+\.\s*\*\*Paso:\*\*\s*(.+)$", lines[i])
                if mp:
                    p_txt = mp.group(1).strip()
                    why_txt = ""
                    if i + 1 < len(lines):
                        mw = re.match(r"^\s*\*\*Por qué:\*\*\s*(.+)$", lines[i + 1])
                        if mw:
                            why_txt = mw.group(1).strip()
                            i += 1
                    pasos.append((p_txt, why_txt))
                i += 1
            theorems.append(Theorem(
                title=str(tfm.get("title", "")),
                number=str(tfm.get("number", "")),
                enunciado=ts.get("Enunciado", ""),
                hipotesis=hyps,
                conclusion=ts.get("Conclusión", ""),
                estrategia=ts.get("Estrategia", ""),
                idea_clave=ts.get("Idea clave", ""),
                pasos=pasos,
            ))

    # Parse exercises from Ejercicios/
    exercises: list[ExerciseInfo] = []
    ex_folder = folder / "Ejercicios"
    if ex_folder.is_dir():
        for ef in sorted(ex_folder.glob("*.md")):
            efm, _ = parse_frontmatter(ef.read_text(encoding="utf-8"))
            try:
                ex_rel = ef.relative_to(vault_root).as_posix()
            except ValueError:
                ex_rel = ef.as_posix()
            exercises.append(ExerciseInfo(
                path=ef,
                vault_rel_path=ex_rel,
                title=str(efm.get("title", "")),
                number=str(efm.get("number", "")),
                difficulty=int(efm.get("difficulty", 1)),
                practice=str(efm.get("practice", "demostracion")),
            ))

    return Concept(
        folder=folder,
        note_path=note_path,
        vault_rel_path=vault_rel_path,
        number=str(fm.get("number", "")),
        title=str(fm.get("title", "")),
        idea_en_una_frase=s.get("Idea en una frase", ""),
        intuicion=s.get("Intuición", ""),
        definicion_formal=s.get("Definición formal", ""),
        notacion=s.get("Notación", ""),
        ejemplos=ejemplos,
        no_ejemplos=no_ejemplos,
        errores_comunes=errores,
        requiere=requiere,
        se_usa_en=se_usa_en,
        theorems=theorems,
        exercises=exercises,
    )


# ── Concept Canvas Builder ───────────────────────────────────────────
def build_concept_canvas(c: Concept, vault_root: Path) -> cf.CanvasDoc:
    b = _Builder()

    # Column A — "Requiere" (starts at x=0, y=0)
    cards_a: list[cf.CanvasNode] = []
    req_labels: list[str] = []
    cur_y = TOP
    if not c.requiere:
        ca = b.text(PAD, cur_y, FILE_W, "Concepto base: no requiere otros conceptos.")
        ca.height = FILE_H
        cards_a.append(ca)
        req_labels.append("concepto base")
    else:
        for conn in c.requiere:
            target_path = _resolve_note(conn.target_title, vault_root)
            if target_path:
                node = b.file_card(PAD, cur_y, target_path)
            else:
                node = b.text(PAD, cur_y, FILE_W, f"**{conn.target_title}**\n(pendiente)")
                node.height = FILE_H
            cards_a.append(node)
            req_labels.append(conn.reason)
            cur_y += FILE_H + STACK_GAP

    group_a = b.group("Requiere", cards_a, color="")

    # Column B — "Concepto"
    longest_req_label = max(req_labels, key=len) if req_labels else "concepto base"
    x_b = group_a.x + group_a.width + gap_for(longest_req_label)
    leaf_bx = x_b + PAD
    cur_y = TOP

    # B1 Title card
    b1_text = f"# {c.number} {c.title}\n\n{c.idea_en_una_frase}"
    b1 = b.text(leaf_bx, cur_y, CARD_W, b1_text, color="6")
    cur_y += b1.height + VGAP

    # B2 Intuición
    b2_text = f"## Intuición\n\n{c.intuicion}"
    b2 = b.text(leaf_bx, cur_y, CARD_W, b2_text)
    b.edge(b1, b2, "se entiende así", fs="bottom", ts="top")
    cur_y += b2.height + VGAP

    # B3 Definición formal
    b3_text = f"## Definición formal\n\n{c.definicion_formal}"
    b3 = b.text(leaf_bx, cur_y, CARD_W, b3_text, color="5")
    b.edge(b2, b3, "se formaliza en", fs="bottom", ts="top")
    cur_y += b3.height + VGAP

    # B4 Notación
    b4_text = f"## Notación\n\n{c.notacion}"
    b4 = b.text(leaf_bx, cur_y, CARD_W, b4_text)
    b.edge(b3, b4, "se escribe", fs="bottom", ts="top")

    group_b = b.group(f"{c.number} {c.title}", [b1, b2, b3, b4], color="6")

    # Connect Column A cards to B1
    for idx, card in enumerate(cards_a):
        lbl = truncate(req_labels[idx], 50) if idx < len(req_labels) else "requiere"
        b.edge(card, b1, lbl, fs="right", ts="left")

    # Column C — "Ejemplos" / "No-ejemplos"
    x_c = group_b.x + group_b.width + gap_for("se cumple en")
    leaf_cx = x_c + PAD

    # C1 Ejemplos
    cur_y = TOP
    cards_ex: list[cf.CanvasNode] = []
    for heading, text in c.ejemplos:
        md = f"### {heading}\n\n{text}"
        cn = b.text(leaf_cx, cur_y, EX_W, md, color="4")
        cards_ex.append(cn)
        cur_y += cn.height + STACK_GAP

    group_ex = b.group("Ejemplos", cards_ex, color="4")
    if cards_ex:
        b.edge(b3, cards_ex[0], "se cumple en", fs="right", ts="left")

    # C2 No-ejemplos
    cur_y = group_ex.y + group_ex.height + BLOCK_GAP + TOP
    cards_noex: list[cf.CanvasNode] = []
    for heading, text in c.no_ejemplos:
        md = f"### {heading}\n\n{text}"
        cn = b.text(leaf_cx, cur_y, EX_W, md, color="1")
        cards_noex.append(cn)
        cur_y += cn.height + STACK_GAP

    group_noex = b.group("No-ejemplos", cards_noex, color="1")
    if cards_noex:
        b.edge(b3, cards_noex[0], "falla en", fs="right", ts="left")

    right_of_c = max(group_ex.x + group_ex.width, group_noex.x + group_noex.width)

    # Column D — "Resultados" (one sub-column per theorem)
    x_after_d = right_of_c
    if c.theorems:
        cur_thm_x = right_of_c + gap_for("permite probar")
        for thm in c.theorems:
            leaf_dx = cur_thm_x + PAD
            cur_y = TOP

            # 1. Enunciado
            d1_text = f"## {thm.number} {thm.title}\n\n{thm.enunciado}"
            d1 = b.text(leaf_dx, cur_y, THM_W, d1_text, color="5")
            cur_y += d1.height + VGAP

            # 2. Estrategia & Idea clave
            d2_text = f"**Estrategia.** {thm.estrategia}\n\n**Idea clave.** {thm.idea_clave}"
            d2 = b.text(leaf_dx, cur_y, THM_W, d2_text)
            b.edge(d1, d2, "estrategia", fs="bottom", ts="top")
            cur_y += d2.height + VGAP

            # 3. Hypotheses
            hyp_nodes: list[cf.CanvasNode] = []
            prev_hyp: Optional[cf.CanvasNode] = None
            for h_idx, h_text in enumerate(thm.hipotesis):
                hn = b.shape(leaf_dx, cur_y, THM_W, f"H{h_idx + 1}: {h_text}", kind="io")
                hyp_nodes.append(hn)
                cur_y += hn.height + VGAP
                if h_idx == 0:
                    b.edge(d2, hn, "parte de", fs="bottom", ts="top")
                else:
                    assert prev_hyp is not None
                    b.edge(prev_hyp, hn, "y", fs="bottom", ts="top")
                prev_hyp = hn

            last_premise = prev_hyp if prev_hyp is not None else d2

            # 4. Proof steps
            step_nodes: list[cf.CanvasNode] = []
            prev_step = last_premise
            for s_idx, (p_txt, why_txt) in enumerate(thm.pasos):
                sn = b.shape(leaf_dx, cur_y, THM_W, f"{s_idx + 1}. {p_txt}", kind="process")
                step_nodes.append(sn)
                cur_y += sn.height + VGAP
                lbl = truncate(why_txt, 80) if why_txt else f"paso {s_idx + 1}"
                b.edge(prev_step, sn, lbl, fs="bottom", ts="top")
                prev_step = sn

            # 5. Conclusion
            conc_txt = f"∎ {thm.conclusion}" if thm.conclusion else "∎ Demostrado."
            conc_node = b.shape(leaf_dx, cur_y, THM_W, conc_txt, kind="start_end")
            b.edge(prev_step, conc_node, "por tanto", fs="bottom", ts="top")

            # Group theorem
            thm_num_tag = thm.number.split("-")[1] if "-" in thm.number else thm.number
            group_label = f"{thm_num_tag} — {thm.title}"
            all_thm_members = [d1, d2] + hyp_nodes + step_nodes + [conc_node]
            thm_group = b.group(group_label, all_thm_members, color="5")

            # Edge B3 -> d1
            b.edge(b3, d1, "permite probar", fs="right", ts="left")

            cur_thm_x = thm_group.x + thm_group.width + (COL_GAP + 160)
            x_after_d = thm_group.x + thm_group.width

    # Column E — "Errores comunes"
    x_e = x_after_d + gap_for("cuidado con")
    leaf_ex = x_e + PAD
    cur_y = TOP
    cards_e: list[cf.CanvasNode] = []
    for err in c.errores_comunes:
        enode = b.text(leaf_ex, cur_y, EX_W, err, color="3")
        cards_e.append(enode)
        cur_y += enode.height + STACK_GAP

    group_e = b.group("Errores comunes", cards_e, color="3")
    if cards_e:
        b.edge(b1, cards_e[0], "cuidado con", fs="right", ts="left")

    # Column F — "Práctica" / "Se usa en"
    f_labels = [conn.reason for conn in c.se_usa_en] + ["se practica en"]
    longest_f_label = max(f_labels, key=len)
    x_f = group_e.x + group_e.width + gap_for(longest_f_label)
    leaf_fx = x_f + PAD

    # F1 Práctica
    cur_y = TOP
    cards_prac: list[cf.CanvasNode] = []
    for ex in c.exercises:
        ec = b.file_card(leaf_fx, cur_y, ex.vault_rel_path, color="2")
        cards_prac.append(ec)
        cur_y += FILE_H + STACK_GAP

    group_prac = b.group("Práctica", cards_prac, color="2")
    if cards_prac:
        b.edge(b1, cards_prac[0], "se practica en", fs="right", ts="left")

    # F2 Se usa en
    cur_y = group_prac.y + group_prac.height + BLOCK_GAP + TOP
    cards_se_usa: list[cf.CanvasNode] = []
    for conn in c.se_usa_en:
        target_path = _resolve_note(conn.target_title, vault_root)
        if target_path:
            node = b.file_card(leaf_fx, cur_y, target_path)
        else:
            node = b.text(leaf_fx, cur_y, FILE_W, f"**{conn.target_title}**\n(pendiente)")
            node.height = FILE_H
        cards_se_usa.append(node)
        b.edge(b1, node, truncate(conn.reason, 50), fs="right", ts="left")
        cur_y += FILE_H + STACK_GAP

    if cards_se_usa:
        b.group("Se usa en", cards_se_usa, color="")

    return b.doc


# ── Area Map Builder ─────────────────────────────────────────────────
def build_area_map(area_folder: Path, syllabus: dict, vault_root: Path) -> cf.CanvasDoc:
    b = _Builder()
    folder_name = area_folder.name
    # folder_name e.g. "1 Lógica y demostración"
    parts = folder_name.split(" ", 1)
    area_n = parts[0]
    area_title = parts[1] if len(parts) > 1 else folder_name

    # Collect syllabus concepts belonging to this area
    area_concepts = [num for num, data in syllabus.items() if num.startswith(f"{area_n}.")]
    if not area_concepts:
        # Fallback by scanning
        area_concepts = sorted([f.name.split(" ", 1)[0] for f in area_folder.glob("*.*")
                                if f.is_dir() and not f.name.startswith("00 ")])

    # Compute depth for each concept within the area
    depths: dict[str, int] = {}

    def get_depth(num: str, visiting: set[str]) -> int:
        if num in depths:
            return depths[num]
        if num in visiting:
            return 0
        visiting.add(num)
        prereqs = syllabus.get(num, {}).get("prereqs", [])
        in_area_prereqs = [p for p in prereqs if p in area_concepts]
        if not in_area_prereqs:
            d = 0
        else:
            d = 1 + max(get_depth(p, visiting) for p in in_area_prereqs)
        visiting.remove(num)
        depths[num] = d
        return d

    for c_num in area_concepts:
        get_depth(c_num, set())

    # Map cards by depth
    by_depth: dict[int, list[str]] = {}
    for c_num in area_concepts:
        d = depths.get(c_num, 0)
        by_depth.setdefault(d, []).append(c_num)

    in_area_nodes: dict[str, cf.CanvasNode] = {}
    reasons_by_dep: dict[tuple[str, str], str] = {}

    # Read **Requiere** lines from existing notes to find edge labels
    for c_num in area_concepts:
        row = syllabus.get(c_num, {})
        title = row.get("title", "")
        c_folder = area_folder / f"{c_num} {title}"
        if c_folder.is_dir():
            notes = [f for f in c_folder.glob("*.md") if not f.name.startswith("00 ")]
            if notes:
                _, body = parse_frontmatter(notes[0].read_text(encoding="utf-8"))
                s = dict(sections(body))
                for line in bullets(s.get("Conexiones", "")):
                    m = re.match(r"^- \*\*Requiere\*\* \[\[(\d+\.\d+)[^\]]*\]\] — (.+)$", line)
                    if m:
                        reasons_by_dep[(m.group(1), c_num)] = m.group(2).strip()

    # Place in-area concept cards
    for d, c_list in sorted(by_depth.items()):
        col_x = d * (FILE_W + 340)
        for row_idx, c_num in enumerate(c_list):
            y = row_idx * (FILE_H + 90)
            row = syllabus.get(c_num, {})
            title = row.get("title", "")
            target_str = f"{c_num} {title}"
            note_rel = _resolve_note(target_str, vault_root)
            if note_rel:
                node = b.file_card(col_x, y, note_rel)
            else:
                node = b.text(col_x, y, FILE_W, f"**{target_str}**\n(pendiente)")
                node.height = FILE_H
            in_area_nodes[c_num] = node

    # In-area edges
    for c_num in area_concepts:
        prereqs = syllabus.get(c_num, {}).get("prereqs", [])
        for p in prereqs:
            if p in in_area_nodes and c_num in in_area_nodes:
                rsn = reasons_by_dep.get((p, c_num), "requiere")
                b.edge(in_area_nodes[p], in_area_nodes[c_num], truncate(rsn, 50),
                       fs="right", ts="left")

    # Out-of-area prerequisites
    external_prereqs = sorted({
        p for c_num in area_concepts
        for p in syllabus.get(c_num, {}).get("prereqs", [])
        if p not in area_concepts
    })

    ext_nodes: dict[str, cf.CanvasNode] = {}
    if external_prereqs:
        ext_x = -(FILE_W + 340) + PAD
        ext_cards: list[cf.CanvasNode] = []
        for r_idx, ep in enumerate(external_prereqs):
            y = TOP + r_idx * (FILE_H + 90)
            row = syllabus.get(ep, {})
            title = row.get("title", "")
            target_str = f"{ep} {title}" if title else ep
            note_rel = _resolve_note(target_str, vault_root)
            if note_rel:
                node = b.file_card(ext_x, y, note_rel)
            else:
                node = b.text(ext_x, y, FILE_W, f"**{target_str}**\n(pendiente)")
                node.height = FILE_H
            ext_nodes[ep] = node
            ext_cards.append(node)

        b.group("Requiere de otras áreas", ext_cards, color="")

        # Connect external prerequisites to dependent in-area concepts
        for c_num in area_concepts:
            for p in syllabus.get(c_num, {}).get("prereqs", []):
                if p in ext_nodes and c_num in in_area_nodes:
                    rsn = reasons_by_dep.get((p, c_num), "requiere de otra área")
                    b.edge(ext_nodes[p], in_area_nodes[c_num], truncate(rsn, 50),
                           fs="right", ts="left")

    # Group around in-area concept cards
    if in_area_nodes:
        b.group(f"{area_n} {area_title}", list(in_area_nodes.values()), color="6")

    # Header text card (counts from disk)
    concept_folders = [d for d in area_folder.iterdir()
                       if d.is_dir() and not d.name.startswith("00 ")]
    num_theorems = len(list(area_folder.rglob("Demostraciones/*.md")))
    num_exercises = len(list(area_folder.rglob("Ejercicios/*.md")))
    header_text = (f"# {area_n} {area_title}\n"
                   f"{len(concept_folders)} conceptos · {num_theorems} demostraciones · {num_exercises} ejercicios")
    b.text(0, -200, 520, header_text)

    return b.doc


# ── Subject Map Builder ──────────────────────────────────────────────
def build_subject_map(root: Path, syllabus: dict, vault_root: Path) -> cf.CanvasDoc:
    b = _Builder()
    blocks = load_structure(DEFAULT_SYLLABUS)
    area_cards: dict[str, cf.CanvasNode] = {}
    area_col_idx: dict[str, int] = {}

    for col_idx, blk in enumerate(blocks):
        col_x = col_idx * 680
        leaf_x = col_x + PAD
        cur_y = TOP
        blk_nodes: list[cf.CanvasNode] = []

        for area in blk.get("areas", []):
            an = area["n"]
            atitle = area["title"]
            lines = [f"## {an} {atitle}\n"]
            for c_num in area.get("concepts", []):
                s_row = syllabus.get(c_num, {})
                c_title = s_row.get("title", "")
                c_str = f"{c_num} {c_title}"
                if _resolve_note(c_str, vault_root):
                    lines.append(f"- [[{c_str}]]")
                else:
                    lines.append(f"- {c_str} (pendiente)")

            text_md = "\n".join(lines)
            card = b.text(leaf_x, cur_y, 360, text_md)
            blk_nodes.append(card)
            area_cards[an] = card
            area_col_idx[an] = col_idx
            cur_y += card.height + 90

        if blk_nodes:
            b.group(f"Bloque {blk['block']} — {blk['title']}", blk_nodes, color="")

    # Edges between areas
    # Concept number prefix -> area number
    area_of_concept: dict[str, str] = {
        c_num: c_num.split(".")[0] for c_num in syllabus
    }

    # Count prerequisites from source_area -> target_area
    area_prereqs_count: dict[tuple[str, str], int] = {}
    for c_num, data in syllabus.items():
        tgt_area = area_of_concept.get(c_num)
        for p in data.get("prereqs", []):
            src_area = area_of_concept.get(p)
            if src_area and tgt_area and src_area != tgt_area:
                key = (src_area, tgt_area)
                area_prereqs_count[key] = area_prereqs_count.get(key, 0) + 1

    for (src_a, tgt_a), count in sorted(area_prereqs_count.items()):
        if src_a in area_cards and tgt_a in area_cards:
            src_node = area_cards[src_a]
            tgt_node = area_cards[tgt_a]
            src_col = area_col_idx.get(src_a, 0)
            tgt_col = area_col_idx.get(tgt_a, 0)
            lbl = f"{count} prerrequisito(s)"
            if tgt_col > src_col:
                b.edge(src_node, tgt_node, lbl, fs="right", ts="left")
            else:
                b.edge(src_node, tgt_node, lbl, fs="bottom", ts="top")

    return b.doc


# ── Manifest & Writer (§6) ───────────────────────────────────────────
def write_generated(target: Path, doc: cf.CanvasDoc, vault_root: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    manifest_dir = vault_root / ".notevault" / "estudio"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "kb_canvas_manifest.json"

    manifest: dict[str, str] = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    try:
        rel_key = target.relative_to(vault_root).as_posix()
    except ValueError:
        rel_key = target.as_posix()

    # Serialise to temp file
    tmp = target.with_suffix(".tmp.canvas")
    cf.dump(tmp, doc)
    new_bytes = tmp.read_bytes()
    new_hash = hashlib.sha256(new_bytes).hexdigest()

    # Check whether target was edited by user
    if not target.exists():
        tmp.replace(target)
        manifest[rel_key] = new_hash
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"written {target}")
        return target

    curr_bytes = target.read_bytes()
    curr_hash = hashlib.sha256(curr_bytes).hexdigest()
    last_hash = manifest.get(rel_key)

    if curr_hash == last_hash or curr_hash == new_hash:
        # User did not edit target
        tmp.replace(target)
        manifest[rel_key] = new_hash
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"written {target}")
        return target
    else:
        # User edited target: write .nuevo.canvas
        nuevo = target.parent / f"{target.stem}.nuevo.canvas"
        tmp.replace(nuevo)
        print(f"kept (user-edited) -> wrote {nuevo}")
        return nuevo


# ── CLI ──────────────────────────────────────────────────────────────
def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if len(argv) < 3:
        print("Usage: python tools/kb_canvas.py <concept|area|subject|all> <path>")
        return 1

    command = argv[1]
    target_path = Path(argv[2]).resolve()
    vault_root = find_vault_root(target_path)
    syllabus = load_syllabus(DEFAULT_SYLLABUS)

    if command == "concept":
        c = read_concept(target_path)
        doc = build_concept_canvas(c, vault_root)
        canvas_path = target_path / f"{c.number} {c.title} — mapa.canvas"
        write_generated(canvas_path, doc, vault_root)
        return 0

    elif command == "area":
        # Process every concept in the area
        concept_folders = sorted([d for d in target_path.iterdir()
                                 if d.is_dir() and not d.name.startswith("00 ")])
        for c_dir in concept_folders:
            try:
                c = read_concept(c_dir)
                doc = build_concept_canvas(c, vault_root)
                c_canvas = c_dir / f"{c.number} {c.title} — mapa.canvas"
                write_generated(c_canvas, doc, vault_root)
            except Exception as ex:
                print(f"skipped {c_dir}: {ex}")

        # Area map
        area_doc = build_area_map(target_path, syllabus, vault_root)
        area_map_path = target_path / f"00 Mapa — {target_path.name}.canvas"
        write_generated(area_map_path, area_doc, vault_root)
        return 0

    elif command == "subject":
        sub_doc = build_subject_map(target_path, syllabus, vault_root)
        sub_map_path = target_path / "00 Mapa de Matemáticas.canvas"
        write_generated(sub_map_path, sub_doc, vault_root)
        return 0

    elif command == "all":
        # Target path is subject root, e.g. C:\PROGRAMMING\Matemáticas
        area_folders = sorted([d for d in target_path.iterdir()
                               if d.is_dir() and not d.name.startswith("00 ")])
        for a_dir in area_folders:
            concept_folders = sorted([d for d in a_dir.iterdir()
                                     if d.is_dir() and not d.name.startswith("00 ")])
            for c_dir in concept_folders:
                try:
                    c = read_concept(c_dir)
                    doc = build_concept_canvas(c, vault_root)
                    c_canvas = c_dir / f"{c.number} {c.title} — mapa.canvas"
                    write_generated(c_canvas, doc, vault_root)
                except Exception as ex:
                    print(f"skipped {c_dir}: {ex}")

            area_doc = build_area_map(a_dir, syllabus, vault_root)
            area_map_path = a_dir / f"00 Mapa — {a_dir.name}.canvas"
            write_generated(area_map_path, area_doc, vault_root)

        sub_doc = build_subject_map(target_path, syllabus, vault_root)
        sub_map_path = target_path / "00 Mapa de Matemáticas.canvas"
        write_generated(sub_map_path, sub_doc, vault_root)
        return 0

    else:
        print(f"Unknown command '{command}'")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))

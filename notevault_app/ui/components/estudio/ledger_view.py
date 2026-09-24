"""Skill Ledger of the current study area, compact enough for the sub-bar."""

from datetime import date
from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QFrame, QHBoxLayout, QPushButton, QVBoxLayout, QWidget

from ....core.practice.ledger import BANDS, CONSOLIDATED, NOT_STARTED, PRACTICING, attempt_passed
from ....core.practice.recommender import pick_exercise
from .estudio_common import (
    AMBER, BORDER, GREEN, STATUS_COLOURS, TEXT, TEXT_DIM, TEXT_FAINT, ElidedLabel, card, clear,
    label, scroll_column, section, short_title,
)


def _transparent(name: str) -> QWidget:
    w = QWidget()
    w.setObjectName(name)
    w.setStyleSheet(f"QWidget#{name}{{background:transparent;border:none;}}")
    return w


def status_blocks(rows: list) -> QWidget:
    """One square per skill, coloured by status."""
    w = _transparent("ledgerBlocks")
    lay = QHBoxLayout(w)
    lay.setContentsMargins(0, 0, 0, 0)
    lay.setSpacing(3)
    for row in rows:
        sq = QFrame()
        sq.setFixedSize(10, 10)
        colour = STATUS_COLOURS[row["status"]]
        fill = colour if row["status"] != NOT_STARTED else "transparent"
        sq.setStyleSheet(f"background:{fill};border:1px solid {colour};border-radius:2px;")
        sq.setToolTip(f"{row['code']} {row['title']} — {row['label']}")
        lay.addWidget(sq)
    lay.addStretch()
    return w


class _Progress(QFrame):
    def __init__(self, done: int, total: int, parent=None):
        super().__init__(parent)
        self.setFixedHeight(4)
        self.setObjectName("chapterBar")
        self.setStyleSheet(f"QFrame#chapterBar{{background:{BORDER};border:none;"
                           "border-radius:2px;}")
        self._ratio = done / total if total else 0
        self._fill = QFrame(self)
        self._fill.setStyleSheet(f"background:{GREEN};border:none;border-radius:2px;")

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._fill.setGeometry(0, 0, int(self.width() * self._ratio), 4)


def _short_day(iso: str) -> str:
    try:
        return date.fromisoformat(iso).strftime("%d/%m")
    except ValueError:
        return ""


class _SkillRow(QPushButton):
    """A skill of the ledger; clicking it practises that skill."""

    def __init__(self, row: dict, exercise, parent=None):
        super().__init__(parent)
        self.row = row
        self.exercise = exercise
        self.setFixedHeight(30)
        self.setCursor(Qt.PointingHandCursor if exercise else Qt.ArrowCursor)
        self.setStyleSheet(
            "QPushButton{background:transparent;border:none;border-radius:6px;min-width:0px;"
            "padding:0px;text-align:left;}"
            + ("QPushButton:hover{background:#26262e;}" if exercise else ""))
        lay = QHBoxLayout(self)
        lay.setContentsMargins(6, 0, 6, 0)
        lay.setSpacing(6)
        started = row["status"] != NOT_STARTED
        dot = label("●" if started else "○", STATUS_COLOURS[row["status"]], 10)
        dot.setFixedWidth(10)
        code = label(row["code"], TEXT_FAINT, 10)
        code.setFixedWidth(16)
        name = ElidedLabel(short_title(row["title"]), TEXT if started else TEXT_DIM, 12)
        if row["status"] == CONSOLIDATED:
            right = label("Repasar" if row["is_due"] else _short_day(row["due"]),
                          AMBER if row["is_due"] else GREEN, 10, bold=row["is_due"])
        else:
            right = label("" if row["best"] is None else str(row["best"]), TEXT_DIM, 11)
        right.setFixedWidth(46)
        right.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        levels = self._levels()
        for w, stretch in ((dot, 0), (code, 0), (name, 1), (levels, 0), (right, 0)):
            w.setAttribute(Qt.WA_TransparentForMouseEvents)
            lay.addWidget(w, stretch)
        tip = [row["title"], row["label"],
               f"{row['attempted_exercises']}/{row['exercises']} ejercicios intentados"]
        if row["best"] is not None:
            tip.append(f"Mejor puntuación: {row['best']}")
        if row["status"] == CONSOLIDATED:
            tip.append(f"Próximo repaso: {row['due']} (cada {row['interval_days']} días)")
        tip.append(f"Clic: practicar «{exercise.title}»" if exercise
                   else "Sin ejercicios en el vault")
        self.setToolTip("\n".join(tip))

    def _levels(self) -> QWidget:
        w = _transparent("skillLevels")
        lay = QHBoxLayout(w)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(2)
        for band in BANDS:
            done = band in self.row["bands"]
            mark = QFrame()
            mark.setFixedSize(6, 6)
            mark.setStyleSheet(
                f"background:{GREEN if done else 'transparent'};"
                f"border:1px solid {GREEN if done else '#4a4a55'};border-radius:3px;")
            lay.addWidget(mark)
        return w


class LedgerView(QWidget):
    practice_requested = Signal(Path)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("ledgerView")
        self._snapshot = None
        self.skill_rows: dict = {}
        col = scroll_column(self)
        self._list = QVBoxLayout()
        self._list.setSpacing(10)
        col.addLayout(self._list)
        legend = label("", TEXT_FAINT, 10, wrap=True, rich=True)
        legend.setText(
            f"<span style='color:{GREEN}'>●</span> consolidada &nbsp; "
            f"<span style='color:{AMBER}'>●</span> en práctica &nbsp; ○ sin empezar<br>"
            "Puntos: niveles superados (principiante, intermedio, avanzado). Una skill se "
            "consolida al superar depurar, refactorizar o encontrar el error en avanzado sin "
            "pistas, o los tres niveles; después vuelve a tocar tras su intervalo.")
        col.addWidget(legend)
        col.addStretch(1)

    def set_snapshot(self, snapshot):
        self._snapshot = snapshot
        self._render()

    def _render(self):
        clear(self._list)
        self.skill_rows = {}
        snap = self._snapshot
        if snap is None:
            return
        attempted = {nid for nid, d in snap.attempts.items() if d.get("attempts")}
        today = date.today().isoformat()
        due = {i["entity_id"]: i["next_review"] for i in snap.srs_items
               if i.get("entity_type") == "exercise" and i["next_review"] <= today}
        if not snap.ledgers:
            self._list.addWidget(label("No hay ejercicios de práctica en esta área todavía.",
                                       TEXT_DIM, 12, wrap=True))
        for ledger in snap.ledgers.values():
            self._list.addWidget(self._discipline_card(ledger, snap.exercises, attempted, due))
        chapters = self._chapters(snap)
        if chapters:
            self._list.addWidget(section("Conceptos"))
            box = card("conceptsCard")
            bl = QVBoxLayout(box)
            bl.setContentsMargins(12, 10, 12, 10)
            bl.setSpacing(6)
            for title, done, total, best in chapters:
                top = QHBoxLayout()
                top.addWidget(ElidedLabel(title, TEXT, 12), 1)
                txt = f"{done}/{total} superados" + (f" · mejor {best}" if best is not None
                                                     else "")
                top.addWidget(label(txt, TEXT_DIM, 10))
                bl.addLayout(top)
                bl.addWidget(_Progress(done, total))
            self._list.addWidget(box)

    def _discipline_card(self, ledger, exercises, attempted, due) -> QFrame:
        rows = ledger["skills"]
        box = card("ledgerCard")
        lay = QVBoxLayout(box)
        lay.setContentsMargins(8, 10, 8, 8)
        lay.setSpacing(2)
        head = QVBoxLayout()
        head.setContentsMargins(6, 0, 6, 4)
        head.setSpacing(4)
        head.addWidget(label(ledger["title"], TEXT, 13, bold=True))
        n = {s: sum(1 for r in rows if r["status"] == s)
             for s in (CONSOLIDATED, PRACTICING, NOT_STARTED)}
        head.addWidget(label(
            f"{n[CONSOLIDATED]} consolidadas · {n[PRACTICING]} en práctica · "
            f"{n[NOT_STARTED]} sin empezar", TEXT_DIM, 11))
        head.addWidget(status_blocks(rows))
        lay.addLayout(head)
        for row in rows:
            refs = [e for e in exercises
                    if e.discipline == ledger["discipline"] and e.skill == row["code"]]
            ex = pick_exercise(refs, attempted, due) or (refs[0] if refs else None)
            item = _SkillRow(row, ex)
            if ex is not None:
                item.clicked.connect(lambda _c=False, p=ex.path: self.practice_requested.emit(
                    Path(p)))
            self.skill_rows[(ledger["discipline"], row["code"])] = item
            lay.addWidget(item)
        return box

    @staticmethod
    def _chapters(snap) -> list:
        groups: dict = {}
        for e in snap.exercises:
            groups.setdefault(e.chapter, [e.chapter_title, []])[1].append(e)
        out = []
        for key in sorted(groups):
            title, refs = groups[key]
            done, best = 0, None
            for e in refs:
                attempts = snap.attempts.get(e.note_id, {}).get("attempts", [])
                if any(attempt_passed(a) for a in attempts):
                    done += 1
                scores = [int(a.get("score") or 0) for a in attempts
                          if a.get("verdict") != "ungraded"]
                if scores:
                    best = max(best or 0, max(scores))
            out.append((title, done, len(refs), best))
        return out

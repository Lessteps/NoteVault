"""Proof ladder view, shown instead of the editor for theorem (proof) notes.

Six levels of retrieval over one proof, from recalling the strategy to proving a
variant. L2 (ordering the steps) is checked here; the other levels are judged by the AI
teacher through the same transports as the practice view (HTTP, clipboard bridge,
handoff file), and every attempt goes through `apply_result` as its own SRS item.
"""

import json
from pathlib import Path

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame, QScrollArea,
    QPlainTextEdit, QMessageBox, QApplication, QSizePolicy,
)
from PySide6.QtCore import Qt, Signal, QTimer

from .... import theme
from .....config import AppConfig
from .....core.ai_client import AIConfig, BRIDGE_URLS, build_bridge_prompt
from ....ai_workers import AIWorker
from .....core.practice import handoff, ladder
from .....core.practice.attempts import PracticeAttemptStore
from .....core.practice.error_log import apply_result, recent_errors
from .....core.practice.grading import GradeParseError, GradeResult, parse_grade_reply
from .....core.practice.timer import parse_timer
from .practice_timer import PracticeTimer
from .practice_view import (
    ACCENT, AMBER, BG_CARD, BG_INPUT, BORDER, GREEN, RED, TEXT, TEXT_DIM, TEXT_FAINT,
    VERDICT_LABELS, _AutoBrowser, _card, _esc, _ghost, _inline, _open_url, _primary,
    _section, _wrap_label,
)
from . import math_render

FIELD_HEIGHTS = {1: 130, 3: 76, 4: 64, 5: 300, 6: 280}
PLACEHOLDERS = {
    1: "Técnica, sobre qué se aplica y la idea clave, en dos o tres frases.",
    3: "Escribe el paso que falta y por qué es válido.",
    4: "¿Por qué es válido este paso?",
    5: "Escribe la demostración paso a paso, justificando cada paso.",
    6: "Escribe la demostración de la variante, paso a paso.",
}


def _step_label(markdown: str, size: int = 14, colour: str = TEXT,
                selectable: bool = True) -> _AutoBrowser:
    """A step's Markdown with its formulas typeset on the text baseline."""
    view = _AutoBrowser(size)
    view.setStyleSheet(
        f"QTextBrowser{{background:transparent;border:none;color:{colour};"
        f"font-family:{theme.NOTE_FONT_FAMILY};font-size:{size}px;padding:0;}}")
    if not selectable:
        view.setTextInteractionFlags(Qt.NoTextInteraction)
    view.load_markdown(markdown)
    return view


def _badge(number: int) -> QLabel:
    b = QLabel(str(number))
    b.setFixedSize(24, 24)
    b.setAlignment(Qt.AlignCenter)
    b.setStyleSheet(
        f"background:#2a2a34;border:1px solid {BORDER};border-radius:12px;"
        f"color:{TEXT_DIM};font-size:11px;font-weight:700;")
    return b


def _field(level: int) -> QPlainTextEdit:
    ed = QPlainTextEdit()
    ed.setFixedHeight(FIELD_HEIGHTS.get(level, 90))
    ed.setPlaceholderText(PLACEHOLDERS.get(level, ""))
    ed.setStyleSheet(
        f"QPlainTextEdit{{background:{BG_INPUT};border:1px solid {BORDER};border-radius:8px;"
        f"color:{TEXT};font-family:{theme.NOTE_FONT_FAMILY};font-size:14px;padding:8px;}}"
        f"QPlainTextEdit:focus{{border-color:{ACCENT};}}"
        "QPlainTextEdit:read-only{color:#b8b8c2;}")
    return ed


class _StepCard(QFrame):
    """One draggable step of the L2 list. Transparent to the mouse: the list handles it."""

    def __init__(self, step_index: int, text: str, parent=None):
        super().__init__(parent)
        self.step_index = step_index
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        self.setObjectName("ladderStep")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(10, 8, 12, 8)
        lay.setSpacing(10)
        self._handle = QLabel("⋮⋮")
        self._handle.setStyleSheet(f"color:{TEXT_DIM};font-size:17px;font-weight:700;")
        self._pos = _badge(0)
        self._mark = QLabel("")
        self._mark.setFixedWidth(18)
        lay.addWidget(self._handle, 0, Qt.AlignVCenter)
        lay.addWidget(self._pos, 0, Qt.AlignVCenter)
        lay.addWidget(_step_label(text, selectable=False), 1)
        lay.addWidget(self._mark, 0, Qt.AlignVCenter)
        self._style(False, None)

    def set_position(self, pos: int):
        self._pos.setText(str(pos))

    def _style(self, dragging: bool, ok):
        border = ACCENT if dragging else (GREEN if ok is True else RED if ok is False else BORDER)
        bg = "#262631" if dragging else BG_INPUT
        self.setStyleSheet(
            f"QFrame#ladderStep{{background:{bg};border:1px solid {border};border-radius:8px;}}")
        self._mark.setText("" if ok is None else ("✓" if ok else "✗"))
        self._mark.setStyleSheet(
            f"color:{theme.tint(GREEN if ok else RED)};font-size:15px;font-weight:700;")

    def set_state(self, dragging: bool = False, ok=None):
        self._style(dragging, ok)


class StepOrderList(QWidget):
    """Vertical list of step cards reordered by dragging them with the mouse."""
    order_changed = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setCursor(Qt.OpenHandCursor)
        self._lay = QVBoxLayout(self)
        self._lay.setContentsMargins(0, 0, 0, 0)
        self._lay.setSpacing(8)
        self._cards: list[_StepCard] = []
        self._press = None
        self._drag = None
        self._target = -1
        self._locked = False
        self._indicator = QFrame(self)
        self._indicator.setFixedHeight(3)
        self._indicator.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        self._indicator.setStyleSheet(f"background:{ACCENT};border-radius:1px;")
        self._indicator.hide()

    def set_steps(self, texts: list[str], order: list[int]):
        for card in self._cards:
            self._lay.removeWidget(card)
            card.deleteLater()
        self._cards = [_StepCard(i, texts[i]) for i in order]
        for card in self._cards:
            self._lay.addWidget(card)
        self._renumber()
        self._locked = False

    def order(self) -> list[int]:
        return [c.step_index for c in self._cards]

    def cards(self) -> list[_StepCard]:
        return list(self._cards)

    def set_locked(self, locked: bool):
        self._locked = locked
        self.setCursor(Qt.ArrowCursor if locked else Qt.OpenHandCursor)

    def set_marks(self, hits):
        for i, card in enumerate(self._cards):
            card.set_state(False, None if hits is None else bool(hits[i]))

    def move(self, src: int, dst: int):
        """Move the card at position src so that it ends at position dst."""
        if src == dst or not (0 <= src < len(self._cards)) or not (0 <= dst < len(self._cards)):
            return
        card = self._cards.pop(src)
        self._cards.insert(dst, card)
        self._lay.removeWidget(card)
        self._lay.insertWidget(dst, card)
        self._renumber()
        self.order_changed.emit()

    def _renumber(self):
        for pos, card in enumerate(self._cards, 1):
            card.set_position(pos)

    def _card_at(self, y: int) -> int:
        for i, card in enumerate(self._cards):
            if card.geometry().top() <= y <= card.geometry().bottom() + self._lay.spacing():
                return i
        return -1

    def _gap_at(self, y: int) -> int:
        for i, card in enumerate(self._cards):
            if y < card.geometry().center().y():
                return i
        return len(self._cards)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton and not self._locked:
            pos = event.position().toPoint()
            idx = self._card_at(pos.y())
            if idx >= 0:
                self._press = (idx, pos)
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._press is None:
            return super().mouseMoveEvent(event)
        idx, start = self._press
        pos = event.position().toPoint()
        if self._drag is None:
            if (pos - start).manhattanLength() < QApplication.startDragDistance():
                return
            self._drag = idx
            self.setCursor(Qt.ClosedHandCursor)
            self._cards[idx].set_state(True, None)
        self._target = self._gap_at(pos.y())
        self._show_indicator(self._target)
        event.accept()

    def mouseReleaseEvent(self, event):
        drag, target = self._drag, self._target
        self._press = None
        self._drag = None
        self._target = -1
        self._indicator.hide()
        if drag is None:
            return super().mouseReleaseEvent(event)
        self.setCursor(Qt.OpenHandCursor)
        self._cards[drag].set_state(False, None)
        if target > drag:
            target -= 1
        self.move(drag, max(0, min(target, len(self._cards) - 1)))
        event.accept()

    def _show_indicator(self, gap: int):
        if not self._cards:
            return
        half = self._lay.spacing() // 2
        if gap < len(self._cards):
            y = self._cards[gap].geometry().top() - half - 2
        else:
            y = self._cards[-1].geometry().bottom() + half
        self._indicator.setGeometry(4, max(0, y), self.width() - 8, 3)
        self._indicator.show()
        self._indicator.raise_()


class _LevelPill(QPushButton):
    def __init__(self, number: int, parent=None):
        super().__init__(parent)
        self.number = number
        self.setCheckable(True)
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(52)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def set_state(self, *, selected: bool, current: bool, passed: bool, unlocked: bool,
                  best: int | None):
        lv = ladder.LEVELS[self.number]
        glyph = "✓" if passed else ("🔒" if not unlocked else ("●" if current else ""))
        head = f"L{self.number} {glyph}".strip()
        self.setText(f"{head}\n{lv.label}")
        tip = lv.task
        if best is not None:
            tip += f"\n\nMejor nota: {best}/100"
        if not unlocked:
            tip = "Bloqueado: supera el nivel anterior para desbloquearlo.\n\n" + tip
        self.setToolTip(tip)
        self.setEnabled(unlocked or selected)
        self.setChecked(selected)
        colour = GREEN if passed else (ACCENT if current else TEXT)
        border = ACCENT if (selected or current) else BORDER
        bg = ACCENT if selected else BG_CARD
        fg = "#ffffff" if selected else colour
        self.setStyleSheet(
            f"QPushButton{{background:{bg};border:1px solid {border};border-radius:9px;"
            f"color:{fg};font-size:12px;font-weight:600;padding:4px 6px;}}"
            f"QPushButton:hover{{border-color:{ACCENT};}}"
            f"QPushButton:disabled{{background:{BG_CARD};color:#55555f;border-color:#2e2e38;}}")


class LadderView(QWidget):
    edit_requested = Signal()
    open_note_requested = Signal(Path)

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.setObjectName("ladderView")
        self.vault_root = Path(vault_root)
        self._store = PracticeAttemptStore(self.vault_root)
        self._path = None
        self._proof = None
        self._state = None
        self._level = 1
        self._fields: list[QPlainTextEdit] = []
        self._order_list = None
        self._variant_btns = []
        self._hidden: list[int] = []
        self._order: list[int] = []
        self._variant = 0
        self._token = 0
        self._graded = False
        self._solution_seen = False
        self._pending_answer = ""
        self._messages = None
        self._req_id = None
        self._seconds_override = None
        self._worker = None
        self._restoring = False
        self._poll = QTimer(self)
        self._poll.setInterval(2000)
        self._poll.timeout.connect(self._poll_handoff)
        self._draft_timer = QTimer(self)
        self._draft_timer.setSingleShot(True)
        self._draft_timer.setInterval(800)
        self._draft_timer.timeout.connect(self._save_draft)
        self._build()

    # ── Build ─────────────────────────────────────────────────────────────

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QFrame.NoFrame)
        self._scroll.setStyleSheet("QScrollArea{background:#1a1a1e;border:none;}")
        root.addWidget(self._scroll)

        page = QWidget()
        page.setObjectName("ladderPage")
        page.setStyleSheet("QWidget#ladderPage{background:#1a1a1e;}")
        outer = QHBoxLayout(page)
        outer.setContentsMargins(24, 20, 24, 32)
        column = QWidget()
        column.setMaximumWidth(880)
        column.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        outer.addStretch(1)
        outer.addWidget(column, 20)
        outer.addStretch(1)
        self._scroll.setWidget(page)

        col = QVBoxLayout(column)
        col.setContentsMargins(0, 0, 0, 0)
        col.setSpacing(14)
        col.addWidget(self._build_header())

        self._error_lbl = _wrap_label(13, RED)
        self._error_lbl.hide()
        col.addWidget(self._error_lbl)

        self._pills_row = QHBoxLayout()
        self._pills_row.setSpacing(8)
        self._pills: dict[int, _LevelPill] = {}
        for n in ladder.LEVELS:
            pill = _LevelPill(n)
            pill.clicked.connect(lambda _=False, lv=n: self._select_level(lv))
            self._pills[n] = pill
            self._pills_row.addWidget(pill)
        col.addLayout(self._pills_row)

        col.addWidget(_section("Enunciado"))
        self._statement = _AutoBrowser(15)
        col.addWidget(self._statement)

        self._task_card = _card()
        tl = QVBoxLayout(self._task_card)
        tl.setContentsMargins(18, 14, 18, 16)
        tl.setSpacing(10)
        self._task_title = QLabel("")
        self._task_title.setStyleSheet(f"color:{TEXT};font-size:15px;font-weight:700;")
        self._task_lbl = _wrap_label(13, TEXT_DIM)
        tl.addWidget(self._task_title)
        tl.addWidget(self._task_lbl)
        self._body = QWidget()
        self._body_lay = QVBoxLayout(self._body)
        self._body_lay.setContentsMargins(0, 4, 0, 0)
        self._body_lay.setSpacing(10)
        tl.addWidget(self._body)
        col.addWidget(self._task_card)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self._submit_btn = _primary("Entregar para corrección")
        self._submit_btn.clicked.connect(self._submit)
        self._paste_btn = _ghost("Pegar corrección")
        self._paste_btn.setToolTip("Lee del portapapeles la respuesta JSON del asistente web")
        self._paste_btn.clicked.connect(self._paste_reply)
        self._handoff_btn = _ghost("Usar archivo de intercambio")
        self._handoff_btn.setToolTip(
            "Escribe la solicitud en .notevault/estudio/handoff para que la corrija "
            "una IA de tu editor (Antigravity, Claude Code…)")
        self._handoff_btn.clicked.connect(self._start_handoff)
        self._discard_btn = _ghost("Descartar solicitud")
        self._discard_btn.clicked.connect(self._discard_request)
        self._giveup_btn = _ghost("Ver demostración")
        self._giveup_btn.clicked.connect(self._give_up)
        for b in (self._submit_btn, self._paste_btn, self._handoff_btn, self._discard_btn):
            actions.addWidget(b)
        actions.addStretch()
        actions.addWidget(self._giveup_btn)
        col.addLayout(actions)
        self._status_lbl = _wrap_label(12, TEXT_DIM)
        col.addWidget(self._status_lbl)

        self._result_card = _card()
        self._build_result_card(self._result_card)
        self._result_card.hide()
        col.addWidget(self._result_card)

        self._proof_box = QWidget()
        pl = QVBoxLayout(self._proof_box)
        pl.setContentsMargins(0, 0, 0, 0)
        pl.addWidget(_section("Demostración modelo"))
        self._proof_view = _AutoBrowser(14)
        pl.addWidget(self._proof_view)
        self._proof_box.hide()
        col.addWidget(self._proof_box)

        self._history_lbl = _wrap_label(11, TEXT_FAINT)
        col.addWidget(self._history_lbl)
        col.addStretch(1)

    def _build_header(self) -> QFrame:
        card = _card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(18, 14, 18, 14)
        lay.setSpacing(6)
        top = QHBoxLayout()
        top.setSpacing(12)
        self._title_lbl = QLabel("")
        self._title_lbl.setWordWrap(True)
        self._title_lbl.setStyleSheet(f"color:{TEXT};font-size:19px;font-weight:700;")
        top.addWidget(self._title_lbl, 1)
        self._timer = PracticeTimer()
        self._timer.finished.connect(self._on_timer_finished)
        top.addWidget(self._timer, 0, Qt.AlignTop)
        self._edit_btn = _ghost("Editar nota")
        self._edit_btn.setToolTip("Abrir el markdown de la demostración en el editor")
        self._edit_btn.clicked.connect(self._request_edit)
        top.addWidget(self._edit_btn, 0, Qt.AlignTop)
        lay.addLayout(top)
        self._chips_lbl = _wrap_label(12, TEXT_DIM)
        lay.addWidget(self._chips_lbl)
        return card

    def _build_result_card(self, card: QFrame):
        lay = QVBoxLayout(card)
        lay.setContentsMargins(18, 16, 18, 16)
        lay.setSpacing(10)
        top = QHBoxLayout()
        top.setSpacing(14)
        self._score_lbl = QLabel("")
        top.addWidget(self._score_lbl)
        side = QVBoxLayout()
        side.setSpacing(2)
        self._verdict_lbl = QLabel("")
        self._ladder_lbl = QLabel("")
        self._quality_lbl = QLabel("")
        self._quality_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        side.addWidget(self._verdict_lbl)
        side.addWidget(self._ladder_lbl)
        side.addWidget(self._quality_lbl)
        top.addLayout(side)
        top.addStretch()
        lay.addLayout(top)

        self._rubric_title = _section("Rúbrica")
        self._rubric_lbl = _AutoBrowser(13)
        self._errors_title = _section("Errores detectados")
        self._errors_lbl = _AutoBrowser(13)
        self._feedback_title = _section("Retroalimentación")
        self._feedback_lbl = _AutoBrowser(14)
        self._next_title = _section("Siguiente paso")
        self._next_lbl = _AutoBrowser(13)
        self._example_title = _section("Ejemplo corregido")
        self._example_view = _AutoBrowser(13)
        self._example_view.setStyleSheet(
            f"QTextBrowser{{background:{BG_INPUT};border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-family:{theme.CODE_FONT_FAMILY};font-size:13px;padding:8px;}}")
        for w in (self._rubric_title, self._rubric_lbl, self._errors_title, self._errors_lbl,
                  self._feedback_title, self._feedback_lbl, self._next_title, self._next_lbl,
                  self._example_title, self._example_view):
            lay.addWidget(w)

        row = QHBoxLayout()
        self._next_level_btn = _primary("Siguiente nivel")
        self._next_level_btn.clicked.connect(self._go_current_level)
        self._new_btn = _ghost("Nuevo intento")
        self._new_btn.clicked.connect(self._new_attempt)
        self._proof_btn = _ghost("Ver demostración modelo")
        self._proof_btn.clicked.connect(self._toggle_proof)
        row.addWidget(self._next_level_btn)
        row.addWidget(self._new_btn)
        row.addWidget(self._proof_btn)
        row.addStretch()
        lay.addLayout(row)

    # ── Public API ────────────────────────────────────────────────────────

    def set_vault(self, vault_root: Path):
        self._leave()
        self.vault_root = Path(vault_root)
        self._store = PracticeAttemptStore(self.vault_root)
        self._path = None
        self._proof = None

    def current_path(self):
        return self._path

    def current_level(self) -> int:
        return self._level

    def load(self, path: Path, text: str):
        self._leave()
        self._path = Path(path)
        for view in (self._statement, self._proof_view):
            view.note_path = self._path
            view.vault_root = self.vault_root
        proof = ladder.ladder_note(text, self._path)
        self._proof = proof
        if proof is None:
            self._error_lbl.setText("No se pudieron leer los pasos de esta demostración: pulsa "
                                    "«Editar nota» para abrirla en el editor.")
            self._error_lbl.show()
            self._task_card.hide()
            return
        self._error_lbl.hide()
        self._task_card.show()
        self._title_lbl.setText(proof.title or self._path.stem)
        self._chips_lbl.setText(self._chips_html(proof))
        self._statement.load_markdown(ladder.statement_markdown(proof))
        self._proof_view.load_markdown(self._proof_markdown(proof))
        self._refresh_state()
        pending = self._pending_request()
        level = pending.get("level") if pending else None
        self._build_level(level if level in self._levels() else self._state.current,
                          restore=pending)

    # ── State ─────────────────────────────────────────────────────────────

    def _levels(self) -> list[int]:
        return ladder.available_levels(self._proof) if self._proof else []

    def _top(self) -> int:
        return max(self._levels() or [5])

    def _refresh_state(self):
        atts = self._store.attempts(self._proof.note_id)
        self._state = ladder.ladder_state(atts, self._top())
        self._refresh_pills()
        self._refresh_history(atts)

    def _refresh_pills(self):
        levels = self._levels()
        for n, pill in self._pills.items():
            pill.setVisible(n in levels)
            if n in levels:
                pill.set_state(selected=n == self._level, current=n == self._state.current,
                               passed=n in self._state.passed,
                               unlocked=self._state.unlocked(n), best=self._state.best.get(n))

    def _refresh_history(self, atts: list[dict]):
        if not atts:
            self._history_lbl.setText("Primer intento de esta demostración. Empiezas en L1.")
            return
        parts = []
        for n in self._levels():
            count = self._state.count.get(n, 0)
            if count:
                parts.append(f"L{n}: {count}× · mejor {self._state.best.get(n, 0)}")
        last = str(atts[-1].get("at", ""))[:10]
        self._history_lbl.setText(
            f"{len(atts)} intento{'s' if len(atts) != 1 else ''} · último {last}   ·   "
            + "   ·   ".join(parts))

    def _chips_html(self, proof) -> str:
        parts = ["Matemáticas" if proof.subject == "mathematics" else _esc(proof.subject),
                 f"<span style='color:{theme.tint(ACCENT)};font-weight:600;'>"
                 "Escalera de demostración</span>"]
        if proof.technique:
            parts.append(_esc(proof.technique.replace("_", " ").capitalize()))
        parts.append(f"{len(proof.steps)} pasos")
        stars = "★" * max(1, min(5, int(proof.difficulty)))
        parts.append(f"<span style='color:{theme.tint(AMBER)};'>{stars}</span>")
        return "  ·  ".join(parts)

    def _proof_markdown(self, proof) -> str:
        head = []
        if proof.strategy.strip():
            head.append(f"**Estrategia:** {proof.strategy.strip()}")
        if proof.key_idea.strip():
            head.append(f"**Idea clave:** {proof.key_idea.strip()}")
        return "\n\n".join(head + [ladder.proof_markdown(proof)])

    def _draft_key(self, level: int | None = None) -> str:
        return f"{self._proof.note_id}#L{level or self._level}"

    def _rel(self) -> str:
        try:
            return self._path.relative_to(self.vault_root).as_posix()
        except ValueError:
            return str(self._path)

    def _set_status(self, text: str, error: bool = False):
        self._status_lbl.setStyleSheet(
            f"color:{theme.tint(RED if error else TEXT_DIM)};font-size:12px;")
        self._status_lbl.setText(text)

    # ── Levels ────────────────────────────────────────────────────────────

    def _select_level(self, level: int):
        if self._proof is None or not self._state.unlocked(level):
            self._refresh_pills()
            return
        if level == self._level and not self._graded:
            self._refresh_pills()
            return
        self._leave()
        self._build_level(level)

    def _go_current_level(self):
        self._leave()
        self._build_level(self._state.current)

    def _clear_body(self):
        while self._body_lay.count():
            item = self._body_lay.takeAt(0)
            w = item.widget()
            if w is not None:
                w.hide()
                w.deleteLater()
        self._fields = []
        self._order_list = None

    def _build_level(self, level: int, restore: dict | None = None):
        proof = self._proof
        self._level = level
        self._graded = False
        self._solution_seen = bool(restore and restore.get("solution_seen"))
        self._seconds_override = None
        self._messages = None
        self._restoring = True
        self._clear_body()
        lv = ladder.LEVELS[level]
        self._task_title.setText(f"Nivel {level} · {lv.label}")
        self._task_lbl.setText(_esc(lv.task))
        self._timer.configure(parse_timer(lv.timer, 0, "stopwatch"))

        draft = restore or self._load_draft(level)
        seed = f"{proof.note_id}:{level}:{self._state.count.get(level, 0)}"
        fields_text = [str(t) for t in draft.get("fields", [])] if draft else []
        n = len(proof.steps)
        if level == 1:
            self._add_fields([None])
        elif level == 2:
            order = draft.get("order") if draft else None
            if not (isinstance(order, list) and sorted(order) == list(range(n))):
                order = ladder.shuffled_order(n, seed)
            self._order_list = StepOrderList()
            self._order_list.set_steps([s.text for s in proof.steps], order)
            self._order_list.order_changed.connect(self._on_order_changed)
            self._body_lay.addWidget(self._order_list)
        elif level == 3:
            hidden = draft.get("hidden") if draft else None
            if not (isinstance(hidden, list) and hidden and all(
                    isinstance(i, int) and 0 <= i < n for i in hidden)):
                hidden = ladder.hidden_steps(n, seed)
            self._hidden = sorted(hidden)
            for i, step in enumerate(proof.steps):
                if i in self._hidden:
                    self._add_step_row(i, None, hidden=True)
                else:
                    self._add_step_row(i, step.text, why=step.why)
        elif level == 4:
            for i, step in enumerate(proof.steps):
                self._add_step_row(i, step.text, justify=True)
        elif level == 5:
            self._add_fields([None])
        else:
            variants = proof.variants
            v = draft.get("variant") if draft else None
            self._variant = v if isinstance(v, int) and 0 <= v < len(variants) else \
                self._state.count.get(6, 0) % max(1, len(variants))
            self._add_variant_picker()
            self._add_fields([None])
        for ed, text in zip(self._fields, fields_text):
            ed.setPlainText(text)
        self._restoring = False

        self._submit_btn.setText("Comprobar orden" if level == 2 else "Entregar para corrección")
        self._submit_btn.setEnabled(True)
        self._paste_btn.hide()
        self._handoff_btn.hide()
        self._discard_btn.hide()
        self._giveup_btn.setEnabled(True)
        self._result_card.hide()
        self._proof_box.hide()
        self._proof_btn.setText("Ver demostración modelo")
        self._set_status("")
        self._refresh_pills()
        if self._fields:
            self.setFocusProxy(self._fields[0])
        if restore:
            self._resume_request(restore)

    def _add_fields(self, labels: list):
        for label in labels:
            if label:
                self._body_lay.addWidget(_step_label(label, 13, TEXT_DIM))
            ed = _field(self._level)
            ed.textChanged.connect(self._on_answer_changed)
            self._fields.append(ed)
            self._body_lay.addWidget(ed)

    def _add_step_row(self, index: int, text, *, hidden: bool = False, justify: bool = False,
                      why: str = ""):
        row = QFrame()
        row.setObjectName("ladderRow")
        row.setAttribute(Qt.WA_StyledBackground, True)
        border = ACCENT if hidden else BORDER
        row.setStyleSheet(
            f"QFrame#ladderRow{{background:{BG_INPUT};border:1px solid {border};"
            "border-radius:8px;}")
        lay = QVBoxLayout(row)
        lay.setContentsMargins(10, 8, 10, 10)
        lay.setSpacing(6)
        head = QHBoxLayout()
        head.setSpacing(10)
        head.addWidget(_badge(index + 1), 0, Qt.AlignTop)
        if hidden:
            head.addWidget(_step_label("**Paso oculto:** escríbelo tú.", 13, ACCENT), 1)
        else:
            col = QVBoxLayout()
            col.setSpacing(3)
            col.addWidget(_step_label(text))
            if why:
                col.addWidget(_step_label(f"Por qué: {why}", 13, TEXT_DIM))
            head.addLayout(col, 1)
        lay.addLayout(head)
        if hidden or justify:
            ed = _field(self._level)
            if justify:
                ed.setPlaceholderText("Por qué: …")
            ed.textChanged.connect(self._on_answer_changed)
            self._fields.append(ed)
            lay.addWidget(ed)
        self._body_lay.addWidget(row)

    def _add_variant_picker(self):
        box = QWidget()
        lay = QVBoxLayout(box)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(6)
        row = QHBoxLayout()
        row.setSpacing(6)
        self._variant_btns = []
        for i in range(len(self._proof.variants)):
            b = _ghost(f"Variante {i + 1}")
            b.setCheckable(True)
            b.clicked.connect(lambda _=False, k=i: self._pick_variant(k))
            self._variant_btns.append(b)
            row.addWidget(b)
        row.addStretch()
        lay.addLayout(row)
        self._variant_view = _AutoBrowser(15)
        self._variant_view.note_path = self._path
        self._variant_view.vault_root = self.vault_root
        lay.addWidget(self._variant_view)
        self._body_lay.addWidget(box)
        self._show_variant()

    def _show_variant(self):
        for i, b in enumerate(self._variant_btns):
            on = i == self._variant
            b.setChecked(on)
            b.setStyleSheet(
                f"QPushButton{{background:{'#2a2440' if on else 'transparent'};"
                f"border:1px solid {ACCENT if on else BORDER};border-radius:7px;"
                f"color:{ACCENT if on else TEXT};font-size:12px;padding:0 12px;"
                f"font-weight:{600 if on else 400};}}"
                f"QPushButton:hover{{border-color:{ACCENT};color:{ACCENT};}}")
        self._variant_view.load_markdown(f"**{self._proof.variants[self._variant]}**")

    def _pick_variant(self, index: int):
        if self._graded or self._req_id:
            self._show_variant()
            return
        self._variant = index
        self._show_variant()
        self._draft_timer.start()

    # ── Answer, drafts, timer ─────────────────────────────────────────────

    def _load_draft(self, level: int) -> dict:
        try:
            data = json.loads(self._store.draft(self._draft_key(level)) or "{}")
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def _draft_data(self) -> dict:
        data = {"fields": [ed.toPlainText() for ed in self._fields]}
        if self._level == 2 and self._order_list is not None:
            data["order"] = self._order_list.order()
        if self._level == 3:
            data["hidden"] = list(self._hidden)
        if self._level == 6:
            data["variant"] = self._variant
        return data

    def _save_draft(self):
        if self._proof is None or self._graded:
            return
        data = self._draft_data()
        empty = not any(t.strip() for t in data["fields"]) and "order" not in data
        self._store.save_draft(self._draft_key(), self._rel(),
                               "" if empty else json.dumps(data, ensure_ascii=False))

    def _clear_draft(self, level: int):
        self._store.save_draft(self._draft_key(level), self._rel(), "")

    def _on_answer_changed(self):
        if self._proof is None or self._graded or self._restoring:
            return
        if not self._timer.is_running() and self._timer.elapsed_seconds() == 0:
            self._timer.start()
        self._draft_timer.start()

    def _on_order_changed(self):
        self._on_answer_changed()

    def _on_timer_finished(self):
        if not self._graded:
            self._set_status("Se acabó el tiempo previsto. Puedes seguir: el tiempo extra también "
                             "se registra.")

    def _request_edit(self):
        self._leave()
        self.edit_requested.emit()

    def _leave(self):
        self._token += 1
        self._poll.stop()
        self._req_id = None
        if self._draft_timer.isActive():
            self._draft_timer.stop()
            self._save_draft()
        self._timer.pause()

    # ── Submitting ────────────────────────────────────────────────────────

    def _rubric(self) -> list[str]:
        return ladder.rubric_for(self._proof, self._level, self._hidden)

    def _answer_text(self) -> str:
        texts = [ed.toPlainText().strip() for ed in self._fields]
        if self._level == 3:
            return "\n\n".join(f"Paso {i + 1}: {t}" for i, t in zip(self._hidden, texts))
        if self._level == 4:
            return "\n\n".join(f"Paso {i + 1} — Por qué: {t}" for i, t in enumerate(texts))
        return texts[0] if texts else ""

    def _shown_text(self) -> str:
        proof = self._proof
        if self._level == 3:
            lines = []
            for i, step in enumerate(proof.steps):
                if i in self._hidden:
                    lines.append(f"{i + 1}. [HIDDEN — the learner writes this step]")
                else:
                    lines.append(f"{i + 1}. {step.text}" + (f" (Por qué: {step.why})"
                                                            if step.why else ""))
            return "\n".join(lines)
        if self._level == 4:
            return ladder.proof_markdown(proof, with_why=False)
        return "Only the theorem statement."

    def _submit(self):
        if self._proof is None or self._graded:
            return
        if self._level == 2:
            order = self._order_list.order()
            self._save_draft()
            self._finish_with(ladder.local_order_result(order), "local",
                              "Orden: " + ", ".join(str(i + 1) for i in order))
            return
        texts = [ed.toPlainText().strip() for ed in self._fields]
        if not texts or not all(texts):
            self._set_status("Completa todos los huecos antes de entregar." if len(texts) > 1
                             else "Escribe una respuesta antes de entregarla.", error=True)
            return
        self._save_draft()
        self._pending_answer = self._answer_text()
        try:
            recent = recent_errors(self.vault_root, self._proof.subject)
        except Exception:  # noqa: BLE001 - the log is optional context
            recent = []
        variant = self._proof.variants[self._variant] if self._level == 6 else ""
        self._messages = ladder.build_ladder_messages(
            self._proof, self._level, self._pending_answer, rubric=self._rubric(),
            shown=self._shown_text(), seconds=self._timer.elapsed_seconds(),
            solution_seen=self._solution_seen, recent_errors=recent, variant=variant)
        cfg = AIConfig.from_dict(AppConfig.get_ai_config())
        self._submit_btn.setEnabled(False)
        self._handoff_btn.hide()
        if cfg.is_bridge:
            self._start_bridge(cfg)
        else:
            self._start_http(cfg)

    def _start_http(self, cfg: AIConfig):
        self._set_status(f"Corrigiendo con {cfg.info.label}…")
        token = self._token
        self._worker = AIWorker(cfg, self._messages, self)
        self._worker.finished_ok.connect(lambda text, t=token: self._on_reply(text, "http", t))
        self._worker.failed.connect(lambda msg, t=token: self._on_http_failed(msg, t))
        self._worker.start()

    def _on_http_failed(self, message: str, token: int):
        if token != self._token:
            return
        self._submit_btn.setEnabled(True)
        self._handoff_btn.show()
        self._set_status(
            f"No se pudo corregir: {_esc(message)}<br>Puedes reintentar o usar el archivo de "
            "intercambio para que te corrija otra IA.", error=True)

    def _start_bridge(self, cfg: AIConfig):
        QApplication.clipboard().setText(build_bridge_prompt(self._messages))
        url = BRIDGE_URLS.get(cfg.provider, "")
        if url:
            _open_url(url)
        req_path = self._write_handoff()
        self._paste_btn.show()
        self._set_status(
            f"Prompt de corrección copiado y abierta la web de {_esc(cfg.info.label)}. Pégalo allí, "
            "copia la respuesta (el bloque JSON) y pulsa «Pegar corrección».<br>"
            f"También quedó una solicitud en archivo: <code>{_esc(req_path)}</code>")

    def _start_handoff(self):
        if self._proof is None or not self._messages:
            return
        req_path = self._write_handoff()
        response = handoff.response_path(self.vault_root, self._req_id)
        QApplication.clipboard().setText(
            f"Corrige la solicitud de práctica de NoteVault que está en "
            f"{(self.vault_root / req_path).as_posix()}: sigue sus instrucciones y escribe "
            f"solo el JSON de la corrección en {response.as_posix()}.")
        self._submit_btn.setEnabled(False)
        self._handoff_btn.hide()
        self._paste_btn.show()
        self._set_status(
            "Solicitud escrita y una instrucción lista para pegar copiada al portapapeles. "
            "Pégala en tu IA de editor (Antigravity, Claude Code…); la corrección aparecerá aquí "
            "sola cuando escriba el archivo.")

    def _write_handoff(self) -> str:
        for old in handoff.pending_for_note(self.vault_root, self._proof.note_id):
            handoff.close_request(self.vault_root, old["id"])
        meta = {"note_id": self._proof.note_id, "note_path": self._rel(),
                "subject": self._proof.subject, "mode": ladder.mode_id(self._level),
                "level": self._level, "answer": self._pending_answer,
                "hints_used": 0, "seconds": self._timer.elapsed_seconds(),
                "solution_seen": self._solution_seen, **self._draft_data()}
        self._req_id = handoff.write_request(self.vault_root, "grade", self._messages, meta)
        self._discard_btn.show()
        self._poll.start()
        return f".notevault/estudio/handoff/requests/{self._req_id}.md"

    def _pending_request(self) -> dict | None:
        try:
            pending = handoff.pending_for_note(self.vault_root, self._proof.note_id)
        except OSError:
            return None
        pending = [p for p in pending if ladder.level_of(p.get("mode")) in self._levels()]
        if not pending:
            return None
        for old in pending[:-1]:
            handoff.close_request(self.vault_root, old["id"])
        req = pending[-1]
        req["level"] = ladder.level_of(req.get("mode"))
        return req

    def _resume_request(self, req: dict):
        self._req_id = str(req["id"])
        self._messages = req.get("messages") or None
        self._pending_answer = str(req.get("answer") or "")
        seconds = req.get("seconds")
        self._seconds_override = int(seconds) if isinstance(seconds, (int, float)) else None
        text = handoff.read_response(self.vault_root, self._req_id)
        if text:
            self._on_reply(text, "handoff", self._token)
            return
        self._submit_btn.setEnabled(False)
        self._paste_btn.show()
        self._discard_btn.show()
        self._set_status(
            "Tienes una corrección pendiente en el archivo de intercambio "
            f"(<code>{_esc(self._req_id)}</code>). Aparecerá aquí sola cuando la IA escriba "
            "la respuesta; también puedes pegarla o descartar la solicitud.")
        self._poll.start()

    def _discard_request(self):
        if self._req_id:
            try:
                handoff.close_request(self.vault_root, self._req_id)
            except OSError:
                pass
        self._req_id = None
        self._poll.stop()
        self._token += 1
        self._seconds_override = None
        self._discard_btn.hide()
        self._paste_btn.hide()
        self._submit_btn.setEnabled(not self._graded)
        self._set_status("Solicitud descartada. Puedes volver a entregar tu respuesta.")

    def _poll_handoff(self):
        if not self._req_id:
            self._poll.stop()
            return
        text = handoff.read_response(self.vault_root, self._req_id)
        if text:
            self._on_reply(text, "handoff", self._token)

    def _paste_reply(self):
        text = QApplication.clipboard().text().strip()
        if not text:
            self._set_status("El portapapeles está vacío: copia primero la respuesta del asistente.",
                             error=True)
            return
        self._on_reply(text, "bridge", self._token)

    def _on_reply(self, text: str, transport: str, token: int):
        if token != self._token or self._proof is None or self._graded:
            return
        try:
            result = parse_grade_reply(text, len(self._rubric()))
        except GradeParseError as e:
            if transport == "handoff":
                self._poll.stop()
            self._submit_btn.setEnabled(True)
            self._set_status(str(e), error=True)
            return
        self._poll.stop()
        if self._req_id:
            try:
                handoff.close_request(self.vault_root, self._req_id)
            except OSError:
                pass
            self._req_id = None
        self._finish_with(result, transport, self._pending_answer)

    def _finish_with(self, result: GradeResult, transport: str, answer: str):
        level = self._level
        before = self._state.current
        self._timer.pause()
        quality = None
        ex = ladder.level_exercise(self._proof, level, self._rubric())
        try:
            attempt = apply_result(
                self.vault_root, ex, self._rel(), answer=answer, hints_used=0,
                seconds=(self._seconds_override if self._seconds_override is not None
                         else self._timer.elapsed_seconds()),
                solution_seen=self._solution_seen, transport=transport, result=result,
                entity_type=ladder.mode_id(level))
            quality = attempt.get("quality")
            self._clear_draft(level)
            self._set_status("Corregido y guardado en tu historial de práctica.")
        except Exception as e:  # noqa: BLE001 - shown to the learner
            self._set_status(f"Corregido, pero no se pudo guardar el intento: {_esc(e)}", error=True)
        self._graded = True
        self._seconds_override = None
        for ed in self._fields:
            ed.setReadOnly(True)
        if self._order_list is not None:
            self._order_list.set_locked(True)
            self._order_list.set_marks(result.rubric if level == 2 else None)
        self._submit_btn.setEnabled(False)
        self._paste_btn.hide()
        self._handoff_btn.hide()
        self._discard_btn.hide()
        self._refresh_state()
        self._render_result(result, quality, level, before)

    # ── Result ────────────────────────────────────────────────────────────

    def _ladder_message(self, ok: bool, level: int, before: int) -> str:
        now = self._state.current
        if ok and level == self._top():
            return "Escalera completada: repasa cuando te lo pida el repaso espaciado."
        if ok and now > before:
            return f"Nivel superado · se desbloquea L{now}"
        if ok:
            return "Nivel superado"
        if now < before:
            return f"No superado · bajas a L{now}"
        return "No superado · repite este nivel"

    def _render_result(self, result: GradeResult, quality, level: int, before: int):
        score = int(result.score)
        ok = ladder.passed(score, self._solution_seen)
        colour = GREEN if score >= 75 else (AMBER if score >= 40 else RED)
        self._score_lbl.setText(f"{score}<span style='font-size:16px;color:{theme.tint(TEXT_DIM)};'>"
                                "/100</span>")
        self._score_lbl.setStyleSheet(f"color:{theme.tint(colour)};font-size:34px;font-weight:700;")
        self._verdict_lbl.setText(VERDICT_LABELS.get(result.verdict, result.verdict))
        self._verdict_lbl.setStyleSheet(f"color:{theme.tint(colour)};font-size:15px;font-weight:600;")
        self._ladder_lbl.setText(self._ladder_message(ok, level, before))
        self._ladder_lbl.setStyleSheet(
            f"color:{theme.tint(GREEN if ok else AMBER)};font-size:12px;font-weight:600;")
        self._quality_lbl.setText(
            f"Calidad para el repaso espaciado (L{level}): {quality}/5"
            if quality is not None else "")

        rubric = self._rubric()
        if rubric:
            lines = []
            for i, item in enumerate(rubric):
                hit = i < len(result.rubric) and bool(result.rubric[i])
                mark = (f"<span style='color:{theme.tint(GREEN)};'>✓</span>" if hit
                        else f"<span style='color:{theme.tint(RED)};'>✗</span>")
                lines.append(f"{mark}&nbsp; {_inline(item, 13)}")
            self._rubric_lbl.set_html("<br>".join(lines))
        self._rubric_title.setVisible(bool(rubric))
        self._rubric_lbl.setVisible(bool(rubric))

        if result.errors:
            blocks = []
            for e in result.errors:
                head = f"<b>{_esc(e.category)}</b>"
                if e.anchor:
                    head += f" · <i>{_esc(e.anchor)}</i>"
                body = _inline(e.description, 13)
                if e.evidence:
                    body += (f"<br><span style='color:{theme.tint(TEXT_DIM)};'>En tu respuesta: "
                             f"«{_esc(e.evidence)}»</span>")
                if e.fix:
                    body += f"<br>Cómo corregirlo: {_inline(e.fix, 13)}"
                blocks.append(f"{head}<br>{body}")
            self._errors_lbl.set_html("<br><br>".join(blocks))
        self._errors_title.setVisible(bool(result.errors))
        self._errors_lbl.setVisible(bool(result.errors))

        self._feedback_lbl.set_html(_inline(result.feedback, 14))
        self._feedback_title.setVisible(bool(result.feedback))
        self._feedback_lbl.setVisible(bool(result.feedback))
        self._next_lbl.set_html(_inline(result.next_step, 13))
        self._next_title.setVisible(bool(result.next_step))
        self._next_lbl.setVisible(bool(result.next_step))

        example = (result.example or "").strip("\n")
        body = math_render.render_math(_esc(example), font_px=13)
        self._example_view.set_html(f"<div style=\"white-space:pre-wrap;\">{body}</div>")
        self._example_title.setVisible(bool(example))
        self._example_view.setVisible(bool(example))

        current = self._state.current
        self._next_level_btn.setVisible(current != level)
        self._next_level_btn.setText(f"{'Subir' if current > level else 'Bajar'} a L{current}")
        self._result_card.show()
        QTimer.singleShot(0, lambda: self._scroll.ensureWidgetVisible(self._result_card, 0, 40))

    def _toggle_proof(self):
        if self._proof_box.isVisible():
            self._proof_box.hide()
            self._proof_btn.setText("Ver demostración modelo")
        else:
            self._proof_box.show()
            self._proof_btn.setText("Ocultar demostración")

    def _give_up(self):
        if self._proof is None:
            return
        if not self._graded:
            answer = QMessageBox.question(
                self, "Ver demostración",
                "Ver la demostración antes de entregar cuenta como intento con ayuda: el nivel "
                "volverá pronto a tu repaso. ¿Continuar?")
            if answer != QMessageBox.Yes:
                return
            self._solution_seen = True
        self._proof_box.show()
        self._proof_btn.setText("Ocultar demostración")
        empty = not any(ed.toPlainText().strip() for ed in self._fields)
        if not self._graded and empty and self._level != 2:
            result = GradeResult(
                score=0, verdict="incorrect", rubric=[False] * len(self._rubric()), errors=[],
                feedback="Viste la demostración sin entregar una respuesta.",
                next_step="Estudia la demostración y vuelve a este nivel mañana, sin mirarla.",
                example="", raw="")
            self._finish_with(result, "local", "")
        QTimer.singleShot(0, lambda: self._scroll.ensureWidgetVisible(self._proof_box, 0, 40))

    def _new_attempt(self):
        if self._proof is None:
            return
        self._leave()
        self._build_level(self._level)
        if self._fields:
            self._fields[0].setFocus()

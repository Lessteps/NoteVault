"""Interactive practice view shown instead of the editor for `type: exercise` notes.

The note stays the source of truth; this view only reads it. The learner's answer is
judged by an AI teacher through HTTP, the clipboard bridge or a handoff file, and every
attempt is stored under .notevault/estudio (attempts, English error log, SRS).
"""

import html
import re
from pathlib import Path

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame, QScrollArea,
    QPlainTextEdit, QMessageBox, QApplication, QSizePolicy,
)
from PySide6.QtCore import Qt, Signal, QTimer, QUrl
from PySide6.QtGui import QDesktopServices

from .... import theme
from .....config import AppConfig
from .....core.ai_client import AIConfig, AIWorker, BRIDGE_URLS, build_bridge_prompt
from .....core.practice import handoff, modes
from .....core.practice.attempts import PracticeAttemptStore
from .....core.practice.discipline_catalog import discipline_for, skill_of
from .....core.practice.error_log import apply_result, recent_errors
from .....core.practice.exercise_note import parse_exercise
from .....core.practice.grading import (
    GradeParseError, GradeResult, build_grading_messages, parse_grade_reply,
)
from .....core.practice.timer import parse_timer
from ..note_view import NoteTextBrowser
from . import math_render
from .drill_panel import DrillPanel
from .practice_timer import PracticeTimer

BG_PAGE = "#1a1a1e"
BG_CARD = "#202024"
BG_INPUT = "#1c1c20"
BORDER = "#33333e"
TEXT = "#dcdde0"
TEXT_DIM = "#888895"
TEXT_FAINT = "#666672"
ACCENT = "#7c5af0"
GREEN = "#3fb950"
AMBER = "#e0a13a"
RED = "#f2555a"

SUBJECT_LABELS = {
    "mathematics": "Matemáticas", "programming": "Programación",
    "english": "Inglés", "general": "General",
}
VERDICT_LABELS = {
    "correct": "Correcto", "partial": "Parcialmente correcto", "incorrect": "Incorrecto",
}
PLACEHOLDERS = {
    "prove": "Escribe la demostración paso a paso, justificando cada paso.",
    "counterexample": "Da el objeto concreto y comprueba que cumple las hipótesis y falla la conclusión.",
    "true_false": "Escribe «Verdadero» o «Falso» y justifícalo con una prueba o un contraejemplo.",
    "find_error": "Señala dónde está el error, por qué está mal y cómo se corrige.",
    "explain": "Explícalo con tus palabras, como si se lo enseñaras a alguien, con un ejemplo.",
    "debug": "Para cada bug: línea, por qué falla y el arreglo. Empieza por tu hipótesis.",
    "refactor": "Escribe el código refactorizado y, debajo, qué mejoraste y por qué.",
    "design": "Escribe tu diseño (tablas, tipos, restricciones o SQL) y justifica las decisiones.",
    "commands": "Escribe la secuencia de comandos, uno por línea, con un comentario de por qué.",
    "implement": "Escribe tu código. No se ejecuta: el profesor lo lee y razona sobre él.",
    "writing": "Write your text here.",
    "rewrite": "Rewrite each sentence correctly, one per line.",
    "translate": "Write your translation here.",
    "cloze": "Escribe las palabras que faltan, en orden, una por línea.",
}


def _open_url(url: str):
    QDesktopServices.openUrl(QUrl(url))


def _esc(text) -> str:
    return html.escape(str(text or ""))


_CODE_RE = re.compile(r"`([^`]+)`")
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")


def _inline(text, math_px: int = 0) -> str:
    """Escape text and render its inline `code`, $math$ (when math_px) and **bold**
    for a rich-text label."""
    out = _esc(text)
    out = _CODE_RE.sub(
        lambda m: (f"<code style=\"font-family:{theme.CODE_FONT_FAMILY};"
                   f"background:{theme.tint('#2a2a32')};\">&nbsp;{m.group(1)}&nbsp;</code>"), out)
    if math_px:
        out = math_render.render_math(out, font_px=math_px)
    return _BOLD_RE.sub(r"<b>\1</b>", out).replace("\n", "<br>")


class _AutoBrowser(NoteTextBrowser):
    """A reading surface that grows with its content instead of scrolling."""

    def __init__(self, font_px: int = 15, parent=None):
        super().__init__(parent)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setFrameShape(QFrame.NoFrame)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet(
            f"QTextBrowser{{background:transparent;border:none;color:{TEXT};"
            f"font-family:{theme.NOTE_FONT_FAMILY};font-size:{font_px}px;padding:0;}}")
        self.document().documentLayout().documentSizeChanged.connect(self._fit)

    def _fit(self, size):
        self.setFixedHeight(max(24, int(size.height()) + 6))

    def set_html(self, text: str):
        self.document().clear()
        self.setHtml(text)
        if self.math_enabled:
            math_render.typeset_document(self.document())

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._fit(self.document().size())


def _card() -> QFrame:
    f = QFrame()
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(
        f"QFrame#practiceCard{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
    f.setObjectName("practiceCard")
    return f


def _section(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setStyleSheet(
        f"color:{TEXT_DIM};font-size:10px;font-weight:700;letter-spacing:1px;padding-top:4px;")
    return lbl


def _primary(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(34)
    b.setStyleSheet(
        f"QPushButton{{background:{ACCENT};border:none;border-radius:7px;color:#ffffff;"
        "font-size:13px;font-weight:600;padding:0 18px;}"
        "QPushButton:hover{background:#6a48e0;}"
        "QPushButton:disabled{background:#383844;color:#888895;}")
    return b


def _ghost(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(30)
    b.setStyleSheet(
        f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:7px;"
        f"color:{TEXT};font-size:12px;padding:0 12px;}}"
        f"QPushButton:hover{{border-color:{ACCENT};color:{ACCENT};}}"
        "QPushButton:disabled{color:#55555f;border-color:#2e2e38;}")
    return b


def _wrap_label(size: int = 13, colour: str = TEXT) -> QLabel:
    lbl = QLabel("")
    lbl.setWordWrap(True)
    lbl.setTextFormat(Qt.RichText)
    lbl.setTextInteractionFlags(Qt.TextSelectableByMouse)
    lbl.setStyleSheet(f"color:{colour};font-size:{size}px;")
    return lbl


class PracticeView(QWidget):
    edit_requested = Signal()
    open_note_requested = Signal(Path)

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.setObjectName("practiceView")
        self.vault_root = Path(vault_root)
        self._store = PracticeAttemptStore(self.vault_root)
        self._path = None
        self._ex = None
        self._mode = None
        self._token = 0
        self._hints_shown = 0
        self._solution_seen = False
        self._graded = False
        self._pending_answer = ""
        self._messages = None
        self._req_id = None
        self._seconds_override = None
        self._math = True
        self._worker = None
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
        self._scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        root.addWidget(self._scroll)

        page = QWidget()
        page.setObjectName("practicePage")
        page.setStyleSheet(f"QWidget#practicePage{{background:{BG_PAGE};}}")
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

        self._statement_title = _section("Enunciado")
        self._statement = _AutoBrowser(15)
        col.addWidget(self._statement_title)
        col.addWidget(self._statement)

        self._exercise_box = QWidget()
        col.addWidget(self._exercise_box)
        self._build_exercise_box(self._exercise_box)

        self._drill = DrillPanel()
        self._drill.started.connect(self._on_drill_started)
        self._drill.finished.connect(self._on_drill_finished)
        col.addWidget(self._drill)

        self._result_card = _card()
        self._build_result_card(self._result_card)
        self._result_card.hide()
        col.addWidget(self._result_card)

        self._solution_box = QWidget()
        sl = QVBoxLayout(self._solution_box)
        sl.setContentsMargins(0, 0, 0, 0)
        sl.addWidget(_section("Solución modelo"))
        self._solution_view = _AutoBrowser(14)
        sl.addWidget(self._solution_view)
        self._solution_box.hide()
        col.addWidget(self._solution_box)

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
        self._edit_btn.setToolTip("Abrir el markdown del ejercicio en el editor")
        self._edit_btn.clicked.connect(self._request_edit)
        top.addWidget(self._edit_btn, 0, Qt.AlignTop)
        lay.addLayout(top)
        self._chips_lbl = _wrap_label(12, TEXT_DIM)
        lay.addWidget(self._chips_lbl)
        return card

    def _build_exercise_box(self, box: QWidget):
        lay = QVBoxLayout(box)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(10)

        self._hints_view = _AutoBrowser(14)
        self._hints_view.hide()
        hint_row = QHBoxLayout()
        self._hint_btn = _ghost("Ver pista")
        self._hint_btn.clicked.connect(self._reveal_hint)
        hint_row.addWidget(self._hint_btn)
        hint_row.addStretch()
        lay.addLayout(hint_row)
        lay.addWidget(self._hints_view)

        lay.addWidget(_section("Tu respuesta"))
        self._answer = QPlainTextEdit()
        self._answer.setMinimumHeight(230)
        self._answer.textChanged.connect(self._on_answer_changed)
        lay.addWidget(self._answer)
        self.setFocusProxy(self._answer)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self._submit_btn = _primary("Entregar para corrección")
        self._submit_btn.clicked.connect(self._submit)
        self._paste_btn = _ghost("Pegar corrección")
        self._paste_btn.setToolTip("Lee del portapapeles la respuesta JSON del asistente web")
        self._paste_btn.clicked.connect(self._paste_reply)
        self._paste_btn.hide()
        self._handoff_btn = _ghost("Usar archivo de intercambio")
        self._handoff_btn.setToolTip(
            "Escribe la solicitud en .notevault/estudio/handoff para que la corrija "
            "una IA de tu editor (Antigravity, Claude Code…)")
        self._handoff_btn.clicked.connect(self._start_handoff)
        self._discard_btn = _ghost("Descartar solicitud")
        self._discard_btn.setToolTip(
            "Cancela la corrección pendiente en el archivo de intercambio para volver a entregar")
        self._discard_btn.clicked.connect(self._discard_request)
        self._discard_btn.hide()
        self._giveup_btn = _ghost("Ver solución")
        self._giveup_btn.clicked.connect(self._give_up)
        for b in (self._submit_btn, self._paste_btn, self._handoff_btn, self._discard_btn):
            actions.addWidget(b)
        actions.addStretch()
        actions.addWidget(self._giveup_btn)
        lay.addLayout(actions)

        self._status_lbl = _wrap_label(12, TEXT_DIM)
        lay.addWidget(self._status_lbl)

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
        self._quality_lbl = QLabel("")
        self._quality_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        side.addWidget(self._verdict_lbl)
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
        self._new_btn = _primary("Nuevo intento")
        self._new_btn.clicked.connect(self._new_attempt)
        self._solution_btn = _ghost("Ver solución modelo")
        self._solution_btn.clicked.connect(self._toggle_solution)
        row.addWidget(self._new_btn)
        row.addWidget(self._solution_btn)
        row.addStretch()
        lay.addLayout(row)

    # ── Public API ────────────────────────────────────────────────────────

    def set_vault(self, vault_root: Path):
        self._leave()
        self.vault_root = Path(vault_root)
        self._store = PracticeAttemptStore(self.vault_root)
        self._path = None
        self._ex = None

    def current_path(self):
        return self._path

    def load(self, path: Path, text: str):
        self._leave()
        self._path = Path(path)
        for view in (self._statement, self._hints_view, self._solution_view):
            view.note_path = self._path
            view.vault_root = self.vault_root
        try:
            ex = parse_exercise(text, self._path)
        except Exception as e:  # noqa: BLE001 - shown to the learner
            self._ex = None
            self._error_lbl.setText(f"No se pudo leer el ejercicio: {_esc(e)}")
            self._error_lbl.show()
            self._exercise_box.hide()
            self._drill.hide()
            return
        self._error_lbl.hide()
        self._ex = ex
        self._mode = modes.MODES.get(ex.mode) or modes.mode_for(ex.frontmatter)
        self._hints_shown = 0
        self._solution_seen = False
        self._graded = False
        self._seconds_override = None
        self._messages = None
        self._math = ex.subject != "programming"
        for view in (self._statement, self._hints_view, self._solution_view, self._example_view,
                     self._rubric_lbl, self._errors_lbl, self._feedback_lbl, self._next_lbl):
            view.math_enabled = self._math

        self._title_lbl.setText(ex.title or self._path.stem)
        self._chips_lbl.setText(self._chips_html(ex))
        self._timer.configure(parse_timer(ex.timer, ex.minutes, self._mode.timer))

        statement = ex.statement.strip()
        if ex.code.strip():
            statement += f"\n\n```{ex.code_lang}\n{ex.code.rstrip()}\n```\n"
        self._statement.load_markdown(statement or "_(Sin enunciado)_")
        self._statement_title.setVisible(bool(statement))
        self._statement.setVisible(bool(statement))

        drill = self._mode.answer_kind == "drill"
        self._exercise_box.setVisible(not drill)
        self._drill.setVisible(drill)
        if drill:
            self._drill.prepare(ex.drill, ex.items, ex.difficulty)

        code = self._mode.answer_kind == "code"
        family = theme.CODE_FONT_FAMILY if code else theme.NOTE_FONT_FAMILY
        self._answer.setStyleSheet(
            f"QPlainTextEdit{{background:{BG_INPUT};border:1px solid {BORDER};border-radius:8px;"
            f"color:{TEXT};font-family:{family};font-size:14px;padding:10px;}}"
            f"QPlainTextEdit:focus{{border-color:{ACCENT};}}")
        self._answer.setPlaceholderText(PLACEHOLDERS.get(self._mode.id, "Escribe tu respuesta."))
        self._answer.blockSignals(True)
        self._answer.setPlainText(self._store.draft(ex.note_id))
        self._answer.blockSignals(False)
        self._answer.setReadOnly(False)

        self._hints_view.hide()
        self._update_hint_btn()
        self._solution_view.load_markdown(ex.solution.strip() or "_(La nota no trae solución modelo.)_")
        self._solution_box.hide()
        self._result_card.hide()
        self._submit_btn.setEnabled(True)
        self._paste_btn.hide()
        self._handoff_btn.hide()
        self._discard_btn.hide()
        self._giveup_btn.setEnabled(bool(ex.solution.strip()))
        self._set_status("")
        self._refresh_history()
        if not drill:
            self._resume_handoff()

    # ── Header / history ──────────────────────────────────────────────────

    def _chips_html(self, ex) -> str:
        parts = [SUBJECT_LABELS.get(ex.subject, ex.subject or "General")]
        disc = discipline_for(ex.frontmatter)
        disc_txt = disc.title
        skill = skill_of(disc, ex.skill) if ex.skill else None
        if skill is not None:
            disc_txt += f" · {ex.skill} {skill.title}"
        parts.append(disc_txt)
        if self._mode.label != disc.title:
            parts.append(f"<span style='color:{theme.tint(ACCENT)};font-weight:600;'>"
                         f"{_esc(self._mode.label)}</span>")
        if ex.difficulty:
            stars = "★" * max(1, min(5, int(ex.difficulty)))
            parts.append(f"<span style='color:{theme.tint('#e0a13a')};'>{stars}</span>")
        if ex.level:
            parts.append(f"Nivel {_esc(ex.level)}")
        if ex.assistance == "nohelp":
            parts.append("Sin ayuda")
        return "  ·  ".join(p if p.startswith("<span") else _esc(p) for p in parts)

    def _refresh_history(self):
        if self._ex is None:
            self._history_lbl.setText("")
            return
        atts = self._store.attempts(self._ex.note_id)
        if not atts:
            self._history_lbl.setText("Primer intento de este ejercicio.")
            return
        best = max(int(a.get("score") or 0) for a in atts)
        last = str(atts[-1].get("at", ""))[:10]
        n = len(atts)
        self._history_lbl.setText(
            f"{n} intento{'s' if n != 1 else ''} · mejor {best}/100 · último {last}")

    def _math_px(self, font_px: int) -> int:
        return font_px if self._math else 0

    def _rel(self) -> str:
        try:
            return self._path.relative_to(self.vault_root).as_posix()
        except ValueError:
            return str(self._path)

    def _set_status(self, text: str, error: bool = False):
        colour = RED if error else TEXT_DIM
        self._status_lbl.setStyleSheet(f"color:{theme.tint(colour)};font-size:12px;")
        self._status_lbl.setText(text)

    # ── Answer, hints, timer ──────────────────────────────────────────────

    def _request_edit(self):
        self._leave()
        self.edit_requested.emit()

    def _leave(self):
        """Stop anything tied to the exercise on screen (switching note or mode)."""
        self._token += 1
        self._poll.stop()
        self._req_id = None
        if self._draft_timer.isActive():
            self._draft_timer.stop()
            self._save_draft()
        self._timer.pause()

    def _on_answer_changed(self):
        if self._ex is None or self._graded:
            return
        if (self._answer.toPlainText().strip() and not self._timer.is_running()
                and self._timer.elapsed_seconds() == 0):
            self._timer.start()
        self._draft_timer.start()

    def _save_draft(self):
        if self._ex is None or self._graded:
            return
        self._store.save_draft(self._ex.note_id, self._rel(), self._answer.toPlainText())

    def _update_hint_btn(self):
        total = len(self._ex.hints) if self._ex else 0
        self._hint_btn.setVisible(total > 0)
        if self._hints_shown >= total:
            self._hint_btn.setText("No hay más pistas")
            self._hint_btn.setEnabled(False)
        else:
            self._hint_btn.setText(f"Ver pista {self._hints_shown + 1} de {total}")
            self._hint_btn.setEnabled(True)

    def _reveal_hint(self):
        ex = self._ex
        if ex is None or self._hints_shown >= len(ex.hints):
            return
        if ex.assistance == "nohelp" and self._hints_shown == 0:
            answer = QMessageBox.question(
                self, "Ejercicio sin ayuda",
                "Este ejercicio está pensado para hacerse sin pistas. ¿Ver la primera igualmente?")
            if answer != QMessageBox.Yes:
                return
        self._hints_shown += 1
        self._show_hints()

    def _show_hints(self):
        md = "\n\n".join(f"**Pista {i + 1}.** {h.strip()}"
                         for i, h in enumerate(self._ex.hints[:self._hints_shown]))
        self._hints_view.load_markdown(md)
        self._hints_view.setVisible(self._hints_shown > 0)
        self._update_hint_btn()

    def _on_timer_finished(self):
        if self._drill.isVisible() and self._drill.is_running():
            self._drill.stop_early()
        elif not self._graded:
            self._set_status("Se acabó el tiempo previsto. Puedes seguir: el tiempo extra también "
                             "se registra.")

    # ── Submitting ────────────────────────────────────────────────────────

    def _submit(self):
        ex = self._ex
        if ex is None or self._graded:
            return
        answer = self._answer.toPlainText().strip()
        if not answer:
            self._set_status("Escribe una respuesta antes de entregarla.", error=True)
            return
        self._save_draft()
        self._pending_answer = answer
        try:
            recent = recent_errors(self.vault_root, ex.subject)
        except Exception:  # noqa: BLE001 - the log is optional context
            recent = []
        self._messages = build_grading_messages(
            ex, answer, hints_used=self._hints_shown, seconds=self._timer.elapsed_seconds(),
            solution_seen=self._solution_seen, recent_errors=recent)
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
        prompt = build_bridge_prompt(self._messages)
        QApplication.clipboard().setText(prompt)
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
        if self._ex is None or not self._messages:
            return
        req_path = self._write_handoff()
        response = handoff.response_path(self.vault_root, self._req_id)
        invocation = (
            f"Corrige la solicitud de práctica de NoteVault que está en "
            f"{(self.vault_root / req_path).as_posix()}: sigue sus instrucciones y escribe "
            f"solo el JSON de la corrección en {response.as_posix()}.")
        QApplication.clipboard().setText(invocation)
        self._submit_btn.setEnabled(False)
        self._handoff_btn.hide()
        self._paste_btn.show()
        self._set_status(
            "Solicitud escrita y una instrucción lista para pegar copiada al portapapeles. "
            "Pégala en tu IA de editor (Antigravity, Claude Code…); la corrección aparecerá aquí "
            "sola cuando escriba el archivo.")

    def _write_handoff(self) -> str:
        ex = self._ex
        for old in handoff.pending_for_note(self.vault_root, ex.note_id):
            handoff.close_request(self.vault_root, old["id"])
        meta = {"note_id": ex.note_id, "note_path": self._rel(), "subject": ex.subject,
                "mode": ex.mode, "answer": self._pending_answer,
                "hints_used": self._hints_shown, "seconds": self._timer.elapsed_seconds(),
                "solution_seen": self._solution_seen}
        self._req_id = handoff.write_request(self.vault_root, "grade", self._messages, meta)
        self._discard_btn.show()
        self._poll.start()
        return f".notevault/estudio/handoff/requests/{self._req_id}.md"

    def _resume_handoff(self):
        """Re-attach a grade request left waiting when the learner switched note: ingest
        its response now if it already exists, otherwise wait for it again."""
        ex = self._ex
        try:
            pending = handoff.pending_for_note(self.vault_root, ex.note_id)
        except OSError:
            return
        if not pending:
            return
        req = pending[-1]
        for old in pending[:-1]:
            handoff.close_request(self.vault_root, old["id"])
        self._req_id = str(req["id"])
        self._messages = req.get("messages") or None
        self._pending_answer = str(req.get("answer") or self._store.draft(ex.note_id))
        self._solution_seen = bool(req.get("solution_seen"))
        seconds = req.get("seconds")
        self._seconds_override = int(seconds) if isinstance(seconds, (int, float)) else None
        self._answer.blockSignals(True)
        self._answer.setPlainText(self._pending_answer)
        self._answer.blockSignals(False)
        hints = req.get("hints_used")
        if isinstance(hints, int) and hints > 0:
            self._hints_shown = min(hints, len(ex.hints))
            self._show_hints()
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
        ex = self._ex
        if token != self._token or ex is None or self._graded:
            return
        try:
            result = parse_grade_reply(text, len(ex.rubric))
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
        ex = self._ex
        self._timer.pause()
        quality = None
        try:
            attempt = apply_result(
                self.vault_root, ex, self._rel(), answer=answer, hints_used=self._hints_shown,
                seconds=(self._seconds_override if self._seconds_override is not None
                         else self._timer.elapsed_seconds()),
                solution_seen=self._solution_seen, transport=transport, result=result)
            quality = attempt.get("quality")
            self._set_status("Corregido y guardado en tu historial de práctica.")
        except Exception as e:  # noqa: BLE001 - shown to the learner
            self._set_status(f"Corregido, pero no se pudo guardar el intento: {_esc(e)}", error=True)
        self._graded = True
        self._answer.setReadOnly(True)
        self._submit_btn.setEnabled(False)
        self._paste_btn.hide()
        self._handoff_btn.hide()
        self._discard_btn.hide()
        self._seconds_override = None
        self._render_result(result, quality)
        self._refresh_history()

    # ── Result ────────────────────────────────────────────────────────────

    def _render_result(self, result: GradeResult, quality):
        score = int(result.score)
        colour = GREEN if score >= 75 else (AMBER if score >= 40 else RED)
        self._score_lbl.setText(f"{score}<span style='font-size:16px;color:{theme.tint(TEXT_DIM)};'>"
                                "/100</span>")
        self._score_lbl.setStyleSheet(
            f"color:{theme.tint(colour)};font-size:34px;font-weight:700;")
        self._verdict_lbl.setText(VERDICT_LABELS.get(result.verdict, result.verdict))
        self._verdict_lbl.setStyleSheet(f"color:{theme.tint(colour)};font-size:15px;font-weight:600;")
        self._quality_lbl.setText(
            f"Calidad para el repaso espaciado: {quality}/5" if quality is not None else "")

        rubric = self._ex.rubric if self._ex else []
        if rubric:
            lines = []
            for i, item in enumerate(rubric):
                hit = i < len(result.rubric) and bool(result.rubric[i])
                mark = (f"<span style='color:{theme.tint(GREEN)};'>✓</span>" if hit
                        else f"<span style='color:{theme.tint(RED)};'>✗</span>")
                lines.append(f"{mark}&nbsp; {_inline(item, self._math_px(13))}")
            self._rubric_lbl.set_html("<br>".join(lines))
        self._rubric_title.setVisible(bool(rubric))
        self._rubric_lbl.setVisible(bool(rubric))

        if result.errors:
            blocks = []
            for e in result.errors:
                head = f"<b>{_esc(e.category)}</b>"
                if e.anchor:
                    head += f" · <i>{_esc(e.anchor)}</i>"
                body = _inline(e.description, self._math_px(13))
                if e.evidence:
                    body += (f"<br><span style='color:{theme.tint(TEXT_DIM)};'>En tu respuesta: "
                             f"«{_esc(e.evidence)}»</span>")
                if e.fix:
                    body += f"<br>Cómo corregirlo: {_inline(e.fix, self._math_px(13))}"
                blocks.append(f"{head}<br>{body}")
            self._errors_lbl.set_html("<br><br>".join(blocks))
        self._errors_title.setVisible(bool(result.errors))
        self._errors_lbl.setVisible(bool(result.errors))

        self._feedback_lbl.set_html(_inline(result.feedback, self._math_px(14)))
        self._feedback_title.setVisible(bool(result.feedback))
        self._feedback_lbl.setVisible(bool(result.feedback))
        self._next_lbl.set_html(_inline(result.next_step, self._math_px(13)))
        self._next_title.setVisible(bool(result.next_step))
        self._next_lbl.setVisible(bool(result.next_step))

        example = (result.example or "").strip("\n")
        body = _esc(example)
        if self._math:
            body = math_render.render_math(body, font_px=13)
        self._example_view.set_html(f"<div style=\"white-space:pre-wrap;\">{body}</div>")
        self._example_title.setVisible(bool(example))
        self._example_view.setVisible(bool(example))

        self._solution_btn.setVisible(bool(self._ex and self._ex.solution.strip()))
        self._result_card.show()
        QTimer.singleShot(0, lambda: self._scroll.ensureWidgetVisible(self._result_card, 0, 40))

    def _toggle_solution(self):
        if self._solution_box.isVisible():
            self._solution_box.hide()
            self._solution_btn.setText("Ver solución modelo")
        else:
            self._solution_box.show()
            self._solution_btn.setText("Ocultar solución")

    def _give_up(self):
        ex = self._ex
        if ex is None:
            return
        if not self._graded:
            answer = QMessageBox.question(
                self, "Ver solución",
                "Ver la solución antes de entregar cuenta como intento con ayuda: el ejercicio "
                "volverá pronto a tu repaso. ¿Continuar?")
            if answer != QMessageBox.Yes:
                return
            self._solution_seen = True
        self._solution_box.show()
        self._solution_btn.setText("Ocultar solución")
        if not self._graded and not self._answer.toPlainText().strip():
            result = GradeResult(
                score=0, verdict="incorrect", rubric=[False] * len(ex.rubric), errors=[],
                feedback="Viste la solución sin entregar una respuesta.",
                next_step="Estudia la solución y vuelve a escribirla de memoria mañana, sin mirarla.",
                example="", raw="")
            self._finish_with(result, "local", "")
        QTimer.singleShot(0, lambda: self._scroll.ensureWidgetVisible(self._solution_box, 0, 40))

    def _new_attempt(self):
        if self._ex is None:
            return
        self._token += 1
        self._graded = False
        self._hints_shown = 0
        self._hints_view.hide()
        self._update_hint_btn()
        self._answer.setReadOnly(False)
        self._answer.clear()
        self._timer.reset()
        self._result_card.hide()
        self._solution_box.hide()
        self._submit_btn.setEnabled(True)
        self._set_status("")
        if self._drill.isVisible():
            self._drill.prepare(self._ex.drill, self._ex.items, self._ex.difficulty)
        self._answer.setFocus()

    # ── Drill ─────────────────────────────────────────────────────────────

    def _on_drill_started(self):
        self._graded = False
        self._result_card.hide()
        self._timer.reset()
        self._timer.start()

    def _on_drill_finished(self, result: GradeResult, transcript: str):
        if self._ex is None:
            return
        self._finish_with(result, "local", transcript)

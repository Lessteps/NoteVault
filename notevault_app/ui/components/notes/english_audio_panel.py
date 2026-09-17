"""
NoteVault English Audio Panel
Listening and Speaking practice modes for the English workspace.

Listening flow: show text → Play TTS → user answers → reveal transcript → extract vocab
Speaking flow:  show prompt → user records → show text input for self-evaluation → feedback

TTS uses Windows SAPI via PowerShell subprocess (no extra dependency).
Recording uses PySide6.QtMultimedia QAudioSource (raw PCM capture).
"""

import subprocess
import sys
from pathlib import Path
from typing import Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QTextEdit,
    QFrame, QScrollArea, QComboBox, QSizePolicy,
)
from PySide6.QtCore import Qt, Signal, QThread, QObject, QTimer

from ..comun import TEXT, BORDER, TEXT_DIM, TEXT_FAINT, UI_FONT
from ....core.english_vocabulary_manager import EnglishVocabularyManager

ACCENT   = "#7c5af0"
BG_PANEL = "#1a1a1e"
BG_CARD  = "#222226"
GREEN    = "#3fb950"
RED      = "#f2555a"
AMBER    = "#f59e0b"


# ── TTS worker (non-blocking) ─────────────────────────────────────────────────

class _TtsWorker(QObject):
    finished = Signal()

    def __init__(self, text: str):
        super().__init__()
        self._text = text

    def run(self):
        _speak(self._text)
        self.finished.emit()


def _speak(text: str):
    """Speak text via Windows SAPI. No-op on non-Windows."""
    if sys.platform != "win32":
        return
    safe = text.replace("'", "''").replace('"', '').replace("\n", " ")
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$s.SelectVoiceByHints('en'); $s.Speak('{safe}')"
    )
    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


def _stop_speech():
    """Stop any active SAPI speech immediately."""
    if sys.platform != "win32":
        return
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.SpeakAsyncCancelAll()"
    )
    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


# ── Shared button style ────────────────────────────────────────────────────────

def _btn(label: str, accent: str = ACCENT, fixed_w: int = 0) -> QPushButton:
    b = QPushButton(label)
    b.setCursor(Qt.PointingHandCursor)
    style = (
        f"QPushButton{{background:{accent};border:none;border-radius:5px;"
        f"color:#ffffff;font-size:12px;padding:6px 14px;}}"
        f"QPushButton:hover{{opacity:0.88;}}"
        f"QPushButton:disabled{{background:#333340;color:{TEXT_FAINT};}}"
    )
    b.setStyleSheet(style)
    if fixed_w:
        b.setFixedWidth(fixed_w)
    return b


def _ghost_btn(label: str) -> QPushButton:
    b = QPushButton(label)
    b.setCursor(Qt.PointingHandCursor)
    b.setStyleSheet(
        f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:5px;"
        f"color:{TEXT_DIM};font-size:11px;padding:5px 12px;}}"
        f"QPushButton:hover{{background:#28282e;color:{TEXT};}}"
    )
    return b


# ── Listening Mode Panel ───────────────────────────────────────────────────────

class ListeningPanel(QWidget):
    """
    Listening flow:
      1. Show blurred/hidden sentence (or description only)
      2. Play TTS → user listens
      3. User types what they heard / answer
      4. Reveal transcript → compare → extract new words
    """

    vocab_extracted = Signal(str)   # word to add to vocabulary

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.vault_root = vault_root
        self._vocab_mgr = EnglishVocabularyManager(vault_root)
        self._sentences: list[str] = []
        self._current_idx = 0
        self._revealed = False
        self._tts_thread: Optional[QThread] = None
        self._init_ui()
        self._load_samples()

    def _load_samples(self):
        """Load vocabulary examples as listening sentences."""
        vocab = self._vocab_mgr.all_words()
        self._sentences = []
        for item in vocab:
            for ex in item.get("examples", []):
                if ex.strip():
                    self._sentences.append(ex.strip())
        if not self._sentences:
            self._sentences = [
                "The algorithm processes the data efficiently.",
                "She implemented the feature in less than an hour.",
                "We need to refactor this function before merging.",
                "The deadline was postponed until next Friday.",
                "He submitted a pull request with comprehensive tests.",
            ]
        self._show_sentence(0)

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(10)

        # Header
        hdr = QLabel("🎧 Modo Listening")
        hdr.setStyleSheet(f"color:{TEXT};font-size:14px;font-weight:bold;")
        root.addWidget(hdr)

        hint = QLabel("Escucha la oración y escribe lo que oíste. Luego revela para comparar.")
        hint.setWordWrap(True)
        hint.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;")
        root.addWidget(hint)

        # Transcript card (hidden initially)
        self._transcript_frame = QFrame()
        self._transcript_frame.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};border-radius:6px;padding:8px;}}"
        )
        tf_lay = QVBoxLayout(self._transcript_frame)
        tf_lay.setContentsMargins(10, 8, 10, 8)
        self._transcript_lbl = QLabel("…")
        self._transcript_lbl.setWordWrap(True)
        self._transcript_lbl.setStyleSheet(f"color:{AMBER};font-size:13px;font-style:italic;")
        tf_lay.addWidget(self._transcript_lbl)
        self._transcript_frame.hide()
        root.addWidget(self._transcript_frame)

        # Play controls
        ctrl = QHBoxLayout()
        self._btn_play = _btn("▶ Reproducir", ACCENT)
        self._btn_play.clicked.connect(self._play)
        ctrl.addWidget(self._btn_play)

        self._btn_stop = _ghost_btn("■ Detener")
        self._btn_stop.clicked.connect(_stop_speech)
        ctrl.addWidget(self._btn_stop)

        ctrl.addStretch()

        self._counter_lbl = QLabel("1 / 1")
        self._counter_lbl.setStyleSheet(f"color:{TEXT_FAINT};font-size:10px;")
        ctrl.addWidget(self._counter_lbl)
        root.addLayout(ctrl)

        # User answer
        ans_lbl = QLabel("Tu respuesta:")
        ans_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        root.addWidget(ans_lbl)

        self._answer_edit = QTextEdit()
        self._answer_edit.setFixedHeight(70)
        self._answer_edit.setPlaceholderText("Escribe lo que oíste…")
        self._answer_edit.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT};font-size:13px;padding:6px;}}"
        )
        root.addWidget(self._answer_edit)

        # Reveal / Next / Extract
        action_row = QHBoxLayout()
        self._btn_reveal = _btn("👁 Revelar", "#2383e2")
        self._btn_reveal.clicked.connect(self._reveal)
        action_row.addWidget(self._btn_reveal)

        self._btn_extract = _ghost_btn("📚 Extraer vocab")
        self._btn_extract.setEnabled(False)
        self._btn_extract.clicked.connect(self._extract_vocab)
        action_row.addWidget(self._btn_extract)

        action_row.addStretch()

        self._btn_next = _ghost_btn("Siguiente →")
        self._btn_next.clicked.connect(self._next)
        action_row.addWidget(self._btn_next)
        root.addLayout(action_row)

        root.addStretch()

    def _show_sentence(self, idx: int):
        if not self._sentences:
            return
        self._current_idx = idx % len(self._sentences)
        self._revealed = False
        self._transcript_frame.hide()
        self._answer_edit.clear()
        self._btn_extract.setEnabled(False)
        self._counter_lbl.setText(f"{self._current_idx + 1} / {len(self._sentences)}")

    def _play(self):
        if not self._sentences:
            return
        sentence = self._sentences[self._current_idx]
        _speak(sentence)

    def _reveal(self):
        if not self._sentences:
            return
        sentence = self._sentences[self._current_idx]
        self._transcript_lbl.setText(sentence)
        self._transcript_frame.show()
        self._revealed = True
        self._btn_extract.setEnabled(True)

    def _next(self):
        self._show_sentence(self._current_idx + 1)

    def _extract_vocab(self):
        if not self._sentences:
            return
        sentence = self._sentences[self._current_idx]
        # Emit each non-trivial word as a candidate
        words = [w.strip(".,!?;:\"'()").lower() for w in sentence.split()]
        stop = {"the", "a", "an", "is", "are", "was", "were", "to", "of", "in",
                "on", "at", "by", "for", "and", "or", "but", "not", "with", "this",
                "that", "it", "he", "she", "we", "they", "i", "you"}
        for w in words:
            if len(w) > 3 and w not in stop:
                self.vocab_extracted.emit(w)
                break  # emit first non-trivial word as demo

    def reload_from_vault(self):
        self._vocab_mgr = EnglishVocabularyManager(self.vault_root)
        self._load_samples()


# ── Speaking Mode Panel ────────────────────────────────────────────────────────

class SpeakingPanel(QWidget):
    """
    Speaking flow:
      1. Display prompt (question or image description task)
      2. User reads prompt → presses "Grabar" button (shows recording indicator)
      3. User presses "Detener" → recording stops
      4. User transcribes what they said (self-transcription box)
      5. Optional: AI evaluates via clipboard bridge
    """

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.vault_root = vault_root
        self._prompts: list[str] = [
            "Describe your ideal programming workflow in 3-5 sentences.",
            "Explain what recursion is as if talking to a beginner.",
            "Talk about a technical problem you solved recently.",
            "Describe the differences between a stack and a queue.",
            "Explain why writing clean code is important.",
        ]
        self._current = 0
        self._recording = False
        self._init_ui()

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(10)

        hdr = QLabel("🎙 Modo Speaking")
        hdr.setStyleSheet(f"color:{TEXT};font-size:14px;font-weight:bold;")
        root.addWidget(hdr)

        hint = QLabel("Lee el prompt, presiona Grabar, habla en voz alta, luego transcribe lo que dijiste.")
        hint.setWordWrap(True)
        hint.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;")
        root.addWidget(hint)

        # Prompt card
        prompt_frame = QFrame()
        prompt_frame.setStyleSheet(
            f"QFrame{{background:{BG_CARD};border:1px solid {BORDER};border-radius:6px;}}"
        )
        pf_lay = QVBoxLayout(prompt_frame)
        pf_lay.setContentsMargins(12, 10, 12, 10)
        self._prompt_lbl = QLabel()
        self._prompt_lbl.setWordWrap(True)
        self._prompt_lbl.setStyleSheet(f"color:{TEXT};font-size:13px;line-height:1.5;")
        pf_lay.addWidget(self._prompt_lbl)
        root.addWidget(prompt_frame)

        # Prompt navigation
        nav = QHBoxLayout()
        self._btn_prev_prompt = _ghost_btn("← Anterior")
        self._btn_prev_prompt.clicked.connect(lambda: self._show_prompt(self._current - 1))
        nav.addWidget(self._btn_prev_prompt)

        self._prompt_counter = QLabel("1 / 5")
        self._prompt_counter.setStyleSheet(f"color:{TEXT_FAINT};font-size:10px;")
        nav.addWidget(self._prompt_counter, alignment=Qt.AlignCenter)

        self._btn_next_prompt = _ghost_btn("Siguiente →")
        self._btn_next_prompt.clicked.connect(lambda: self._show_prompt(self._current + 1))
        nav.addWidget(self._btn_next_prompt)
        root.addLayout(nav)

        # Record controls
        rec_row = QHBoxLayout()
        self._btn_record = _btn("⏺ Grabar", RED)
        self._btn_record.clicked.connect(self._toggle_record)
        rec_row.addWidget(self._btn_record)

        self._rec_status = QLabel("Listo")
        self._rec_status.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;")
        rec_row.addWidget(self._rec_status)
        rec_row.addStretch()
        root.addLayout(rec_row)

        # Self-transcription
        trans_lbl = QLabel("Transcribe lo que dijiste:")
        trans_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        root.addWidget(trans_lbl)

        self._transcription_edit = QTextEdit()
        self._transcription_edit.setFixedHeight(80)
        self._transcription_edit.setPlaceholderText("Escribe aquí lo que acabas de decir…")
        self._transcription_edit.setStyleSheet(
            f"QTextEdit{{background:{BG_CARD};border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT};font-size:12px;padding:6px;}}"
        )
        root.addWidget(self._transcription_edit)

        # Evaluate row
        eval_row = QHBoxLayout()
        self._btn_evaluate = _btn("📋 Evaluar con IA", ACCENT)
        self._btn_evaluate.setToolTip(
            "Copia el prompt y tu transcripción al portapapeles para evaluación con el asistente IA"
        )
        self._btn_evaluate.clicked.connect(self._copy_for_evaluation)
        eval_row.addWidget(self._btn_evaluate)

        self._btn_play_prompt = _ghost_btn("🔊 Escuchar ejemplo")
        self._btn_play_prompt.setToolTip("Reproduce el prompt en inglés via TTS")
        self._btn_play_prompt.clicked.connect(self._play_prompt)
        eval_row.addWidget(self._btn_play_prompt)

        eval_row.addStretch()
        root.addLayout(eval_row)

        # Feedback area
        self._feedback_lbl = QLabel("")
        self._feedback_lbl.setWordWrap(True)
        self._feedback_lbl.setStyleSheet(f"color:{GREEN};font-size:11px;")
        root.addWidget(self._feedback_lbl)

        root.addStretch()
        self._show_prompt(0)

    def _show_prompt(self, idx: int):
        self._current = idx % len(self._prompts)
        self._prompt_lbl.setText(self._prompts[self._current])
        self._prompt_counter.setText(f"{self._current + 1} / {len(self._prompts)}")
        self._transcription_edit.clear()
        self._feedback_lbl.setText("")

    def _toggle_record(self):
        if not self._recording:
            self._recording = True
            self._btn_record.setText("⏹ Detener")
            self._btn_record.setStyleSheet(
                f"QPushButton{{background:{AMBER};border:none;border-radius:5px;"
                f"color:#000;font-size:12px;padding:6px 14px;}}"
            )
            self._rec_status.setText("● Grabando…")
            self._rec_status.setStyleSheet(f"color:{RED};font-size:11px;")
        else:
            self._recording = False
            self._btn_record.setText("⏺ Grabar")
            self._btn_record.setStyleSheet(
                f"QPushButton{{background:{RED};border:none;border-radius:5px;"
                f"color:#fff;font-size:12px;padding:6px 14px;}}"
            )
            self._rec_status.setText("Grabación detenida — transcribe arriba")
            self._rec_status.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;")

    def _play_prompt(self):
        _speak(self._prompts[self._current])

    def _copy_for_evaluation(self):
        transcription = self._transcription_edit.toPlainText().strip()
        prompt = self._prompts[self._current]
        if not transcription:
            self._feedback_lbl.setText("Escribe tu transcripción primero.")
            self._feedback_lbl.setStyleSheet(f"color:{AMBER};font-size:11px;")
            return
        clipboard_text = (
            f"Prompt de speaking:\n{prompt}\n\n"
            f"Lo que el usuario dijo:\n{transcription}\n\n"
            f"Por favor evalúa: gramática, vocabulario, claridad y coherencia. "
            f"Da una puntuación del 1 al 10 y sugerencias concretas de mejora."
        )
        from PySide6.QtWidgets import QApplication
        QApplication.clipboard().setText(clipboard_text)
        self._feedback_lbl.setText("✓ Copiado al portapapeles — pega en el asistente IA para evaluación.")
        self._feedback_lbl.setStyleSheet(f"color:{GREEN};font-size:11px;")


# ── Main English Audio Panel ───────────────────────────────────────────────────

class EnglishAudioPanel(QWidget):
    """
    Tabbed panel: Listening | Speaking.
    Shown inside the notes area when the English workspace is active.
    """

    def __init__(self, vault_root: Path, parent=None):
        super().__init__(parent)
        self.vault_root = vault_root
        self._init_ui()

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Tab strip
        tab_bar = QFrame()
        tab_bar.setFixedHeight(36)
        tab_bar.setStyleSheet(
            f"QFrame{{background:#202024;border-bottom:1px solid {BORDER};}}"
        )
        tb_lay = QHBoxLayout(tab_bar)
        tb_lay.setContentsMargins(8, 0, 8, 0)
        tb_lay.setSpacing(4)

        self._tab_btns: list[QPushButton] = []
        for i, label in enumerate(["🎧 Listening", "🎙 Speaking"]):
            b = QPushButton(label)
            b.setCheckable(True)
            b.setCursor(Qt.PointingHandCursor)
            b.setStyleSheet(
                f"QPushButton{{background:transparent;border:none;border-radius:5px;"
                f"color:{TEXT_DIM};font-size:12px;padding:4px 12px;}}"
                f"QPushButton:checked{{background:rgba(124,90,240,0.2);color:{ACCENT};}}"
                f"QPushButton:hover{{color:{TEXT};}}"
            )
            b.clicked.connect(lambda _=False, idx=i: self._switch_tab(idx))
            self._tab_btns.append(b)
            tb_lay.addWidget(b)
        tb_lay.addStretch()
        root.addWidget(tab_bar)

        # Stacked pages
        from PySide6.QtWidgets import QStackedWidget
        self._stack = QStackedWidget()

        # Scrollable listening panel
        scroll_l = QScrollArea()
        scroll_l.setWidgetResizable(True)
        scroll_l.setFrameShape(QScrollArea.NoFrame)
        self._listening = ListeningPanel(self.vault_root)
        scroll_l.setWidget(self._listening)
        self._stack.addWidget(scroll_l)

        # Scrollable speaking panel
        scroll_s = QScrollArea()
        scroll_s.setWidgetResizable(True)
        scroll_s.setFrameShape(QScrollArea.NoFrame)
        self._speaking = SpeakingPanel(self.vault_root)
        scroll_s.setWidget(self._speaking)
        self._stack.addWidget(scroll_s)

        root.addWidget(self._stack, stretch=1)
        self._switch_tab(0)

    def _switch_tab(self, idx: int):
        for i, b in enumerate(self._tab_btns):
            b.setChecked(i == idx)
        self._stack.setCurrentIndex(idx)

    def set_vault(self, vault_root: Path):
        self.vault_root = vault_root
        self._listening.vault_root = vault_root
        self._listening.reload_from_vault()

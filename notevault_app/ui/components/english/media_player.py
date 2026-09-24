"""English media player: the learner's own films and audio with dual subtitles,
a clickable sentence list, repeat / A-B loop, shadowing and sentence mining.

The app never searches for or downloads content; it only opens local files.
"""

import html
from pathlib import Path

from PySide6.QtCore import QRect, QSize, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QColor, QFont, QFontMetrics, QKeySequence, QPainter, QShortcut
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtWidgets import (
    QAbstractItemView, QButtonGroup, QCheckBox, QComboBox, QDialog, QFileDialog, QFrame,
    QHBoxLayout, QLabel, QLineEdit, QListView, QListWidget, QListWidgetItem, QPushButton,
    QRadioButton, QSizePolicy, QSlider, QSplitter, QStackedWidget, QStyle, QStyledItemDelegate, QVBoxLayout, QWidget,
)

from ... import theme
from ....core.english.media_links import format_timestamp, vault_relative
from ....core.english.mining import CEFR_LEVELS, MiningError, write_mined_note
from ....core.english.subtitles import (
    SentencePair, cue_at, cue_before, find_sibling_subtitles, load_subtitles, pair_tracks,
)
from .recorder import VoiceRecorder

BG_PAGE = "#1a1a1e"
BG_BAR = "#202024"
BG_CARD = "#222226"
BG_VIDEO = "#0e0e10"
BORDER = "#33333e"
TEXT = "#dcdde0"
TEXT_DIM = "#888895"
TEXT_FAINT = "#666672"
ACCENT = "#7c5af0"
GREEN = "#3fb950"
AMBER = "#e0a13a"
RED = "#f2555a"
SUB_ES = "#e8c46a"

SPEEDS = (0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5)
SEEK_STEP_MS = 5000
TICK_MS = 30
SUB_FILTER = "Subtítulos (*.srt *.vtt);;Todos los archivos (*)"
MEDIA_FILTER = ("Video o audio (*.mp4 *.mkv *.webm *.mov *.m4v *.avi *.mpg *.mpeg *.wmv "
                "*.mp3 *.wav *.ogg *.m4a *.flac *.aac *.opus *.wma);;Todos los archivos (*)")

SHORTCUTS = (
    ("Space", "toggle_play"), ("A", "previous_sentence"), ("D", "next_sentence"),
    ("S", "repeat_sentence"), ("Left", "seek_back"), ("Right", "seek_forward"),
    ("L", "toggle_ab_loop"), ("[", "slower"), ("]", "faster"), ("E", "toggle_en"),
    ("T", "toggle_es"), ("H", "toggle_shadowing"), ("R", "toggle_record"),
    ("O", "play_original"), ("V", "play_voice"), ("Return", "shadow_continue"),
    ("Enter", "shadow_continue"), ("M", "mine_current"),
)
SHORTCUT_HINT = ("Espacio reproducir · A/D frase anterior/siguiente · S repetir · ←/→ 5 s · "
                 "L bucle A-B · [ ] velocidad · E/T subtítulos · H sombra · R grabar · "
                 "O original · V mi voz · Enter continuar · M minar")


def _c(color: str) -> str:
    return theme.tint(color)


def _button(text: str, tip: str = "", primary: bool = False, checkable: bool = False) -> QPushButton:
    b = QPushButton(text)
    b.setToolTip(tip)
    b.setCursor(Qt.PointingHandCursor)
    b.setFocusPolicy(Qt.NoFocus)
    b.setCheckable(checkable)
    if primary:
        b.setStyleSheet(
            f"QPushButton{{background:{ACCENT};border:none;border-radius:5px;color:#ffffff;"
            "font-size:12px;padding:6px 12px;min-width:0px;}"
            "QPushButton:hover{background:#8d6ff5;}"
            f"QPushButton:disabled{{background:#333340;color:{TEXT_FAINT};}}")
    else:
        b.setStyleSheet(
            f"QPushButton{{background:#28282e;border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT};font-size:12px;padding:5px 10px;min-width:0px;}}"
            f"QPushButton:hover{{background:#303038;border-color:#4a4a58;}}"
            f"QPushButton:checked{{background:rgba(124,90,240,0.28);border-color:{ACCENT};color:#ffffff;}}"
            f"QPushButton:disabled{{color:#55555f;border-color:#2a2a32;}}")
    return b


class _SentenceDelegate(QStyledItemDelegate):
    """Paints a sentence row: time, English line and the Spanish line under it."""

    PAD_X, PAD_Y, TIME_W, GAP = 10, 7, 52, 3

    def __init__(self, view: QListWidget):
        super().__init__(view)
        self.view = view
        self.current = -1
        self.show_es = True
        self.en_font = QFont(view.font())
        self.en_font.setPixelSize(13)
        self.es_font = QFont(view.font())
        self.es_font.setPixelSize(12)
        self.es_font.setItalic(True)
        self.time_font = QFont(view.font())
        self.time_font.setPixelSize(11)

    def _text_width(self) -> int:
        return max(80, self.view.viewport().width() - self.TIME_W - 2 * self.PAD_X)

    def _heights(self, pair: SentencePair, width: int) -> tuple[int, int]:
        en_h = QFontMetrics(self.en_font).boundingRect(
            QRect(0, 0, width, 10000), Qt.TextWordWrap, pair.en or " ").height() if pair.en else 0
        es_h = 0
        if pair.es and (self.show_es or not pair.en):
            es_h = QFontMetrics(self.es_font).boundingRect(
                QRect(0, 0, width, 10000), Qt.TextWordWrap, pair.es).height()
        return en_h, es_h

    def sizeHint(self, option, index):
        pair = index.data(Qt.UserRole)
        width = self._text_width()
        en_h, es_h = self._heights(pair, width)
        gap = self.GAP if en_h and es_h else 0
        return QSize(width, max(22, en_h + es_h + gap) + 2 * self.PAD_Y)

    def paint(self, painter: QPainter, option, index):
        pair = index.data(Qt.UserRole)
        rect = option.rect
        painter.save()
        painter.setRenderHint(QPainter.Antialiasing)
        is_current = index.row() == self.current
        if is_current:
            painter.setPen(Qt.NoPen)
            painter.setBrush(QColor(124, 90, 240, 60))
            painter.drawRoundedRect(rect.adjusted(3, 1, -3, -1), 5, 5)
            painter.setBrush(QColor(_c(ACCENT)))
            painter.drawRoundedRect(QRect(rect.left() + 3, rect.top() + 4, 3, rect.height() - 8), 1, 1)
        elif option.state & QStyle.StateFlag.State_MouseOver:
            painter.setPen(Qt.NoPen)
            painter.setBrush(QColor(255, 255, 255, 12))
            painter.drawRoundedRect(rect.adjusted(3, 1, -3, -1), 5, 5)

        width = self._text_width()
        en_h, es_h = self._heights(pair, width)
        x = rect.left() + self.PAD_X
        y = rect.top() + self.PAD_Y
        painter.setFont(self.time_font)
        painter.setPen(QColor(_c(ACCENT if is_current else TEXT_FAINT)))
        painter.drawText(QRect(x, y + 1, self.TIME_W, 16), Qt.AlignLeft | Qt.AlignTop,
                         format_timestamp(pair.start / 1000))
        tx = x + self.TIME_W
        if en_h:
            painter.setFont(self.en_font)
            painter.setPen(QColor(_c("#ffffff" if is_current else TEXT)))
            painter.drawText(QRect(tx, y, width, en_h), Qt.TextWordWrap, pair.en)
            y += en_h + self.GAP
        if es_h:
            painter.setFont(self.es_font)
            painter.setPen(QColor(_c(SUB_ES if is_current else TEXT_DIM)))
            painter.drawText(QRect(tx, y, width, es_h), Qt.TextWordWrap, pair.es)
        painter.restore()


class MineDialog(QDialog):
    """Turns the current line into a practice note (translate or cloze)."""

    created = Signal(Path)

    def __init__(self, parent, *, vault_root: Path, media: Path, pair: SentencePair):
        super().__init__(parent)
        self.setWindowTitle("Minar frase")
        self.setModal(False)
        self.setMinimumWidth(520)
        self.vault_root, self.media, self.pair = vault_root, media, pair
        self.setStyleSheet(
            f"QDialog{{background:{BG_PAGE};}} QLabel{{color:{TEXT};font-size:12px;background:transparent;}}"
            f"QLineEdit{{background:#1c1c20;border:1px solid {BORDER};border-radius:5px;color:{TEXT};"
            "font-size:13px;padding:6px 8px;font-family:'Segoe UI';}"
            f"QLineEdit:disabled{{color:{TEXT_FAINT};}}"
            f"QRadioButton{{color:{TEXT};font-size:12px;spacing:6px;}}"
            f"QComboBox{{background:#28282e;border:1px solid {BORDER};border-radius:5px;color:{TEXT};"
            "padding:3px 8px;min-width:60px;}")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(18, 16, 18, 16)
        lay.setSpacing(10)

        head = QLabel(f"Frase en {format_timestamp(pair.start / 1000)} de «{media.name}»")
        head.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;")
        lay.addWidget(head)
        self.sentence = QLineEdit(pair.en or pair.es)
        lay.addWidget(self.sentence)
        if pair.es and pair.en:
            ref = QLabel(f"ES: {pair.es}")
            ref.setWordWrap(True)
            ref.setStyleSheet(f"color:{SUB_ES};font-size:12px;font-style:italic;")
            lay.addWidget(ref)

        mode_row = QHBoxLayout()
        mode_row.addWidget(QLabel("Tipo de práctica:"))
        self.translate_rb = QRadioButton("Traducir al español")
        self.cloze_rb = QRadioButton("Completar hueco")
        self.translate_rb.setChecked(True)
        group = QButtonGroup(self)
        group.addButton(self.translate_rb)
        group.addButton(self.cloze_rb)
        mode_row.addWidget(self.translate_rb)
        mode_row.addWidget(self.cloze_rb)
        mode_row.addStretch()
        lay.addLayout(mode_row)

        self.target = QLineEdit()
        self.target.setPlaceholderText("Palabra o expresión a ocultar (solo para «Completar hueco»)")
        self.target.setEnabled(False)
        self.cloze_rb.toggled.connect(self.target.setEnabled)
        lay.addWidget(self.target)

        level_row = QHBoxLayout()
        level_row.addWidget(QLabel("Nivel CEFR:"))
        self.level = QComboBox()
        self.level.addItems(CEFR_LEVELS)
        self.level.setCurrentText("B1")
        level_row.addWidget(self.level)
        level_row.addStretch()
        lay.addLayout(level_row)

        self.error = QLabel("")
        self.error.setStyleSheet(f"color:{RED};font-size:11px;")
        self.error.setWordWrap(True)
        lay.addWidget(self.error)

        buttons = QHBoxLayout()
        buttons.addStretch()
        self.cancel_btn = _button("Cancelar")
        self.cancel_btn.clicked.connect(self.reject)
        self.create_btn = _button("Crear nota de práctica", primary=True)
        self.create_btn.clicked.connect(self._create)
        buttons.addWidget(self.cancel_btn)
        buttons.addWidget(self.create_btn)
        lay.addLayout(buttons)

    def _create(self):
        try:
            path = write_mined_note(
                self.vault_root, self.sentence.text(),
                media_rel=vault_relative(self.media, self.vault_root),
                seconds=self.pair.start / 1000,
                mode="cloze" if self.cloze_rb.isChecked() else "translate",
                target=self.target.text(), level=self.level.currentText(),
                reference_es=self.pair.es if self.pair.en else "",
            )
        except (MiningError, OSError) as e:
            self.error.setText(str(e))
            return
        self.created.emit(path)
        self.accept()


class MediaPlayerWindow(QWidget):
    """Top-level player window. One instance is shared (see `open_media_player`)."""

    note_created = Signal(Path)

    def __init__(self, vault_root: Path | None = None, parent=None):
        super().__init__(parent, Qt.Window)
        self.setWindowTitle("Reproductor de inglés")
        self.setObjectName("englishMediaPlayer")
        self.resize(1280, 780)
        self.vault_root = Path(vault_root) if vault_root else None
        self.open_note = None
        self.media_path: Path | None = None
        self.en_cues, self.es_cues = [], []
        self.en_path = self.es_path = None
        self.pairs: list[SentencePair] = []
        self._current = -1
        self._pending_seek = None
        self._stop_at = None
        self._after_stop = None
        self._loop_a = self._loop_b = None
        self._shadow_target = None
        self._shadow_done = -1
        self._shadow_turn = -1
        self._mine_dialog = None
        self._autoplay = False
        self._seek_target = None

        self.player = QMediaPlayer(self)
        self.audio = QAudioOutput(self)
        self.player.setAudioOutput(self.audio)
        self.voice_player = QMediaPlayer(self)
        self.voice_audio = QAudioOutput(self)
        self.voice_player.setAudioOutput(self.voice_audio)
        self.recorder = VoiceRecorder(self)

        self._build()
        self.player.setVideoOutput(self.video)
        self.player.durationChanged.connect(self._on_duration)
        self.player.positionChanged.connect(self._on_position)
        self.player.playbackStateChanged.connect(self._on_state)
        self.player.mediaStatusChanged.connect(self._on_media_status)
        self.player.hasVideoChanged.connect(self._on_has_video)
        self.player.errorOccurred.connect(lambda _e, msg: self._set_status(f"Error: {msg}", RED))
        self.recorder.recording_changed.connect(self._on_recording)
        self.recorder.saved.connect(self._on_voice_saved)
        self.recorder.failed.connect(lambda msg: self._set_shadow_status(msg, RED))

        self._tick = QTimer(self)
        self._tick.setInterval(TICK_MS)
        self._tick.timeout.connect(self._on_tick)
        self._hint_timer = QTimer(self)
        self._hint_timer.setSingleShot(True)
        self._hint_timer.setInterval(8000)
        self._hint_timer.timeout.connect(self._restore_hint)

        for key, name in SHORTCUTS:
            sc = QShortcut(QKeySequence(key), self)
            sc.setContext(Qt.WindowShortcut)
            sc.activated.connect(getattr(self, name))
        self._refresh_controls()

    # ── Build ─────────────────────────────────────────────────────────────

    def _build(self):
        self.setStyleSheet(f"QWidget#englishMediaPlayer{{background:{BG_PAGE};}}")
        self.setAttribute(Qt.WA_StyledBackground, True)
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        root.addWidget(self._build_top_bar())

        split = QSplitter(Qt.Horizontal)
        split.setHandleWidth(1)
        split.setStyleSheet(f"QSplitter::handle{{background:{BORDER};}}")
        split.addWidget(self._build_stage())
        split.addWidget(self._build_sentence_panel())
        split.setStretchFactor(0, 3)
        split.setStretchFactor(1, 1)
        split.setSizes([900, 380])
        root.addWidget(split, stretch=1)

        self.status = QLabel(SHORTCUT_HINT)
        self.status.setFixedHeight(24)
        self.status.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:{BG_BAR};"
            f"border-top:1px solid {BORDER};padding:0 12px;")
        root.addWidget(self.status)

    def _build_top_bar(self) -> QWidget:
        bar = QFrame()
        bar.setFixedHeight(46)
        bar.setStyleSheet(f".QFrame{{background:{BG_BAR};border-bottom:1px solid {BORDER};}}")
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(12, 0, 12, 0)
        lay.setSpacing(8)
        self.open_btn = _button("📂 Abrir video o audio…", "Abre un archivo de tu equipo")
        self.open_btn.clicked.connect(self.choose_media)
        lay.addWidget(self.open_btn)
        self.load_en_btn = _button("Subtítulos EN…", "Carga un .srt o .vtt en inglés")
        self.load_en_btn.clicked.connect(lambda: self.choose_subtitles("en"))
        lay.addWidget(self.load_en_btn)
        self.load_es_btn = _button("Subtítulos ES…", "Carga un .srt o .vtt en español")
        self.load_es_btn.clicked.connect(lambda: self.choose_subtitles("es"))
        lay.addWidget(self.load_es_btn)
        self.file_label = QLabel("Ningún archivo abierto")
        self.file_label.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;border:none;padding-left:8px;background:transparent;")
        self.file_label.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        lay.addWidget(self.file_label, stretch=1)
        self.en_toggle = _button("EN", "Mostrar u ocultar subtítulos en inglés (E)", checkable=True)
        self.es_toggle = _button("ES", "Mostrar u ocultar subtítulos en español (T)", checkable=True)
        for b in (self.en_toggle, self.es_toggle):
            b.setChecked(True)
            b.setFixedWidth(44)
            b.toggled.connect(self._refresh_subtitles)
            lay.addWidget(b)
        return bar

    def _build_stage(self) -> QWidget:
        stage = QWidget()
        stage.setStyleSheet(f"background:{BG_PAGE};")
        lay = QVBoxLayout(stage)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        self.display = QStackedWidget()
        self.display.setStyleSheet(f"background:{BG_VIDEO};")
        self.empty_label = QLabel(
            "Abre un video o un audio de tu equipo.\n\n"
            "Si junto al archivo hay subtítulos con el mismo nombre\n"
            "(película.en.srt, película.es.srt, película.srt o .vtt) se cargan solos.")
        self.empty_label.setAlignment(Qt.AlignCenter)
        self.empty_label.setStyleSheet(f"color:{TEXT_DIM};font-size:14px;background:{BG_VIDEO};")
        self.display.addWidget(self.empty_label)
        self.video = QVideoWidget()
        self.video.setStyleSheet("background:#000000;")
        self.display.addWidget(self.video)
        self.audio_label = QLabel("♪")
        self.audio_label.setAlignment(Qt.AlignCenter)
        self.audio_label.setTextFormat(Qt.RichText)
        self.audio_label.setStyleSheet(f"background:{BG_VIDEO};")
        self.display.addWidget(self.audio_label)
        lay.addWidget(self.display, stretch=1)

        subs = QFrame()
        subs.setStyleSheet(f"QFrame{{background:{BG_VIDEO};border:none;}}")
        subs.setMinimumHeight(96)
        sl = QVBoxLayout(subs)
        sl.setContentsMargins(24, 10, 24, 12)
        sl.setSpacing(4)
        sl.addStretch()
        self.sub_en = QLabel("")
        self.sub_en.setAlignment(Qt.AlignCenter)
        self.sub_en.setWordWrap(True)
        self.sub_en.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.sub_en.setStyleSheet("color:#ffffff;font-size:21px;font-weight:600;background:transparent;")
        self.sub_es = QLabel("")
        self.sub_es.setAlignment(Qt.AlignCenter)
        self.sub_es.setWordWrap(True)
        self.sub_es.setStyleSheet(f"color:{SUB_ES};font-size:16px;font-style:italic;background:transparent;")
        sl.addWidget(self.sub_en)
        sl.addWidget(self.sub_es)
        lay.addWidget(subs)

        seek = QWidget()
        seek.setStyleSheet(f"background:{BG_BAR};")
        sk = QHBoxLayout(seek)
        sk.setContentsMargins(14, 8, 14, 2)
        sk.setSpacing(10)
        self.time_label = QLabel("00:00")
        self.dur_label = QLabel("00:00")
        for lbl in (self.time_label, self.dur_label):
            lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;font-family:{theme.CODE_FONT_FAMILY};")
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setFocusPolicy(Qt.NoFocus)
        self.slider.setRange(0, 0)
        self.slider.setStyleSheet(
            f"QSlider::groove:horizontal{{height:4px;background:#33333e;border-radius:2px;}}"
            f"QSlider::sub-page:horizontal{{background:{ACCENT};border-radius:2px;}}"
            "QSlider::handle:horizontal{width:12px;height:12px;margin:-4px 0;border-radius:6px;"
            "background:#ffffff;}")
        self.slider.sliderMoved.connect(self._on_slider_moved)
        self.slider.sliderReleased.connect(lambda: self.seek_ms(self.slider.value()))
        sk.addWidget(self.time_label)
        sk.addWidget(self.slider, stretch=1)
        sk.addWidget(self.dur_label)
        lay.addWidget(seek)

        controls = QWidget()
        controls.setStyleSheet(f"background:{BG_BAR};")
        cl = QHBoxLayout(controls)
        cl.setContentsMargins(14, 6, 14, 10)
        cl.setSpacing(6)
        self.prev_btn = _button("⏮ Anterior", "Frase anterior (A)")
        self.prev_btn.clicked.connect(self.previous_sentence)
        self.play_btn = _button("▶ Reproducir", "Reproducir / pausar (Espacio)", primary=True)
        self.play_btn.setFixedWidth(118)
        self.play_btn.clicked.connect(self.toggle_play)
        self.next_btn = _button("Siguiente ⏭", "Frase siguiente (D)")
        self.next_btn.clicked.connect(self.next_sentence)
        self.repeat_btn = _button("↻ Repetir frase", "Repetir la frase actual (S)")
        self.repeat_btn.clicked.connect(self.repeat_sentence)
        self.ab_btn = _button("A-B", "Bucle A-B: 1.º clic marca A, 2.º marca B, 3.º lo quita (L)",
                              checkable=True)
        self.ab_btn.setFixedWidth(64)
        self.ab_btn.clicked.connect(self.toggle_ab_loop)
        for b in (self.prev_btn, self.play_btn, self.next_btn, self.repeat_btn, self.ab_btn):
            cl.addWidget(b)
        speed_lbl = QLabel("Velocidad")
        speed_lbl.setStyleSheet(f"color:{TEXT_DIM};font-size:11px;padding-left:8px;")
        cl.addWidget(speed_lbl)
        self.speed = QComboBox()
        self.speed.setFocusPolicy(Qt.NoFocus)
        self.speed.setToolTip("Velocidad de reproducción ([ y ])")
        for s in SPEEDS:
            self.speed.addItem(f"{s:g}×", s)
        self.speed.setCurrentIndex(SPEEDS.index(1.0))
        self.speed.setStyleSheet(
            f"QComboBox{{background:#28282e;border:1px solid {BORDER};border-radius:5px;"
            f"color:{TEXT};font-size:12px;padding:4px 8px;min-width:58px;}}"
            "QComboBox::drop-down{border:none;width:18px;background:transparent;}")
        self.speed.currentIndexChanged.connect(self._on_speed)
        cl.addWidget(self.speed)
        cl.addStretch()
        self.shadow_btn = _button("🗣 Modo sombra", "Pausa tras cada frase para que la repitas (H)",
                                  checkable=True)
        self.shadow_btn.toggled.connect(self._on_shadow_toggled)
        cl.addWidget(self.shadow_btn)
        self.mine_btn = _button("⛏ Minar frase", "Crear una nota de práctica con la frase actual (M)")
        self.mine_btn.clicked.connect(self.mine_current)
        cl.addWidget(self.mine_btn)
        lay.addWidget(controls)

        lay.addWidget(self._build_shadow_panel())
        return stage

    def _build_shadow_panel(self) -> QWidget:
        self.shadow_panel = QFrame()
        self.shadow_panel.setStyleSheet(
            f".QFrame{{background:{BG_CARD};border-top:1px solid {BORDER};}}")
        lay = QHBoxLayout(self.shadow_panel)
        lay.setContentsMargins(14, 8, 14, 8)
        lay.setSpacing(6)
        self.shadow_status = QLabel("Modo sombra: reproduce y la pausa llegará al final de cada frase.")
        self.shadow_status.setStyleSheet(f"color:{TEXT};font-size:12px;border:none;background:transparent;")
        self.shadow_status.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        lay.addWidget(self.shadow_status, stretch=1)
        self.auto_record = QCheckBox("Grabar al pausar")
        self.auto_record.setChecked(True)
        self.auto_record.setFocusPolicy(Qt.NoFocus)
        self.auto_record.setStyleSheet(f"QCheckBox{{color:{TEXT_DIM};font-size:11px;border:none;}}")
        lay.addWidget(self.auto_record)
        self.record_btn = _button("⏺ Grabar", "Grabar tu voz (R)")
        self.record_btn.clicked.connect(self.toggle_record)
        self.original_btn = _button("▶ Original", "Escuchar otra vez el fragmento original (O)")
        self.original_btn.clicked.connect(self.play_original)
        self.voice_btn = _button("▶ Mi voz", "Escuchar tu grabación (V)")
        self.voice_btn.clicked.connect(self.play_voice)
        self.continue_btn = _button("Continuar ⏎", "Seguir con la siguiente frase (Enter)", primary=True)
        self.continue_btn.clicked.connect(self.shadow_continue)
        for b in (self.record_btn, self.original_btn, self.voice_btn, self.continue_btn):
            lay.addWidget(b)
        self.shadow_panel.hide()
        return self.shadow_panel

    def _build_sentence_panel(self) -> QWidget:
        panel = QWidget()
        panel.setStyleSheet(f"background:{BG_PAGE};")
        lay = QVBoxLayout(panel)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        head = QFrame()
        head.setFixedHeight(36)
        head.setStyleSheet(f".QFrame{{background:{BG_BAR};border-bottom:1px solid {BORDER};}}")
        hl = QHBoxLayout(head)
        hl.setContentsMargins(12, 0, 12, 0)
        title = QLabel("Frases")
        title.setStyleSheet(f"color:{TEXT};font-size:12px;font-weight:600;border:none;background:transparent;")
        hl.addWidget(title)
        self.count_label = QLabel("")
        self.count_label.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;border:none;background:transparent;")
        hl.addWidget(self.count_label)
        hl.addStretch()
        lay.addWidget(head)

        self.sentences = QListWidget()
        self.sentences.setFocusPolicy(Qt.NoFocus)
        self.sentences.setMouseTracking(True)
        self.sentences.setResizeMode(QListView.Adjust)
        self.sentences.setVerticalScrollMode(QListView.ScrollPerPixel)
        self.sentences.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection)
        self.sentences.setStyleSheet(
            f"QListWidget{{background:{BG_PAGE};border:none;outline:none;padding:4px 0;}}")
        self.delegate = _SentenceDelegate(self.sentences)
        self.sentences.setItemDelegate(self.delegate)
        self.sentences.itemClicked.connect(self._on_sentence_clicked)
        lay.addWidget(self.sentences, stretch=1)

        self.no_subs = QLabel("Sin subtítulos.\nCarga un .srt o .vtt para ver las frases.")
        self.no_subs.setAlignment(Qt.AlignCenter)
        self.no_subs.setStyleSheet(f"color:{TEXT_FAINT};font-size:12px;padding:20px;")
        lay.addWidget(self.no_subs)
        return panel

    # ── Public API ────────────────────────────────────────────────────────

    def set_vault(self, vault_root: Path | None):
        self.vault_root = Path(vault_root) if vault_root else None
        self._refresh_controls()

    def open_media(self, path, seconds: float | None = None, autoplay: bool = True) -> bool:
        path = Path(path)
        if not path.is_file():
            self._set_status(f"No se encontró el archivo: {path}", RED)
            return False
        if self.media_path is not None and path.resolve() == self.media_path.resolve():
            if seconds is not None:
                self.seek_ms(int(seconds * 1000))
            if autoplay:
                self.player.play()
            return True
        self._stop_segment()
        self._clear_loop()
        self.recorder.stop()
        self.media_path = path
        self.en_cues, self.es_cues, self.en_path, self.es_path = [], [], None, None
        en, es = find_sibling_subtitles(path)
        if en:
            self.load_subtitles(en, "en", rebuild=False)
        if es:
            self.load_subtitles(es, "es", rebuild=False)
        self._rebuild_sentences()
        self.setWindowTitle(f"{path.name} — Reproductor de inglés")
        self.file_label.setText(path.name)
        self.file_label.setToolTip(str(path))
        self.display.setCurrentWidget(self.audio_label)
        self.audio_label.setText(
            f"<p align='center' style='font-size:64px;color:{_c(ACCENT)}'>♪</p>"
            f"<p align='center' style='font-size:15px;color:{_c(TEXT_DIM)}'>{html.escape(path.name)}</p>")
        self._pending_seek = int(seconds * 1000) if seconds else None
        self._seek_target = None
        self._autoplay = autoplay
        self.player.setSource(QUrl.fromLocalFile(str(path)))
        self._refresh_controls()
        loaded = [p.name for p in (self.en_path, self.es_path) if p]
        self._set_status("Subtítulos cargados: " + ", ".join(loaded) if loaded
                         else "Sin subtítulos junto al archivo: cárgalos con «Subtítulos EN…».")
        return True

    def load_subtitles(self, path, track: str = "en", rebuild: bool = True) -> int:
        path = Path(path)
        try:
            cues = load_subtitles(path)
        except OSError as e:
            self._set_status(f"No se pudo leer {path.name}: {e}", RED)
            return 0
        if track == "es":
            self.es_cues, self.es_path = cues, path
        else:
            self.en_cues, self.en_path = cues, path
        if rebuild:
            self._rebuild_sentences()
            self._set_status(f"{path.name}: {len(cues)} líneas.")
        return len(cues)

    def seek_seconds(self, seconds: float):
        self.seek_ms(int(seconds * 1000))

    def seek_ms(self, ms: int):
        ms = max(0, int(ms))
        status = self.player.mediaStatus()
        if status in (QMediaPlayer.MediaStatus.NoMedia, QMediaPlayer.MediaStatus.LoadingMedia):
            self._pending_seek = ms
        else:
            self._seek_target = ms
            self.player.setPosition(ms)
        self._reset_shadow(ms)
        self._show_position(ms)

    def _reset_shadow(self, ms: int):
        """The next line to pause after is the one playing at `ms`, else the next one."""
        self._shadow_target = None
        if not self.pairs:
            self._shadow_done = -1
            return
        i = cue_at(self.pairs, ms)
        self._shadow_done = i - 1 if i >= 0 else cue_before(self.pairs, ms)

    def position(self) -> int:
        if self._pending_seek is not None:
            return self._pending_seek
        if self._seek_target is not None:
            return self._seek_target
        return self.player.position()

    def _on_position(self, pos: int):
        if self._seek_target is not None and abs(pos - self._seek_target) < 400:
            self._seek_target = None

    def is_playing(self) -> bool:
        return self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState

    # ── Actions (buttons and shortcuts) ───────────────────────────────────

    def choose_media(self):
        start = str(self.media_path.parent if self.media_path else (self.vault_root or Path.home()))
        path, _ = QFileDialog.getOpenFileName(self, "Abrir video o audio", start, MEDIA_FILTER)
        if path:
            self.open_media(Path(path))

    def choose_subtitles(self, track: str):
        start = str(self.media_path.parent if self.media_path else (self.vault_root or Path.home()))
        title = "Subtítulos en inglés" if track == "en" else "Subtítulos en español"
        path, _ = QFileDialog.getOpenFileName(self, title, start, SUB_FILTER)
        if path:
            self.load_subtitles(Path(path), track)

    def toggle_play(self):
        if self._shadow_turn >= 0:
            self.shadow_continue()
            return
        if self.media_path is None:
            self.choose_media()
            return
        if self.is_playing():
            self.player.pause()
        else:
            self._stop_segment()
            self.player.play()

    def previous_sentence(self):
        if not self.pairs:
            self.seek_back()
            return
        pos = self.position()
        i = cue_before(self.pairs, pos)
        if i < 0:
            target = 0
        elif pos - self.pairs[i].start < 1500:
            target = max(0, i - 1)
        else:
            target = i
        self._go_to_sentence(target)

    def next_sentence(self):
        if not self.pairs:
            self.seek_forward()
            return
        target = min(len(self.pairs) - 1, cue_before(self.pairs, self.position()) + 1)
        self._go_to_sentence(target)

    def repeat_sentence(self):
        i = self._current_index()
        if i < 0:
            return
        self._end_turn()
        then = self._enter_turn if self.shadow_btn.isChecked() else None
        self._play_segment(i, then)

    def seek_back(self):
        self.seek_ms(self.position() - SEEK_STEP_MS)

    def seek_forward(self):
        self.seek_ms(self.position() + SEEK_STEP_MS)

    def toggle_ab_loop(self):
        pos = self.position()
        if self._loop_a is None:
            self._loop_a = pos
            self._set_status(f"Bucle: A = {format_timestamp(pos / 1000)}. Pulsa otra vez para marcar B.")
        elif self._loop_b is None:
            if pos <= self._loop_a + 200:
                self._set_status("B tiene que ir después de A.", AMBER)
            else:
                self._loop_b = pos
                self.seek_ms(self._loop_a)
                self.player.play()
                self._set_status(f"Bucle A-B: {format_timestamp(self._loop_a / 1000)} → "
                                 f"{format_timestamp(pos / 1000)}. Pulsa otra vez para quitarlo.")
        else:
            self._clear_loop()
            self._set_status("Bucle quitado.")
        self._refresh_ab()

    def slower(self):
        self.speed.setCurrentIndex(max(0, self.speed.currentIndex() - 1))

    def faster(self):
        self.speed.setCurrentIndex(min(len(SPEEDS) - 1, self.speed.currentIndex() + 1))

    def toggle_en(self):
        self.en_toggle.toggle()

    def toggle_es(self):
        self.es_toggle.toggle()

    def toggle_shadowing(self):
        self.shadow_btn.toggle()

    def toggle_record(self):
        if self.recorder.is_recording():
            self.recorder.stop()
        else:
            self.voice_player.stop()
            if self.is_playing():
                self.player.pause()
            self.recorder.start()

    def play_original(self):
        i = self._shadow_turn if self._shadow_turn >= 0 else self._current_index()
        if i < 0:
            return
        self.recorder.stop()
        self.voice_player.stop()
        then = self._enter_turn if self._shadow_turn >= 0 else None
        self._play_segment(i, then, keep_turn=True)

    def play_voice(self):
        if not self.recorder.last_path:
            self._set_shadow_status("Todavía no hay grabación: pulsa «Grabar» (R).", AMBER)
            return
        self.recorder.stop()
        if self.is_playing():
            self.player.pause()
        self.voice_player.setSource(QUrl())
        self.voice_player.setSource(QUrl.fromLocalFile(self.recorder.last_path))
        self.voice_player.play()

    def shadow_continue(self):
        if self._shadow_turn < 0:
            return
        self.recorder.stop()
        self.voice_player.stop()
        self._end_turn()
        self._stop_segment()
        self.player.play()

    def mine_current(self):
        i = self._current_index()
        if i < 0 or self.vault_root is None or self.media_path is None:
            self._set_status("Abre un video con subtítulos dentro de una vault para minar frases.", AMBER)
            return
        if self.is_playing():
            self.player.pause()
        self._mine_dialog = MineDialog(self, vault_root=self.vault_root, media=self.media_path,
                                       pair=self.pairs[i])
        self._mine_dialog.created.connect(self._on_note_mined)
        self._mine_dialog.show()

    # ── Shadowing ─────────────────────────────────────────────────────────

    def _on_shadow_toggled(self, on: bool):
        self.shadow_panel.setVisible(on)
        self._reset_shadow(self.position())
        if not on:
            self._end_turn()
            self.recorder.stop()
        elif not self.pairs:
            self._set_shadow_status("El modo sombra necesita subtítulos para saber dónde acaba cada frase.",
                                    AMBER)
        else:
            self._set_shadow_status("Reproduce: la pausa llegará al final de cada frase.")
        self._refresh_controls()

    def _enter_turn(self):
        i = self._current_index()
        self._shadow_turn = i
        self._refresh_controls()
        line = self.pairs[i].en or self.pairs[i].es if i >= 0 else ""
        if self.auto_record.isChecked() and VoiceRecorder.available():
            if self.recorder.start():
                self._set_shadow_status(f"Tu turno — repite en voz alta: «{line}»  ● grabando…", RED)
                return
        self._set_shadow_status(f"Tu turno — repite en voz alta: «{line}»")

    def _end_turn(self):
        self._shadow_turn = -1
        self._refresh_controls()

    def _on_recording(self, on: bool):
        self.record_btn.setText("⏹ Detener" if on else "⏺ Grabar")
        self.record_btn.setChecked(on)
        if on:
            self._set_shadow_status("● Grabando… pulsa «Detener» (R) al terminar.", RED)

    def _on_voice_saved(self, _path: str, ms: int):
        self._set_shadow_status(
            f"Grabación lista ({ms / 1000:.1f} s). Compara: «▶ Original» (O) y «▶ Mi voz» (V); "
            "luego «Continuar» (Enter).", GREEN)
        self._refresh_controls()

    # ── Internals ─────────────────────────────────────────────────────────

    def _current_index(self) -> int:
        if not self.pairs:
            return -1
        if self._current >= 0:
            return self._current
        return max(-1, cue_before(self.pairs, self.position()))

    def _go_to_sentence(self, i: int):
        self.recorder.stop()
        self._end_turn()
        self._stop_segment()
        self.seek_ms(self.pairs[i].start)
        self._set_current(i)

    def _play_segment(self, i: int, then=None, keep_turn: bool = False):
        pair = self.pairs[i]
        turn = self._shadow_turn
        self.seek_ms(pair.start)
        self._set_current(i)
        self._stop_at = pair.end
        self._after_stop = then
        if keep_turn:
            self._shadow_turn = turn
        self.player.play()

    def _stop_segment(self):
        self._stop_at = None
        self._after_stop = None

    def _clear_loop(self):
        self._loop_a = self._loop_b = None
        self._refresh_ab()

    def _refresh_ab(self):
        if self._loop_a is None:
            self.ab_btn.setText("A-B")
            self.ab_btn.setChecked(False)
        elif self._loop_b is None:
            self.ab_btn.setText("A…")
            self.ab_btn.setChecked(True)
        else:
            self.ab_btn.setText("A-B ✓")
            self.ab_btn.setChecked(True)

    def _on_tick(self):
        pos = self.player.position()
        if self._stop_at is not None and pos >= self._stop_at:
            then = self._after_stop
            self.player.pause()
            self.player.setPosition(self._stop_at)
            pos = self._stop_at
            self._stop_segment()
            self._shadow_done = self._current_index()
            if then:
                then()
        elif self._loop_b is not None and pos >= self._loop_b:
            self.player.setPosition(self._loop_a)
            pos = self._loop_a
        elif (self.shadow_btn.isChecked() and self.pairs and self._stop_at is None
              and self._shadow_turn < 0 and self._loop_b is None):
            i = cue_at(self.pairs, pos)
            if self._shadow_target is None and i > self._shadow_done:
                self._shadow_target = i
            target = self._shadow_target
            if target is not None and pos >= self.pairs[target].end - TICK_MS:
                self.player.pause()
                self.player.setPosition(self.pairs[target].end)
                pos = self.pairs[target].end
                self._shadow_done = target
                self._shadow_target = None
                self._set_current(target)
                self._enter_turn()
        self._show_position(pos)

    def _show_position(self, pos: int):
        if not self.slider.isSliderDown():
            self.slider.setValue(pos)
        self.time_label.setText(format_timestamp(pos / 1000))
        if self.pairs:
            i = cue_at(self.pairs, pos)
            if i < 0:
                i = cue_before(self.pairs, pos)
            if i != self._current and self._stop_at is None and self._shadow_turn < 0:
                self._set_current(i)
        self._refresh_subtitles(pos=pos)

    def _refresh_subtitles(self, *_args, pos: int | None = None):
        pos = self.position() if pos is None else pos
        en = cue_at(self.en_cues, pos)
        es = cue_at(self.es_cues, pos)
        self.sub_en.setText(self.en_cues[en].text if en >= 0 and self.en_toggle.isChecked() else "")
        self.sub_es.setText(self.es_cues[es].text if es >= 0 and self.es_toggle.isChecked() else "")
        show_es = self.es_toggle.isChecked()
        if self.delegate.show_es != show_es:
            self.delegate.show_es = show_es
            self.sentences.doItemsLayout()

    def _set_current(self, i: int):
        old = self._current
        self._current = i
        self.delegate.current = i
        for row in (old, i):
            item = self.sentences.item(row) if row >= 0 else None
            if item is not None:
                self.sentences.update(self.sentences.indexFromItem(item))
        if i >= 0 and self.sentences.item(i) is not None:
            self.sentences.scrollToItem(self.sentences.item(i), QAbstractItemView.ScrollHint.EnsureVisible)
        self.mine_btn.setEnabled(i >= 0 and self.vault_root is not None)
        self.repeat_btn.setEnabled(i >= 0)

    def _rebuild_sentences(self):
        if self.en_cues:
            self.pairs = pair_tracks(self.en_cues, self.es_cues)
        else:
            self.pairs = [SentencePair(c.start, c.end, "", c.line) for c in self.es_cues]
        self.sentences.clear()
        for pair in self.pairs:
            item = QListWidgetItem()
            item.setData(Qt.UserRole, pair)
            self.sentences.addItem(item)
        self._current = -1
        self.delegate.current = -1
        has = bool(self.pairs)
        self.sentences.setVisible(has)
        self.no_subs.setVisible(not has)
        self.count_label.setText(f"{len(self.pairs)}" if has else "")
        self._show_position(self.position())
        self._refresh_controls()

    def _on_sentence_clicked(self, item: QListWidgetItem):
        self._go_to_sentence(self.sentences.row(item))
        if self.media_path is not None:
            self.player.play()

    def _on_slider_moved(self, value: int):
        self.time_label.setText(format_timestamp(value / 1000))

    def _on_speed(self, index: int):
        rate = SPEEDS[index]
        if hasattr(self.player, "setPitchCompensation"):
            try:
                self.player.setPitchCompensation(True)
            except Exception:
                pass
        self.player.setPlaybackRate(rate)
        self._set_status(f"Velocidad {rate:g}×")

    def _on_duration(self, ms: int):
        self.slider.setRange(0, max(0, ms))
        self.dur_label.setText(format_timestamp(ms / 1000))

    def _on_state(self, state):
        playing = state == QMediaPlayer.PlaybackState.PlayingState
        self.play_btn.setText("⏸ Pausa" if playing else "▶ Reproducir")
        if playing:
            self._tick.start()
        else:
            self._tick.stop()
            self._show_position(self.player.position())

    def _on_media_status(self, status):
        if status in (QMediaPlayer.MediaStatus.LoadedMedia, QMediaPlayer.MediaStatus.BufferedMedia):
            if self._pending_seek is not None:
                seek, self._pending_seek = self._pending_seek, None
                self.player.setPosition(seek)
                self._show_position(seek)
            if getattr(self, "_autoplay", False):
                self._autoplay = False
                self.player.play()
        elif status == QMediaPlayer.MediaStatus.EndOfMedia:
            self._stop_segment()
        elif status == QMediaPlayer.MediaStatus.InvalidMedia:
            self._set_status("No se puede reproducir este archivo (formato no soportado).", RED)

    def _on_has_video(self, has: bool):
        self.display.setCurrentWidget(self.video if has else self.audio_label)

    def _on_note_mined(self, path: Path):
        self._set_status(f"Nota creada: {path.name}", GREEN)
        self.note_created.emit(path)
        if callable(self.open_note):
            try:
                self.open_note(path)
            except RuntimeError:
                pass

    def _refresh_controls(self):
        has_media = self.media_path is not None
        has_pairs = bool(self.pairs)
        in_turn = self._shadow_turn >= 0
        for b in (self.prev_btn, self.next_btn):
            b.setEnabled(has_media or has_pairs)
        self.repeat_btn.setEnabled(has_pairs)
        self.ab_btn.setEnabled(has_media)
        self.mine_btn.setEnabled(has_pairs and self.vault_root is not None)
        self.mine_btn.setToolTip("Crear una nota de práctica con la frase actual (M)"
                                 if self.vault_root is not None
                                 else "Abre el reproductor desde una vault para minar frases")
        self.record_btn.setEnabled(VoiceRecorder.available())
        self.original_btn.setEnabled(has_pairs)
        self.voice_btn.setEnabled(bool(self.recorder.last_path))
        self.continue_btn.setEnabled(in_turn)

    def _set_status(self, text: str, color: str = TEXT_DIM):
        self.status.setText(text)
        self.status.setStyleSheet(
            f"color:{color};font-size:10px;background:{BG_BAR};"
            f"border-top:1px solid {BORDER};padding:0 12px;")
        self._hint_timer.start()

    def _restore_hint(self):
        self.status.setText(SHORTCUT_HINT)
        self.status.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:{BG_BAR};"
            f"border-top:1px solid {BORDER};padding:0 12px;")

    def _set_shadow_status(self, text: str, color: str = TEXT):
        self.shadow_status.setText(text)
        self.shadow_status.setToolTip(text)
        self.shadow_status.setStyleSheet(f"color:{color};font-size:12px;border:none;background:transparent;")

    def closeEvent(self, event):
        self.recorder.stop()
        self.voice_player.stop()
        self.player.pause()
        super().closeEvent(event)


# ── Shared window ─────────────────────────────────────────────────────────

_WINDOW: MediaPlayerWindow | None = None


def player_window() -> MediaPlayerWindow | None:
    return _WINDOW


def open_media_player(path=None, seconds: float | None = None, vault_root: Path | None = None,
                      open_note=None, autoplay: bool = True) -> MediaPlayerWindow:
    """Show the shared player, optionally opening `path` at `seconds`."""
    global _WINDOW
    try:
        if _WINDOW is not None:
            _WINDOW.isVisible()
    except RuntimeError:
        _WINDOW = None
    if _WINDOW is None:
        _WINDOW = MediaPlayerWindow(vault_root)
    if vault_root is not None:
        _WINDOW.set_vault(vault_root)
    if open_note is not None:
        _WINDOW.open_note = open_note
    if path is not None:
        _WINDOW.open_media(Path(path), seconds, autoplay=autoplay)
    _WINDOW.show()
    _WINDOW.raise_()
    _WINDOW.activateWindow()
    return _WINDOW

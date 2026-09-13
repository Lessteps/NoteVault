"""
Ejercicio — Reproductor de Video Integrado
Embeds QMediaPlayer + QVideoWidget inside the stacked panel (index 10).
Supports fallback to the system default media player if playback fails.
"""

import os
from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QSlider, QSizePolicy, QStackedLayout,
)
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtCore import Qt, Signal, QUrl, QTimer
from PySide6.QtGui import QFont

BG_PAGE    = "#191919"
BG_BAR     = "#141414"
BORDER     = "#2f2f2f"
TEXT       = "#e6e6e6"
TEXT_DIM   = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
ORANGE     = "#ff9632"
RED_ERR    = "#ff6b6b"


def _icon_btn(icon: str, size: int = 32) -> QPushButton:
    btn = QPushButton(icon)
    btn.setFixedSize(size, size)
    btn.setCursor(Qt.PointingHandCursor)
    btn.setStyleSheet(
        f"QPushButton{{background:transparent;border:none;"
        f"color:{TEXT_DIM};font-size:{size // 2}px;}}"
        f"QPushButton:hover{{color:{ORANGE};}}"
    )
    return btn


def _fmt_ms(ms: int) -> str:
    total = max(0, ms) // 1000
    m, s = divmod(total, 60)
    return f"{m}:{s:02d}"


class EjercicioVideoPlayer(QWidget):
    back_requested = Signal(str)   # emits the day_key to return to

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("videoPlayer")
        self.setStyleSheet(f"background:{BG_PAGE};")
        self._day_key = "lunes"
        self._current_path: str = ""
        self._updating_slider = False
        self._init_ui()
        self._init_player()

    # ─────────────────────────────────────────────────────────────────────
    # UI
    # ─────────────────────────────────────────────────────────────────────

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Top bar ───────────────────────────────────────────────────────
        top = QWidget()
        top.setFixedHeight(46)
        top.setStyleSheet(
            f"background:{BG_BAR};border-bottom:1px solid {BORDER};"
        )
        top_lay = QHBoxLayout(top)
        top_lay.setContentsMargins(12, 0, 16, 0)
        top_lay.setSpacing(12)

        self._back_btn = QPushButton("← Volver")
        self._back_btn.setCursor(Qt.PointingHandCursor)
        self._back_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};"
            f"border-radius:6px;color:{TEXT_DIM};font-size:12px;padding:4px 12px;}}"
            f"QPushButton:hover{{color:{TEXT};border-color:#555;}}"
        )
        self._back_btn.clicked.connect(lambda: self.back_requested.emit(self._day_key))
        top_lay.addWidget(self._back_btn)

        self._title_lbl = QLabel("")
        f = QFont()
        f.setPixelSize(14)
        f.setWeight(QFont.Weight.DemiBold)
        self._title_lbl.setFont(f)
        self._title_lbl.setStyleSheet(
            f"color:{TEXT};background:transparent;border:none;"
        )
        top_lay.addWidget(self._title_lbl, stretch=1)

        # Button to open with default system player
        self._external_btn = QPushButton("Abrir con app externa ↗")
        self._external_btn.setCursor(Qt.PointingHandCursor)
        self._external_btn.setToolTip("Abrir video en el reproductor predeterminado de Windows")
        self._external_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};"
            f"border-radius:6px;color:{ORANGE};font-size:12px;padding:4px 12px;}}"
            f"QPushButton:hover{{background:#222;border-color:{ORANGE};}}"
        )
        self._external_btn.clicked.connect(self._open_external)
        top_lay.addWidget(self._external_btn)

        root.addWidget(top)

        # ── Video area ────────────────────────────────────────────────────
        center_container = QWidget()
        self._center_layout = QStackedLayout(center_container)
        self._center_layout.setStackingMode(QStackedLayout.StackAll)

        self._video_widget = QVideoWidget()
        self._video_widget.setStyleSheet("background:#000;")
        self._video_widget.setSizePolicy(
            QSizePolicy.Expanding, QSizePolicy.Expanding
        )
        self._center_layout.addWidget(self._video_widget)

        # Error overlay
        self._error_overlay = QWidget()
        self._error_overlay.setStyleSheet("background:rgba(20, 20, 20, 0.92);")
        err_lay = QVBoxLayout(self._error_overlay)
        err_lay.setAlignment(Qt.AlignCenter)
        err_lay.setSpacing(12)

        self._err_lbl = QLabel("No se pudo reproducir el video.")
        self._err_lbl.setAlignment(Qt.AlignCenter)
        self._err_lbl.setWordWrap(True)
        self._err_lbl.setStyleSheet(
            f"color:{RED_ERR};font-size:14px;font-weight:600;background:transparent;"
        )
        err_lay.addWidget(self._err_lbl)

        err_btn = QPushButton("Abrir con reproductor de Windows ↗")
        err_btn.setCursor(Qt.PointingHandCursor)
        err_btn.setStyleSheet(
            f"QPushButton{{background:{ORANGE};border:none;border-radius:6px;"
            f"color:#000;font-size:13px;font-weight:600;padding:8px 18px;}}"
            f"QPushButton:hover{{background:#e08020;}}"
        )
        err_btn.clicked.connect(self._open_external)
        err_lay.addWidget(err_btn, alignment=Qt.AlignCenter)

        self._error_overlay.hide()
        self._center_layout.addWidget(self._error_overlay)

        root.addWidget(center_container, stretch=1)

        # ── Controls bar ──────────────────────────────────────────────────
        ctrl = QWidget()
        ctrl.setFixedHeight(60)
        ctrl.setStyleSheet(
            f"background:{BG_BAR};border-top:1px solid {BORDER};"
        )
        ctrl_lay = QHBoxLayout(ctrl)
        ctrl_lay.setContentsMargins(16, 0, 16, 0)
        ctrl_lay.setSpacing(10)

        # Restart button
        self._restart_btn = _icon_btn("⏮", 32)
        self._restart_btn.clicked.connect(self._restart)
        ctrl_lay.addWidget(self._restart_btn)

        # Play/Pause
        self._play_btn = _icon_btn("▶", 36)
        self._play_btn.setStyleSheet(
            f"QPushButton{{background:transparent;border:none;"
            f"color:{ORANGE};font-size:18px;}}"
            f"QPushButton:hover{{color:#e08020;}}"
        )
        self._play_btn.clicked.connect(self._toggle_play)
        ctrl_lay.addWidget(self._play_btn)

        # Skip +10s
        self._skip_btn = _icon_btn("⏭", 32)
        self._skip_btn.clicked.connect(lambda: self._seek_rel(10_000))
        ctrl_lay.addWidget(self._skip_btn)

        ctrl_lay.addSpacing(8)

        # Current time
        self._time_lbl = QLabel("0:00")
        self._time_lbl.setFixedWidth(36)
        self._time_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        ctrl_lay.addWidget(self._time_lbl)

        # Seek slider
        self._seek = QSlider(Qt.Horizontal)
        self._seek.setRange(0, 1000)
        self._seek.setStyleSheet(
            f"QSlider::groove:horizontal{{background:{BORDER};height:4px;border-radius:2px;}}"
            f"QSlider::sub-page:horizontal{{background:{ORANGE};border-radius:2px;}}"
            f"QSlider::handle:horizontal{{background:{ORANGE};width:12px;height:12px;"
            f"margin:-4px 0;border-radius:6px;}}"
        )
        self._seek.sliderPressed.connect(self._on_seek_pressed)
        self._seek.sliderReleased.connect(self._on_seek_released)
        ctrl_lay.addWidget(self._seek, stretch=1)

        # Duration
        self._dur_lbl = QLabel("0:00")
        self._dur_lbl.setFixedWidth(36)
        self._dur_lbl.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        self._dur_lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        ctrl_lay.addWidget(self._dur_lbl)

        ctrl_lay.addSpacing(12)

        # Volume icon
        self._vol_icon = QLabel("🔊")
        self._vol_icon.setStyleSheet("background:transparent;border:none;font-size:14px;")
        ctrl_lay.addWidget(self._vol_icon)

        # Volume slider
        self._vol = QSlider(Qt.Horizontal)
        self._vol.setRange(0, 100)
        self._vol.setValue(80)
        self._vol.setFixedWidth(80)
        self._vol.setStyleSheet(
            f"QSlider::groove:horizontal{{background:{BORDER};height:3px;border-radius:2px;}}"
            f"QSlider::sub-page:horizontal{{background:#888;border-radius:2px;}}"
            f"QSlider::handle:horizontal{{background:{TEXT};width:10px;height:10px;"
            f"margin:-4px 0;border-radius:5px;}}"
        )
        self._vol.valueChanged.connect(self._on_volume_changed)
        ctrl_lay.addWidget(self._vol)

        root.addWidget(ctrl)

    # ─────────────────────────────────────────────────────────────────────
    # Player
    # ─────────────────────────────────────────────────────────────────────

    def _init_player(self):
        self._audio = QAudioOutput()
        self._audio.setVolume(0.8)

        self._player = QMediaPlayer()
        self._player.setAudioOutput(self._audio)
        self._player.setVideoOutput(self._video_widget)

        self._player.playbackStateChanged.connect(self._on_state_changed)
        self._player.durationChanged.connect(self._on_duration_changed)
        self._player.positionChanged.connect(self._on_position_changed)
        self._player.errorOccurred.connect(self._on_player_error)
        self._player.mediaStatusChanged.connect(self._on_media_status_changed)

        # Ticker to refresh time label smoothly
        self._ticker = QTimer()
        self._ticker.setInterval(500)
        self._ticker.timeout.connect(self._tick)

    # ─────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────

    def play(self, path: str, exercise_name: str, day_key: str = "lunes"):
        """Load a video file and start playing it."""
        self._day_key = day_key
        self._current_path = path
        self._title_lbl.setText(exercise_name)
        self._player.stop()

        p = Path(path)
        if not p.exists():
            self._show_error(f"El archivo de video no existe:\n{path}")
            return

        self._error_overlay.hide()
        self._video_widget.show()
        self._center_layout.setCurrentWidget(self._video_widget)
        self._player.setSource(QUrl.fromLocalFile(str(p.resolve())))
        self._player.play()
        self._ticker.start()

    def stop(self):
        self._player.stop()
        self._ticker.stop()

    def _open_external(self):
        """Open the video with the OS default media player."""
        if self._current_path and os.path.exists(self._current_path):
            try:
                os.startfile(os.path.abspath(self._current_path))
            except Exception as e:
                self._show_error(f"Error al abrir externamente: {e}")

    def _show_error(self, message: str):
        self._ticker.stop()
        self._err_lbl.setText(message)
        # The video surface is GPU-composited and can paint over a sibling
        # overlay, so it is hidden rather than trusted to sit underneath.
        self._video_widget.hide()
        self._error_overlay.show()
        self._center_layout.setCurrentWidget(self._error_overlay)

    # ─────────────────────────────────────────────────────────────────────
    # Slots
    # ─────────────────────────────────────────────────────────────────────

    def _on_player_error(self, error, error_string: str):
        if error != QMediaPlayer.Error.NoError:
            self._show_error(f"Error al reproducir video con Qt:\n{error_string}")

    def _on_media_status_changed(self, status):
        if status == QMediaPlayer.MediaStatus.InvalidMedia:
            self._show_error("Formato o codec no compatible con el reproductor interno.")

    def _toggle_play(self):
        state = self._player.playbackState()
        if state == QMediaPlayer.PlaybackState.PlayingState:
            self._player.pause()
            self._ticker.stop()
        else:
            self._player.play()
            self._ticker.start()

    def _restart(self):
        self._player.setPosition(0)
        self._player.play()
        self._ticker.start()

    def _seek_rel(self, ms: int):
        pos = self._player.position() + ms
        dur = self._player.duration()
        self._player.setPosition(max(0, min(pos, dur)))

    def _on_seek_pressed(self):
        self._updating_slider = True

    def _on_seek_released(self):
        dur = self._player.duration()
        if dur > 0:
            target = int(self._seek.value() / 1000 * dur)
            self._player.setPosition(target)
        self._updating_slider = False

    def _on_volume_changed(self, value: int):
        self._audio.setVolume(value / 100.0)
        self._vol_icon.setText("🔇" if value == 0 else "🔊")

    def _on_state_changed(self, state: QMediaPlayer.PlaybackState):
        if state == QMediaPlayer.PlaybackState.PlayingState:
            self._play_btn.setText("⏸")
        else:
            self._play_btn.setText("▶")

    def _on_duration_changed(self, dur: int):
        self._dur_lbl.setText(_fmt_ms(dur))

    def _on_position_changed(self, pos: int):
        self._time_lbl.setText(_fmt_ms(pos))
        if not self._updating_slider:
            dur = self._player.duration()
            if dur > 0:
                self._seek.setValue(int(pos / dur * 1000))

    def _tick(self):
        pos = self._player.position()
        self._time_lbl.setText(_fmt_ms(pos))

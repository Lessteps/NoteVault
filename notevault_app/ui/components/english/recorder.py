"""Microphone recorder for shadowing: raw PCM from QAudioSource saved as WAV."""

import itertools
import tempfile
from pathlib import Path

from PySide6.QtCore import QBuffer, QByteArray, QIODevice, QObject, Signal
from PySide6.QtMultimedia import QAudioFormat, QAudioSource, QMediaDevices

from ....core.english.audio import duration_ms, wav_bytes

_FORMATS = {
    QAudioFormat.SampleFormat.UInt8: (8, False),
    QAudioFormat.SampleFormat.Int16: (16, False),
    QAudioFormat.SampleFormat.Int32: (32, False),
    QAudioFormat.SampleFormat.Float: (32, True),
}
_counter = itertools.count(1)


def recordings_dir() -> Path:
    folder = Path(tempfile.gettempdir()) / "notevault_shadowing"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


class VoiceRecorder(QObject):
    recording_changed = Signal(bool)
    saved = Signal(str, int)        # wav path, duration in ms
    failed = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._source = None
        self._buffer = None
        self._data = None
        self._format = None
        self.last_path = ""

    @staticmethod
    def available() -> bool:
        return not QMediaDevices.defaultAudioInput().isNull()

    def is_recording(self) -> bool:
        return self._source is not None

    def _pick_format(self, device):
        fmt = QAudioFormat()
        fmt.setSampleRate(44100)
        fmt.setChannelCount(1)
        fmt.setSampleFormat(QAudioFormat.SampleFormat.Int16)
        if device.isFormatSupported(fmt):
            return fmt
        return device.preferredFormat()

    def start(self) -> bool:
        if self._source is not None:
            return True
        device = QMediaDevices.defaultAudioInput()
        if device.isNull():
            self.failed.emit("No hay micrófono disponible.")
            return False
        self._format = self._pick_format(device)
        if self._format.sampleFormat() not in _FORMATS:
            self.failed.emit("El micrófono usa un formato de audio no compatible.")
            return False
        self._data = QByteArray()
        self._buffer = QBuffer(self._data, self)
        self._buffer.open(QIODevice.WriteOnly)
        self._source = QAudioSource(device, self._format, self)
        self._source.start(self._buffer)
        self.recording_changed.emit(True)
        return True

    def stop(self) -> str:
        if self._source is None:
            return ""
        self._source.stop()
        self._source.deleteLater()
        self._source = None
        self._buffer.close()
        pcm = bytes(self._data.data())
        self._buffer.deleteLater()
        self._buffer = None
        self.recording_changed.emit(False)
        bits, is_float = _FORMATS[self._format.sampleFormat()]
        rate, channels = self._format.sampleRate(), self._format.channelCount()
        if not pcm:
            self.failed.emit("La grabación está vacía: revisa el micrófono.")
            return ""
        folder = recordings_dir()
        for old in folder.glob("voice_*.wav"):
            try:
                old.unlink()
            except OSError:
                pass
        path = folder / f"voice_{next(_counter)}.wav"
        path.write_bytes(wav_bytes(pcm, rate, channels, bits, is_float))
        self.last_path = str(path)
        self.saved.emit(self.last_path, duration_ms(len(pcm), rate, channels, bits))
        return self.last_path

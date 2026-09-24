"""Qt threads that run core.ai_client calls off the UI thread (classic app)."""

from PySide6.QtCore import QThread, Signal

from ..core.ai_client import AIConfig, AIError, list_models, send_chat


class AIWorker(QThread):
    finished_ok = Signal(str)
    failed = Signal(str)

    def __init__(self, cfg: AIConfig, messages: list, parent=None):
        super().__init__(parent)
        self._cfg = cfg
        self._messages = messages

    def run(self):
        try:
            self.finished_ok.emit(send_chat(self._cfg, self._messages))
        except AIError as e:
            self.failed.emit(str(e))
        except Exception as e:  # noqa: BLE001 - surfaced in the UI
            self.failed.emit(f"{type(e).__name__}: {e}")


class ModelsWorker(QThread):
    finished_ok = Signal(list)
    failed = Signal(str)

    def __init__(self, cfg: AIConfig, parent=None):
        super().__init__(parent)
        self._cfg = cfg

    def run(self):
        try:
            self.finished_ok.emit(list_models(self._cfg))
        except AIError as e:
            self.failed.emit(str(e))
        except Exception as e:  # noqa: BLE001
            self.failed.emit(f"{type(e).__name__}: {e}")

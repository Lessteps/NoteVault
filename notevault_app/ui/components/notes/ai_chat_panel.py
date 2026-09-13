"""
AI assistant panel (right side of the notes module).

Works in two ways:

  · Connected — talks to LM Studio / Ollama / any OpenAI-compatible server
    (no API key needed, nothing leaves the machine) or to the OpenAI and
    Anthropic APIs when a key is configured.

  · Bridge — no API at all: the panel builds the full prompt with the note
    as context, copies it to the clipboard and opens Claude, ChatGPT or
    Antigravity. You paste the answer back into the box and it goes into
    the note like any other reply.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QTextEdit, QScrollArea, QComboBox, QCheckBox, QDialog, QLineEdit,
    QFormLayout, QMessageBox, QSizePolicy, QLayout, QApplication, QGridLayout,
)
from PySide6.QtCore import Qt, Signal, QUrl
from PySide6.QtGui import QDesktopServices

from ....config import AppConfig
from ....core import ai_client
from ....core.ai_client import (
    AIConfig, AIWorker, ModelsWorker, PROVIDERS, PROVIDER_BY_KEY, BRIDGE_URLS,
    build_messages, build_bridge_prompt,
)

BG_PANEL = "#1a1a1e"
BG_BAR   = "#202024"
BG_INPUT = "#202024"
BORDER   = "#33333e"
TEXT     = "#dcdde0"
TEXT_DIM = "#888895"
TEXT_FAINT = "#666672"
ACCENT   = "#7c5af0"
GREEN    = "#3fb950"
RED      = "#f2555a"

QUICK_ACTIONS = [
    ("Resumir",  "Resume la nota abierta en 5 puntos clave."),
    ("Esquema",  "Genera un esquema de títulos y subtítulos en markdown "
                 "para desarrollar esta nota."),
    ("Continuar", "Continúa escribiendo la nota desde donde se queda, "
                  "manteniendo el mismo tono y formato."),
    ("Preguntas", "Escribe 8 preguntas de repaso sobre el contenido de la "
                  "nota, con sus respuestas."),
]


def _btn(text: str, tooltip: str = "", accent: str = ACCENT,
         height: int = 26) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setToolTip(tooltip)
    b.setStyleSheet(
        f"QPushButton{{background:{BG_INPUT};border:1px solid {BORDER};"
        f"border-radius:6px;color:{TEXT_DIM};font-size:11px;padding:0 10px;}}"
        f"QPushButton:hover{{border-color:{accent};color:{TEXT};}}"
        f"QPushButton:disabled{{color:#585868;border-color:{BORDER};}}"
    )
    return b


def _primary(text: str, height: int = 30) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:{ACCENT};border:none;border-radius:6px;"
        "color:#ffffff;font-size:12px;font-weight:600;padding:0 14px;}"
        "QPushButton:hover{background:#6b4ae0;}"
        "QPushButton:disabled{background:#3a3352;color:#8b86a0;}"
    )
    return b


class AISettingsDialog(QDialog):
    def __init__(self, cfg: AIConfig, parent=None):
        super().__init__(parent)
        self.cfg = cfg
        self.setWindowTitle("Asistente IA — conexión")
        self.setMinimumWidth(520)
        self.setStyleSheet(f"QDialog{{background:{BG_PANEL};}}")
        self._models_worker = None
        self._build()

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(20, 18, 20, 16)
        lay.setSpacing(12)

        title = QLabel("¿Cómo quieres conectar la IA?")
        title.setStyleSheet(
            f"color:{TEXT};font-size:16px;font-weight:700;"
            "background:transparent;border:none;"
        )
        lay.addWidget(title)

        form = QFormLayout()
        form.setSpacing(9)

        self._provider = QComboBox()
        for p in PROVIDERS:
            self._provider.addItem(p.label, p.key)
        idx = self._provider.findData(self.cfg.provider)
        self._provider.setCurrentIndex(idx if idx >= 0 else 0)
        self._provider.currentIndexChanged.connect(self._provider_changed)
        form.addRow(self._label("Proveedor"), self._provider)

        self._url = QLineEdit(self.cfg.base_url)
        form.addRow(self._label("Endpoint"), self._url)

        model_row = QHBoxLayout()
        self._model = QComboBox()
        self._model.setEditable(True)
        self._model.setCurrentText(self.cfg.model)
        model_row.addWidget(self._model, stretch=1)
        self._fetch_btn = _btn("Detectar", "Preguntar al servidor qué modelos tiene")
        self._fetch_btn.clicked.connect(self._fetch_models)
        model_row.addWidget(self._fetch_btn)
        wrap = QWidget()
        wrap.setLayout(model_row)
        form.addRow(self._label("Modelo"), wrap)

        self._key = QLineEdit(self.cfg.api_key)
        self._key.setEchoMode(QLineEdit.Password)
        self._key.setPlaceholderText("Solo para OpenAI o Anthropic")
        form.addRow(self._label("API key"), self._key)

        lay.addLayout(form)

        self._hint = QLabel("")
        self._hint.setWordWrap(True)
        self._hint.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:{BG_BAR};"
            f"border:1px solid {BORDER};border-radius:8px;padding:10px;"
        )
        lay.addWidget(self._hint)

        self._include = QCheckBox("Enviar la nota abierta como contexto")
        self._include.setChecked(self.cfg.include_note)
        self._include.setStyleSheet(
            f"QCheckBox{{color:{TEXT_DIM};font-size:12px;}}"
            "QCheckBox::indicator{width:15px;height:15px;border-radius:3px;"
            "border:1px solid #6a6a72;}"
            f"QCheckBox::indicator:checked{{background:{ACCENT};border-color:{ACCENT};}}"
        )
        lay.addWidget(self._include)

        self._status = QLabel("")
        self._status.setWordWrap(True)
        self._status.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(self._status)

        buttons = QHBoxLayout()
        test = _btn("Probar conexión", height=30)
        test.clicked.connect(self._test)
        buttons.addWidget(test)
        buttons.addStretch()
        cancel = _btn("Cancelar", height=30)
        cancel.clicked.connect(self.reject)
        buttons.addWidget(cancel)
        save = _primary("Guardar")
        save.clicked.connect(self._save)
        buttons.addWidget(save)
        lay.addLayout(buttons)

        self._provider_changed()

    def _label(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setFixedWidth(90)
        lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        return lbl

    def _current_info(self):
        return PROVIDER_BY_KEY.get(self._provider.currentData(), PROVIDERS[0])

    def _provider_changed(self):
        info = self._current_info()
        self._hint.setText(info.hint)
        self._url.setEnabled(info.needs_url)
        self._key.setEnabled(info.needs_key)
        self._model.setEnabled(not info.bridge)
        self._fetch_btn.setEnabled(not info.bridge and not info.needs_key)
        if info.bridge:
            self._url.setText("")
            return
        if not self._url.text().strip() or self._url.text() in [
            p.default_url for p in PROVIDERS
        ]:
            self._url.setText(info.default_url)
        if not self._model.currentText().strip() or self._model.currentText() in [
            p.default_model for p in PROVIDERS
        ]:
            self._model.setCurrentText(info.default_model)

    def _collect(self) -> AIConfig:
        return AIConfig(
            provider=self._provider.currentData(),
            base_url=self._url.text().strip(),
            model=self._model.currentText().strip(),
            api_key=self._key.text().strip(),
            temperature=self.cfg.temperature,
            max_tokens=self.cfg.max_tokens,
            include_note=self._include.isChecked(),
        )

    def _fetch_models(self):
        cfg = self._collect()
        self._status.setText("Consultando modelos…")
        self._models_worker = ModelsWorker(cfg, self)
        self._models_worker.finished_ok.connect(self._models_ok)
        self._models_worker.failed.connect(
            lambda e: self._status.setText("No se pudo leer la lista: " + e)
        )
        self._models_worker.start()

    def _models_ok(self, models: list):
        if not models:
            self._status.setText("El servidor no devolvió modelos.")
            return
        current = self._model.currentText()
        self._model.clear()
        self._model.addItems(models)
        if current in models:
            self._model.setCurrentText(current)
        self._status.setText(f"{len(models)} modelos disponibles.")

    def _test(self):
        cfg = self._collect()
        if cfg.is_bridge:
            self._status.setText(
                "Modo puente: no hay conexión que probar. Se copiará el "
                "prompt y se abrirá la web."
            )
            return
        self._status.setText("Enviando una petición de prueba…")
        self._worker = AIWorker(
            cfg, [{"role": "user", "content": "Responde solo: ok"}], self
        )
        self._worker.finished_ok.connect(
            lambda r: self._status.setText("Conexión correcta ✓  " + r.strip()[:60])
        )
        self._worker.failed.connect(
            lambda e: self._status.setText("Falló: " + e)
        )
        self._worker.start()

    def _save(self):
        self.cfg = self._collect()
        AppConfig.set_ai_config(self.cfg.to_dict())
        self.accept()


class AIChatPanel(QWidget):
    """Right-hand panel: chat with the model about the open note."""

    insert_requested  = Signal(str)   # markdown to drop into the note
    replace_requested = Signal(str)
    new_note_requested = Signal(str, str)   # (title, body)
    close_requested   = Signal()

    def __init__(self, editor_ref=None, parent=None):
        super().__init__(parent)
        self.setObjectName("chatPanel")
        self._editor = editor_ref
        self.cfg = AIConfig.from_dict(AppConfig.get_ai_config())
        self._history: list = []
        self._worker = None
        self._last_reply = ""
        self._init_ui()
        self._refresh_provider_line()

    # ── Build ─────────────────────────────────────────────────────────────

    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Header
        head = QFrame()
        head.setAttribute(Qt.WA_StyledBackground, True)
        head.setFixedHeight(38)
        head.setStyleSheet(
            f"QFrame{{background:{BG_BAR};border:none;"
            f"border-bottom:1px solid {BORDER};}}"
        )
        h = QHBoxLayout(head)
        h.setContentsMargins(12, 0, 8, 0)
        h.setSpacing(6)
        title = QLabel("✦  Asistente")
        title.setStyleSheet(
            f"color:{TEXT};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        h.addWidget(title)
        h.addStretch()
        gear = _btn("⚙", "Configurar la conexión")
        gear.setFixedWidth(28)
        gear.clicked.connect(self.open_settings)
        h.addWidget(gear)
        clear = _btn("🗑", "Vaciar la conversación")
        clear.setFixedWidth(28)
        clear.clicked.connect(self.clear_chat)
        h.addWidget(clear)
        close = _btn("✕", "Cerrar el asistente")
        close.setFixedWidth(28)
        close.clicked.connect(self.close_requested.emit)
        h.addWidget(close)
        root.addWidget(head)

        # Provider line
        self._provider_lbl = QLabel("")
        self._provider_lbl.setWordWrap(True)
        self._provider_lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:{BG_BAR};"
            f"border-bottom:1px solid {BORDER};padding:5px 12px;"
        )
        root.addWidget(self._provider_lbl)

        # Conversation
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QScrollArea.NoFrame)
        self._scroll.setStyleSheet(
            f"QScrollArea{{background:{BG_PANEL};border:none;}}"
        )
        body = QWidget()
        body.setStyleSheet(f"background:{BG_PANEL};")
        self._chat = QVBoxLayout(body)
        self._chat.setContentsMargins(10, 10, 10, 10)
        self._chat.setSpacing(8)
        self._chat.setSizeConstraint(QLayout.SetMinimumSize)
        self._scroll.setWidget(body)
        root.addWidget(self._scroll, stretch=1)

        # Quick actions
        quick = QFrame()
        quick.setAttribute(Qt.WA_StyledBackground, True)
        quick.setStyleSheet(
            f"QFrame{{background:{BG_PANEL};border:none;"
            f"border-top:1px solid {BORDER};}}"
        )
        q = QGridLayout(quick)
        q.setContentsMargins(8, 6, 8, 4)
        q.setSpacing(4)
        for i, (label, prompt) in enumerate(QUICK_ACTIONS):
            b = _btn(label, prompt, height=24)
            b.clicked.connect(lambda _=False, p=prompt: self.ask(p))
            q.addWidget(b, i // 2, i % 2)
        root.addWidget(quick)

        # Input
        self._input = QTextEdit()
        self._input.setPlaceholderText(
            "Pide algo para esta nota…  (Ctrl+Enter para enviar)"
        )
        self._input.setFixedHeight(74)
        self._input.setStyleSheet(
            f"QTextEdit{{background:{BG_INPUT};border:none;"
            f"border-top:1px solid {BORDER};color:{TEXT};font-size:12px;"
            "padding:8px 10px;}"
        )
        self._input.installEventFilter(self)
        root.addWidget(self._input)

        # Send row
        send_row = QFrame()
        send_row.setAttribute(Qt.WA_StyledBackground, True)
        send_row.setStyleSheet(f"QFrame{{background:{BG_INPUT};border:none;}}")
        s = QHBoxLayout(send_row)
        s.setContentsMargins(8, 4, 8, 8)
        s.setSpacing(6)

        self._paste_btn = _btn("Pegar respuesta", "Pega aquí lo que te dio la web")
        self._paste_btn.clicked.connect(self.paste_reply)
        s.addWidget(self._paste_btn)
        s.addStretch()

        self._send_btn = _primary("Enviar")
        self._send_btn.clicked.connect(self.send_from_input)
        s.addWidget(self._send_btn)
        root.addWidget(send_row)

        self._greet()

    def eventFilter(self, obj, event):
        if obj is self._input and event.type() == event.Type.KeyPress:
            if (event.key() in (Qt.Key_Return, Qt.Key_Enter)
                    and event.modifiers() & Qt.ControlModifier):
                self.send_from_input()
                return True
        return super().eventFilter(obj, event)

    # ── Provider line ─────────────────────────────────────────────────────

    def _refresh_provider_line(self):
        info = self.cfg.info
        if self.cfg.is_bridge:
            text = f"{info.label} · modo puente, sin API"
        else:
            where = self.cfg.base_url.replace("https://", "").replace("http://", "")
            text = f"{info.label} · {self.cfg.model} · {where}"
        self._provider_lbl.setText(text)
        self._paste_btn.setVisible(True)
        self._send_btn.setText("Copiar y abrir" if self.cfg.is_bridge else "Enviar")

    def open_settings(self):
        dlg = AISettingsDialog(self.cfg, self)
        if dlg.exec() == QDialog.Accepted:
            self.cfg = dlg.cfg
            self._refresh_provider_line()
            self._add_system(
                f"Conexión actualizada: {self.cfg.info.label}."
            )

    # ── Chat bubbles ──────────────────────────────────────────────────────

    def _greet(self):
        self._add_system(
            "Puedo redactar, resumir y estructurar tus notas.\n"
            "Sin API: elige «Claude web», «ChatGPT web» o «Antigravity» en ⚙ "
            "y el prompt se copia solo.\n"
            "Con servidor local: LM Studio u Ollama, sin clave ni internet."
        )

    def _bubble(self, role: str, text: str) -> QWidget:
        colors = {
            "user":   ("#252534", TEXT, "Tú"),
            "ai":     (BG_BAR, TEXT, "Asistente"),
            "system": ("transparent", TEXT_FAINT, ""),
            "error":  ("#2e1a1c", "#f2555a", "Error"),
        }
        bg, fg, who = colors.get(role, (BG_BAR, TEXT, ""))

        box = QFrame()
        box.setAttribute(Qt.WA_StyledBackground, True)
        border = "none" if role == "system" else f"1px solid {BORDER}"
        box.setStyleSheet(
            f"QFrame{{background:{bg};border:{border};border-radius:8px;}}"
        )
        lay = QVBoxLayout(box)
        lay.setContentsMargins(10, 8, 10, 8)
        lay.setSpacing(4)

        if who:
            head = QLabel(who)
            head.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:9px;font-weight:700;"
                "letter-spacing:0.6px;background:transparent;border:none;"
            )
            lay.addWidget(head)

        content = QLabel(text)
        content.setWordWrap(True)
        content.setTextInteractionFlags(Qt.TextSelectableByMouse)
        content.setStyleSheet(
            f"color:{fg};font-size:12px;background:transparent;border:none;"
        )
        content.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Minimum)
        lay.addWidget(content)

        if role == "ai":
            # Two columns: the panel is narrow, a single row would overflow.
            actions = QGridLayout()
            actions.setSpacing(4)
            ins = _btn("Insertar", "Añadir esto al final de la nota", height=22)
            ins.clicked.connect(lambda _=False, t=text: self.insert_requested.emit(t))
            actions.addWidget(ins, 0, 0)
            rep = _btn("Reemplazar", "Sustituir el texto seleccionado", height=22)
            rep.clicked.connect(lambda _=False, t=text: self.replace_requested.emit(t))
            actions.addWidget(rep, 0, 1)
            new = _btn("Nota nueva", "Crear una nota con esta respuesta", height=22)
            new.clicked.connect(lambda _=False, t=text: self._as_new_note(t))
            actions.addWidget(new, 1, 0)
            copy = _btn("Copiar", "Copiar al portapapeles", height=22)
            copy.clicked.connect(
                lambda _=False, t=text: QApplication.clipboard().setText(t)
            )
            actions.addWidget(copy, 1, 1)
            lay.addLayout(actions)

        return box

    def _add(self, role: str, text: str):
        self._chat.addWidget(self._bubble(role, text))
        self._scroll.widget().adjustSize()
        bar = self._scroll.verticalScrollBar()
        bar.setValue(bar.maximum())

    def _add_system(self, text: str):
        self._add("system", text)

    def _as_new_note(self, text: str):
        first = next((l for l in text.splitlines() if l.strip()), "Nota generada")
        title = first.lstrip("# ").strip()[:60] or "Nota generada"
        self.new_note_requested.emit(title, text)

    def clear_chat(self):
        self._history.clear()
        while self._chat.count():
            item = self._chat.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self._greet()

    # ── Sending ───────────────────────────────────────────────────────────

    def send_from_input(self):
        text = self._input.toPlainText().strip()
        if not text:
            return
        self._input.clear()
        self.ask(text)

    def ask(self, question: str):
        note_title = note_body = selection = ""
        if self._editor is not None:
            note_title = self._editor.current_title()
            note_body = self._editor.current_body()
            selection = self._editor.current_selection()

        messages = build_messages(
            self.cfg, list(self._history), question,
            note_title, note_body, selection,
        )
        self._add("user", question)
        self._history.append({"role": "user", "content": question})

        if self.cfg.is_bridge:
            self._run_bridge(messages)
            return

        self._send_btn.setEnabled(False)
        self._send_btn.setText("Pensando…")
        self._worker = AIWorker(self.cfg, messages, self)
        self._worker.finished_ok.connect(self._on_reply)
        self._worker.failed.connect(self._on_error)
        self._worker.finished.connect(self._reset_send)
        self._worker.start()

    def _run_bridge(self, messages: list):
        prompt = build_bridge_prompt(messages)
        QApplication.clipboard().setText(prompt)
        url = BRIDGE_URLS.get(self.cfg.provider, "")
        if url:
            QDesktopServices.openUrl(QUrl(url))
        self._add_system(
            "Prompt copiado al portapapeles y abierta la web.\n"
            "Pega allí (Ctrl+V), copia la respuesta y pulsa "
            "«Pegar respuesta» aquí abajo."
        )

    def paste_reply(self):
        text = QApplication.clipboard().text().strip()
        if not text:
            QMessageBox.information(
                self, "Portapapeles vacío",
                "Copia primero la respuesta del asistente web."
            )
            return
        self._on_reply(text)

    def _on_reply(self, text: str):
        self._last_reply = text
        self._history.append({"role": "assistant", "content": text})
        self._add("ai", text)

    def _on_error(self, message: str):
        self._add("error", message)

    def _reset_send(self):
        self._send_btn.setEnabled(True)
        self._refresh_provider_line()

    # ── Wiring ────────────────────────────────────────────────────────────

    def set_editor(self, editor):
        self._editor = editor

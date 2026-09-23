"""Concept-map generator panel — a user-friendly option inside the notes area.

The user writes an order, optionally attaches context files and picks a
structure template; the panel asks the configured AI to turn that into a canvas
*spec* (YAML), compiles it with :mod:`canvas_builder`, and writes a ``.canvas``
map into the vault. When the AI provider is a browser "bridge" (no API), it
shows the prompt to copy and a box to paste the YAML answer back. If the order
box already holds a valid YAML spec, it is built directly with no AI.

See ``docs/ANTIGRAVITY_HANDOFF.md`` (Task 1) and ``docs/PLAN_CONCEPT_MAP_GENERATOR.md``.
"""
from __future__ import annotations

import re
from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QPlainTextEdit,
    QListWidget, QListWidgetItem, QComboBox, QLineEdit, QFileDialog,
    QApplication, QFrame,
)

from ....config import AppConfig
from ....core import ai_client
from ....core import canvas_builder as cb

# The compact schema the model must follow; kept short on purpose.
_SCHEMA = """\
Return ONLY a YAML document, no prose, with these keys:
  title: <string>
  layout: radial | tree | grid | column | row
  direction: down | right        # optional, for tree/column/row
  defaults: { card_width: 240 }   # optional
  nodes:                          # each node:
    - id: <unique alias>
      title: <short heading>
      body: <one sentence>        # optional
      color: "1".."6"             # optional (red,orange,yellow,green,cyan,purple)
      role: root                  # optional; marks the centre/root
      kind: text | note | shape   # optional, default text
  edges:
    - from: <alias>
      to: <alias or [alias, ...]> # a list fans one source to many
      label: <string>             # optional
Rules: unique ids; edges reference existing ids; short titles (they become
headings). Pick the layout that matches the requested shape."""


class ConceptMapPanel(QWidget):
    map_created = Signal(object)     # Path of the written .canvas
    open_requested = Signal(object)  # Path to open

    def __init__(self, vault, service, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.vault = vault
        self.service = service
        self._context_paths: list[Path] = []
        self._worker = None
        self._last_prompt = ""
        self._dest_dir = Path(self._vault_root())
        self._init_ui()

    # ── vault helpers ────────────────────────────────────────────────────
    def _vault_root(self):
        try:
            return str(self.vault.vault_root)
        except Exception:
            return "."

    def set_vault(self, vault, service):
        self.vault, self.service = vault, service
        self._dest_dir = Path(self._vault_root())
        self._dest_lbl.setText(str(self._dest_dir))

    # ── UI ───────────────────────────────────────────────────────────────
    def _init_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(8)

        title = QLabel("Generador de mapas conceptuales")
        title.setStyleSheet("font-size:16px;font-weight:bold;color:#e6e6ea;")
        root.addWidget(title)

        root.addWidget(self._section("Orden"))
        self._order = QPlainTextEdit()
        self._order.setPlaceholderText(
            "Describe el mapa: idea central, conceptos, y la forma "
            "(radial / árbol / lista). También puedes pegar un YAML de spec.")
        self._order.setFixedHeight(90)
        root.addWidget(self._order)

        # Context files
        row = QHBoxLayout()
        row.addWidget(self._section("Archivos de contexto"))
        row.addStretch()
        add_btn = QPushButton("Añadir archivos…")
        add_btn.setCursor(Qt.PointingHandCursor)
        add_btn.clicked.connect(self._add_context)
        row.addWidget(add_btn)
        root.addLayout(row)
        self._ctx_list = QListWidget()
        self._ctx_list.setFixedHeight(72)
        self._ctx_list.itemClicked.connect(self._maybe_remove_context)
        root.addWidget(self._ctx_list)

        # Template
        trow = QHBoxLayout()
        trow.addWidget(self._section("Plantilla"))
        self._tpl = QComboBox()
        self._tpl.addItem("(ninguna)", "")
        for t in cb.list_templates():
            self._tpl.addItem(t["name"], t["yaml"])
        self._tpl.currentIndexChanged.connect(self._preview_template)
        trow.addWidget(self._tpl, 1)
        root.addLayout(trow)
        self._tpl_preview = QPlainTextEdit()
        self._tpl_preview.setReadOnly(True)
        self._tpl_preview.setFixedHeight(70)
        self._tpl_preview.setVisible(False)
        root.addWidget(self._tpl_preview)

        root.addWidget(self._section("Contexto / órdenes adicionales"))
        self._extra = QPlainTextEdit()
        self._extra.setPlaceholderText("Instrucciones extra (opcional).")
        self._extra.setFixedHeight(54)
        root.addWidget(self._extra)

        # Destination + name
        drow = QHBoxLayout()
        drow.addWidget(self._section("Destino"))
        self._dest_lbl = QLabel(str(self._dest_dir))
        self._dest_lbl.setStyleSheet("color:#a6a8b1;")
        drow.addWidget(self._dest_lbl, 1)
        pick = QPushButton("Elegir…")
        pick.clicked.connect(self._pick_dest)
        drow.addWidget(pick)
        self._name = QLineEdit("Mapa.canvas")
        self._name.setFixedWidth(180)
        drow.addWidget(self._name)
        root.addLayout(drow)

        # Actions
        arow = QHBoxLayout()
        self._gen = QPushButton("Generar")
        self._gen.setCursor(Qt.PointingHandCursor)
        self._gen.setStyleSheet(
            "QPushButton{background:#7c5af0;color:white;border:none;"
            "border-radius:6px;padding:8px 18px;font-weight:bold;}"
            "QPushButton:hover{background:#8b6cf5;}")
        self._gen.clicked.connect(self._on_generate)
        arow.addWidget(self._gen)
        self._copy_btn = QPushButton("Copiar prompt")
        self._copy_btn.clicked.connect(self._copy_prompt)
        self._copy_btn.setVisible(False)
        arow.addWidget(self._copy_btn)
        arow.addStretch()
        self._open_btn = QPushButton("Abrir mapa")
        self._open_btn.clicked.connect(self._open_last)
        self._open_btn.setVisible(False)
        arow.addWidget(self._open_btn)
        root.addLayout(arow)

        # Bridge / paste-back box
        self._paste = QPlainTextEdit()
        self._paste.setPlaceholderText("Pega aquí el YAML que devolvió la IA…")
        self._paste.setFixedHeight(80)
        self._paste.setVisible(False)
        root.addWidget(self._paste)
        self._paste_btn = QPushButton("Crear desde YAML pegado")
        self._paste_btn.clicked.connect(self._on_paste_build)
        self._paste_btn.setVisible(False)
        root.addWidget(self._paste_btn)

        self._status = QLabel("")
        self._status.setWordWrap(True)
        self._status.setStyleSheet("color:#a6a8b1;")
        root.addWidget(self._status)
        root.addStretch()
        self._last_path: Path | None = None

    def _section(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setStyleSheet("color:#cfd0d6;font-weight:600;")
        return lbl

    # ── context files ────────────────────────────────────────────────────
    def _add_context(self):
        paths, _ = QFileDialog.getOpenFileNames(
            self, "Archivos de contexto", self._vault_root(),
            "Notas y canvas (*.md *.canvas *.txt);;Todos (*.*)")
        for p in paths:
            path = Path(p)
            if path not in self._context_paths:
                self._context_paths.append(path)
                it = QListWidgetItem(f"✕  {path.name}")
                it.setData(Qt.UserRole, str(path))
                self._ctx_list.addItem(it)

    def _maybe_remove_context(self, item: QListWidgetItem):
        p = Path(item.data(Qt.UserRole))
        if p in self._context_paths:
            self._context_paths.remove(p)
        self._ctx_list.takeItem(self._ctx_list.row(item))

    def _preview_template(self):
        yaml_text = self._tpl.currentData() or ""
        self._tpl_preview.setPlainText(yaml_text)
        self._tpl_preview.setVisible(bool(yaml_text))

    def _pick_dest(self):
        d = QFileDialog.getExistingDirectory(self, "Carpeta destino", str(self._dest_dir))
        if d:
            self._dest_dir = Path(d)
            self._dest_lbl.setText(d)

    def _copy_prompt(self):
        QApplication.clipboard().setText(self._last_prompt)
        self._status.setText("Prompt copiado. Pégalo en tu IA y trae el YAML de vuelta.")

    def _open_last(self):
        if self._last_path is not None:
            self.open_requested.emit(self._last_path)

    # ── prompt + spec ────────────────────────────────────────────────────
    def _context_texts(self) -> list[tuple[str, str]]:
        out = []
        for p in self._context_paths:
            try:
                txt = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                txt = ""
            out.append((p.name, txt[:4000]))
        return out

    def _build_prompt(self, order, context_texts, extra, template_yaml) -> str:
        parts = ["You convert a request into a NoteVault canvas SPEC.", _SCHEMA]
        parts.append("TEMPLATE (use its structure as the shape to fill):\n"
                     + (template_yaml or "none"))
        if context_texts:
            blocks = "\n".join(f"### {name}\n{text}" for name, text in context_texts)
            parts.append("CONTEXT FILES:\n" + blocks)
        parts.append("EXTRA INSTRUCTIONS:\n" + (extra.strip() or "none"))
        parts.append("USER ORDER:\n" + order.strip())
        return "\n\n".join(parts)

    @staticmethod
    def _extract_yaml(reply: str) -> str:
        m = re.search(r"```(?:ya?ml)?\s*(.*?)```", reply, re.S | re.I)
        return (m.group(1) if m else reply).strip()

    def _dest_path(self) -> Path:
        name = self._name.text().strip() or "Mapa.canvas"
        if not name.lower().endswith(".canvas"):
            name += ".canvas"
        return self._dest_dir / name

    def _build_from_yaml_text(self, text: str) -> bool:
        try:
            spec = cb.spec_from_yaml(text)
        except Exception as e:
            self._status.setText(f"No pude leer el YAML: {e}")
            return False
        errors = cb.validate_spec(spec)
        if errors:
            self._status.setText("Spec inválido:\n- " + "\n- ".join(errors))
            return False
        out = self._dest_path()
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            cb.write_canvas(out, spec)
        except Exception as e:
            self._status.setText(f"No pude escribir el mapa: {e}")
            return False
        self._last_path = out
        self._open_btn.setVisible(True)
        self._status.setText(f"Mapa creado: {out.name}")
        self.map_created.emit(out)
        return True

    # ── generate ─────────────────────────────────────────────────────────
    def _on_generate(self):
        order = self._order.toPlainText().strip()
        if not order:
            self._status.setText("Escribe una orden (o pega un YAML de spec).")
            return
        # If the order itself is a valid spec, build directly — no AI needed.
        try:
            maybe = cb.spec_from_yaml(order)
            if isinstance(maybe, dict) and maybe.get("nodes") and not cb.validate_spec(maybe):
                self._build_from_yaml_text(order)
                return
        except Exception:
            pass

        prompt = self._build_prompt(
            order, self._context_texts(), self._extra.toPlainText(),
            self._tpl.currentData() or "")
        self._last_prompt = prompt

        cfg = ai_client.AIConfig.from_dict(AppConfig.get_ai_config())
        if cfg.is_bridge:
            # No direct API: hand the prompt over and take the YAML back.
            self._copy_btn.setVisible(True)
            self._paste.setVisible(True)
            self._paste_btn.setVisible(True)
            QApplication.clipboard().setText(prompt)
            self._status.setText(
                "Proveedor en modo puente: prompt copiado. Pégalo en tu IA, "
                "trae el YAML y pégalo abajo → «Crear desde YAML pegado».")
            return

        self._gen.setEnabled(False)
        self._status.setText("Generando con la IA…")
        messages = [
            {"role": "system", "content": "You output only YAML canvas specs."},
            {"role": "user", "content": prompt},
        ]
        self._worker = ai_client.AIWorker(cfg, messages, self)
        self._worker.finished_ok.connect(self._on_ai_reply)
        self._worker.failed.connect(self._on_ai_fail)
        self._worker.start()

    def _on_ai_reply(self, reply: str):
        self._gen.setEnabled(True)
        self._build_from_yaml_text(self._extract_yaml(reply))

    def _on_ai_fail(self, msg: str):
        self._gen.setEnabled(True)
        self._status.setText(f"Falló la IA: {msg}. Puedes pegar el YAML a mano.")
        self._copy_btn.setVisible(True)
        self._paste.setVisible(True)
        self._paste_btn.setVisible(True)

    def _on_paste_build(self):
        text = self._paste.toPlainText().strip()
        if text:
            self._build_from_yaml_text(self._extract_yaml(text))

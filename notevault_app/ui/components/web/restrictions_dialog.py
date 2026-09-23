"""
Content-consumption rules of the WEB module, in plain Spanish.

One site or URL fragment per line, one-click presets (Shorts/Reels, social
networks), a focus mode that only lets listed sites open, and daily time
limits per site with today's usage beside each one. With "pedir
confirmación" on, loosening any rule asks to type a phrase first, which is
the friction that makes a self-imposed limit stick.
"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox, QRadioButton,
    QPlainTextEdit, QTableWidget, QTableWidgetItem, QHeaderView, QPushButton,
    QDialogButtonBox, QInputDialog, QMessageBox, QGroupBox, QSpinBox, QTabWidget,
    QWidget, QLineEdit,
)

from ....core.web_store import PRESETS, RELAX_PHRASE, Restrictions, seconds_for

_STYLE = """
QDialog { background:#1b1b1f; }
QLabel, QCheckBox, QRadioButton { color:#dcdde0; font-size:12px; }
QLabel#hint { color:#8a8a96; font-size:11px; }
QGroupBox { color:#b9a6ff; border:1px solid #33333e; border-radius:8px; margin-top:10px;
    padding:10px 8px 8px 8px; font-weight:600; }
QGroupBox::title { subcontrol-origin: margin; left:10px; padding:0 4px; }
QPlainTextEdit, QTableWidget, QSpinBox, QLineEdit { background:#141417; color:#dcdde0;
    border:1px solid #33333e; border-radius:6px; font-family:'Consolas','Segoe UI'; font-size:12px; }
QHeaderView::section { background:#232329; color:#a0a0ab; border:none; padding:4px; }
QPushButton { background:#2c2c35; color:#dcdde0; border:1px solid #3a3a46; border-radius:6px;
    padding:5px 12px; }
QPushButton:hover { border-color:#7c5af0; }
QTabWidget::pane { border:1px solid #33333e; border-radius:8px; top:-1px; }
QTabBar::tab { background:#202026; color:#8a8a96; padding:6px 14px; border-top-left-radius:6px;
    border-top-right-radius:6px; margin-right:2px; }
QTabBar::tab:selected { background:#2a2a33; color:#dcdde0; }
"""


def _lines(edit: QPlainTextEdit) -> list:
    out = []
    for line in edit.toPlainText().splitlines():
        t = line.strip()
        if t and t not in out:
            out.append(t)
    return out


class RestrictionsDialog(QDialog):
    def __init__(self, ctl, parent=None):
        super().__init__(parent)
        self.ctl = ctl
        self._old = ctl.restrictions
        r = Restrictions.from_dict(self._old.to_dict())
        self.setWindowTitle("Restricciones de contenido · WEB")
        self.resize(640, 620)
        self.setStyleSheet(_STYLE)
        lay = QVBoxLayout(self)

        self._enabled = QCheckBox("Activar restricciones")
        self._enabled.setChecked(r.enabled)
        lay.addWidget(self._enabled)

        tabs = QTabWidget()
        lay.addWidget(tabs, 1)

        # ── blocked ────────────────────────────────────────────────────
        blk = QWidget()
        bl = QVBoxLayout(blk)
        presets = QHBoxLayout()
        presets.addWidget(QLabel("Plantillas:"))
        for name in PRESETS:
            b = QPushButton("+ " + name)
            b.clicked.connect(lambda _=False, n=name: self._apply_preset(n))
            presets.addWidget(b)
        presets.addStretch(1)
        bl.addLayout(presets)
        bl.addWidget(QLabel("Sitios bloqueados (uno por línea; incluye sus subdominios):"))
        self._domains = QPlainTextEdit("\n".join(r.blocked_domains))
        self._domains.setPlaceholderText("tiktok.com\nfacebook.com")
        bl.addWidget(self._domains, 1)
        bl.addWidget(QLabel("Partes de dirección bloqueadas (bloquea solo esa sección del sitio):"))
        self._patterns = QPlainTextEdit("\n".join(r.blocked_patterns))
        self._patterns.setPlaceholderText("youtube.com/shorts\ninstagram.com/reels")
        bl.addWidget(self._patterns, 1)
        tabs.addTab(blk, "⛔ Bloquear")

        # ── focus mode ─────────────────────────────────────────────────
        foc = QWidget()
        fl = QVBoxLayout(foc)
        self._mode_block = QRadioButton("Normal: se abre todo menos lo bloqueado")
        self._mode_allow = QRadioButton("Modo enfoque: solo se abren los sitios de esta lista")
        (self._mode_allow if r.mode == "allowlist" else self._mode_block).setChecked(True)
        fl.addWidget(self._mode_block)
        fl.addWidget(self._mode_allow)
        self._allowed = QPlainTextEdit("\n".join(r.allowed_domains))
        self._allowed.setPlaceholderText("doc.qt.io\ngithub.com\nstackoverflow.com")
        fl.addWidget(self._allowed, 1)
        tabs.addTab(foc, "🎯 Modo enfoque")

        # ── daily limits ───────────────────────────────────────────────
        lim = QWidget()
        ll = QVBoxLayout(lim)
        hint = QLabel("Minutos al día por sitio. Al agotarse, el sitio se bloquea hasta mañana.")
        hint.setObjectName("hint")
        ll.addWidget(hint)
        self._table = QTableWidget(0, 3)
        self._table.setHorizontalHeaderLabels(["Sitio", "Minutos/día", "Usado hoy"])
        self._table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self._table.verticalHeader().hide()
        ll.addWidget(self._table, 1)
        row = QHBoxLayout()
        add = QPushButton("+ Añadir límite")
        add.clicked.connect(lambda: self._add_limit_row("", 30))
        rem = QPushButton("− Quitar seleccionado")
        rem.clicked.connect(lambda: self._table.removeRow(self._table.currentRow()))
        row.addWidget(add)
        row.addWidget(rem)
        row.addStretch(1)
        ll.addLayout(row)
        for dom, minutes in r.daily_limits.items():
            self._add_limit_row(dom, minutes)
        tabs.addTab(lim, "⏱ Límites diarios")

        self._confirm = QCheckBox(f"Pedir confirmación («{RELAX_PHRASE}») para aflojar las reglas")
        self._confirm.setChecked(r.confirm_to_relax)
        lay.addWidget(self._confirm)

        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Save).setText("Guardar")
        buttons.button(QDialogButtonBox.Cancel).setText("Cancelar")
        buttons.accepted.connect(self._save)
        buttons.rejected.connect(self.reject)
        lay.addWidget(buttons)

    def _add_limit_row(self, domain: str, minutes: int):
        i = self._table.rowCount()
        self._table.insertRow(i)
        self._table.setCellWidget(i, 0, QLineEdit(domain))
        spin = QSpinBox()
        spin.setRange(0, 24 * 60)
        spin.setValue(int(minutes))
        spin.setSuffix(" min")
        self._table.setCellWidget(i, 1, spin)
        used = seconds_for(self.ctl.meter.today(), domain) // 60 if domain else 0
        item = QTableWidgetItem(f"{used} min")
        item.setFlags(Qt.ItemIsEnabled)
        self._table.setItem(i, 2, item)

    def _apply_preset(self, name: str):
        r = self.result_rules()
        r.apply_preset(name)
        self._domains.setPlainText("\n".join(r.blocked_domains))
        self._patterns.setPlainText("\n".join(r.blocked_patterns))

    def result_rules(self) -> Restrictions:
        limits = {}
        for i in range(self._table.rowCount()):
            dom = self._table.cellWidget(i, 0).text().strip()
            if dom:
                limits[dom] = self._table.cellWidget(i, 1).value()
        return Restrictions.from_dict({
            "enabled": self._enabled.isChecked(),
            "mode": "allowlist" if self._mode_allow.isChecked() else "blocklist",
            "blocked_domains": _lines(self._domains),
            "blocked_patterns": _lines(self._patterns),
            "allowed_domains": _lines(self._allowed),
            "daily_limits": limits,
            "confirm_to_relax": self._confirm.isChecked(),
        })

    def _save(self):
        new = self.result_rules()
        if new.mode == "allowlist" and new.enabled and not new.allowed_domains:
            QMessageBox.warning(self, "Modo enfoque",
                                "Añade al menos un sitio permitido o todo quedará bloqueado.")
            return
        if self._old.confirm_to_relax and new.is_relaxation_of(self._old):
            text, ok = QInputDialog.getText(
                self, "Confirmar",
                f"Estás aflojando tus reglas.\nEscribe «{RELAX_PHRASE}» para continuar:")
            if not ok or text.strip().lower() != RELAX_PHRASE:
                return
        self.ctl.save_restrictions(new)
        self.accept()

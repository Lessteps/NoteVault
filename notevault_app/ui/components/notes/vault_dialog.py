"""
Vault picker — the Obsidian-style "which folder am I working in?" dialog.

Lists the vaults opened before, opens any folder as a vault, or creates a
new one. It also warns before adopting a folder that looks like source code
rather than notes, which is easy to do by accident and fills the explorer
with thousands of irrelevant files.
"""

from pathlib import Path

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QScrollArea, QWidget, QFileDialog, QInputDialog, QMessageBox, QLayout,
    QSizePolicy,
)
from PySide6.QtCore import Qt, Signal

BG_PANEL = "#1a1a1e"
BG_CARD  = "#202024"
BORDER   = "#33333e"
TEXT     = "#dcdde0"
TEXT_DIM = "#888895"
TEXT_FAINT = "#666672"
ACCENT   = "#7c5af0"
AMBER    = "#e0a13a"

# Files that say "this is a project, not a notes folder".
CODE_MARKERS = {
    "package.json", "pyproject.toml", "requirements.txt", "Cargo.toml",
    "go.mod", "pom.xml", "build.gradle", "CMakeLists.txt", "Makefile",
    "setup.py", ".gitignore", "tsconfig.json",
}


def looks_like_obsidian(folder: Path) -> bool:
    return (folder / ".obsidian").is_dir()


def scan_folder(folder: Path, cap: int = 400) -> dict:
    """Cheap, shallow look at a folder: enough to describe it, never slow."""
    info = {"markdown": 0, "folders": 0, "code_markers": 0, "truncated": False}
    try:
        entries = list(folder.iterdir())
    except (OSError, ValueError):
        return info
    for entry in entries[:cap]:
        try:
            if entry.is_dir():
                if not entry.name.startswith("."):
                    info["folders"] += 1
            elif entry.suffix.lower() == ".md":
                info["markdown"] += 1
            elif entry.name in CODE_MARKERS:
                info["code_markers"] += 1
        except OSError:
            continue
    info["truncated"] = len(entries) > cap
    return info


def describe(folder: Path) -> str:
    if not folder.exists():
        return "la carpeta ya no existe"
    info = scan_folder(folder)
    bits = []
    if looks_like_obsidian(folder):
        bits.append("vault de Obsidian")
    bits.append(f"{info['markdown']}{'+' if info['truncated'] else ''} notas")
    bits.append(f"{info['folders']} carpetas")
    return " · ".join(bits)


def _btn(text: str, height: int = 30, accent: str = ACCENT) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:{BG_CARD};border:1px solid {BORDER};"
        f"border-radius:6px;color:{TEXT_DIM};font-size:12px;padding:0 14px;}}"
        f"QPushButton:hover{{border-color:{accent};color:{TEXT};}}"
    )
    return b


def _primary(text: str, height: int = 30) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:{ACCENT};border:none;border-radius:6px;"
        "color:#ffffff;font-size:12px;font-weight:600;padding:0 16px;}"
        "QPushButton:hover{background:#6b4ae0;}"
    )
    return b


class VaultDialog(QDialog):
    """Returns the chosen folder in `selected` when accepted."""

    def __init__(self, current: Path, recent: list, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Vaults")
        self.setMinimumSize(560, 420)
        self.setStyleSheet(f"QDialog{{background:{BG_PANEL};}}")
        self.current = Path(current)
        self.recent = [Path(p) for p in recent]
        self.selected = None
        self._build()

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(22, 20, 22, 18)
        lay.setSpacing(12)

        title = QLabel("Elige tu vault")
        title.setStyleSheet(
            f"color:{TEXT};font-size:18px;font-weight:700;"
            "background:transparent;border:none;"
        )
        lay.addWidget(title)

        sub = QLabel(
            "Una vault es simplemente una carpeta con tus notas en markdown. "
            "Puedes abrir la misma carpeta que ya usas en Obsidian."
        )
        sub.setWordWrap(True)
        sub.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(sub)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PANEL};border:none;}}")
        body = QWidget()
        body.setStyleSheet(f"background:{BG_PANEL};")
        self._list = QVBoxLayout(body)
        self._list.setContentsMargins(0, 0, 0, 0)
        self._list.setSpacing(6)
        self._list.setSizeConstraint(QLayout.SetMinimumSize)
        scroll.setWidget(body)
        lay.addWidget(scroll, stretch=1)

        self._fill_list()

        row = QHBoxLayout()
        row.setSpacing(8)
        open_btn = _btn("📂  Abrir una carpeta como vault…")
        open_btn.clicked.connect(self._open_folder)
        row.addWidget(open_btn)
        create_btn = _btn("✨  Crear una vault nueva…")
        create_btn.clicked.connect(self._create_vault)
        row.addWidget(create_btn)
        row.addStretch()
        close = _primary("Cerrar")
        close.clicked.connect(self.reject)
        row.addWidget(close)
        lay.addLayout(row)

    def _fill_list(self):
        while self._list.count():
            item = self._list.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        shown = []
        for v in self.recent:
            if v not in shown:
                shown.append(v)
        if self.current not in shown:
            shown.insert(0, self.current)

        if not shown:
            self._list.addWidget(self._muted("Todavía no has abierto ninguna vault."))
            return
        for v in shown:
            self._list.addWidget(self._row(v))
        self._list.addStretch()

    def _muted(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:12px;background:transparent;border:none;"
        )
        return lbl

    def _row(self, folder: Path) -> QWidget:
        is_current = folder == self.current
        card = QFrame()
        card.setAttribute(Qt.WA_StyledBackground, True)
        card.setObjectName("vaultRow")
        card.setStyleSheet(
            f"QFrame#vaultRow{{background:{BG_CARD};border:1px solid "
            f"{ACCENT if is_current else BORDER};border-radius:8px;}}"
        )
        lay = QHBoxLayout(card)
        lay.setContentsMargins(14, 10, 12, 10)
        lay.setSpacing(10)

        texts = QVBoxLayout()
        texts.setSpacing(2)
        name = QLabel(folder.name or str(folder))
        name.setStyleSheet(
            f"color:{TEXT};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        texts.addWidget(name)
        detail = QLabel(f"{folder}   ·   {describe(folder)}")
        detail.setToolTip(str(folder))
        detail.setMinimumWidth(120)
        detail.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        detail.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:10px;background:transparent;border:none;"
        )
        texts.addWidget(detail)
        lay.addLayout(texts, stretch=1)

        if is_current:
            tag = QLabel("actual")
            tag.setStyleSheet(
                f"color:{ACCENT};font-size:10px;background:transparent;border:none;"
            )
            lay.addWidget(tag)
        else:
            pick = _btn("Abrir", height=26)
            pick.clicked.connect(lambda _=False, f=folder: self._choose(f))
            lay.addWidget(pick)
        return card

    # ── Actions ───────────────────────────────────────────────────────────

    def _open_folder(self):
        chosen = QFileDialog.getExistingDirectory(
            self, "Elige la carpeta de tus notas", str(Path.home())
        )
        if chosen:
            self._choose(Path(chosen))

    def _create_vault(self):
        parent = QFileDialog.getExistingDirectory(
            self, "¿Dónde quieres crear la vault?", str(Path.home())
        )
        if not parent:
            return
        name, ok = QInputDialog.getText(
            self, "Nueva vault", "Nombre de la vault:", text="Mis notas"
        )
        if not ok or not name.strip():
            return
        folder = Path(parent) / name.strip()
        try:
            folder.mkdir(parents=True, exist_ok=True)
            welcome = folder / "Bienvenida.md"
            if not welcome.exists():
                welcome.write_text(
                    f"# {name.strip()}\n\n"
                    "Esta es tu nueva vault. Crea notas con ✎ y carpetas con 🗀.\n\n"
                    "Enlaza otras notas escribiendo [[Nombre de la nota]].\n",
                    encoding="utf-8",
                )
        except OSError as e:
            QMessageBox.warning(self, "No se pudo crear", str(e))
            return
        self._choose(folder, skip_warning=True)

    def _choose(self, folder: Path, skip_warning: bool = False):
        folder = Path(folder)
        if not folder.is_dir():
            QMessageBox.warning(self, "Carpeta no válida",
                                f"No existe la carpeta:\n{folder}")
            return

        if not skip_warning and not looks_like_obsidian(folder):
            info = scan_folder(folder)
            looks_like_code = info["code_markers"] > 0 and info["markdown"] <= 2
            if looks_like_code:
                answer = QMessageBox.question(
                    self, "¿Seguro que es una vault?",
                    f"«{folder.name}» parece una carpeta de código, no de "
                    "notas: no se ven archivos .md pero sí archivos de "
                    "proyecto.\n\n"
                    "Puedes abrirla igualmente, pero el explorador se llenará "
                    "de carpetas que no son notas.\n\n¿Abrirla de todas formas?",
                    QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
                )
                if answer != QMessageBox.Yes:
                    return

        self.selected = folder
        self.accept()

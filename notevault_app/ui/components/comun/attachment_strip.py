"""
Thumbnails of an entity's attachments, with "Adjuntar", "Pegar captura",
drag-and-drop, a full-size viewer and removal to the trash.
"""

from pathlib import Path

from PySide6.QtCore import Qt, Signal, QUrl, QSize
from PySide6.QtGui import QPixmap, QDesktopServices, QGuiApplication, QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QLabel, QFileDialog, QDialog, QScrollArea,
    QMenu, QPushButton, QFrame,
)

from ....core import module_attachments as ma
from ....core import vault_format
from . import BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, UI_FONT, flat_btn, label, clear_layout

THUMB = 64
_FILTER = "Imágenes y PDF (" + " ".join(f"*{e}" for e in vault_format.ATTACHMENT_EXTS) + ")"


class _Thumb(QLabel):
    open_requested = Signal(str)
    remove_requested = Signal(str)

    def __init__(self, vault_root, ref: str, parent=None):
        super().__init__(parent)
        self.ref = ref
        self.setFixedSize(THUMB, THUMB)
        self.setAlignment(Qt.AlignCenter)
        self.setCursor(Qt.PointingHandCursor)
        path = ma.resolve(vault_root, ref)
        style = f"background:#252525;border:1px solid {BORDER};border-radius:6px;color:{TEXT_DIM};"
        if path is None:
            self.setText("⚠")
            self.setToolTip(f"Archivo no disponible todavía:\n{ref}")
        elif path.suffix.lower() == ".pdf":
            self.setText("PDF")
            self.setToolTip(path.name)
        else:
            pm = QPixmap(str(path))
            if pm.isNull():
                self.setText("?")
            else:
                self.setPixmap(pm.scaled(THUMB - 6, THUMB - 6, Qt.KeepAspectRatioByExpanding,
                                         Qt.SmoothTransformation).copy(0, 0, THUMB - 6, THUMB - 6))
            self.setToolTip(path.name)
        self.setStyleSheet(f"QLabel{{{style}font-size:12px;font-family:{UI_FONT};}}")

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.open_requested.emit(self.ref)
        super().mouseReleaseEvent(event)

    def contextMenuEvent(self, event):
        menu = QMenu(self)
        menu.addAction("Abrir").triggered.connect(lambda: self.open_requested.emit(self.ref))
        menu.addAction("Quitar (va a la papelera)").triggered.connect(
            lambda: self.remove_requested.emit(self.ref))
        menu.exec(event.globalPos())


class ImageViewer(QDialog):
    def __init__(self, path: Path, parent=None):
        super().__init__(parent)
        self.setWindowTitle(path.name)
        self.setStyleSheet("QDialog{background:#111111;}")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 8, 8, 8)
        scroll = QScrollArea()
        scroll.setAlignment(Qt.AlignCenter)
        scroll.setStyleSheet("QScrollArea{background:#111111;border:none;}")
        img = QLabel()
        img.setAlignment(Qt.AlignCenter)
        pm = QPixmap(str(path))
        screen = QGuiApplication.primaryScreen().availableGeometry()
        if pm.width() > screen.width() * 0.85 or pm.height() > screen.height() * 0.85:
            pm = pm.scaled(int(screen.width() * 0.85), int(screen.height() * 0.85),
                           Qt.KeepAspectRatio, Qt.SmoothTransformation)
        img.setPixmap(pm)
        scroll.setWidget(img)
        lay.addWidget(scroll)
        self.resize(min(pm.width() + 40, int(screen.width() * 0.9)),
                    min(pm.height() + 40, int(screen.height() * 0.9)))


class AttachmentStrip(QWidget):
    """`module` and `owner` name where new files go; `refs` are the current ones."""

    changed = Signal(list)

    def __init__(self, vault_root, module: str, owner: str, refs=(), parent=None):
        super().__init__(parent)
        self.vault_root = Path(vault_root)
        self.module = module
        self.owner = owner
        self.refs = list(refs)
        self.setAcceptDrops(True)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(6)
        buttons = QHBoxLayout()
        buttons.setSpacing(6)
        add = flat_btn("📎  Adjuntar", height=28)
        add.clicked.connect(self._pick)
        paste = flat_btn("📋  Pegar captura", height=28)
        paste.setToolTip("Copia una captura (Win+Shift+S) y pégala aquí con Ctrl+V")
        paste.clicked.connect(self.paste)
        buttons.addWidget(add)
        buttons.addWidget(paste)
        buttons.addStretch()
        self.hint = label("o suelta archivos aquí", TEXT_FAINT, 11)
        buttons.addWidget(self.hint)
        lay.addLayout(buttons)
        self.thumbs = QHBoxLayout()
        self.thumbs.setSpacing(6)
        lay.addLayout(self.thumbs)
        sc = QShortcut(QKeySequence.Paste, self)
        sc.setContext(Qt.WidgetWithChildrenShortcut)
        sc.activated.connect(self.paste)
        self._render()

    def set_owner(self, owner: str, refs=()):
        self.owner = owner
        self.refs = list(refs)
        self._render()

    def _render(self):
        clear_layout(self.thumbs)
        for ref in self.refs:
            t = _Thumb(self.vault_root, ref)
            t.open_requested.connect(self.open)
            t.remove_requested.connect(self.remove)
            self.thumbs.addWidget(t)
        if not self.refs:
            self.thumbs.addWidget(label("Sin adjuntos", TEXT_FAINT, 11))
        self.thumbs.addStretch()

    def _add_ref(self, ref: str):
        self.refs.append(ref)
        self._render()
        self.changed.emit(list(self.refs))

    def add_file(self, path) -> bool:
        if not ma.is_supported(path):
            self.hint.setText("Solo imágenes o PDF")
            return False
        self._add_ref(ma.store_file(self.vault_root, self.module, self.owner, Path(path)))
        return True

    def _pick(self):
        paths, _ = QFileDialog.getOpenFileNames(self, "Adjuntar", "", _FILTER)
        for p in paths:
            self.add_file(p)

    def paste(self):
        clip = QGuiApplication.clipboard()
        image = clip.image()
        if not image.isNull():
            self._add_ref(ma.store_image(self.vault_root, self.module, self.owner, image))
            return True
        urls = clip.mimeData().urls() if clip.mimeData() else []
        added = False
        for url in urls:
            if url.isLocalFile():
                added = self.add_file(url.toLocalFile()) or added
        if not added:
            self.hint.setText("El portapapeles no tiene una imagen")
        return added

    def open(self, ref: str):
        path = ma.resolve(self.vault_root, ref)
        if path is None:
            return
        if path.suffix.lower() == ".pdf":
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))
        else:
            ImageViewer(path, self).exec()

    def remove(self, ref: str):
        if ref in self.refs:
            self.refs.remove(ref)
            ma.remove(self.vault_root, ref, f"{self.module}-adjuntos")
            self._render()
            self.changed.emit(list(self.refs))

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls() or event.mimeData().hasImage():
            event.acceptProposedAction()

    def dropEvent(self, event):
        md = event.mimeData()
        if md.hasUrls():
            for url in md.urls():
                if url.isLocalFile():
                    self.add_file(url.toLocalFile())
        elif md.hasImage():
            self._add_ref(ma.store_image(self.vault_root, self.module, self.owner, md.imageData()))
        event.acceptProposedAction()

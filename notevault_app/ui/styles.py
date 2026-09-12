"""
SDD Studio Native Stylesheet (QSS)
Obsidian-inspired dark palette: dark gray-purple backgrounds, purple accent,
clean minimal typography. The design language matches Obsidian's default dark
theme so users who live in Obsidian feel at home immediately.
"""

# Design tokens -- documentation only; QSS uses literal hex values.
PALETTE = {
    "bg":            "#1a1a1e",   # main background (Obsidian primary-alt)
    "panel":         "#202024",   # sidebar / inspector background
    "elevated":      "#26262e",   # cards, elevated surfaces
    "hover":         "#2e2e36",   # hover state
    "border":        "#33333e",   # subtle hairline borders
    "border_strong": "#44444e",   # stronger borders, focus rings
    "text":          "#dcdde0",   # primary text (Obsidian --text-normal)
    "text_dim":      "#888895",   # secondary / placeholder text
    "text_faint":    "#666672",   # very faint labels
    "accent":        "#7c5af0",   # Obsidian purple accent
    "accent_soft":   "rgba(124, 90, 240, 0.12)",
    "success":       "#3fb950",
    "warn":          "#e0a13a",
    "danger":        "#f2555a",
    "mono":          "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
}

DARK_THEME_QSS = """
/* ---------- Global ---------- */
QMainWindow, QWidget, QDialog {
    background-color: #1a1a1e;
    color: #dcdde0;
    font-family: 'Segoe UI Variable Text', 'Segoe UI', -apple-system, sans-serif;
    font-size: 12px;
}

QToolTip {
    background-color: #26262e;
    color: #dcdde0;
    border: 1px solid #44444e;
    border-radius: 4px;
    padding: 4px 7px;
}

/* ---------- Splitter ---------- */
QSplitter::handle {
    background-color: #33333e;
}
QSplitter::handle:hover {
    background-color: #44444e;
}

/* ---------- Toolbar ---------- */
QToolBar {
    background-color: #1a1a1e;
    border: none;
    border-bottom: 1px solid #33333e;
    padding: 7px 10px;
    spacing: 4px;
}
QToolBar::separator {
    background-color: #33333e;
    width: 1px;
    margin: 5px 7px;
}

QLabel {
    color: #888895;
    background: transparent;
}
QLabel#appTitle {
    color: #dcdde0;
    font-size: 12px;
    font-weight: 600;
    padding-right: 4px;
}
QLabel#sectionLabel {
    color: #dcdde0;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 0;
}
QLabel#metaLabel {
    color: #666672;
    font-family: 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
}

/* ---------- Buttons ---------- */
QPushButton {
    background-color: transparent;
    color: #888895;
    border: 1px solid #44444e;
    border-radius: 6px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 500;
}
QPushButton:hover {
    background-color: #2e2e36;
    color: #dcdde0;
    border-color: #505060;
}
QPushButton:pressed {
    background-color: #26262e;
}
QPushButton:disabled {
    color: #585868;
    border-color: #33333e;
}

/* Ghost button: no border until hovered (nav rows, icon actions) */
QPushButton#ghostBtn {
    border: 1px solid transparent;
    color: #888895;
    text-align: left;
    padding: 5px 8px;
}
QPushButton#ghostBtn:hover {
    background-color: #26262e;
    color: #dcdde0;
    border-color: transparent;
}

/* Primary: solid light fill with dark text, like the Hermes send button */
QPushButton#primaryActionBtn {
    background-color: #dcdde0;
    color: #1a1a1e;
    border: none;
    font-weight: 600;
}
QPushButton#primaryActionBtn:hover {
    background-color: #ffffff;
}
QPushButton#primaryActionBtn:disabled {
    background-color: #44444e;
    color: #666672;
}

QPushButton#accentBtn {
    background-color: rgba(124, 90, 240, 0.12);
    color: #7c5af0;
    border: 1px solid rgba(124, 90, 240, 0.35);
    font-weight: 600;
}
QPushButton#accentBtn:hover {
    background-color: rgba(124, 90, 240, 0.20);
    border-color: #7c5af0;
}
QPushButton#accentBtn:disabled {
    background-color: transparent;
    color: #585868;
    border-color: #33333e;
}

QPushButton#constraintBtn {
    background-color: transparent;
    color: #e0a13a;
    border: 1px solid rgba(224, 161, 58, 0.35);
}
QPushButton#constraintBtn:hover {
    background-color: rgba(224, 161, 58, 0.12);
    border-color: #e0a13a;
}

/* Sidebar collapse toggles */
QPushButton#sidebarToggleBtn {
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #666672;
    font-size: 13px;
    padding: 3px;
}
QPushButton#sidebarToggleBtn:hover {
    background-color: #2e2e36;
    color: #dcdde0;
}
QPushButton#sidebarToggleBtn:checked {
    color: #7c5af0;
}

/* Macro-fase: un solo desplegable en vez del título fijo + tres botones */
QComboBox#macroPhaseCombo {
    background-color: #26262e;
    border: 1px solid #44444e;
    color: #dcdde0;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    padding: 5px 10px;
    min-width: 120px;
}
QComboBox#macroPhaseCombo:hover {
    border-color: #505060;
}
QComboBox#macroPhaseCombo::drop-down {
    border: none;
    width: 18px;
}
QComboBox#macroPhaseCombo QAbstractItemView {
    background-color: #26262e;
    border: 1px solid #44444e;
    color: #dcdde0;
    selection-background-color: rgba(124, 90, 240, 0.20);
    outline: none;
}

/* Macro-phase tabs: flat text tabs, active one marked by accent */
QPushButton#macroTabActive {
    background-color: #26262e;
    border: 1px solid #44444e;
    color: #dcdde0;
    font-weight: 600;
    border-radius: 6px;
    padding: 5px 12px;
}
QPushButton#macroTabLocked {
    background-color: transparent;
    border: 1px solid transparent;
    color: #585868;
    font-weight: 500;
    border-radius: 6px;
    padding: 5px 12px;
}

/* Lifecycle tabs: Input / Proceso / Verificación */
QPushButton#phaseTab {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: #666672;
    font-size: 12px;
    font-weight: 500;
    padding: 7px 14px;
}
QPushButton#phaseTab:hover {
    color: #aaaaae;
}
QPushButton#phaseTabActive {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid #dcdde0;
    border-radius: 0;
    color: #dcdde0;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
}

/* Subtabs (inside Input tab) */
QWidget#subtabsBar {
    border-bottom: 1px solid #33333e;
    background-color: transparent;
    padding-bottom: 1px;
}
QPushButton#subTab {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: #666672;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 12px;
}
QPushButton#subTab:hover {
    color: #aaaaae;
}
QPushButton#subTabActive {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid #dcdde0;
    border-radius: 0;
    color: #dcdde0;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 12px;
}

/* Input locked state */
QPushButton#completedBtn {
    background-color: transparent;
    color: #3fb950;
    border: 1px solid rgba(63, 185, 80, 0.45);
    border-radius: 6px;
    padding: 5px 11px;
    font-weight: 600;
}
QPushButton#completedBtn:hover {
    background-color: rgba(63, 185, 80, 0.12);
    border-color: #3fb950;
}

QLabel#fieldLabel {
    color: #dcdde0;
    font-size: 10px;
    font-weight: 700;
}

/* Primary-text labels: brighter than the QLabel default (dim) but still
   retinted correctly for light mode via the _DARK_TO_LIGHT mapping. */
QLabel#primaryLabel {
    color: #dcdde0;
    font-size: 13px;
    font-weight: 600;
}
QLabel#primaryLabelSm {
    color: #dcdde0;
    font-size: 12px;
    font-weight: 600;
}
QLabel#primaryLabelBold {
    color: #dcdde0;
    font-size: 13px;
    font-weight: 700;
}
QCheckBox#primaryCheck {
    color: #dcdde0;
    font-size: 11px;
    font-weight: 600;
}

/* Modo Asistido (IA) */
QFrame#assistedBox {
    background-color: transparent;
    border: none;
    padding: 0;
}
QLineEdit#assistInput {
    background-color: #1a1a1e;
    border: 1px solid #33333e;
    border-radius: 4px;
    color: #dcdde0;
    font-size: 11px;
    padding: 6px 8px;
}
QLineEdit#assistInput:focus {
    border-color: #7c5af0;
}
QFrame#lockedBanner {
    background-color: #26262e;
    border: 1px solid #44444e;
    border-radius: 6px;
}

QPushButton#secondaryActionBtn {
    background-color: transparent;
    color: #aaaaae;
    border: 1px solid #44444e;
    border-radius: 6px;
    padding: 5px 11px;
    font-weight: 500;
}
QPushButton#secondaryActionBtn:hover {
    background-color: #2e2e36;
    color: #dcdde0;
    border-color: #505060;
}
QPushButton#secondaryActionBtn:disabled {
    color: #585868;
    border-color: #33333e;
}

QPushButton#assistActionBtn {
    background-color: #252534;
    border: 1px solid #4848a0;
    border-radius: 5px;
    color: #a5b4fc;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 14px;
}
QPushButton#assistActionBtn:hover {
    background-color: #303048;
    border-color: #6366f1;
    color: #ffffff;
}
QFrame#assistResultCard {
    background-color: #20202a;
    border: 1px solid #383855;
    border-radius: 5px;
    padding: 8px 10px;
}

/* Detector Script Cards */
QFrame#scriptCard {
    background-color: #202024;
    border: 1px solid #33333e;
    border-radius: 6px;
    padding: 2px;
}
QFrame#scriptCard:hover {
    border-color: #383844;
}
QFrame#scriptDetailsFrame {
    background-color: #1e1e22;
    border: 1px solid #2e2e38;
    border-radius: 4px;
    padding: 6px;
}

/* 3ra Barra de Navegación (Secciones de Input) */
QWidget#sectionNavBar {
    background-color: #202024;
    border-bottom: 1px solid #33333e;
    border-radius: 4px;
    padding: 2px 4px;
}
QPushButton#sectionNavBtn {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: #888895;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 12px;
}
QPushButton#sectionNavBtn:hover {
    color: #dcdde0;
}
QPushButton#sectionNavBtnActive {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid #dcdde0;
    border-radius: 0;
    color: #dcdde0;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 12px;
}
QPushButton#sectionNavBtnLocked {
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: #585868;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 12px;
}

/* Tarjetas de validación de compuerta */
QFrame#validationCardPass {
    background-color: #1a2e1c;
    border: 1px solid rgba(63, 185, 80, 0.4);
    border-left: 3px solid #3fb950;
    border-radius: 5px;
    padding: 8px 10px;
}
QFrame#validationCardFail {
    background-color: #2e1a1c;
    border: 1px solid rgba(242, 85, 90, 0.4);
    border-left: 3px solid #f2555a;
    border-radius: 5px;
    padding: 8px 10px;
}

/* Riel de iconos vertical -- anclado al borde izquierdo de la ventana, fuera
   del splitter, para que nunca se mueva al redimensionar los paneles.
   El fondo es un tono más oscuro que el sidebar para que se diferencie
   visualmente, igual que en Obsidian. */
QWidget#iconRail {
    background-color: #14141a;
    border-right: 1px solid #33333e;
}
QPushButton#railIconBtn {
    background-color: transparent;
    border: none;
    border-radius: 6px;
    color: #666672;
    font-size: 15px;
}
QPushButton#railIconBtn:hover {
    background-color: #2e2e36;
    color: #dcdde0;
}
QPushButton#railIconBtnActive {
    background-color: rgba(124, 90, 240, 0.16);
    border: none;
    border-radius: 6px;
    color: #7c5af0;
    font-size: 15px;
}

/* Selector de proyecto, estilo "cambiar de vault" de Obsidian */
QPushButton#vaultSwitcherBar {
    background-color: #14141a;
    border: 1px solid #33333e;
    border-radius: 6px;
    text-align: left;
}
QPushButton#vaultSwitcherBar:hover {
    background-color: #2e2e36;
    border-color: #44444e;
}
QLabel#vaultName {
    color: #dcdde0;
    font-size: 12px;
    font-weight: 600;
    background: transparent;
}
QLabel#vaultChevron {
    color: #666672;
    font-size: 12px;
    background: transparent;
}
QFrame#vaultPopup {
    background-color: #26262e;
    border: 1px solid #44444e;
    border-radius: 8px;
}
QPushButton#vaultPopupRow {
    background-color: transparent;
    border: none;
    border-radius: 5px;
    color: #dcdde0;
    font-size: 12px;
    text-align: left;
    padding: 7px 10px;
}
QPushButton#vaultPopupRow:hover {
    background-color: #2e2e36;
}
QFrame#vaultPopupDivider {
    background-color: #44444e;
    border: none;
    margin: 4px 2px;
}

/* Barra de actividad ("qué está haciendo el agente ahora") */
QFrame#activityBar {
    background-color: #1a2232;
    border: 1px solid rgba(124, 90, 240, 0.35);
    border-radius: 6px;
}
QLabel#activityDot {
    color: #7c5af0;
    font-size: 11px;
}
QLabel#activityLabel {
    color: #dcdde0;
    font-size: 11px;
    font-weight: 600;
}

/* Substep section labels */
QLabel#substepCardLabel {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 2px 0;
}

QTextBrowser#specView, QTextBrowser#outputView {
    background-color: transparent;
    border: none;
    font-family: 'Segoe UI Variable Text', 'Segoe UI', sans-serif;
    font-size: 12px;
}

/* TOC side panel (right of guide content) */
QFrame#tocPanel {
    background-color: transparent;
    border: none;
    border-left: 1px solid #33333e;
    padding-left: 8px;
}
QPushButton#tocBtn {
    background-color: transparent;
    color: #888895;
    border: none;
    border-radius: 3px;
    text-align: left;
    padding: 3px 6px;
    font-size: 11px;
}
QPushButton#tocBtn:hover {
    background-color: rgba(124, 90, 240, 0.12);
    color: #c4b0ff;
}
QPushButton#tocBtn:pressed {
    background-color: rgba(124, 90, 240, 0.22);
}

/* Small chip-style buttons (quick actions) */
QPushButton#chipBtn {
    background-color: transparent;
    color: #888895;
    border: 1px solid #44444e;
    border-radius: 12px;
    padding: 4px 12px;
    font-size: 11px;
}
QPushButton#chipBtn:hover {
    background-color: #2e2e36;
    color: #dcdde0;
    border-color: #505060;
}

/* Circular send button */
QPushButton#sendBtn {
    background-color: #dcdde0;
    color: #1a1a1e;
    border: none;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 700;
    padding: 0;
}
QPushButton#sendBtn:hover {
    background-color: #ffffff;
}
QPushButton#sendBtn:disabled {
    background-color: #44444e;
    color: #666672;
}

/* ---------- Inputs ---------- */
QTextEdit, QPlainTextEdit, QLineEdit {
    background-color: #202024;
    color: #dcdde0;
    border: 1px solid #33333e;
    border-radius: 6px;
    padding: 7px;
    selection-background-color: rgba(124, 90, 240, 0.30);
    selection-color: #ffffff;
    font-family: 'Cascadia Mono', Consolas, monospace;
    font-size: 12px;
}
QTextEdit:focus, QPlainTextEdit:focus, QLineEdit:focus {
    border-color: #505060;
}

/* Borderless editor inside a framed composer */
QPlainTextEdit#composerInput, QTextEdit#composerInput {
    background-color: transparent;
    border: none;
    padding: 2px;
    font-family: 'Segoe UI Variable Text', 'Segoe UI', sans-serif;
}

/* Main document surface: flat, no frame */
QPlainTextEdit#documentEditor {
    background-color: transparent;
    border: none;
    padding: 4px 0;
    font-size: 12px;
    line-height: 150%;
}

/* ---------- Panels ---------- */
QWidget#sidebarPanel {
    background-color: #202024;
    border: none;
    border-right: 1px solid #33333e;
}
QWidget#chatPanel {
    background-color: #202024;
    border: none;
    border-left: 1px solid #33333e;
}
QWidget#centerPanel {
    background-color: #1a1a1e;
}
QWidget#card {
    background-color: #26262e;
    border: 1px solid #33333e;
    border-radius: 6px;
}
QWidget#composerBox {
    background-color: #202024;
    border: 1px solid #44444e;
    border-radius: 10px;
}

/* ---------- Tree Navigator ---------- */
QTreeWidget {
    background-color: transparent;
    border: none;
    outline: none;
    font-size: 12px;
}
QTreeWidget::item {
    padding: 4px 6px;
    border-radius: 4px;
    color: #888895;
}
QTreeWidget::item:hover {
    background-color: #26262e;
    color: #dcdde0;
}
QTreeWidget::item:selected {
    background-color: #2e2e36;
    color: #dcdde0;
}
QTreeWidget::branch {
    background: transparent;
}

QListWidget {
    background-color: #202024;
    border: 1px solid #33333e;
    border-radius: 6px;
    outline: none;
    padding: 4px;
}
QListWidget::item {
    border-radius: 4px;
    padding: 2px;
}
QListWidget::item:hover {
    background-color: #26262e;
}

/* ---------- ScrollBars (hidden by default — content is linear) ---------- */
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 0;
    margin: 0;
}
QScrollBar::handle:vertical {
    background: transparent;
    min-height: 0;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical,
QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {
    height: 0;
    background: none;
    border: none;
}
QScrollBar:horizontal {
    border: none;
    background: transparent;
    height: 0;
}
QScrollBar::handle:horizontal {
    background: transparent;
    min-width: 0;
}
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {
    width: 0;
    background: none;
}

/* ---------- ComboBox ---------- */
QComboBox {
    background-color: transparent;
    color: #888895;
    border: 1px solid #44444e;
    border-radius: 6px;
    padding: 4px 9px;
    font-size: 11px;
}
QComboBox:hover {
    background-color: #2e2e36;
    color: #dcdde0;
}
QComboBox::drop-down {
    border: none;
    width: 14px;
}
QComboBox::down-arrow {
    image: none;
}
QComboBox QAbstractItemView {
    background-color: #26262e;
    color: #dcdde0;
    border: 1px solid #44444e;
    border-radius: 6px;
    padding: 3px;
    selection-background-color: #2e2e36;
    outline: none;
}

/* Borderless combo used inside the composer bar */
QComboBox#inlineCombo {
    border: 1px solid transparent;
    color: #666672;
    padding: 2px 6px;
}
QComboBox#inlineCombo:hover {
    background-color: #2e2e36;
    color: #dcdde0;
}

/* ---------- Progress ---------- */
QProgressBar {
    height: 3px;
    border: none;
    background-color: #33333e;
    border-radius: 2px;
    text-align: center;
}
QProgressBar::chunk {
    background-color: #7c5af0;
    border-radius: 2px;
}

/* ---------- Status Bar ---------- */
QStatusBar {
    background-color: #14141a;
    border-top: 1px solid #33333e;
    color: #666672;
    font-size: 10px;
}
QStatusBar::item {
    border: none;
}

/* ---------- Checkboxes / GroupBox ---------- */
QCheckBox {
    color: #888895;
    spacing: 7px;
    font-size: 12px;
}
QCheckBox::indicator {
    width: 13px;
    height: 13px;
    border: 1px solid #44444e;
    border-radius: 3px;
    background-color: #202024;
}
QCheckBox::indicator:checked {
    background-color: #7c5af0;
    border-color: #7c5af0;
}
QGroupBox {
    border: 1px solid #33333e;
    border-radius: 6px;
    margin-top: 9px;
    padding-top: 9px;
    color: #888895;
    font-size: 11px;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 9px;
    padding: 0 4px;
    color: #666672;
}

QMessageBox, QProgressDialog {
    background-color: #202024;
}
"""

# ---------------------------------------------------------------------------
# Light theme -- auto-generated from DARK_THEME_QSS by swapping every hex
# for its warm-cream light-mode counterpart.
# ---------------------------------------------------------------------------
import re as _re

_DARK_TO_LIGHT = {
    # Backgrounds -- darkest to lightest in the dark theme
    "#14141a": "#f0e8d8",    # icon rail (darkest strip)
    "#1a1a1e": "#f5efe4",    # main background
    "#1e1e22": "#f0e8d8",    # variant
    "#202024": "#efe7d8",    # panel bg
    "#222228": "#eee5d5",    # slightly elevated
    "#20202a": "#ece2d0",    # elevated dark
    "#1a2232": "#e2ecf8",    # blue-tinted (theory card / activity bar)
    "#1a2e1c": "#e3f0e0",    # green-tinted (pass)
    "#2e1a1c": "#f8e2df",    # red-tinted (fail)
    "#281e0e": "#f7ecd8",    # amber-tinted (example card)
    "#26262e": "#e7dcc6",    # elevated
    "#252534": "#e2d9f2",    # indigo-tinted btn base
    "#2e2e36": "#dfd2b8",    # hover
    "#2e2e38": "#dfd2b8",    # variant
    "#303048": "#d6c9ef",    # indigo btn hover
    "#303038": "#d9cdb5",    # variant
    # Borders
    "#33333e": "#d7c8ab",    # subtle border
    "#44444e": "#c4b291",    # strong border
    "#383844": "#c4b291",    # variant
    "#505060": "#b3a081",    # focus border
    "#4848a0": "#8f7fd8",    # indigo border
    "#383855": "#c9bce8",    # indigo card border
    "#585868": "#a99c81",    # disabled
    # Text
    "#dcdde0": "#2b2620",    # primary text
    "#aaaaae": "#463f33",    # secondary text
    "#888895": "#655c4c",    # dim text
    "#666672": "#8a7f6a",    # faint text
    # Accents and semantic colors
    "#7c5af0": "#5548d6",    # purple accent → indigo (legible on cream)
    "#a5b4fc": "#4c3fb0",    # light purple text
    "#6366f1": "#5548d6",    # indigo
    "#3fb950": "#2f8f3e",    # success green
    "#e0a13a": "#a66f12",    # warning amber
    "#f2555a": "#c1393e",    # danger red
    "#ffffff": "#171310",    # extreme hover (darkest extreme on light)
}

_HEX_RE = _re.compile(r"#[0-9a-fA-F]{6}\b")


def _retint(qss: str, mapping: dict) -> str:
    return _HEX_RE.sub(lambda m: mapping.get(m.group(0).lower(), m.group(0)), qss)


LIGHT_THEME_QSS = _retint(DARK_THEME_QSS, _DARK_TO_LIGHT)

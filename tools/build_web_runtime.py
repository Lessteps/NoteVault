"""
Build the WEB module runtime folder next to NoteVault.exe.

    python tools/build_web_runtime.py

Runs PyInstaller on web_runtime.spec (a onedir bundle whose only job is to
collect QtWebEngine), copies the result to ``./web_runtime``, drops what a
widgets browser never uses (debug paks, most locales, QML modules) and
stamps the PySide6 version, which core/web_runtime.py checks at load time.

Only needed again when PySide6 is upgraded; NoteVault.exe rebuilds do not
touch it. Then verify with:  NoteVault.exe --web-selftest=result.json
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "web_runtime"
TARGET = ROOT / "web_runtime"
KEEP_LOCALES = {"en-US.pak", "es.pak", "es-419.pak"}


def _size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def trim(qt: Path):
    res = qt / "resources"
    for f in list(res.glob("*.debug.pak")) + list(res.glob("*.debug.bin")):
        f.unlink()
    loc = qt / "translations" / "qtwebengine_locales"
    if loc.exists():
        for f in loc.iterdir():
            if f.name not in KEEP_LOCALES:
                f.unlink()
    tr = qt / "translations"
    for f in tr.glob("*.qm"):
        if not f.name.startswith(("qt_es", "qtbase_es", "qtwebengine_es")):
            f.unlink()
    shutil.rmtree(qt / "qml", ignore_errors=True)


def main() -> int:
    import PySide6
    subprocess.run([sys.executable, "-m", "PyInstaller", "web_runtime.spec", "--noconfirm"],
                   cwd=ROOT, check=True)
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(DIST, TARGET)
    before = _size(TARGET)
    trim(TARGET / "_internal" / "PySide6")
    (TARGET / "VERSION").write_text(PySide6.__version__, encoding="utf-8")
    print(f"web_runtime listo: {TARGET}  ({before // 2**20} MB -> {_size(TARGET) // 2**20} MB), "
          f"PySide6 {PySide6.__version__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

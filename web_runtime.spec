# -*- mode: python ; coding: utf-8 -*-
# Builds the WEB module runtime (QtWebEngine / Chromium) as a separate onedir
# bundle, so NoteVault.exe stays small and starts fast. Rebuild only when the
# PySide6 version changes:  python tools/build_web_runtime.py
a = Analysis(
    ['tools/web_runtime_entry.py'],
    hiddenimports=['PySide6.QtWebEngineCore', 'PySide6.QtWebEngineWidgets',
                   'PySide6.QtWebChannel', 'PySide6.QtPositioning',
                   'PySide6.QtNetwork', 'PySide6.QtPrintSupport'],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='web_runtime_probe',
          console=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='web_runtime')

# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

_pyside6 = Path(sys.exec_prefix) / 'Lib' / 'site-packages' / 'PySide6'
_mm_plugins = str(_pyside6 / 'plugins' / 'multimedia')

_extra_binaries = []
for dll_name in [
    'avcodec-61.dll', 'avformat-61.dll', 'avutil-59.dll',
    'swresample-5.dll', 'swscale-8.dll',
    'Qt6Multimedia.dll', 'Qt6MultimediaWidgets.dll'
]:
    dll_path = _pyside6 / dll_name
    if dll_path.exists():
        _extra_binaries.append((str(dll_path), '.'))

_mm_dir = _pyside6 / 'plugins' / 'multimedia'
if _mm_dir.exists():
    for f in _mm_dir.glob('*.dll'):
        _extra_binaries.append((str(f), 'PySide6/plugins/multimedia'))
        _extra_binaries.append((str(f), 'plugins/multimedia'))

a = Analysis(
    ['app_entry.py'],
    pathex=[],
    binaries=_extra_binaries,
    datas=[
        (_mm_plugins, 'PySide6/plugins/multimedia'),
        (_mm_plugins, 'plugins/multimedia'),
        ('assets', 'assets'),
    ],
    hiddenimports=[
        'PySide6.QtMultimedia',
        'PySide6.QtMultimediaWidgets',
        'PySide6.QtOpenGLWidgets',
        'watchdog.observers',
        'watchdog.observers.polling',
    ] + collect_submodules('notevault_app'),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # QtWebEngine is NOT bundled: it lives in ./web_runtime (tools/build_web_runtime.py)
    # and core/web_runtime.py loads it the first time the WEB module opens.
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas',
              'PySide6.QtWebEngineCore', 'PySide6.QtWebEngineWidgets',
              'PySide6.QtWebEngineQuick', 'PySide6.QtWebChannel'],
    noarchive=False,
    optimize=1,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='NoteVault',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/notevault.ico',
)

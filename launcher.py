"""
Thin launcher — compiled to NoteVault.exe once.
Finds Python and starts run_app.py from the project directory.
Never needs recompilation when source code changes.
"""
import subprocess
import sys
import os
from pathlib import Path

project_dir = Path(sys.executable).resolve().parent

python_candidates = []

venv_pythonw = project_dir / ".venv" / "Scripts" / "pythonw.exe"
venv_python  = project_dir / ".venv" / "Scripts" / "python.exe"
if venv_pythonw.exists():
    python_candidates.append(str(venv_pythonw))
if venv_python.exists():
    python_candidates.append(str(venv_python))

for name in ("pythonw", "python"):
    import shutil
    found = shutil.which(name)
    if found:
        python_candidates.append(found)

if not python_candidates:
    import ctypes
    ctypes.windll.user32.MessageBoxW(
        0,
        "No se encontró Python en este equipo.\n"
        "Instala Python desde https://python.org",
        "NoteVault — Error",
        0x10,
    )
    sys.exit(1)

def _clean_child_env() -> dict:
    env = os.environ.copy()
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        path_parts = [p for p in env.get("PATH", "").split(os.pathsep) if p and p != meipass]
        env["PATH"] = os.pathsep.join(path_parts)
    for var in ("_MEIPASS2", "PYTHONHOME", "PYTHONPATH"):
        env.pop(var, None)
    return env


python_exe = python_candidates[0]
subprocess.Popen(
    [python_exe, str(project_dir / "run_app.py")],
    cwd=str(project_dir),
    env=_clean_child_env(),
)

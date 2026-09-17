"""
NoteVault Code Runner Sandbox
Executes code snippets locally in isolated subprocesses with timeouts and output capture.
"""

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


def run_code(code: str, language: str = "python", timeout_seconds: int = 5) -> dict[str, Any]:
    """
    Execute code snippet in a sandbox subprocess.
    Returns:
      {
        "success": bool,
        "stdout": str,
        "stderr": str,
        "exit_code": int,
        "execution_time_ms": float,
        "timed_out": bool,
      }
    """
    lang = language.lower().strip()
    if lang not in ("python", "py", "javascript", "js", "node"):
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Lenguaje no soportado para ejecución directa: {language}",
            "exit_code": -1,
            "execution_time_ms": 0.0,
            "timed_out": False,
        }

    suffix = ".py" if lang in ("python", "py") else ".js"
    cmd_binary = sys.executable if lang in ("python", "py") else "node"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode="w", encoding="utf-8") as tmp:
        tmp.write(code)
        tmp_path = Path(tmp.name)

    start_time = time.perf_counter()
    try:
        proc = subprocess.run(
            [cmd_binary, str(tmp_path)],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        elapsed = (time.perf_counter() - start_time) * 1000.0
        return {
            "success": proc.returncode == 0,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "exit_code": proc.returncode,
            "execution_time_ms": round(elapsed, 2),
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        elapsed = (time.perf_counter() - start_time) * 1000.0
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Tiempo de ejecución excedido ({timeout_seconds}s limit)",
            "exit_code": -1,
            "execution_time_ms": round(elapsed, 2),
            "timed_out": True,
        }
    except Exception as e:
        elapsed = (time.perf_counter() - start_time) * 1000.0
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "exit_code": -1,
            "execution_time_ms": round(elapsed, 2),
            "timed_out": False,
        }
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass

"""
NoteVault — iniciar aplicación
Uso: python run_app.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notevault_app.main import run

if __name__ == "__main__":
    run()

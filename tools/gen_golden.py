"""
Generate byte-exact golden files for the TypeScript core migration.
Executes test_vault_format.py to generate standard conformance fixtures,
adds canvas and frontmatter fixtures, and mirrors them into
frontend/src/core/__golden__/.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

GOLDEN = ROOT / "frontend" / "src" / "core" / "__golden__"
CONFORMANCE = ROOT / "tests" / "conformance"

from notevault_app.core.canvas_format import CanvasDoc, CanvasNode, CanvasEdge
from notevault_app.core.frontmatter_utils import update_frontmatter
from notevault_app.core import store


def gen_canvas():
    target = GOLDEN / "canvas"
    target.mkdir(parents=True, exist_ok=True)
    doc = CanvasDoc(
        nodes=[
            CanvasNode(id="node_1", type="text", x=100, y=100, width=200, height=100, color="1", text="Nodo de texto"),
            CanvasNode(id="node_2", type="file", x=400, y=100, width=250, height=150, file="Notas/Idea.md"),
        ],
        edges=[
            CanvasEdge(id="edge_1", fromNode="node_1", toNode="node_2", fromSide="right", toSide="left", label="conecta con")
        ]
    )
    out_file = target / "test.canvas"
    store.write_json(out_file, doc.to_dict())


def gen_frontmatter():
    target = GOLDEN / "frontmatter"
    target.mkdir(parents=True, exist_ok=True)
    sample = (
        "---\n"
        "title: Nota de prueba\n"
        "status: draft\n"
        "tags:\n"
        "  - math\n"
        "  - algebra\n"
        "---\n\n"
        "# Encabezado\n"
        "Cuerpo de la nota.\n"
    )
    updated = update_frontmatter(sample, {"status": "reviewed", "difficulty": 3})
    (target / "sample_updated.md").write_text(updated, encoding="utf-8", newline="\n")


def main():
    print("1. Running test_vault_format.py --write...")
    subprocess.run([sys.executable, str(ROOT / "tests" / "test_vault_format.py"), "--write"], check=True)

    if GOLDEN.exists():
        shutil.rmtree(GOLDEN, ignore_errors=True)
    GOLDEN.mkdir(parents=True, exist_ok=True)

    print("2. Copying conformance fixtures to __golden__...")
    if CONFORMANCE.exists():
        for item in CONFORMANCE.iterdir():
            dest = GOLDEN / item.name
            if item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dest)

    print("3. Generating canvas golden fixture...")
    gen_canvas()

    print("4. Generating frontmatter golden fixture...")
    gen_frontmatter()

    print(f"All golden files successfully generated at: {GOLDEN}")


if __name__ == "__main__":
    main()

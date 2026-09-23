import pytest
from pathlib import Path
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QRectF

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas.view import CanvasView
from notevault_app.ui.components.notes.canvas.outline import CanvasOutlineWidget, OutlineTreeItem


@pytest.fixture
def app():
    inst = QApplication.instance()
    if inst is None:
        inst = QApplication([])
    return inst


def test_outline_widget_init(app, tmp_path):
    view = CanvasView()
    assert hasattr(view, "_outline")
    assert isinstance(view._outline, CanvasOutlineWidget)
    assert not view._outline._is_expanded


def test_outline_expand_collapse(app):
    view = CanvasView()
    outline = view._outline
    outline.expand()
    assert outline._is_expanded
    assert outline.width() == CanvasOutlineWidget.EXPANDED_WIDTH

    outline.collapse()
    assert not outline._is_expanded
    assert outline.width() == CanvasOutlineWidget.COLLAPSED_WIDTH


def test_outline_hierarchical_groups(app, tmp_path):
    # Create doc with nested groups (Outer Step 1 contains Sub-step 1.1 which contains 1.1.1)
    g1 = cf.CanvasNode(
        id="g_step1", type="group", x=0, y=0, width=1000, height=800,
        label="Step 1 — Problem Statement", nv={"zIndex": -10}
    )
    g2 = cf.CanvasNode(
        id="g_sub1_1", type="group", x=50, y=50, width=400, height=300,
        label="Step 1.1 — Lexical Extraction", nv={"zIndex": -5}
    )
    g3 = cf.CanvasNode(
        id="g_1_1_1", type="group", x=80, y=80, width=200, height=150,
        label="1.1.1 — Segmentation", nv={"zIndex": -2}
    )
    doc = cf.CanvasDoc(nodes=[g1, g2, g3])
    canvas_file = tmp_path / "test_nested.canvas"
    cf.dump(canvas_file, doc)

    view = CanvasView()
    view.load(canvas_file)

    tree = view._outline._tree
    assert tree.topLevelItemCount() == 1
    root = tree.topLevelItem(0)
    assert root.text(0) == "Step 1 — Problem Statement"
    assert root.childCount() == 1

    child = root.child(0)
    assert child.text(0) == "Step 1.1 — Lexical Extraction"
    assert child.childCount() == 1

    grandchild = child.child(0)
    assert grandchild.text(0) == "1.1.1 — Segmentation"


def test_outline_click_focus(app, tmp_path):
    g1 = cf.CanvasNode(
        id="g1", type="group", x=100, y=200, width=300, height=200, label="Test Group"
    )
    doc = cf.CanvasDoc(nodes=[g1])
    canvas_file = tmp_path / "test_click.canvas"
    cf.dump(canvas_file, doc)

    view = CanvasView()
    view.load(canvas_file)

    tree = view._outline._tree
    item = tree.topLevelItem(0)
    assert item is not None

    # Simulate item click
    view._outline._on_item_clicked(item, 0)
    # View should focus on item target
    center = view.mapToScene(view.viewport().rect().center())
    # Should be close to target center (x=250, y=300)
    assert abs(center.x() - 250) < 50
    assert abs(center.y() - 300) < 50

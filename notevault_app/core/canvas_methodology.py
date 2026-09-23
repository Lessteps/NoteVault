"""Replicate a methodology sub-step as a canvas block — deterministically.

The FULLSTACK methodology draws each sub-step (e.g. ``1.1.1``, ``1.1.2``) as a
standard block on the board:

    [## code — title / objective] --right--> [operation]              --right--> [Artifact Table]
                                  --right--> [Partial output: ...]    --right--┘

and sub-steps chain horizontally to the right:
    [Table 1.1.1] --right--> [## 1.1.2 ...] --right--> [Table 1.1.2] ...

Getting the coordinates and connections right by hand is error-prone, so this
module deterministically computes positions and edges.

See ``docs/SKILL_CANVAS_STEP_REPLICATION.md``.
"""
from __future__ import annotations

from pathlib import Path

from . import canvas_format as cf

SUB_W, SUB_H = 324.0, 180.0
GAP_BETWEEN_BLOCKS = 55.0
GAP_SUB_TO_CARDS = 41.0
GAP_CARDS_TO_TABLE = 40.0


def add_substep_block(
    canvas_path,
    anchor_id: str | None,
    code: str,
    title: str,
    objective: str,
    operation: str,
    partial_output: str,
    table_markdown: str = "",
    table_width: float = 780.0,
    table_height: float = 480.0,
    layout: str = "auto",
) -> dict:
    """Append one sub-step block to an existing ``.canvas`` and save it.

    - ``anchor_id``: id of the node the block attaches to (the previous
      sub-step table/node, or the "Raw Data" node). ``None`` places near origin.
    - ``code``: e.g. ``"1.1.2"``.
    - ``title``: sub-step name.
    - ``objective``: sub-step objective text.
    - ``operation``: procedure text.
    - ``partial_output``: artifact summary line (e.g. ``"Role Assignment Table (Unit | Question | Role)"``).
    - ``table_markdown``: markdown content of the artifact table. If provided,
      the artifact table card is created and connected.
    - ``layout``: ``"horizontal"`` (chains to the right, standard for methodology),
      ``"vertical"`` (stacks underneath), or ``"auto"`` (horizontal if table provided, vertical otherwise).

    Returns dict with keys: ``"substep_id"``, ``"operation_id"``, ``"output_id"``,
    and optional ``"table_id"``.
    """
    path = Path(canvas_path)
    doc = cf.load(path)

    anchor = doc.node_by_id(anchor_id) if anchor_id else None

    # Determine layout mode
    is_horizontal = (layout == "horizontal") or (layout == "auto" and bool(table_markdown))

    card_w = 270.0
    op_h = 120.0
    out_h = 110.0

    if is_horizontal:
        if anchor is not None:
            base_x = anchor.x + anchor.width + GAP_BETWEEN_BLOCKS
            # Center vertically around anchor's center or default baseline (-50)
            baseline_y = anchor.y + (anchor.height / 2.0)
        else:
            base_x, baseline_y = 0.0, -50.0

        sub_y = baseline_y - (SUB_H / 2.0)

        sub = cf.CanvasNode(
            id=cf.new_id(), type="text", x=base_x, y=sub_y, width=SUB_W, height=SUB_H,
            text=f"## {code} — {title}\n{objective.strip()}"
        )

        op_x = base_x + SUB_W + GAP_SUB_TO_CARDS
        op_y = baseline_y - op_h - 10.0
        op = cf.CanvasNode(
            id=cf.new_id(), type="text", x=op_x, y=op_y, width=card_w, height=op_h,
            text=operation.strip()
        )

        out_x = op_x
        out_y = baseline_y + 10.0
        out = cf.CanvasNode(
            id=cf.new_id(), type="text", x=out_x, y=out_y, width=card_w + 20.0, height=out_h,
            text=f"Partial output: {partial_output.strip()}"
        )

        doc.nodes.extend([sub, op, out])

        if anchor is not None:
            doc.edges.append(cf.CanvasEdge(
                id=cf.new_id(), fromNode=anchor.id, toNode=sub.id,
                fromSide="right", toSide="left"
            ))

        doc.edges.append(cf.CanvasEdge(
            id=cf.new_id(), fromNode=sub.id, toNode=op.id,
            fromSide="right", toSide="left"
        ))
        doc.edges.append(cf.CanvasEdge(
            id=cf.new_id(), fromNode=sub.id, toNode=out.id,
            fromSide="right", toSide="left"
        ))

        table_node = None
        if table_markdown:
            table_x = op_x + (card_w + 20.0) + GAP_CARDS_TO_TABLE
            table_y = baseline_y - (table_height / 2.0)
            table_node = cf.CanvasNode(
                id=cf.new_id(), type="text",
                x=table_x, y=table_y, width=table_width, height=table_height,
                text=table_markdown.strip()
            )
            doc.nodes.append(table_node)
            doc.edges.append(cf.CanvasEdge(
                id=cf.new_id(), fromNode=op.id, toNode=table_node.id,
                fromSide="right", toSide="left"
            ))
            doc.edges.append(cf.CanvasEdge(
                id=cf.new_id(), fromNode=out.id, toNode=table_node.id,
                fromSide="right", toSide="left"
            ))

        cf.dump(path, doc)
        res = {"substep_id": sub.id, "operation_id": op.id, "output_id": out.id}
        if table_node:
            res["table_id"] = table_node.id
        return res

    else:
        # Legacy vertical layout
        gap_down = 80.0
        gap_right = 60.0
        if anchor is not None:
            base_x = anchor.x
            base_y = anchor.y + anchor.height + gap_down
        else:
            base_x, base_y = 0.0, 0.0

        sub = cf.CanvasNode(
            id=cf.new_id(), type="text", x=base_x, y=base_y, width=SUB_W, height=SUB_H,
            text=f"## {code} — {title}\n{objective.strip()}"
        )
        op = cf.CanvasNode(
            id=cf.new_id(), type="text",
            x=base_x + SUB_W + gap_right, y=base_y - 20, width=card_w, height=op_h,
            text=operation.strip()
        )
        out = cf.CanvasNode(
            id=cf.new_id(), type="text",
            x=base_x + SUB_W + gap_right, y=base_y + SUB_H - op_h + 20,
            width=card_w + 20, height=out_h,
            text=f"Partial output: {partial_output.strip()}"
        )

        doc.nodes.extend([sub, op, out])
        if anchor is not None:
            doc.edges.append(cf.CanvasEdge(
                id=cf.new_id(), fromNode=anchor.id, toNode=sub.id,
                fromSide="bottom", toSide="top"
            ))
        doc.edges.append(cf.CanvasEdge(
            id=cf.new_id(), fromNode=sub.id, toNode=op.id,
            fromSide="right", toSide="left"
        ))
        doc.edges.append(cf.CanvasEdge(
            id=cf.new_id(), fromNode=sub.id, toNode=out.id,
            fromSide="right", toSide="left"
        ))

        cf.dump(path, doc)
        return {"substep_id": sub.id, "operation_id": op.id, "output_id": out.id}


def add_substeps(canvas_path, anchor_id: str | None, substeps: list[dict], layout: str = "auto") -> list[dict]:
    """Chain several sub-steps in one call.

    Each dict accepts:
      ``code``, ``title``, ``objective``, ``operation``, ``partial_output``,
      and optional ``table_markdown``, ``table_width``, ``table_height``.

    Automatically chains from the previous sub-step's table (or sub-step node).
    """
    results = []
    cur = anchor_id
    for s in substeps:
        r = add_substep_block(
            canvas_path=canvas_path,
            anchor_id=cur,
            code=s["code"],
            title=s["title"],
            objective=s["objective"],
            operation=s["operation"],
            partial_output=s["partial_output"],
            table_markdown=s.get("table_markdown", ""),
            table_width=s.get("table_width", 780.0),
            table_height=s.get("table_height", 480.0),
            layout=layout,
        )
        results.append(r)
        # Next sub-step connects to the table if present, else to the substep node
        cur = r.get("table_id") or r["substep_id"]
    return results


# ── Micro-step blocks (current standard, 2026-09-23) ─────────────────────────
#
#   ┌ group "N.M.K — Title" ─────────────────────────────────────────────────┐
#   │ [## N.M.K — Title / objective] ─how to execute→ [How-to note]           │
#   │                                 ─produces (example)→ [Example output]   │
#   └─────────────────────────────────────────────────────────────────────────┘
#   previous example ──"<what flows>"──▶ next header
#
# The How-to note is mandatory and always has four sections (see
# ``howto_note``): how to do it, how to build the table, restrictions, done
# when. The old "operation + Partial output" pair is legacy: it said WHAT to
# produce but not HOW, which is where executions failed.

MICRO_HEADER_W = 324.0
MICRO_HOWTO_W = 440.0
MICRO_EXAMPLE_W = 620.0
MICRO_GAP = 130.0          # inside a micro-step: leaves room for edge labels
MICRO_CHAIN_GAP = 270.0    # between micro-steps: room for the link label
MICRO_PAD_L, MICRO_PAD_T, MICRO_PAD_R, MICRO_PAD_B = 16.0, 44.0, 16.0, 24.0


def howto_note(steps: list, table_columns: str, table_rules: str,
               restrictions: list, done_when: str) -> str:
    """The How-to note in its fixed format.

    ``steps``: numbered procedure, one operation per item.
    ``table_columns``: e.g. ``"Unit | Question Satisfied | Assigned Role"``.
    ``table_rules``: one row per what, how cells are filled.
    ``restrictions``: rules to respect (cite R1–R6 / C1–C5 where they apply).
    ``done_when``: the verifiable condition that closes the micro-step.
    """
    lines = ["### How to do it"]
    lines += [f"{i}. {s}" for i, s in enumerate(steps, 1)]
    lines += ["", "### How to build the table",
              f"Columns `{table_columns}`. {table_rules}".strip(), "", "### Restrictions"]
    lines += [f"- {r}" for r in restrictions]
    lines += ["", "### Done when", done_when]
    return "\n".join(lines)


def estimate_height(markdown: str, width: float) -> float:
    """Rough rendered height of a text card (no Qt in core). The app keeps
    the size; open the canvas and resize if a card looks too tall/short."""
    chars_per_line = max(20, int((width - 28) / 6.6))
    h = 28.0
    for line in markdown.splitlines():
        s = line.strip()
        if not s:
            h += 10
        elif s.startswith("#"):
            h += 30
        elif s.startswith("|"):
            cells = [c for c in s.strip("|").split("|")]
            longest = max((len(c.strip()) for c in cells), default=0)
            col_w = max(40.0, (width - 28) / max(1, len(cells)))
            h += 24 * max(1, -(-longest * 6.6 // col_w))
        else:
            h += 20 * max(1, -(-len(s) // chars_per_line))
    return max(90.0, h)


def _group_of(doc, node):
    best = None
    cx, cy = node.x + node.width / 2, node.y + node.height / 2
    for g in doc.nodes:
        if g.type != "group" or g is node:
            continue
        if g.x <= cx <= g.x + g.width and g.y <= cy <= g.y + g.height:
            if g.width * g.height > node.width * node.height and (
                    best is None or g.width * g.height < best.width * best.height):
                best = g
    return best


def add_micro_step(canvas_path, anchor_id: str | None, code: str, title: str,
                   objective: str, how_to: str, example_title: str,
                   example_markdown: str, link_label: str = "",
                   parent_group_id: str | None = None) -> dict:
    """Append one micro-step in the current standard and save the canvas.

    - ``anchor_id``: the node the new micro-step chains from (the previous
      micro-step's example, or the Raw Data node for the first one). The
      block is placed to its right; if the anchor sits inside a micro-step
      group, to the right of that group.
    - ``how_to``: build it with :func:`howto_note`.
    - ``link_label``: text of the arrow anchor → header, saying WHAT flows
      (e.g. ``"U1–U7 are interrogated one by one"``). Mandatory in practice.
    - ``parent_group_id``: the sub-step group ("Step N.M — …"); it grows to
      contain the new block.

    Returns ids: ``group_id``, ``header_id``, ``howto_id``, ``example_id``.
    """
    path = Path(canvas_path)
    doc = cf.load(path)
    anchor = doc.node_by_id(anchor_id) if anchor_id else None

    if anchor is not None:
        host = _group_of(doc, anchor)
        is_micro = host is not None and host.label[:1].isdigit()
        ref = host if is_micro else anchor
        gx = ref.x + ref.width + MICRO_CHAIN_GAP
        gy = ref.y if is_micro else anchor.y - MICRO_PAD_T
    else:
        gx, gy = 0.0, 0.0

    header_text = f"## {code} — {title}\n{objective.strip()}"
    example_text = f"#### Example output — {example_title}\n\n{example_markdown.strip()}"
    hh = estimate_height(header_text, MICRO_HEADER_W)
    ht = estimate_height(how_to, MICRO_HOWTO_W)
    he = estimate_height(example_text, MICRO_EXAMPLE_W)

    hx = gx + MICRO_PAD_L
    tx = hx + MICRO_HEADER_W + MICRO_GAP
    ex = tx + MICRO_HOWTO_W + MICRO_GAP
    top = gy + MICRO_PAD_T
    header = cf.CanvasNode(id=cf.new_id(), type="text", x=hx, y=top,
                           width=MICRO_HEADER_W, height=hh, text=header_text)
    howto = cf.CanvasNode(id=cf.new_id(), type="text", x=tx, y=top, color="5",
                          width=MICRO_HOWTO_W, height=ht, text=how_to.strip())
    example = cf.CanvasNode(id=cf.new_id(), type="text", x=ex, y=top,
                            width=MICRO_EXAMPLE_W, height=he, text=example_text)
    group = cf.CanvasNode(
        id=cf.new_id(), type="group", x=gx, y=gy, color="1", label=f"{code} — {title}",
        width=ex + MICRO_EXAMPLE_W + MICRO_PAD_R - gx,
        height=max(hh, ht, he) + MICRO_PAD_T + MICRO_PAD_B, nv={"zIndex": -2})
    doc.nodes.extend([group, header, howto, example])
    doc.edges.append(cf.CanvasEdge(id=cf.new_id(), fromNode=header.id, toNode=howto.id,
                                   label="how to execute"))
    doc.edges.append(cf.CanvasEdge(id=cf.new_id(), fromNode=howto.id, toNode=example.id,
                                   label="produces (example)"))
    if anchor is not None:
        doc.edges.append(cf.CanvasEdge(id=cf.new_id(), fromNode=anchor.id, toNode=header.id,
                                       label=link_label))

    # The sub-step group AND every group around it (the Step) grow to contain
    # the block; a Step that does not grow ends up cut through by its own
    # sub-steps (see tools/check_canvas_groups.py).
    chain = []                     # found before growing: growth breaks containment
    parent = doc.node_by_id(parent_group_id) if parent_group_id else None
    while parent is not None:
        chain.append(parent)
        parent = _group_of(doc, parent)
    child = group
    for parent in chain:
        right = child.x + child.width + 20
        bottom = child.y + child.height + 20
        parent.width = max(parent.width, right - parent.x)
        parent.height = max(parent.height, bottom - parent.y)
        child = parent

    cf.dump(path, doc)
    return {"group_id": group.id, "header_id": header.id,
            "howto_id": howto.id, "example_id": example.id}


def add_micro_steps(canvas_path, anchor_id: str | None, steps: list,
                    parent_group_id: str | None = None) -> list:
    """Chain several micro-steps; each dict takes the arguments of
    :func:`add_micro_step` (``code``, ``title``, ``objective``, ``how_to``,
    ``example_title``, ``example_markdown``, ``link_label``). Each one chains
    from the previous example."""
    out, cur = [], anchor_id
    for s in steps:
        r = add_micro_step(canvas_path, cur, s["code"], s["title"], s["objective"],
                           s["how_to"], s["example_title"], s["example_markdown"],
                           s.get("link_label", ""), parent_group_id)
        out.append(r)
        cur = r["example_id"]
    return out

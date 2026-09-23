"""Build a whole methodology deliverable canvas from a JSON spec.

    python -m notevault_app.core.deliverable_canvas <spec.json> <out.canvas>

The author (Claude or Antigravity) only writes CONTENT in the spec; every
coordinate, group, size and arrow is computed here, in the standard of the
reference canvas ``1.Problem_statement_h.canvas`` (see
``docs/SKILL_CANVAS_STEP_REPLICATION.md``):

    Phase overview:  [# Phase P-DN] -purpose-> [purpose] -requires-> [# Inputs] -then-> Step 1
    Step N (group)
      [# Step N — title / summary]
      Step N.M (group, one row per sub-step)
        [## Sub-Step N.M / objective] -consumes-> [# INPUT] -extract the raw data-> [## Raw Data …]
          -start N.M.1-> micro-steps …
        Micro-step N.M.K (group): [## N.M.K header] -how to execute-> [How-to] -produces (example)-> [Example]
    last example of N.M --exit_label--> INPUT of N.M+1 (or Step N+1, or the final deliverable)

Spec format (JSON):

{
  "phase": "Phase 0", "deliverable_code": "D2", "deliverable": "Problem Classification",
  "purpose": "markdown", "inputs": "markdown",
  "steps": [{
    "code": "1", "title": "…", "summary": "…",
    "substeps": [{
      "code": "1.1", "title": "…", "objective": "…",
      "input": "markdown", "raw_data_title": "Raw Data Extracted from Inputs", "raw_data": "markdown",
      "exit_label": "COMPLETE → … (1.2)",
      "micro": [{
        "code": "1.1.1", "title": "…", "objective": "…",
        "how_to": {"steps": ["…"], "table_columns": "A | B", "table_rules": "…",
                   "restrictions": ["…"], "done_when": "…"},
        "example_title": "…", "example": "markdown table", "link_label": "what flows into the NEXT micro-step"
      }]
    }]
  }],
  "final": {"title": "Final Deliverable — 02. Problem Classification.md", "markdown": "…"}
}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from . import canvas_format as cf
from .canvas_methodology import estimate_height, howto_note

CHAR_W, LABEL_PAD, MARGIN = 7.2, 28.0, 36.0
HEADER_W, HOWTO_W, EXAMPLE_W = 324.0, 440.0, 620.0
SUB_W, INPUT_W, RAW_W = 320.0, 320.0, 400.0
PAD, TOP = 20.0, 44.0
ROW_GAP, STEP_GAP = 110.0, 260.0


def gap_for(label: str) -> float:
    """Horizontal room for an arrow whose label must stay readable."""
    return max(90.0, len(label) * CHAR_W + LABEL_PAD + 2 * MARGIN)


class _Builder:
    def __init__(self):
        self.doc = cf.CanvasDoc()

    def text(self, x, y, w, md, color=""):
        n = cf.CanvasNode(id=cf.new_id(), type="text", x=x, y=y, width=w,
                          height=estimate_height(md, w), text=md.strip(), color=color)
        self.doc.nodes.append(n)
        return n

    def group(self, label, members, color="", pad=PAD, top=TOP):
        x0 = min(m.x for m in members) - pad
        y0 = min(m.y for m in members) - top
        x1 = max(m.x + m.width for m in members) + pad
        y1 = max(m.y + m.height for m in members) + pad
        g = cf.CanvasNode(id=cf.new_id(), type="group", x=x0, y=y0, width=x1 - x0,
                          height=y1 - y0, label=label, color=color, nv={"zIndex": -2})
        self.doc.nodes.append(g)
        return g

    def edge(self, a, b, label, fs="right", ts="left"):
        self.doc.edges.append(cf.CanvasEdge(id=cf.new_id(), fromNode=a.id, toNode=b.id,
                                            fromSide=fs, toSide=ts, label=label))


def _micro(b: _Builder, x: float, y: float, m: dict):
    h = b.text(x + PAD, y + TOP, HEADER_W, f"## {m['code']} — {m['title']}\n{m['objective']}")
    hw = m["how_to"]
    how = howto_note(hw["steps"], hw["table_columns"], hw["table_rules"],
                     hw["restrictions"], hw["done_when"]) if isinstance(hw, dict) else hw
    t = b.text(h.x + HEADER_W + gap_for("how to execute"), y + TOP, HOWTO_W, how, color="5")
    ex_md = f"#### Example output — {m['example_title']}\n\n{m['example'].strip()}"
    e = b.text(t.x + HOWTO_W + gap_for("produces (example)"), y + TOP, EXAMPLE_W, ex_md)
    b.edge(h, t, "how to execute")
    b.edge(t, e, "produces (example)")
    g = b.group(f"{m['code']} — {m['title']}", [h, t, e], color="1")
    return g, h, e


def build(spec: dict) -> cf.CanvasDoc:
    b = _Builder()
    x0 = 0.0
    # phase overview, left of everything
    ph = b.text(-1500, 200, 250, f"# {spec['phase']}-{spec['deliverable_code']}\n{spec['deliverable']}")
    purpose = b.text(ph.x + 250 + gap_for("purpose"), 200, 300, spec["purpose"])
    inputs = b.text(purpose.x + 300 + gap_for("requires"), 200, 280, "# Inputs\n" + spec["inputs"])
    b.edge(ph, purpose, "purpose")
    b.edge(purpose, inputs, "requires")
    b.group(f"{spec['phase']} — {spec['deliverable_code']}: Context & Inputs Overview",
            [ph, purpose, inputs], color="4")

    y = 0.0
    prev_exit = inputs          # node the next Step header is reached from
    prev_label = "then"
    last_example = None
    for si, step in enumerate(spec["steps"]):
        members = []
        head = b.text(x0 + PAD, y + TOP, 360, f"# Step {step['code']} — {step['title']}\n{step.get('summary', '')}")
        members.append(head)
        b.edge(prev_exit, head, prev_label, "right" if si == 0 else "bottom", "left" if si == 0 else "top")
        row_y = y + TOP
        prev_sub_last = None
        prev_sub_exit = ""
        for sub in step["substeps"]:
            sx = head.x + 360 + gap_for(f"sub-step {sub['code']}")
            sh = b.text(sx + PAD, row_y + TOP, SUB_W, f"## Sub-Step {sub['code']} {sub['title']}\nMission Objective\n{sub['objective']}")
            inp = b.text(sh.x + SUB_W + gap_for("consumes"), row_y + TOP, INPUT_W, "# INPUT\n" + sub.get("input", ""))
            raw = b.text(inp.x + INPUT_W + gap_for("extract the raw data"), row_y + TOP, RAW_W,
                         f"## {sub.get('raw_data_title', 'Raw Data Extracted from Inputs')}\n{sub.get('raw_data', '')}")
            b.edge(head, sh, f"sub-step {sub['code']}", "bottom", "left")
            b.edge(sh, inp, "consumes")
            b.edge(inp, raw, "extract the raw data")
            if prev_sub_last is not None:
                b.edge(prev_sub_last, inp, prev_sub_exit, "bottom", "top")
            row = [sh, inp, raw]
            cursor, anchor, label = raw.x + RAW_W, raw, f"start {sub['micro'][0]['code']}"
            example = None
            for m in sub["micro"]:
                gx = cursor + gap_for(label)
                g, mh, example = _micro(b, gx, row_y + TOP - TOP + 10, m)
                b.edge(anchor, mh, label)
                row.append(g)
                cursor, anchor, label = g.x + g.width, example, m.get("link_label", "")
            sg = b.group(f"Step {sub['code']} — {sub['title']}", row, color="")
            members.append(sg)
            prev_sub_last, prev_sub_exit = example, sub.get("exit_label", "")
            row_y = sg.y + sg.height + ROW_GAP
        stg = b.group(f"Step {step['code']} — {step['title']}", members, pad=30, top=50)
        prev_exit, prev_label = prev_sub_last, prev_sub_exit
        last_example = prev_sub_last
        y = stg.y + stg.height + STEP_GAP

    fin = spec.get("final")
    if fin and last_example is not None:
        fn = b.text(x0 + PAD, y + TOP, 960, fin["markdown"])
        b.edge(last_example, fn, prev_label or "publishes", "bottom", "top")
        b.group(fin["title"], [fn], color="4")
    return b.doc


def main(argv):
    spec = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    out = Path(argv[2])
    cf.dump(out, build(spec))
    print(f"written {out}")


if __name__ == "__main__":
    main(sys.argv)

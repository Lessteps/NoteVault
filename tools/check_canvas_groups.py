"""Check the group hierarchy of a methodology canvas.

    python tools/check_canvas_groups.py <file.canvas>

Groups are numbered ("Step 1", "Step 1.2", "1.2.3 — …"). Each numbered group
must lie completely inside the group of its parent number, and that parent
must be the smallest group around it; no two groups may cut through each
other and no note may straddle a group border. Exit code 1 lists every
violation. Run it after generating or editing any deliverable canvas.
"""
import json
import re
import sys


def box(n):
    return n["x"], n["y"], n["x"] + n["width"], n["y"] + n["height"]


def within(a, b):
    ax0, ay0, ax1, ay1 = box(a)
    bx0, by0, bx1, by1 = box(b)
    return ax0 >= bx0 and ay0 >= by0 and ax1 <= bx1 and ay1 <= by1


def cross(a, b):
    ax0, ay0, ax1, ay1 = box(a)
    bx0, by0, bx1, by1 = box(b)
    inter = ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1
    return inter and not within(a, b) and not within(b, a)


def code(g):
    m = re.match(r"^(?:Step )?(\d+(?:\.\d+)*)", g.get("label", ""))
    return m.group(1) if m else None


def check(data) -> list:
    groups = [n for n in data["nodes"] if n["type"] == "group"]
    notes = [n for n in data["nodes"] if n["type"] != "group"]
    problems = []
    for g in groups:
        c = code(g)
        if not c or "." not in c:
            continue
        parent_code = c.rsplit(".", 1)[0]
        parents = [p for p in groups if p is not g and code(p) == parent_code]
        if not parents or not any(within(g, p) for p in parents):
            problems.append(f"'{g['label']}' is not inside its parent group {parent_code}")
            continue
        around = [p for p in groups if p is not g and within(g, p)]
        smallest = min(around, key=lambda p: p["width"] * p["height"])
        if code(smallest) != parent_code:
            problems.append(f"'{g['label']}' sits inside '{smallest['label']}' instead of {parent_code}")
    for i, a in enumerate(groups):
        for b in groups[i + 1:]:
            if cross(a, b):
                problems.append(f"groups cut through each other: '{a['label']}' | '{b['label']}'")
    for n in notes:
        for g in groups:
            if cross(n, g):
                first = (n.get("text") or n.get("file") or "").split("\n")[0][:40]
                problems.append(f"note '{first}' straddles the border of '{g['label']}'")
    return problems


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as fh:
        found = check(json.load(fh))
    for line in found:
        print(line)
    print(f"{len(found)} problem(s)")
    sys.exit(1 if found else 0)

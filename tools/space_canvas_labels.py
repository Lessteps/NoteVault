"""Open room on a canvas so every arrow label can be read.

    python tools/space_canvas_labels.py <in.canvas> [<out.canvas>]

An edge label is drawn in the middle of its arrow; when two cards sit closer
than the label is wide, the label hides under the cards ("onsume" instead of
"consumes"). For every labelled arrow between two siblings (cards or groups
in the same group), this widens the gap to the label width plus a margin,
pushing everything to its right (or below it) along, then regrows the groups
bottom-up and keeps side-by-side blocks and stacked rows from colliding.
Run tools/check_canvas_groups.py afterwards.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from notevault_app.core import canvas_format as cf  # noqa: E402

CHAR_W = 7.2          # label font ≈ Segoe UI 9pt at 100 % zoom
LABEL_PAD = 28.0      # label box padding
MARGIN = 36.0         # free arrow visible on each side of the label
V_GAP = 56.0          # vertical arrows: room for one label line
BLOCK_GAP = 90.0      # between side-by-side groups / stacked rows
GROUP_PAD, GROUP_TOP = 20.0, 44.0


def label_width(text: str) -> float:
    return len(text) * CHAR_W + LABEL_PAD


def main(src: Path, dst: Path) -> None:
    doc = cf.load(src)
    nodes = doc.nodes
    groups = [n for n in nodes if n.type == "group"]

    def area(n):
        return n.width * n.height

    def contains(g, n):
        cx, cy = n.x + n.width / 2, n.y + n.height / 2
        return g.x <= cx <= g.x + g.width and g.y <= cy <= g.y + g.height

    parent = {}
    for n in nodes:
        best = None
        for g in groups:
            if g is not n and area(g) > area(n) and contains(g, n):
                if best is None or area(g) < area(best):
                    best = g
        parent[n.id] = best.id if best else None
    kids = {}
    for n in nodes:
        kids.setdefault(parent[n.id], []).append(n)

    def desc(gid):
        out = []
        for c in kids.get(gid, []):
            out.append(c)
            out.extend(desc(c.id))
        return out

    def move(n, dx, dy):
        for m in [n] + (desc(n.id) if n.type == "group" else []):
            m.x += dx
            m.y += dy

    def depth(n):
        d, p = 0, parent[n.id]
        while p:
            d, p = d + 1, parent[p]
        return d

    by_id = {n.id: n for n in nodes}

    def sibling_pair(e):
        """The two siblings an edge connects (walking up to a common group)."""
        a, b = by_id.get(e.fromNode), by_id.get(e.toNode)
        if a is None or b is None:
            return None
        chain_a = [a]
        while parent[chain_a[-1].id]:
            chain_a.append(by_id[parent[chain_a[-1].id]])
        chain_b = [b]
        while parent[chain_b[-1].id]:
            chain_b.append(by_id[parent[chain_b[-1].id]])
        for x in chain_a:
            for y in chain_b:
                if x is not y and parent[x.id] == parent[y.id]:
                    return x, y
        return None

    def fit_group(g):
        inner = kids.get(g.id, [])
        if not inner:
            return
        right = max(c.x + c.width for c in inner) + GROUP_PAD
        bottom = max(c.y + c.height for c in inner) + GROUP_PAD
        g.width = max(g.width, right - g.x)
        g.height = max(g.height, bottom - g.y)

    labelled = [e for e in doc.edges if e.label]

    def block_gap(a, b):
        """Room between two side-by-side blocks: wide enough for the label
        of any arrow that runs between them."""
        inside_a = {a.id} | {m.id for m in desc(a.id)}
        inside_b = {b.id} | {m.id for m in desc(b.id)}
        widths = [label_width(e.label) + 2 * MARGIN for e in labelled
                  if (e.fromNode in inside_a and e.toNode in inside_b)
                  or (e.fromNode in inside_b and e.toNode in inside_a)]
        return max([BLOCK_GAP] + widths)
    for level in sorted({depth(g) for g in groups} | {0}, reverse=True):
        scopes = [g for g in groups if depth(g) == level] + ([None] if level == 0 else [])
        for scope in scopes:
            members = kids.get(scope.id if scope else None, [])
            ids = {m.id for m in members}
            for _ in range(3):                       # a push can open another tight gap
                changed = False
                for e in labelled:
                    pair = sibling_pair(e)
                    if not pair or pair[0].id not in ids:
                        continue
                    a, b = pair
                    need_h = label_width(e.label) + 2 * MARGIN
                    if b.x >= a.x + a.width - 1:                       # b to the right
                        gap = b.x - (a.x + a.width)
                        if gap < need_h:
                            dx = need_h - gap
                            for m in members:
                                if m is not a and m.x >= b.x - 1:
                                    move(m, dx, 0)
                            changed = True
                    elif b.y >= a.y + a.height - 1:                    # b below
                        gap = b.y - (a.y + a.height)
                        if gap < V_GAP:
                            dy = V_GAP - gap
                            for m in members:
                                if m is not a and m.y >= b.y - 1 and \
                                        m.x < a.x + a.width and a.x < m.x + m.width:
                                    move(m, 0, dy)
                            changed = True
                if not changed:
                    break
            # keep side-by-side blocks of this scope apart (left to right)
            blocks = [m for m in members if m.type == "group"]
            for a in sorted(blocks, key=lambda m: m.x):
                for b in sorted(blocks, key=lambda m: m.x):
                    if b is a or b.x < a.x:
                        continue
                    overlap_y = a.y < b.y + b.height and b.y < a.y + a.height
                    gap_needed = block_gap(a, b)
                    if overlap_y and b.x < a.x + a.width + gap_needed:
                        dx = a.x + a.width + gap_needed - b.x
                        if scope is None:       # top level: slide the left block away
                            move(a, -dx, 0)
                        else:
                            for m in members:
                                if m is not a and m.x >= b.x - 1 and \
                                        m.y < a.y + a.height and a.y < m.y + m.height:
                                    move(m, dx, 0)
            # and stacked rows apart (top to bottom)
            for a in sorted(blocks, key=lambda m: m.y):
                for b in sorted(blocks, key=lambda m: m.y):
                    if b is a or b.y < a.y:
                        continue
                    overlap_x = a.x < b.x + b.width and b.x < a.x + a.width
                    overlap_y = a.y < b.y + b.height and b.y < a.y + a.height
                    if overlap_x and not overlap_y and b.y < a.y + a.height + BLOCK_GAP:
                        dy = a.y + a.height + BLOCK_GAP - b.y
                        for m in members:
                            if m is not a and m.y >= b.y - 1:
                                move(m, 0, dy)
            if scope is not None:
                fit_group(scope)

    cf.dump(dst, doc)
    tight = []
    for e in labelled:
        pair = sibling_pair(e)
        if not pair:
            continue
        a, b = pair
        if b.x >= a.x + a.width - 1 and b.x - (a.x + a.width) < label_width(e.label) + 2 * MARGIN - 1:
            tight.append(e.label)
    print(f"labelled arrows: {len(labelled)}, still tight: {len(tight)}")
    for t in tight:
        print("  tight:", t)


if __name__ == "__main__":
    src = Path(sys.argv[1])
    main(src, Path(sys.argv[2]) if len(sys.argv) > 2 else src)

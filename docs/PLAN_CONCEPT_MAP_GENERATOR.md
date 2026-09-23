# Plan — Automated Concept-Map Generator for NoteVault Canvases

**Audience:** Antigravity (and Claude). Either agent must be able to take a
natural-language order like *"make a concept map of Phase 0 with a central
'Problem Statement' node and the four problem elements around it, connected"*
and produce a valid, well-laid-out `.canvas` file, with **no manual coordinate
math**.

**Language:** English (code + docs). UI strings the feature surfaces to the user
stay Spanish.

**Core idea:** two languages with a deterministic compiler between them.
1. **User → Agent (natural language).** The agent translates the request into…
2. **Agent → System (a declarative YAML spec, no x/y).** …which the builder
   compiles into…
3. **System → `.canvas`.** A real Obsidian/NoteVault canvas file.

The middle YAML spec is the contract that makes generation reliable and
repeatable. Coordinates, sizes, and edge sides are **computed** by the layout
engine, never written by the agent.

---

## 0. Ground truth (read before coding)

- Canvas schema: `notevault_app/core/canvas_format.py`
  - `CanvasNode(id, type, x, y, width, height, color, file, text, url, label, nv)`.
    Relevant types: `"text"` (markdown card — **now renders headings/bold**),
    `"file"` (vault note/media embed), `"group"` (container), `"nv-shape"`
    (flowchart shape, `nv={"shape": <kind>}`).
  - `CanvasEdge(id, fromNode, toNode, fromSide, toSide, fromEnd, toEnd, color,
    label, nv)`. Sides are `"top"|"right"|"bottom"|"left"`. `toEnd` defaults to
    `"arrow"`.
  - `CanvasDoc(nodes, edges)`, `cf.new_id()`, `cf.dump(path, doc)`,
    `cf.load(path)`.
  - Colors are the strings `"1".."6"` (red, orange, yellow, green, cyan,
    purple) or `""` for the theme default.
- How cards are added live in the UI (reference for sizing/behaviour, not to be
  called by the builder): `CanvasView.add_text_node`, `add_note_node`,
  `add_edge` in `notevault_app/ui/components/notes/canvas/view.py`.
- A text card renders markdown, so a node's title should be `"# Title"` and its
  body plain lines below — the card shows a real heading.

**Hard rules (from project memory):**
- The builder is **pure core** (no Qt/UI imports) so it is unit-testable and the
  Android client could reuse it. It only builds a `CanvasDoc` and writes it with
  `cf.dump`.
- Any change to the on-disk canvas format must be mirrored in the mobile
  `vault_format.dart` — this plan does **not** change the format, only writes it.
- Rebuild and copy `NoteVault.exe` after code changes (desktop is launched from
  the exe).

---

## 1. The spec language (what the agent writes)

A single YAML document. **No `x`/`y` anywhere.** Example:

```yaml
title: "Phase 0 — Problem Recognition"     # informational; not stored in .canvas
layout: radial            # radial | tree | grid | column | row
direction: down           # for tree/column/row: down | right (ignored by radial/grid)
defaults:
  card_width: 240
  card_color: ""          # applies to nodes that don't set their own
nodes:
  - id: center            # agent-chosen alias, referenced by edges
    title: "Problem Statement"      # becomes "# Problem Statement" on a text card
    body: "The first deliverable of the methodology."   # optional extra lines
    color: "6"
    role: root            # radial/tree use this to find the centre/root
  - id: who
    title: "Affected Group"
    body: "Who directly suffers the failure."
  - id: when
    title: "Condition / Trigger"
  - id: what
    title: "Observable Consequence"
  - id: cost
    title: "Downstream Effect"
edges:
  - from: center
    to: [who, when, what, cost]     # a list fans one source to many targets
    label: ""                        # optional edge label
    directed: true                   # true → arrowhead on the target (default)
```

Field reference:
- `layout` (required): selects the layout engine (§3).
- `direction` (optional): `down` (default) or `right` for `tree|column|row`.
- `nodes[].id` (required, unique): alias used by edges; the builder maps it to a
  real `cf.new_id()`.
- `nodes[].title` / `nodes[].body`: composed into the card's markdown as
  `"# {title}\n\n{body}"` (title-only → just `"# {title}"`).
- `nodes[].kind` (optional, default `text`): `text` | `note` | `shape`.
  - `note` → `type="file"`, `file` = vault-relative path in `nodes[].file`.
  - `shape` → `type="nv-shape"`, `nv={"shape": nodes[].shape}` (`process`,
    `decision`, `start_end`, …; see `cf.SHAPE_KINDS`).
- `nodes[].color`: `"1".."6"` or omit for the default.
- `nodes[].role`: `root` marks the centre (radial) or root (tree). If none is
  marked, the builder picks the node that is the source of the most edges.
- `edges[].from` / `edges[].to`: aliases. `to` may be a single alias or a list
  (fan-out).
- `edges[].label`, `edges[].directed` (default true).

The agent MUST emit a spec that:
- gives every node a unique `id`,
- references only existing ids in edges,
- picks one `layout` that matches the requested shape (see §6 mapping),
- keeps titles short (they become headings).

---

## 2. The builder module — `notevault_app/core/canvas_builder.py`

Pure Python, no Qt. Public API:

```python
def build_canvas(spec: dict) -> cf.CanvasDoc: ...
def spec_from_yaml(text: str) -> dict: ...          # yaml.safe_load + validate
def write_canvas(path, spec: dict) -> Path: ...     # build + cf.dump; returns path
def validate_spec(spec: dict) -> list[str]: ...     # [] when valid, else messages
```

`build_canvas` pipeline (in order):
1. `validate_spec(spec)`; raise `ValueError("\n".join(errors))` if non-empty.
2. Resolve ids: `alias → cf.new_id()`; keep an `alias→CanvasNode` map.
3. Size each node (§4) → set `width`, `height`; compose `text` markdown.
4. Run the chosen layout (§3) → assign `x`, `y` to every node.
5. Build edges: for each `(from, to)` pair choose `fromSide`/`toSide` by the two
   nodes' relative centres (§5); `toEnd = "arrow" if directed else "none"`.
6. Return `CanvasDoc(nodes=[…], edges=[…])`.

`write_canvas(path, spec)` = `cf.dump(path, build_canvas(spec))`.

**No UI, no vault registration here.** Integration is §7.

Add `pyyaml` to the project's requirements if not present; if adding a
dependency is undesirable, accept the spec as an already-parsed `dict` and let
the caller parse YAML (Claude can pass a dict directly).

---

## 3. Layout engines (`_layout_*` functions, pure geometry)

Each takes the ordered `list[CanvasNode]`, the `edges`, and the resolved root,
and mutates `node.x/node.y`. All must guarantee **no overlaps** and consistent
gaps. Constants: `GAP = 60` (space between neighbours), `RANK_GAP = 140`
(distance between tree levels / radial ring radius step).

- **radial** (default concept map): root at origin `(0,0)`. Its direct children
  are placed on a circle of radius `R = max(RANK_GAP, needed_for_no_overlap)`,
  evenly by angle. Grandchildren go on the next ring, in the angular wedge of
  their parent. Compute `R` so neighbouring cards on a ring don't overlap:
  `R = max(RANK_GAP, (n_on_ring * (card_w + GAP)) / (2*pi))`.
- **tree / hierarchy**: root at top (direction `down`) or left (`right`).
  Children laid out one rank deeper (`RANK_GAP`), siblings spaced by
  `card + GAP` along the cross axis; each subtree is centred over its children
  (a simple recursive first-pass width, second-pass position — Reingold–Tilford
  lite is enough). Edges will point rank→rank.
- **grid**: `cols = ceil(sqrt(n))`; place nodes row-major with `card + GAP`
  spacing; edges (if any) route by side.
- **column / row**: a single line, `card + GAP` apart, vertical or horizontal —
  reuse the same math as the in-editor arrow fan (`CanvasView._spawn_linked_text`)
  for consistency.

Overlap guarantee test: for every layout, assert no two node rects intersect
(inflated by a small epsilon).

---

## 4. Node sizing heuristic (`_size_node`)

Text cards should be tall enough for their content, never clipped awkwardly:
- `width = spec defaults.card_width` (or `nodes[].width`), default `240`.
- Estimate wrapped lines: `chars_per_line = max(8, (width - 24) / 7.5)`;
  `lines = ceil(len(body_text) / chars_per_line) + (2 if title else 0)`.
- `height = clamp(70, 44 + lines * 22, 360)`.
- `note` embeds: `width=320, height=220`. `shape`: `width=180, height=90`.

These are heuristics; keep them in one function so they're easy to tune.

---

## 5. Edge side selection (`_sides_for`)

Given source rect `S` and target rect `T`, pick the pair of sides that makes the
arrow read cleanly:
- `dx = T.center.x - S.center.x`, `dy = T.center.y - S.center.y`.
- If `abs(dx) >= abs(dy)`: horizontal dominant →
  `("right","left")` when `dx >= 0` else `("left","right")`.
- Else vertical dominant →
  `("bottom","top")` when `dy >= 0` else `("top","bottom")`.

This matches the in-editor fan-out convention already used in `view.py`.

---

## 6. Natural-language → spec mapping (the agent's job, both Claude and Antigravity)

When the user asks for a concept map, the agent:
1. Extracts the **central idea** → a node with `role: root`.
2. Extracts **first-level concepts** → nodes, each edged from the root.
3. Extracts **sub-concepts** → nodes edged from their parent.
4. Chooses `layout`:
   - "concept map / mind map / around a centre / radial" → `radial`.
   - "hierarchy / breakdown / tree / top-down / flow of phases" → `tree`
     (`direction: down`), or `right` for left-to-right.
   - "list / steps in order" → `column` (down) or `row` (right).
   - "matrix / catalog / grid of items" → `grid`.
5. Writes titles as short headings and one-sentence bodies.
6. Emits the YAML spec and calls the builder (Claude: run the CLI in §7;
   Antigravity: same).

Keep this mapping in the doc so both agents produce comparable specs from the
same order.

---

## 7. Integration & how an agent actually runs it

- **Vault helper** (thin, UI-free) `notevault_app/core/canvas_builder.py:
  create_map_in_vault(vault_root, rel_path, spec) -> Path`:
  1. `write_canvas(Path(vault_root)/rel_path, spec)`.
  2. Return the path. (The explorer picks up new `.canvas` files on refresh; if a
     signal is needed, the caller emits `note_created`.)
- **CLI entry** `python -m notevault_app.core.canvas_builder <spec.yaml> <out.canvas>`:
  parse YAML, `write_canvas`, print the path. This is what an agent invokes to
  generate a file from a spec it wrote to disk.
- **Later (out of scope here):** a command-palette action *"Generar mapa desde
  esquema…"* and generating a map from a note's markdown outline.

---

## 8. Task breakdown (atomic, each with an acceptance test)

Do these in order; each ends green before the next.

1. **T1 — schema + validator.** `validate_spec` + `spec_from_yaml`.
   *Accept:* unit tests for unique ids, dangling edge refs, unknown layout/kind,
   empty nodes; valid specs return `[]`.
2. **T2 — sizing + markdown compose.** `_size_node`, title/body → `text`.
   *Accept:* a node with a long body gets a taller card within clamp bounds; a
   title-only node's `text == "# Title"`.
3. **T3 — column/row layout + edges + sides.** `build_canvas` end-to-end for
   `column`/`row`.
   *Accept:* nodes aligned on one axis, gaps ≥ `GAP`, **no overlaps**; every edge
   references existing nodes; sides match §5; `cf.load(cf.dump(...))` round-trips
   unchanged.
4. **T4 — grid layout.** *Accept:* `ceil(sqrt(n))` columns, no overlaps.
5. **T5 — tree layout.** *Accept:* root at top/left, children one `RANK_GAP`
   deeper, subtrees centred, no overlaps, edges rank→rank.
6. **T6 — radial layout.** *Accept:* root at centre, first ring evenly spaced and
   non-overlapping, grandchildren in parent wedges.
7. **T7 — vault helper + CLI.** *Accept:* running the CLI on a sample spec writes
   a `.canvas` that `cf.load` reads with the expected node/edge counts.
8. **T8 — golden sample.** Commit `docs/samples/phase0_concept_map.yaml` and a
   test that builds it and asserts structure (1 root, 4 children, 4 edges, no
   overlaps). This doubles as the worked example both agents copy from.

**Testing conventions:** `QT_QPA_PLATFORM=offscreen` is **not** needed (pure
core, no Qt). Deterministic geometry asserts only (positions, gaps, overlaps,
edge validity, round-trip). Run `python -m pytest tests/ -q`.

---

## 9. Division of labour (Claude vs Antigravity)

- **Antigravity (repetitive, long, low-ambiguity):** T1, T2, T3, T4, the CLI in
  T7, and all their tests. These are mechanical and well-specified.
- **Claude (short, tricky):** T5 (tree centring) and T6 (radial ring math),
  where the geometry is subtle, plus the T8 golden sample and final
  rebuild+verify of the exe.
- Both agents implement §6 (NL→spec) identically from this doc so a given order
  yields comparable maps regardless of who runs it.

---

## 10. Definition of done

- `build_canvas` produces valid `.canvas` files for all five layouts with zero
  overlaps and valid edges, verified by tests.
- The CLI generates a file from a YAML spec.
- The golden Phase-0 sample builds and opens in the app as a readable concept
  map (text cards show rendered headings, arrows connect correctly).
- `python -m pytest tests/ -q` is green; `NoteVault.exe` rebuilt and copied.

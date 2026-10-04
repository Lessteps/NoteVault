# SKILL — Replicate a methodology step onto a canvas (standard 2026-09-23)

**Who runs this:** Antigravity or Claude. **When:** the user asks to build or
extend the canvas of a deliverable (*"genera el canvas del entregable D2 como el
de Problem Statement"*, *"añade el Step 1.2 al canvas"*). **Goal:** every
deliverable canvas looks and works exactly like the reference template.

**Reference template (read it first, copy its shape, never its content):**
`Programación/FULLSTACK_DEVELOPMENT/PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement/1.Problem_statement_h.canvas`

Do NOT hand-write x/y. Use `notevault_app/core/canvas_methodology.py`
(`howto_note`, `add_micro_step`, `add_micro_steps`). The old
`add_substep_block` / `add_substeps` ("operation + Partial output") are LEGACY:
do not use them for new canvases.

---

## 1. The hierarchy (fixed)

```
Step N (group)                         e.g. "Step 1 — Anatomical Decomposition (The 4 Variables)"
└─ Sub-step N.M (group)                e.g. "Step 1.1 — Lexical Extraction and Variable Segmentation"
   ├─ [## Sub-Step N.M  + Mission Objective] ─consumes→ [# INPUT] ─extract the raw data→ [## Raw Data …]
   └─ Micro-step N.M.K (group, one per operation)
        [## N.M.K — Title / objective] ─how to execute→ [How-to note] ─produces (example)→ [Example output]
```

Micro-steps chain left→right inside the sub-step:
`[Example N.M.K] ──"<what flows>"──▶ [## N.M.K+1 header]`.
Sub-steps chain top→bottom: `[last Example of N.M] ──"<verdict> → <next>"──▶ [# INPUT of N.M+1]`.

## 2. Decomposition rules (why the old canvases failed)

1. **One micro-step = one operation.** If the master lists N.M.1…N.M.k, the canvas has
   exactly those k groups, same numbers, same order. Never merge two (e.g. "First Why" and
   "Second Why" are two micro-steps; a checklist and its verdict are two micro-steps).
2. **Tables grow progressively.** A table that is completed across micro-steps is shown
   partial first and complete later (e.g. Why 1 → Why 1 + Why 2; v1 → v2 → v3 → canonical).
3. **Every sub-step ends with a binary verdict** (`COMPLETE`, `PASS`, `APPROVED`…).
4. **Verbatim rule:** once an artifact is issued (e.g. Intermediate Artifact 1), every later
   copy of it — including the final deliverable — is copied **word for word**.

## 3. The How-to note (mandatory, the core of the correction)

Each micro-step has a How-to note between its header and its example. It explains HOW,
not only WHAT, in four fixed sections — build it with `howto_note(...)`:

| Section | What it must contain |
|---|---|
| `### How to do it` | Numbered procedure; each item one concrete action (read, cut, ask, compare, mark…). |
| `### How to build the table` | The exact columns, what one row represents, how each cell is filled. |
| `### Restrictions` | The rules to respect, citing codes (R1–R6, C1–C5, "no new facts"…). |
| `### Done when` | The verifiable condition that closes the micro-step (e.g. "4 × `PURIFIED`"). |

Then the **Example output** note shows the filled table for the reference case, titled
`#### Example output — <Table name>`.

## 4. Arrow labels (mandatory)

Every arrow says what flows through it. Use these fixed labels inside a micro-step:
`how to execute` (header → How-to) and `produces (example)` (How-to → Example).
Between micro-steps, write what the next step receives, ≤ 45 characters, e.g.
`U1–U7 are interrogated one by one`, `CONTAMINATED rows get rewritten`,
`3 × PASS → issue the artifact`. Between sub-steps: `COMPLETE → v1 goes to the audit (1.2)`.
Structural arrows: `sub-step N.M`, `consumes`, `extract the raw data`, `start N.M.1`.

## 5. How to run it (exact code)

```python
from notevault_app.core.canvas_methodology import howto_note, add_micro_steps

how_112 = howto_note(
    steps=["Take each unit in order and ask the 4 role questions in a fixed order.",
           "The first question the unit answers decides its role; stop there.",
           "A unit that answers none → `DOES NOT APPLY`."],
    table_columns="Unit | Question Satisfied | Assigned Role",
    table_rules="One row per unit of 1.1.1, same order.",
    restrictions=["One role per unit.", "The proposed solution is never a role."],
    done_when="Every unit has exactly one role or `DOES NOT APPLY`.")

add_micro_steps(
    canvas_path=r"<abs path to the .canvas>",
    anchor_id="<id of the Raw Data node, or of the previous Example output>",
    parent_group_id="<id of the sub-step group 'Step N.M — …'>",
    steps=[
        {"code": "1.1.2", "title": "Heuristic interrogation per unit",
         "objective": "Assign each narrative unit to one of the 4 roles, or discard it.",
         "how_to": how_112,
         "example_title": "Role Assignment Table",
         "example_markdown": "| Unit | Question Satisfied | Assigned Role |\n|---|---|---|\n| U1 | … | … |",
         "link_label": "U1–U7 are interrogated one by one"},
        # next micro-step …
    ])
```

Finding ids: the `.canvas` is JSON. The sub-step group has `"label": "Step N.M — …"`; the
anchor is the `## Raw Data …` node (first micro-step) or the previous `#### Example output`.

## 5b. Building a WHOLE deliverable canvas from zero (preferred for new canvases)

Write only content in a JSON spec and let the builder compute every group, size and arrow:

```
python -m notevault_app.core.deliverable_canvas <spec.json> "<deliverable folder>/<N.Name>_h.canvas"
python tools/space_canvas_labels.py "<deliverable folder>/<N.Name>_h.canvas"
python tools/check_canvas_groups.py "<deliverable folder>/<N.Name>_h.canvas"
```

The spec format is documented at the top of `notevault_app/core/deliverable_canvas.py`
(phase, deliverable, purpose, inputs, steps → substeps → micro with `how_to` as a dict of
`steps / table_columns / table_rules / restrictions / done_when`, `example_title`, `example`,
`link_label`, and per sub-step `exit_label`; optional `final`). A complete small spec is in
`tests/test_deliverable_canvas.py` (`SPEC`). Keep specs in
`C:\PROGRAMMING\PROJECTS\NoteVault\docs\canvas_specs\<PHASE_X>\<N.Name>.json` so a canvas can be
regenerated after corrections: fix the spec and rebuild; never hand-edit coordinates.

## 5c. Micro-step chain: how the How-to becomes visible work (final template, 2026-10-04, from 1.1.1)

Reference: `Programación/FULLSTACK_DEVELOPMENT/PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement/1.Problem_statement_h.canvas`,
micro-step **1.1.1 — Segmentation into narrative units**. Every micro-step of every deliverable canvas is built like it.
The point: the reader must see HOW the raw source becomes the example output, one How-to step at a time, and WHY each
decision was taken, without already knowing the method.

### Layout (left to right, inside the micro-step group)

```
[## 1.1.1 header] ─how to execute→ [How-to] ─step 1 of how to do it→ [Step 1] ─<what flows>→ [Step 2] … [Step K] ─produces (example)→ [Example output]
                                                (one card per How-to step, same order as the How-to)
```

### The step card (one per How-to step)

Title `### Step N · <verb phrase from the How-to>`, then, in this order:

1. `**Starts from:**` what the card receives (the previous card's result, or the raw source for Step 1).
2. `**Will do:**` the operation of this How-to step, in one sentence.
3. `**Source (raw):**` the text it works on (verbatim).
4. The work itself, one block per item the step decides on (`**✂ Piece N**` + `> quote`, `**[U3]**` + `> quote`,
   a table row, a checklist item…), always followed by `↳ **Why:**` explaining THAT decision (why this cut / role / verdict).
   The reason goes directly under each piece or decision, never in a block at the end.
5. `**Selected:**` what the step picked, and `**Changed:**` what it changed (may be "nothing", and then say why).
6. `**Result — what this step leaves:**` what exists after the step. Step 1 of 1.1.1 may say "nothing marked yet".

The micro-step then ends with its **Example output** note (the filled table), which has:

- a final **Why** column in every table, one reason per row, in row order;
- under the table, only the general reasons that apply to the whole table (`↳ **Why …:**`);
- a last line `**Result — what N.M.K leaves:**` (put it in the How-to note instead when the example is official
  text that gets pasted into the deliverable, e.g. the front matter or the canonical paragraph).

The next micro-step's How-to note opens with `**Starts from:** <what the previous micro-step left, and what this one
does with it>`. Sub-steps already hand over through their `# INPUT` card.

### Rules

1. Cards are verbatim from the raw source; never a joined paragraph.
2. A card shows its whole text without scrolling (about 66 characters per line at 520 px, 23 px per line, +30 px).
3. All cards of a row share the same height and are centred on the group's other cards; 230–290 px between cards so each
   arrow label reads; arrow labels say what flows (≤ 45 characters).
4. Groups wrap their children: 40 px around the micro-step group, 30 px around the sub-step group.
5. Every rewrite keeps a `.bak` copy (never overwrite one) and happens with the canvas closed in NoteVault.
6. Everything is in English.

### Re-flow after adding or growing cards (do not move things by hand)

Notes grow and cards are inserted, so the whole canvas is re-laid out by script, always in this order:
(1) grow each note to fit its text; (2) grow each group to wrap what it held; (3) horizontally, every micro-step that
got wider pushes the micro-steps to its right, and a sub-step that got wider pushes the sub-step beside it;
(4) vertically, every `Step N.M` row that got taller pushes the rows below it down (a row's shift is the largest
shift + growth among the rows entirely above it); (5) `Step N` outer groups take the top shift of their first row and
wrap the bottom of their last. Check afterwards that no card overlaps, no two groups cut each other and no card
escapes its group (the scripts that did this for the Problem Statement live in the session that built it; the checks
are `tools/check_canvas_groups.py` and a card/group overlap check).

### Acceptance (add to section 7)

- [ ] Every How-to step of the micro-step has its own card, in order, with Starts from / Will do / Source / the work /
      Selected / Changed / Result.
- [ ] Every piece, row or verdict has its reason directly under it (`↳ Why:`) or in the table's Why column.
- [ ] Each micro-step ends with a Result line and the next one starts from it.
- [ ] No card overlaps, no group cuts another, nothing needs scrolling.

## 6. Rules

- **Tell the user to close that canvas in the app before you edit it** (autosave overwrites
  external edits). Check with `tasklist | findstr NoteVault` if you can.
- Content comes from the deliverable's master (`N.Name.md`) and its `example_step_*.md`:
  procedures from *Operation*, restrictions from the master's rules, examples from the
  worked example. Do not invent facts; if the master lacks a detail, write the How-to from
  the master's rules and flag it to the user.
- English content, Spanish only if the deliverable itself is Spanish.
- Pure core Python: no Qt, no exe rebuild needed.

## 7. Acceptance checklist (verify before saying "done")

- [ ] Every micro-step of the master exists as its own group, same numbering and order.
- [ ] Each micro-step group contains exactly 3 notes: header, How-to (4 sections), Example output.
- [ ] Every arrow has a label; no example is left without an arrow to the next step.
- [ ] Each sub-step ends in a binary verdict; the last one links to the next sub-step/Step.
- [ ] `python tools/space_canvas_labels.py <file.canvas>` prints `still tight: 0` (every arrow label readable between its cards).
- [ ] `python tools/check_canvas_groups.py <file.canvas>` prints `0 problem(s)` (every group inside its numbered parent, no group cutting another).
- [ ] No notes overlap (open the canvas; the 📑 index must list Steps → sub-steps → micro-steps in order).
- [ ] Copies of issued artifacts are verbatim (compare the final deliverable against the artifact).
- [ ] (Chain layout, section 5c) See the acceptance list at the end of section 5c.

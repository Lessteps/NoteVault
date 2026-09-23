# Prompt for Antigravity — generate the canvases of Phases 0, 1 and 2

Copy everything below the line into Antigravity.

---

You are going to generate, one by one and carefully, the step-by-step canvas of EVERY deliverable of Phases 0, 1 and 2 of my FULLSTACK methodology. Take your time: quality and fidelity matter more than speed. Work autonomously through the whole list; do not stop to ask unless a rule below says STOP.

## 0. Read first (mandatory, in this order)

1. `C:\PROGRAMMING\PROJECTS\NoteVault\docs\SKILL_CANVAS_STEP_REPLICATION.md` — the contract. Sections 2, 3, 4, 5b and 7 are binding.
2. The reference canvas, which is the template you must reproduce in shape (never copy its content):
   `C:\PROGRAMMING\Programación\FULLSTACK_DEVELOPMENT\PHASE_0_PROBLEM_RECOGNITION\1.Problem_Statement\1.Problem_statement_h.canvas`
   Open it as JSON and study one full micro-step (e.g. 1.1.2): header → How-to note (4 sections) → Example output, every arrow labelled.
3. Its sources, to see how content maps into the canvas: `1.Problem_Statement.md` (master) and `example_step_1/2/3_problem_statement.md` in the same folder.
4. The builder: `C:\PROGRAMMING\PROJECTS\NoteVault\notevault_app\core\deliverable_canvas.py` (spec format in its docstring) and the small working spec `SPEC` in `C:\PROGRAMMING\PROJECTS\NoteVault\tests\test_deliverable_canvas.py`.

## 1. The work list (in this order)

Base folder: `C:\PROGRAMMING\Programación\FULLSTACK_DEVELOPMENT\`

- PHASE_0_PROBLEM_RECOGNITION: 2.Problem_Classification, 3.Impact_Estimate, 4.Impact_Matrix, 5.Project_Objectives, 6.Stakeholder_Map, 7.Risk_Register, 8.Go_No-Go_Signal, 9.Brief
  (1.Problem_Statement is already done: it is the template — do NOT touch it.)
- PHASE_1_EARLY_VIABILITY: 1.User_Profile, 2.Market_Validation, 3.Competitive_Analysis, 4.Technical_Feasibility, 5.Legal_and_Regulatory, 6.Team_Capability, 7.Viability, 8.Risk_Register_Update, 9.MVP_Definition, 10.Initial_Plan, 11.Work_Process, 12.Go_No-Go_Pivot, 13.Brief
- PHASE_2_PROJECT_KICKOFF: 1.Project_Identity, 2.Non_Negotiable_Constraints, 3.Stack_Decision, 4.Repository_Structure, 5.Branching_Strategy, 6.Environment_Definitions, 7.Coding_Standards, 8.Testing_Strategy, 9.Definition_of_Done_and_Ready, 10.Tooling, 11.Communication_and_Escalation_Protocols, 12.Risk_Register_Update, 13.Phase_2_Brief
  (0.Phase_2_Execution_Order has no steps: skip it.)

## 2. Procedure for EACH deliverable (repeat exactly)

1. **Read** the master `N.Name.md`, every `example_step_*.md` and the `example_output_*.md` of that folder. Ignore `knowledge_base/` and `_archive/`.
2. **Inventory** — before writing anything, list every Step (N), sub-step (N.M) and micro-step (N.M.K) of the master's "Execution Steps", with their exact numbers and titles. The master decides the numbering. If an example_step file numbers something differently, follow the master and note the difference in the progress log (step 6).
3. **Write the spec** `C:\PROGRAMMING\PROJECTS\NoteVault\docs\canvas_specs\<PHASE_X>\<N.Name>.json`:
   - `phase` ("Phase 0" / "Phase 1" / "Phase 2"), `deliverable_code` (e.g. "D2"), `deliverable`, `purpose` (from the master's intro), `inputs` (from the master's Inputs table).
   - One entry per Step / sub-step / micro-step of your inventory — none missing, none merged. A checklist and its verdict are two micro-steps.
   - Per sub-step: `objective`, `input` (what it consumes), `raw_data_title` + `raw_data` (the concrete data extracted for the worked example), `exit_label` (its binary verdict → what it enables, e.g. "COMPLETE → v1 goes to the audit (1.2)").
   - Per micro-step: `objective`; `how_to` with the 4 fields:
     - `steps`: numbered concrete actions (read, cut, ask, compare, mark, copy…). Derive them from the master's *Operation* and rules. Never write a one-line summary.
     - `table_columns`: exact columns of the table this micro-step produces.
     - `table_rules`: what ONE row is and how each cell is filled.
     - `restrictions`: the rules that apply, citing the master's codes (R1–R6, C1–C5 or that deliverable's own codes) and "no new facts".
     - `done_when`: the verifiable closing condition (e.g. "4 × `PURIFIED`").
   - Also per micro-step: `example_title` and `example`, the filled table from the example_step file copied **verbatim** (never invent rows or facts); and `link_label`, what flows into the NEXT micro-step (≤ 45 characters).
   - Tables that grow across micro-steps are shown partial first, complete later.
   - `final`: title `Final Deliverable — NN. Name.md` and the `example_output` content copied **verbatim**.
   - Content language: English (same as the masters).
4. **Build and check** (from `C:\PROGRAMMING\PROJECTS\NoteVault`):
   ```
   python -m notevault_app.core.deliverable_canvas docs\canvas_specs\<PHASE_X>\<N.Name>.json "<deliverable folder>\<N.Name>_h.canvas"
   python tools\space_canvas_labels.py "<deliverable folder>\<N.Name>_h.canvas"
   python tools\check_canvas_groups.py "<deliverable folder>\<N.Name>_h.canvas"
   ```
   Required results: `still tight: 0` and `0 problem(s)`. If not, fix the SPEC and rebuild. Never edit coordinates by hand.
5. **Self-review** against SKILL section 7: every micro-step of the inventory exists; every How-to has the 4 sections with real procedure; every example is verbatim from the example_step file; every arrow is labelled; the final deliverable is verbatim.
6. **Log** in `C:\PROGRAMMING\PROJECTS\NoteVault\docs\canvas_specs\PROGRESS.md` one line per deliverable: `- [x] PHASE_X / N.Name — <n> steps, <n> sub-steps, <n> micro-steps — checks OK — notes: <numbering differences, missing examples, doubts>`.

## 3. Hard rules

- The output file is ALWAYS a new `<N.Name>_h.canvas` next to the master. Never modify or delete existing files: masters `.md`, `example_*`, `knowledge_base/`, other `.canvas` files (e.g. `2.Non_Negotiable_Constraints_steps.canvas`, `3.stack_decision_steps.canvas` stay as they are), and never touch `1.Problem_statement_h.canvas`.
- Never modify anything under `FULLSTACK_FACTORY`.
- Do not use `add_substep_block` / `add_substeps` (legacy format). Use the spec + `deliverable_canvas` builder.
- Do not invent facts, rows, evidence IDs or numbers. If a micro-step has no example in the example_step files, write the example as `*(No worked example in example_step_N — to be completed)*` and log it.
- If the NoteVault app is open (`tasklist | findstr NoteVault`), it does not matter for NEW files, but do not open a canvas in the app while you are regenerating it.
- STOP and ask me only if a master has no "Execution Steps" at all, or if a folder in the list does not exist.

## 4. When you finish (or after each phase)

Report: the deliverables done, the counts per deliverable, every check result, and the full list of notes/doubts from PROGRESS.md. I will open the canvases in NoteVault to review them.

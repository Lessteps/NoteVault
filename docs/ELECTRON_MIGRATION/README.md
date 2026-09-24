# NoteVault → Electron + TypeScript migration (Antigravity work package)

This folder is the **complete, delegated plan** for migrating NoteVault from
pywebview+Python to a pure-TypeScript Electron app. It is written so an editor
agent (Antigravity) does the mechanical porting while a human/architect only
supervises. Target: finish before Sunday.

## What is already done (by Claude, the reference)

- The 4 architecture docs in this folder (read them, in order).
- A **verified reference module**: `frontend/src/core/frontmatter.ts` +
  `frontmatter.test.ts` (9 tests green), plus foundation helpers
  `errors.ts`, `text.ts`, `num.ts`, `dates.ts`. Copy their style.
- `frontend` typecheck clean and `npx vitest run` green (71 tests) with these in.

## Read in this order

1. `00_MASTER_HANDOFF.md` — goal, target architecture (FIXED), IPC bridge,
   workflow, what NOT to port, definition of done, batch order.
2. `01_CONVENTIONS.md` — the Python→TypeScript translation cheat sheet.
3. `02_MODULE_MAP.md` — every file → its destination, dependency-ordered batches,
   tests to port vs. drop.
4. `03_VAULT_CONTRACT.md` — byte-compatibility rules + golden-file test recipe.

## Execute in this order (one Antigravity task per prompt)

| Order | Prompt file | Output |
|---|---|---|
| 1 | `prompts/BATCH_00_SCAFFOLD.md` | Electron shell, build, IPC, bridge transport. App window opens. |
| 2 | `prompts/BATCH_01_08_CORE.md` §Batch 1 | Foundations (store, vaultFormat, recurrence, fileKinds, paths). |
| 3 | `prompts/BATCH_01_08_CORE.md` §Batch 2 | Vault & notes. |
| 4 | §Batch 3 | Simple managers (task, habit, area). |
| 5 | §Batch 4 | Finance, goals, projects, schedule, exercise, workspaces, graph. |
| 6 | §Batch 5 | Practice / study subsystem. |
| 7 | §Batch 6 | English (subtitles, mining, managers). |
| 8 | §Batch 7 | Canvas (format, builder, methodology). |
| 9 | §Batch 8 | AI client, web store. |
| 10 | `prompts/BATCH_09_API.md` | API layer + IPC registry. App works end to end. |
| 11 | `prompts/BATCH_10_CUTOVER.md` | Build the .exe, delete Python, docs. |

## Non-negotiable rules for the agent

1. **Behaviour must not change.** This is a translation of tested logic. Vault
   files must stay byte-identical (`03_VAULT_CONTRACT.md`).
2. **Do batches in order.** Each imports the previous ones.
3. **Never advance with a red test or a type error.** After every file:
   `npm run typecheck` clean and `npx vitest run` green (run from `frontend/`).
4. **Do not invent architecture.** It is fixed in `00`. When unsure, copy the
   reference module (`frontend/src/core/frontmatter.ts`).
5. **Port each module's tests with it.** A module is done only when its test is
   green. Port all `test_webapp_*` in Batch 9 — they are the acceptance suite.
6. Commit after each batch (message format in each prompt) and push the branch.

## How to hand a batch to Antigravity

Paste, as the task, the batch's prompt file **plus** this line:
> Working dir: `frontend/`. Read `docs/ELECTRON_MIGRATION/00`–`03` before coding.
> Follow the reference module `frontend/src/core/frontmatter.ts`. Do not stop
> until this batch's Acceptance section passes.

Start with `BATCH_00_SCAFFOLD.md`.

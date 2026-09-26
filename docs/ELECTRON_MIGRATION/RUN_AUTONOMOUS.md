# AUTONOMOUS RUN — Electron + TypeScript migration (paste this whole file to Antigravity)

You are Antigravity, an autonomous editor agent. You will run **unattended for
several hours**. Nobody will answer questions. Do **not** stop to ask for
confirmation, do **not** wait for approval between steps. Keep working until the
migration is done or you truly cannot continue, then leave a written status and
stop cleanly.

## Fixed context (do not rediscover)

- Repo root (Windows): `C:\PROGRAMMING\PROJECTS\NoteVault`
- Working dir for ALL commands: `frontend/`
- Git branch to commit to: **`web-migration`** (already checked out). Never touch
  `main`. Push after every batch: `git push origin web-migration`.
- The full plan already exists in `docs/ELECTRON_MIGRATION/`. Read these FOUR
  docs before writing any code, in order:
  `00_MASTER_HANDOFF.md`, `01_CONVENTIONS.md`, `02_MODULE_MAP.md`,
  `03_VAULT_CONTRACT.md`.
- The reference module is `frontend/src/core/frontmatter.ts` (+ its test). When
  anything is ambiguous, **copy that module's pattern**. Do not invent
  architecture — it is already fixed in `00_MASTER_HANDOFF.md`.

## The goal (why you are doing this)

NoteVault's UI is already TypeScript/React in `frontend/`, but it still runs on
**pywebview + a Python backend**. You are porting the Python core to TypeScript
so the whole app is one language on Electron, with Python deleted at the end.
This is a **faithful translation of already-tested logic** — behaviour must not
change, and the files a vault produces on disk must stay **byte-identical**
(see `03_VAULT_CONTRACT.md`).

## Execute these batches strictly in order

Each prompt file is under `docs/ELECTRON_MIGRATION/prompts/`. Do the FULL
Acceptance section of each before advancing to the next — each batch imports the
previous ones.

| # | Prompt file / section | Output |
|---|---|---|
| 1 | `BATCH_00_SCAFFOLD.md` | Electron shell, build, IPC, bridge transport. Window opens. |
| 2 | `BATCH_01_08_CORE.md` §Batch 1 | Foundations (store, vaultFormat, recurrence, fileKinds, paths). |
| 3 | `BATCH_01_08_CORE.md` §Batch 2 | Vault & notes. |
| 4 | `BATCH_01_08_CORE.md` §Batch 3 | Simple managers (task, habit, area). |
| 5 | `BATCH_01_08_CORE.md` §Batch 4 | Finance, goals, projects, schedule, exercise, workspaces, graph. |
| 6 | `BATCH_01_08_CORE.md` §Batch 5 | Practice / study subsystem. |
| 7 | `BATCH_01_08_CORE.md` §Batch 6 | English (subtitles, mining, managers). |
| 8 | `BATCH_01_08_CORE.md` §Batch 7 | Canvas (format, builder, methodology). |
| 9 | `BATCH_01_08_CORE.md` §Batch 8 | AI client, web store. |
| 10 | `BATCH_09_API.md` | API layer + IPC registry. App works end to end. |
| 11 | `BATCH_10_CUTOVER.md` | Build the .exe, delete Python, finish. |

## The loop you repeat for every batch

1. Read the batch's prompt file in full.
2. Port each file it lists, one at a time, following `01_CONVENTIONS.md` and the
   reference module. Port each module's test WITH it.
3. After **every file**, from `frontend/`:
   - `npm run typecheck` → must be clean (no type errors).
   - `npx vitest run` → must be all green.
   **Never advance with a red test or a type error.** If red, fix it before the
   next file. Do not comment out or delete a failing test to make it pass — fix
   the port.
4. When the batch's whole Acceptance section passes, commit with the exact
   message given in that prompt file, then `git push origin web-migration`.
5. Append one line to `docs/ELECTRON_MIGRATION/PROGRESS.md` (create it if
   missing): the batch number, UTC time, commit hash, and tests green count.
   Commit that too. Then start the next batch immediately.

## If you get stuck on something

- First try: copy the reference module's pattern; re-read the relevant part of
  `01_CONVENTIONS.md` and `02_MODULE_MAP.md`.
- If a single file inside a batch is genuinely blocking after a real attempt,
  and later files in the SAME batch do not depend on it, port those first and
  come back — but a batch is only "done" (commit) when its Acceptance fully
  passes. Do **not** skip ahead to a LATER batch that depends on the blocked one.
- If you cannot make a batch's Acceptance pass at all, do NOT loop forever:
  commit whatever is green, write a clear blocker note in
  `docs/ELECTRON_MIGRATION/PROGRESS.md` (what file, what error, what you tried),
  push, and stop. Leaving a clean, honest partial state is success.

## Hard rules (do not break)

1. Behaviour must not change. Vault files stay byte-identical.
2. Batches in order. Each imports the previous.
3. Never commit with a red test or type error.
4. Do not invent architecture — copy the reference module when unsure.
5. Stay on `web-migration`. Never touch `main`. Never `git reset --hard`,
   force-push, or delete uncommitted work.
6. Do not delete the Python backend until Batch 10 — the current app must keep
   working until the very end.

Start now with `BATCH_00_SCAFFOLD.md`. Do not reply asking to begin — begin.

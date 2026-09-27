# Fix — notes won't open + fully integrate the top bar with the tab strip

For DeepSeek (Hermes agent). Working dir: `frontend/`. UI text **Spanish**;
code/comments/docs/commits **English**. After every file: `npm run typecheck`
clean + `npx vitest run` green (run both from `frontend/`). **When done you MUST
`git add` + `git commit` + `git push origin web-migration`** — the work is not
finished until it is pushed. Never touch `main`; never force-push or reset.

Two problems, both caused by the recent Obsidian-style tab-strip change
(INTERFACES_V3 Area A). Fix both.

---

## Problem 1 (CRITICAL) — no note opens or previews anymore

Clicking a note in the explorer no longer opens or shows anything; the editor area
stays empty. This is a regression from the new tab model. The store now keeps a new
tab list (`openTabs: AppTab[]`, `activeTabId`, `pinnedTabIds`) AND legacy derived
fields (`active`, `tabs`, `module`) computed by a wrapped `set`. Something in the
open-note chain is broken.

Files: `frontend/src/store/app.ts`, `frontend/src/components/notes/EditorArea.tsx`,
`frontend/src/components/notes/NotesModule.tsx`,
`frontend/src/components/notes/FileTree.tsx` / `Explorer.tsx`, `frontend/src/App.tsx`
(`ModuleView`).

**Trace and repair the WHOLE chain — verify each link actually fires:**
1. **Explorer click → `openNote(path)`.** Confirm the file-tree row still calls
   `useApp.getState().openNote(path)` (or `openTab({kind:"note",path})`) and was not
   rewired to something that skips setting the active note.
2. **`openNote` sets state correctly.** It must: add/keep the `note:<path>` tab, set
   `activeTabId = "note:<path>"`, set `module = "notas"`, and load `notes[path]`.
   (It looks correct in `store/app.ts` — verify the wrapped `set` actually runs for
   these calls.)
3. **Derived `active`.** The wrapped `set` derives `active = activePathOf(...)` from
   `activeTabId`. Confirm `active` becomes the note path after `openNote`, and that
   the derivation runs on EVERY `set` (not only some paths). Add a unit test:
   after `openNote("X.md")`, `getState().active === "X.md"` and
   `getState().module === "notas"`.
4. **`ModuleView` renders NotesModule.** `App.tsx` picks the view from `s.module`.
   Since a note tab sets `module="notas"`, NotesModule must render. Verify that when
   `activeTabId` points to a note/canvas tab, `module` is always `"notas"` (module
   and active tab must never disagree). If the active tab is a note but `module` is
   something else, that is the bug — keep them in sync in the wrapped `set`.
5. **`EditorArea` shows the note.** It reads `s.active ? s.notes[s.active]`. Confirm
   it still renders the note body for the active path and that its rendering was not
   left depending on a removed inner tab bar.

**Definition of done for Problem 1:** clicking any note opens it and shows its
content; switching between note tabs shows each note; opening a canvas shows the
canvas. Add/adjust tests so a regression here is caught. Do NOT paper over it by
forcing `module="notas"` globally — fix the actual link that is broken.

## Problem 2 — the top bar must be ONE bar fused with the tab strip

The user has asked twice: the app's **top bar** (brand "NoteVault", vault name,
sync/"Guardado" status, window controls) must be **fully integrated into the same
horizontal row as the tab strip** — one single bar, Obsidian-style — not two stacked
bars. Two stacked bars steal vertical space and make the interface feel "reduced".

Files: `frontend/src/components/Shell.tsx` (`TopBar`), the tab strip component,
`frontend/src/App.tsx` (layout order).

Do this:
1. **Merge into a single top row.** One bar that contains, left to right: the
   left workspace icons (panel/folder/search/bookmark), the **tabs** (each open
   module/note as a tab, with the pin behaviour already added), the **+** button,
   a flexible spacer, then on the right the vault/sync status ("Guardado" /
   "Sincronizado") and the window controls (min/max/close). No separate second bar.
2. **Remove the old standalone TopBar row** and its **global search field** (it is
   redundant with the integrated notes search / `Ctrl P`). Keep `Ctrl P` opening
   the QuickSwitcher.
3. Reclaim the vertical space the old bar used — the content area must grow so the
   interface no longer feels reduced.
4. Keep the window still draggable (the bar is the title bar): apply
   `-webkit-app-region: drag` to the bar background and `no-drag` to the tabs,
   buttons and window controls.
5. Verify visually by rendering (grab a screenshot and compare): it must read as a
   single integrated title/tab bar, like the reference the user gave
   (`docs/INTERFACES_V3/navbar_ref.png`), not two rows.

**Definition of done for Problem 2:** there is exactly one top bar; it holds the
tabs and the vault/sync status and window controls together; no separate search
bar; the content area is taller than before.

## What NOT to do

- Do NOT redesign anything beyond these two problems. No new features, no palette
  changes, no touching the Estudio/practice system, the canvas engine, or the
  webview.
- Do NOT delete the tab model or revert Area A — fix it in place.
- Do NOT remove the pin-tab behaviour or per-vault pinned-tab persistence.
- Do NOT change UI language (stays Spanish) or the `web-migration` branch.

## Finish

`npm run typecheck` clean, `npx vitest run` green, `npm run electron:build`
launches and both problems are fixed in the built app. Then:
`git commit -m "fix(ui): restore note opening and fuse the top bar into the tab strip"`
and **`git push origin web-migration`**.

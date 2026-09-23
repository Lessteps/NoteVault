# Plan v2 — Canvas groups/subgroups, note interaction fixes, bottom toolbar, backlinks

> **Handoff document.** Written so **Antigravity** can execute any task end-to-end
> even if Claude runs out of tokens. Every task has: exact file + anchor, what to
> change, function signatures, and acceptance criteria. Owner is a suggestion
> (Claude = core/logic/bugs, Antigravity = UI/layout/wiring); if Claude is
> unavailable, Antigravity does the Claude tasks too using the same specs.

## STATUS (updated by Claude)

- ✅ **E1 — backlinks detection FIXED.** Root cause was NOT self-exclusion: it was
  that `attachments/` folders were being walked by the note index, so `.md`
  copies inside a note's `attachments/` folder appeared as phantom notes and
  produced duplicate backlinks. Fixed in `vault_manager.is_ignored_dir` (now
  skips `ATTACHMENTS_DIR`). Verified against the real FULLSTACK vault:
  `1.Problem_Statement.md` now returns 8 clean backlinks incl. `processmap.md`
  and `PHASE_0_PROBLEM_RECOGNITION.md`. `mentions()` (aliases/underscore/title)
  already worked from the previous session — what the user saw was the STALE exe.
  Regression test added: `test_attachments_folder_notes_are_not_indexed`.
- ✅ **D1 — edit embedded note FIXED.** `NoteNodeItem` is now `ItemIsFocusable`;
  `_enter_edit` disables `ItemIsMovable` + focuses the proxy/editor, `_commit_edit`
  restores it. Tests: `test_edit_mode_disables_and_restores_move_flag`.
- ✅ **D2 — wheel over a note FIXED.** `CanvasView.wheelEvent` now forwards the
  wheel to the note under the cursor via `NoteNodeItem.scroll_content()`; canvas
  only pans/zooms over empty space (Ctrl+wheel still zooms). Test:
  `test_scroll_content_returns_false_when_nothing_to_scroll`.
- ✅ **D3-core — middle-click DONE (signal side).** `CanvasView` emits
  `open_note_in_new_tab_requested(Path)` on middle-click over a note;
  `NoteNodeItem` has `open_in_new_tab_requested`. Helper `_note_item_at()` added.
- ⏳ **D3-wiring — TODO (Antigravity).** Connect
  `CanvasView.open_note_in_new_tab_requested` in `main_window.py` to a new
  `MarkdownEditor.open_note_new_tab(path)` that always creates a fresh tab and
  selects it. Also add middle-click → new tab in the notes explorer
  (`notes_sidebar.py`). Until wired, middle-click detects the note but nothing
  opens.
- ✅ **B2 — snap-to-objects DONE (logic).** `CanvasView._snap_to_objects` (default
  True) + `set_snap_to_objects()`. `BaseNodeItem._snapped_to_objects()` nudges a
  moving node's left/center/right & top/center/bottom edges to nearby nodes'
  edges (6px). Applied in `itemChange`. Visual alignment guide lines are NOT yet
  drawn — that's the only remaining polish for Antigravity (draw transient guides
  in `_align_guides`, cleared on release).
- ✅ **B3 — read-only DONE.** `CanvasView.set_read_only()/is_read_only()`. All
  structural mutators go through `_begin_mutation()` (blocks in read-only + pushes
  undo); `_delete_selected` guarded; item move flags toggled. Pan/zoom/open still
  work.
- ✅ **A1 — recursive subgroups DONE.** `GroupNodeItem` now captures every node
  FULLY CONTAINED in the group rect (including nested groups AND their contents)
  and drags them together, no double-move. Dragging an outer group moves inner
  groups + their notes.
- ✅ **A2 — create-group-from-selection DONE.** `CanvasView.create_group_from_selection()`
  wraps the current selection (24px padding) or drops an empty group; bound to
  `Ctrl+G`. (Antigravity: wire it to the "Create group" context-menu item in B1.)
- ✅ **C3 — undo/redo DONE.** `undo()`/`redo()` with a 50-deep `CanvasDoc`
  snapshot stack; snapshots pushed by `_begin_mutation()` (add/paste) and
  `_delete_selected`. Bound to `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`. NOTE: node
  MOVES are not yet snapshotted (only structural add/delete/paste). Follow-up:
  snapshot on move-commit (capture `_doc` on left-press over a node, push on
  release if geometry changed).
- 347 tests green (`test_canvas_v2.py` added). Exe rebuilt + copied.

Remaining Claude tasks: (B2 guide lines polish, C3 move-undo) — optional.
Remaining Antigravity tasks: **D3-wiring** (make middle-click actually open a new
tab), **B1** (context menu incl. wiring Snap-to-objects/Read-only/Create-group to
the methods above), **C1** (bottom toolbar), **C2** (right rail incl. undo/redo
buttons → `view.undo()/redo()`), **E2** (backlinks panel).

## Permanent project rules (non-negotiable)

1. **Never modify `FULLSTACK_FACTORY`.**
2. **After EVERY code change**, rebuild and copy the exe:
   ```bash
   pyinstaller NoteVault.spec --noconfirm
   cp dist/NoteVault.exe .
   ```
   If the exe is locked (app open), tell the user to close it; never fail silently.
3. **Obsidian parity**: the canvas must feel like Obsidian's canvas.
4. Run `python -m pytest -q` and keep it green. Add tests per task.
5. Canvas files (`.canvas`) are user files in the vault; their `nv` extensions
   must stay backward-compatible (Obsidian ignores unknown keys).

## Files that matter

- `notevault_app/ui/components/notes/canvas/view.py` — `CanvasView` (toolbar,
  wheel/mouse/context handlers, node factory `_add_item_for`, add_* methods).
- `notevault_app/ui/components/notes/canvas/items.py` — node items
  (`BaseNodeItem`, `GroupNodeItem`, `NoteNodeItem`, `CanvasEmbedItem`, …).
- `notevault_app/core/canvas_format.py` — `CanvasNode`/`CanvasEdge`/`CanvasDoc`.
- `notevault_app/ui/main_window.py` — hosts the canvas inside the notes area;
  connects `open_note_requested` to opening a note tab.
- `notevault_app/ui/components/notes/markdown_editor.py` — tabs + mentions footer.
- `notevault_app/core/notes_service.py` — `mentions()` / `link_identifiers()`
  (the single backlink source of truth, already alias/underscore aware).

---

# FEATURE A — Groups & subgroups (Obsidian-style)

**Goal:** create groups, drop notes/cards into them, move a group and everything
inside moves with it, and nest a group inside another group (subgroups).

### Current state
- `GroupNodeItem` exists (`items.py:451`). On press it collects intersecting
  non-group children by bounding box and drags them (`items.py:506`), but it
  **explicitly excludes other `GroupNodeItem`s** from being dragged, so
  subgroups do not move with their parent. There is no formal membership model —
  containment is purely spatial and recomputed on each press.

### A1 — Recursive spatial containment (Owner: Claude)
File: `items.py`, `GroupNodeItem.mousePressEvent` (~506) and `mouseMoveEvent` (~518).
- On press, collect **all** `BaseNodeItem`s (including nested `GroupNodeItem`s)
  whose scene bounding rect is fully contained in this group's scene rect, EXCEPT
  this group itself and any ancestor group. Store `(child, offset)` pairs.
- When a captured child is itself a group, do **not** also capture that group's
  own children directly (the child group will carry them). To avoid double-moves,
  capture only *direct* children: a node is a direct child of the innermost group
  that contains it. Compute innermost-container per node, then this group drags
  only the nodes whose innermost container is this group, plus direct child
  groups.
- Keep z-order correct: a group must paint behind its contents. On create and on
  every containment change, set `group.setZValue(min(child z) - 1)`. Nested
  groups get progressively lower z.

Acceptance:
- Dragging an outer group moves inner groups and all their notes together, once.
- Dragging an inner group moves only its own contents, not the outer group.
- No node moves twice (no accumulated offset drift).

### A2 — "Create group from selection" (Owner: Antigravity)
File: `view.py`.
- Add `create_group_from_selection()`: compute the union bounding rect of the
  selected `BaseNodeItem`s, pad by 24px, and create a `group` node
  (`add_group_node`) sized to that rect so the selection sits inside it.
- If nothing is selected, create an empty default group at the cursor
  (existing `add_group_node`).
- Wire this to the context-menu "Create group" (Feature B) and to a shortcut
  (e.g. `Ctrl+G`) in `keyPressEvent`.

Acceptance: selecting 2+ notes → "Create group" wraps them; moving the new group
moves them all.

### A3 — Group persistence sanity (Owner: Claude, small)
- Groups already persist as `type="group"` nodes. No format change needed for
  spatial membership. **Do not** add explicit child-id lists unless A1 proves
  insufficient; keep Obsidian-compatible.

---

# FEATURE B — Right-click creation menu (matches screenshot)

**Goal:** empty-space right-click shows exactly:
`Add card` · `Add note from vault` · `Add media from vault` · `Add web page`
(**DISABLED/DEFERRED** — greyed out, does nothing yet) · `Create group` · `Paste`
· `Snap to grid ✓` · `Snap to objects ✓` · `Read-only`.

### B1 — Restructure the empty-space context menu (Owner: Antigravity)
File: `view.py`, `contextMenuEvent` (~953), the `else` (empty space) branch.
- Replace current items with the list above, in that order, with the leaf icons
  shown in the screenshot (use the same emoji/icon set already used elsewhere).
- Map actions:
  - `Add card` → `add_text_node(scene_pt)` (a text card).
  - `Add note from vault` → `_pick_and_add_note`.
  - `Add media from vault` → `_pick_and_add_media`.
  - `Add web page` → **create the action but call `setEnabled(False)`** and add
    tooltip "Próximamente". Do NOT implement web pages now.
  - `Create group` → `create_group_from_selection` (Feature A2).
  - `Paste` → `paste(...)` (existing), enabled only if clipboard non-empty.
  - `Snap to grid` → checkable, toggles `_snap_to_grid` (existing).
  - `Snap to objects` → checkable, toggles `_snap_to_objects` (Feature B2).
  - `Read-only` → checkable, toggles `_read_only` (Feature B3).
- Keep the node-specific and edge-specific branches as they are.

### B2 — Snap to objects (Owner: Claude)
File: `view.py` + `items.py`.
- Add `self._snap_to_objects = True` in `__init__`.
- When moving/resizing a node and `_snap_to_objects` is on, snap the node's
  edges/center to the nearest other node's edges/center within a threshold
  (e.g. 6px in scene units), and draw temporary alignment guide lines while
  dragging. Implement in `BaseNodeItem.itemChange`/`mouseMoveEvent` reading
  `view._snap_to_objects`; reuse the pattern already used for `_snap_to_grid`.
- Guides are transient `QGraphicsLineItem`s cleared on release.

Acceptance: dragging a node near another aligns edges with a visible guide;
toggling the menu item disables it.

### B3 — Read-only mode (Owner: Claude)
File: `view.py` (+ item flags).
- Add `self._read_only = False`. `set_read_only(bool)`:
  - Toggle `ItemIsMovable` off on all node items; block edits (`add_*`, delete,
    drawing, edge creation) while on.
  - Panning/zoom still work; double-click to open a note still works.
- The context-menu item reflects and toggles it.

Acceptance: with Read-only on, nodes can't be moved/edited/deleted, but you can
still pan, zoom and open notes.

---

# FEATURE C — Canvas chrome relocation (bottom toolbar + right rail)

**Goal:** match screenshot 8. Move the creation toolbar to a **bottom-center**
floating bar (icons only) and add a **right vertical rail** for navigation.

### C1 — Bottom-center creation toolbar (Owner: Antigravity)
File: `view.py`, `_build_toolbar` (~88) and `resizeEvent` (~283).
- Rebuild the toolbar as an **icon-only, horizontally centered** floating
  `QFrame` pinned to the bottom of the viewport with a ~16px bottom margin.
  Icons (left→right), matching the screenshot: **Add card**, **Add note from
  vault**, **Add media from vault**, **Add web page** (disabled/deferred),
  **Create group**. Move less-common actions (shapes, drawing, connect, export,
  snap) into the right-click menu and/or an overflow "▾ More" button.
- Reposition in `resizeEvent`: `x = (viewport_width - bar_width) / 2`,
  `y = viewport_height - bar_height - 16`.
- Keep tooltips (Spanish labels) on each icon.

### C2 — Right vertical navigation rail (Owner: Antigravity)
New small `QFrame` pinned to the right edge, vertically, matching screenshot 8:
`settings (⚙)`, `info (ⓘ)`, `zoom in (＋)`, `reset/refresh (⟳)`, `fullscreen (⛶)`,
`zoom out (−)`, then a gap, `undo (�undo)`, `redo (↝redo)`, `help (?)`.
- Wire: zoom in/out reuse the `wheelEvent` scaling logic (extract a
  `zoom_by(factor)` helper); fullscreen = `zoom_to_fit`; refresh = reset zoom to
  1.0 and center; undo/redo = Feature C3; help/info/settings = placeholder popups
  for now.
- Reposition both bars in `resizeEvent`.

### C3 — Undo/redo stack (Owner: Claude)
File: `view.py`.
- Add a lightweight command stack capturing `CanvasDoc` snapshots (deep copy)
  before each mutating action (add/delete/move-commit/edit-commit/paste).
  `undo()`/`redo()` restore a snapshot and call `_rebuild()`.
- Cap history at ~50 entries. Wire `Ctrl+Z`/`Ctrl+Shift+Z` in `keyPressEvent`
  and the rail buttons (C2).

Acceptance: creating/moving/deleting nodes can be undone and redone; the rail and
shortcuts both work.

---

# FEATURE D — Note interaction fixes inside the canvas

### D1 — BUG: can't edit embedded notes (Owner: Claude)
Symptom: double-clicking a `NoteNodeItem` body does not let you type.
Root cause (to confirm): the node is `ItemIsMovable`; the embedded editor lives in
a `QGraphicsProxyWidget`, so the click starts an item drag / never lands keyboard
focus in the inner `QTextEdit`.
File: `items.py`, `NoteNodeItem` (`_enter_edit` ~710, `mouseDoubleClickEvent` ~784).
Fix plan:
- Add `setFlag(QGraphicsObject.ItemIsFocusable, True)` to `NoteNodeItem`.
- In `_enter_edit`: temporarily `setFlag(ItemIsMovable, False)` so drags become
  text selection; set focus explicitly on the inner editor via the proxy
  (`self._proxy.setFocus()` then `self._editor.setFocus()`), and make sure the
  proxy widget accepts focus (`self._pages.setFocusPolicy(Qt.StrongFocus)`).
- In `_commit_edit`/`eventFilter` FocusOut: restore `ItemIsMovable` (unless the
  node is locked/read-only).
- Verify the view isn't stealing the event: in `CanvasView.mousePressEvent`, when
  the press lands on a `NoteNodeItem` body that is in edit mode, call
  `super().mousePressEvent` so the proxy receives it (do not start pan/select).

Acceptance: double-click a note body in the canvas → caret appears, typing works,
clicking away saves and re-renders (existing autosave path).

### D2 — BUG: wheel over a note pans the whole canvas (Owner: Claude)
File: `view.py`, `wheelEvent` (~705).
- Before pan/zoom, hit-test the item under the cursor
  (`self.itemAt(event.position().toPoint())`, walk up parents to a
  `NoteNodeItem`/`CanvasEmbedItem`). If found AND no Ctrl (Ctrl still zooms the
  canvas), forward the wheel to that node's inner scroll area:
  find the inner `QTextBrowser`/`QTextEdit` (via the proxy widget) and adjust its
  `verticalScrollBar()`. Only pan the canvas when the pointer is over empty space
  or a non-scrollable node.
- Guard: if the inner widget is already at top/bottom, optionally let the canvas
  scroll (nice-to-have; not required for acceptance).

Acceptance: hovering a note and scrolling scrolls the note's content; hovering
empty canvas scrolls/pans the canvas; Ctrl+wheel always zooms the canvas.

### D3 — Middle-click a note → open in a NEW TAB (Owner: Claude core + Antigravity wiring)
Symptom today: middle button always starts panning (`view.py:750`).
- `items.py`: add signal `open_in_new_tab_requested = Signal(object)` to
  `NoteNodeItem` (and `CanvasEmbedItem`). Not needed on `BaseNodeItem`.
- `view.py` `mousePressEvent` (~734): when `event.button() == Qt.MiddleButton`,
  hit-test first. If the item under the cursor resolves to a `NoteNodeItem`/
  `CanvasEmbedItem`, emit its `open_in_new_tab_requested` (via a new
  `CanvasView.open_note_in_new_tab_requested = Signal(object)`) and DO NOT pan.
  Only start panning when middle-click is on empty space or a non-note node.
- `view.py` `_add_item_for`: connect each note/embed item's
  `open_in_new_tab_requested` → `self.open_note_in_new_tab_requested.emit`.
- **Wiring (Antigravity)**: in `main_window.py`, connect
  `CanvasView.open_note_in_new_tab_requested` to the notes area's
  "open in new tab" path. In `markdown_editor.py`, `open_note(path)` already
  creates/*reuses* a tab; add `open_note(path, new_tab=True)` or a dedicated
  `open_note_new_tab(path)` that always creates a new `_OpenNote` tab even if one
  exists, and select it.

Acceptance: middle-click a note node opens that note in a new tab in the notes
area; middle-click empty canvas still pans.

**Also (Antigravity):** middle-click in the notes **explorer** tree opens the
note in a new tab too (same `open_note_new_tab`). File: `notes_sidebar.py` mouse
handling.

---

# FEATURE E — Backlinks

### E1 — BUG: backlinks still not detected (Owner: Claude) — INVESTIGATE FIRST
Context: the FULLSTACK vault (`C:\PROGRAMMING\Programación\FULLSTACK_DEVELOPMENT`)
stores each deliverable in its own nested folder (e.g.
`PHASE_0.../1.Problem_Statement/1.Problem_Statement.md`,
`.../example_step_1_problem_statement.md`). Links like
`[[example_step_1_problem_statement]]` render, but the note shows **0 backlinks**.
`mentions()`/`link_identifiers()` were already made alias- and underscore-aware.

Hypotheses to check IN ORDER (do not assume; verify against the real vault):
1. **Index scope**: does `VaultManager.note_paths()` actually scan these deeply
   nested per-deliverable folders? Check `RESERVED_DIRS`, `is_ignored_dir`,
   `is_reserved`, the per-vault `explorer-ignore.txt` (it explicitly names
   `FULLSTACK_DEVELOPMENT` as an example to exclude — the user's vault may be
   excluding its own subtree), and `MAX_SCAN_NOTES` (4000). If the source notes
   are excluded from the index, their outgoing links are never scanned →
   0 backlinks. **This is the most likely cause.**
2. **Which widget shows "0 backlinks"**: find what feeds the bottom-right
   "N backlinks" status (grep `backlinks`). Confirm it calls the unified
   `NotesService.mentions()` / `get_backlinks()` and not a stale path.
3. **Embeds vs links**: `![[example_step_1_problem_statement]]` shows
   "No se encuentra el adjunto" — an **embed** (`![[...]]`) is being resolved as
   an attachment, not a note transclusion/link. Confirm embeds of `.md` notes
   resolve as note transclusions (see `expand_transclusions`) and that a note
   embed still counts as a backlink in `mentions()` (the `_WIKILINK_SCAN_RE` in
   notes_service currently matches `[[...]]`; verify it also counts `![[...]]`
   note embeds as linked mentions).
4. **Refresh**: confirm the backlinks/mentions recompute after the index walk
   completes (first open may show 0 until the async scan finishes).

Deliverable: identify the true cause, fix it, and add a regression test that
builds a temp vault with a nested per-deliverable folder layout mirroring
FULLSTACK and asserts the backlink is found.

### E2 — Backlinks panel UI (Owner: Antigravity, data from Claude)
Design an Obsidian-style backlinks interface (the one the user wants to build):
- A per-note panel with two collapsible sections: **Linked mentions** and
  **Unlinked mentions**, each row showing the source note title + the matching
  line, click → open (middle-click → open in new tab, Feature D3).
- Data comes from `NotesService.mentions(note)` → `(linked, unlinked)` lists of
  `Mention(path, title, line_no, line, linked)`. Do not re-implement matching.
- The bottom-right "N backlinks" status counts `len(linked)` for the active note.
- Reuse styling from the existing `_MentionsFooter` in `markdown_editor.py`; this
  panel can be a docked/toggleable version of it. Keep it index-backed and
  refreshed on note save/create/delete/move (2E from the previous plan).

Acceptance: opening a note with incoming `[[links]]` shows them under Linked
mentions; the count matches; clicking navigates.

---

# Suggested execution order

1. **Claude E1** (backlinks detection) — highest user pain, root-cause the index
   scope issue. Ship + test.
2. **Claude D1, D2, D3-core** (edit note, wheel-over-note, middle-click signal) —
   core interaction bugs.
3. **Antigravity D3-wiring, B1** (new-tab wiring, right-click menu) — depends on
   Claude signals/handlers.
4. **Claude B2, B3, A1, A3, C3** (snap-to-objects, read-only, recursive groups,
   undo/redo).
5. **Antigravity A2, C1, C2, E2** (create-group-from-selection, bottom toolbar,
   right rail, backlinks panel).
6. Rebuild the exe and run `pytest -q` after each block.

## Agent contract
- Claude owns core/model/bug logic and stabilizes signatures
  (`open_note_in_new_tab_requested`, `open_note_new_tab`, `set_read_only`,
  `_snap_to_objects`, undo/redo API). Antigravity builds UI on top of those
  without changing matching logic or the `.canvas` data format.
- **Web pages are explicitly deferred** — build the disabled menu entry only.
- Neither agent touches `FULLSTACK_FACTORY`. Keep the test suite green.

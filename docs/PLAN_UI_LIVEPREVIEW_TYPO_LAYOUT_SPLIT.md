# Plan — Notes UI overhaul: Live Preview, typography, responsive layout, split

> **Handoff document.** Written so **Antigravity** can execute its half end to end
> without Claude, and so Claude can execute its half in parallel. Every task has
> exact files + anchors, the change, and acceptance criteria.
>
> **Work split (owner's rule):** Claude does the **hard-but-short** core logic;
> Antigravity does the **easy-but-long, repetitive** breadth work (styling every
> element, swapping strings across many files, tuning at many sizes, writing the
> per-element tests). Neither agent touches `FULLSTACK_FACTORY`.

## Permanent project rules (non-negotiable)

1. **Never modify `FULLSTACK_FACTORY`.**
2. **After every code change**, rebuild and copy the exe, or say why not:
   ```bash
   python -m PyInstaller NoteVault.spec --noconfirm
   cp dist/NoteVault.exe NoteVault.exe   # tell the user to close the app if locked
   ```
3. **Never autosave a re-serialisation that loses content.** The Live Preview
   work below is deliberately built on the *raw source buffer* (`NoteSourceEdit`),
   which never re-serialises, precisely to avoid the lossy round-trip of the
   rich `NoteTextEdit`. Do not move Live Preview onto the rich editor.
4. **UI text in Spanish; code and docs in English.**
5. Keep `python -m pytest -q` green; add a test per element/behaviour you touch.
6. Verify visually: grab each view in **light and dark** with
   `QWidget.grab().save(...)` and look at it before calling UI work done.

## Files that matter

| Concern | File | Anchors |
|---|---|---|
| Markdown source styling + concealment | `notevault_app/ui/components/notes/md_highlighter.py` | `MarkdownHighlighter.highlightBlock`, `_paint_inline`, `f_wikilink_hide`, `active_block` |
| Source editor + active-line reveal | `notevault_app/ui/components/notes/note_view.py` | `NoteSourceEdit` (:666), `_mark_current_line` (:725) |
| Rendered typography (read view) | `notevault_app/ui/components/notes/note_view.py` | `style_document`, `NoteTextBrowser` |
| Modes / fonts / tab row | `notevault_app/ui/components/notes/markdown_editor.py` | `_init_ui` (:178), `_build_tab_row` (:268), `_mode_for`, `_load_into_view` |
| Split container | `notevault_app/ui/components/notes/split_notes.py` | `SplitNotes` |
| Window layout | `notevault_app/ui/main_window.py` | `main_splitter` (:297), `_left_stack`/`_right_stack`, `CENTER_PANEL_INDEX` |
| Theme + global QSS | `notevault_app/ui/theme.py`, `notevault_app/ui/styles.py` | font families, `tint()` |
| Packaging | `NoteVault.spec` | `datas` (bundle a font), `hiddenimports` |

---

# FEATURE A — Obsidian-style Live Preview (the flagship)

**Goal:** in the everyday writing surface (Markdown mode = `NoteSourceEdit`) the
markdown *reads rendered* — no visible `#`, `**`, `-`, `>`, `[ ]` — and the raw
syntax of a line appears **only when the caret is on that line**, exactly like
Obsidian's Live Preview. Lists must render the same way.

**What already exists (do not rebuild it):**
- `MarkdownHighlighter` already tracks `active_block` and already **conceals**
  text with `f_wikilink_hide` (`setFontPointSize(0.1)` + transparent colour),
  showing `[[a/b/c|Alias]]` as just **Alias** on inactive lines and the full raw
  on the caret's line. This is the exact technique to reuse.
- `NoteSourceEdit._mark_current_line` (note_view.py:725) already sets
  `active_block` and `rehighlightBlock()`s the previous and current block on every
  caret move. **The reveal-on-active-line machinery is done.**

So Live Preview = **extend the existing concealment from wikilinks to every other
marker.** Nothing new is wired; the highlighter just hides more.

### A1 — Concealment engine (Owner: **Claude**, hard/short)
File: `md_highlighter.py`.
- Add one reusable concealed format `self.f_hide` built like `f_wikilink_hide`
  (0.1 pt, transparent foreground). Add a helper
  `self._hide(a, length)` that `setFormat`s a run to `f_hide` **only when the
  current block is not `active_block`** (on the active block, leave the raw
  markers visible and merely dim them with `f_marker`, as today).
- In `highlightBlock`, after computing each block marker span, route the marker
  characters through `_hide` on inactive blocks instead of `f_marker`:
  - **Headings**: hide `heading.group(2)` (`#`…`######`) **and** the following
    space `heading.group(3)` on inactive blocks; keep the heading body sized via
    `f_heading[level]`. (Currently only dimmed — change to hidden.)
  - **Quote** `>`/`> `: hide `quote.group(1)` on inactive blocks (a left border is
    Antigravity's A4).
  - **Bullet** `-`/`*`/`+`: on inactive blocks replace the marker glyph with a
    real bullet by concealing the source char and letting Antigravity's A4 draw
    the "•" — for A1 it is enough to hide the raw `-`/`*`/`+` marker run and keep
    numbered markers (`1.`) visible (Obsidian keeps ordered numbers).
  - **Task box** `[ ]`/`[x]`: this is A2.
- In `_paint_inline`, generalise the wikilink approach to the emphasis/code/
  highlight/strike rules: for each `_INLINE` match on an **inactive** block, hide
  the delimiter runs and format only the inner text (bold/italic/etc.); on the
  **active** block, show the whole match dimmed as today. Concretely, extend the
  `_INLINE` table so each entry knows its **delimiter length** (`**`=2, `*`=1,
  `` ` ``=1, `==`=2, `~~`=2, `_`=1, `__`=2), then hide `[a, a+dlen)` and
  `[b-dlen, b)` on inactive blocks and apply the style to the middle.
- Keep the `taken[]` bookkeeping and `QTextCharFormat.merge` pattern intact, and
  keep the `_INLINE_HINT_RE` fast-path (do not slow the highlighter down).
- **Acceptance:** on a note like image 8, an inactive line `## Title`,
  `**bold**`, `- item`, `> quote`, `` `code` `` shows *Title* (large), **bold**,
  • item, quoted text, `code` — with the markers invisible; clicking that line
  shows the raw markers again; moving away hides them. No file bytes change
  (assert the document text is untouched after highlighting).

### A2 — Real checkbox glyph in source (Owner: **Claude**, hard/short)
File: `md_highlighter.py`.
- On inactive blocks, conceal the raw `[ ]`/`[x]` (`task.group(2)`) and render a
  box glyph in its place. Since a highlighter cannot insert characters, use the
  concealment + a leading glyph drawn by the editor: simplest reliable route is
  to **replace the two inner characters' appearance** — hide `[`, `]` and map the
  middle space/x to a box via format (colour + a box-drawing font), or, if that
  is not crisp, hand off the actual painting to Antigravity's A5 (paint a square
  over the concealed run, mirroring the desktop `_paint_checkbox` technique in the
  rendered views). Deliver whichever is crisp; document which.
- **Acceptance:** `- [ ] x` reads as ☐ x and `- [x] y` as ☑ ~~y~~ on inactive
  lines; the caret line shows the raw `- [ ]`. Clicking the box still toggles
  (existing `Ctrl+L`/click path must keep working).

### A3 — Guard rails (Owner: **Claude**, small)
- Concealment must be **off for code files** (`is_code` already disables the
  highlighter) and **inside fenced code blocks** (already handled by `IN_CODE`).
- Concealment must never run while `enabled` is false. Add a regression test that
  the highlighter leaves `document().toPlainText()` byte-identical.

### A4 — Per-element rendered styling (Owner: **Antigravity**, easy/long)
File: `md_highlighter.py` formats + `note_view.py` block styling.
- Heading line-height/scale polish per level (reuse `HEADING_SIZES`), extra space
  above headings.
- **List indentation guides** (vertical lines at each ancestor indent, Obsidian
  style) in the source view — mirror the guides already drawn in the rendered
  view; paint them in `NoteSourceEdit.paintEvent`.
- Quote **left colour bar** painted behind quote blocks.
- Fenced code **block background** spanning the whole block, not per glyph.
- Do the same tuning for the read-only render (`style_document`) so Editor/Read
  match the source Live Preview.
- Tune every colour through `theme.tint()` and verify both themes with grabs.
- **Acceptance:** headings, lists (with guides), quotes (with bar), code blocks
  look like image 7 in both themes; one screenshot per element committed to the
  PR description.

### A5 — Tests per element (Owner: **Antigravity**, easy/long)
File: `tests/test_md_highlighter.py` (new).
- One test per element asserting: (a) on an inactive block the marker run carries
  `f_hide` (0.1 pt / transparent); (b) on the active block it does not; (c) the
  document text is unchanged. Drive `active_block` directly and call
  `rehighlightBlock`. Cover heading, bold, italic, code, highlight, strike,
  quote, bullet, task, wikilink (regression).

---

# FEATURE B — Friendlier note typography

**Goal:** notes render in a softer, friendlier typeface than
`Segoe UI Variable Text`.

### B1 — Bundle + load one friendly font (Owner: **Claude**, short)
- Pick a warm, highly readable open font (recommended: **Lexend** or
  **Nunito Sans**; both are rounded and "amable"). Add the `.ttf`(s) under
  `assets/fonts/`.
- Load it once at startup via `QFontDatabase.addApplicationFont(...)` (in
  `notevault_app/main.py` or `MainWindow.__init__`) and expose a single constant
  `NOTE_FONT_FAMILY` from `theme.py`.
- **Acceptance:** `QFontDatabase.families()` contains the family after startup;
  one constant is the single source of truth.

### B2 — Apply the family everywhere notes render (Owner: **Antigravity**, long)
- Replace the hard-coded `'Segoe UI Variable Text','Segoe UI'` note font with
  `NOTE_FONT_FAMILY` in: `markdown_editor.py` (`self._rich`, `self._raw`,
  `self._read` stylesheets), `note_view.py` (viewer/editor styles),
  `items.py` (canvas `NoteNodeItem` viewer), and any other note surface. Keep
  `Cascadia Mono` for code/source-file views.
- Add the font file to `NoteVault.spec` `datas` so the packaged exe ships it.
- **Acceptance:** every note surface uses the new family in the exe (not just the
  dev run); code views stay monospace; grabs in both themes.

---

# FEATURE C — Responsive layout (usable at half-screen width)

**Goal:** the window works when docked to half the screen; today the three-panel
splitter cannot shrink that far.

### C1 — Breakpoint controller (Owner: **Claude**, short)
File: `main_window.py`.
- Add a `resizeEvent` that, below width thresholds, auto-collapses side panels:
  e.g. `< 900px` hide the right stack (AI/assistant), `< 680px` also hide the
  left stack (explorer), restoring them above the threshold unless the user hid
  them manually. Track a "user-hidden" flag so auto-restore does not fight the
  user.
- Give the centre panel a small `minimumWidth` (e.g. 320) and make side panels
  `setCollapsible(True)`.
- **Acceptance:** dragging the window to half a 1080p screen keeps a usable
  editor; panels come back when widened.

### C2 — Minimum sizes + collapsible panels everywhere (Owner: **Antigravity**, long)
- Audit every panel (`_left_stack`, `_right_stack`, each module left panel, the
  notes explorer, the AI panel) and set sensible `minimumWidth`/`minimumHeight`
  so nothing clips or overlaps when narrow.
- Ensure the bottom canvas toolbar and the mentions footer wrap/scroll instead of
  clipping at narrow widths.
- **Acceptance:** at 1280/900/680/520 px window widths, no clipped controls, no
  horizontal scrollbars on chrome; screenshots at each width committed.

---

# FEATURE D — Split polish + drag-a-tab-to-split

**Goal:** the split (Feature already shipped as `SplitNotes`) should feel solid,
and a **tab dragged out of its bar should create/target a split**, Obsidian style.

### D1 — Harden the current split (Owner: **Claude**, short)
File: `split_notes.py`.
- Fix the rough edges the owner reported ("no funciona muy bien"): panes should
  size equally on creation and on window resize (call `_equalize` from a
  `resizeEvent`); the active pane must be visually indicated (a 2px accent top
  border on the active pane's tab row); focus must land in the pane you click;
  closing a pane must move focus to a neighbour.
- **Acceptance:** split → both halves equal; click a pane → it becomes active and
  new opens land there; close → focus moves, no blank pane.

### D2 — Drag a tab to split / move between panes (Owner: **Claude**, hard)
Files: `markdown_editor.py` (tab bar), `split_notes.py`.
- Make each pane's `QTabBar` a drag source for its `_OpenNote`. Detect a drag that
  leaves the bar; while dragging over the editor area, show drop zones (left /
  right / centre) — centre = move into that pane, left/right edge = split and drop
  there. On drop, move the `_OpenNote` (its `path`, dirty body, pinned state)
  from the source pane to the target/new pane and select it; if the source pane
  becomes empty, close it (existing `became_empty` path).
- Claude delivers the drag/drop protocol, the drop-zone hit-testing, and the
  cross-pane `_OpenNote` transfer (the hard core). Do **not** re-serialise the
  note on transfer — move the in-memory `_OpenNote` object.
- **Acceptance:** drag a tab to the right edge → new right pane with that note;
  drag onto another pane's centre → the tab moves there; the source pane closes if
  emptied; no note content is lost across the move.

### D3 — Drop-indicator overlay + vertical split (Owner: **Antigravity**, long)
- Paint the translucent blue drop-zone overlay while dragging (Obsidian look).
- Add a "split down" (vertical) option (`Ctrl+Shift+\`) reusing `SplitNotes` with
  a `Qt.Vertical` nested splitter, plus context-menu items on the tab.
- **Acceptance:** dragging shows a clear highlighted target region; vertical split
  works and persists within the session.

---

# Suggested execution order

1. **Claude A1–A3** (Live Preview concealment) — highest owner value; it reuses
   existing machinery so it is short. Ship + `test_md_highlighter.py` skeleton.
2. **Antigravity A4–A5** (element styling + full test matrix) on top of A1.
3. **Claude B1** then **Antigravity B2** (typography).
4. **Claude C1** then **Antigravity C2** (responsive).
5. **Claude D1**, then **Claude D2**, then **Antigravity D3** (split).
6. Rebuild the exe and run `pytest -q` after each block.

## Agent contract
- Claude owns and stabilises the hard cores and their signatures: the
  concealment engine in `md_highlighter.py`, the breakpoint controller in
  `main_window.py`, and the tab drag/drop + `_OpenNote` transfer in
  `split_notes.py`. Antigravity builds styling, string-swaps, size tuning, drop
  overlays and tests **on top of** those without changing the concealment logic,
  the raw-buffer guarantee, or the data format.
- Web-page canvas nodes and any format changes remain out of scope here.

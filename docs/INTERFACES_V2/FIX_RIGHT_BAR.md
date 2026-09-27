# Fix — one right bar for Asistente + Navegador, not two duplicate nav bars

Paste this to Antigravity. Working dir: `frontend/`. UI text Spanish; code/docs
English. After every file: `npm run typecheck` clean + `npx vitest run` green.
**Commit AND push to `web-migration`** (`git push origin web-migration`). Never
touch `main`.

## The bug

The Notes module shows the **same icons in two bars**. The note's top toolbar
(`frontend/src/components/notes/EditorArea.tsx`, `NoteHeader`) has ✨ Asistente IA,
🌐 Navegador web and ▮ Panel lateral. At the same time
`frontend/src/components/notes/NotesModule.tsx` renders a thin **vertical right
rail** (`<aside aria-label="Acceso panel lateral">`, shown when the right panel is
collapsed) with 🌐 Navegador and ▮ Panel. So Navegador and Panel appear twice —
two navigation bars with the same thing.

The user wants **Asistente and Navegador to live in the right bar**, in **one**
bar, with no duplication.

## The fix — the right vertical rail is the single home

1. **`NotesModule.tsx` — make the collapsed right rail the one control bar.** The
   `<aside>` rail should hold three buttons, top to bottom:
   - ✨ **Asistente IA** — toggles the assistant (`useAssistant.getState().setOpen(...)`).
   - 🌐 **Navegador** — `useApp.getState().setModule("web")` (already there).
   - ▮ **Panel lateral / Estudio** — `useApp.getState().toggleInspector()` (already there).
   Keep its styling; just add the Asistente button as the first item.

2. **`EditorArea.tsx` `NoteHeader` — remove the duplicates.** Delete the three
   IconButtons: Asistente IA (`Sparkles`), Navegador web (`Globe`) and Panel
   lateral (`PanelRight`). Keep everything else in the header (explorer toggle,
   breadcrumb, bookmark, the Lectura/Editar/Dividido mode tabs).

3. **Reachability when a panel is open.** The `<aside>` rail only renders while the
   right panel is collapsed. Make sure that when the **Asistente** panel
   (`AssistantPanel`) or the **Estudio/Nota** panel (`Inspector`) is open, each has
   a visible **close/collapse** control in its own header so the user can return to
   the collapsed rail (this also satisfies the earlier "right panel must be
   collapsible" fix). Opening the assistant while the inspector is open (or vice
   versa) should swap, not stack.

Result: a single right bar with ✨ Asistente, 🌐 Navegador and ▮ Panel; the note's
top toolbar no longer repeats them.

## Acceptance

- Only one bar shows the Asistente / Navegador / Panel controls; the note header no
  longer duplicates them.
- Asistente opens/closes from the right bar; Navegador switches to the WEB module;
  the Estudio/Nota panel opens and can be collapsed back to the rail.
- `npm run typecheck` clean, `npx vitest run` green, `npm run electron:build`
  launches.
- Commit `fix(notes): single right bar for assistant and browser, remove duplicate nav icons`
  and **push** `web-migration`.

# Fix — the embedded browser must not live in the Notes right panel

Paste this to Antigravity. Working dir: `frontend/`. UI text Spanish; code/docs
English. After every file: `npm run typecheck` clean + `npx vitest run` green.
**Commit AND push to `web-migration` when done** (`git push origin web-migration`).
Never touch `main`.

## The bug

In Area F the embedded browser was wired as a **tab inside the Notes Inspector**
(the right sub-bar). Opening "Navegador" now renders a full web page inside the
notes right panel, covering the note. That makes no sense: the browser hijacks the
Estudio/Nota inspector slot.

Evidence: `frontend/src/components/web/BrowserPanel.tsx` is mounted as an inspector
tab; `NotesModule.tsx` and `EditorArea.tsx` open it via
`localStorage "nv.inspector.tab" = "browser"` + a `nv-set-inspector-tab` →
`"browser"` CustomEvent (three "Navegador web" buttons).

## The fix — the browser is its own space, not a notes panel

1. **Remove the browser from the Inspector.** Delete the `"browser"` inspector tab
   and the `nv-set-inspector-tab: "browser"` wiring in
   `frontend/src/components/notes/Inspector.tsx`, `NotesModule.tsx` and
   `EditorArea.tsx` (the three "Navegador web" buttons). The Notes right panel goes
   back to only Estudio / Nota. `BrowserPanel.tsx` stays but is no longer mounted
   in the inspector.

2. **The browser lives in the WEB module** (the globe in the left icon rail,
   `frontend/src/components/web/WebModule.tsx`). Mount the embedded browsing
   surface (`BrowserPanel` / the `WebContentsView`) as the WEB module's main view —
   a real full-width browser with the address bar, back/forward/reload, the page,
   and the existing Marcadores / Historial / Tiempo / Restricciones as tabs or a
   side strip. Keep the persistent session partition, video playback, and rule
   enforcement that Area F added.

3. **The "Navegador" entry points switch to the WEB module**, not an inspector
   tab. The top-bar "Navegador" button and any browser icon should call
   `useApp.getState().setModule("web")` (and pass the URL to open if there is one).
   Keep a single, clear way in.

4. If a "browse beside my notes" workflow is wanted later, it will use the split
   view, not the inspector — out of scope here. Default: browser = WEB module.

## Acceptance

- Opening the notes right panel shows only Estudio / Nota — never a web page.
- Clicking "Navegador" switches to the WEB module and shows the full embedded
  browser; URLs load, video plays, login persists, bookmarks/history/rules work.
- `npm run typecheck` clean, `npx vitest run` green, `npm run electron:build`
  launches and browsing works.
- Commit `fix(web): move the embedded browser to the WEB module, out of the notes inspector`
  and **push** `web-migration`.

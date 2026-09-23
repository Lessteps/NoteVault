# WEB module — plan and implementation status

Request (user, 5.2): a built-in browser as its own module, opened **only from the
Ctrl+P command palette** (type "web"), that lets the user:

- 5.2.1 browse web pages;
- 5.2.2 set content-consumption restrictions and stay logged in (Google/Chrome-style login);
- 5.2.3 keep data between sessions;
- 5.2.4 put web pages inside canvases as interactive cards, like Obsidian.

Status: **all phases below are implemented and tested** (2026-09-23).

## Architecture decisions

| Decision | Why |
|---|---|
| QtWebEngine (Chromium) through PySide6 | Only real engine available to a Qt app; renders modern sites, logins, video. |
| Engine shipped as a **separate folder** `web_runtime/` next to `NoteVault.exe`, loaded lazily | QtWebEngine is ~400 MB. NoteVault.exe is one-file (unpacks everything on every start), so bundling it would slow every launch. `NoteVault.spec` excludes the QtWebEngine modules; `core/web_runtime.py` adds the folder to `PySide6.__path__`/DLL search the first time WEB is used. The exe stays ~72 MB. |
| One process, one persistent profile | The browser window and the canvas cards share cookies/logins. Two processes on one Chromium profile would corrupt it. |
| Profile in `~/.notevault/web_profile`, **not** in the vault | The vault is synced (Syncthing). A synced Chromium profile leaks sessions to other devices and breaks. |
| Bookmarks, restrictions, history, usage in `.notevault/web/` | They are the user's data and travel with the vault; one file per day for history/usage avoids sync conflicts. Documented in `docs/VAULT_FORMAT.md` § Web; keys in `vault_format.py` and `vault_format.dart`. |
| Opening only via the palette | User choice: Ctrl+P stays the command palette (Obsidian parity); "web" finds "WEB: Abrir navegador WEB". Outside Notas, MainWindow has its own Ctrl+P with the app-wide commands. |
| Canvas web card = QWebEngineView inside a QGraphicsProxyWidget | Verified in Qt 6.11: renders, scales with zoom and takes clicks/typing, also on the OpenGL viewport. At rest the card paints a snapshot (no browser running), so a canvas with many pages stays light. |

## Files

| File | Role |
|---|---|
| `notevault_app/core/web_store.py` | No-Qt logic: `normalize_url`, `Restrictions` (blocklist, URL fragments, focus mode, daily limits, relax confirmation, presets), `WebStore` (bookmarks, history, usage), `UsageMeter`, blocked page HTML. |
| `notevault_app/core/web_runtime.py` | Lazy loader of QtWebEngine (dev: normal import; frozen: `web_runtime/` folder, version check). |
| `notevault_app/ui/components/web/controller.py` | App-wide `controller()`: vault, restrictions, usage timer (5 s ticks), profile, browser window. |
| `notevault_app/ui/components/web/engine.py` | Profile (persistent cookies, disk cache, Chrome user agent, downloads to ~/Downloads), `NVPage` (blocks navigations and SPA URL changes, permission prompts, new windows → tabs), `new_view()`. |
| `notevault_app/ui/components/web/browser_window.py` | The WEB window: tabs, address bar with search + autocomplete, bookmarks bar, history dialog, find, zoom, fullscreen video, session restore, "⧉ add to canvas", clear cookies/history. |
| `notevault_app/ui/components/web/restrictions_dialog.py` | Rules UI: presets, blocked sites, blocked URL parts, focus mode, daily limits with today's usage, "type a phrase to loosen rules". |
| `notevault_app/ui/components/web/selftest.py` | `NoteVault.exe --web-selftest=out.json`: proves the packaged exe loads the runtime and renders a page. |
| `notevault_app/ui/components/notes/canvas/items.py` → `LinkNodeItem` | The web card (header buttons ✎ ◉ ▶/■ ↗, snapshot, live mode). |
| `notevault_app/ui/components/notes/canvas/view.py` | Ctrl+V of a URL → web card; drop of a URL → web card; wheel over a live page scrolls the page; `add_web_page()`. |
| `notevault_app/ui/components/notes/command_palette.py` | `register_global_commands()` / `global_commands()`. |
| `notevault_app/ui/main_window.py` | `_init_web`: WEB commands, global Ctrl+P outside Notas, "add to canvas" routing, shutdown. |
| `notevault_app/main.py` | `AA_ShareOpenGLContexts` before QApplication; `--web-selftest`. |
| `web_runtime.spec`, `tools/web_runtime_entry.py`, `tools/build_web_runtime.py` | Build of the engine folder. |
| `tests/test_web_store.py` (19), `tests/test_web_module.py` (8) | Logic + real-engine tests (temp vault and temp profile). |

## Build

```
python tools/build_web_runtime.py          # only when PySide6 changes (~400 MB folder)
python -m PyInstaller NoteVault.spec --noconfirm
cp dist/NoteVault.exe NoteVault.exe
NoteVault.exe --web-selftest=%TEMP%\st.json  # expect "ok": true
```

## Future work (not requested yet)

1. Import bookmarks from Chrome (`%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks` is plain JSON). Cookies/passwords from Chrome are encrypted and must NOT be imported.
2. Weekly usage chart in the restrictions dialog (data already in `uso/`).
3. Schedules for rules (e.g. block social media 8:00–17:00).
4. "Clip" selection of a page into a note (markdown) or a canvas text card.
5. Mobile: the Flutter app keeps `.notevault/web/` untouched; a mobile browser is out of scope.

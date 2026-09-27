# Interfaces V3 — Execution & Progress Log

Work package: `docs/INTERFACES_V3/PLAN.md`, branch `web-migration`.
Every area below is committed **and pushed**; after each one `npm run typecheck`
is clean and `npx vitest run` is green (86 files / 555 tests at the time of the
last commit).

| Area | Description | Commits | Status / Verification |
|---|---|---|---|
| **A** | Unified Obsidian-style tab strip with pinning; top search removed | `a4fed2c`, `7c84704`, `a5506f8` | Typecheck clean · tests green · **verified in the built app** |
| **B** | Canvas viewport culling for large maps | `72f8cb6`, `bf79e16` | Typecheck clean · tests green · culling covered by tests; see the measurement note below |
| **C** | Topic detection climbs the tree; math modes surfaced | `909da21`, `5fc6a16` | Typecheck clean · tests green · **verified in the built app** with the real vault |
| **D** | Embedded browser persists across view switches; perf + security | `9ee5be6` | Typecheck clean · tests green · **verified in the built app** over CDP |
| **E** | Verification & documentation | `f01de27`, this commit | `npm run build` + `electron .` smoke-tested area by area |

The smoke test drove the **built** app (`npm run build`, then
`electron . --remote-debugging-port=9222`) over the DevTools protocol, on the
real vault (`C:\PROGRAMMING`, 3 601 notes).

## Area A — unified tab strip

Verified in the running app, not only by typecheck:

- The top bar is one strip (`aria-label="Pestañas abiertas"`); opening a module,
  a note, a canvas or the browser adds a tab; clicking one activates it.
- No search box anywhere in the top bar (A1); `Ctrl+P` still opens the
  quick switcher.
- Right-click → **Fijar** turns the × into a pin; the pinned tab cannot be
  closed (no × button, `Ctrl+W` and middle-click are guarded in the store).
- Canvases were the exception: opening a `.canvas` loaded it into the canvas
  store without a tab, so the strip highlighted a note while a board was shown
  and the board could not be pinned or closed. Fixed in `a5506f8`.

Regression found and fixed (`7c84704`): `active`/`tabs` were zustand **getters**.
zustand copies the state on every update (`Object.assign`), which turns an
accessor into a frozen value — `active` stayed `null`, so the editor rendered its
empty state instead of the open note. They are now real fields re-derived on
every update. This is exactly the class of bug that `typecheck` + `vitest`
cannot see; a rendered `TopBar` test and a store test pin it down.

Pinned tabs are stored **per vault** in localStorage under
`nv.pinnedTabs:<vault path>`. Note on the plan's wording: `AppConfig`'s
`get_pinned_tabs`/`set_pinned_tabs` store paths of *existing files* only (and are
not exposed over the bridge), so they cannot express `module:<id>` or `web`
tabs; the vault-scoped key is used instead and documented in
`docs/VAULT_FORMAT.md`.

## Area B — canvas: what was measured

- `Matemáticas/00 Mapa de Matemáticas.canvas` — the file this work package names
  as "large" — holds **21 cards** (13 text, 8 groups), 4 033 characters of text,
  no LaTeX and no note cards; the JSON is 13 KB. Opening it in the built app
  painted its cards in **~170 ms** and a sibling map in **~290 ms**. It cannot be
  the freeze.
- The culling added by `72f8cb6` (overscan 600 px, refreshed on pan/zoom) helps
  while *moving around* a big map, but it is inert at the moment a canvas is
  **opened**: `fit()` zooms the whole board into view, so every card is inside
  the visible rect and all of them mount anyway.
- The only multi-second blocking work found in this vault is on the Estudio
  path: each `study_topic_get` walks the whole vault twice (`notePaths()` over
  6 790 folders / 3 601 notes) and runs `scanVault` over every note
  (`core/practice/exerciseIndex.ts`, cached per file by mtime+size, cold scan
  ≈ 2–4 s here). `study_snapshot` has a TTL cache; `study_topic_get` has none.
  This is the best candidate for a "hangs for a long time" report, but it is not
  canvas-specific, so it was left for a repro instead of being "fixed" blind.
- Remaining known limit: cards inside the overscan are mounted even when the
  gesture would only pan a little further — no incremental/deferred mount yet.

## Area C — practice: surfacing audit (C3)

Verified end-to-end in the built app on the real vault: opening
`Matemáticas/1 Aritmética elemental y operativa/1.1 …/Ejercicios/1.1-E04 ….md`
(a note **two levels below** the topic manifest) resolves the topic `1.1 …`:

| Element | Reachable | Where |
|---|---|---|
| Per-topic configurator | yes | right bar → **Estudio** → "Practicar este tema" |
| Skill picker (8 math modes) | yes | dialog "1. Competencia a entrenar": Demostración, Contraejemplo, Verdadero o falso, Explicar (Feynman), Problema, Procedimiento guiado, Encontrar el error, Cálculo rápido |
| Difficulty 1–3 | yes | dialog "2. Dificultad" |
| Quantity (3–5 / 6–10 / 11+ / todos / auto) | yes | dialog "3. Cantidad de ejercicios" |
| Assistance (none / helper) | yes | dialog "4. Nivel de Asistencia" |
| `skill × difficulty` matrix | yes | Estudio → **Tema** (`TopicGeneralView`) |
| Topic dashboard | yes | Estudio → **Temas** (`TopicDashboardView`) |
| Exams | yes | `TopicGeneralView` / `TopicDashboardView` → `ExamRunnerModal` |
| Math drawing input | yes | practice view ("✏️ Dibujar (LaTeX)") and `ExamRunnerModal` |
| Ledger / error log | yes | Estudio → **Ledger**, **Errores** |

Nothing built was found unreachable. Two things are worth knowing when reading
the user's original report:

- The **Estudio tab only exists while the note has a study area**
  (`Inspector` asks `study_area`, which resolves from the note's frontmatter or
  a study workspace). A note without `subject:` — e.g. `00 Índice.md` — has no
  Estudio tab at all, hence no configurator. That is by design, but it is the
  reason "I don't see the alternative modes" can still happen on some notes.
- The right bar remembers its last tab (`nv.inspector.tab`), so a user who last
  used **Nota** never sees Estudio until they click it.

C1 is covered by `core/practice/topic.test.ts` (climbing from a note nested two
levels deep in a topic subtree) and C2 by the rendered
`components/study/TopicConfiguratorDialog.test.tsx`.

## Area D — embedded browser

Verified over CDP against the built app:

- The guest (`WebContentsView`) keeps its target id, its URL and its in-page
  state when switching to **Notas** and back: same `webContents`, no reload
  (`performance.getEntriesByType("navigation").length === 1`), so pages, history
  and logins survive. The view is hidden and restored, and it is only torn down
  when the last `web`/`module:web` tab is closed (`browser_destroy`).
- Security in the guest: `typeof require`, `typeof process`, `window.nv` and
  `window.pywebview` are all `undefined`; the view is created with
  `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` and
  `partition: "persist:nvweb"`. Popups to another host go to the system browser
  and blocked/looked-up URLs are checked against the content rules before
  loading.

## Tests added by this verification pass

`store/appTabs.test.ts` (tab strip: open/activate/close/pin, per-vault pins,
browser teardown only on the last web tab, live `active`),
`components/Shell.test.tsx` (rendered top bar: one strip, no search box, × closes,
pinned tab has no ×), `lib/canvasViewport.test.ts` (culling over a 400-card map),
`components/study/TopicConfiguratorDialog.test.tsx` (the eight modes are offered
and selectable).

# Batch 9 (continuación) — Cola de tareas para Antigravity

**Para: Antigravity.** Rama `main`. Reescribimos NoteVault de Python a
TypeScript/Electron. **El core y la mitad de la capa API ya están hechos y la
app YA ARRANCA** (puente IPC verificado end-to-end). Tu trabajo es mecánico:
portar los **4 módulos que faltan**, copiando un patrón que ya existe y funciona.

## ⚡ ANTES DE EMPEZAR (obligatorio)

```
cd frontend
git pull origin main        # trae el registry ya fusionado (Claude también empuja)
npm install                 # por si faltan deps
```

## ✅ Ya está hecho — NO lo toques ni lo rehagas

Backbone: `common.ts`, `context.ts`, `appState.ts`, `appConfig.ts`,
`notify.ts`, `media.ts`, `registry.ts`.
Módulos portados (15): **app, tasks, home, files, notes_extras, vaults, habits,
exercise, finance, goals, projects, calendar, web, assistant, english_player**.

Suite actual: **441 tests verdes**. Nunca la dejes bajar.

## 🎯 FALTAN SOLO ESTOS 4 MÓDULOS (hazlos en este orden)

| # | módulo | origen (Python) | destino (TS) | test a portar |
|---|--------|-----------------|--------------|---------------|
| 1 | study | `notevault_app/webapp/modules/study.py` | `frontend/src/api/modules/study.ts` | `tests/test_webapp_study.py` |
| 2 | practice | `notevault_app/webapp/modules/practice.py` | `frontend/src/api/modules/practice.ts` | `tests/test_webapp_practice.py` |
| 3 | ladder | `notevault_app/webapp/modules/ladder.py` | `frontend/src/api/modules/ladder.ts` | `tests/test_webapp_ladder.py` |
| 4 | canvas | `notevault_app/webapp/modules/canvas.py` | `frontend/src/api/modules/canvas.ts` | `tests/test_webapp_canvas.py` |

Para saber qué módulo del core usa cada uno, mira los `import` al principio del
`.py`; el equivalente TS ya existe en `frontend/src/core/**` (mismo nombre en
camelCase, p.ej. `study_srs_manager.py` → `studySrsManager.ts`,
`core/practice/*` → `core/practice/*`, `core/canvas/*` → `core/canvas/*`).

## La plantilla que debes copiar (léela antes)

- `frontend/src/api/modules/tasks.ts`  ← patrón del módulo
- `frontend/src/api/modules/tasks.test.ts`  ← patrón del test
- `frontend/src/api/common.ts`  ← validadores (reúsalos)
- `frontend/src/api/appState.ts`  ← `AppState` (resolve/rel/jsonSafe/entry)

## Patrón exacto (no te desvíes)

Cada mixin Python `class XxxApi:` con métodos `xxx_*` → **una función factory**
que recibe `AppState` y devuelve el mapa de métodos en snake_case:

```ts
// frontend/src/api/modules/<m>.ts
import type { AppState } from "../appState.js";
// ...imports del core y de "../common.js"...

export function <m>Api(app: AppState) {   // ← SIN anotar el tipo de retorno
  const mgr = () => app.mgrs().<manager>; // el mixin hacía self._mgrs().<manager>
  return {
    <m>_algo(arg: string) { /* cuerpo traducido */ },
    // un método por cada método público del mixin
  };
}
```

Reglas duras:
1. **NO anotes el tipo de retorno de la factory** (deja que TS lo infiera; con
   `Record<...>` los tests fallan por `noUncheckedIndexedAccess`).
2. **Sufijo `.js` en TODOS los imports internos** (`"../appState.js"`,
   `"../../core/xxx.js"`).
3. **Traducción fiel**: mismos nombres de método, mismos mensajes de error (en
   español, textuales), misma lógica; comportamiento del vault idéntico.
4. **Sin `self._lock`** (proceso single-thread).
5. **Fechas**: `date` de Python → `isoDate()` de common.js; `datetime` →
   `isoDt()`. Ver `taskDict` en `tasks.ts`.
6. **`ApiError`** desde `"../../core/errors.js"`.
7. **Privados del manager** (`mgr._path(id)`, `mgr._cache = null`): cast puntual
   `as unknown as { ... }` (ver `tasks_delete`).
8. **Diálogos/ventanas nativas** (elegir archivo, etc.): si el módulo los usa,
   requieren `app.window` y Electron `dialog` (import perezoso con `require`,
   ver `englishPlayer.ts`). Si `app.window === null`, lanza `ApiError` como en el
   original.

Registra cada módulo terminado en `frontend/src/api/registry.ts`: añade el
`import { <m>Api } from "./modules/<m>.js";` y `...<m>Api(app),` dentro de
`buildRegistry`. **Si al hacer pull hay conflicto en `registry.ts`, resuélvelo
conservando TODOS los imports y TODOS los spreads** (Claude añade líneas ahí
también).

## Bucle por módulo (4 veces)

1. Lee el `.py` y su `tests/test_webapp_<m>.py`.
2. Escribe `<m>.ts` copiando el patrón.
3. Escribe `<m>.test.ts` portando las aserciones del test Python a vitest
   (`const api = <m>Api(new AppState(dir))`).
4. Regístralo en `registry.ts`.
5. `npm run typecheck`  → limpio.
6. `npx vitest run`  → TODO verde.
7. `git add -A && git commit -m "port(api): <m> module" && git pull --no-edit origin main && git push origin main`

## ⛔ REGLA DE ORO

**NUNCA pases al siguiente módulo con tests o typecheck en rojo.** Si algo
falla, arréglalo antes. Cuidado con tests frágiles por fecha (no hardcodees
"hoy" si el manager usa la fecha real) o por separadores de ruta (usa `path` de
Node, nunca `\` o `/` a mano) — en Linux han roto tests antes.

## `devserver` — NO portar

Era el bridge HTTP de pywebview. En Electron lo reemplaza el IPC (ya hecho por
Claude). Ignóralo.

## Cuando termines los 4

Avisa: solo falta el cutover (Claude): ventana WEB reforzada, empaquetar el
`.exe` y borrar el Python. Estado del empaquetado en `BATCH_10_STATUS.md`.

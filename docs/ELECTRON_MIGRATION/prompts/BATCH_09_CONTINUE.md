# Batch 9 (continuación) — Portar la capa API restante a TypeScript

**Para: Antigravity.** Trabajas en la rama `main` del repo NoteVault.
**Contexto:** estamos reescribiendo la app de Python a TypeScript para Electron.
El *core* ya está portado a `frontend/src/core/**` y la **columna vertebral de la
capa API ya está hecha y validada**. Tu trabajo aquí es **mecánico**: portar los
19 módulos de API que faltan, siguiendo un patrón que ya existe y funciona.

**NO tienes que diseñar nada.** Copia el patrón. Si dudas del diseño, no
inventes: mira `tasks.ts` y hazlo igual.

---

## La plantilla que debes copiar

Lee estos 4 archivos ANTES de empezar. Son tu única referencia de estilo:

- `frontend/src/api/modules/tasks.ts`  ← **plantilla del módulo**
- `frontend/src/api/modules/tasks.test.ts`  ← **plantilla del test**
- `frontend/src/api/common.ts`  ← validadores de input (ya hechos, reúsalos)
- `frontend/src/api/appState.ts`  ← `AppState` (resolve/rel/jsonSafe/etc.)

Y el original Python de cada módulo en `notevault_app/webapp/modules/`.

---

## El patrón exacto (no te desvíes)

Cada módulo Python `notevault_app/webapp/modules/<m>.py` es una clase-mixin
(`class XxxApi:`) con métodos `xxx_*`. Lo conviertes a **una función factory**
que recibe el `AppState` y devuelve un objeto con los métodos en `snake_case`:

```ts
// frontend/src/api/modules/<m>.ts
import type { AppState } from "../appState.js";
// ...imports del core y de common.js...

export function <m>Api(app: AppState) {   // <-- SIN anotar el tipo de retorno
  const mgr = () => app.mgrs().<manager>; // el mixin Python hacía self._mgrs().<manager>
  return {
    <m>_algo(arg: string) { /* cuerpo traducido */ },
    // ...un método por cada método público del mixin...
  };
}
```

Reglas duras (romper cualquiera = el port está mal):

1. **NO anotes el tipo de retorno de la factory.** Deja que TS infiera el objeto
   literal (si pones `Record<string, ...>` los tests fallan por
   `noUncheckedIndexedAccess`). Igual que en `tasks.ts`.
2. **Sufijo `.js` en TODOS los imports internos** (`"../appState.js"`,
   `"../../core/taskManager.js"`). Es obligatorio por NodeNext.
3. **Traducción fiel, no rediseño.** Mismos nombres de método, mismos mensajes
   de error (en español, textuales), misma lógica. El comportamiento del vault
   debe ser idéntico byte a byte.
4. **Sin `self._lock`.** El proceso Electron es single-thread; se omite.
5. **Fechas:** `date` de Python → usa `isoDate()` de `common.js`; `datetime` →
   `isoDt()`. Mira `taskDict` en `tasks.ts`. NO uses un `iso()` genérico.
6. **Errores:** `ApiError` se importa de `"../../core/errors.js"`. Se lanza igual
   que en Python (`throw new ApiError("...")`).
7. **Acceso a privados del manager** (p.ej. `mgr._path(id)`, `mgr._cache = null`):
   cast puntual `const mm = m as unknown as { _path(id:string):string; _cache: unknown }`.
   Mira `tasks_delete` en `tasks.ts`.
8. **`jsonSafe()`** de `appState.js` para cualquier valor de frontmatter que
   vaya al JSON (fechas/sets/etc.), tal como hacía `_json_safe` en Python.

Registra cada módulo terminado en `frontend/src/api/registry.ts`:
añade el import y espárcelo en `buildRegistry`:

```ts
import { homeApi } from "./modules/home.js";
// ...
export function buildRegistry(app: AppState): Registry {
  return {
    ...tasksApi(app),
    ...homeApi(app),   // <-- añade esta línea al terminar cada módulo
  };
}
```

---

## El bucle por módulo (repetir 19 veces)

Para cada módulo de la lista de abajo, en este orden:

1. Lee el `.py` original completo.
2. Lee su test `tests/test_webapp_<m>.py` (si existe).
3. Escribe `frontend/src/api/modules/<m>.ts` copiando el patrón.
4. Escribe `frontend/src/api/modules/<m>.test.ts` portando el test Python a
   vitest (mismas aserciones; construye `const api = <m>Api(new AppState(dir))`).
5. Regístralo en `registry.ts`.
6. Ejecuta **`npm run typecheck`** (desde `frontend/`). Debe salir limpio.
7. Ejecuta **`npx vitest run`** (desde `frontend/`). TODO verde.
8. **Commit y push a `main`** (mensaje: `port(api): <m> module`).

### ⛔ REGLA DE ORO (por esto paraste la última vez)

**NUNCA pases al siguiente módulo con tests en rojo o typecheck en rojo.**
Si un test falla, arréglalo antes de seguir. Cuidado especial con tests
frágiles por fecha/plataforma:
- No hardcodees "hoy" en un test si el manager usa la fecha real del sistema.
- Rutas: usa `path` de Node, nunca separadores `\` o `/` a mano.
Ejecuta la suite en Linux mentalmente; los separadores de Windows han roto
tests antes.

---

## Los 19 módulos (origen → destino, y qué manager usan)

Todos los origen están en `notevault_app/webapp/modules/` salvo los 3 marcados
(*) que están en `notevault_app/webapp/`. Destino: `frontend/src/api/modules/`.

| # | módulo | manager/core principal | test |
|---|--------|------------------------|------|
| 1 | `home` | varios (`app.mgrs()`), resumen del día | test_webapp_api (parte) |
| 2 | `vaults` | `AppConfig` + `VaultManager` | test_webapp_vaults |
| 3 | `files` | `app.service` (NotesService) | (parte de otros) |
| 4 | `notes_extras` | `app.service`, frontmatter | test_webapp_notes_extras |
| 5 | `habits` | `core/habitManager` | test_webapp_habits |
| 6 | `exercise` | `core/exerciseManager` | test_webapp_exercise |
| 7 | `finance` | `core/financeManager` | test_webapp_finance |
| 8 | `goals` | `core/goalManager` | test_webapp_goals |
| 9 | `projects` | `core/projectManager` | test_webapp_projects |
| 10 | `calendar` | `core/scheduleManager` (+ fuentes) | test_webapp_calendar |
| 11 | `study` | `core/studySrsManager`, `studyExerciseManager` | test_webapp_study |
| 12 | `practice` | `core/practice/*` | test_webapp_practice |
| 13 | `ladder` | `core/practice` (ladder) | test_webapp_ladder |
| 14 | `canvas` | `core/canvas/*` | test_webapp_canvas |
| 15 | `web` | `core/webStore` | test_webapp_web |
| 16 | `english_player` | `core/english/*`, `englishVocabularyManager` | test_webapp_english_player |
| 17 | `assistant` | `core/aiClient` | test_webapp_assistant |
| 18 | `media` (*) | rutas/servidor de medios | (parte de english_player) |
| 19 | `devserver` (*) | **NO portar tal cual** (era el bridge HTTP de pywebview). Consúltalo con el humano antes de tocarlo — probablemente se reemplaza por IPC de Electron, que lo hace Claude. |

Empieza por los simples (`home`, `files`, `notes_extras`, `vaults`) para coger
ritmo, luego los de datos (`habits`→`assistant`).

---

## ⚠️ Lo que NO debes tocar (lo hace Claude en paralelo, evita conflictos)

- `frontend/electron/**` (`main.ts`, `ipc.ts`, `preload.ts`) — cableado IPC.
- `frontend/src/api/appConfig.ts` — lo crea Claude (config de vault activo/tema).
- `frontend/src/api/appState.ts`, `common.ts`, `context.ts`, `notify.ts` — ya
  están hechos; solo léelos, no los edites (salvo que falte un helper y lo
  confirmes con el humano).
- El módulo `devserver` (#19).

Si `vaults` o `home` necesitan `AppConfig` y aún no existe `appConfig.ts`,
**salta ese módulo temporalmente** y sigue con los que no lo necesitan; avísalo
en el commit. Claude añadirá `appConfig.ts` y luego se completan.

---

## Estado actual (ya hecho, no rehacer)

- Core completo en `frontend/src/core/**`.
- Backbone API: `common.ts`, `context.ts`, `appState.ts`, `notify.ts`,
  `registry.ts` (con `buildRegistry`).
- Módulo `tasks` portado + test (plantilla).
- Suite: 370 tests verdes. Mantén ese número subiendo, nunca bajando.

Cuando termines los 18 módulos portables, avisa al humano: falta el cutover
(Batch 10: IPC real, empaquetado `.exe`, borrar Python), que coordina Claude.

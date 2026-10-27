# Plan: áreas, sub-asignaturas y rutas (manual, automático y con revisión)

> Documento de ejecución. Cada fase es pequeña, tiene archivos exactos, tipos, textos en español y tests.
> Lo que dice **VERIFICAR** no se pudo comprobar leyendo código: se revisa a mano antes de darlo por cerrado.
> Estado de cada fase al final (sección 9).

## 0. Qué se pidió (resumen sin adornos)

1. Cualquier carpeta de la vault se puede convertir en **área**, **sub-asignatura** o **contenedor de temas**, con su **objetivo** («para qué la añado»).
2. Se puede **añadir a un plan** como área nueva o como sub-asignatura de un área que ya existe.
   - Manual: un modal que muestra el impacto en el ritmo antes de confirmar.
   - Automático: el sistema sugiere lo nuevo de la vault y, si activas la opción, lo añade **pendiente de revisión**. Nunca en silencio.
3. **Revisar nueva área** y **revisar asignatura**: aviso en el plan, en la página del área y en el menú; una pantalla de revisión con
   objetivo, lo añadido, posibles duplicados, efecto en la fecha de fin y el ritmo, y tres salidas: **conservar**, **ajustar**, **quitar del plan** (sin tocar la vault).
4. Todo se puede hacer **a mano**, sin IA. La IA es un atajo, no un requisito.
5. Frontend debe mostrar HTML, CSS y Atomic Design como sub-asignaturas reales.

## 1. Lo que YA existe (no se rehace)

| Pieza | Dónde | Estado |
|---|---|---|
| Control de ruta (`core` / `optional` / `skipped`) | `frontend/src/lib/planRoute.ts`, API `mentor_plan_route_set`, op `set_route` | Existe. Se reutiliza. |
| Gestión de grupos (crear, renombrar, borrar, mover temas) | API `mentor_plan_group_*` y `mentor_plan_topics_move_group` en `api/modules/mentor.ts`, UI en `PlanAreaTopics.tsx` | Existe. Se reutiliza. |
| Operaciones deterministas sobre el plan (con historial y «Deshacer») | `core/mentor/planChange.ts` → `applyOps`, `ChangeOp` | Existe. **Aquí se añaden las operaciones nuevas.** |
| Botón de añadir área | `components/mentor/AddAreaBar.tsx` | Solo ofrece «Lógica de programación» (`add_area` con `areaId` fijo). Se generaliza. |
| Áreas propias (`x-<slug>`) | `lib/planAreas.ts` → `bucketByArea`, `isCustomArea` | Existe para ramas desconocidas; no hay forma manual de crear una desde una carpeta. |
| «Crear área nueva» del chat | `components/notes/AssistantPanel.tsx` → `useStudySpaceDialog.openWith("area")` | Crea la carpeta con IA. No registra su objetivo ni la ofrece al plan. |

## 2. Decisiones de diseño (fijas, no se reabren)

1. **Un solo camino para cambiar el plan**: las operaciones de `applyOps`. Nunca se edita a mano el JSON del plan (`.notevault/mentor/plans/*.json`).
   Motivo: `applyOps` recalcula semanas, fases y capacidad, deja historial y permite «Deshacer»; editar el JSON se salta todo eso.
2. **Dos operaciones nuevas** en `ChangeOp`:
   - `add_folder_area { folder, name?, objective? }` → crea un subplan (`areaId = x-<slug>`) con los temas bajo `folder`.
     Cada subcarpeta directa con temas pasa a ser un grupo (sub-asignatura); los temas sueltos van al grupo «Conocimientos».
   - `add_folder_subject { subplan, folder, title?, objective? }` → añade los temas bajo `folder` como un grupo nuevo (o existente) de un subplan.
3. **Propiedades de carpeta** viven fuera del plan, en `.notevault/mentor/folder-roles.json` (decisión: es del vault, no de un plan; sobrevive a archivar planes).
   Forma: `{ version: 1, autoAdd: boolean, roles: { "<carpeta POSIX>": { role, objective, updatedAt } } }`.
4. **Revisiones pendientes** viven en `.notevault/mentor/plan-reviews/<planId>.json`, aparte del plan.
   Motivo: `sanitizePlan` descarta campos que no conoce y `undo` restaura una instantánea; un archivo aparte no se rompe con ninguno de los dos.
   Una revisión cuyo subplan/grupo ya no existe en el plan se ignora al leer (así «Deshacer» no deja basura visible).
5. **Nada en silencio**: toda adición (manual o automática) escribe una entrada en el historial del plan **y** una revisión `pending`.
6. **Quitar del plan no borra nada de la vault**: usa `remove_subplan` / `remove_topic`.
7. **Numeración**: las sub-áreas de Frontend NO usan `5.1`, `5.2`, `5.3` (ya son los temas «The browser…», «CSS», «Interface design»).
   Prefijos nuevos: HTML `5.18`, CSS `5.19`, Atomic Design `5.20` (los temas existentes llegan hasta `5.17`). **VERIFICAR** que ninguna nota use ya esos números.
8. **Completado manual**: marcar un tema como hecho a mano solo existe como excepción explícita (confirmación + motivo guardado), nunca como camino normal; el avance sale de la práctica.

## 3. Fases

Cada fase termina con `npx vitest run <archivos de la fase>` en verde y `npx tsc -b` sin errores nuevos (desde `PROJECTS/NoteVault/frontend`).

### Fase 1 — Propiedades de carpeta (núcleo puro)
Archivo nuevo: `frontend/src/lib/folderRoles.ts` (puro, sin `node:*`).
- Tipos: `FolderRoleKind = "area" | "subject" | "container"`; `FolderRole { role; objective; updatedAt }`; `FolderRolesFile { version: 1; autoAdd: boolean; roles: Record<string, FolderRole> }`.
- Funciones: `sanitizeFolderRoles(raw)`, `normFolder(p)`, `setRole(file, folder, role, objective, now)`, `clearRole(file, folder)`, `labelOfFolder(folder)`.
- Textos: `ROLE_LABEL = { area: "Área", subject: "Sub-asignatura", container: "Contenedor de temas" }`.
- Test: `frontend/src/lib/folderRoles.test.ts` (sanea basura, recorta objetivo a 200 caracteres, normaliza `\` y barras finales, rechaza rol inválido).

### Fase 2 — Operaciones nuevas sobre el plan
Archivo: `frontend/src/core/mentor/planChange.ts`.
- Añadir a `ChangeOp` las dos operaciones de la sección 2 y sus `case` en `applyOps` (junto a `add_area`).
- Funciones auxiliares **exportadas** desde un archivo nuevo `frontend/src/core/mentor/planFolders.ts`: `topicsUnder(all, folder)`, `splitByChildFolder(folder, topics, name)`, `slugOf(text)`, `uniqueAreaId(folder, taken)`.
- Reglas: no añade temas que ya están en el plan (`present`), no añade completados al 100 %, ordena por número de carpeta (orden natural), avisa con `warnings` si no hay temas.
- Mensajes: «No hay temas pendientes en «X» para añadir.»
- Test: `frontend/src/core/mentor/planFolders.test.ts` (área nueva con 2 subcarpetas → 2 grupos; sub-asignatura nueva en Frontend; idempotencia; carpeta sin temas → `applied = 0`; ≤ 2 áreas en paralelo).

### Fase 3 — Revisión (núcleo puro + almacén)
Archivo nuevo: `frontend/src/core/mentor/planReview.ts`.
- Tipos: `PlanReview { id; kind: "area"|"subject"; subplanId; subplanName; groupId?; groupTitle?; folder; objective; source: "manual"|"auto"; addedAt; state: "pending"|"kept"; added: string[]; duplicates: ReviewDuplicate[]; impact: ReviewImpact }`.
- `ReviewImpact { addedTopics; addedMinutes; weeklyMinutesBefore; weeklyMinutesAfter; fits; endDate; suggestedEnd?; fixOptions }`.
- Funciones puras: `findDuplicates(added, before, all)` (mismo título sin numeración, sin tildes/mayúsculas), `impactOf(before, result)`, `buildReview(...)`, `pendingReviews(file, plan)` (descarta las que ya no existen en el plan).
- Almacén: `class PlanReviewStore { load(planId); save(planId, list); }` con `store.loadJson/writeJson`.
- Test: `frontend/src/core/mentor/planReview.test.ts`.

### Fase 4 — API
Archivo: `frontend/src/api/modules/mentorPlanFolders.ts` (nuevo, se registra en `mentor.ts` con `...mentorPlanFoldersApi(app)`, igual que `mentorProjectsApi`).
- `mentor_folder_roles_get()` → archivo saneado.
- `mentor_folder_role_set({ folder, role, objective })` / `mentor_folder_role_clear({ folder })`.
- `mentor_folder_auto_add_set({ enabled })`.
- `mentor_plan_folder_candidates({ planId })` → carpetas de la vault con temas pendientes que NO están en el plan (con nº de temas, minutos, rol guardado y objetivo).
- `mentor_plan_folder_preview({ planId, folder, mode: "area"|"subject", subplanId?, name?, objective? })` → impacto **sin guardar nada**.
- `mentor_plan_folder_add({ ...igual, source? })` → aplica `applyOps`, guarda plan, escribe historial, crea la revisión `pending` y guarda el rol/objetivo de la carpeta.
- `mentor_plan_folder_sync({ planId })` → si `autoAdd` está activo, añade lo nuevo como `source: "auto"` (pendiente de revisión) y devuelve qué añadió; si no, solo devuelve las sugerencias.
- `mentor_plan_review_list({ planId })` y `mentor_plan_review_resolve({ planId, reviewId, action: "keep"|"remove", objective? })`.
- Puente: `frontend/src/lib/bridge.ts` (una línea por método).
- Test: `frontend/src/api/modules/mentorPlanFolders.test.ts` con vault temporal (patrón de `curriculumHandoffE2E.test.ts`).

### Fase 5 — Interfaz
- `components/mentor/AddToPlanDialog.tsx` (nuevo): 3 pasos — carpeta → propiedades (rol + objetivo) → impacto y confirmar. Texto del botón: «Añadir al plan».
- `components/mentor/PlanReviewScreen.tsx` (nuevo): pantalla de revisión con las tres salidas (**Conservar**, **Ajustar** = quitar temas de la ruta / subir tiempo / ampliar fecha con los `fixOptions`, **Quitar del plan**).
- `components/mentor/PlanAreaTopics.tsx`: botón «Añadir área o asignatura» junto a las pestañas; marca «Por revisar» en la pestaña del grupo; aviso arriba de «Temas».
- `components/mentor/AddAreaBar.tsx`: deja de estar fijo en «Lógica»; muestra las sugerencias de la vault.
- Aviso «Revisar nueva área» en: el plan, la página del área y el menú de Mentor. **VERIFICAR** el archivo exacto del menú (`MentorModule.tsx`).
- Tests: `PlanReviewScreen.test.tsx`, `AddToPlanDialog.test.tsx` (patrón de `PlanRun.test.tsx`).

### Fase 6 — Correcciones indicadas
1. Colisión de numeración: `core/curriculum/catalog.ts` → prefijos `5.18` (HTML), `5.19` (CSS); actualizar los tests que esperan `5.1.x` / `5.2.x`.
2. Catálogo que llena sub-áreas: añadir `core/curriculum/catalog/atomic-design.ts` y el área `atomic-design` (`5 Frontend/Atomic Design`, prefijo `5.20`).
3. No editar el JSON del plan a mano: ya cubierto por la sección 2 (todo por `applyOps`).
4. Completado manual como excepción: **VERIFICAR** dónde se marca hoy (`completedAt` se escribe al observar el tema completo); no se añade ningún atajo nuevo.
5. Generación de práctica por área: **VERIFICAR** `api/modules/mentorAreaPractice.ts` con un área `x-…`.

### Fase 7 — Conexión con «Crear área nueva» (chat)
- Al terminar el diálogo (`StudySpaceDialog.tsx`, modo `area`) llamar a `mentor_folder_role_set({ folder, role: "area", objective })`.
- **VERIFICAR**: el diálogo está en un archivo que otra sesión edita; se hace en un commit aparte.

## 4. Textos en español (todos los que ve el usuario)

- Botón: «Añadir área o asignatura».
- Modal: «Añadir al plan», «¿Qué es esta carpeta?», «Para qué la añado», «Impacto en tu ritmo».
- Roles: «Área», «Sub-asignatura», «Contenedor de temas».
- Aviso: «Revisar nueva área» / «Revisar asignatura».
- Salidas: «Conservar», «Ajustar», «Quitar del plan».
- Confirmación al quitar: «Se quita del plan. Las notas siguen en tu vault: nada se borra.»
- Impacto: «Suma {n} temas ({h} h). Tu plan termina el {fecha} y pasa de {a} h a {b} h por semana.»
- Si no cabe: «No cabe en el periodo actual. Opciones: ampliar hasta el {fecha}, subir el tiempo diario o dejar temas fuera de la ruta.»

## 5. Manual vs IA

- Todo lo anterior funciona **sin IA**. El intérprete por palabras clave de `opsFromText` y el parche de la IA (`parseChangeReply`) pueden emitir las mismas operaciones; hoy no las emiten (**VERIFICAR** antes de prometerlo en la interfaz).
- «Ejecutar plan» con IA sigue siendo opcional: la generación de notas/mapas/práctica ya tiene vía manual (Antigravity / handoff).

## 6. Riesgos conocidos

- `planChange.ts` y `mentor.ts` son archivos grandes que otra sesión puede estar editando: cada fase toca pocas líneas y se commitea sola.
- `sanitizePlan` descarta campos desconocidos: por eso las revisiones y los roles no van dentro del plan.
- El plan activo real no se modifica en ninguna fase; las pruebas usan vaults temporales.

## 7. Qué no se hace (explícito)

- No se edita `2026-10-06_2027-04-05.json` a mano.
- No se escribe nada en las notas de la vault.
- No se crea contenido de HTML/CSS/Atomic Design: eso es una tarea de Antigravity (handoff por catálogo).

## 8. Orden y dependencias

1 → 2 → 3 → 4 → 5; la 6 es independiente (pero antes de crear contenido); la 7 va al final.

## 9. Estado de ejecución

| Fase | Tarea | Archivos clave | Tests | Estado |
|---|---|---|---|---|
| **Fase 1** | Propiedades de carpeta (núcleo puro) | `lib/folderRoles.ts` | `folderRoles.test.ts` (5 tests) | **Completado** (100% verde) |
| **Fase 2** | Operaciones nuevas en plan (`add_folder_*`) | `planFolders.ts`, `planChange.ts` | `planFolders.test.ts`, `planChange*.test.ts` (39 tests) | **Completado** (100% verde) |
| **Fase 3** | Revisión (núcleo puro + almacén) | `core/mentor/planReview.ts` | `planReview.test.ts` (6 tests) | **Completado** (100% verde) |
| **Fase 4** | Endpoints de API y bridge | `api/modules/mentorPlanFolders.ts`, `bridge.ts`, `mentor.ts` | `mentorPlanFolders.test.ts` (5 tests) | **Completado** (100% verde) |
| **Fase 5** | Interfaz (modal, pantalla revisión, avisos) | `AddToPlanDialog.tsx`, `PlanReviewScreen.tsx`, `PlanAreaTopics.tsx`, `AddAreaBar.tsx` | `AddToPlanDialog.test.tsx`, `PlanReviewScreen.test.tsx` (5 tests) | **Completado** (100% verde) |
| **Fase 6** | Correcciones (5.18+, catálogo Atomic Design, práctica) | `catalog.ts`, `atomic-design.ts`, `mentorAreaPractice.ts` | `catalog.test.ts`, `coverage.test.ts` (30 tests) | **Completado** (100% verde) |
| **Fase 7** | Conexión con diálogo de chat («Crear área nueva») | `StudySpaceDialog.tsx` | Verificación integrada | **Completado** (100% verde) |

> **Total:** 90 tests en verde ejecutados en 10 archivos de prueba.



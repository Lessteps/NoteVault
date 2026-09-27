# PROGRESS — Estudio como ficheros (`docs/STUDY_AS_FILES/PLAN.md`)

Ejecución del plan área por área sobre `web-migration`, con `frontend/` como
directorio de trabajo. Cada área se cerró con `npm run typecheck` limpio,
`npx vitest run` en verde y push a `origin/web-migration`.

| Área | Commit | Tests | Estado |
|---|---|---|---|
| A — Ficheros de vista del tema | `750bbfb` | 578 verdes | hecho y verificado en la app |
| B — Vistas de resumen (área y materia) | `b64cf8c` | 594 verdes | hecho y verificado en la app |
| C — Click de carpeta estilo Notion | `f8a40db` | 594 verdes | hecho y verificado en la app |
| D — Estructura de las explicaciones | `1fb2fbe` | 604 verdes | hecho y verificado en la app |
| E — Verificación y documentación | este commit | 606 verdes | hecho |

---

## Área A — los ficheros de vista del tema

`_tema.md` desaparece de la vista del usuario. Cada carpeta de tema (concepto +
ejercicios + su mapa) se presenta ahora con **dos ficheros visibles**:

- `<carpeta>.practica.md` (`type: practica`) — la interfaz de práctica, y el
  fichero que **lleva el manifiesto del tema** en el frontmatter.
- `<carpeta>.teorica.md` (`type: teorica`) — la puerta a la teoría del tema.

- `core/practice/viewFiles.ts` (334 líneas): la convención (nombre y `type`), la
  detección, la generación idempotente y la migración completa del vault.
- `parseTopicManifest` acepta `type: practica`, así que el descubrimiento
  jerárquico del tema sigue funcionando sin `_tema.md`; se conserva la
  compatibilidad con `_tema.md`/`tema.md` heredados.
- `components/study/TopicFileView.tsx`: la vista `practica` en pestaña completa,
  con las dos pestañas **Resumen** (progreso y matriz, `TopicGeneralView`) y
  **Practicar** (el configurador de 8 modos, dificultad, cantidad y asistencia,
  ahora también en modo `inline`), construida con los componentes de práctica
  existentes.
- `components/study/TeoricaView.tsx`: renderiza la nota de teoría del tema
  (concept note, a la que apuntan los mapas) con su contenido completo, más
  «Abrir mapa» (si el tema tiene canvas) y «Abrir la nota de teoría».
- **La barra lateral derecha ya no monta Estudio**: se eliminó la sub-barra
  Estudio/Nota que llevaba a lo mismo que las pestañas del tema. El código del
  panel se conserva porque de él viven los componentes reutilizados.

### Decisión sobre la nota de teoría (consultada al usuario)

El plan nombra `<carpeta>.teorica.md` como fichero de teoría. En el vault, la
teoría ya existe como apunte con el nombre del tema (`1.1 Números...md`) y —esto
es lo decisivo— **423 nodos de archivo de los mapas apuntan a esas notas por
ruta**: renombrarlas rompería los mapas. La migración crea `<carpeta>.teorica.md`
como puerta que renderiza esa nota (campo `teoria:`), sin renombrar ni borrar
nada. El usuario confirmó seguir el plan tal cual, que es lo implementado.

### Migración ejecutada sobre el vault real (`C:\PROGRAMMING`)

```
$ NV_APPLY=1 vitest run … (tools/migrate_study_view_files.ts)
Topic folders: 41        Areas: 5        Created: 87      Skipped: 0
Removed _tema.md: 41     Errors: 0
```

Verificado después, en el vault: 0 `_tema.md`, 41 `.practica.md`, 41
`.teorica.md`, 5 `.resumen.md`; el manifiesto del tema se resuelve desde el
ejercicio (`findAncestorTopicManifest` → `.practica.md`, con sus 8 competencias y
`exam_group` intactos); re-ejecutarla no crea ni borra nada.

## Área B — vistas de resumen

- `lib/areaOverview.ts` (puro y testeado): agrega el dato por tema que ya
  devuelve el dashboard en totales, progreso por competencia, progreso por
  dificultad y progresión por tema.
- `components/study/ResumenView.tsx`: la vista `resumen` con las cifras del área,
  gráficos circulares (el `Donut` que ya existía), barras de progresión por tema,
  el error digest de la materia y **«Practicar el área»** (competencia +
  dificultad → sesión con los ejercicios de todos los temas del área).
- `study_area_session_build` (API nueva): sesión de área reutilizando el escaneo
  y los ejercicios existentes; sin generación por IA, para no inventar ejercicios.
- La migración ya había creado el resumen de la materia (`Matemáticas`) y el de
  cada área.

### Bug encontrado y corregido: el dashboard siempre estaba vacío

`study_topic_dashboard` pasaba carpetas **absolutas** (las que devuelve el
recorrido del vault) a `findTopicManifest`, que resuelve rutas **relativas al
vault**; `app.resolve` lanzaba «Solo se aceptan rutas dentro del vault», el `try`
lo tragaba y el resultado era `topics: []` en un vault lleno. Es decir: las vistas
de dashboard/exámenes que ya existían nunca mostraron nada. Se convierte con
`app.rel` antes de buscar, se memoiza (TTL 30 s, invalidado por
`clearStudySnapshotCache`) porque cada cálculo escanea el vault entero, y hay test
de regresión (`api/modules/studyDashboard.test.ts`). En el vault real:
**42 temas, 5 áreas**.

## Área C — click de carpeta estilo Notion

- En el árbol, el **chevron** expande y el **nombre** de la carpeta abre lo que
  esa carpeta es: el `.resumen` de un área o la `.practica` de un tema,
  creándolo si falta (`study_view_ensure`).
- `study_view_ensure` se niega a crear vistas en carpetas que no son de estudio
  (ni tema ni carpeta con temas debajo), así que un click en `Inglés` o
  `PROJECTS` no siembra ficheros: simplemente despliega la carpeta como antes.
- El explorador sigue mostrando solo notas (y código): los ficheros de vista son
  notas.

## Área D — estructura de las explicaciones

Dos mitades, ambas con evidencia en el vault real.

**Estructura**: `docs/knowledge_base/templates/concept.md` y el prompt de la
base de conocimiento piden ahora Idea en una frase · Definición formal (**con
ejemplo visual**) · Notación · Ejemplos · **Contraejemplos y errores comunes**
(una sola sección, espejo de las cajas del mapa) · Resultados clave · Conexiones ·
Tarjetas. Fuera `## Intuición` y `## Práctica`.
`tools/reform_concept_notes.ts` aplica lo mismo a lo que ya existe (idempotente,
conserva frontmatter y `## Tarjetas`). Ejecutado: **40 notas reformadas, 80
secciones eliminadas, 40 fusiones**; comprobado después: 0 `Intuición`, 0
`Práctica`, 40 `Contraejemplos y errores comunes`, 40 `Tarjetas` intactas. El
texto retirado está en el historial git del propio vault.

**Texto completo de las cajas**: 640 de 678 cajas de texto del vault eran más
bajas que su contenido (por eso el índice no se leía y las explicaciones se
cortaban). `core/canvas/boxSizing.ts` recalcula la altura con la misma estimación
que usa el constructor, empuja hacia abajo lo que colisiona dentro del mismo
grupo y agranda los grupos que lo envuelven (solo crece, idempotente).
`tools/fix_canvas_boxes.ts` sobre el vault: **45 canvases, 640 cajas crecidas, 381
movidas, 341 grupos**. Revisión posterior sobre los ficheros: **678 cajas de
texto, 0 cortas**.

Matiz honesto: los nodos de tipo `file` (tarjetas que enlazan un ejercicio o una
nota) siguen mostrando un extracto en una tarjeta de ~120 px, no el texto entero;
son tarjetas con click-para-abrir, no cajas de explicación, y agrandarlas a su
contenido completo haría los mapas impracticables. Si se quieren también a tamaño
completo, es extender `fixCanvasBoxes` a `type: "file"`.

## Área E — verificación en la app empaquetada

`npm run electron:build` + `release/win-unpacked/NoteVault.exe` (CDP, puerto
9223), sobre el vault real:

- El árbol ya no muestra ningún `_tema`; sí `… .practica` y `… .teorica`.
- Click en el nombre de un tema → `.practica` en pestaña completa, con
  «Resumen | Practicar»; el configurador muestra los 8 modos con dificultad,
  cantidad y asistencia.
- Click en el nombre de un área → `.resumen` con las cifras del área
  (`TEMAS 0/12`), **2 gráficos circulares**, competencias del área, progresión por
  tema y «Practicar el área».
- `.teorica` → la teoría completa del tema (con su ejemplo, sus ejemplos y su
  sección fusionada) y los dos botones, «Abrir mapa» y «Abrir la nota de teoría».
- Mapas: los nodos de texto ya no recortan su contenido.

### Hallazgo previo que sigue ahí (no lo toca este plan)

111 nodos de archivo de los mapas apuntan a notas de una carpeta
`Matemáticas/1 Lógica y demostración/…` que ya no existe (la carpeta se llama hoy
`_piloto_logica`). No tiene relación con la migración —no se renombró ni se borró
ninguna nota— y se detecta porque ningún `_tema`/`.practica`/`.teorica`/`.resumen`
aparece entre las referencias rotas.

# Plan final de NoteVault: Metas, Proyectos y Finanzas

> Este plan cierra las funciones de la app. Cuando esté ejecutado, NoteVault
> queda **congelada en alcance**: solo se corrigen errores y se pule lo que ya
> existe. Está escrito para ejecutarse por fases, en orden, y cada fase deja la
> app usable, probada, con `NoteVault.exe` reconstruido y commit subido.

## Índice

1. [Reglas que se aplican a todas las fases](#1-reglas-que-se-aplican-a-todas-las-fases)
2. [Decisiones tomadas](#2-decisiones-tomadas)
3. [Fase 0 — Cimientos compartidos](#3-fase-0--cimientos-compartidos)
4. [Fase 1 — Metas](#4-fase-1--metas)
5. [Fase 2 — Proyectos tipo Jira](#5-fase-2--proyectos-tipo-jira)
6. [Fase 3 — Finanzas](#6-fase-3--finanzas)
7. [Fase 4 — App móvil](#7-fase-4--app-móvil)
8. [Fase 5 — Cierre](#8-fase-5--cierre)
9. [Riesgos y cómo se evitan](#9-riesgos-y-cómo-se-evitan)

---

## 1. Reglas que se aplican a todas las fases

Estas reglas vienen de lo que ya se corrigió en sesiones anteriores; romper
cualquiera cuenta como fase no terminada.

| Regla | Cómo se cumple |
|---|---|
| `FULLSTACK_FACTORY` no se toca nunca | Ningún comando ni edición fuera de `NoteVault/` y `notevault_mobile/`. |
| `NoteVault.exe` siempre al día | Tras cada cambio de código: `PyInstaller`, copiar a la raíz, abrirlo y comprobar que sigue abierto a los 12 s. |
| Toda la data en `.notevault/` | Los módulos nuevos van en `.notevault/metas/`, `.notevault/proyectos/`, `.notevault/finanzas/`. |
| Formato = escritorio + móvil a la vez | Cada cambio de formato actualiza `vault_format.py`, `vault_format.dart`, `docs/VAULT_FORMAT.md` (y su copia móvil) y los fixtures de `tests/conformance/`; `flutter test` y `python -m unittest` pasan en el mismo commit. |
| **Sin archivos globales nuevos** | Un archivo por entidad o por día. `test_only_three_global_files` debe seguir pasando sin tocarlo. |
| Réplica fiel de referencias | Si se adjuntan capturas, se replican elemento a elemento y se verifica con capturas `QWidget.grab()` en tema claro y oscuro. |
| Verificación real, no solo "importa" | Cada fase tiene un script que abre la ventana, recorre los flujos, guarda capturas y cuenta excepciones = 0. |
| Nada de pérdida de datos | Migraciones que nunca sobrescriben; borrar = mover a papelera o pedir confirmación. |
| Interfaz en español | Etiquetas, mensajes y formatos de fecha/moneda en español. |

**Plantilla de cierre de cada sub-fase**

1. Tests unitarios del núcleo (reglas, lectura/escritura, casos límite).
2. Script de interfaz en vault temporal → capturas claro/oscuro → revisarlas.
3. Humo con la ventana principal sobre la vault real (solo lectura).
4. `python -m unittest discover -s tests` + `flutter test` si hubo formato.
5. Reconstruir y copiar `NoteVault.exe`, arrancarlo.
6. Commit con mensaje en inglés explicando el porqué, push.

---

## 2. Decisiones tomadas

Tomadas para poder planificar con precisión. Se pueden cambiar antes de
empezar la fase correspondiente; después cuestan una migración.

| Tema | Decisión | Por qué |
|---|---|---|
| Orden | Fase 0 → Metas → Proyectos → Finanzas → Móvil → Cierre | Metas crea el árbol, las áreas y las tarjetas que Proyectos reutiliza. Finanzas es independiente y va al final. |
| Áreas | Compartidas entre Metas, Proyectos y Hábitos; **un archivo por área** | "Relacionado en cuanto a área" exige que hábitos y metas hablen de las mismas áreas. |
| Prioridad | Escala **1–4**: Baja, Media, Alta, Urgente (Metas y Proyectos) | Kanban tipo Jira necesita más de 3 niveles. Tareas mantiene su 1–3 actual. |
| Repetición, hora, duración, aviso | Se reutilizan `core/recurrence.py` y `ui/components/programacion.py` | Ya probados; mismo comportamiento en toda la app. |
| Moneda | **COP** por defecto, configurable; importes guardados como **enteros en centavos** | Sin errores de coma flotante al sumar. |
| Gráficas | Dibujadas con `QPainter`, sin QtCharts | No engorda el `.exe` y respeta el tema claro/oscuro. |
| Adjuntos de módulos | Copia dentro de `.notevault/<módulo>/adjuntos/AAAA/MM/` | Viajan con la vault por Syncthing y llegan al móvil. |
| Fecha de fin vencida | Nunca borra ni archiva: marca **Vencida** | Requisito 1.4. |
| Proyectos actuales | Se **migran** al formato nuevo (cada paso → issue) | Mismo principio que la migración v1→v2: nunca sobrescribe. |
| Tareas (módulo actual) | Se mantiene tal cual | No se pidió cambiarlo; Metas tiene sus propias submetas. |

---

## 3. Fase 0 — Cimientos compartidos

Todo lo que las tres fases necesitan, construido y probado una sola vez.

### 0.1 Deuda del contrato de formato

- `docs/VAULT_FORMAT.md` dice "versión 2"; el código ya está en 3. Corregir
  cabecera y árbol (falta `agenda/`).
- Subir `FORMAT_VERSION` a **4** al añadir las carpetas nuevas (se hace en la
  fase que las crea, no antes).

### 0.2 Áreas — `core/area_manager.py`

```
.notevault/areas/<area-id>.json
{"id": "programacion", "name": "Programación", "icon": "💻",
 "colour": "#3f51b5", "order": 2, "archived": false}
```

- API: `areas()`, `get(id)`, `create(name, icon, colour)`, `update`, `archive`,
  `reorder(ids)`. Caché con validación por `mtime` de la carpeta.
- Hábitos ganan la clave opcional `area` (se añade a `HABIT_OPTIONAL_KEYS`);
  el editor de hábitos muestra un selector de área.
- Borrar un área nunca borra metas/hábitos/proyectos: quedan "Sin área".

### 0.3 Adjuntos de módulo — `core/attachments.py`

- `store(module, source_path | QImage, day) -> "finanzas/adjuntos/2026/09/mv_x-1.png"`
  (ruta relativa a `.notevault/`). Copia, nunca sobrescribe (`nombre 1.png`).
- Pegar desde portapapeles (capturas `Win+Shift+S` → `Ctrl+V`) guarda PNG.
- `resolve(rel)` → ruta absoluta; si falta, se muestra "archivo no disponible"
  sin excepción.
- Tipos: png, jpg, jpeg, webp, gif, bmp, pdf.

### 0.4 Componentes de interfaz — `ui/components/comun/`

| Componente | Uso |
|---|---|
| `DashboardCard` | Tarjeta con barra de acento superior, título, chips y zona de estadísticas (Metas, Proyectos, Finanzas, Vista General). |
| `BlockProgress` | Barra de progreso de **bloques cuadrados** (estilo ya usado en hábitos). |
| `StatTile` | Número grande + etiqueta + variación. |
| `charts.py` | `BarChart`, `DonutChart`, `LineChart`, `Sparkline`, `HeatStrip` con QPainter y colores del tema. |
| `TreeList` | Árbol con expandir/colapsar, arrastrar para reordenar y sangrar, casilla, chips y acciones por fila. Base de submetas e issues. |
| `KanbanBoard` | Columnas con tarjetas arrastrables entre columnas y dentro de una columna. |
| `SpreadsheetTable` | `QTableView` estilo hoja de cálculo: cabecera fija, filas de subtotal y total, orden por columna, exportar CSV. |
| `AttachmentStrip` | Miniaturas + soltar/pegar/elegir archivo + visor a pantalla completa. |
| `PriorityPicker`, `AreaPicker`, `HabitLinkPicker` | Selectores reutilizables. |
| `MoneyEdit` | Campo de importe que acepta `12.500`, `12500`, `12,5k`; muestra `$ 12.500`. |

### 0.5 Fuentes del calendario

`ScheduleManager` hoy importa hábitos, ejercicio, tareas y proyectos
directamente. Se generaliza:

```python
schedule.register_source("metas", provider)   # provider.occurrences(first, last)
                                               # provider.set_done(date, occ_id, done)
                                               # provider.open(occ_id)
```

- Las ocurrencias nuevas usan `kind` = `goal_item`, `issue`, `saving`.
- El menú al pulsar un bloque (ya existe para hábitos) se generaliza:
  "Marcar como hecho", "Abrir en <módulo>".
- Recordatorios: `reminder_scheduler` pasa a aceptar cualquier objeto con
  `reminder`, `reminder_done`, `is_done`, de modo que issues y submetas avisan
  igual que las tareas.

### 0.6 Navegación

- Barra de iconos: añadir **Metas** (🎯) y **Finanzas** (💰) entre Proyectos y
  Notas. Proyectos se queda en su sitio.
- `main_window.py`: los gestores se crean una vez y se comparten (como ya se
  hace con `ScheduleManager`).

**Criterio de hecho de la Fase 0**: tests de áreas, adjuntos y
`register_source`; galería de componentes en una ventana de prueba con
capturas claro/oscuro; la app arranca sin cambios visibles salvo los dos
iconos nuevos (con pantalla "Próximamente" hasta su fase).

---

## 4. Fase 1 — Metas

### 4.1 Qué resuelve (requisitos 1.1–1.6)

| Requisito | Cómo |
|---|---|
| 1.1 Dividir por áreas; bloques tipo dashboard, dentro como tareas | Tablero agrupado por área con `DashboardCard`; detalle con árbol de submetas. |
| 1.2 En Vista General; periodicidad, calendario, prioridad | Tarjeta "Metas de hoy"; submetas con `repeat`, hora, duración, aviso, `in_calendar`, `priority`. |
| 1.3 Varias metas | Una carpeta por meta; sin límite. |
| 1.4 Fecha de inicio y fin sin borrado | `start`, `end`; al pasar `end` → insignia **Vencida**, sigue editable. |
| 1.5 Submetas divisibles | Árbol ilimitado por `parent`. |
| 1.6 Conexión con hábitos por área | `habit_links` en submetas; al completarlas se marca el hábito ese día. |

### 4.2 Formato en disco

```
.notevault/metas/
├── <goal-id>/
│   ├── goal.md                       la meta
│   └── items/<item-id>.md            una submeta por archivo, a cualquier nivel
└── registro/AAAA/MM/AAAA-MM-DD.json  checks del día de submetas repetitivas
```

`goal.md`

```markdown
---
id: g20260914-a1b2c3
name: "Ser desarrollador backend"
area: programacion
status: Activa                # Activa · En pausa · Completada · Archivada
priority: 3                   # 1 Baja · 2 Media · 3 Alta · 4 Urgente
start: 2026-09-14
end: 2026-12-31
icon: "💻"
colour: "#3f51b5"
in_overview: true             # aparece en Vista General
created: 2026-09-14
---

Descripción libre en markdown.
```

`items/<item-id>.md`

```markdown
---
id: i20260914-d4e5f6
goal: g20260914-a1b2c3
parent:                       # vacío = submeta de primer nivel
name: "Programar 3 horas"
status: Pendiente             # Pendiente · En curso · Hecha
priority: 3
order: 2.5                    # orden entre hermanas (float: insertar sin renumerar)
start: 2026-09-14
due: 2026-10-01
due_time: "18:00"
duration_min: 180
repeat: "daily"               # vacío = submeta única
repeat_until: 2026-12-31
in_calendar: true
reminder_min: 15
target: 3                     # opcional: meta medible
unit: "h"
habit_links: "coding,math"    # ids de hábitos, separados por coma
done_at: 2026-09-20           # fecha en que pasó a Hecha (solo únicas)
---

Notas de la submeta.
```

`registro/AAAA/MM/AAAA-MM-DD.json` (solo submetas con `repeat`)

```json
{
  "items": {
    "g20260914-a1b2c3/i20260914-d4e5f6": {"done": true, "value": 3.5, "at": "21:40"}
  },
  "habit_marks": {
    "coding": ["g20260914-a1b2c3/i20260914-d4e5f6"]
  }
}
```

- `habit_marks` recuerda **qué marcas de hábito puso Metas** para poder
  quitarlas al desmarcar sin tocar las que el usuario puso a mano.
- Una submeta con hijas no se marca a mano: está Hecha cuando todas sus hijas
  lo están (se muestra calculado, no se guarda).

### 4.3 Núcleo — `core/goal_manager.py`

- `goals(filter)`, `get_goal`, `create_goal`, `update_goal`, `delete_goal`
  (a papelera `.notevault/.papelera/metas/`).
- `items(goal_id)` → árbol; `create_item(goal_id, parent=None, **f)`,
  `update_item`, `move_item(item, new_parent, new_order)`, `delete_item`
  (con hijas → confirma y borra en cascada a la papelera).
- `items_due_on(d)` → submetas únicas con `due == d` o vencidas no hechas, y
  repetitivas cuya regla cae en `d` (`recurrence.occurs_on`, ancla `start`).
- `set_done(item, d, done, value=None)`:
  - única → `status`, `done_at`;
  - repetitiva → registro del día;
  - medible → hecha cuando `value >= target`;
  - después, `_sync_habits(item, d)`.
- `_sync_habits`: para cada `habit_link` activo ese día (`habit_active_on`)
  marca `completed=True` y añade la fuente a `habit_marks`; al desmarcar quita
  la fuente y, si no queda ninguna **y** la marca la puso Metas, desmarca.
- Progreso de una meta (0–1), definido una vez y probado:
  - cada hoja única vale 1 si está Hecha;
  - cada hoja repetitiva vale `días cumplidos / días programados` desde `start`
    hasta `min(hoy, end)`;
  - progreso = media de las hojas; una rama es la media de sus hijas.
- Estadísticas: `streak(item)`, `adherence(goal, days=7|30)`,
  `completed_between(a, b)`, `overdue(goal)`, `days_left(goal)`.
- Fuente del calendario (`register_source("metas", …)`): submetas con
  `in_calendar`.

### 4.4 Interfaz

**Panel izquierdo**

- Botón "+ Nueva meta" y "+ Área".
- Lista de áreas con icono, color y contador de metas activas; "Todas" y
  "Sin área".
- Filtros: Activas · En pausa · Completadas · Vencidas · Archivadas.
- Vistas: Tablero · Hoy · Calendario.

**Tablero (dashboard de metas)**

- Secciones por área (cabecera con color del área, progreso medio del área).
- `DashboardCard` por meta: icono, nombre, chip de prioridad, rango de fechas
  con "faltan N días" o **Vencida**, `BlockProgress`, "7/12 submetas",
  adherencia 7 días, próxima submeta con fecha, `Sparkline` de los últimos 14
  días, hábitos conectados como chips.
- Orden: prioridad, fecha de fin, progreso o manual (arrastrar).

**Detalle de meta** (al pulsar una tarjeta)

- Cabecera editable en línea: nombre, área, estado, prioridad, fechas, color.
- Franja de `StatTile`: progreso, submetas hechas/total, adherencia 7 y 30
  días, racha, días restantes.
- Árbol de submetas (`TreeList`): casilla, nombre, prioridad, chip de fecha o
  de repetición ("Cada día · 18:00"), 📅 si va al calendario, chips de hábitos,
  barra de progreso en las ramas. "+ Submeta" en cada fila crea una hija;
  arrastrar reordena o cambia de padre; `Tab`/`Shift+Tab` sangran.
- Editor de submeta (lateral): nombre, estado, prioridad, fechas, repetición
  (`RecurrencePicker`), hora/duración escribibles, aviso, en calendario,
  meta medible (objetivo + unidad), hábitos conectados (`HabitLinkPicker`
  que muestra primero los hábitos del **mismo área**), notas.
- Pestañas: **Submetas** · **Hoy** (lo que toca hoy con casillas y valor si es
  medible) · **Historial** (`HeatStrip` por submeta repetitiva y lista de
  completadas) · **Notas** (descripción).

**Vista "Hoy"**: todas las submetas que tocan hoy de todas las metas, agrupadas
por área, con casilla y campo de valor. Es la pantalla de uso diario.

**Vista General**: tarjeta "Metas" con las metas `in_overview`, su progreso y
las submetas de hoy marcables desde ahí.

**Calendario**: bloques de submetas `in_calendar`; al pulsar, menú "Marcar
como hecha" / "Abrir meta".

### 4.5 Sub-fases

| # | Entrega | Verificación clave |
|---|---|---|
| 1a | `goal_manager` + formato + fixtures + docs | Tests de árbol, progreso, repetición, vencidas, `_sync_habits` (marcar, desmarcar, marca manual respetada). |
| 1b | Tablero + panel izquierdo + crear/editar meta | Capturas del tablero con 3 áreas y 6 metas. |
| 1c | Detalle con árbol, editor de submeta, arrastrar/sangrar | Script que crea 3 niveles, reordena y mueve de padre; relectura desde disco igual. |
| 1d | Vista Hoy + conexión con hábitos + Vista General | Marcar "Programar 3 h" marca `coding` en el registro de hábitos; desmarcar lo quita; la marca manual previa se conserva. |
| 1e | Calendario + recordatorios + historial/estadísticas | Bloques en la semana; aviso dispara; gráficas en claro/oscuro. |

---

## 5. Fase 2 — Proyectos tipo Jira

### 5.1 Qué resuelve

Un tablero de proyectos tipo dashboard (como Metas) y, al abrir un proyecto,
un espacio tipo Jira para una sola persona: **Resumen** con estadísticas por
submeta arriba del todo, **Tablero Kanban**, **Lista/backlog**,
**Calendario** del proyecto conectable al general y **recordatorios**.

### 5.2 Formato en disco y migración

```
.notevault/proyectos/
└── <project-id>/
    ├── project.md                     el proyecto
    └── issues/<issue-id>.md           submetas, tareas, subtareas, errores
```

`project.md`

```markdown
---
id: p20260911-a1b2c3
key: WEB                          # prefijo de las claves: WEB-12
name: "Portafolio web"
status: En curso                  # Planeado · En curso · Pausado · Terminado
area: programacion
colour: "#2383e2"
icon: "🌐"
created: 2026-09-11
start: 2026-09-11
deadline: 2026-10-30
columns: "Por hacer,En curso,En revisión,Hecho"   # flujo del Kanban, editable
done_column: "Hecho"
in_calendar: true                 # sus issues con fecha van al calendario general
---

Descripción del proyecto.
```

`issues/<issue-id>.md`

```markdown
---
id: x20260914-b7c8d9
number: 12                        # clave visible WEB-12
type: Tarea                       # Submeta · Tarea · Subtarea · Error · Mejora
parent: x20260912-aaaaaa          # Submeta o Tarea padre; vacío = raíz
title: "Maquetar la home"
status: En curso                  # una de las columnas del proyecto
priority: 3                       # 1 Baja · 2 Media · 3 Alta · 4 Urgente
order: 4.0                        # posición dentro de su columna
estimate_min: 240                 # estimación (escribible: "4 h")
labels: "frontend,diseño"
created: 2026-09-14
start: 2026-09-15
due: 2026-09-20
due_time: "17:00"
repeat:
repeat_until:
in_calendar: true
reminder: 2026-09-19T18:00
reminder_done: false
done_at:                          # se rellena al entrar en la columna de hecho
---

Descripción en markdown, con checklist y adjuntos.
```

**Migración** (`migrate_projects()` en Python y Dart, al abrir la vault):

1. Por cada `proyectos/<id>.md` antiguo sin carpeta `proyectos/<id>/`:
2. crear `proyectos/<id>/project.md` con el frontmatter conservado, `key`
   derivada del nombre y el cuerpo **sin** la sección `## Tareas`;
3. cada línea `- [x] paso | fecha` → issue `type: Tarea`, `status` Hecho o Por
   hacer, `due` = fecha, `number` correlativo;
4. solo cuando todo lo anterior está escrito, el archivo antiguo se mueve a
   `.notevault/.papelera/proyectos-v3/` (nunca se borra).

`number` se calcula como máximo existente + 1 al crear. Dos dispositivos que
creen a la vez podrían repetir número: el `id` sigue siendo único y la
interfaz lo detecta y renumera el más reciente.

### 5.3 Núcleo — `core/project_manager.py` (reescrito)

- Proyectos: `projects()`, `get`, `create`, `update`, `delete` (papelera),
  `set_columns(project, columns)` (renombrar columna actualiza sus issues).
- Issues: `issues(project, filter)`, `tree(project)`, `create_issue`,
  `update_issue`, `move(issue, status, order)` (rellena/limpia `done_at`),
  `reparent`, `delete_issue` (cascada a papelera).
- Estadísticas (`ProjectStats`), todas probadas con datos fijos:
  - por proyecto y **por submeta**: total, hechas, % progreso, abiertas,
    vencidas, por estado, por prioridad, por tipo, estimado total vs hecho;
  - **burndown**: pendientes por día entre `start` y `deadline` (con `created`
    y `done_at`);
  - **rendimiento**: hechas por semana (últimas 8);
  - tiempo medio de ciclo (`created → done_at`).
- Recordatorios con el `reminder_scheduler` generalizado (Fase 0.5).
- Fuente del calendario: issues con fecha de proyectos `in_calendar` o issues
  `in_calendar`.

### 5.4 Interfaz

**Tablero de proyectos**: `DashboardCard` por proyecto con progreso en bloques,
abiertas/vencidas, próximo vencimiento, días al deadline, `Sparkline` de
rendimiento, chip de área; agrupables por área o estado; buscar y filtrar.

**Proyecto abierto** — cabecera con clave, nombre, estado, fechas, progreso y
"+ Crear issue" (atajo `C`). Pestañas:

1. **Resumen** (lo primero que se ve)
   - `StatTile`: progreso, abiertas, vencidas, hechas esta semana, días al
     deadline.
   - `DonutChart` por estado, `BarChart` por prioridad, `LineChart` burndown,
     `BarChart` rendimiento semanal.
   - **Submetas**: una fila por submeta con `BlockProgress`, hechas/total,
     vencidas y botón "Ver en tablero" que filtra por ella.
2. **Tablero** (Kanban)
   - Columnas del flujo del proyecto con contador; tarjetas con clave, título,
     prioridad (color), tipo (icono), fecha (roja si vencida), etiquetas,
     submeta padre.
   - Arrastrar entre columnas y reordenar; carriles opcionales por submeta o
     por prioridad; filtros rápidos: prioridad, etiqueta, submeta, "vencidas",
     "vencen esta semana".
3. **Lista** (backlog): `TreeList` + tabla con columnas clave, título, tipo,
   estado, prioridad, fecha, estimación; orden por columna; edición en línea.
4. **Calendario**: mes con los issues por fecha; arrastrar para cambiar la
   fecha; interruptor "Mostrar en el calendario general".
5. **Notas**: descripción del proyecto.

**Detalle de issue** (panel lateral, como Jira): título, tipo, estado,
prioridad, padre, hijas con progreso, fechas, repetición, hora, estimación
escribible, etiquetas, recordatorio, descripción markdown con checklist,
`AttachmentStrip`.

**Vista General**: la tarjeta de proyectos muestra issues que vencen hoy o
están vencidos y el progreso de los proyectos activos.

### 5.5 Sub-fases

| # | Entrega | Verificación clave |
|---|---|---|
| 2a | Formato + migración + `project_manager` + fixtures (escritorio y Dart) | Migrar una copia de la vault real: nº de pasos = nº de issues; antiguos en papelera; `flutter test` verde. |
| 2b | Tablero de proyectos + detalle de issue | Capturas; crear/editar/borrar issue releído desde disco. |
| 2c | Kanban con arrastre, carriles y filtros | Script que arrastra entre columnas y comprueba `status`, `order`, `done_at`. |
| 2d | Resumen con estadísticas por submeta y gráficas | Datos fijos → números y gráficas esperados; capturas claro/oscuro. |
| 2e | Lista, calendario del proyecto, calendario general, recordatorios | Issue con fecha aparece en ambos calendarios; aviso dispara una vez. |

---

## 6. Fase 3 — Finanzas

### 6.1 Qué resuelve (requisitos 3.1–3.6)

| Requisito | Cómo |
|---|---|
| 3.1 Registrar gastos del día como los hábitos | Vista Diaria con fila de entrada rápida: importe, en qué, categoría, razón, Enter. |
| 3.2 Registros diario/semanal/mensual tipo Excel con sumatorias | `SpreadsheetTable` con subtotales por día, totales por categoría y tipo, balance; resumen anual por mes. |
| 3.3 Capturas de facturas | `AttachmentStrip` en cada movimiento (pegar, soltar, elegir). |
| 3.4 Botón de ahorro en la vista diaria | "+ Ahorro" con importe, razón y foto, igual que gasto o ingreso. |
| 3.5 Metas financieras separadas, con check diario/semanal personalizable y visibles solo si se activa | Metas propias de Finanzas con `show_in_daily` y cadencia; aparecen como "Ahorro Moto" con casilla. |
| 3.6 Registro de ahorros por meta | Detalle de meta con cuánto llevas, historial por día y mes, razones y capturas. |

### 6.2 Formato en disco

```
.notevault/finanzas/
├── categorias/<cat-id>.json          una categoría por archivo
├── metas/<fgoal-id>.json             una meta financiera por archivo
├── AAAA/MM/AAAA-MM-DD.json           movimientos del día
└── adjuntos/AAAA/MM/<mov-id>-<n>.png facturas y referencias
```

`categorias/<cat-id>.json`

```json
{"id": "comida", "name": "Comida", "icon": "🍽", "colour": "#f4511e",
 "kind": "gasto", "budget_month_cents": 60000000, "order": 1, "archived": false}
```

`metas/<fgoal-id>.json`

```json
{
  "id": "f20260914-a1b2c3",
  "name": "Moto",
  "icon": "🏍",
  "colour": "#33b679",
  "target_cents": 1200000000,
  "currency": "COP",
  "start": "2026-09-14",
  "deadline": "2027-06-30",
  "show_in_daily": true,
  "cadence": {"mode": "rule", "rule": "weekly:4"},
  "suggested_cents": 5000000,
  "status": "Activa",
  "created": "2026-09-14",
  "notes": ""
}
```

- `cadence.mode`:
  - `"rule"` — la casilla aparece los días en que cae la regla
    (`daily`, `weekly:4`, `every:15`, `monthly:1,15`);
  - `"period"` con `"period": "week" | "month"` — una casilla por semana o
    mes, marcada en cuanto hay un ahorro para esa meta dentro del periodo.
- `status`: Activa · En pausa · Cumplida (automática al llegar al objetivo;
  nunca se borra ni se oculta del historial).

`AAAA/MM/AAAA-MM-DD.json`

```json
{
  "movements": [
    {"id": "mv20260914-0f1e2d", "type": "gasto", "amount_cents": 1250000,
     "currency": "COP", "category": "comida", "what": "Almuerzo",
     "reason": "Día de oficina", "time": "13:10",
     "attachments": ["finanzas/adjuntos/2026/09/mv20260914-0f1e2d-1.png"],
     "created": "2026-09-14T13:12"},
    {"id": "mv20260914-3c4b5a", "type": "ahorro", "amount_cents": 5000000,
     "currency": "COP", "goal": "f20260914-a1b2c3", "what": "Ahorro Moto",
     "reason": "Semana cumplida", "time": "20:00", "attachments": []},
    {"id": "mv20260914-9a8b7c", "type": "retiro", "amount_cents": 2000000,
     "currency": "COP", "goal": "f20260914-a1b2c3", "reason": "Repuesto"}
  ]
}
```

- `type`: `gasto` · `ingreso` · `ahorro` (entra a una meta o al ahorro
  general si `goal` está vacío) · `retiro` (sale de un ahorro).
- Importes siempre enteros en centavos. Balance del día =
  ingresos − gastos − ahorros + retiros.
- Categorías por defecto que se crean si la carpeta está vacía: Comida,
  Transporte, Vivienda, Servicios, Salud, Educación, Ocio, Compras, Otros
  (gasto); Salario, Extra, Regalo (ingreso).

### 6.3 Núcleo — `core/finance_manager.py`

- Categorías: `categories(kind)`, `create`, `update`, `archive`.
- Movimientos: `day(d)`, `add(d, **f)`, `update(d, id, **f)`,
  `move(id, old_d, new_d)`, `delete(d, id)` (adjuntos a papelera).
- Rangos con caché por `mtime`: `range(a, b)`, `week(d)`, `month(y, m)`,
  `year(y)`.
- Sumas (probadas con datos fijos, sin flotantes):
  `totals(movements) -> {gasto, ingreso, ahorro, retiro, balance}`,
  `by_category`, `by_day`, `by_week`, `by_month`, comparación con el periodo
  anterior, presupuesto usado por categoría.
- Metas: `goals()`, `create_goal`, `update_goal`, `saved(goal)` (ahorros −
  retiros), `history(goal)` por día y por mes, `due_checks(d)` según cadencia
  y `show_in_daily`, `pace(goal)` (cuánto hay que ahorrar por día/semana para
  llegar a tiempo), `projection(goal)` (fecha estimada con el ritmo de los
  últimos 30 días).
- Formato de dinero: `$ 12.500` (COP, separador de miles punto, sin
  decimales); otras monedas con 2 decimales.

### 6.4 Interfaz

**Panel izquierdo**: Diario · Semanal · Mensual · Anual · Metas financieras ·
Categorías; saldo del mes y ahorro total.

**Diario** (pantalla de uso diario)

- Navegación de fecha (hoy, ‹ ›).
- Tres botones grandes: **+ Gasto**, **+ Ingreso**, **+ Ahorro**.
- Fila de entrada rápida (siempre visible): importe (`MoneyEdit`), en qué,
  categoría, razón, 📎, Enter guarda y deja el foco listo para el siguiente.
- **Ahorros de hoy**: una casilla por meta con `show_in_daily` que toca hoy
  ("Ahorro Moto — $ 50.000"). Marcar abre el diálogo con el importe sugerido,
  razón y foto; desmarcar pide confirmar y quita ese ahorro.
- Tabla del día: hora, tipo (color), categoría, en qué, razón, importe, 📎.
- Totales del día: Gastos, Ingresos, Ahorro, Balance.

**Semanal** — `SpreadsheetTable` con dos modos:
- *Por movimiento*: filas agrupadas Lun…Dom con **subtotal por día** y
  **TOTAL de la semana**;
- *Por categoría*: categorías × días, columna TOTAL y fila TOTAL.

**Mensual** — igual con días del mes; además `BarChart` de gasto diario,
`DonutChart` por categoría, presupuesto por categoría con `BlockProgress`,
comparación con el mes anterior y **sumatorio del mes** siempre visible abajo.

**Anual** — meses × (gastos, ingresos, ahorro, balance) con total del año.

Todas las vistas: filtro por tipo y categoría, buscar, exportar CSV, doble
clic para editar un movimiento.

**Metas financieras**

- Tarjetas con icono, nombre, `BlockProgress` ahorrado/objetivo, "llevas
  $ 3.200.000 de $ 12.000.000 (27 %)", falta, ritmo necesario, proyección,
  interruptor **"Mostrar en Diario"** (3.5) y cadencia editable.
- Detalle: `LineChart` de ahorro acumulado, **registro de ahorros** tabla por
  día (fecha, importe, razón, 📎 con miniatura) con subtotal por mes, retiros
  aparte, galería de capturas de la meta.

**Vista General**: tarjeta "Finanzas" con gasto de hoy, gasto del mes vs mes
anterior, ahorros que tocan hoy con casilla.

### 6.5 Sub-fases

| # | Entrega | Verificación clave |
|---|---|---|
| 3a | Formato + `finance_manager` + categorías por defecto + fixtures + docs | Sumas con casos límite (0, grandes, retiros, meses de 28–31 días); centavos exactos. |
| 3b | Vista Diaria con entrada rápida, adjuntos (pegar/soltar) y totales | Pegar una imagen del portapapeles la guarda en `adjuntos/` y la muestra; releer igual. |
| 3c | Semanal, Mensual, Anual tipo hoja de cálculo + CSV | Totales de la tabla = totales del núcleo; capturas claro/oscuro. |
| 3d | Metas financieras + casillas en Diario + registro de ahorros | Cadencias `rule` y `period`; "Mostrar en Diario" oculta/muestra; meta Cumplida al llegar. |
| 3e | Vista General + presupuestos + comparaciones | Tarjeta correcta con datos fijos. |

---

## 7. Fase 4 — App móvil

Cada fase anterior ya deja en la móvil el **formato y los gestores** con
`flutter test` en verde (regla de la sección 1). Esta fase añade las
pantallas que tienen sentido en el teléfono:

| Módulo | Pantallas móviles |
|---|---|
| Metas | Lista por área con progreso; "Hoy" con casillas y valor; detalle en solo lectura del árbol con marcar hecha. |
| Proyectos | Lista de proyectos; Kanban en columnas deslizables con cambio de estado; detalle de issue. |
| Finanzas | **Registro rápido** (gasto/ingreso/ahorro con cámara o galería para la factura); Diario con totales; casillas de ahorro; resumen del mes. |

Verificación: goldens con `flutter test --update-goldens` revisados a mano y
prueba en el teléfono con la vault sincronizada.

---

## 8. Fase 5 — Cierre

1. Rendimiento: abrir cada módulo < 150 ms con una vault de 1 año de datos
   sintéticos (365 días de finanzas, 20 metas × 50 submetas, 5 proyectos ×
   200 issues); `range()` del calendario de un mes < 50 ms con todas las fuentes.
2. Pasada visual completa, claro y oscuro, de todos los módulos.
3. `docs/VAULT_FORMAT.md` y `docs/AI_HANDBOOK.md` al día en ambos repos.
4. `NoteVault.exe` final, commit y etiqueta `v1.0`.
5. A partir de aquí: **congelación de funciones**.

---

## 9. Riesgos y cómo se evitan

| Riesgo | Mitigación |
|---|---|
| Conflictos de Syncthing en archivos compartidos | Un archivo por entidad/día; sin globales nuevos; los `*.sync-conflict-*` se muestran. |
| Migración de proyectos que pierda pasos | Se escribe todo lo nuevo antes de mover lo viejo a la papelera; prueba sobre copia de la vault real. |
| Marcas de hábitos que Metas quita por error | `habit_marks` guarda la procedencia; solo se quitan marcas puestas por Metas. |
| Errores de redondeo en dinero | Enteros en centavos en disco y en memoria; formateo solo al mostrar. |
| La interfaz se congela con muchos datos | Cachés por `mtime`, lecturas por rango, tablas con modelo (`QAbstractTableModel`) en lugar de un widget por celda. |
| El móvil se queda atrás | Formato y gestores Dart en el mismo commit que el escritorio; fixtures de conformidad por módulo. |
| `.exe` más pesado | Gráficas con QPainter; sin dependencias nuevas. |
| Estilo global rompiendo componentes nuevos | Aprendido: `min-width` en QSS anula tamaños fijos y los campos heredan fuente monoespaciada; los componentes de `comun/` fijan tamaño y fuente en su propia hoja de estilo. |

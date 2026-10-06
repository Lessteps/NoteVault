# Formato de la vault de NoteVault

> **Versión del formato: 4**
>
> Este documento es el contrato de formato de la vault de NoteVault. La app de
> escritorio (Electron + TypeScript + React) lo implementa en
> `frontend/src/core/`; el cliente móvil (en otro repositorio) lee y escribe los
> mismos archivos. No hay servidor, base de datos ni protocolo entre ellos.
>
> Si cambias el formato, actualiza este documento **y** los tests de
> `frontend/src/core/` que lo fijan, y sube `FORMAT_VERSION` en
> `frontend/src/core/vaultFormat.ts`. `vaultFormat.test.ts` ata el código a este
> contrato y falla si dejan de coincidir; `store.test.ts`, `recurrence.test.ts`,
> `habitManager.test.ts` y `financeManager.test.ts` fijan el formato de cada entidad.

## Principios

1. **Una vault es una carpeta cualquiera del disco.** Puede ser la misma que
   usas en Obsidian. La app nunca asume que la creó ella.
2. **Todo es texto legible a mano**: markdown con frontmatter, o JSON.
3. **Un archivo por día o por entidad.** Esto es deliberado: dos dispositivos
   pueden escribir a la vez mientras toquen entidades distintas, y una
   sincronización por carpeta (Syncthing) no genera conflictos.
4. **Las fechas son ISO 8601** (`YYYY-MM-DD`) y las fechas con hora
   `YYYY-MM-DDTHH:MM`, siempre en hora local, sin zona horaria.
5. **Codificación UTF-8**, saltos de línea `\n`.

## Árbol

```
vault/
├── .notevault/                            toda la data de los módulos
│   ├── habits/
│   │   ├── habits_config.json             ⚠ global
│   │   └── YYYY/MM/YYYY-MM-DD.md          un archivo por día
│   ├── ejercicio/
│   │   ├── exercises.json                 ⚠ global
│   │   ├── videos/<archivo>.mp4           demostraciones de cada ejercicio
│   │   └── YYYY/MM/YYYY-MM-DD.json        un archivo por día
│   ├── tareas/
│   │   └── <task-id>.md                   un archivo por tarea
│   ├── proyectos/
│   │   └── <project-id>.md                un archivo por proyecto
│   ├── agenda/                            calendario (rutinas, eventos por día)
│   ├── areas/
│   │   └── <area-id>.json                 un archivo por área
│   ├── metas/
│   │   ├── <goal-id>/goal.md              una carpeta por meta
│   │   ├── <goal-id>/items/<item-id>.md   una submeta por archivo
│   │   └── registro/YYYY/MM/YYYY-MM-DD.json  checks del día
│   ├── estudio/                           práctica: intentos, errores, repaso
│   ├── web/                               módulo WEB: marcadores, reglas, historial, uso
│   │   ├── marcadores.json
│   │   ├── restricciones.json
│   │   ├── historial/YYYY/MM/YYYY-MM-DD.json
│   │   └── uso/YYYY/MM/YYYY-MM-DD.json
│   └── .papelera/                         lo borrado, nunca se elimina de verdad
├── .notevault-bookmarks.json              ⚠ global
└── <lo que sea>/…                         las notas del usuario
```

Los cuatro módulos guardan su data dentro de **una sola carpeta**, `.notevault`,
en la raíz de la vault. Así la vault viaja como una unidad: se conecta una sola
carpeta a Syncthing en lugar de cuatro. Al empezar por punto, queda fuera del
explorador de notas sin necesitar ninguna regla extra.

### Migración desde la versión 1

En la versión 1 las carpetas `habits`, `ejercicio`, `tareas` y `proyectos`
vivían sueltas en la raíz. Las dos apps las mueven bajo `.notevault/` la primera
vez que abren la vault (`migrateVault()` en `frontend/src/core/vaultManager.ts` y su equivalente en el cliente móvil).

La migración **nunca sobrescribe**: si el destino ya tiene ese archivo, gana el
del destino y la copia vieja se queda en disco. Una vault a medio sincronizar no
puede perder datos por migrar.

⚠ = archivo global, único para toda la vault. Son los tres puntos donde dos
dispositivos pueden colisionar. Cambian rara vez; una app móvil debería
escribirlos solo cuando el usuario edita explícitamente la configuración.

## Hábitos

### `.notevault/habits/habits_config.json`

```json
{
  "version": 3,
  "habits": [
    {
      "id": "hairwash",
      "name": "Lavarme el cabello",
      "icon": "🧴",
      "days": [0, 2, 4],
      "subtasks": [{"id": "theory", "name": "Estudiar teoría"}]
    }
  ]
}
```

- `days`: días de la semana en los que el hábito está activo,
  **0 = lunes … 6 = domingo**. Ausente o vacío significa todos los días.
- `subtasks`: lista, posiblemente vacía.

Claves opcionales (`HABIT_OPTIONAL_KEYS`); se escriben solo si tienen valor y
un cliente que no las use debe conservarlas al reescribir el archivo:

| Clave | Ejemplo | Significado |
|---|---|---|
| `repeat` | `"every:2"` | Regla de repetición (ver [Repetición](#repetición)). Si existe, **manda sobre `days`**. Solo se guarda para `every` y `monthly`; `daily` y `weekly` se expresan con `days`. |
| `start_date` | `"2026-09-14"` | Primer día en que cuenta; ancla de `every:N`. |
| `end_date` | `"2026-12-31"` | Último día en que cuenta. |
| `paused_from` | `"2026-10-01"` | Inactivo desde ese día (incluido); los días anteriores conservan su porcentaje. |
| `time` | `"07:30"` | Hora a la que aparece en Calendario. |
| `duration_min` | `30` | Duración del bloque en Calendario. |
| `in_calendar` | `true` | Aparece como bloque propio en Calendario. |
| `reminder_min` | `10` | Aviso de escritorio N minutos antes de `time`. |
| `colour` | `"#33b679"` | Color del bloque. |
| `notes` | `"texto"` | Notas libres. |
| `area` | `"programacion"` | Id del [área](#áreas) del hábito. |

Con `repeat` presente, `days` se reescribe con todos los días de la semana,
para que un cliente antiguo que solo lee `days` no oculte el hábito.
Un hábito está activo un día si no está en pausa ese día, el día cae entre
`start_date` y `end_date` y la regla (o `days`) cae en él.
- Al leer una configuración con `version` menor que la actual, se añaden los
  hábitos por defecto que falten **sin borrar** los del usuario.

### `.notevault/habits/YYYY/MM/YYYY-MM-DD.md`

```markdown
---
date: 2026-09-12
completed:
  nophone: true
  bed: false
notes: ""
subtasks: {"coding": {"theory": true}}
---

Texto libre del diario del día.
```

- El bloque `completed` lleva **dos espacios** de sangría y valores
  `true`/`false`.
- `subtasks` es una línea con JSON en una sola línea; se omite si está vacío.
- Todo lo que va **después del segundo `---`** es el diario del día.
- El porcentaje del día se calcula solo sobre los hábitos activos ese día de
  la semana, nunca sobre todos.

## Ejercicio

### `.notevault/ejercicio/exercises.json`

Lista de definiciones de ejercicio:

```json
[
  {
    "id": "lunes_1",
    "day": "lunes",
    "name": "Bench Press",
    "video": "1.bench_press.mp4",
    "video_path": "",
    "series_reps": "4x5",
    "rest": "2-3 min",
    "how_to": "Escápulas retraídas…"
  }
]
```

- `day` es uno de `lunes martes miercoles jueves viernes sabado domingo`
  (sin tildes).
- `video` es un nombre de archivo. Si `video_path` no existe en este
  dispositivo, el cliente busca `video` dentro de `.notevault/ejercicio/videos/`;
  así la ruta absoluta de otro equipo no rompe la reproducción.
- Toda rutina termina con un ejercicio cuyo nombre empieza por
  `Estiramientos`; si falta, se añade al cargar.

### `.notevault/ejercicio/biblioteca.json`

Entradas propias de la biblioteca (las que la persona escribe sobre el
catálogo del paquete). `{ "entries": [...] }`; fichero ilegible = vacío.

### `.notevault/ejercicio/biblioteca-favoritos.json`

Slugs marcados como favoritos. `{ "favorites": ["press-banca", ...] }`;
fichero ausente o corrupto = vacío.

### `.notevault/ejercicio/YYYY/MM/YYYY-MM-DD.json`

Registro del día, indexado por id de ejercicio:

```json
{
  "lunes_1": {"done": true, "weight": 60.0, "reps": 5, "notes": "fácil"}
}
```

## Tareas

### `.notevault/tareas/<task-id>.md`

El id tiene la forma `tYYYYMMDD-xxxxxx` (fecha de creación + 6 hex).

```markdown
---
id: t20260912-a1b2c3
name: "Ensayo de historia"
created: 2026-09-12
start: 2026-09-12
due: 2026-09-20
status: Sin empezar
subject: "Historia"
priority: 2
reminder: 2026-09-19T18:00
reminder_done: false
---

Cuerpo markdown libre: el "archivo interno" de la tarea.
```

- `status` ∈ `Sin empezar` · `En progreso` · `Completado` · `Bloqueado`.
- `priority` ∈ 1 … 3.
- `reminder` vacío significa sin recordatorio.
- `reminder_done` pasa a `true` cuando **algún** dispositivo ya avisó. Es la
  bandera que evita que el móvil y el escritorio notifiquen dos veces; ver
  `reminderScheduler.ts`.
- Los campos de fecha vacíos se escriben como la clave sin valor.
- Opcionales, en este orden **después de `reminder_done`** y antes de cualquier
  clave desconocida (`TASK_OPTIONAL_KEYS`):
  - `repeat: "weekly:0,3"` — regla de [repetición](#repetición). El valor va
    entre comillas dobles cuando contiene `:` (`repeat: daily` no las lleva).
  - `repeat_until: 2026-10-31` — solo si hay `repeat`.
- Una tarea con `repeat` cae en cada día en que cae la regla, anclada en `due`
  (o `start` si no hay `due`) y hasta `repeat_until`.
- Al pasar a `Completado`, una tarea con `repeat` **avanza** a la siguiente
  fecha de la regla: `due` pasa a esa fecha, `start` y `reminder` se desplazan
  lo mismo, `reminder_done` vuelve a `false` y `status` a `Sin empezar`. Si ya
  no quedan fechas antes de `repeat_until`, se queda como `Completado`.

## Repetición

Hábitos, tareas y rutinas de Calendario comparten una regla escrita como una
cadena corta (`frontend/src/core/recurrence.ts`, `RECURRENCE_KINDS`):

| Regla | Cae en |
|---|---|
| `daily` | Todos los días. |
| `weekly:0,2,4` | Esos días de la semana (0 = lunes). Con los siete equivale a `daily`. |
| `every:3` | Cada 3 días contando desde el ancla (`start_date`, `due`, `active_from`). Nunca antes del ancla; sin ancla se comporta como `daily`. |
| `monthly:1,15` | Esos días del mes. `31` (o `29`, `30`) cae en el último día de los meses más cortos. |

Vacío, `none` o una regla ilegible significan "no se repite". Los números
fuera de rango se descartan. `recurrence.test.ts` y `habitManager.test.ts`
(reglas de recurrencia, reglas de hábitos, `occurs` y `roll_forward` de tareas)
fijan los días exactos que debe devolver cada implementación.

## Proyectos (versión 4, tipo Jira)

```
.notevault/proyectos/<project-id>/<project-id>.md       el proyecto
.notevault/proyectos/<project-id>/issues/<issue-id>.md  un issue por archivo
```

### Proyecto — `PROJECT_FIELDS`

Frontmatter tipado, en este orden:

| Clave | Tipo | Significado |
|---|---|---|
| `id` | id | `pYYYYMMDD-xxxxxx` |
| `key` | id | Prefijo de las claves visibles (`PW` → `PW-12`). Se deriva del nombre: iniciales de hasta 4 palabras, o las 3 primeras letras si es una sola; sin tildes; si se repite, `PW2`. |
| `name` | str | |
| `status` | str | `Planeado` · `En curso` · `Pausado` · `Terminado` |
| `area` | id | [Área](#áreas) |
| `colour`, `icon` | str | |
| `created`, `start`, `deadline` | date | |
| `columns` | list | Flujo del Kanban; por defecto `Por hacer,En curso,En revisión,Hecho`. |
| `done_column` | str | La columna que cuenta como hecho. |
| `in_calendar` | bool | Sus issues con fecha aparecen en el calendario general. |

El cuerpo es la descripción. El progreso se calcula; nunca se guarda.

### Issue — `ISSUE_FIELDS`

| Clave | Tipo | Significado |
|---|---|---|
| `id` | id | `xYYYYMMDD-xxxxxx` |
| `number` | int | Máximo existente + 1. Si dos dispositivos repiten número, el más reciente (por `created`, luego `id`) se renumbera. |
| `type` | str | `Submeta` · `Tarea` · `Subtarea` · `Error` · `Mejora` |
| `parent` | id | Padre; vacío = raíz. Un padre inexistente o un ciclo se muestran en la raíz. |
| `title` | str | |
| `status` | str | Una de las columnas; un valor desconocido se muestra en la primera. |
| `priority` | int | 1 Baja · 2 Media · 3 Alta · 4 Urgente |
| `order` | num | Posición dentro de su columna; al soltar se usa el punto medio entre vecinos. |
| `estimate_min` | int | Estimación en minutos. |
| `labels` | list | Etiquetas. |
| `created`, `start`, `due` | date | |
| `due_time` | str | `HH:MM` |
| `repeat`, `repeat_until` | str, date | [Repetición](#repetición). Al llegar a la columna de hecho, `due`, `start` y `reminder` pasan a la siguiente fecha y el issue vuelve a la primera columna. |
| `in_calendar` | bool | |
| `reminder`, `reminder_done` | datetime, bool | Mismas reglas que los recordatorios de tareas (clave `issue:<id>`). |
| `done_at` | date | Se pone al entrar en la columna de hecho y se borra al salir. |
| `attachments` | list | Rutas relativas a `.notevault/` (`proyectos/adjuntos/AAAA/MM/<issue-id>-1.png`). |

El cuerpo es la descripción (markdown, con checklist `- [ ]`).

Una `Submeta` con hijas agrupa trabajo: no cuenta como issue en el
progreso ni en las estadísticas; sus estadísticas son las de sus descendientes.

### Estadísticas (se calculan, no se guardan)

- **Resumen**: total, hechos, abiertos, vencidos (`due` < hoy y no hecho),
  estimado total y hecho, hechos esta semana (desde el lunes).
- **Burndown**: por cada día desde `start` (o el primer `created`) hasta la
  entrega o hoy, issues con `created` ≤ día y sin `done_at` ≤ día.
- **Rendimiento**: issues con `done_at` en cada una de las últimas semanas.

### Migración desde la versión 3

En la versión 3 un proyecto era un solo archivo `proyectos/<id>.md` con una
checklist bajo `## Tareas`. Al abrir la vault (`migrate_projects()`):

1. Si ya existe la carpeta `proyectos/<id>/`, no se toca nada.
2. Se crea el proyecto conservando id, nombre, estado, `color` → `colour`,
   fechas y cualquier clave desconocida (por ejemplo `start_time`), con la
   descripción sin la sección `## Tareas`.
3. Cada línea `- [x] paso | fecha` se convierte en un issue `Tarea` con id
   `x<fecha del id del proyecto>-<n en hexadecimal de 6 cifras>`, `number` y
   `order` = n, `status` `Hecho` o `Por hacer`, `due` = la fecha, y `done_at`
   = la fecha si ya pasó, o el día de la migración.
4. Solo cuando todo está escrito, el archivo antiguo se mueve a
   `.notevault/.papelera/proyectos-v3/`.

## Frontmatter tipado (versión 4)

Metas y Proyectos guardan sus entidades como markdown con un frontmatter de
**claves tipadas** (`frontend/src/core/store.ts`). Cada entidad
declara su lista de `(clave, tipo)` en `vault_format` y se escribe así:

1. `---`, una línea `clave: valor` por clave **en el orden de la lista**, y
   después las claves desconocidas en el orden en que se leyeron.
2. `---`; si hay cuerpo, una línea vacía y el cuerpo sin espacios sobrantes.
3. El archivo termina en `\n`.

Una clave **sin valor no se escribe** (None, texto vacío, lista vacía o
`false` en un indicador). Codificación por tipo:

| Tipo | Escrito | Ejemplo |
|---|---|---|
| `id` | tal cual | `goal: g20260914-a1b2c3` |
| `str` | entre comillas dobles, con `\` → `\\` y `"` → `\"` | `name: "Dice \"hola\""` |
| `int` | dígitos | `priority: 3` |
| `num` | entero si no tiene decimales, si no el decimal más corto | `target: 2.5` · `value: 3` |
| `bool` | `true` (nunca `false`) | `in_calendar: true` |
| `date` | `YYYY-MM-DD` | `due: 2026-10-01` |
| `datetime` | `YYYY-MM-DDTHH:MM` | `reminder: 2026-09-19T18:00` |
| `list` | elementos separados por coma, entre comillas | `habit_links: "coding,math"` |

Las claves desconocidas se reescriben siempre entre comillas.
`store.test.ts` fija la salida exacta.

Los JSON de la versión 4 (áreas, registro de metas, finanzas) se escriben con
sangría de 2 espacios, sin escapar caracteres no ASCII y con `\n` final.

## Papelera

Borrar una meta, una submeta, un issue o un adjunto de módulo **mueve** el
archivo (o la carpeta) a `.notevault/.papelera/<módulo>/`. Si ya existe un
archivo con ese nombre se usa `nombre 1.ext`, `nombre 2.ext`… Nada se elimina
de verdad desde la app.

## Áreas

### `.notevault/areas/<area-id>.json`

```json
{
  "id": "programacion",
  "name": "Programación",
  "icon": "💻",
  "colour": "#3f51b5",
  "order": 1,
  "archived": false
}
```

- Las claves se escriben en ese orden. El id es el nombre sin tildes, en
  minúsculas y con guiones (`programacion`); si ya existe, `programacion-2`.
- Metas, proyectos y hábitos guardan el id en su clave `area`.
- Archivar un área (`archived: true`) no toca lo que apunta a ella: se
  muestra como "Sin área" mientras esté archivada.

## Metas

### `.notevault/metas/<goal-id>/goal.md`

El id tiene la forma `gYYYYMMDD-xxxxxx`. Claves (`GOAL_FIELDS`, en orden):

| Clave | Tipo | Significado |
|---|---|---|
| `id` | id | |
| `name` | str | |
| `area` | id | Área; vacía = "Sin área". |
| `status` | str | `Activa` · `En pausa` · `Completada` · `Archivada` |
| `priority` | int | 1 Baja · 2 Media · 3 Alta · 4 Urgente |
| `start`, `end` | date | Al pasar `end` la meta se marca **Vencida**; nunca se borra ni archiva sola. |
| `icon`, `colour` | str | |
| `in_overview` | bool | Aparece en la Vista General. |
| `order` | num | Orden manual en el tablero. |
| `created` | date | |

El cuerpo es la descripción.

### `.notevault/metas/<goal-id>/items/<item-id>.md`

Una submeta por archivo, id `iYYYYMMDD-xxxxxx`. El árbol se forma con
`parent` (vacío = primer nivel); una submeta cuyo padre no existe, o que
formaría un ciclo, se muestra en el primer nivel. Claves (`GOAL_ITEM_FIELDS`):

| Clave | Tipo | Significado |
|---|---|---|
| `id`, `goal`, `parent` | id | |
| `name` | str | |
| `status` | str | `Pendiente` · `En curso` · `Hecha` (solo submetas únicas) |
| `priority` | int | 1–4 |
| `order` | num | Orden entre hermanas; al mover se usa el punto medio entre vecinas. |
| `start` | date | Ancla de la repetición. |
| `due`, `due_time` | date, str | Fecha y hora de una submeta única. |
| `duration_min` | int | Bloque en Calendario. |
| `repeat`, `repeat_until` | str, date | [Repetición](#repetición); vacía = única. |
| `in_calendar` | bool | Aparece en Calendario (con `due_time`, como bloque con hora). |
| `reminder_min` | int | Aviso antes de `due_time`. |
| `target`, `unit` | num, str | Meta medible: hecha cuando el valor llega a `target`. |
| `value` | num | Valor acumulado de una submeta única medible. |
| `habit_links` | list | Hábitos que se marcan al completarla. |
| `done_at` | date | Día en que una submeta única pasó a Hecha. |
| `created` | date | |

El cuerpo son las notas. Una submeta con hijas es una **rama**: no se marca a
mano, está hecha cuando todas sus hijas lo están.

### `.notevault/metas/registro/YYYY/MM/YYYY-MM-DD.json`

Checks de las submetas **repetitivas** ese día, y la procedencia de las marcas
de hábito que puso Metas:

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

- Claves ordenadas alfabéticamente; listas de `habit_marks` ordenadas; un día
  sin nada se borra en lugar de dejar un archivo vacío.
- Una repetitiva medible está hecha ese día si `value >= target`.

### Conexión con hábitos

Al marcar una submeta con `habit_links`, para cada hábito activo ese día:

- si el hábito **no** estaba marcado, se marca y la submeta queda como fuente
  en `habit_marks`;
- si ya estaba marcado **por Metas** (tiene fuentes), se añade la submeta;
- si ya estaba marcado **a mano** (sin fuentes), no se toca.

Al desmarcar se quita la submeta de las fuentes y, si no queda ninguna, se
desmarca el hábito. Una marca manual nunca se quita.

### Progreso

- Hoja única: 1 si está hecha; si es medible, `value / target` (máx. 1).
- Hoja repetitiva: días cumplidos / días programados desde `start` (o el
  inicio de la meta, o `created`) hasta hoy, sin pasar de `repeat_until` ni
  del fin de la meta.
- Rama: media de sus hijas. Meta: media de sus submetas de primer nivel.

## Finanzas

```
.notevault/finanzas/
├── categorias/<cat-id>.json          una categoría por archivo
├── metas/<fgoal-id>.json             una meta financiera por archivo
├── AAAA/MM/AAAA-MM-DD.json           movimientos del día
└── adjuntos/AAAA/MM/<mov-id>-<n>.png facturas y referencias
```

**Los importes son siempre enteros en centavos** (`amount_cents`,
`target_cents`…), en disco y en memoria; solo se formatean al mostrarlos. En
COP se muestra `$ 12.500` (punto de miles, sin decimales, redondeo a la
unidad); otras monedas con dos decimales (`$ 12,50`).

### `categorias/<cat-id>.json`

```json
{"id": "comida", "name": "Comida", "icon": "🍽", "colour": "#f4511e",
 "kind": "gasto", "budget_month_cents": 60000000, "order": 1, "archived": false}
```

Claves en ese orden (`CATEGORY_KEYS`). `kind` ∈ `gasto` · `ingreso`. El id es el
nombre sin tildes con guiones. Si la carpeta está vacía se crean: Comida,
Transporte, Vivienda, Servicios, Salud, Educación, Ocio, Compras, Otros
(gasto) y Salario, Extra, Regalo (ingreso).

### `metas/<fgoal-id>.json`

Id `fYYYYMMDD-xxxxxx`. Claves en el orden de `FINANCE_GOAL_KEYS`:

```json
{
  "id": "f20260914-a1b2c3", "name": "Moto", "icon": "🏍", "colour": "#33b679",
  "target_cents": 1200000000, "currency": "COP",
  "start": "2026-09-14", "deadline": "2027-06-30",
  "show_in_daily": true,
  "cadence": {"mode": "rule", "rule": "weekly:4"},
  "suggested_cents": 5000000, "status": "Activa",
  "created": "2026-09-14", "notes": ""
}
```

- `cadence`: `{"mode": "rule", "rule": <regla de Repetición>}` — la casilla
  «Ahorro Moto» aparece en Diario los días en que cae la regla (ancla `start`);
  o `{"mode": "period", "period": "week" | "month"}` — aparece todos los días
  del periodo y queda marcada en cuanto hay un ahorro de la meta en él.
- Solo aparece en Diario si `show_in_daily` es `true` y `status` es `Activa`.
- `status` ∈ `Activa` · `En pausa` · `Cumplida`. Pasa sola a `Cumplida` cuando lo
  ahorrado llega a `target_cents`, y vuelve a `Activa` si un retiro lo baja. Una
  meta en pausa no cambia sola. Nunca se borra del historial.

### `AAAA/MM/AAAA-MM-DD.json`

```json
{
  "movements": [
    {"id": "mv20260914-0f1e2d", "type": "gasto", "amount_cents": 1250000,
     "currency": "COP", "category": "comida", "what": "Almuerzo",
     "reason": "Día de oficina", "time": "13:10",
     "attachments": ["finanzas/adjuntos/2026/09/mv20260914-0f1e2d-1.png"],
     "created": "2026-09-14T13:12"}
  ]
}
```

- Claves en el orden de `MOVEMENT_KEYS`: `id`, `type`, `amount_cents`,
  `currency` siempre; `category`, `goal`, `what`, `reason`, `time` solo si
  tienen valor; `attachments` siempre (lista, puede ir vacía); `created` si
  existe; las claves desconocidas al final.
- `type` ∈ `gasto` · `ingreso` · `ahorro` (a una meta, o ahorro general si no
  hay `goal`) · `retiro` (sale de un ahorro).
- Balance = ingresos − gastos − ahorros + retiros.
- Un día sin movimientos no deja archivo. Mover un movimiento de día escribe
  primero el día nuevo y después el viejo.
- Borrar un movimiento manda sus adjuntos a `.papelera/finanzas-adjuntos/`.

`financeManager.test.ts` fija totales, cadencias y bytes.

## Marcadores

### `.notevault-bookmarks.json`

Lista de rutas relativas a la raíz de la vault, con `/` como separador:

```json
["1.PERSONAL/3.Exercise/Ejercicio.md"]
```

## Web

El navegador integrado (módulo WEB, solo escritorio) guarda en `.notevault/web/`
lo que debe viajar con la vault. Las cookies, las sesiones iniciadas y la caché
**no** van aquí: viven en el perfil local `~/.notevault/web_profile` de cada equipo.

### `.notevault/web/marcadores.json`

```json
[{"id": "a1b2c3d4e5f6", "title": "Qt docs", "url": "https://doc.qt.io", "created": "2026-09-23T10:00"}]
```

`folder` es opcional. El cliente móvil conserva el archivo sin tocarlo.

### `.notevault/web/restricciones.json`

```json
{"enabled": true, "mode": "blocklist",
 "blocked_domains": ["tiktok.com"], "blocked_patterns": ["youtube.com/shorts"],
 "allowed_domains": [], "daily_limits": {"youtube.com": 30}, "confirm_to_relax": false}
```

- `mode`: `blocklist` (todo permitido salvo lo bloqueado) o `allowlist` (modo enfoque: solo `allowed_domains`).
- Un dominio cubre sus subdominios (`youtube.com` bloquea `m.youtube.com`).
- `blocked_patterns` son fragmentos de la URL, en minúsculas.
- `daily_limits`: minutos por día y dominio; se mide con `uso/`.
- `confirm_to_relax`: si es `true`, aflojar cualquier regla pide escribir «quiero desbloquear».

### `.notevault/web/historial/AAAA/MM/AAAA-MM-DD.json`

Lista de visitas del día: `{"time": "HH:MM:SS", "url": ..., "title": ...}`, máximo 2000.

### `.notevault/web/uso/AAAA/MM/AAAA-MM-DD.json`

Segundos de uso por host ese día, con claves ordenadas: `{"youtube.com": 1260}`.

## Estudio

El sistema de práctica (solo escritorio por ahora) guarda en `.notevault/estudio/`
todo lo que aprende del estudiante. Los ejercicios son notas normales de la vault
(`type: exercise` en el frontmatter); la app **nunca** escribe dentro de la nota:
intentos, errores y repaso espaciado se guardan aquí, indexados por el `id` de la
nota. El cliente móvil conserva estos archivos sin tocarlos.

| Clave de `LAYOUT` | Ruta |
|---|---|
| `study_srs_item` | `.notevault/estudio/srs/<srs-id>.json` — repaso espaciado (SM-2) |
| `study_error` | `.notevault/estudio/errores/<err-id>.json` — un error clasificado |
| `study_error_digest` | `.notevault/estudio/errores/ERROR_LOG.md` — resumen en inglés |
| `study_attempt` | `.notevault/estudio/intentos/<att-id>.json` — intentos de un ejercicio |
| `study_handoff_request` | `.notevault/estudio/handoff/requests/<req-id>.json` |
| `study_handoff_response` | `.notevault/estudio/handoff/responses/<req-id>.json` |
| `study_ledger` | `.notevault/estudio/ledger/<disciplina>.json` — estado por skill (fase 6) |
| `study_exam` | `.notevault/estudio/exams/<slug>.json` — registros de exámenes rendidos (fase 5) |
| `kb_canvas_manifest` | `.notevault/estudio/kb_canvas_manifest.json` — hashes de canvas generados |

### `.notevault/estudio/intentos/<att-id>.json`

`<att-id>` = `att_` + los primeros 12 hex de `sha256(id de la nota)`.

```json
{"note_id": "mat.logica.induccion.e01",
 "note_path": "Matemáticas/…/1.10-E01 Suma de los primeros impares.md",
 "draft": "",
 "attempts": [{"at": "2026-09-24T18:03:11", "mode": "prove", "discipline": "math_general",
   "skill": "", "subject": "mathematics", "answer": "…", "hints_used": 1, "seconds": 842,
   "solution_seen": false, "transport": "http", "score": 80, "quality": 4,
   "verdict": "partial", "rubric": [true, true, true, false, true],
   "errors": [{"category": "logical", "anchor": "", "description": "…",
               "evidence": "…", "fix": "…"}],
   "feedback": "…", "next_step": "…", "example": "…"}]}
```

- `draft` es el borrador que el estudiante está escribiendo; se vacía al entregar.
- `transport`: `http`, `bridge`, `handoff` o `local` (los sprints de cálculo).
- `verdict`: `correct`, `partial`, `incorrect` o `ungraded`.

### `.notevault/estudio/errores/<err-id>.json`

Además de los campos de siempre (`category`, `subject`, `topic`, `wrong_answer`,
`expected`, `explanation`, `resolved`, `repeat_count`…), un error registrado por
la práctica lleva `discipline`, `skill`, `mode`, `anchor`, `description_en`,
`fix_en`, `note_id` y `last_seen`. Un error sin resolver con la misma asignatura,
tema, disciplina, skill y anchor (o categoría si no hay anchor) no crea otro
archivo: se reescribe con `repeat_count + 1` y `last_seen` actualizado.

`ERROR_LOG.md` se regenera tras cada intento corregido. Está en inglés porque lo
lee cualquier IA antes de generar o corregir ejercicios; no se edita a mano.

### `.notevault/estudio/handoff/`

Intercambio por archivos con un agente de IA que tenga acceso a la vault.

- Petición: `requests/<req-id>.json` = `{"id", "kind": "grade"|"generate",
  "created", "note_id", "note_path", "messages", "response_file"}` y, al lado,
  `requests/<req-id>.md` con el prompt listo para leer.
- Respuesta: el agente escribe `responses/<req-id>.json` (también se acepta
  `responses/<req-id>.md` con un bloque JSON).
- `<req-id>` = `req_` + `AAAAMMDDhhmmss` + `_` + 6 hex.
- Cuando la app procesa la respuesta mueve la petición a `requests/done/`.

### `.notevault/estudio/exams/<slug>.json`

Registros de examen aprobados o rendidos por tema o grupo de temas (`exam_group`).
`<slug>` es el identificador sanitizado del tema (`mat-1-1-numeros-naturales`) o
del grupo de temas (`exam_group`).

```json
{
  "slug": "mat-1-1-numeros-naturales",
  "topic_id": "mat.1.1.numeros_naturales",
  "exam_group": null,
  "title": "Examen: Números Naturales",
  "at": "2026-09-26T14:00:00",
  "score": 85,
  "passed": true,
  "skills": {
    "computation": "correct",
    "drill": "correct",
    "exercise": "partial"
  },
  "results": [
    {
      "note_id": "mat.1.1.e01",
      "skill": "computation",
      "difficulty": "medium",
      "score": 100,
      "verdict": "correct",
      "feedback": "Cálculo aritmético impecable."
    }
  ]
}
```

- `slug`: identificador único del examen (usado como nombre de archivo `<slug>.json`).
- `passed`: `true` si el puntaje ponderado alcanza o supera el 75%.
- `skills`: diccionario `{ [skillId]: verdict }`. Si el examen aprueba, estas skills
  se computan como consolidadas/aprobadas para el cálculo de completitud del tema.
- `results`: desglose de cada ejercicio evaluado (con puntaje, feedback y veredicto).

### Manifiesto de tema (`_tema.md`)

En cada carpeta que represente un tema de estudio (`topic`), puede existir un
archivo de manifiesto `_tema.md` con frontmatter YAML `type: topic`:

```markdown
---
type: topic
id: mat.aritmetica.1.1.naturales
title: 1.1 Números Naturales
area: 1 Aritmética
subject: mathematics
target_difficulty: hard
exam_group: null
skills:
  - computation
  - drill
  - exercise
  - proof
tags:
  - math
  - arithmetic
---

# 1.1 Números Naturales

Resumen de conceptos y competencias del tema.
```

- `id`: identificador global único del tema (`subject.area.topic_name`).
- `title`: nombre legible del tema.
- `area`: nombre del área padre (ej. `1 Aritmética`, `2 Álgebra`).
- `subject`: `mathematics` | `programming` | `english`.
- `target_difficulty`: dificultad requerida para completar (`easy` | `medium` | `hard`).
- `exam_group`: string opcional; si varios temas contiguos comparten `exam_group`,
  se evalúan en un único examen unificado.
- `skills`: lista de competencias requeridas para este tema.
- Si una carpeta carece de `_tema.md`, NoteVault infiere dinámicamente el tema a
  partir de las etiquetas (`tags`) y la ubicación de las notas hijas.

## Contrato móvil (Mobile Contract)

La aplicación móvil Android (`notevault_mobile` escrita en Dart/Flutter) y la app
de escritorio (`NoteVault`) comparten exactamente la misma bóveda (`vault`) y
deben operar de forma simétrica:

1. **Lectura de temas y manifiestos**:
   - `notevault_mobile` debe escanear los archivos `_tema.md` (`type: topic`)
     para poblar la lista de temas y el desglose de competencias (`skills`).
   - La inferencia basada en etiquetas (`#tema/...` o frontmatter `tags`)
     debe seguir el mismo estándar de normalización (`src/core/practice/topic.ts`).
2. **Lectura y escritura de exámenes**:
   - `notevault_mobile` lee `.notevault/estudio/exams/<slug>.json` para conocer
     si el examen fue aprobado y reflejar la completitud del tema sin divergencias.
   - Si la app móvil evalúa o sincroniza un examen, debe escribir el mismo JSON
     con los campos `slug`, `topic_id`, `at`, `score`, `passed`, `skills`, `results`.
3. **Cálculo de completitud uniforme**:
   - Completitud (%) = promedio ponderado de avance por cada skill requerida.
   - Una skill está al 100% si:
     - El examen del tema está aprobado (`passed: true`), O
     - En el ledger (`.notevault/estudio/ledger/<disciplina>.json`) la skill ha
       alcanzado o superado la `target_difficulty` del tema.
4. **Almacenamiento de práctica en `.notevault/estudio/`**:
   - Todos los intentos se registran en `.notevault/estudio/intentos/<att-id>.json`.
   - Todos los errores se registran en `.notevault/estudio/errores/<err-id>.json`.
   - Ni la app de escritorio ni la app móvil modifican jamás el cuerpo de las notas
     de ejercicios (`type: exercise`).

## Web (Navegador y Enfoque)

Los datos portables del módulo Web residen dentro de `.notevault/web/`:

```
.notevault/web/
├── marcadores.json                      marcadores guardados por el usuario
├── restricciones.json                   reglas de enfoque y consumo
├── historial/AAAA/MM/AAAA-MM-DD.json    páginas visitadas por día
└── uso/AAAA/MM/AAAA-MM-DD.json          segundos dedicados por host/dominio por día
```

### `marcadores.json`
Lista de marcadores con campos `id`, `title`, `url` y fecha `created`.

### `restricciones.json`
Configuración de reglas con campos:
- `enabled`: booleano.
- `mode`: `"blocklist"` o `"allowlist"`.
- `blocked_domains` / `blocked_patterns` / `allowed_domains`: listas de cadenas.
- `daily_limits`: diccionario de dominio a minutos máximos por día.
- `confirm_to_relax`: booleano que exige frase de confirmación para flexibilizar reglas.

### `historial/` y `uso/`
Archivos diarios particionados por año y mes (`AAAA/MM/AAAA-MM-DD.json`).

> **Nota de paridad móvil**: Las sesiones de login, cookies locales y caché de navegación en la app de escritorio se almacenan en la partición aislada de Electron `persist:nvweb` (en el directorio de datos de usuario de la máquina local, fuera de la vault). Solo los datos de valor permanente (marcadores, reglas, historial y tiempo) viajan dentro de `.notevault/web/` para sincronizarse entre plataformas.

## Adjuntos

Una imagen o un video que se pega o arrastra dentro de una nota se **copia** a
una carpeta `attachments` junto a esa nota, y se enlaza con una ruta relativa a
la nota:

```
1.PERSONAL/Estudio/
├── Sesion Frontend.md          ![](attachments/diagrama.png)
└── attachments/
    ├── diagrama.png
    └── demo.mp4
```

- Nunca se sobrescribe un adjunto existente: un nombre repetido pasa a
  `diagrama 1.png`.
- La sintaxis de Obsidian `![[archivo.png]]` también se lee: se busca junto a
  la nota, luego en su `attachments/`, luego en la raíz de la vault y por último
  por nombre en toda la vault. Al guardar se conserva tal cual.
- `attachments` no se muestra en el explorador de notas.
- Imágenes: png, jpg, jpeg, gif, webp, bmp, svg. Videos: mp4, mov, webm, mkv,
  m4v, avi. Cualquier otro archivo se enlaza como `[nombre](attachments/nombre)`.

## Notas

Cualquier `.md` fuera de las carpetas reservadas. Se respeta el frontmatter
si existe, pero no es obligatorio. Los enlaces entre notas usan la sintaxis
de Obsidian `[[Título de la nota]]`.

## Reglas que un cliente debe respetar

- **Nunca recorrer la vault entera de forma ansiosa.** El árbol se lee nivel a
  nivel; los recorridos completos van acotados (`MAX_SCAN_NOTES = 4000`) y
  saltan `node_modules`, `__pycache__`, `venv`, `dist`, `build`, `target` y
  cualquier carpeta que empiece por punto.
- **Ningún acceso a disco puede lanzar excepción hacia la interfaz.** Una ruta
  demasiado larga o un archivo bloqueado se trata como vacío.
- **Preservar lo que no se entiende.** Si un cliente lee un campo de
  frontmatter que no conoce, debe volver a escribirlo tal cual al guardar.
- **Detectar los conflictos de sincronización.** Los archivos
  `*.sync-conflict-*` de Syncthing deben mostrarse al usuario, no ignorarse.

## Interfaces V3 — Mobile Parity & State Storage

- **Pinned Tabs**:
  - El escritorio recuerda las pestañas fijadas **por vault**, en el almacenamiento
    local del cliente, con la clave `nv.pinnedTabs:<ruta del vault>` (array JSON de
    identificadores: `module:<id>`, `note:<ruta>`, `canvas:<ruta>`, `web`). Es estado
    de interfaz: no vive en el vault, y el mismo identificador apunta a otro archivo
    en otro vault.
  - Para paridad móvil (Dart/Flutter) no hay nada que respetar dentro del vault: cada
    cliente persiste sus propias pestañas fijadas con ese mismo esquema de
    identificadores. Las pestañas fijadas no pueden cerrarse accidentalmente mediante
    click, clic central ni atajos de cierre.
- **Descubrimiento Jerárquico de Temas (`_tema.md` y `<carpeta>.practica.md`)**:
  - Tanto la app de escritorio como la app móvil deben descubrir el tema activo ascendiendo por el árbol de carpetas (`findAncestorTopicManifest`) desde cualquier nota o subcarpeta (`Ejercicios/`, `Apuntes/`, etc.) hasta encontrar el primer manifiesto ascendente: un `_tema.md` o `tema.md` (formato heredado, todavía aceptado) o cualquier nota cuyo frontmatter declare `type: topic` **o `type: practica`** — que es donde vive el manifiesto desde la migración. Esto garantiza que notas en subárboles hereden siempre el contexto del tema y el catálogo completo de competencias matemáticas (solve, process, prove, counterexample, true_false, find_error, drill, explain).
- **Archivos de vista de estudio (`<carpeta>.<tipo>.md`)**:
  - Una carpeta de estudio expone su contenido con dos ficheros de vista visibles en lugar de un `_tema.md` oculto entre las notas. Son notas normales de markdown (frontmatter + cuerpo) y su nombre sigue la convención `<nombre de la carpeta>.<tipo>.md`:
    - `<carpeta>.practica.md` (`type: practica`): la vista de práctica del tema. **Contiene el manifiesto del tema en el frontmatter** (`subject`, `title`, `skills`, `min_per_skill`, `target_difficulty`, `exam`, `exam_group`); es el fichero que el descubrimiento jerárquico encuentra.
    - **La nota de teoría del tema se marca en su sitio** con `type: teorica`: es la nota que ya existía (a la que los mapas apuntan como nodo de archivo), y **no se renombra ni se duplica**. Solo una carpeta de tema que aún no tenga nota de teoría recibe un `<carpeta>.teorica.md` nuevo (`type: teorica`), que apunta a su canvas con `mapa: <ruta relativa al vault>` cuando el tema tiene mapa.
    - `<carpeta>.resumen.md` (`type: resumen`): el panorama agregado de un área (o de la materia entera, con `scope: <carpeta del vault>`): totales, progreso por competencia y dificultad, errores frecuentes y una entrada para practicar el área completa.
  - El escritorio reconoce esos ficheros por su frontmatter `type` y los abre con su interfaz integrada en lugar del editor de markdown. **Paridad móvil**: para un cliente que no implemente las vistas no hay nada especial que respetar; son notas de markdown válidas y su cuerpo explica qué son. El escritorio crea el fichero de vista que falte al hacer click en una carpeta (`study_view_ensure`), y nunca lo sobrescribe si ya existe.
- **Persistencia de Navegación Web**:
  - Las particiones de sesión web se mantienen aisladas bajo `persist:nvweb`, con historial y métricas de uso sincronizadas en `.notevault/web/`.


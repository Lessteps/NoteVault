# Formato de la vault de NoteVault

> **Versión del formato: 4**
>
> Este documento es el contrato entre la app de escritorio (Python/PySide6) y
> la app de Android (Dart/Flutter). Las dos leen y escriben los mismos
> archivos; no hay servidor, base de datos ni protocolo entre ellas.
>
> Si cambias el formato, actualiza este documento **y** los ficheros de
> conformidad de `tests/conformance/`, y sube `FORMAT_VERSION` en
> `notevault_app/core/vault_format.py`. La prueba `tests/test_vault_format.py`
> falla si el código y este contrato dejan de coincidir.

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
vez que abren la vault (`migrate_vault()` en Python, `migrateVault()` en Dart).

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
  `reminder_scheduler.py`.
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
cadena corta (`core/recurrence.py`, `RECURRENCE_KINDS`):

| Regla | Cae en |
|---|---|
| `daily` | Todos los días. |
| `weekly:0,2,4` | Esos días de la semana (0 = lunes). Con los siete equivale a `daily`. |
| `every:3` | Cada 3 días contando desde el ancla (`start_date`, `due`, `active_from`). Nunca antes del ancla; sin ancla se comporta como `daily`. |
| `monthly:1,15` | Esos días del mes. `31` (o `29`, `30`) cae en el último día de los meses más cortos. |

Vacío, `none` o una regla ilegible significan "no se repite". Los números
fuera de rango se descartan. `tests/conformance/EXPECTED.json`
(`recurrence_rules`, `habit_rules`, `task.occurs`, `task.roll_forward`) fija
los días exactos que debe devolver cada implementación.

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
**claves tipadas** (`core/store.py`, `lib/core/store.dart`). Cada entidad
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
`EXPECTED.json` (`store_encoding`) fija la salida exacta.

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

`EXPECTED.json` (`finance`) fija totales, cadencias y bytes.

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

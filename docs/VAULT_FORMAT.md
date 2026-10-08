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
│   ├── mentor/                            opcional: registro de sesiones del Mentor
│   │   └── sessions/YYYY-MM-DD.json       un plan de estudio por día
│   │   ├── chat.json                      (antiguo) una sola conversación; se migra a chats/
│   │   └── chats/<id>.json                una conversación del Mentor (crear metas) + index.json
│   │   └── plans/YYYY-MM.json             el plan mensual del Mentor (subplanes por área)
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
| `topic_links` | list | Opcional (se omite si está vacía). Temas de estudio que la cumplen; ver [Conexión con temas de estudio](#conexión-con-temas-de-estudio). |
| `practice_links` | list | Opcional (se omite si está vacía). Enlaces al sistema Programming practice (kata diario, proyectos); ver [Submetas de primera clase y práctica](#submetas-de-primera-clase-y-práctica). |

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

### Conexión con temas de estudio

`topic_links` es un campo **aditivo y opcional** (no cambia `FORMAT_VERSION`):
un lector que no lo conoce lo conserva como clave extra sin tocarlo. Cada
entrada de la lista (separada por comas, como `habit_links`) es:

- `<carpeta-del-tema>`: todas las skills del tema;
- `<carpeta-del-tema>#skill1+skill2`: solo esas skills.

`<carpeta-del-tema>` es la ruta POSIX de la carpeta del tema (la del `_tema.md`
/ `.practica.md`) relativa a la vault. En ella se escapan `%`, `,` y `#` como
`%25`, `%2C` y `%23`. Las skills van en minúsculas, separadas por `+`.

Una submeta con `topic_links` **no se marca a mano: se cumple sola** cuando
cada tema enlazado cumple lo pedido: cada skill pedida (o todas las del tema)
dominada (`mastered` en el progreso del tema) y, en un enlace al tema entero,
el examen aprobado si el tema lo exige (`mastery.exam: required`). Su progreso
es el porcentaje de esas unidades cumplidas. Una carpeta que ya no tiene tema
es un **enlace roto**: se conserva, cuenta como no cumplido y no da error.

> Pendiente para el cliente móvil (`notevault_mobile`): leer/conservar
> `topic_links` y, si quiere mostrar el cumplimiento, calcularlo igual que la
> app de escritorio (`frontend/src/core/practice/topicLinks.ts`).

### Submetas de primera clase y práctica

Una submeta funciona como una meta principal: se abre en su propia vista (ruta de
ancestros, estado, prioridad, fechas, % de avance, días restantes, submetas anidadas
a N niveles, temas, hábitos, práctica) y se puede **promover a meta** o **mover**.
Se resolvió con el mínimo de modelo: la submeta **hereda** de su meta el área, el
icono y el color (no se guardan en el archivo de la submeta) y el avance sube por el
árbol como siempre. Al promoverla, esos tres valores se copian a la meta nueva.

`practice_links` es un campo **aditivo y opcional** (no cambia `FORMAT_VERSION`; un
lector que no lo conoce lo conserva como clave extra). Lista separada por comas,
como `topic_links`/`habit_links`. Cada entrada:

- `kata:daily`: kata diario, objetivo por defecto 5 días con intento por semana;
- `kata:daily#week=N`: N días (1–7) con intento en la semana actual (lun–dom);
- `kata:daily#streak=N`: racha actual de N días seguidos (1–365);
- `project:weekly` / `project:monthly`: proyecto de práctica de la semana / del mes
  actual; con `#<foco>` (`backend`, `databases`, `frontend`, `desktop`, `mobile`,
  `automation`) solo proyectos de ese foco;
- `project:folder:<carpeta>`: un proyecto concreto (`projects/<carpeta>`); en la
  carpeta se escapan `%`, `,` y `#` como `%25`, `%2C` y `%23`.

Cuerpo de referencia: `frontend/src/core/practice/practiceLinks.ts`. No existe un
enlace `skill`: en `programming_practice` las «skills» (`pp_build`...) son
instrucciones de la IA, no habilidades del alumno.

**Cumplimiento derivado** (nunca se guarda; se calcula con los datos del módulo
`programming_practice`: intentos `pp_kata` en `estudio/intentos`, y
`projects/<x>/.pp.json` / `projects/_specs/<x>.spec.json`, los mismos que lee el
Mentor):

- kata: días distintos con algún intento `pp_kata` en la semana / objetivo; con
  `streak`, la racha actual (acabando hoy, o ayer si hoy aún no hay intento) / N.
- proyecto semanal o mensual: de los proyectos creados en el periodo (y con el foco
  pedido) se toma el más avanzado; avance = (fases hechas + ½ por fase en curso) / 4
  con las fases especificación, construcción, defensa y postmortem. Cumplido solo
  con el proyecto terminado (`state: done`). Sin proyecto: 0 %.
- proyecto por carpeta: igual, sin límite de fecha; si ya no existe es un enlace
  **roto** (se conserva, no cumple, no da error).
- sin módulo `programming_practice` en la vault: «sin datos de práctica», 0 %, sin
  cumplir, sin error.

**Avance combinado**: con `topic_links` y `practice_links` a la vez cada enlace pesa
lo mismo: `(pct_temas × n_enlaces_temas + pct_práctica × n_enlaces_práctica) /
n_enlaces`; con solo temas el resultado es el de siempre. La submeta está hecha
cuando todos sus enlaces lo están. Una **rama** con enlaces propios los cuenta como
un miembro más de la media de sus hijas.

**Promover / convertir / mover** (los ids de submeta se conservan salvo choque):

- *Promover a meta*: crea una meta con los datos de la submeta (nombre, prioridad,
  `start`, `due` → `end`, notas → descripción, carpeta/notas vinculadas) y área,
  icono y color de la meta origen; sus hijas pasan a ser el primer nivel con el
  mismo árbol. Si la submeta tenía datos que una meta no tiene (enlaces a temas,
  hábitos o práctica, repetición o medida), se conserva como única submeta raíz de
  la meta nueva para no perderlos.
- *Convertir en submeta de…*: la meta pasa a ser una submeta (bajo otra submeta o
  en el primer nivel) de otra meta, con todo su árbol dentro; la meta se envía a la
  papelera (área, icono y color se pierden: la submeta hereda los de la meta destino).
- *Mover a otra meta*: mueve la submeta y su subárbol.
- Las marcas de `registro/…` (`<meta>/<submeta>`) y las procedencias de hábito de
  lo movido se renombran para no perder rachas.

> Pendiente para el cliente móvil (`notevault_mobile`): conservar `practice_links`
> (clave extra) y, si quiere mostrarlo, leer `estudio/intentos` y los `.pp.json`
> con las reglas de arriba; al mover submetas entre metas renombrar también las
> claves del registro. No necesita cambios para seguir funcionando.

### Progreso

- Hoja con `topic_links` y/o `practice_links`: el avance de sus enlaces (0–1), sin importar `repeat`
  (ver la regla de peso en [Submetas de primera clase y práctica](#submetas-de-primera-clase-y-práctica)).
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
| `study_pp_profile` | `.notevault/estudio/pp/profile.json` — perfil de debilidades y estilo de `programming_practice` (lo escribe `pp_postmortem`, lo lee `pp_build`) |
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

## Mentor (opcional, aditivo)

El módulo Mentor propone un plan diario a partir de un informe del estudiante y
guarda aquí lo que se planeó y lo que se cumplió. Es **opcional y aditivo**: una
vault sin `.notevault/mentor/` es válida, un cliente que no lo conoce puede
ignorarlo, y no sube `FORMAT_VERSION`.

| Clave de `LAYOUT` | Ruta |
|---|---|
| `mentor_session` | `.notevault/mentor/sessions/AAAA-MM-DD.json` — el plan de un día |
| `mentor_chat` | `.notevault/mentor/chat.json` — (antiguo) la única conversación con el Mentor; solo se lee para migrarla |
| `mentor_chat_file` | `.notevault/mentor/chats/<id>.json` — una conversación con el Mentor |
| `mentor_chats_index` | `.notevault/mentor/chats/index.json` — la conversación activa y la marca de migración |
| `mentor_plan_build` | `.notevault/mentor/plans/_building/<id>.json` — plan EN CONSTRUCCIÓN (constructor guiado, ver «Plan del Mentor»); `mentor_plan_builds_dir` es la carpeta |
| `mentor_plan_history` | `.notevault/mentor/plans/_history/<plan>/<n>.json` — un cambio pedido al plan con comentarios; `mentor_plan_history_dir` es la carpeta |
| `mentor_plan` | `.notevault/mentor/plans/<id>.json` — un plan del Mentor sobre un periodo libre (ver «Plan del Mentor»); `<id>` es `<inicio>_<fin>` o, en los planes mensuales heredados, `AAAA-MM`; `mentor_plans_dir` es la carpeta |

```json
{"date": "2026-10-05", "availableMinutes": 90, "objective": "Cerrar la meta de álgebra",
 "createdAt": "2026-10-05T08:00:00", "acceptedAt": "2026-10-05T08:02:10",
 "blocks": [{"candidateId": "srs:mathematics", "kind": "srs_review", "subject": "mathematics",
             "topicFolder": "Matemáticas/2 Álgebra", "minutes": 20, "status": "done",
             "note": "opcional"}]}
```

- `status` de un bloque: `planned` | `done` | `skipped` | `partial`.
- `reason` (opcional): la razón de una línea con la que el Mentor propuso el bloque.
- `acceptedAt` solo existe cuando el estudiante aceptó el plan; es la fuente de verdad del
  plan de hoy (no se copia a la cola de estudio ni a la agenda).
- El informe que ve la IA se calcula al vuelo y no se guarda.

### Conversaciones del Mentor (`chats/<id>.json`)

El Mentor tiene su **propio historial de conversaciones**, aparte del historial del asistente (que
vive en la carpeta de datos de la app). Cada conversación en la que el Mentor ayuda a crear una meta es
un archivo `.notevault/mentor/chats/<id>.json` (`<id>` = `[A-Za-z0-9_-]`, hasta 48 caracteres) con sus
últimos 60 turnos. Es opcional y aditivo, como el resto de `mentor/`.

```json
{"version": 1, "id": "cm1x2y3z", "title": "backend en Python en 3 meses",
 "createdAt": "2026-10-05T10:00:00", "updatedAt": "2026-10-05T10:01:10",
 "turns": [
  {"id": "t1", "role": "user", "content": "backend en Python en 3 meses", "at": "2026-10-05T10:00:00"},
  {"id": "t2", "role": "assistant", "content": "¿Cuántas horas por semana tienes?", "at": "2026-10-05T10:00:03"},
  {"id": "t3", "role": "assistant", "content": "Primero bases, luego APIs.", "at": "2026-10-05T10:01:10",
   "draft": {"name": "Backend con Python", "area": "", "description": "…", "topics": [], "schedule": {}, "discarded": []},
   "createdGoalId": "g…"}
 ]}
```

```json
{"version": 1, "active": "cm1x2y3z", "migrated": true}
```

- `title`: se pone solo con el primer mensaje del estudiante (una línea, máx. 60 caracteres) y se puede
  renombrar. `createdAt` / `updatedAt` son marcas locales sin zona (`AAAA-MM-DDTHH:MM:SS`), como las del
  historial del asistente. No hay un índice con la lista: se lee la carpeta; las conversaciones sin
  turnos no se listan.
- `index.json` (`chats/index.json`) guarda solo la conversación activa (`active`) y `migrated`. Nunca es
  una conversación: un cliente debe ignorarlo al listar `chats/`.
- **Migración**: la primera vez que se abre el historial, si existe el antiguo `.notevault/mentor/chat.json`
  (una sola conversación, `{"version": 1, "turns": [...]}`) con turnos y `chats/` no tiene conversaciones, se
  copia como la primera (con su borrador pendiente) y queda activa. El `chat.json` original **no se
  modifica ni se borra**; `migrated: true` evita importarlo otra vez.
- Borrar una conversación la mueve a `.notevault/.papelera/mentor-chats/`.
- `draft` (solo turnos `assistant`): el borrador de meta con su calendario ya calculado. Es una
  previsualización; **no existe como meta** hasta que el estudiante pulsa «Crear meta».
- `createdGoalId`: id de la meta creada a partir de ese borrador; `discarded: true`: se descartó.
- Al crear la meta, la app vuelve a calcular el calendario con los temas que existen entonces y
  escribe una `Goal` normal (`.notevault/goals/…`) con una submeta por tema o bloque de temas, cada
  una con `topic_links` (ver «Conexión con temas de estudio»). El Mentor no escribe nada más.
- La IA solo recibe el informe, un catálogo compacto de temas (carpeta, título, materia, skills,
  completitud, minutos estimados) y esta conversación; nunca el contenido de las notas.

### Plan del Mentor (`plans/<id>.json`)

Un archivo por plan. Un plan cubre un **periodo libre** `[start, end]` (1 semana, 2 meses, fechas a medida…) y
agrupa los **subplanes** (uno por área y objetivo). Varios planes pueden coexistir y solaparse. Es opcional y
aditivo: un cliente que no lo conoce puede ignorarlo, y no sube `FORMAT_VERSION`.

```json
{"id": "2026-10-06_2026-11-05", "start": "2026-10-06", "end": "2026-11-05",
 "createdAt": "2026-10-05T09:00:00.000Z", "updatedAt": "2026-10-12T18:30:00.000Z",
 "hoursPerWeek": 14.9, "auto": false, "rationale": "Primero bases y luego APIs.",
 "preconditions": {"start": "2026-10-06", "end": "2026-11-05", "minutesPerDay": 240,
                   "studyDays": [1,2,3,4,5,6], "blockedDates": ["2026-10-12"], "pace": "normal",
                   "goalIds": ["g20260914-a1b2c3"], "subjects": ["Programación"], "freeObjective": "", "notes": "tengo examen el 20; prefiero teoría por las mañanas",
                   "levels": {"Programación": "basico"}, "deliverables": "ask",
                   "practice": {"kataMinutes": 30, "sessionsPerWeek": 3, "minutesPerSession": 90, "monthly": false, "focus": "rotate"}},
 "subplans": [{
   "id": "s1-programacion", "area": "Programación", "objective": "Desarrollo Backend",
   "goalId": "g20260914-a1b2c3", "goalItemIds": ["i20260914-abc123"],
   "topics": [{"folder": "Programación/Python/1 Fundamentos", "title": "1 Fundamentos", "skills": ["debug"],
               "targetWeek": 1, "estMinutes": 90, "completedAt": "2026-10-09", "diagnostic": true}],
   "weeks": [{"week": 1, "start": "2026-10-06", "end": "2026-10-12", "topics": ["Programación/Python/1 Fundamentos"],
              "minutes": 90, "capacityMinutes": 240}],
   "requiredGoals": [{"goalId": "g20260914-a1b2c3", "itemId": "i20260914-abc123", "note": "submeta que lo pide"}],
   "deliverable": {"title": "API de inventario", "description": "…", "criteria": ["CRUD", "tests"],
                   "projectId": "p20260915-49887f", "status": "en_curso"},
   "notes": "opcional"}],
 "programmingPractice": {
   "kata": {"minutesPerDay": 30, "days": [1,2,3,4,5,6]},
   "weeklyProject": {"sessionsPerWeek": 3, "minutesPerSession": 90, "focusMode": "rotate",
     "weeks": [{"week": 1, "start": "2026-10-06", "end": "2026-10-12", "focus": "backend", "theme": "Gestor de gastos",
                "sessions": [{"date": "2026-10-06", "minutes": 90, "phases": ["build"]},
                             {"date": "2026-10-08", "minutes": 90, "phases": ["construct"]},
                             {"date": "2026-10-11", "minutes": 90, "phases": ["defend", "postmortem"]}]}]},
   "monthlyProject": {"blocks": [{"fromWeek": 1, "toWeek": 4, "theme": "Portafolio"}]}},
 "openQuestions": [{"id": "deliverables", "subplanId": "s1-programacion",
                    "text": "¿Quieres un entregable (proyecto de demostración) para Programación: Desarrollo Backend?",
                    "options": ["Sí", "No", "Después"]}]}
```

- `start`/`end` (AAAA-MM-DD, ambos incluidos) son el periodo. `id` es el nombre del archivo sin `.json`
  (`<inicio>_<fin>`); la app manda el nombre del archivo si difiere.
- **Planes mensuales heredados**: un archivo `AAAA-MM.json` con `"month": "2026-10"` y sin `start`/`end` se
  lee como un plan de periodo (día 1 – último día del mes, id = el mes). No hay migración: el archivo no se
  reescribe hasta que se modifica (p. ej. el estado del entregable) y entonces conserva `month`.
- Las semanas son trozos de 7 días desde `start` (la última puede ser más corta); `targetWeek` cuenta desde 1
  en el plan. `weeks[].capacityMinutes` es la capacidad real de esa semana para el subplan (solo los días de
  estudio no bloqueados, desde hoy si el plan ya empezó).
- `preconditions` (opcional) son los hechos con los que se armó el plan: `minutesPerDay` (tiempo diario),
  `studyDays` (ISO: 1 = lunes … 7 = domingo), `blockedDates`, `pace` (`suave` 70 % / `normal` 85 % /
  `intenso` 100 % del tiempo declarado), metas (`goalIds`) y materias (`subjects`) a cubrir, `levels` por
  materia (`empezando` | `basico` | `intermedio` | `avanzado` | `no_se`: solo una hipótesis para el reparto) y
  `deliverables` (aditivo, sin subir `FORMAT_VERSION`): **`"ask"`** (por defecto: «a discutir», no se propone ningún
  entregable en el primer borrador y queda una pregunta pendiente por subplan), `"yes"` (se propone uno por subplan) o
  `"no"`; los planes antiguos con `true`/`false` se leen como `"yes"`/`"no"` y no se reescriben, y si falta es `"ask"`.
  `practice` (opcional) son las preferencias de la pista *Programming practice*: `kataMinutes` (0 = sin kata),
  `sessionsPerWeek` (0 = sin proyecto semanal) y `minutesPerSession`, `monthly` y `focus` (`"rotate"` o un foco fijo:
  `backend` · `databases` · `frontend` · `desktop` · `mobile` · `automation`). `auto: true` marca un plan automático (sin IA). `topics[].diagnostic` marca el primer tema
  de una materia de nivel «no sé» (se empieza con un diagnóstico corto).
  `preconditions.notes` (opcional, aditivo: sin subir `FORMAT_VERSION`) son los comentarios libres del estudiante
  para la IA (hasta 1500 caracteres, saltos de línea conservados, sin caracteres de control). La IA los usa como
  preferencias al elegir y ordenar temas, nunca para cambiar periodo, tiempo ni días; un plan automático (sin IA)
  no los interpreta pero los conserva y los muestra.
- `topics[].folder` es la carpeta del tema (el mismo id que usan los `topic_links` de las submetas). El
  estado de práctica (sin tratar / practicando / consolidado / completo / examen pendiente) y el
  porcentaje **no se guardan**: se derivan en vivo del motor de práctica.
- `completedAt` (AAAA-MM-DD) es el **registro de temas completados**: se anota la primera vez que la
  app observa el tema completo y no se vuelve a modificar.
- `deliverable.status`: `idea` | `en_curso` | `hecho`; `projectId` enlaza un proyecto existente (nunca se
  crean proyectos automáticamente). Es lo único que el Mentor edita después de aceptar el plan.
- El plan diario sale de los planes **activos** (los que contienen la fecha de hoy): los temas cuya semana
  objetivo es la actual (o anterior) y siguen sin completar se ofrecen primero en «Hoy»; con planes
  solapados se combinan sin repetir un mismo tema. El `minutesPerDay` del plan activo sugiere el tiempo de «Hoy».
- **Programming practice** (`programmingPractice`, opcional y aditivo; un sistema de práctica diaria enfocado en prepararse para entrevistas técnicas y en mejorar la lógica y la resolución de procesos): la rama de práctica de programación de la app
  (carpeta `programming_practice` de la vault y su diálogo «Práctica de programación») planificada dentro del plan.
  Es una pista aparte del plan y no un subplan, porque no tiene temas, se agenda en días del calendario y su estado sale de
  otro módulo. `kata` = reto de lógica diario (`pp_kata`) en los `days` ISO (los de estudio por defecto). `weeklyProject` =
  un proyecto **siempre full stack** (frontend + backend + base de datos) por semana: `weeks[]` lleva el `focus` de la semana
  (rota por el stack, o el fijado; solo añade criterios, no quita capas), un `theme` opcional (lo puede sugerir la IA; el plan
  automático lo deja vacío y se titula «Proyecto semanal N · foco X») y las `sessions[]` con fecha, minutos y las **fases**
  del módulo de práctica que se trabajan ese día (`build` especificación · `construct` construcción · `defend` defensa ·
  `postmortem`). Con 1 a 3 sesiones por semana las fases se funden (nunca se pierde ninguna); con más de 4, las sesiones
  extra son de construcción. `monthlyProject.blocks[]` = un proyecto mayor cada 4 semanas que integra los semanales.
  Los minutos de la práctica se **reservan** día a día de lo que da cada día de estudio (`minutesPerDay` × ritmo): el ritmo
  no los recorta y el resto es para temas (de ahí salen `weeks[].capacityMinutes` y `hoursPerWeek`, que pasan a ser horas de
  temas). La IA solo puede sugerir temas y, con foco rotativo, focos del esquema; nunca minutos ni fases, y al aceptar la
  app recalcula la pista de forma determinista.
  El **estado no se guarda**: se deriva del módulo `programming_practice` (kata del día = hay un intento con la skill
  `pp_kata` ese día; fases = el `state` de `projects/<x>/.pp.json` —building / defended / done, y la nota de la defensa— del
  proyecto cuya especificación o carpeta se creó esa semana) y de lo que el estudiante marca en los bloques de «Hoy»
  (registro manual hecho/saltado: `practice:<plan>:kata` y `practice:<plan>:project:w<N>:<fases>`). Para «Hoy», los
  candidatos son `programming_practice_kata` y `programming_practice_project`.
- `openQuestions` (opcional, aditivo): decisiones que quedaron pendientes al armar el plan. Hoy solo `id: "deliverables"`
  (entregable de un subplan, opciones Sí / No / Después). En el borrador se responden con `mentor_plan_draft_answer`
  (yes añade la propuesta determinista, no la descarta, later la deja); al aceptar se conservan solo las de subplanes que siguen
  sin entregable.
- La IA propone el plan (`plan_draft` en la conversación o desde el formulario de precondiciones, con temas del
  catálogo real y metas existentes; las precondiciones son hechos fijos que no puede cambiar); sin IA la app
  genera un plan automático determinista. Solo se escribe este archivo cuando el estudiante pulsa «Aceptar plan».

#### Plan propuesto, comentarios y constructor guiado (aditivo; sin subir `FORMAT_VERSION`)

- **`proposed: true`** (opcional) en `plans/<id>.json`: el plan lo creó el Mentor (generación completa o fin del constructor guiado) y el estudiante aún no lo
  mantiene. Es un plan REAL con su sub-interfaz, pero no cuenta como activo: no alimenta «Hoy» ni «Esta semana» y no reserva tiempo.
  «Mantener plan» quita el campo; «Borrar» manda el archivo a `.notevault/.papelera/mentor-plans/`. Los planes anteriores no lo tienen.
- `preconditions.branches` (área → ramas incluidas; la rama es el 2.º segmento de la carpeta del tema, p. ej. `4 Backend`), `branchPreset`
  (`fullstack` · `backend` · `frontend` · `desktop` · `mobile` · `all`) y `branchExcluded` (solo para explicarlo). Sin `branches` para un área entran todas
  sus ramas. Las ramas excluidas no entran al catálogo que ve la IA, ni al plan automático, ni al aceptar.
- `topics[].pinned: true`: el estudiante fijó la semana del tema con un comentario; el reparto no la mueve.
- **Historial de cambios** `plans/_history/<plan>/<n>.json`: `{n, at, comment, status: "applied"|"pending"|"undone", source: "ai"|"rules"|"none", summary,
  delta: {added, removed, moved, deliverables}, changed: [carpetas], warnings, fixOptions, before: <el plan antes del cambio>}`. «Deshacer» restaura `before`.
  Un comentario que no se pudo aplicar queda como `pending` (el texto no se pierde). El parche que propone la IA (`add_topic`, `remove_topic`, `move_topic`,
  `remove_subplan`, `add_subplan`, `set_deliverable`, `set_practice`, `set_note`, `lighter`) se valida contra el plan y el catálogo real, y el reparto semanal
  se recalcula siempre de forma determinista; nada fuera del archivo del plan se toca.
- **Plan en construcción** `plans/_building/<id>.json`: `{id, createdAt, updatedAt, pre (precondiciones del formulario), effective (tras las decisiones),
  stage: alcance|esqueleto|temas|capacidad|practica|entregables|revision, steps, answers: [{questionId, stage, kind, question, choice, label, text?, skipped?, at}],
  draft (parcial, completo en la revisión), skeleton, openQuestion, source: "ai"|"rules", questionCount, maxQuestions (6), status: "building"|"review"|"abandoned",
  finishing, ai: {lo que la IA aportó y la app validó}, name}`. El estado se REPRODUCE desde `pre` + `answers`; al crear el plan se recalcula todo y el archivo se
  elimina; «Abandonar» lo manda a `.notevault/.papelera/mentor-plans/`. `plans/` solo lee los `*.json` de primer nivel, así que `_building` y `_history` no son planes.
- `openQuestions` pendientes («Después») se responden también sobre el plan ya guardado con `mentor_plan_answer` (yes añade la propuesta de entregable, no la descarta).

#### Plan por ÁREAS, agenda y entregables (aditivo; sin subir `FORMAT_VERSION`)

El plan se organiza por **áreas elementales** en vez de por rama de carpeta: **Backend**, **Frontend**, **Databases**, **Automation**,
**Tooling and Quality** (y **Desktop** / **Mobile** solo si el estudiante las incluye). Cada área es un subplan con grupos internos. Los planes
anteriores (un subplan «Programación: <objetivo>» por rama) se siguen leyendo igual y no se reescriben: solo cambian cuando el estudiante pulsa
**«Reorganizar por áreas»** en la sub-interfaz del plan.

- `structure: "areas"` (opcional, en el plan): marca la estructura nueva. Si falta, es la estructura antigua.
- Por subplan (todo opcional): `areaId` (`backend` · `frontend` · `databases` · `automation` · `tooling` · `desktop` · `mobile`; o `x-<materia>` para
  materias que no son de programación, que forman su propia área); `objective` es **una línea corta** («Construir servicios y APIs sólidos y seguros»);
  `groups[]` = `{id, title, kind: "bases"|"language"|"knowledge", order}` (Bases · «Lenguaje: Python» · «Conocimientos de backend»);
  `phase: {fromWeek, toWeek}` = las semanas en que el área está activa (como mucho **2 áreas en paralelo**); `fallback: {kind: "rules"|"mixed", reason}`
  = el aviso «completado con reglas», **solo** cuando la IA no pudo elegir esos temas (con su motivo; ya no se escriben notas internas como
  «sin la selección de la IA»). `topics[].group` es el grupo del tema; dentro del área los temas van por grupo (Bases → Lenguaje → Conocimientos).
- **Tabla rama → área + grupo** (`src/lib/planAreas.ts`, datos, no código disperso): `4 Backend`→Backend, `5 Frontend`→Frontend, `6 Databases`→Databases,
  `7 Automation`→Automation, `9 Tooling and Quality`→Tooling and Quality, `3 Desktop Apps`/`8 Mobile`→sus áreas (grupo «Conocimientos»);
  `2.1 Python`→grupo «Lenguaje» de Backend (si Backend no está en el alcance y sí Automation, de Automation); `2.2 JavaScript`/`2.3 TypeScript`→grupo
  «Lenguaje» de Frontend (sin Frontend, de Backend); `1 Fundamentals`→grupo «Bases» del primer área del plan, limitado por el nivel declarado.
  **`programming_practice` NO es un área**: es la pista de práctica aparte (`programmingPractice`).
- **Fases**: las áreas se secuencian por rangos de semanas distintos (no todas en todo el periodo). El orden y los pesos los propone la IA en el esqueleto
  (la app los valida) o salen del orden por defecto (Backend, Databases, Frontend, Automation, Tooling); la secuencia la calcula la app de forma determinista simulando semana a semana con la capacidad real. Por defecto forman fases `Backend ‖ Databases → Frontend → Automation ‖ Tooling` (las áreas consecutivas de una misma pareja van en paralelo; el resto, solas), de modo que nunca hay más de 2 áreas en una misma semana.
- **Nombre del plan** autogenerado a partir de las áreas: «Full stack web · 6 oct–5 abr» (Backend + Frontend → «Full stack web»; sin sufijos «+N» ni el
  periodo repetido). Solo se regeneran los nombres autogenerados antiguos al reorganizar; uno editado a mano se respeta.
- `openQuestions` en un plan por áreas: **una sola** pregunta global `{id: "deliverables", text, options}` **sin** `subplanId` (en los antiguos, una por subplan).
  `mentor_plan_answer` sin `subplanId` la responde para todo el plan (yes añade el proyecto PROPIO de cada área: «API REST con persistencia y pruebas»,
  «Esquema relacional con consultas y migraciones»…, distintos por área); las excepciones por área van con `mentor_plan_area_deliverable`.
- **Entregables de la agenda** (`deliverables`, opcional): `PlanDeliverable {id, kind: "kata"|"weekly_project"|"monthly_project"|"area_project"|"daily_project"|"topic_project", title, description,
  areaId?, dueDate, files?: [{path?, note}], criteria[], status: "pendiente"|"en_curso"|"hecho", source: "practice"|"ai"}`. Los de **práctica** se DERIVAN
  del plan (un archivo de kata `kata:<fecha>` por día de estudio con kata, `wp:<semana>` por proyecto semanal, `mp:<semana>` por bloque mensual) y los de
  **área** salen de `subplan.deliverable` (`area:<subplan>`, con la fecha en que acaba el área); `Plan.deliverables` solo guarda lo editado a mano (estado,
  archivos) casado por `id`, y los extras que añade la IA (`x:<n>`). El estado final es lo más avanzado entre lo que dice la práctica
  (`PracticeStatus.kataDoneDates` y las fases de cada proyecto) y lo anotado a mano.
- **Propósitos** (`purposes`, opcional): `{day: {"AAAA-MM-DD": texto}, week: {"3": texto}, month: {"AAAA-MM": texto}}`. Si faltan, el texto sale de plantillas
  deterministas a partir del contenido (áreas, títulos de temas, práctica, entregables); si existen, lo sustituyen. Se editan en la agenda o pidiéndolo al Mentor.
- **Revisión de cobertura** (`coverageReview`, opcional, aditivo): la guarda «Revisar cobertura con el Mentor» (`mentor_plan_coverage_review`, una llamada a la IA bajo
  demanda). `{at: ISO, source: "ai", profile?: texto, summary: texto, discarded: n, areas: [{key: areaId|id del subplan, area, assessment, missing: [{title, why, groupId?}],
  misplaced: [{folder, title, reason, suggestedArea?}]}]}`. La app valida la respuesta: descarta las sugerencias que ya existen como tema de la vault, las áreas que no son
  del plan y los «sobrantes» que no son temas del plan. Solo informa: no crea notas ni cambia temas. Se ignora si no es válida; deshacer un cambio la conserva.
  La **cobertura determinista** (teoría y ejercicios por tema, temas de las ramas fuera del plan; `mentor_plan_coverage`, `src/lib/planCoverage.ts`) no se guarda.
  **Revisión con criterio y realista** (campos aditivos; las revisiones antiguas se leen igual): `criteria: {presets: [market|mid|interviews|custom], targetLevel: junior|mid|senior,
  currentLevel: auto|none|junior|mid|senior, conditions}` (el formulario «¿Con qué criterio revisamos?»), `overall: {verdict: short|adequate|excessive, coveragePct?, text}`, `disclaimer` (la app
  lo pone siempre: es una estimación del modelo, sin datos de mercado en vivo) y, por área, `verdict`, `verdictWhy`, `coveragePct` (múltiplos de 5), `dispensable: [{folder, title, reason}]` (temas del
  plan sin completar que pueden pasar a «fuera de ruta») y, en cada `missing`, `priority?: high|medium|low`, `level?: junior|mid|senior` y `accepted?` (añadido al plan como PROPUESTA con
  `mentor_plan_coverage_accept`: no crea notas ni cambia temas). Pasar prescindibles a fuera de ruta usa `mentor_plan_route_set` (deshacible, no borra nada).
  **Historial** (`mentor_plan_history`): las entradas llevan `kind?: question|fix|adjust`; una PREGUNTA (`mentor_plan_ask`) se guarda con `status: "answered"` y `answer`, no cambia el plan ni se puede deshacer.
- **Fases mes a mes** (no se guarda, `src/lib/planMonths.ts`): cada semana del plan cuenta en el mes de su día central; por área y mes se agregan temas (por `targetWeek`), horas, semanas activas (`phase`) y grupos.
- **Agenda** (no se guarda: se recalcula siempre igual, `src/lib/planSchedule.ts`): reparto DIARIO determinista. Cada día de estudio no bloqueado da
  `minutesPerDay × ritmo` menos los minutos de práctica de ese día; cada semana, la capacidad se reparte entre las áreas con temas esa semana en
  proporción a su demanda (nivelado por días si hay holgura); un tema que supera los minutos del día ocupa varios (parte 1/n…); nunca antes de su
  `targetWeek`; los fijados (`pinned`) van primero en su semana; los completados se anotan el día de `completedAt` y no consumen capacidad; lo que no cabe
  en todo el plan se amontona en el último día de estudio, marcado como desbordado. Vistas Día · Semana · Mes · Calendario con conteo de temas y entregables.
- **Agenda por enfoque** (planes con `structure: "areas"`; no se guarda, `src/lib/planDayFocus.ts` + `planSchedule.ts`): cada día de estudio tiene un **enfoque** (el área
  principal activa ese día: Backend, Frontend…) y unos **bloques obligatorios** de teoría y de práctica que salen de una **plantilla de día por enfoque**
  (la tabla `FOCUS_TEMPLATES`, datos, no código disperso). Los temas pendientes se reparten en carriles por tipo de grupo (Conocimientos, Lenguaje, y un carril global
  de fundamentos «Bases»). Las proporciones son por plantilla; con holgura cada carril toma lo que necesita para acabar al final de la fase del área (nivelado, nunca por
  debajo del mínimo del bloque); con sobrecarga las proporciones reparten el día y lo sobrante pasa a los bloques atrasados. Se respetan `minutesPerDay` × ritmo, días de
  estudio y bloqueados, la práctica reservada (kata + sesión del proyecto semanal), los temas que abarcan varios días, `pinned` (no antes de su semana) y las fases.

  | Enfoque | Bloques del día (todos el MISMO día) | % del día (mín.) | Práctica |
  |---|---|---|---|
  | **Backend** (+ Databases como acompañante) | Teoría de backend · Práctica de lenguaje (Python) · Teoría de bases de datos · Práctica de bases de datos (SQL) | 30 (25 min) · 28 (25) · 24 (20) · 18 (20) | Python + SQL sobre los temas del día |
  | **Databases** (sin Backend) | Teoría de bases de datos · Práctica de bases de datos (SQL) | 55 (25) · 45 (20) | SQL |
  | **Frontend** | Teoría de frontend · Práctica de lenguaje (JavaScript/TypeScript) · Práctica de UI y componentes | 35 (25) · 35 (25) · 30 (20) | lenguaje + componentes |
  | **Automation** | Teoría de automatización · Práctica de scripting en Python | 50 (25) · 50 (25) | scripting |
  | **Tooling and Quality** | Teoría de herramientas y calidad · Práctica con Git y pruebas | 50 (25) · 50 (20) | Git, pruebas, linters |
  | otras áreas (Desktop, Mobile, materias propias) | Teoría de <área> · Práctica de <área> | 60 (25) · 40 (20) | ejercicios del área |

  Además cada día de estudio lleva su **proyecto diario** (12 % de la capacidad, entre 30 y 60 min; 25–45 en áreas genéricas). El enfoque del día se enseña con un chip
  «Enfoque: Backend», la línea «Hoy: teoría de backend + práctica de Python + teoría y práctica de SQL» y un propósito generado con esa estructura. **Un tipo sin temas**:
  si el carril tuvo temas pero ya están hechos (o su fase aún no empieza) el bloque queda como **repaso** (≈20 min, con los últimos temas); si el plan no tiene ese tipo de
  tema (p. ej. sin Databases o sin lenguaje) el bloque se **omite** con una explicación. Con varios enfoques activos en la semana (Automation ‖ Tooling) los días se alternan en
  proporción a lo que le queda a cada uno; Databases va dentro de los días de Backend mientras coinciden.
  **«No partir desde cero»**: los fundamentos (grupo «Bases») NO se adelantan como bloque inicial ni ocupan semanas enteras al principio: se **intercalan** durante toda la fase del
  área que los tiene como **lógica aplicada** dentro de la práctica de lenguaje, repartidos con el lenguaje en proporción a lo que le queda a cada uno. La `targetWeek` de un tema
  no fijado solo ordena su carril. Los planes de estructura antigua conservan el reparto anterior.
- **Currículo de práctica del plan** (`practiceCurriculum`, opcional, aditivo; `src/lib/planCurriculum.ts`): lo genera **bajo demanda** «Generar la práctica del plan con el Mentor»
  (`mentor_plan_practice_generate`; clave de estado/cancelación `practice:<id>`) y queda en el historial de cambios (con instantánea previa: «Deshacer» lo quita). Forma:
  `{generatedAt, source: "ai"|"mixed"|"template", warnings?: [texto], weeks: [{week, source: "ai"|"template", exercises: [{topic, practice: "language"|"database"|"ui"|"scripting"|"tooling"|"area",
  language?, title (≤120), statement? (≤280), source: "ai"|"template"|"vault", existing?}], logic: [{title, statement?, source}], weeklyProject?: {title, description?},
  dailyProjects: [{topic, title, description?, source}]}], monthly: [{month: "AAAA-MM", title, description?, source}]}`. **La IA nunca decide fechas ni minutos**: cada ejercicio se liga a un
  `topic` (carpeta REAL del plan) y la app lo coloca el día en que su tema se practica; se descartan los temas inexistentes, las semanas fuera del plan y los textos largos. Se
  genera por bloques de 3 semanas en paralelo limitado (3 llamadas a la vez, 120 s por llamada y 480 s en total, cancelación real con `AbortSignal`); un bloque que falla cae
  SOLO él a **plantillas** («Practica <tema> en <lenguaje>: 3 ejercicios del tema», marcadas como automáticas) y el resto conserva lo de la IA. Los temas que ya tienen
  ejercicios en la vault (`exercises` del tema) se **priorizan y se enlazan** («En tu vault»): la IA solo propone donde faltan. Sin currículo la agenda usa esas mismas plantillas
  por tipo de tema calculadas al vuelo. Los retos de lógica (Programming practice = práctica diaria para entrevistas técnicas) salen del currículo o de plantillas por enfoque.
- **Proyectos diario, semanal y mensual** (derivados del reparto y del currículo; entregables del plan): cada día de estudio tiene su **proyecto diario** (`dp:<fecha>`, kind
  `daily_project`) que aplica los temas de teoría y de práctica de ESE día (título/descripción de la IA si propuso uno para un tema del día; si no, plantilla: p. ej. «Mini-endpoint de <tema>
  con <tema de BD>»); la semana tiene su **proyecto semanal** (el de Programming practice `wp:<n>` si la pista lo tiene; si no `ww:<n>`) que acumula los diarios (cada día enseña qué pieza
  avanza hoy) y el mes su **proyecto mensual** (`mp:<semana>` de la pista o `mm:<AAAA-MM>`) que integra los semanales. Todos cuentan en los conteos de entregables por día, semana y mes;
  `Plan.deliverables` solo guarda su estado y archivos anotados a mano.
- **Reorganizar por áreas** (`mentor_plan_reorganize`): determinista y deshacible. Agrupa los subplanes por rama en áreas y recalcula el reparto con las fases;
  conserva `completedAt`, `pinned`, el estado y el proyecto de los entregables, las metas requeridas, los comentarios del Mentor y la pista de práctica;
  `programming_practice` sale de los subplanes. Queda como un cambio `applied` en `_history/<plan>/<n>.json` (con `before` = el plan antiguo y `nameAfter` si
  cambió el nombre): «Deshacer» restaura el plan antiguo exacto (y su nombre, mientras no se haya renombrado a mano).
- Parche de la IA (cambios pedidos con comentarios), además de los anteriores: `move_topic_area`, `move_group`, `add_area`, `set_area_order`, `set_phase`,
  `add_deliverable`, `set_purpose`. `subplan` acepta el id del subplan, el `areaId` o el nombre del área. Se valida igual (ids y carpetas reales, semanas dentro del
  plan, como mucho 2 áreas en paralelo) y el reparto se recalcula siempre con la capacidad real; las operaciones que solo escriben textos o entregables propios
  no tocan el reparto de los temas.
- **Programming practice** es un sistema de práctica diaria enfocado en prepararse para entrevistas técnicas y en mejorar la lógica y la resolución de procesos:
  un reto de lógica (kata) cada día y proyectos de práctica como complemento. No es un área de estudio del plan. Si el plan excluyó Desktop y Mobile, el foco rotativo
  de sus proyectos semanales tampoco pasa por ellos.

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

#### Motor del plan v2: áreas juntas, lenguajes, proyecto del tema, práctica por área, ruta (aditivo; sin subir `FORMAT_VERSION`)

Todo lo siguiente es opcional: un plan sin estos campos se lee y se agenda exactamente como antes (incluido el plan real del usuario).

- **Cómo se combinan las áreas** — `preconditions.areaMode: "together" | "phased" | "ai"` (lo elige el estudiante AL CREAR el plan; ausente = por fases).
  El plan guarda el modo ya decidido: `areaMode: "together" | "phased"`, `areaModeWhy` (una línea visible) y `areaModeBy: "user" | "ai" | "rules"`.
  - `together` («juntas»): todas las áreas elegidas activas TODO el periodo (`phase` = semanas 1..N) y presentes CADA día. **Automation va siempre al final**
    (su fase empieza cuando acaban las demás), en todos los modos. `phased`: como siempre (≤ 2 áreas en paralelo). `ai`: el esqueleto de la IA propone
    `areaMode` + `areaModeWhy`; la app valida (solo `together`/`phased`, con justificación) y, sin propuesta válida, aplica la regla: Frontend + Backend ⇒ juntas.
  - Día «completo» (tabla `compositeTemplate` en `src/lib/planDayFocus.ts`): una sola plantilla con los bloques de teoría y práctica de cada área activa
    (Backend: teoría + lenguaje; Databases: teoría + SQL; Frontend: teoría + lenguaje + UI…). Cada bloque toma `share × peso del área` (peso = 50 % parejo +
    50 % proporcional a lo que le queda a esa área) y su mínimo se divide entre las áreas; el proyecto diario sube a 40–75 min porque integra las áreas.
    `focus = { id: "together", label: "Full stack", areaIds[], together: true }`.
  - «Pedir cambios» puede cambiar el modo: operación `set_area_mode {mode}` (recalcula fases y reparto; deshacible con el historial).
- **Lenguajes con práctica propia** — `preconditions.languages: [{ id: "python"|"javascript"|"typescript", required, why, weight? }]` (ausente = sin bloque
  diario de lenguaje). Reglas (`src/lib/planLanguages.ts`, tabla `AREA_LANGUAGE_RULES`): Backend ⇒ Python + JavaScript + TypeScript obligatorios; Frontend ⇒
  JavaScript + TypeScript; Automation ⇒ Python; Python elegido a mano es obligatorio. Cada día de estudio lleva el bloque `lang-daily` («Práctica de
  <lenguaje>», `status: "free"`, minutos propios ≈ 18 % del día entre 15 y 35 min): sintaxis, lógica y resolución ligadas a los temas del día. El lenguaje rota
  por peso (por defecto Python 3 · JavaScript 2 · TypeScript 2). No duplica el grupo «Lenguaje: Python» (que sigue siendo de temas).
- **Proyecto del tema** — `topics[].topicProject: { title, description, level: "micro"|"guiado"|"aplicado"|"integrador", basis: "declarado"|"medido", requires[], language?, source: "template"|"ai" }`.
  `calibrateTopicProject` (`src/lib/planTopicProject.ts`, pura) toma el nivel MEDIDO (progreso e intentos reales de los temas previos del grupo y del propio tema)
  y, sin actividad, el declarado (`levels`): sin base ⇒ `micro`; con dominio ⇒ `aplicado`/`integrador`; un tema sin previos nunca pasa de `guiado`; lo medido
  manda y no pasa de un escalón sobre lo declarado. La IA (botón «Generar la práctica del plan») puede proponer título/descripción, pero `clampProject` la recorta al nivel
  permitido. Aparece como bloque «Proyecto del tema» el día en que se completa el tema y es un entregable `kind: "topic_project"` (`id: tp:<hash>`).
- **Práctica por área** — tabla `AREA_PRACTICE` (`src/lib/planAreaPractice.ts`): por área `daily` (qué se practica a diario, con ejemplos), `weekly` (proyecto de fin de semana), `monthly`,
  `measure` y `languages`. Frontend = un componente diario con Atomic Design (átomos → moléculas → organismos: botón, navbar, hero, tarjeta…) y cada semana una **página completa** que
  los une; Backend = endpoint/servicio con pruebas y **API completa**; Databases = diseño/consultas y **esquema + consultas de un caso**; Automation = script y **automatización completa**.
  En modo juntas los proyectos integran: diario = feature (pantalla + endpoint + tabla), semanal = **vertical completa**, mensual = **aplicación**.
- **Entregables por área** — `PlanDeliverable.areaId` es el área propia, `"all"` en los proyectos integradores (con `areaIds[]`) y falta en los katas; kinds nuevos: `topic_project`.
  Funciones puras en `src/lib/planSchedule.ts`: `deliverablesBy(plan, { day | week | month | area, kind?, status? })` (el filtro por área incluye los integradores que la contienen),
  `deliverableAreaRows(list, areas)` (partición del total: «Backend 12 · Frontend 12 · Databases 5 · Integradores 8 · Práctica 60») y `deliverableInArea`.
- **Ruta del plan** — `topics[].route: "optional" | "skipped"` (ausente = `core`) y `skippedReason`. Un tema `skipped` **no se borra** ni se quita de la vault: se conserva en el plan,
  atenuado como «fuera de ruta», y se puede reactivar; las cuentas (temas, horas, semanas, capacidad, reparto diario, proyectos) lo excluyen.
  API: `mentor_route({ planId? })` → `{ today, plans: [{ planId, name, status, currentWeek, counts, topics: [{ folder, title, route, skippedReason?, targetWeek, weekStart, areaId?, area, group? }] }], byFolder }`
  (solo lee; sin `planId`, los planes activos); `mentor_plan_reduce({ id, areaId, groupId?, max })` («Reducir a lo esencial»: Bases 75 → ≤ 30; reglas: dominado/medido, nivel básico
  declarado, lo cubre la práctica de lenguaje, lo último de la ruta; nunca salta prerrequisitos, completados, fijados ni temas en curso) y `mentor_plan_route_set({ id, folders[], route, reason?, label? })`.
  Ambas guardan historial con instantánea previa (`mentor_plan_change_undo`). Operaciones de «Pedir cambios»: `set_route`, `reduce_essentials`.

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


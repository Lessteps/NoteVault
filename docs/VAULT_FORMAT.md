# Formato de la vault de NoteVault

> **Versión del formato: 2**
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
│   └── proyectos/
│       └── <project-id>.md                un archivo por proyecto
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

## Proyectos

### `.notevault/proyectos/<project-id>.md`

El id tiene la forma `pYYYYMMDD-xxxxxx`.

```markdown
---
id: p20260912-a1b2c3
name: "Portafolio web"
status: En curso
color: "#2383e2"
created: 2026-09-12
start: 2026-09-12
deadline: 2026-10-30
---

Descripción libre en markdown.

## Tareas
- [x] Diseñar la home | 2026-09-14
- [ ] Maquetar en HTML | 2026-09-20
- [ ] Publicar
```

- `status` ∈ `Planeado` · `En curso` · `Pausado` · `Terminado`.
- La sección `## Tareas` contiene la checklist. Cada línea es
  `- [ ]` o `- [x]`, el nombre, y opcionalmente ` | fecha ISO`.
- El progreso del proyecto se deriva de la checklist; no se guarda.

## Marcadores

### `.notevault-bookmarks.json`

Lista de rutas relativas a la raíz de la vault, con `/` como separador:

```json
["1.PERSONAL/3.Exercise/Ejercicio.md"]
```

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

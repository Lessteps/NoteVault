# Plan: registros de sesión para que el Mentor se automejore

Estado: **implementado P0–P6** (ver «Estado de la implementación» al final). Decisiones de la persona: los registros son **visibles como notas** con un botón para verlos todos; el detalle se conserva **90 días**; las notas de refuerzo **siempre se proponen** y nunca se crean sin confirmar. Pedido del usuario: que cada sesión de estudio deje un
registro que el propio programa pueda leer, y que al entrar en **Plan** la IA lea esos registros y repiense el plan «a menor escala» (por ejemplo:
«se pueden regenerar estas notas para resolver este problema»), aprovechando la estructura de NoteVault.

## 1. Auditoría: qué ve hoy el Mentor

| Fuente | Dónde vive | ¿Llega al Mentor / a la IA? |
|---|---|---|
| Nota de teoría `.md` y mapa `.canvas` del tema | `<Materia>/<rama>/<tema>/` | Solo como **conteos y puntuación de diseño** (`designsOf`, `topicSnaps`): ¿existe?, ¿cumple el contrato? **Nunca su contenido.** |
| `.practica.md` (manifiesto: skills, tipo de tema) | misma carpeta | Sí, las **skills** y el tipo (`topicSnaps.skills`, cobertura). No qué se trabajó en cada sesión. |
| Ejercicios generados (`Ejercicios/<skill>/ej_*.md`) | misma carpeta | Conteos por skill y dificultad. |
| Intentos calificados (libro mayor) | `.notevault/estudio/` (`ledger`, `attempts`) | Sí, **solo en el cierre del día** (`buildDayRecord`: nota media, intentos, puntos débiles por skill). |
| Errores de práctica | `StudyErrorManager` + registro de aprendizaje `.notevault/estudio/aprendizaje/<tema>/<skill>.json` (opt-in) | Se cuentan por categoría en el cierre del día; el detalle (evidencia, corrección) solo lo usa el generador de ejercicios del **mismo** tema. |
| Repaso espaciado | `<Materia>/Repaso/<tema>.md` | Desde hoy el Mentor **lo muestra** (cajones y acceso directo); **no lo usa para decidir**. |
| Cierre del día y memoria | `.notevault/mentor/daily/<fecha>.json`, `memory.json` | Sí: entra al informe de la IA (`mentor_memory`). Solo cubre lo que pasó en el día, no por sesión. |
| Plan del día aceptado | `.notevault/mentor/sessions/<fecha>.json` | Adherencia (hecho / saltado). Sin rendimiento. |
| **Registro de horas** y **evaluación del Pomodoro** | `.notevault/mentor/timelog/<plan>.json` | **No lo lee nadie todavía**: solo se muestra en la interfaz. |

### Huecos

- **G1 · La sesión no está unida a nada.** El bloque sabe qué temas se le asignaron, pero no qué intentos calificados ni qué errores ocurrieron *dentro* de él.
- **G2 · El contenido estudiado es invisible.** La IA no sabe qué decía la nota ni qué problema práctico se hizo; solo sabe que existen.
- **G3 · No hay dominio por tema.** Hay datos sueltos (nota media, errores, repasos, evaluaciones) pero ninguna medida única de «este tema está flojo».
- **G4 · La revisión del plan no mira rendimiento.** `coverageReview` solo usa títulos de temas y cobertura de archivos; el Mentor repiensa el plan sin saber cómo vas.
- **G5 · Las evaluaciones del Pomodoro se guardan pero no tienen consumidor.**
- **G6 · No hay propuestas con evidencia.** Hoy los cambios al plan salen de lo que pide la persona o de reglas; ninguno cita «porque en estas 3 sesiones…».
- **G7 · No se mide si un arreglo funcionó.** Si se regeneran ejercicios para un error repetido, nadie comprueba después si el error bajó.

## 2. Principio: la estructura de NoteVault a nuestro favor

1. **Dos capas, como el resto de la app.** El dato de máquina vive en `.notevault/mentor/` (JSON, nunca notas, opcional y aditivo, sin subir `FORMAT_VERSION`).
   Lo que debe poder leer una IA o la persona se **proyecta** a notas Markdown bajo `<Materia>/_registro/` (carpeta con guion bajo, igual que `_handoff/` y `_skills/`),
   con frontmatter tipado. Así el Mentor, Antigravity o Claude Code leen el historial con las mismas herramientas con las que leen los temas.
2. **Los vínculos ya existen.** Un tema se identifica por su carpeta (`topicPath`), un intento por el libro mayor, un error por su categoría y skill, un repaso por su nota.
   El registro **no inventa ids nuevos**: enlaza con `[[wikilinks]]` a la nota del tema, a su `.practica.md` y a los ejercicios.
3. **Determinista primero, IA después.** Todo lo que se pueda calcular sin IA se calcula sin IA (barato, repetible, testeable). La IA recibe **resúmenes con evidencia**,
   nunca la vault entera, y hace **una** llamada por revisión (la cuota de Claude Code ya es un límite real).
4. **Nunca se sobrescribe.** Los arreglos crean notas y ejercicios nuevos (`Refuerzo — …`); lo existente no se toca (misma regla que «Ejecutar plan»).
5. **La IA propone, la persona decide.** Ningún cambio al plan ni generación se aplica solo.

## 3. El registro de sesión

Un archivo por sesión: `.notevault/mentor/records/<plan>/<AAAA-MM-DD>/<hhmm>-<area>.json` (máquina) y su proyección
`<Materia>/_registro/<AAAA-MM-DD>/<hhmm> <área>.md` (lectura).

```jsonc
{
  "version": 1,
  "id": "r-20261016-1430-backend",
  "planId": "2026-10-06_2027-04-05", "areaKey": "backend", "date": "2026-10-16",
  "start": "14:30", "minutes": 52, "mode": "timer",            // timer | stopwatch | manual
  "assigned": [{ "kind": "topic", "folder": "Programación/4 Backend/4.2 HTTP in depth", "status": "partial" },
               { "kind": "task", "title": "Terminar el endpoint de login", "status": "done" }],
  "assessment": { "understanding": 3, "focus": 4, "practiced": true,
                  "learned": "…", "doubt": "…", "errors": "Confundí PUT con PATCH" },
  "evidence": {                                                  // lo calcula la app, sin IA, uniendo por ventana de tiempo + carpetas de los temas
    "attempts": [{ "exercise": "…ej_design_d1_2.md", "skill": "design", "score": 55, "verdict": "partial" }],
    "errors":   [{ "category": "concepto", "skill": "design", "topic": "4.2 HTTP in depth", "repeat": 2 }],
    "katas":    [{ "areaId": "backend", "status": "done" }],
    "reviewsDone": ["Repaso/4.1 What the backend is"],
    "filesTouched": ["…/4.2 HTTP in depth.md"]                  // mtime dentro de la ventana
  }
}
```

La proyección Markdown lleva frontmatter (`type: mentor_session`, `area`, `date`, `minutes`, `understanding`, `focus`) y un cuerpo corto con enlaces a los temas.
Es **derivada**: se regenera desde el JSON; editarla a mano no cambia nada (se avisa en la cabecera).

**Cuándo se guarda:** al guardar la evaluación obligatoria (ya existe el formulario) o con «Guardar sesión» en una sesión manual / bloque sin Pomodoro.
El formulario es la parte subjetiva; `evidence` es la parte objetiva y es la que corrige las fantasías («me sentí bien» con 3 intentos en 40 %).

## 4. Agregados deterministas (sin IA)

- **Dominio por tema** (0–100): mezcla de nota media reciente de intentos, errores repetidos (penalizan), comprensión declarada (peso menor), repasos hechos a tiempo y
  tiempo real frente a previsto. Lo declarado nunca pesa más que lo medido.
- **Patrones**: error que se repite ≥ 3 veces en 14 días; tema «a medias» en ≥ 3 sesiones; concentración baja sostenida; horas reales < 60 % de las previstas; tema con repasos vencidos.
- **Índices legibles**: `<Materia>/_registro/puntos-debiles.md` (temas y skills flojos con su evidencia) y `_registro/semana-AAAA-Wnn.md` (resumen semanal).
- **Retención**: sesiones completas 90 días; después solo el agregado semanal. Evita que la IA lea ruido viejo.

## 5. Lo que hace la IA al entrar en Plan

Botón «Repensar el plan con mis registros» (una llamada, con presupuesto fijo de tokens):

1. **Entrada**: objetivo del plan, ruta, dominio por tema, patrones, últimas N sesiones resumidas, repasos vencidos y extractos de errores. Nada de notas completas.
2. **Salida validada** (JSON con esquema; lo inválido cae a reglas y lo dice): lista de **propuestas tipadas**, cada una con `evidence` (ids de sesión e intentos), motivo, coste (llamadas de IA, archivos) y efecto en el plan:
   - `reinforce` — generar ejercicios dirigidos a un error o skill de un tema (alcance «un solo tema», ya existe en «Generar»).
   - `bridge_note` — crear una nota puente corta (`Refuerzo — …`) cuando la duda se repite y la nota actual no la cubre.
   - `move_review` — adelantar un repaso a mañana.
   - `lighten` / `optional` — bajar la carga o mover un tema a opcional (operaciones que ya entiende `mentor_plan_change`).
   - Quedan para más adelante `split_topic` (partir un tema) y `reorder`: no existe todavía una operación del plan que los aplique de forma segura.
3. **La persona acepta o descarta cada una.** «Aplicar» pasa por el diálogo de confirmación existente (informe exacto de lo que se crea, sin sobrescribir).
4. **Seguimiento**: cada propuesta aplicada guarda su línea base; a las 2 semanas el Mentor compara (¿bajó el error?, ¿subió el dominio?) y lo muestra. Si no mejoró, no insiste con lo mismo.

## 6. Prioridades

| # | Qué | Por qué en este orden | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|
| **P0** | Captura mínima: formulario obligatorio al acabar el bloque + registro de horas | Sin datos no hay nada que leer | hecho | Evaluación guardada por sesión con día local; no se puede empezar otro bloque sin ella |
| **P1** | `SessionRecord` unificado: une sesión + intentos + errores + repasos por ventana de tiempo y carpetas | Resuelve G1; todo lo demás depende de esto | M | Tests con un día simulado: la sesión de las 14:30 recoge solo sus intentos |
| **P2** | Proyección Markdown `_registro/` + índices deterministas (dominio, puntos débiles) | Resuelve G2 y G3 sin gastar IA; da valor visible ya | M | Nota legible por sesión; índice estable y repetible; no cambia `FORMAT_VERSION` |
| **P3** | Cierre del día y brief leen sesiones y evaluaciones | Resuelve G5 con poco código (hay dos puntos de entrada) | S | El informe del cierre cita sesiones; test de `brief` |
| **P4** | «Repensar el plan con mis registros»: una llamada, propuestas con evidencia, sin aplicar | Resuelve G4 y G6; es el valor central | L | Esquema validado; sin IA devuelve las propuestas por reglas; nada se escribe |
| **P5** | Aplicar propuestas: refuerzos y notas puente (alcance «un tema»), cambios al plan | Reusa «Generar» y `mentor_plan_change` | M | Cada aplicación pasa por confirmación y no sobrescribe |
| **P6** | Seguimiento del efecto (línea base y comparación) | Resuelve G7; cierra el bucle de automejora | M | Una propuesta aplicada muestra «antes/después» a las 2 semanas |

Camino crítico: **P1 → P2 → P4**. P3 puede ir en paralelo con P2. P5 y P6 solo cuando P4 demuestre que las propuestas son buenas.

## 7. Riesgos y decisiones abiertas

- **Ruido declarado.** Si se rellena el formulario por salir del paso, la IA aprende de ruido. Mitigación: el dominio se apoya en `evidence`; el tiempo de rellenado y respuestas idénticas repetidas bajan el peso.
- **Cuota de IA.** Hay un límite real de sesión. Una llamada por revisión, con resumen en lugar de notas; sin IA todo degrada a reglas.
- **Tamaño.** Un archivo por sesión crece; la retención (sección 4) y el agregado semanal lo acotan.
- **Privacidad.** Todo queda en la vault local; nada sale salvo la llamada de IA ya configurada, y solo con resúmenes.
- **Doble fuente.** JSON canónico y Markdown derivado: si divergen manda el JSON y el Markdown se regenera.

**Decisiones tomadas por la persona**

1. Los registros son **visibles como notas** (`<Materia>/_registro/`) y hay un botón («Registros») para verlos todos desde la app.
2. El detalle se conserva **90 días**; después queda el resumen de la semana.
3. Las notas de refuerzo **siempre se proponen** y se crean solo tras confirmar (la confirmación dice la ruta exacta y si usa IA).

## 8. Estado de la implementación

| # | Qué | Dónde está |
|---|---|---|
| P0 | Formulario obligatorio + registro de horas | `lib/timeLog.ts`, `api/modules/mentorTimeLog.ts`, `PomodoroAssessmentModal.tsx` |
| P1 | Registro unificado con evidencia por ventana de tiempo y carpetas | `lib/sessionRecords.ts` (puro), `core/mentor/sessionRecordStore.ts`, `api/modules/mentorRecords.ts` → `mentor_record_save` |
| P2 | Notas `_registro/` y agregados deterministas (dominio, patrones, semana, retención de 90 días) | `lib/sessionRecords.ts` (`renderSessionMarkdown`, `masteryByTopic`, `patternsOf`, `weekAggregate`) |
| P3 | El cierre del día lee las sesiones | `core/mentor/dayClose.ts` (`sessions`), `mentorDayClose.ts`, tarjeta «Sesiones de estudio» en el cierre |
| P4 | «Repensar el plan con mis registros» (una llamada de IA o reglas; salida validada) | `mentor_records_rethink` |
| P5 | Aplicar: notas de refuerzo y puente, adelantar repaso, mover a opcional, aligerar | `mentor_proposal_apply` + `PlanRecords.tsx` (todo con confirmación) |
| P6 | Seguimiento: línea base al aplicar y comparación a los 14 días con ≥ 2 sesiones | `baselineFor`, `followUpOf` |
| UI | Sub-vista **Registros** del plan y botón «Registros» en la Ejecución | `PlanRecords.tsx`, `PlanSections.tsx`, `PlanRun.tsx` |

Pruebas: `lib/sessionRecords.test.ts`, `api/modules/mentorRecords.test.ts`, `components/mentor/PlanRecords.test.tsx`, `components/TopBarPomodoro.test.tsx`, `core/mentor/dayClose.test.ts`.

**Límites conocidos**

- La evidencia une por **ventana de tiempo y carpetas**: si estudias dos cosas a la vez, un intento puede caer en la sesión que no toca.
- Los intentos solo llevan la hora si se calificaron en la app.
- `split_topic` y `reorder` no están (ver sección 5).
- El seguimiento necesita ≥ 14 días y ≥ 2 sesiones del tema después de aplicar: antes es «Midiendo…».

## 9. Qué ya existía (para no rehacerlo)

- `core/mentor/dayClose.ts` y `api/modules/mentorDayClose.ts`: registro determinista del día, memoria y correcciones.
- `core/mentor/sessionLog.ts`: plan del día aceptado y su cumplimiento (adherencia).
- `core/practice/ledger.ts`, `errorLog.ts`, `learningLog.ts`: intentos, errores y registro de aprendizaje por tema y skill.
- `core/practice/reviewFiles.ts`: repaso espaciado por tema (el Mentor ya lo muestra por área).
- `api/modules/mentorTimeLog.ts` + `lib/timeLog.ts`: registro de horas y **evaluación obligatoria** (P0): qué aprendí, duda, estado de cada tema asignado, si practiqué, errores concretos, comprensión y concentración.
- «Generar» con alcance de **un tema** (`mentor_execution_start`) y operaciones de cambio de plan (`mentor_plan_change`): la maquinaria de P5.

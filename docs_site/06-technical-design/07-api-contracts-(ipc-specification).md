# 07. API Contracts (IPC Specification)

**Fase:** 06 — Diseño Técnico  
**Entregable:** 07  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Contrato Canónico de Mensajería IPC (`registry.ts`)

| Método IPC | Parámetros (Payload) | Tipo de Retorno | Descripción |
| :--- | :--- | :--- | :--- |
| `vault_open` | `{ path: string }` | `VaultMetadata` | Inicializa y migra la bóveda activa. |
| `notes_read` | `{ path: string }` | `{ frontmatter: object, content: string }` | Lee nota y extrae metadatos. |
| `notes_write` | `{ path: string, content: string }` | `{ success: boolean }` | Escritura atómica de nota. |
| `habits_config` | `{}` | `HabitsConfig` | Retorna catálogo de hábitos y días. |
| `habits_get_day` | `{ date: string }` | `HabitDayRecord` | Retorna checks y journal del día. |
| `habits_save_day` | `{ date: string, completed: map, notes: string }` | `HabitDayRecord` | Persiste registro diario en Markdown. |
| `exercise_get_routine` | `{ day: number }` | `Exercise[]` | Retorna rutina según día de semana. |
| `exercise_log_day` | `{ date: string, logs: object }` | `{ success: boolean }` | Persiste series ejecutadas en JSON. |
| `tasks_list` | `{ status?: string }` | `Task[]` | Retorna catálogo de tareas activas. |
| `tasks_save` | `{ task: Task }` | `Task` | Guarda archivo `.notevault/tareas/<id>.md`. |
| `study_queue` | `{}` | `SRSCard[]` | Genera cola diaria de tarjetas SRS. |
| `mentor_plan_get` | `{ planId?: string }` | `MentorPlan` | Retorna plan de estudio mensual activo. |

---

## 2. Marco Conceptual: Contrato de Operación IPC

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único consistente en el nombre de la operación (`ipc_endpoint_id`: `IPC-METHOD-TASKS-SAVE`) registrado en `registry.ts`.
3. **Existe por sí misma en el contrato técnico sin depender del componente visual que la invoque**, y es la única responsable de validar los argumentos de entrada y la serialización de salida.
4. **Punto de entrada y límite de consistencia:** Si una llamada arroja una excepción, se captura y transforma en un `ApiError` estructurado.

</div>

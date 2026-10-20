# Especificación de Módulo: MOD-TASKS (Tareas y Agenda)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-TASKS (04)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Base de Datos Atómica:** Cada tarea es un archivo individual `.notevault/tareas/<task-id>.md` con frontmatter estructurado.
- **Estados:** Ciclo de vida `todo`, `in_progress`, `done` y `archived`.
- **Recurrencias:** Soporte para repetición diaria, semanal, mensual o días personalizados.
- **Notificaciones Locales:** Disparo de alarmas en el sistema operativo (Desktop y Mobile) para tareas con hora límite.

---

## 2. Marco Conceptual: Entidad Tarea

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único (`task_id`: ej. `task_20261020_001`) consultado por el calendario y el sistema de recordatorios.
3. **Existe por sí misma en el disco sin depender de un proyecto padre**, y es la única responsable de validar sus estados y fechas antes de persistir.
4. **Punto de entrada y límite de consistencia:** La actualización de una tarea modifica exclusivamente su archivo en disco.

</div>

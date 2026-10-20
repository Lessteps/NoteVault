# Especificación de Módulo: MOD-PROJECTS (Proyectos y Entregables)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-PROJECTS (05)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Tableros Estilo Jira:** Vista Kanban y de lista particionada por etapas personalizadas.
- **Seguimiento por Pasos:** Cada proyecto desglosa una lista de verificación con fechas estimadas de entrega.
- **Cálculo de Progreso:** Porcentaje de avance ponderado en tiempo real.
- **Almacenamiento Autónomo:** Un archivo Markdown por proyecto en `.notevault/proyectos/<project-id>.md`.

---

## 2. Marco Conceptual: Entidad Proyecto

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único (`project_id`: ej. `proj_notevault_mobile`) consultado por los tableros Kanban.
3. **Existe por sí misma en el almacenamiento sin depender de categorías externas**, y es la única responsable de validar sus etapas y pasos fechados antes de guardar.
4. **Punto de entrada y límite de consistencia:** Controla su propio estado de ejecución y entregables.

</div>

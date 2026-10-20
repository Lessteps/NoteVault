# Especificación de Módulo: MOD-MENTOR (Mentor IA y Planes de Estudio)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-MENTOR (08)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Plan Mensual Inteligente:** Generación determinista o asistida por IA de planes de estudio divididos en semanas y bloques de horas.
- **Modos de Área:**
  - `together`: Todas las áreas (Backend, Frontend, Databases, Tooling) activas desde la semana 1, dejando Automation al final.
  - `phased`: Estudio por fases secuenciales (máximo 2 áreas en paralelo).
- **Proyectos de Tema (`topic_project`):** Calibración automática de nivel (`micro`, `guiado`, `aplicado`, `integrador`).
- **Historial y Deshacer:** Toda modificación de plan (`mentor_plan_change`) guarda una instantánea previa recuperable con `mentor_plan_change_undo`.

---

## 2. Marco Conceptual: Entidad Plan del Mentor

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único fijado por el mes (`plan_id`: ej. `plan_2026-10`) consultado por la Agenda y el Calendario.
3. **Existe por sí misma en el almacenamiento `.notevault/mentor/plans/YYYY-MM.json` sin depender de chats abiertos**, y es la única responsable de validar la coherencia de horas, áreas y semanas.
4. **Punto de entrada y límite de consistencia:** Rige la distribución de tareas y la práctica académica del estudiante.

</div>

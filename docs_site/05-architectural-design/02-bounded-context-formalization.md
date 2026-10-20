# 02. Bounded Context Formalization (DDD)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 02  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Formalización de Contextos Delimitados

NoteVault se descompone en 4 Contextos Delimitados (*Bounded Contexts*) según Domain-Driven Design:

1. **Contexto de Conocimiento y Notas (`Knowledge & Content Context`):**
   - Agregados: `Note`, `Attachment`, `WikiLink`, `CanvasGraph`.
   - Responsabilidad: Parseo Markdown, fórmulas KaTeX, enlaces bidireccionales y búsqueda en texto.
2. **Contexto de Práctica y Aprendizaje Deliberado (`Study & Practice Context`):**
   - Agregados: `StudyTopicManifest`, `SRSCard`, `Attempt`, `StudyLadder`, `MentorPlan`.
   - Responsabilidad: Cola de repetición espaciada, resolución de ejercicios matemáticos, exámenes y planes mensuales.
3. **Contexto de Hábitos y Rendimiento Físico (`Habits & Athletics Context`):**
   - Agregados: `HabitConfig`, `HabitDayLog`, `ExerciseRoutine`, `ExerciseSetLog`.
   - Responsabilidad: Checklist diario de hábitos, cálculo de rachas continuas y registro de series de musculación.
4. **Contexto de Gestión Personal y Enfoque (`Personal Management & Focus Context`):**
   - Agregados: `Task`, `Project`, `FinanceAccount`, `Transaction`, `FocusRule`.
   - Responsabilidad: Tablero Kanban de proyectos, tareas fechadas, balance de ingresos/gastos y control de navegación web.

---

## 2. Marco Conceptual: Contexto Delimitado (Bounded Context)

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija una frontera lingüística y transaccional (`bounded_context_id`: `CTX-STUDY-PRACTICE`) consultado en el diseño modular.
3. **Existe por sí misma en el diseño de arquitectura sin depender de la existencia de otros contextos**, y es la única responsable de garantizar que los términos de su dominio mantengan consistencia semántica sin colisionar con otros módulos.
4. **Punto de entrada y límite de consistencia:** El intercambio de información entre contextos se realiza a través de contratos claros de datos.

</div>

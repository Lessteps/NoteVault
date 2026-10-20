# Especificación de Módulo: MOD-HABITS (Hábitos y Journaling)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-HABITS (02)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Checklist Diario:** Seguimiento de hábitos configurados por día de la semana (`0=lunes` a `6=domingo`).
- **Cálculo de Rachas:** Algoritmo continuo que contabiliza días consecutivos de cumplimiento.
- **Métricas:** Cálculo de porcentaje diario, media semanal, media mensual y progreso anual.
- **Diario Personal:** El texto ubicado después de los metadatos YAML en el archivo del día actúa como el diario reflexivo del usuario.

---

## 2. Marco Conceptual: Entidad Hábito

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único (`habit_id`: ej. `lectura_diaria`, `meditacion`) registrado en `habits_config.json`.
3. **Existe por sí misma en la configuración de hábitos sin depender de tareas externas**, y es la única responsable de fijar sus días de vigencia y subtareas asociadas.
4. **Punto de entrada y límite de consistencia:** Modificar o desactivar un hábito no altera los registros históricos ya almacenados en disco.

</div>

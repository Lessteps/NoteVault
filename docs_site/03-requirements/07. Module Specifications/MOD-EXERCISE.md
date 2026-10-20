# Especificación de Módulo: MOD-EXERCISE (Ejercicio y Rutinas)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-EXERCISE (03)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Catálogo de Ejercicios:** Almacenado en `.notevault/ejercicio/exercises.json` con nombre, día asignado, video demostrativo y notas técnicas.
- **Registro de Series (Sets):** Captura detallada por fecha (`YYYY/MM/YYYY-MM-DD.json`) de pesos (kg/lbs), repeticiones y notas por serie.
- **Videos Demostrativos:** Reproducción de videos locales en formato `.mp4` para consulta técnica en la sala de entrenamiento.
- **Ergonomía Móvil:** Entrada táctil optimizada para registrar series en menos de 5 segundos.

---

## 2. Marco Conceptual: Entidad Ejercicio Físico

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único (`exercise_id`: ej. `lunes_press_banca`, `martes_sentadilla`) consultado en el catálogo de ejercicios.
3. **Existe por sí misma en la base de rutinas sin depender de los logs diarios**, y es la única responsable de validar sus rangos de repeticiones y video asociado.
4. **Punto de entrada y límite de consistencia:** El historial de cargas no muta la definición del ejercicio.

</div>

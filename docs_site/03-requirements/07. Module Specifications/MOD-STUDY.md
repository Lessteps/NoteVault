# Especificación de Módulo: MOD-STUDY (Estudio, SRS y Matemáticas)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-STUDY (07)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Repetición Espaciada (SRS):** Motor Leitner/SM-2 que programa revisiones en función de dificultad y retención.
- **Base de Conocimientos Matemáticos:** Estándar para notas de concepto, teoremas, demostraciones paso a paso y ejercicios.
- **Descubrimiento Jerárquico:** Escaneo de manifiestos `<carpeta>.practica.md` (`type: practica`) ascendiendo en el árbol de notas.
- **Escalera de Dificultad (Ladder):** Progresión por competencias (`solve`, `process`, `prove`, `counterexample`, `drill`, `explain`).

---

## 2. Marco Conceptual: Entidad Tarjeta SRS

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único (`srs_card_id`: ej. `srs_th_pitagoras_01`) consultado por la cola diaria de repaso.
3. **Existe por sí misma en el estado de estudio sin depender de la sesión activa**, y es la única responsable de actualizar su caja Leitner, intervalo de días y factor de facilidad tras cada intento.
4. **Punto de entrada y límite de consistencia:** Registra su historial de intentos de forma aislada en `.notevault/estudio/`.

</div>

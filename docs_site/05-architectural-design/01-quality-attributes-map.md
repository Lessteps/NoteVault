# 01. Quality Attributes Map

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 01  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Mapeo de Atributos de Calidad a Escenarios de Arquitectura

| Atributo de Calidad | Escenario de Arquitectura Medible | Táctica de Arquitectura Aplicada |
| :--- | :--- | :--- |
| **Rendimiento (Latencia)** | Abrir una nota de 5,000 líneas debe completarse en < 30 ms. | Virtualización del editor con CodeMirror 6 y lectura directa con `fs.readFileSync` sin pasar por red. |
| **Seguridad (Aislamiento)** | Un enlace malicioso en una nota Markdown no debe poder ejecutar comandos en el SO. | `contextIsolation: true`, `nodeIntegration: false` y sanitización estricta con `DOMPurify`. |
| **Confiabilidad (Resiliencia)** | Un corte de energía durante el guardado no debe corromper la nota. | Patrón de escritura atómica en archivo temporal `.tmp` con `fs.renameSync`. |
| **Escalabilidad (Bóvedas Grandes)** | Una bóveda con 10,000 notas no debe congelar la interfaz al arrancar. | Límite de escaneo inicial `MAX_SCAN_NOTES = 4000` y lectura jerárquica bajo demanda. |
| **Portabilidad (Multi-OS)** | Una tarea guardada en PC debe leerse de forma idéntica en Android o iPhone. | Serialización estándar determinista con saltos de línea `\n`, UTF-8 e indentación de 2 espacios. |

---

## 2. Marco Conceptual: Escenario de Atributo de Calidad

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija una prueba de esfuerzo arquitectónico (`quality_scenario_id`: `QA-SCENARIO-ATOMIC-WRITE`) consultado en las auditorías de diseño.
3. **Existe por sí misma en el análisis de arquitectura sin depender de la implementación final**, y es la única responsable de fijar la táctica técnica que debe implementarse para mitigar el riesgo.
4. **Punto de entrada y límite de consistencia:** Si un cambio arquitectónico degrada un escenario de calidad, el diseño es rechazado.

</div>

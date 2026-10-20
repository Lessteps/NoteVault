# 10. ADR Consolidation (Bitácora de Decisiones)

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 10  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Bitácora Histórica Consolidada de ADRs

| ADR ID | Título de la Decisión | Estado | Fecha de Aprobación | Justificación Resumida |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-001** | Arquitectura Local-First con Almacenamiento en Disco | Aprobado | 2026-09-24 | Cero costos de servidor ($0 USD) y privacidad absoluta para notas, finanzas y hábitos. |
| **ADR-002** | Estrategia de Dos Clientes Nativos Desacoplados | Aprobado | 2026-09-26 | Electron en PC/Mac y Flutter en Android/iOS para rendimiento óptimo sin puentes lentos. |
| **ADR-003** | Contrato Universal de Bóveda (Vault Format v4) | Aprobado | 2026-09-28 | Centralizar los datos de módulos bajo `.notevault/` para sincronización limpia como una unidad. |
| **ADR-004** | Canal Único IPC con Preload Aislado y Validación | Aprobado | 2026-09-30 | Seguridad estricta con `contextIsolation: true` y confinamiento de rutas en `appState.resolve()`. |
| **ADR-005** | Tolerancia a Conflictos de Sincronización Syncthing | Aprobado | 2026-10-01 | Detección no destructiva de archivos `*.sync-conflict-*` reportados a la interfaz sin fallos. |

---

## 2. Marco Conceptual: Bitácora de Decisiones Arquitectónicas

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que compendia todas las decisiones de arquitectura del proyecto (`adr_log_id`: `ADR-LOG-CONSOLIDATED-V1`) consultado en el onboarding de ingenieros.
3. **Existe por sí misma como registro inmutable sin depender del estado del código fuente**, y es la única responsable de responder al "por qué" se tomó cada decisión técnica fundamental en el ciclo de vida.
4. **Punto de entrada y límite de consistencia:** Todo cambio de decisión exige redactar un nuevo ADR que sustituya formalmente al anterior.

</div>

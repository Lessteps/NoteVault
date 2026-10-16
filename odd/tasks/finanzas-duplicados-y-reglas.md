# Feature: Detección de duplicados y Reglas inteligentes en Finanzas

Objetivo del usuario: "1. Finanzas: Detección de duplicados y Reglas inteligentes (Anti-duplicados en importación CSV y Reglas de auto-categorización persistentes)".

## Specs
- S1: Almacenamiento y gestión de reglas (`FinanceManager` & API):
  - Archivo `.notevault/finanzas/reglas.json` con esquema `{ id, pattern, category, type, created }`.
  - Métodos `rules()`, `saveRule()`, `deleteRule()` en `FinanceManager`.
  - Endpoints `fin_rules_get`, `fin_rules_save`, `fin_rules_delete`.
- S2: Motor de detección de duplicados (API):
  - Endpoint `fin_find_duplicates(candidates)` que evalúa coincidencias en los días afectados (mismo importe en centavos, fecha y similitud en concepto/tipo) y retorna índices con referencia al movimiento ya existente en el Vault.
- S3: Integración del motor de reglas en `csvParser.ts`:
  - `suggestCategory` ahora consulta primero las reglas aprendidas por el usuario (prioridad alta) y luego el diccionario heurístico base.
- S4: Interfaz en `CsvImportDialog.tsx`:
  - Detección reactiva de duplicados: las filas marcadas como posible duplicado nacen deseleccionadas (`selected: false`) con badge de advertencia `Posible duplicado` y tooltip del movimiento existente.
  - Opción de guardar reglas de categorización: checkbox general "Recordar categorizaciones para futuras importaciones" y botón rápido por fila para fijar reglas al instante.
  - Pestaña / filtro "Duplicados" para aislar y revisar filas conflictivas.
- S5: Verificación: Pruebas unitarias de almacenamiento de reglas, detección de duplicados, parser con reglas y typecheck `tsc -b` limpio.

## Tasks
- T1 (S1): Core & API: Storage de reglas en `FinanceManager`, layout en `vaultFormat.ts`, endpoints `fin_rules_*` y tests unitarios. (Route: inline, status: done)
- T2 (S2): Core & API: Endpoint `fin_find_duplicates` con comparación de fecha, importe y concepto + tests unitarios. (Route: inline, status: done)
- T3 (S3): Motor de reglas en `csvParser.ts`: Priorización de reglas de usuario sobre heurísticas + tests unitarios. (Route: inline, status: done)
- T4 (S4): UI `CsvImportDialog.tsx`: Detección automática de duplicados, badge visual, deselección por defecto y opción de persistir reglas al importar. (Route: inline, status: done)
- T5 (S5): Verificación integral con Vitest y `tsc -b`. (Route: inline, status: done)

## Log
- L1: Inicio de especificación de Detección de duplicados y Reglas de categorización inteligente en Finanzas.
- L2: Implementación y verificación completadas: Storage de reglas .notevault/finanzas/reglas.json, endpoints fin_rules_* y fin_find_duplicates, motor de reglas priorizado en csvParser.ts, badges de duplicados interactivos y guardado de reglas en CsvImportDialog, 62 tests en verde y compilación tsc -b limpia.

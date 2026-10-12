# Feature: Cobertura de pruebas para nuevas funcionalidades de Finanzas

## Contexto
Se añaden 2 tests unitarios en Vitest y 1 test E2E en Playwright para blindar las nuevas capacidades añadidas:
1. **Unit Test 1 (Vitest en Sheets.test.tsx)**: Interacción en Periodo al filtrar una categoría que monta `CategoryTrend`.
2. **Unit Test 2 (Vitest en Sheets.test.tsx)**: Comportamiento de `FixedVsVariable` en escenario sin ingresos (`totalIngreso === 0`).
3. **E2E Test (Playwright en finance.spec.ts - NV-F-012)**: Periodo en vista mensual verifica la presencia del panel "Estructura de gastos · Fijos vs Variables" y las tarjetas en formato USD con "Flujo neto".

## Evidencia
- Commit: `0fee01b` (`test(finanzas): 2 unit tests y 1 test E2E Playwright NV-F-012 para nuevas funciones`)
- Unit tests: 87/87 tests pasando en Vitest (+2 tests nuevos en `Sheets.test.tsx`).
- E2E tests: 12/12 specs pasando en Playwright (+1 test nuevo NV-F-012 en `finance.spec.ts`).
- Build y Typecheck: `npm run build` y `tsc -b` limpios sin advertencias ni errores.

## Tareas

- [x] Task 1: Añadir 2 tests unitarios en `frontend/src/components/finance/Sheets.test.tsx`.
- [x] Task 2: Añadir test E2E NV-F-011 en `frontend/e2e/finance.spec.ts`.
- [x] Task 3: Ejecutar suite de Vitest y verificar tests nuevos en verde.
- [x] Task 4: Ejecutar suite de Playwright (`finance.spec.ts`) y verificar E2E verde.
- [x] Task 5: Consolidar evidencia y commit de unidad de trabajo.

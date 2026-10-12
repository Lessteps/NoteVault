# Feature: Separación de Flujo Neto y Caja Disponible en Finanzas

## Contexto
El modelo previo calculaba `balance = ingreso - gasto - ahorro + retiro`, tratando el ahorro como si fuera un gasto que destruye el balance acumulado. Se implementa la separación entre:
- **Flujo Neto (Superávit / Resultado)**: `ingreso - gasto` (refleja la riqueza/capacidad generada en el periodo).
- **Ahorro Asignado**: `ahorro - retiro`.
- **Caja Disponible (Remanente)**: `ingreso - gasto - ahorro + retiro` (liquidez sin destinar).

## Evidencia
- Commit: `5302d1f` (`feat(finanzas): separar flujo neto y caja disponible en totales y graficas`)
- Verificación: `tsc -b` limpio, 76/76 vitest tests pasando.

## Tareas

- [x] Task 1: Extender `FinanceTotals` y `FinTotals` con `neto` y `disponible` en `core/financeManager.ts` y `lib/types.ts` + tests en `core/financeManager.test.ts`.
- [x] Task 2: Actualizar cálculo y presentación de `totals` y `Tiles` en `components/finance/parts.tsx` + tests unitarios en `parts.test.tsx`.
- [x] Task 3: Actualizar vista Periodo (`components/finance/Sheets.tsx`): Balance Acumulado sobre Flujo Neto, comparativas y matriz.
- [x] Task 4: Verificar coherencia en `Diario.tsx` y `HomeModule.tsx` (consumidores de totales).
- [x] Task 5: Ejecutar suite completa (`typecheck` + `vitest`), verificar E2E y consolidar en commit de unidad de trabajo.

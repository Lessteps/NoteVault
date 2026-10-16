# Feature: Alertas de Desvío Presupuestario en Tiempo Real por Categoría en Finanzas

Objetivo del usuario: "1. Finanzas: Alertas de tope por categoría en el Diario (avisos en tiempo real al registrar gastos si se está cerca o se sobrepasa el presupuesto de la categoría seleccionada)".

## Specs
- S1: Core & API (`fin_diario_bundle`): Retornar `budgets: Array<{ category: FinCategory; used: number; budget: number }>` dentro del bundle del Diario, proveyendo los gastos acumulados y presupuestos de cada categoría en la misma llamada optimizada.
- S2: Feedback reactivo en tiempo real en Registro Rápido (`Diario.tsx`):
  - Al tipear el importe o seleccionar una categoría de gasto, calcular el impacto proyectado: `total = used + draftAmount`.
  - Normal (<80%): Barra verde menta con porcentaje, monto restante y avance.
  - Alerta preventiva (80% - 100%): Indicador ámbar con aviso `⚠️ Cerca del límite en {categoría}`.
  - Desvío / Exceso (>100%): Banner de advertencia en rojo `🚨 Este gasto supera el presupuesto mensual de {categoría} por $ {exceso}`.
- S3: Visor de presupuestos por categoría en `Diario.tsx`:
  - Mini-panel desplegable o resumen junto al presupuesto general mensual que liste las categorías con presupuesto asignado y su porcentaje de uso del mes.
- S4: Feedback reactivo en `MovementDialog.tsx`:
  - Al crear o editar un movimiento completo en el modal, mostrar el estado del presupuesto de la categoría seleccionada con el importe ingresado.
- S5: Verificación: Pruebas unitarias de bundle, renderizado de alertas en Diario y modal, con compilación TypeScript `tsc -b` limpia.

## Tasks
- T1 (S1): Core & API: Retornar `budgets` en `fin_diario_bundle` + tests unitarios en `finance.test.ts`. (Route: inline, status: done)
- T2 (S1): Types & Bridge: Actualizar interfaz de retorno de `finDiarioBundle` en `bridge.ts`. (Route: inline, status: done)
- T3 (S2, S3): UI `Diario.tsx`: Alertas de presupuesto en tiempo real en Registro Rápido y visor de categorías con presupuesto. (Route: inline, status: done)
- T4 (S4): UI `MovementDialog.tsx`: Alerta reactiva de categoría en el formulario completo. (Route: inline, status: done)
- T5 (S5): Verificación completa con Vitest y typecheck `tsc -b`. (Route: inline, status: done)

## Log
- L1: Inicio de especificación de Alertas de Desvío Presupuestario por Categoría en Finanzas.
- L2: Implementación y verificación completadas: Inclusión de category budgets en fin_diario_bundle, alertas reactivas en tiempo real en Registro Rápido de Diario.tsx (verde <80%, ámbar 80-100%, rojo >100%), visor desplegable de categorías con tope mensual junto al presupuesto del mes, feedback reactivo en MovementDialog.tsx, 62 tests en verde y compilación tsc -b limpia con 0 errores.

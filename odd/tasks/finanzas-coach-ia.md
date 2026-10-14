# Feature: Coach Financiero IA en Finanzas (Fase 1)

Objetivo del usuario: "Vamos a darle a Fase 1: Coach / Asistente Financiero IA con acciones interactivas (registrar gastos por lenguaje natural, analizar fugas de dinero y consultar presupuestos) y pulir la carga rápida del Diario".

## Specs
- S1: Aislamiento estricto: El Coach de Finanzas se monta exclusivamente en `module === "finanzas"`. Notas, Mentor y Ejercicio conservan sus asistentes independientes sin contaminación de estado, historial ni prompts.
- S2: Contexto financiero dinámico en System Prompt: `financeCoachPrompt.ts` inyecta:
  - Balance del mes actual: ingresos, gastos, ahorros, saldo neto y moneda configurada.
  - Ritmo de gasto (*pace*): comparación del gasto acumulado vs presupuesto mensual y proyección a fin de mes.
  - Desglose por categorías: gastos acumulados por rubro vs presupuesto por categoría.
  - Metas de ahorro activas: objetivo, monto acumulado y porcentaje de avance.
  - Compromisos recurrentes: próximos gastos fijos y suscripciones registradas.
- S3: Acciones interactivas del Coach (`financeCoachActions.ts` y `FinanceActionCard.tsx`):
  - `add_movement`: registra gastos, ingresos o ahorros con un clic vía `api.finAdd`.
  - `set_budget`: ajusta el presupuesto mensual general vía `api.finBudgetSet`.
- S4: Persistencia e historial de conversaciones: Almacenadas de forma privada en `~/.notevault/finance_coach_conversations/` mediante `ConversationStore`.
- S5: Store independiente `useFinanceCoach`: Estado reactivo de chat, streaming con canal `nv-ai-stream`, selección de modelo e historial.
- S6: Componente UI `FinanceCoachAssistant`: Panel derecho específico de finanzas con chips de sugerencia rápida, tarjetas de balance y renderizado de acciones interactivas.
- S7: Pulido de carga en `Diario.tsx`: Entrada rápida más ergonómica con atajo `Enter`, validación visual y confirmación limpia.
- S8: Verificación: Tests unitarios completos de prompt, actions, API, store y UI, con compilación TypeScript `tsc -b` 100% limpia.
- S9: Acciones avanzadas del Asesor: Soporte para eliminar movimientos (`remove_movement`) y programar gastos/ingresos recurrentes (`create_recurring`) mediante tarjetas interactivas de un solo clic.

## Tasks
- T1 (S2, S4): Core & API: Generador de contexto financiero y endpoints de conversaciones del coach. (Route: inline, status: done)
- T2 (S3): Parser y tarjetas de acción del Coach (`financeCoachActions.ts` y `FinanceActionCard.tsx`). (Route: inline, status: done)
- T3 (S5): Store `useFinanceCoach`: Estado reactivo, streaming e historial del coach. (Route: inline, status: done)
- T4 (S1, S6): Componente `FinanceCoachAssistant` e integración en `AssistantPanel.tsx`. (Route: inline, status: done)
- T5 (S7): Pulido de la entrada rápida del Diario (`Diario.tsx`). (Route: inline, status: done)
- T6 (S8): Verificación completa, suite de tests y typecheck en verde. (Route: inline, status: done)
- T7 (S9): Parser e instrucciones en prompt para `remove_movement` y `create_recurring`. (Route: inline, status: done)
- T8 (S9): Componente `FinanceActionCard` con ejecución de eliminación y programación de recurrentes. (Route: inline, status: done)
- T9 (S9): Tests unitarios completos y verificación de typecheck. (Route: inline, status: done)

## Log
- L1: Inicio de la Fase 1: Coach de Finanzas IA con acciones interactivas y pulido de la carga rápida del Diario.
- L2: Fase 1 completada con éxito: Coach Financiero IA interactivo con acciones add_movement y set_budget, aislamiento estricto por módulo en AssistantPanel, pulido de carga rápida en Diario.tsx con Enter y auto-categorización, 51 tests pasando, typecheck en verde y build verificado.
- L3: Acciones avanzadas concluidas: Asesor Financiero ahora ejecuta add_saving (aportes a metas), remove_movement (anulación de gastos) y create_recurring (programación de suscripciones fijas). Barras de progreso realistas continuas y fechas en Metas Financieras. 65 tests pasando y typecheck en verde.

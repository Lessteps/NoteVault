# Feature: Tendencias por Categoría y Estructura Fijos vs Variables en Periodo

## Contexto
El usuario busca valor analítico sin fricción de carga en la vista Periodo:
1. **Evolución por Categoría**: Gráfica temporal (mes a mes de los últimos 6 meses) al seleccionar o inspeccionar una categoría, con promedio mensual, mes pico y tendencia.
2. **Estructura Fijos vs Variables**: Diagnóstico del mes que compara gastos fijos (recurrentes) vs gastos variables del día a día, mostrando su porcentaje respecto a los ingresos totales y barra de distribución visual.

## Evidencia
- Commit: `ac0724f` (`feat(finanzas): tendencias por categoria y desglose fijos vs variables en Periodo`)
- Verificación: `tsc -b` limpio (0 errores), 85/85 vitest tests de finanzas pasando.

## Tareas

- [x] Task 1: Crear componente `FixedVsVariable` con desglose porcentual respecto a ingresos y barra de distribución en `Sheets.tsx`.
- [x] Task 2: Crear componente `CategoryTrend` con cálculo de 6 meses de historial, promedio, mes pico y gráfica en `Sheets.tsx`.
- [x] Task 3: Integrar ambos paneles en la vista Periodo (`Sheet` y `MonthExtras`) cuando corresponda.
- [x] Task 4: Tests unitarios en `Sheets.test.tsx` para ambos componentes y cálculos derivados.
- [x] Task 5: Verificación completa (`tsc -b`, `vitest`), evidencia y commit de unidad de trabajo.

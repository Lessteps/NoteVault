# Feature: Sprint de Pulido UI/UX en Finanzas

## Contexto
Mejoras ergonómicas y de diseño visual:
1. **Ergonomía de Registro Rápido (Diario.tsx)**: Reorganización con prioridad al ancho de Detalle, agrupación compacta de selectores y `PrimaryButton` para "Guardar ↵".
2. **Affordance en Filas de Tabla (parts.tsx)**: Indicador `ChevronRight` / `ChevronDown` para comunicar claramente la expandibilidad del acordeón en cada movimiento.
3. **Donut Chart honesto con "Otras" (Sheets.tsx)**: Agrupación consolidada de categorías secundarias (`Otras (X)`) para que el Donut y su leyenda reflejen el 100% matemático sin cortar categorías.

## Evidencia
- Commit: `255078a` (`feat(finanzas): pulido UI/UX en registro rapido, chevrons en tabla y Donut integro`)
- Verificación: `npm run build` OK, `tsc -b` 0 errores.
- Tests: 87/87 vitest unit tests y 12/12 Playwright E2E tests pasando al 100%.

## Tareas

- [x] Task 1: Pulir barra de registro rápido en `Diario.tsx` (ancho prioritario de detalle, botón primario guardar).
- [x] Task 2: Añadir affordance de acordeón con chevrons en `MovementTable` en `parts.tsx`.
- [x] Task 3: Consolidar categorías secundarias en rebanada "Otras" en `MonthExtras` en `Sheets.tsx`.
- [x] Task 4: Ejecutar suite de pruebas completa (`tsc -b`, `vitest`, `playwright`).
- [x] Task 5: Consolidar evidencia y commit de unidad de trabajo.

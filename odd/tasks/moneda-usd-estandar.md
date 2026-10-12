# Feature: Moneda USD Estándar en Finanzas

## Contexto
El módulo tenía `COP` como moneda por defecto hardcodeada en Core, API y componentes UI, formateando sin centavos y descartando decimales. Se migra a `USD` como moneda por defecto con formateo estándar US (`$ 1,250.00`, `$ 12.50`), parseo robusto de inputs en dólares con comas y puntos, y des-hardcodeo de `COP` en las vistas.

## Evidencia
- Commit: `059b72b` (`feat(finanzas): moneda USD por defecto y formato estandar en toda la UI`)
- Verificación: `tsc -b` limpio (0 errores), 83/83 vitest tests de finanzas pasando.

## Tareas

- [x] Task 1: Cambiar `DEFAULT_CURRENCY` a `"USD"` en `core/vaultFormat.ts` y soportar lectura de moneda en ajustes de finanzas.
- [x] Task 2: Actualizar `formatMoney` y `parseMoney` en `lib/money.ts` y `core/num.ts` a formato estándar US (`$ 1,250.00`, `$ 12.50`) + tests unitarios.
- [x] Task 3: Des-hardcodear `"COP"` en componentes (`parts.tsx`, `Sheets.tsx`, `Recurrents.tsx`, `HomeModule.tsx`) usando `meta?.currency || "USD"`.
- [x] Task 4: Actualizar tests existentes que asumían `"COP"` y verificar suite completa con `tsc -b` y `vitest`.
- [x] Task 5: Consolidar evidencia y commit de unidad de trabajo.

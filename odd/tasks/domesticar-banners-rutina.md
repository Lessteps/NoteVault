# Feature: Domesticar banners y barra de herramientas en Tu Programa (Ejercicio)

## Contexto
Los avisos de sincronización y copias huérfanas en `Routine.tsx` (`data-stale-banner`, `data-orphan-banner`) y los controles técnicos (`data-sync-auto`, `exLinkVideos`) ocupaban demasiado espacio vertical e interrumpían la vista de la rutina. Se estilizan como un centro de sugerencias compacto y estilizado, y se emprolija la barra de herramientas sin romper compatibilidad con los tests E2E y unitarios existentes.

## Evidencia
- Commit: `2202fb7` (`feat(ejercicio): domesticar banners de rutina y emprolijar barra de acciones`)
- Vitest: 126/126 tests unitarios pasando al 100% en ejercicio.
- Playwright: 15/15 tests E2E pasando (`exercise.spec.ts`, `exercise-piezas.spec.ts`, `exerciseGraph.spec.ts`).
- Build y TypeScript: `npm run build` y `tsc -b` limpios.

## Tareas

- [x] Task 1: Rediseñar la barra de acciones de `Routine.tsx` con estilos integrados para `data-sync-auto` y `Link2`.
- [x] Task 2: Rediseñar los banners `data-stale-banner` y `data-orphan-banner` como tarjetas compactas y estilizadas con micro-botones.
- [x] Task 3: Ejecutar suite de pruebas de ejercicio (`tsc -b`, `vitest`, `playwright`).
- [x] Task 4: Consolidar evidencia y commit de unidad de trabajo.

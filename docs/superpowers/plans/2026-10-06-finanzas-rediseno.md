# Plan: rediseño Finanzas por fases (commits verificables)

**Rama:** `feature/finanzas-rediseno` (nueva, desde `main` — NO sobre la de ejercicio).
**Baseline verificado 2026-10-06:** `tsc` 0 · unit finanzas 14/14 (`api/modules/finance`, `store/finance`) · e2e `finance.spec.ts` NV-F-001…005 · `components/finance` sin unit tests (deuda a cerrar en cada fase).
**Regla por commit:** `npm run typecheck` + `npx vitest run <archivos>` + actualizar e2e si cambia texto/rol visible. Sin cambios de formato del vault (sin migraciones): la fusión En qué/Razón es solo visual.

## Fase 0 — Limpieza (1 commit)
Quitar peso muerto sin cambiar comportamiento:
- Emojis de los `h1` (Diario, Semanal, Mensual, Anual, Metas, Categorías).
- Botón duplicado "De ingreso" en Categorías (uno solo).
- Bloque "Este mes" del sidebar (duplica los Tiles).
- Texto "Clic en una fila para editarla…" (lápiz al hover lo reemplaza).
- E2E: headings `/Diario/`, `/Categorías/` siguen pasando (quitar emoji no rompe regex); verificar NV-F-001…005.

## Fase 1 — Diario y captura (2 commits)
**1A — Un solo "+ Nuevo":** reemplaza los 3 botones por uno que abre el diálogo (el selector de tipo ya existe dentro). Registro rápido con selector de tipo (gasto/ingreso/ahorro/retiro), no solo gasto.
**1B — Tiles honestos:** solo Gastos + Ahorro del día (fuera "Balance del día" rojo permanente). Lápiz visible al hover en filas.
- Unit nuevos: `Diario.test.tsx` (quick-save por tipo, tiles sin balance).
- E2E: NV-F-001/002 (textos Guardar), NV-F-003 usa "+ Nuevo" en vez de "+ Ingreso" → actualizar spec.

## Fase 2 — Periodo y tabla (2 commits)
**2A — Unificar Semanal/Mensual/Anual:** un item "Periodo" con selector semana/mes/año + flechas. Comparativa periodo-anterior en las 3 (hoy solo mensual). Gráfica de balance acumulado en Anual.
**2B — Tabla de 4 columnas** (Fecha·Detalle·Categoría·Importe; Detalle = En qué + Razón combinados, hora al tooltip, adjuntos al expandir). `CategoryMatrix` incluye ingresos.
- Unit nuevos: `Sheets.test.tsx` (bounds por modo, comparativa, matriz con ingresos), `parts.test.tsx` (detalle combinado).
- E2E: helper `gotoDiario` usa item "Periodo"; NV-F-004 (eliminar) contra la fila expandible.

## Fase 3 — Metas (2 commits)
**3A — Crear en 2 pasos** (qué/cuánto → cuándo/ritmo) con aporte sugerido = restante/días hasta deadline. Sin tocar el diálogo de edición.
**3B — Ahorro general accionable:** banner "tienes X sin asignar → asignar a meta". Retiro rápido desde Diario (cuarto tipo en registro rápido lo cubre; falta atajo en detalle: ya existe).
- Unit nuevos: `Goals.test.tsx` (sugerido desde deadline, banner general).
- E2E nuevo NV-F-006: crear meta en 2 pasos + proyección visible.

## Fase 4 — Features nuevas (2 commits)
**4A — Recurrentes:** `fin_recurring` (monto, tipo, categoría, regla `RepeatPicker` existente) + job al abrir el día que materializa pendientes con marca "auto". Requiere clave LAYOUT nueva (`finanzas/recurrentes.json`) + docs VAULT_FORMAT.
**4B — Presupuesto global mensual + alerta** (barra en Diario cuando gasto >80 %) y **Duplicar movimiento** (botón en fila expandida) + plantillas (duplicado con fecha hoy).
- Unit: `recurring.test.ts`, presupuesto global.
- E2E nuevos NV-F-007 (recurrente se materializa), NV-F-008 (duplicar).

## Orden y verificación final
0 → 1A → 1B → 2A → 2B → 3A → 3B → 4A → 4B. Al cerrar cada fase: full `vitest run` sin regresiones vs baseline (fallos preexistentes conocidos: codeDebugger x3, fileWatcher x1, englishPlayer x1, projectFolders flaky x1) + `vite build` OK.

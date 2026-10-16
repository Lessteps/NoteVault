# Feature: Importador de extractos bancarios (CSV) y Exportación / Reportes en Finanzas

Objetivo del usuario: "Fase 3 — Importador de extractos bancarios (CSV / Excel): Arrastrar un .csv bajado del banco o homebanking, mapear columnas (Fecha, Descripción, Monto) e importar o clasificar movimientos por lote en el Diario. 3. Exportación / Reportes: Poder exportar el cierre de mes o el histórico a CSV o JSON descargable."

## Specs
- S1: Importador masivo por lotes (Core & API): Endpoint `fin_import_batch` y método `FinanceManager.addBatch` que recibe múltiples movimientos validados, los agrupa por fecha, persiste atómicamente por día y refresca metas afectadas en una sola operación.
- S2: Exportación completa del histórico (Core & API): Endpoint `fin_export_all` que recopila todos los movimientos de todos los días del Vault, ordenados cronológicamente, junto con metadatos de categorías y metas para generación de reportes y backups sin límites de rango.
- S3: Parser y normalizador CSV inteligente (`csvParser.ts`):
  - Detección automática de delimitadores (`,`, `;`, `\t`), manejo de comillas escapadas y limpieza de BOM (`\uFEFF`).
  - Detección heurística de columnas: Fecha (`fecha`, `date`, `operacion`, etc.), Detalle (`concepto`, `descripcion`, `detalle`, etc.) y Monto (`monto`, `importe`, `cargo`/`abono`, etc.).
  - Normalización de fechas (ISO `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `MM/DD/YYYY`).
  - Parseo numérico robusto con signo, paréntesis contables `(120.00)`, monedas `$`, miles y decimales (`1,250.50` y `1.250,50`).
  - Auto-clasificación sugerida de categorías basada en palabras clave del detalle.
- S4: Modal UI de Importación (`CsvImportDialog.tsx`):
  - Zona de arrastrar y soltar (Drag & Drop) y selector de archivos `.csv`.
  - Paso de confirmación de mapeo de columnas con vista previa de las primeras filas.
  - Tabla interactiva de revisión previa: inclusión/exclusión por fila (checkbox), selector de tipo (gasto/ingreso/ahorro/retiro) y selector de categoría.
  - Indicador resumen de totales a importar e importación atómica con notificación toast y recarga de vista.
- S5: Modal UI de Exportación y Reportes (`ExportDialog.tsx`):
  - Selector de alcance: Cierre de mes activo, año en curso o histórico completo (todo el Vault).
  - Selector de formato: CSV tabular formateado o JSON estructurado descargable con metadatos.
  - Resumen ejecutivo de cifras (Total ingresos, total gastos, ahorro neto y flujo neto).
- S6: Integración y accesibilidad en el módulo:
  - Botones destacados de fácil acceso en `Diario.tsx` ("Importar extracto CSV", "Exportar / Reporte") y vinculación en `Sheets.tsx`.
- S7: Verificación completa: Pruebas unitarias de parser, batch core/API, diálogos y compilación TypeScript `tsc -b` con cero errores.

## Tasks
- T1 (S1, S2): Core & API: `FinanceManager.addBatch`, endpoints `fin_import_batch` y `fin_export_all`, bridge e interfaces con tests unitarios. (Route: inline, status: done)
- T2 (S3): Parser CSV y normalizador inteligente: `csvParser.ts` con auto-detección de columnas, parseo numérico flexible y sugerencia de categorías + suite de tests unitarios. (Route: inline, status: done)
- T3 (S4): Componente UI `CsvImportDialog.tsx`: Drag & drop, mapeador interactivo de columnas, grilla de revisión previa por fila y guardado masivo. (Route: inline, status: done)
- T4 (S5): Componente UI `ExportDialog.tsx`: Modal de exportación de reportes (cierre de mes, año, histórico) en CSV y JSON descargable. (Route: inline, status: done)
- T5 (S6, S7): Integración en `Diario.tsx`, `Sheets.tsx`, `useFinance` y verificación global con Vitest y `tsc -b`. (Route: inline, status: done)

## Log
- L1: Inicio de la implementación de la Fase 3 de Finanzas (Importador de extractos bancarios CSV) y Exportación / Reportes (CSV y JSON descargable).
- L2: Implementación y verificación completadas: Core & API (addBatch, fin_import_batch, fin_export_all), parser inteligente csvParser con auto-detección de columnas y normalización de formatos monetarios/fechas, componentes UI CsvImportDialog y ExportDialog montados en Diario y Periodo, 59 tests de finanzas en verde y compilación tsc -b limpia con 0 errores.

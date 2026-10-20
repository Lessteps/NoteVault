# Especificación de Módulo: MOD-FINANCE (Finanzas y Presupuesto)

**Fase:** 03 — Ingeniería de Requisitos  
**Módulo:** MOD-FINANCE (06)  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Alcance y Responsabilidades

- **Libro Contable:** Registro de transacciones de ingreso, gasto y transferencias entre cuentas.
- **Partición Mensual:** Transacciones agrupadas por mes (`.notevault/finanzas/transactions/YYYY/MM.json`).
- **Presupuestos:** Control de topes de gasto por categoría con alertas visuales de desviación.
- **Coach Financiero:** Análisis de patrones de consumo y sugerencias de ahorro.

---

## 2. Marco Conceptual: Entidad Cuenta Financiera

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único (`account_id`: ej. `acc_banco_ahorros`, `acc_efectivo`) consultado en el libro de transacciones.
3. **Existe por sí misma en el catálogo financiero sin requerir conexión bancaria externa**, y es la única responsable de validar que sus saldos y tipos de moneda sean correctos.
4. **Punto de entrada y límite de consistencia:** Los movimientos de dinero alteran su balance sin riesgo de inconsistencias contables.

</div>

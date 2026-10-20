import { describe, expect, it } from "vitest";
import {
  buildMovementRows,
  detectColumns,
  parseCsvAmount,
  parseCsvDate,
  parseCsvRows,
  suggestCategory,
} from "./csvParser";

describe("csvParser", () => {
  describe("parseCsvRows", () => {
    it("handles standard comma-separated values", () => {
      const csv = `Fecha,Descripcion,Monto\n2026-03-01,Supermercado,-45.50\n2026-03-02,Sueldo,2500.00`;
      const res = parseCsvRows(csv);
      expect(res.delimiter).toBe(",");
      expect(res.headers).toEqual(["Fecha", "Descripcion", "Monto"]);
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual(["2026-03-01", "Supermercado", "-45.50"]);
    });

    it("handles semicolon-separated values and BOM", () => {
      const csv = `\uFEFFFecha;Concepto;Importe\r\n01/03/2026;Restaurante;-12,50\r\n02/03/2026;Gasolina;-40,00`;
      const res = parseCsvRows(csv);
      expect(res.delimiter).toBe(";");
      expect(res.headers).toEqual(["Fecha", "Concepto", "Importe"]);
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toEqual(["01/03/2026", "Restaurante", "-12,50"]);
    });

    it("handles quoted fields with commas and escaped quotes", () => {
      const csv = `Fecha,Descripcion,Monto\n2026-03-01,"Cafe, bar & bistro ""El Sol""",-15.00`;
      const res = parseCsvRows(csv);
      expect(res.rows[0]![1]).toBe('Cafe, bar & bistro "El Sol"');
    });

    it("handles tab-delimited values", () => {
      const csv = `Fecha\tDetalle\tMonto\n2026-03-01\tLuz\t-80.00`;
      const res = parseCsvRows(csv);
      expect(res.delimiter).toBe("\t");
      expect(res.rows[0]).toEqual(["2026-03-01", "Luz", "-80.00"]);
    });
  });

  describe("parseCsvDate", () => {
    it("parses ISO YYYY-MM-DD format", () => {
      expect(parseCsvDate("2026-03-15")).toBe("2026-03-15");
      expect(parseCsvDate("2026/03/15")).toBe("2026-03-15");
      expect(parseCsvDate("2026-03-15 14:30:00")).toBe("2026-03-15");
    });

    it("parses Latin DD/MM/YYYY format", () => {
      expect(parseCsvDate("15/03/2026")).toBe("2026-03-15");
      expect(parseCsvDate("05-11-2025")).toBe("2025-11-05");
      expect(parseCsvDate("01.04.2026")).toBe("2026-04-01");
    });

    it("returns null on invalid date", () => {
      expect(parseCsvDate("texto-invalido")).toBeNull();
      expect(parseCsvDate("32/01/2026")).toBeNull();
      expect(parseCsvDate("")).toBeNull();
    });
  });

  describe("parseCsvAmount", () => {
    it("parses standard US numbers with negative sign and currency", () => {
      expect(parseCsvAmount("-$1,250.50")).toEqual({ cents: 125050, sign: -1 });
      expect(parseCsvAmount("$2,500.00")).toEqual({ cents: 250000, sign: 1 });
      expect(parseCsvAmount("-45.99")).toEqual({ cents: 4599, sign: -1 });
    });

    it("parses European/Latin numbers with dot as thousand and comma as decimal", () => {
      expect(parseCsvAmount("-1.250,50 €")).toEqual({ cents: 125050, sign: -1 });
      expect(parseCsvAmount("3.400,00")).toEqual({ cents: 340000, sign: 1 });
      expect(parseCsvAmount("-12,50")).toEqual({ cents: 1250, sign: -1 });
    });

    it("parses accounting parentheses as negative", () => {
      expect(parseCsvAmount("(150.00)")).toEqual({ cents: 15000, sign: -1 });
      expect(parseCsvAmount("($2,000.00)")).toEqual({ cents: 200000, sign: -1 });
    });

    it("parses trailing minus", () => {
      expect(parseCsvAmount("85.50-")).toEqual({ cents: 8550, sign: -1 });
    });

    it("returns null on non-numerical text", () => {
      expect(parseCsvAmount("N/A")).toBeNull();
      expect(parseCsvAmount("")).toBeNull();
    });
  });

  describe("detectColumns", () => {
    it("detects single amount column by header names", () => {
      const headers = ["Fecha Operacion", "Concepto de Movimiento", "Importe EUR"];
      const detected = detectColumns(headers, [["2026-03-01", "Compra", "-10.00"]]);
      expect(detected.dateCol).toBe(0);
      expect(detected.descCol).toBe(1);
      expect(detected.amountCol).toBe(2);
      expect(detected.hasSplitAmount).toBe(false);
    });

    it("detects split debit and credit columns", () => {
      const headers = ["Fecha", "Detalle", "Cargos / Debito", "Abonos / Credito"];
      const detected = detectColumns(headers, [["15/03/2026", "Nomina", "", "2000.00"]]);
      expect(detected.dateCol).toBe(0);
      expect(detected.descCol).toBe(1);
      expect(detected.debitCol).toBe(2);
      expect(detected.creditCol).toBe(3);
      expect(detected.hasSplitAmount).toBe(true);
    });
  });

  describe("suggestCategory", () => {
    const cats = [
      { id: "comida", name: "Alimentación" },
      { id: "transporte", name: "Transporte" },
      { id: "servicios", name: "Servicios del hogar" },
      { id: "sueldo", name: "Sueldo y Nómina" },
    ];

    it("matches exact or partial category name", () => {
      expect(suggestCategory("Pago transporte escolar", cats).category).toBe("transporte");
    });

    it("matches domain keywords", () => {
      expect(suggestCategory("Supermercado Carulla Exito", cats).category).toBe("comida");
      expect(suggestCategory("Uber trip 29849", cats).category).toBe("transporte");
      expect(suggestCategory("Enel factura energia electrica", cats).category).toBe("servicios");
      expect(suggestCategory("Transferencia abono nomina", cats).category).toBe("sueldo");
    });

    it("prioritises custom user rules over domain keywords", () => {
      const userRules = [
        // Custom rule: "carulla" mapped to "servicios" instead of default "comida"
        { pattern: "carulla", category: "servicios", type: "gasto" as const },
        { pattern: "custom-pattern-xyz", category: "transporte" },
      ];

      const res = suggestCategory("Compra Carulla Express", cats, userRules);
      expect(res.category).toBe("servicios");
      expect(res.matchedRule).toBe(true);

      const res2 = suggestCategory("Pago custom-pattern-xyz", cats, userRules);
      expect(res2.category).toBe("transporte");
      expect(res2.matchedRule).toBe(true);
    });

    it("returns empty string if no category matches", () => {
      expect(suggestCategory("Pago miscelaneo 123", cats).category).toBe("");
    });
  });

  describe("buildMovementRows", () => {
    it("converts raw CSV rows into valid preview movements with auto-classification", () => {
      const rawRows = [
        ["2026-03-01", "Compra en Supermercado", "-120.50"],
        ["2026-03-02", "Uber a la oficina", "-18.00"],
        ["2026-03-03", "Abono Salario Empresa", "2500.00"],
        ["2026-03-04", "Gasto especial regla", "-50.00"],
        ["invalido", "Fila rota", "abc"],
      ];

      const mapping = { dateCol: 0, descCol: 1, amountCol: 2 };
      const cats = [
        { id: "comida", name: "Alimentación" },
        { id: "transporte", name: "Transporte" },
        { id: "especial", name: "Especial" },
      ];
      const userRules = [
        { pattern: "gasto especial regla", category: "especial" },
      ];

      const rows = buildMovementRows(rawRows, mapping, cats, userRules);
      expect(rows).toHaveLength(5);

      // Row 1: Expense, auto-categorised to comida
      expect(rows[0]!.type).toBe("gasto");
      expect(rows[0]!.amount_cents).toBe(12050);
      expect(rows[0]!.category).toBe("comida");
      expect(rows[0]!.selected).toBe(true);
      expect(rows[0]!.matchedRule).toBe(false);

      // Row 2: Expense, auto-categorised to transporte
      expect(rows[1]!.type).toBe("gasto");
      expect(rows[1]!.amount_cents).toBe(1800);
      expect(rows[1]!.category).toBe("transporte");
      expect(rows[1]!.selected).toBe(true);

      // Row 3: Income
      expect(rows[2]!.type).toBe("ingreso");
      expect(rows[2]!.amount_cents).toBe(250000);
      expect(rows[2]!.selected).toBe(true);

      // Row 4: Matched custom user rule
      expect(rows[3]!.category).toBe("especial");
      expect(rows[3]!.matchedRule).toBe(true);

      // Row 5: Error row (not selected)
      expect(rows[4]!.selected).toBe(false);
      expect(rows[4]!.error).toBeDefined();
    });
  });
});

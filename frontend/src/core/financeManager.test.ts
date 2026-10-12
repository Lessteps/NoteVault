import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AHORRO,
  FinanceCalendarSource,
  FinanceManager,
  formatMoney,
  GASTO,
  INGRESO,
  RETIRO,
  totals,
} from "./financeManager";

const D = new Date(2026, 8, 14); // 2026-09-14 (Monday)

describe("FinanceManager", () => {
  let tempDir: string;
  let fm: FinanceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-finance-test-"));
    fm = new FinanceManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Movements", () => {
    it("day file shape and key order", () => {
      const m = fm.add(D, GASTO, 1250000, {
        category: "comida",
        what: "Almuerzo",
        reason: "Oficina",
        time: "13:10",
        created: "2026-09-14T13:12",
      });

      const dayPath = fm.day_path(D);
      const text = fs.readFileSync(dayPath, "utf-8");
      const parsed = JSON.parse(text);

      expect(parsed).toEqual({
        movements: [
          {
            id: m.id,
            type: "gasto",
            amount_cents: 1250000,
            currency: "USD",
            category: "comida",
            what: "Almuerzo",
            reason: "Oficina",
            time: "13:10",
            attachments: [],
            created: "2026-09-14T13:12",
          },
        ],
      });

      expect(Object.keys(parsed.movements[0])).toEqual([
        "id",
        "type",
        "amount_cents",
        "currency",
        "category",
        "what",
        "reason",
        "time",
        "attachments",
        "created",
      ]);
      expect(text.endsWith("}\n")).toBe(true);
    });

    it("totals are exact integers", () => {
      fm.add(D, INGRESO, 350000000);
      fm.add(D, GASTO, 1);
      fm.add(D, GASTO, 99999999999);
      fm.add(D, AHORRO, 5000000);
      fm.add(D, RETIRO, 2000000);

      const t = totals(fm.day(D));
      expect(t.balance).toBe(350000000 - 1 - 99999999999);
      expect(t.neto).toBe(350000000 - 1 - 99999999999);
      expect(t.disponible).toBe(350000000 - 1 - 99999999999 - 5000000 + 2000000);
      expect(totals([]).balance).toBe(0);
      expect(totals([]).neto).toBe(0);
      expect(totals([]).disponible).toBe(0);
    });

    it("update, move, and delete", () => {
      const m = fm.add(D, GASTO, 100, { what: "x", reason: "r" });
      fm.update(D, m.id, { reason: "", amount_cents: 200 });

      const got = fm.get(D, m.id);
      expect(got).not.toBeNull();
      expect("reason" in got!).toBe(false);
      expect(got!.amount_cents).toBe(200);

      const nextDay = new Date(2026, 8, 15);
      fm.move(m.id, D, nextDay);
      expect(fs.existsSync(fm.day_path(D))).toBe(false);
      expect(fm.day(nextDay).length).toBe(1);

      fm.delete(nextDay, m.id);
      expect(fm.all_days()).toEqual([]);
    });

    it("month ranges and by month", () => {
      fm.add(new Date(2026, 1, 28), GASTO, 100, { category: "comida" });
      fm.add(new Date(2026, 2, 1), GASTO, 50, { category: "ocio" });
      fm.add(new Date(2026, 2, 31), GASTO, 25, { category: "comida" });

      expect(fm.month(2026, 2).length).toBe(1);
      expect(fm.by_category(fm.month(2026, 3))).toEqual({
        ocio: 50,
        comida: 25,
      });

      const months = Object.fromEntries(fm.by_month(2026));
      expect(months[2]?.[GASTO]).toBe(100);
      expect(months[3]?.[GASTO]).toBe(75);
      expect(months[4]?.[GASTO]).toBe(0);

      const [thisM, prevM] = fm.compare_month(2026, 3);
      expect(thisM[GASTO]).toBe(75);
      expect(prevM[GASTO]).toBe(100);
    });

    it("no siembra categorías y no inventa nada", () => {
      // Un vault nace vacío: las categorías son las que crea la persona.
      expect(fm.ensure_defaults()).toBe(false);
      expect(fm.categories(null, true)).toEqual([]);
      // Idempotente aunque se insista.
      expect(fm.ensure_defaults()).toBe(false);
      expect(fm.categories(null, true)).toEqual([]);
    });

    it("categoría creada a mano y presupuesto", () => {
      fm.create_category("Comida", GASTO, "🍽", "#f4511e", 60000000);
      expect(fm.categories(GASTO).map((c) => c.name)).toEqual(["Comida"]);
      expect(fm.categories(INGRESO)).toEqual([]);

      fm.add(D, GASTO, 1000000, { category: "comida" });
      const used = fm.budget_used(2026, 9).map(([c, u, b]) => [c.id, u, b]);
      expect(used).toEqual([["comida", 1000000, 60000000]]);
    });

    it("eliminar una categoría la manda a la papelera", () => {
      fm.create_category("Comida", GASTO, "🍽", "#f4511e", 0);
      fm.add(D, GASTO, 1000000, { category: "comida" });

      expect(fm.delete_category("comida")).toBe(true);
      expect(fm.categories(null, true)).toEqual([]);
      expect(fm.delete_category("comida")).toBe(false);
      // El movimiento sobrevive y queda sin categoría.
      expect(fm.day(D)[0]!.category).toBe("comida");
      // Y no vuelve sola al vaciarse la carpeta.
      expect(fm.ensure_defaults()).toBe(false);
    });

    it("reordena categorías dentro de su tipo", () => {
      fm.create_category("Almuerzo", GASTO);
      fm.create_category("Bus", GASTO);
      fm.create_category("Sueldo", INGRESO);
      expect(fm.categories(GASTO).map((c) => c.name)).toEqual(["Almuerzo", "Bus"]);

      expect(fm.move_category("bus", -1)).toBe(true);
      expect(fm.categories(GASTO).map((c) => c.name)).toEqual(["Bus", "Almuerzo"]);
      // Los bordes no se mueven…
      expect(fm.move_category("bus", -1)).toBe(false);
      expect(fm.move_category("almuerzo", 1)).toBe(false);
      // …y se puede volver a bajar.
      expect(fm.move_category("bus", 1)).toBe(true);
      expect(fm.categories(GASTO).map((c) => c.name)).toEqual(["Almuerzo", "Bus"]);
      // El ingreso no se mezcla con los gastos.
      expect(fm.move_category("sueldo", 1)).toBe(false);
      expect(fm.categories(INGRESO).map((c) => c.name)).toEqual(["Sueldo"]);
      expect(fm.move_category("no-existe", 1)).toBe(false);
    });

    it("reordena aunque dos categorías compartan order", () => {
      fm.create_category("A", GASTO);
      fm.create_category("B", GASTO);
      // A mano, dos con el mismo order: el orden estable cae al nombre.
      fm.update_category("a", { order: 1 });
      fm.update_category("b", { order: 1 });
      expect(fm.categories(GASTO).map((c) => c.name)).toEqual(["A", "B"]);

      expect(fm.move_category("b", -1)).toBe(true);
      expect(fm.categories(GASTO).map((c) => c.name)).toEqual(["B", "A"]);
    });

    it("money format", () => {
      expect(formatMoney(1250000)).toBe("$ 12,500.00");
      expect(formatMoney(-120000000)).toBe("-$ 1,200,000.00");
      expect(formatMoney(1250, "USD")).toBe("$ 12.50");
      expect(formatMoney(0)).toBe("$ 0.00");
      expect(formatMoney(1250000, "COP")).toBe("$ 12.500");
    });
  });

  describe("Goals & Savings", () => {
    it("goal lifecycle, saved, pace and projection", () => {
      const g = fm.create_goal("Moto", 10000000, {
        deadline: new Date(2026, 8, 23),
        start: new Date(2026, 8, 1),
      });
      expect(g.name).toBe("Moto");
      expect(g.target_cents).toBe(10000000);

      fm.add(new Date(2026, 8, 10), AHORRO, 2000000, { goal: g.id });
      fm.add(new Date(2026, 8, 12), AHORRO, 3000000, { goal: g.id });

      expect(fm.saved(g.id)).toBe(5000000);
      expect(fm.get_goal(g.id)?.status).toBe("Activa");

      const paceInfo = fm.pace(g.id, new Date(2026, 8, 14));
      expect(paceInfo.saved).toBe(5000000);
      expect(paceInfo.remaining).toBe(5000000);
      expect(paceInfo.days_left).toBe(9);
    });

    it("calendar source integrates with schedule", () => {
      const g = fm.create_goal("Ahorro Viaje", 5000000, {
        repeat: "daily",
        start: new Date(2026, 8, 1),
        suggested_cents: 100000,
      });

      const src = new FinanceCalendarSource(fm);
      const occs = src.occurrences(new Date(2026, 8, 10), new Date(2026, 8, 12));
      expect(Object.keys(occs).length).toBe(3);

      src.setDone(new Date(2026, 8, 11), `fgoal:${g.id}`, true);
      const dayMovs = fm.day(new Date(2026, 8, 11));
      expect(dayMovs.some((m) => m.goal === g.id && m.type === AHORRO)).toBe(true);

      src.setDone(new Date(2026, 8, 11), `fgoal:${g.id}`, false);
      const dayMovsAfter = fm.day(new Date(2026, 8, 11));
      expect(dayMovsAfter.some((m) => m.goal === g.id && m.type === AHORRO)).toBe(false);
    });
  });

  describe("Golden byte conformance", () => {
    it("matches golden movement day file", () => {
      const goldenPath = path.resolve(
        __dirname,
        "__golden__/.notevault/finanzas/2026/09/2026-09-12.json",
      );
      if (!fs.existsSync(goldenPath)) return;

      const goldenBuf = fs.readFileSync(goldenPath);
      const goldenObj = JSON.parse(goldenBuf.toString("utf-8"));

      for (const m of goldenObj.movements) {
        fm.add(new Date(2026, 8, 12), m.type, m.amount_cents, {
          id: m.id,
          currency: m.currency,
          category: m.category,
          goal: m.goal,
          what: m.what,
          reason: m.reason,
          time: m.time,
          created: m.created,
          attachments: m.attachments,
        });
      }

      const generatedBuf = fs.readFileSync(fm.day_path(new Date(2026, 8, 12)));
      expect(generatedBuf.equals(goldenBuf)).toBe(true);
    });
  });
});

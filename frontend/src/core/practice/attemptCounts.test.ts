// Fase 2 · qué cuenta.
//
// La regla: una práctica hecha con ayuda no mueve el progreso ni la próxima
// revisión. Se guarda (es práctica y se ve en el historial) pero el motor la
// ignora hasta que el ejercicio se rehaga sin ayuda.

import { describe, expect, it } from "vitest";
import { PASS_SCORE, attemptCounts, countAttempt, replay } from "./ledger.js";

const pass = (over: Record<string, unknown> = {}) => ({
  at: "2026-09-01T10:00:00",
  verdict: "correct",
  score: PASS_SCORE,
  hints_used: 0,
  solution_seen: false,
  ...over,
});

describe("countAttempt", () => {
  it("un intento limpio cuenta", () => {
    expect(countAttempt(pass())).toEqual({ counted: true, reasons: [], codes: [] });
  });

  it("con una pista usada, no cuenta, y dice por qué", () => {
    const r = countAttempt(pass({ hints_used: 1 }));
    expect(r.counted).toBe(false);
    expect(r.codes).toEqual(["hints_used"]);
    expect(r.reasons[0]).toContain("pista");
  });

  it("haber visto la solución, haber abandonado o no llegar a calificar tampoco", () => {
    expect(countAttempt(pass({ solution_seen: true })).codes).toEqual(["solution_seen"]);
    expect(countAttempt(pass({ gave_up: true })).codes).toEqual(["gave_up"]);
    expect(countAttempt(pass({ verdict: "ungraded" })).codes).toEqual(["ungraded"]);
  });

  it("acumula motivos", () => {
    expect(countAttempt(pass({ hints_used: 2, solution_seen: true })).codes).toEqual(["solution_seen", "hints_used"]);
  });

  it("un `counted` escrito manda sobre la deducción", () => {
    expect(attemptCounts({ ...pass({ hints_used: 3 }), counted: true })).toBe(true);
    expect(attemptCounts({ ...pass(), counted: false })).toBe(false);
  });

  it("los registros antiguos (sin `counted`) se deducen de sus campos", () => {
    expect(attemptCounts(pass())).toBe(true);
    expect(attemptCounts(pass({ hints_used: 1 }))).toBe(false);
  });
});

describe("el progreso ignora lo que no cuenta", () => {
  it("una sesión con ayuda no suma al progreso ni al «mejor»", () => {
    const helped = replay([pass(), pass(), pass({ hints_used: 1 })]);
    expect(helped.counted_attempts).toBe(2);
    expect(helped.attempts).toBe(3);
    expect(helped.ignored_attempts).toBe(1);
    // El «mejor» resultado no lo pone la práctica con ayuda.
    expect(replay([pass({ score: 100, hints_used: 1 })]).best).toBeNull();
    expect(replay([pass({ score: 100 })])).toMatchObject({ best: 100, counted_attempts: 1, ignored_attempts: 0 });
  });

  it("la fecha de revisión no se adelanta con ayuda, y rehacerlo sin ayuda sí cuenta", () => {
    const withHelp = replay([pass({ at: "2026-09-01T10:00:00" }), pass({ at: "2026-09-02T10:00:00", hints_used: 1 })], "2026-09-03");
    const clean = replay([pass({ at: "2026-09-01T10:00:00" })], "2026-09-03");
    expect(withHelp.due).toBe(clean.due);
    expect(withHelp.interval_days).toBe(clean.interval_days);
    expect(withHelp.status).toBe(clean.status);

    const redone = replay(
      [pass({ at: "2026-09-01T10:00:00" }), pass({ at: "2026-09-02T10:00:00", hints_used: 1 }), pass({ at: "2026-09-03T10:00:00" })],
      "2026-09-03",
    );
    expect(redone.counted_attempts).toBe(2);
    expect(redone.ignored_attempts).toBe(1);
    // El motor solo ve los dos intentos limpios, como si la de en medio no existiera.
    const withoutMiddle = replay([pass({ at: "2026-09-01T10:00:00" }), pass({ at: "2026-09-03T10:00:00" })], "2026-09-03");
    expect(redone).toMatchObject({
      status: withoutMiddle.status,
      bands: withoutMiddle.bands,
      best: withoutMiddle.best,
      interval_days: withoutMiddle.interval_days,
      due: withoutMiddle.due,
      lapses: withoutMiddle.lapses,
    });
  });
});

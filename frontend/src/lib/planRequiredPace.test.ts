import { describe, expect, it } from "vitest";
import { paceNeedText, requiredPace, studyDaysBetween } from "./planRequiredPace";

describe("ritmo necesario hasta la fecha de fin", () => {
  it("cuenta los días de estudio entre dos fechas, ambos incluidos", () => {
    expect(studyDaysBetween("2026-11-02", "2026-11-08", [1, 2, 3, 4, 5])).toBe(5); // lunes a domingo, sin fin de semana
    expect(studyDaysBetween("2026-11-02", "2026-11-08", [])).toBe(7);
    expect(studyDaysBetween("2026-11-09", "2026-11-02", [1])).toBe(0);
  });

  it("por asignatura: temas y minutos por día; la fecha de fin no se mueve aunque no quepa", () => {
    const r = requiredPace({
      today: "2026-11-02", start: "2026-10-06", end: "2026-11-13", studyDays: [1, 2, 3, 4, 5], minutesPerDay: 120,
      groups: [
        { id: "py", title: "Python", total: 22, pending: 20, totalMinutes: 1320 },
        { id: "css", title: "CSS", total: 100, pending: 100, totalMinutes: 6000 },
      ],
    });
    expect(r.daysLeft).toBe(10);
    expect(r.groups[0]).toMatchObject({ pendingTopics: 20, topicsPerDay: 2, minutesPerDay: 120 });
    expect(r.groups[1]).toMatchObject({ pendingTopics: 100, topicsPerDay: 10, minutesPerDay: 600 });
    expect(r.total.pendingTopics).toBe(120);
    expect(r.fits).toBe(false); // 720 min/día necesarios frente a 120 disponibles: se dice, no se recorta
    expect(paceNeedText(r.groups[0]!, "13 nov")).toBe("≈ 2 temas/día · 2 h/día para llegar al 13 nov");
  });

  it("sin temas pendientes no hay ritmo; sin minutos diarios conocidos «cabe» por defecto; el último día cuenta", () => {
    const r = requiredPace({ today: "2027-04-05", start: "2026-10-06", end: "2027-04-05", studyDays: [1, 2, 3, 4, 5, 6, 7], groups: [{ id: "a", title: "A", total: 3, pending: 0, totalMinutes: 180 }] });
    expect(r.daysLeft).toBe(1);
    expect(paceNeedText(r.groups[0]!)).toBe("Sin temas pendientes");
    expect(r.fits).toBe(true);
  });
});

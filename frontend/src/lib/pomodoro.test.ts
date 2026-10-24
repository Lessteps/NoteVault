import { describe, expect, it } from "vitest";
import { advance, clock, focusDoneMinutes, idlePomodoro, pause, phaseOver, remainingMs, resume, startFocus } from "./pomodoro";

const T0 = 1_000_000;
const min = (n: number) => n * 60_000;

describe("pomodoro", () => {
  it("empieza en reposo y arranca un foco con la duración elegida", () => {
    const s = idlePomodoro("p", "backend", 25, 5);
    expect(remainingMs(s, T0)).toBe(0);
    const f = startFocus(s, "p", "backend", T0);
    expect(f).toMatchObject({ phase: "focus", running: true });
    expect(remainingMs(f, T0 + min(10))).toBe(min(15));
    expect(phaseOver(f, T0 + min(24))).toBe(false);
    expect(phaseOver(f, T0 + min(25))).toBe(true);
  });

  it("pausar congela lo que queda y reanudar lo retoma desde ahí", () => {
    const f = startFocus(idlePomodoro("p", "a", 25, 5), "p", "a", T0);
    const p = pause(f, T0 + min(10));
    expect(p.running).toBe(false);
    expect(remainingMs(p, T0 + min(500))).toBe(min(15)); // en pausa no corre el reloj
    expect(phaseOver(p, T0 + min(500))).toBe(false);
    const r = resume(p, T0 + min(30));
    expect(remainingMs(r, T0 + min(35))).toBe(min(10));
  });

  it("un foco completo da el foco entero y abre el descanso; el descanso termina en reposo sin guardar nada", () => {
    const f = startFocus(idlePomodoro("p", "a", 25, 5), "p", "a", T0);
    const a = advance(f, T0 + min(25));
    expect(a.logMinutes).toBe(25);
    expect(a.state).toMatchObject({ phase: "break", running: true });
    expect(remainingMs(a.state, T0 + min(25))).toBe(min(5));
    const b = advance(a.state, T0 + min(30));
    expect(b.logMinutes).toBe(0);
    expect(b.state.phase).toBe("idle");
    expect(b.state.focusMin).toBe(25);
  });

  it("detener a mano guarda solo los minutos enteros hechos y vuelve a reposo", () => {
    const f = startFocus(idlePomodoro("p", "a", 25, 5), "p", "a", T0);
    expect(focusDoneMinutes(f, T0 + 90_000)).toBe(1);
    const s = advance(f, T0 + min(7) + 30_000, true);
    expect(s.logMinutes).toBe(7);
    expect(s.state.phase).toBe("idle");
    expect(advance(f, T0 + 20_000, true).logMinutes).toBe(0); // menos de 1 min: nada
  });

  it("soporta modo cronómetro hacia adelante (stopwatch)", () => {
    const s = idlePomodoro("p", "a", 25, 5, "stopwatch");
    const f = startFocus(s, "p", "a", T0);
    expect(remainingMs(f, T0 + min(12))).toBe(min(12));
    expect(focusDoneMinutes(f, T0 + min(12))).toBe(12);
    expect(phaseOver(f, T0 + min(100))).toBe(false);
    const fin = advance(f, T0 + min(12), true);
    expect(fin.logMinutes).toBe(12);
  });

  it("el reloj se escribe mm:ss o hh:mm:ss y no baja de cero", () => {
    expect(clock(min(25))).toBe("25:00");
    expect(clock(59_001)).toBe("01:00");
    expect(clock(-5)).toBe("00:00");
    expect(clock(3600_000)).toBe("01:00:00");
  });
});

describe("asignación desde el Mentor", () => {
  it("el tipo de trabajo y el área viajan con la fila; manda lo explícito sobre lo deducido", async () => {
    const { assignedAreaKey, inferWork, mentorAssignment } = await import("./pomodoro");
    const theory = mentorAssignment("theory", { folder: "a", title: "A", areaKey: "backend" });
    const practice = mentorAssignment("practice", { folder: "b", title: "B", areaKey: "backend" });
    const review = mentorAssignment("review", { folder: "c", title: "C", areaKey: "frontend" });
    const project = mentorAssignment("project", { folder: "project:daily:x", title: "P", areaKey: "backend" });
    const kata = mentorAssignment("practice", { folder: "manual:kata:backend:2026-10-26", title: "K", areaKey: "backend", kind: "task" });
    expect(theory).toMatchObject({ kind: "topic", work: "theory", areaKey: "backend" });
    expect(project.kind).toBe("project");
    expect(kata.kind).toBe("task");
    expect(inferWork([practice])).toBe("practice"); // sin `work` sería «theory» (un tema del plan)
    expect(inferWork([theory, review])).toBe("review"); // lo último asignado
    expect(inferWork([{ folder: "z", title: "Z" }])).toBe("theory"); // sin tipo explícito, como siempre
    expect(assignedAreaKey([theory, review])).toBe("frontend");
    expect(assignedAreaKey([{ folder: "z", title: "Z" }])).toBeNull();
  });
});

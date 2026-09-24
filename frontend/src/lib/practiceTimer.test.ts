import { describe, expect, it } from "vitest";
import { display, initialTimer, tick, type TimerSpec } from "./practiceTimer";

const run = (spec: TimerSpec, n: number) => {
  let s = initialTimer();
  let alarms = 0;
  for (let i = 0; i < n; i++) {
    const r = tick(spec, s);
    s = r.state;
    if (r.alarm) alarms++;
  }
  return { s, alarms };
};

describe("practice timer", () => {
  it("counts down once and then shows extra time", () => {
    const spec: TimerSpec = { kind: "countdown", seconds: 3, break_seconds: 0 };
    const { s, alarms } = run(spec, 5);
    expect(alarms).toBe(1);
    expect(display(spec, s)).toEqual({ text: "+00:02", label: "Tiempo extra", over: true });
    expect(s.workElapsed).toBe(5);
  });

  it("pomodoro breaks do not count as work", () => {
    const spec: TimerSpec = { kind: "pomodoro", seconds: 4, break_seconds: 2 };
    const { s, alarms } = run(spec, 7);
    expect(alarms).toBe(1);
    expect(s.phase).toBe("work");
    expect(s.workElapsed).toBe(5);
  });

  it("stopwatch", () => {
    const spec: TimerSpec = { kind: "stopwatch", seconds: 0, break_seconds: 0 };
    expect(display(spec, run(spec, 65).s).text).toBe("01:05");
  });
});

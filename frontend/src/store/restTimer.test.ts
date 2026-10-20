import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRestSeconds, useRestTimer } from "./restTimer";

describe("restTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRestTimer.getState().stop();
  });

  afterEach(() => {
    useRestTimer.getState().stop();
    vi.useRealTimers();
  });

  describe("parseRestSeconds", () => {
    it("parses seconds format", () => {
      expect(parseRestSeconds("90s")).toBe(90);
      expect(parseRestSeconds("60 s")).toBe(60);
      expect(parseRestSeconds("120")).toBe(120);
    });

    it("parses range format taking higher bound for recovery", () => {
      expect(parseRestSeconds("60-90s")).toBe(90);
      expect(parseRestSeconds("90-120")).toBe(120);
    });

    it("parses minutes format", () => {
      expect(parseRestSeconds("2m")).toBe(120);
      expect(parseRestSeconds("1.5m")).toBe(90);
      expect(parseRestSeconds("2 min")).toBe(120);
    });

    it("parses MM:SS colon format", () => {
      expect(parseRestSeconds("1:30")).toBe(90);
      expect(parseRestSeconds("2:00")).toBe(120);
    });

    it("falls back to 90 seconds on empty or invalid input", () => {
      expect(parseRestSeconds("")).toBe(90);
      expect(parseRestSeconds("desconocido")).toBe(90);
    });
  });

  describe("useRestTimer store", () => {
    it("starts timer with exercise name and ticks countdown", () => {
      const store = useRestTimer.getState();
      store.start("Press de banca", 60);

      expect(useRestTimer.getState().active).toBe(true);
      expect(useRestTimer.getState().running).toBe(true);
      expect(useRestTimer.getState().exerciseName).toBe("Press de banca");
      expect(useRestTimer.getState().remainingSeconds).toBe(60);

      vi.advanceTimersByTime(5000);
      expect(useRestTimer.getState().remainingSeconds).toBe(55);
    });

    it("pauses and resumes countdown", () => {
      const store = useRestTimer.getState();
      store.start("Sentadillas", 60);

      vi.advanceTimersByTime(10000);
      expect(useRestTimer.getState().remainingSeconds).toBe(50);

      store.pause();
      expect(useRestTimer.getState().running).toBe(false);

      vi.advanceTimersByTime(5000);
      expect(useRestTimer.getState().remainingSeconds).toBe(50); // Did not tick while paused

      store.resume();
      expect(useRestTimer.getState().running).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(useRestTimer.getState().remainingSeconds).toBe(45);
    });

    it("adds seconds to the timer", () => {
      const store = useRestTimer.getState();
      store.start("Dominadas", 40);

      store.addSeconds(30);
      expect(useRestTimer.getState().remainingSeconds).toBe(70);
      expect(useRestTimer.getState().totalSeconds).toBe(70);
    });

    it("completes timer when countdown reaches 0 and fires onComplete", () => {
      const onComplete = vi.fn();
      const store = useRestTimer.getState();
      store.start("Peso muerto", 10, onComplete);

      vi.advanceTimersByTime(10000);
      expect(useRestTimer.getState().remainingSeconds).toBe(0);
      expect(useRestTimer.getState().running).toBe(false);
      expect(useRestTimer.getState().completed).toBe(true);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("completes immediately when completeNow is triggered", () => {
      const onComplete = vi.fn();
      const store = useRestTimer.getState();
      store.start("Plancha", 60, onComplete);

      store.completeNow();
      expect(useRestTimer.getState().remainingSeconds).toBe(0);
      expect(useRestTimer.getState().completed).toBe(true);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("stops and resets timer cleanly", () => {
      const store = useRestTimer.getState();
      store.start("Remo", 45);
      store.stop();

      expect(useRestTimer.getState().active).toBe(false);
      expect(useRestTimer.getState().running).toBe(false);
      expect(useRestTimer.getState().remainingSeconds).toBe(0);
    });

    it("toggles sound preference", () => {
      const store = useRestTimer.getState();
      expect(useRestTimer.getState().sound).toBe(true);
      store.toggleSound();
      expect(useRestTimer.getState().sound).toBe(false);
      store.toggleSound();
      expect(useRestTimer.getState().sound).toBe(true);
    });
  });
});

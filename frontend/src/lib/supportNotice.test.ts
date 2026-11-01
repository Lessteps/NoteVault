import { describe, expect, it } from "vitest";
import { REMIND_EVERY_DAYS, SUPPORT_KEY, readSupportState, shouldShowSupportNotice, writeSupportState } from "./supportNotice";

const DAY = 86_400_000;

describe("supportNotice", () => {
  it("sale la primera vez", () => {
    expect(shouldShowSupportNotice({}, Date.now())).toBe(true);
  });

  it("no vuelve a salir hasta pasadas dos semanas", () => {
    const now = 1_000 * DAY;
    expect(shouldShowSupportNotice({ lastShown: now - (REMIND_EVERY_DAYS - 1) * DAY }, now)).toBe(false);
    expect(shouldShowSupportNotice({ lastShown: now - REMIND_EVERY_DAYS * DAY }, now)).toBe(true);
  });

  it("«No volver a mostrar» lo apaga para siempre", () => {
    expect(shouldShowSupportNotice({ never: true, lastShown: 0 }, 9_999 * DAY)).toBe(false);
  });

  it("guarda y lee su estado; un valor roto cuenta como vacío", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    writeSupportState({ lastShown: 5, never: false }, storage);
    expect(readSupportState(storage)).toEqual({ lastShown: 5, never: false });
    mem.set(SUPPORT_KEY, "{no es json");
    expect(readSupportState(storage)).toEqual({});
  });

  it("sin almacenamiento no revienta", () => {
    expect(readSupportState(null)).toEqual({});
    expect(() => writeSupportState({ never: true }, null)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  addSubtask, formatRepeat, monthGrid, parseRepeat, parseSubtasks, removeSubtask, setSubtask,
} from "./tasks";

describe("subtasks", () => {
  const body = "Intro\n- [ ] leer\n- [x] resumir\nfin";

  it("parses checklist lines with their line index", () => {
    expect(parseSubtasks(body)).toEqual([
      { line: 1, title: "leer", done: false },
      { line: 2, title: "resumir", done: true },
    ]);
  });

  it("toggles, removes and appends after the last subtask", () => {
    expect(setSubtask(body, 1, true)).toBe("Intro\n- [x] leer\n- [x] resumir\nfin");
    expect(removeSubtask(body, 2)).toBe("Intro\n- [ ] leer\nfin");
    expect(removeSubtask(body, 0)).toBe(body);
    expect(addSubtask(body, "citar\nfuentes")).toBe("Intro\n- [ ] leer\n- [x] resumir\n- [ ] citar fuentes\nfin");
    expect(addSubtask("", "uno")).toBe("- [ ] uno");
  });
});

describe("repeat rules (same strings as core/recurrence.py)", () => {
  it.each([
    ["", "none", ""],
    ["daily", "daily", "daily"],
    ["weekly:0,1,2,3,4", "workdays", "weekly:0,1,2,3,4"],
    ["weekly:2,0", "weekly", "weekly:0,2"],
    ["every:3", "every", "every:3"],
    ["monthly:15,1", "monthly", "monthly:1,15"],
    ["weekly:", "none", ""],
    ["garbage", "none", ""],
  ])("%s -> %s", (input, kind, back) => {
    const r = parseRepeat(input);
    expect(r.kind).toBe(kind);
    expect(formatRepeat(r)).toBe(back);
  });
});

describe("month grid", () => {
  it("is 6 Monday-first weeks", () => {
    const g = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(g).toHaveLength(42);
    expect(g[0]!.getDay()).toBe(1);
    expect(g[1]!.getDate()).toBe(1);
  });
});

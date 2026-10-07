import { describe, expect, it } from "vitest";
import * as core from "../core/practice/practiceLinks";
import * as ui from "./practiceLinks";

describe("practiceLinks mirror", () => {
  const cases = [
    "kata:daily", "KATA:Daily#week=3", "kata:daily#streak=30", "kata:daily#week=9", "kata:weekly", "project:weekly",
    "project:monthly#Backend", "project:weekly#cobol", "project:folder:my%2C app", "project:folder:a/b/", "  ", "nada",
  ];
  it("parses like core", () => {
    for (const c of cases) expect(ui.parsePracticeLink(c)).toEqual(core.parsePracticeLink(c));
  });
  it("formats and labels like core", () => {
    for (const c of cases) {
      const l = core.parsePracticeLink(c);
      if (!l) continue;
      expect(ui.formatPracticeLink(l)).toBe(core.formatPracticeLink(l));
      expect(ui.practiceLinkLabel(l)).toBe(core.practiceLinkLabel(l));
    }
  });
});

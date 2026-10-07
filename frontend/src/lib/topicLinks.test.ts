import { describe, expect, it } from "vitest";
import * as core from "../core/practice/topicLinks";
import * as ui from "./topicLinks";

describe("topicLinks mirror", () => {
  const cases = ["M/alg", "M/alg#solve+prove", "Prog/C%23%2C x/100%25#solve", "  ", "/a\\b/#Solve+bad skill"];
  it("parses like core", () => {
    for (const c of cases) expect(ui.parseTopicLink(c)).toEqual(core.parseTopicLink(c));
  });
  it("formats like core", () => {
    for (const l of [{ topic: "A, B/C#", skills: ["solve", "prove"] }, { topic: "A/B", skills: [] }]) {
      expect(ui.formatTopicLink(l)).toBe(core.formatTopicLink(l));
    }
  });
});

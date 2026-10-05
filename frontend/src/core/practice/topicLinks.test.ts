import { describe, expect, it } from "vitest";
import type { TopicProgress } from "./topic";
import { formatTopicLink, normalizeTopicLinks, parseTopicLink, topicLinkProgress } from "./topicLinks";

function topic(
  title: string,
  skills: Record<string, boolean>,
  opts: { exam?: "required" | "optional" | "none"; examPassed?: boolean } = {},
): TopicProgress {
  const exam = opts.exam ?? "required";
  return {
    topic: { type: "topic", subject: "mathematics", title, skills: Object.keys(skills), mastery: { min_per_skill: 6, target_difficulty: 3, exam } },
    skills: Object.fromEntries(
      Object.entries(skills).map(([id, mastered]) => [id, { skill: id, mastered, consolidated: mastered } as never]),
    ),
    examPassed: Boolean(opts.examPassed),
    examScore: null,
    isComplete: false,
    completenessPct: 0,
    theoryNotesCount: 0,
    exerciseNotesCount: 0,
  };
}

describe("topic link strings", () => {
  it("round-trips folder and skills, escaping , # and %", () => {
    const s = formatTopicLink({ topic: "Prog/C#, básico/100%", skills: ["solve", "prove"] });
    expect(s).toBe("Prog/C%23%2C básico/100%25#solve+prove");
    expect(parseTopicLink(s)).toEqual({ topic: "Prog/C#, básico/100%", skills: ["solve", "prove"] });
    expect(parseTopicLink("Mates/Álgebra")).toEqual({ topic: "Mates/Álgebra", skills: [] });
    expect(parseTopicLink("  ")).toBeNull();
  });

  it("normalizes: drops blanks, dedupes, cleans skills", () => {
    expect(normalizeTopicLinks(["A/B", "A/B", "", "C#Solve+solve+bad skill"])).toEqual(["A/B", "C#solve"]);
  });
});

describe("topicLinkProgress", () => {
  const topics: Record<string, TopicProgress> = {
    "M/alg": topic("Álgebra", { solve: true, prove: false }, { examPassed: true }),
    "M/geo": topic("Geometría", { solve: true, prove: true }, { examPassed: true }),
    "M/noexam": topic("Sin examen", { solve: true }, { exam: "none" }),
    "M/lib": topic("Examen pendiente", { solve: true }, { examPassed: false }),
  };
  const lookup = (f: string) => topics[f] ?? null;

  it("whole topic: needs every skill (and the exam when required)", () => {
    const r = topicLinkProgress(["M/geo"], lookup);
    expect(r).toMatchObject({ done: true, pct: 100, missing: [], broken: [] });

    const p = topicLinkProgress(["M/alg"], lookup);
    expect(p.done).toBe(false);
    expect(p.missing).toEqual([{ topic: "M/alg", skill: "prove", reason: "not_mastered" }]);
    expect(p.pct).toBe(67); // solve + exam of 3 units

    const e = topicLinkProgress(["M/lib"], lookup);
    expect(e.done).toBe(false);
    expect(e.missing).toEqual([{ topic: "M/lib", skill: "exam", reason: "exam" }]);
    expect(topicLinkProgress(["M/noexam"], lookup).done).toBe(true);
  });

  it("scoped skills: only those, and no exam", () => {
    expect(topicLinkProgress(["M/alg#solve"], lookup)).toMatchObject({ done: true, pct: 100 });
    const r = topicLinkProgress(["M/alg#solve+prove"], lookup);
    expect(r).toMatchObject({ done: false, pct: 50 });
    expect(r.links[0]).toMatchObject({ skills: ["solve", "prove"], pct: 50, done: false });
    expect(topicLinkProgress(["M/lib#solve"], lookup).done).toBe(true);
    expect(topicLinkProgress(["M/geo#nope"], lookup).missing).toEqual([{ topic: "M/geo", skill: "nope", reason: "unknown_skill" }]);
  });

  it("missing topic is a broken link, never throws", () => {
    const r = topicLinkProgress(["M/gone", "M/geo"], lookup);
    expect(r.done).toBe(false);
    expect(r.broken).toEqual(["M/gone"]);
    expect(r.missing).toEqual([{ topic: "M/gone", skill: "*", reason: "broken" }]);
    expect(r.links[0]).toMatchObject({ broken: true, done: false, pct: 0 });
    expect(r.links[1]!.done).toBe(true);
  });

  it("several topics: done only when all are; pct pools units", () => {
    expect(topicLinkProgress(["M/geo", "M/noexam"], lookup)).toMatchObject({ done: true, pct: 100 });
    const r = topicLinkProgress(["M/geo", "M/alg#prove"], lookup);
    expect(r.done).toBe(false);
    expect(r.pct).toBe(75); // geo 3/3 + alg#prove 0/1
  });

  it("no links: not done", () => {
    expect(topicLinkProgress([], lookup)).toMatchObject({ done: false, pct: 0, links: [] });
  });
});

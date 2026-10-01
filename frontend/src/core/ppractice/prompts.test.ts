import { describe, expect, it } from "vitest";
import { clientForFocus, finalMessages, ideasMessages, parseDefenseGrade, parseFinal, parseIdeas, parsePlan, parsePostmortem, parseReview, planFocuses, planMessages, reviewMessages, specMessages } from "./prompts";

describe("focus rotation", () => {
  it("starts from the learner's weakest focus and never repeats the previous one", () => {
    const f = planFocuses(6, "databases", ["backend"]);
    expect(f[0]).toBe("databases");
    for (let i = 1; i < f.length; i++) expect(f[i]).not.toBe(f[i - 1]);
  });

  it("covers every focus before repeating any, and avoids the last used", () => {
    const f = planFocuses(6, null, ["frontend"]);
    expect(new Set(f).size).toBe(6);
    expect(f[0]).not.toBe("frontend");
  });

  it("does not start with the weakest focus if it was the last one done", () => {
    expect(planFocuses(1, "backend", ["backend"])[0]).not.toBe("backend");
  });

  it("ties the client to the focus", () => {
    expect(clientForFocus("desktop")).toBe("desktop");
    expect(clientForFocus("mobile")).toBe("mobile");
    expect(clientForFocus("databases")).toBe("web");
  });
});

describe("prompts carry the rules", () => {
  const spec = { skill: "SKILL TEXT", profile: "Recurring weaknesses: x", focus: "backend" as const, client: "web" as const, idea: "A link shortener", topics: ["4.3 REST API design"], previous: ["Old project"] };

  it("every build prompt states the full-stack rule, the size limit and the weakness profile", () => {
    for (const m of [specMessages(spec), ideasMessages({ skill: "S", profile: "P", previous: [] }), planMessages({ skill: "S", profile: "P", focuses: ["backend", "mobile"], previous: [] })]) {
      const text = m.map((x) => x.content).join("\n");
      expect(text).toContain("FULL STACK");
      expect(text).toContain("database, a backend and a client are mandatory");
      expect(text).toContain("Automation is an optional extra");
    }
    const text = specMessages(spec).map((x) => x.content).join("\n");
    expect(text).toContain("Atomic Design");
    expect(text).toContain("Recurring weaknesses: x");
    expect(text).toContain("4.3 REST API design");
    expect(text).toContain("SKILL TEXT");
  });

  it("a rejected spec is regenerated with the exact reasons", () => {
    const text = specMessages({ ...spec, fix: ["database: the layer is MANDATORY every week; describe it."] }).map((x) => x.content).join("\n");
    expect(text).toContain("REJECTED");
    expect(text).toContain("database: the layer is MANDATORY");
  });

  it("the plan prompt fixes the focus of every week", () => {
    const text = planMessages({ skill: "", profile: "", focuses: ["databases", "desktop"], previous: [] }).map((x) => x.content).join("\n");
    expect(text).toContain("week 1 = databases (client web)");
    expect(text).toContain("week 2 = desktop (client desktop)");
  });

  it("the client review demands architecture, patterns and Atomic Design; the backend one the layers", () => {
    const base = { skill: "", spec: "S", criteria: ["c"], focusCriteria: [], files: "F", checks: "C", profile: "" };
    expect(reviewMessages({ ...base, layer: "client" })[0]!.content).toContain("ATOMIC DESIGN");
    expect(reviewMessages({ ...base, layer: "backend" })[0]!.content).toContain("layered architecture");
    expect(reviewMessages({ ...base, layer: "database" })[0]!.content).toContain("index");
  });

  it("the closing prompt asks for six questions about the learner's own decisions", () => {
    const text = finalMessages("spec", [], [], "").map((x) => x.content).join("\n");
    expect(text).toContain("6 DEFENCE questions");
    expect(text).toContain("OWN decisions");
  });
});

describe("parsing what the model returns", () => {
  it("reads JSON whether it is fenced or surrounded by prose", () => {
    const ideas = '{"ideas":[{"title":"Clipboard history","problem":"Keep the last 50 copies","client":"desktop","focus":"desktop","hours":9,"why":"w"}]}';
    expect(parseIdeas("```json\n" + ideas + "\n```")[0]!.title).toBe("Clipboard history");
    expect(parseIdeas("Here you go: " + ideas + " Enjoy")[0]!.focus).toBe("desktop");
  });

  it("rejects a reply with no JSON or no usable content", () => {
    expect(() => parseIdeas("no json here")).toThrow(/did not return JSON/);
    expect(() => parseIdeas("{ not json }")).toThrow(/invalid JSON/);
    expect(() => parseIdeas('{"ideas":[]}')).toThrow(/no usable ideas/);
  });

  it("forces the client the focus implies", () => {
    const i = parseIdeas('{"ideas":[{"title":"T","problem":"P","client":"web","focus":"mobile"}]}')[0]!;
    expect(i.client).toBe("mobile");
  });

  it("parses a plan, a layer review, the final report, the defence grade and a postmortem", () => {
    expect(parsePlan('{"weeks":[{"week":1,"title":"A","problem":"p","focus":"backend"},{"week":2,"title":"B","problem":"p","focus":"desktop"}]}').map((w) => w.client)).toEqual(["web", "desktop"]);
    const r = parseReview('{"verdict":"fail","criteria":[{"criterion":"c","met":false,"evidence":"e"}],"issues":[{"severity":"high","file":"a.py","line":3,"problem":"p","why":"w","fix":"f"}]}', "backend");
    expect(r).toMatchObject({ layer: "backend", verdict: "fail" });
    expect(r.issues[0]).toMatchObject({ severity: "high", line: 3 });
    const f = parseFinal('{"functional":true,"score":140,"summary":"s","mustFix":["x"],"questions":[{"question":"q1"},{"question":"q2"},{"question":"q3"}]}');
    expect(f.score).toBe(100);
    expect(f.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(() => parseFinal('{"questions":[{"question":"only"}]}')).toThrow(/too few defence questions/);
    expect(parseDefenseGrade('{"score":55,"items":[{"id":"q1","verdict":"weak","feedback":"f"}],"gaps":["g"]}').items[0]!.verdict).toBe("weak");
    const pm = parsePostmortem('{"score":70,"weaknesses":[{"label":"No validation","layer":"backend","evidence":[{"file":"a.py","line":4,"note":"n"}]}],"strengths":["s"],"coveredLayers":["backend"]}', { kind: "project", project: "P" });
    expect(pm).toMatchObject({ kind: "project", project: "P", score: 70 });
    expect(pm.weaknesses[0]!.evidence![0]).toMatchObject({ file: "a.py", line: 4 });
  });
});

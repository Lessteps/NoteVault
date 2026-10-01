import { describe, expect, it } from "vitest";
import { validSpecRaw } from "./fixtures";
import { isCheckable, normalizeSpec, renderSpecMarkdown, sanitizeFolderName, validateSpec } from "./spec";

const spec = () => normalizeSpec(validSpecRaw());
const problems = (mutate: (raw: any) => void, known?: Set<string>) => {
  const raw: any = validSpecRaw();
  mutate(raw);
  return validateSpec(normalizeSpec(raw), known);
};

describe("project specification rules", () => {
  it("accepts a complete full-stack specification", () => {
    expect(validateSpec(spec())).toEqual([]);
  });

  it("rejects a project with no database layer", () => {
    const p = problems((r) => { r.database = {}; });
    expect(p.join("\n")).toMatch(/database: the layer is MANDATORY/);
    expect(p.join("\n")).toMatch(/database: at least 3 acceptance criteria/);
  });

  it("rejects a client without a backend and a backend without criteria", () => {
    expect(problems((r) => { r.backend = {}; }).join("\n")).toMatch(/backend: the layer is MANDATORY/);
    expect(problems((r) => { r.backend.criteria = ["The endpoint answers 200 when it works", "x"]; }).join("\n")).toMatch(/backend: at least 3 acceptance criteria/);
  });

  it("requires architecture, design patterns and Atomic Design in the client", () => {
    expect(problems((r) => { r.clientLayer.patterns = []; }).join("\n")).toMatch(/design pattern/);
    expect(problems((r) => { r.clientLayer.atomic = { atoms: ["Button"], molecules: [], organisms: [] }; }).join("\n")).toMatch(/Atomic Design is required/);
    expect(problems((r) => { r.clientLayer.architecture = []; }).join("\n")).toMatch(/client: describe its architecture/);
    expect(problems((r) => { r.backend.architecture = ["routes"]; }).join("\n")).toMatch(/layers of its architecture/);
  });

  it("refuses criteria that cannot be checked", () => {
    expect(isCheckable("clean code")).toBe(false);
    expect(isCheckable("Looks good and well structured overall")).toBe(false);
    expect(isCheckable("POST /links with an invalid URL answers 422")).toBe(true);
    expect(problems((r) => { r.backend.criteria[0] = "Well designed and clean architecture throughout"; }).join("\n")).toMatch(/not checkable/);
  });

  it("keeps the project a thin vertical slice", () => {
    expect(problems((r) => { r.database.tables = ["a", "b", "c", "d"]; }).join("\n")).toMatch(/1 to 3 tables/);
    expect(problems((r) => { r.backend.endpoints = ["GET /a"]; }).join("\n")).toMatch(/2 to 5 endpoints/);
    expect(problems((r) => { r.clientLayer.screens = []; }).join("\n")).toMatch(/1 to 3 screens/);
    expect(problems((r) => { r.hours = 40; }).join("\n")).toMatch(/4 to 16 hours/);
  });

  it("treats automation as an extra: required only for the automation focus, never a replacement", () => {
    expect(problems((r) => { r.focus = "automation"; }).join("\n")).toMatch(/needs an automation section/);
    expect(
      problems((r) => {
        r.focus = "automation";
        r.automation = { summary: "A nightly job imports data", criteria: ["Running the job twice inserts no duplicates", "A failing source is logged and the job continues"] };
      }),
    ).toEqual([]);
    // an automation section does not excuse a missing layer
    expect(
      problems((r) => {
        r.automation = { summary: "A nightly job", criteria: ["Running it twice inserts no duplicates", "Failures are logged to a file"] };
        r.database = {};
      }).join("\n"),
    ).toMatch(/database: the layer is MANDATORY/);
  });

  it("ties desktop and mobile focuses to their client", () => {
    expect(problems((r) => { r.focus = "desktop"; }).join("\n")).toMatch(/focus desktop requires client = desktop/);
    expect(problems((r) => { r.focus = "mobile"; r.client = "web"; }).join("\n")).toMatch(/focus mobile requires client = mobile/);
  });

  it("checks the rubric, the defence questions and that linked topics exist", () => {
    expect(problems((r) => { r.rubric[0].weight = 10; }).join("\n")).toMatch(/add up to 100/);
    expect(problems((r) => { r.defenseQuestions = ["only one?"]; }).join("\n")).toMatch(/at least 4 questions/);
    const known = new Set(["4.3 REST API design", "4.10 Errors and error contracts", "6.2 Table design"]);
    expect(problems(() => undefined, known)).toEqual([]);
    expect(problems((r) => { r.topics[0] = "9.99 Invented topic"; }, known).join("\n")).toMatch(/not syllabus topics/);
  });

  it("sanitises the folder name that pp_construct creates", () => {
    expect(sanitizeFolderName('A/B: "tool"?')).toBe("A B tool");
    expect(sanitizeFolderName("..hidden")).toBe("hidden");
    expect(sanitizeFolderName("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it("renders SPEC.md with every layer, the atomic hierarchy, the rubric and checkable boxes", () => {
    const md = renderSpecMarkdown(spec(), { created: "2026-10-01", week: 1 });
    for (const h of ["## Database (mandatory)", "## Backend (mandatory)", "## Client (mandatory)", "## Focus: backend", "## Rubric", "## Defense questions"]) expect(md).toContain(h);
    expect(md).toContain("- Atoms: Button, Input");
    expect(md).toContain("- [ ] POST /links with an invalid URL answers 422 with the error contract");
    expect(md).toContain("[[4.3 REST API design]]");
    expect(md).not.toContain("## Automation");
  });
});

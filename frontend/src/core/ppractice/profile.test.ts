import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPostmortem, emptyProfile, loadProfile, profileSummary, saveProfile, suggestFocus, topWeaknesses, type Postmortem } from "./profile";

const pm = (over: Partial<Postmortem> = {}): Postmortem => ({
  kind: "project",
  project: "Link shortener",
  score: 70,
  summary: "Works, validation gaps.",
  coveredLayers: ["backend", "database", "client"],
  weaknesses: [{ label: "No input validation on update endpoints", layer: "backend", evidence: [{ file: "app/routes.py", line: 41, note: "PUT trusts the body" }] }],
  strengths: ["Clear repository layer"],
  styleNotes: ["Short functions, descriptive names"],
  ...over,
});

describe("learner profile", () => {
  it("records a weakness with evidence and a history entry", () => {
    const p = applyPostmortem(emptyProfile(), pm(), "2026-10-01");
    expect(p.weaknesses).toHaveLength(1);
    expect(p.weaknesses[0]).toMatchObject({ layer: "backend", count: 1, status: "open", cleanStreak: 0 });
    expect(p.weaknesses[0]!.evidence[0]).toMatchObject({ file: "app/routes.py", line: 41 });
    expect(p.history).toHaveLength(1);
    expect(p.strengths[0]!.label).toBe("Clear repository layer");
    expect(p.style).toEqual(["Short functions, descriptive names"]);
  });

  it("merges the same mistake instead of duplicating it, and counts repeats", () => {
    let p = applyPostmortem(emptyProfile(), pm(), "2026-10-01");
    p = applyPostmortem(p, pm({ weaknesses: [{ label: "no input validation on UPDATE endpoints!", layer: "backend" }] }), "2026-10-08");
    expect(p.weaknesses).toHaveLength(1);
    expect(p.weaknesses[0]!.count).toBe(2);
  });

  it("moves a weakness to improving, then resolved, only when its layer was exercised and the mistake did not return", () => {
    let p = applyPostmortem(emptyProfile(), pm(), "2026-10-01");
    // a project that did not touch the backend proves nothing about it
    p = applyPostmortem(p, pm({ weaknesses: [], coveredLayers: ["client"] }), "2026-10-08");
    expect(p.weaknesses[0]).toMatchObject({ status: "open", cleanStreak: 0 });
    p = applyPostmortem(p, pm({ weaknesses: [], coveredLayers: ["backend"] }), "2026-10-15");
    expect(p.weaknesses[0]).toMatchObject({ status: "improving", cleanStreak: 1 });
    p = applyPostmortem(p, pm({ weaknesses: [], coveredLayers: ["backend"] }), "2026-10-22");
    expect(p.weaknesses[0]!.status).toBe("resolved");
    // and it reopens if it comes back
    p = applyPostmortem(p, pm(), "2026-10-29");
    expect(p.weaknesses[0]).toMatchObject({ status: "open", count: 2, cleanStreak: 0 });
  });

  it("ranks open weaknesses by repeats and ignores resolved ones", () => {
    let p = emptyProfile();
    p = applyPostmortem(p, pm({ weaknesses: [{ label: "A", layer: "database" }, { label: "B", layer: "backend" }] }), "2026-10-01");
    p = applyPostmortem(p, pm({ weaknesses: [{ label: "B", layer: "backend" }] }), "2026-10-08");
    const now = Date.parse("2026-10-09");
    expect(topWeaknesses(p, 5, now).map((w) => w.label)).toEqual(["B", "A"]);
    expect(suggestFocus(p, now)).toBe("backend");
  });

  it("suggests no focus when the profile says nothing about a layer", () => {
    expect(suggestFocus(emptyProfile())).toBeNull();
    expect(suggestFocus(applyPostmortem(emptyProfile(), pm({ weaknesses: [{ label: "Skips tests", layer: "tests" }] }), "2026-10-01"))).toBeNull();
  });

  it("writes a short summary for the next pp_build prompt, empty when there is no history", () => {
    expect(profileSummary(emptyProfile())).toBe("");
    const p = applyPostmortem(emptyProfile(), pm(), "2026-10-01");
    const text = profileSummary(p, 1400, Date.parse("2026-10-02"));
    expect(text).toContain("Recurring weaknesses");
    expect(text).toContain("[backend] No input validation on update endpoints");
    expect(text).toContain("Strengths: Clear repository layer");
    expect(profileSummary(p, 60).length).toBeLessThanOrEqual(60);
  });

  it("persists in the vault and survives a missing or broken file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_pp_"));
    expect(loadProfile(root)).toEqual(emptyProfile());
    saveProfile(root, applyPostmortem(emptyProfile(), pm(), "2026-10-01"));
    expect(loadProfile(root).weaknesses).toHaveLength(1);
    fs.writeFileSync(path.join(root, ".notevault", "estudio", "pp", "profile.json"), "{ not json", "utf-8");
    expect(loadProfile(root)).toEqual(emptyProfile());
    fs.rmSync(root, { recursive: true, force: true });
  });
});

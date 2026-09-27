// Regression: the dashboard must find the vault's topics. It used to hand
// absolute folders to a lookup that only accepts vault-relative ones, so every
// area overview came out empty (0 topics) on a fully populated vault.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { clearStudySnapshotCache, studyApi } from "./study.js";

const MANIFEST = `---
type: topic
subject: mathematics
title: "1.1 Números"
skills: [solve, true_false]
mastery:
  min_per_skill: 6
  target_difficulty: 2
---
`;

const EXERCISE = `---
type: exercise
title: "Sumar enteros"
skill: solve
difficulty: 2
---
#### Enunciado
Calcula $1+1$.
`;

describe("study_topic_dashboard", () => {
  let tmp: string;
  let api: ReturnType<typeof studyApi>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_dash_"));
    const topic = path.join(tmp, "Matemáticas", "1 Aritmética", "1.1 Números");
    fs.mkdirSync(path.join(topic, "Ejercicios"), { recursive: true });
    fs.writeFileSync(path.join(topic, ".practica.md"), MANIFEST, "utf-8");
    fs.writeFileSync(path.join(topic, "1.1 Números.md"), "---\ntype: concept\n---\n\n# Números\n", "utf-8");
    fs.writeFileSync(path.join(topic, "Ejercicios", "e1.md"), EXERCISE, "utf-8");
    clearStudySnapshotCache();
    api = studyApi(new AppState(tmp) as never);
  });

  it("finds the topic of the vault and reports vault-relative paths", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await (api as any).study_topic_dashboard();
    expect(data.topics).toHaveLength(1);
    const [topic] = data.topics;
    expect(topic.folder).toBe("Matemáticas/1 Aritmética/1.1 Números");
    expect(topic.area).toBe("1 Aritmética");
    expect(topic.subject).toBe("mathematics");
    expect(data.areas).toEqual(["1 Aritmética"]);
    expect(typeof topic.progress.completenessPct).toBe("number");
    expect(topic.manifest.title).toBe("1.1 Números");
  });

  it("filters by subject", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const none: any = await (api as any).study_topic_dashboard("history");
    expect(none.topics).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maths: any = await (api as any).study_topic_dashboard("mathematics");
    expect(maths.topics).toHaveLength(1);
  });
});

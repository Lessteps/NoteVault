import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as aiClient from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { parseProof } from "../../core/practice/ladder.js";
import { AppConfig } from "../appConfig.js";
import { AppState } from "../appState.js";
import { ladderApi } from "./ladder.js";

const ROOT = path.resolve(__dirname, "../../../..");
const THEOREM_FILE = path.join(
  ROOT,
  "docs",
  "knowledge_base",
  "examples",
  "Matemáticas",
  "1 Lógica y demostración",
  "1.10 Inducción matemática",
  "Demostraciones",
  "1.10-T01 Suma de los primeros n naturales.md",
);

describe("ladderApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof ladderApi>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ladder_web_"));
    fs.copyFileSync(THEOREM_FILE, path.join(tmpDir, "T.md"));
    fs.writeFileSync(path.join(tmpDir, "Plain.md"), "# x\n", "utf-8");

    app = new AppState(tmpDir);
    api = ladderApi(app);

    vi.spyOn(AppConfig, "get_ai_config").mockReturnValue({
      provider: "lmstudio",
      base_url: "http://127.0.0.1:9/v1",
      model: "m",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("test_load_and_levels", () => {
    const data = api.ladder_load("T.md");
    expect(data.state.current).toBe(1);
    expect(data.steps).toBeGreaterThanOrEqual(2);
    expect(() => api.ladder_load("Plain.md")).toThrow(ApiError);
    expect(() => api.ladder_level("T.md", 9)).toThrow(ApiError);
  });

  async function passL1() {
    const reply = JSON.stringify({ score: 90, rubric: [true, true, true] });
    vi.spyOn(aiClient, "sendChat").mockResolvedValueOnce(reply);
    await api.ladder_grade("T.md", 1, { fields: ["Inducción."] });
  }

  it("test_hidden_steps_are_not_sent", async () => {
    await passL1();
    const n = api.ladder_load("T.md").steps;
    const order = Array.from({ length: n }, (_, i) => i);
    await api.ladder_grade("T.md", 2, { order });
    const proof = parseProof(fs.readFileSync(path.join(tmpDir, "T.md"), "utf-8"));
    const lv3 = api.ladder_level("T.md", 3);
    for (const i of lv3.hidden) {
      expect(lv3.steps[i].text).toBe("");
      expect(JSON.stringify(lv3)).not.toContain(proof.steps[i]!.text);
    }
  });

  it("test_order_level_is_checked_locally_and_unlocks", async () => {
    const n = api.ladder_load("T.md").steps;
    const order = Array.from({ length: n }, (_, i) => i);

    // locked until L1 is passed
    await expect(api.ladder_grade("T.md", 2, { order })).rejects.toThrow(ApiError);

    await passL1();
    const out = await api.ladder_grade("T.md", 2, { order, fields: [] }, 30);
    expect(out.passed).toBe(true);
    expect(out.result.score).toBe(100);
    expect(api.ladder_load("T.md").state.current).toBe(3);

    await expect(api.ladder_grade("T.md", 2, { order: [0, 0] })).rejects.toThrow(ApiError);
  });

  it("test_ai_levels", async () => {
    const reply = JSON.stringify({
      score: 90,
      verdict: "correct",
      rubric: [true, true, true],
      errors: [],
      feedback: "Bien.",
      next_step: "",
      example: "",
    });
    vi.spyOn(aiClient, "sendChat").mockResolvedValueOnce(reply);
    const out = await api.ladder_grade(
      "T.md",
      1,
      { fields: ["Inducción sobre n; la idea es sumar n+1."] },
      60,
    );
    expect(out.passed).toBe(true);
    expect(out.message).toContain("L2");
    expect(api.ladder_load("T.md").state.current).toBe(2);

    await expect(api.ladder_grade("T.md", 1, { fields: [""] })).rejects.toThrow(ApiError);
  });

  it("test_handoff_and_give_up", async () => {
    const out = (await api.ladder_grade("T.md", 1, { fields: ["prueba"] }, 0, false, "handoff")) as any;
    expect(api.ladder_load("T.md").pending?.level).toBe(1);
    const reply = JSON.stringify({ score: 40, rubric: [true, false, false] });
    fs.writeFileSync(out.response_file, reply, "utf-8");
    const done = api.ladder_reply("T.md", out.request) as any;
    expect(done.passed).toBe(false);

    const g = api.ladder_give_up("T.md", 1, { fields: [""] });
    expect(g.proof).toContain("Paso");
  });
});

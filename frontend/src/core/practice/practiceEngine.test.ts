import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fraction } from "../fraction.js";
import { ERROR_CATEGORIES, StudyErrorManager } from "../studyErrorManager.js";
import { StudySRSManager } from "../studySrsManager.js";
import { formatLayout, LAYOUT } from "../vaultFormat.js";
import { PracticeAttemptStore, attemptKey } from "./attempts.js";
import {
  DEFAULT_DISCIPLINE,
  DISCIPLINES,
  disciplineFor,
  skillOf,
} from "./disciplineCatalog.js";
import * as drills from "./drills.js";
import {
  applyResult,
  recentErrors,
  recordGradeErrors,
  writeErrorDigest,
} from "./errorLog.js";
import { ExerciseNote, isPracticeFrontmatter, parseExercise } from "./exerciseNote.js";
import {
  buildGradingMessages,
  GradeError,
  GradeParseError,
  GradeResult,
  parseGradeReply,
  qualityFrom,
} from "./grading.js";
import * as handoff from "./handoff.js";
import { MODES, PRACTICE_ALIASES, modeFor } from "./modes.js";
import { parseTimer } from "./timer.js";

// Root resolves to NoteVault project root
const ROOT = path.resolve(__dirname, "../../../..");
const MATH_EXERCISES = path.join(
  ROOT,
  "docs",
  "knowledge_base",
  "examples",
  "Matem\u00e1ticas",
  "1 L\u00f3gica y demostraci\u00f3n",
  "1.10 Inducci\u00f3n matem\u00e1tica",
  "Ejercicios",
);
const SAMPLES = path.join(ROOT, "docs", "knowledge_base", "examples", "practice");

function _load(filePath: string): ExerciseNote {
  const text = fs.readFileSync(filePath, "utf-8");
  return parseExercise(text, filePath);
}

function _sample(prefix: string): ExerciseNote {
  const files = fs.readdirSync(SAMPLES).filter((f) => f.startsWith(prefix) && f.endsWith(".md"));
  if (files.length === 0) {
    throw new Error(`Sample not found with prefix: ${prefix}`);
  }
  return _load(path.join(SAMPLES, files[0]!));
}

function _result(
  score = 70,
  errors: GradeError[] = [],
  rubric = [true, false, true, true, false],
): GradeResult {
  return {
    score,
    verdict: "partial",
    rubric: [...rubric],
    errors: [...errors],
    feedback: "Bien encaminado.",
    next_step: "Revisa el paso inductivo.",
    example: "P(k+1)",
    raw: "{}",
  };
}

describe("TestModes", () => {
  it("catalogue", () => {
    expect(Object.keys(MODES).length).toBe(17);
    for (const mode of Object.values(MODES)) {
      expect(["text", "code", "short", "drill"]).toContain(mode.answer_kind);
      const spec = parseTimer(undefined, 0, mode.timer);
      expect(spec).toBeDefined();
      expect(spec.kind).not.toBe("off");
      expect(Boolean(mode.label && mode.act && mode.judge_focus && mode.subjects)).toBe(true);
    }
  });

  it("mode_for", () => {
    expect(modeFor({ mode: "debug", practice: "demostracion" }).id).toBe("debug");
    for (const [practice, modeId] of Object.entries(PRACTICE_ALIASES)) {
      expect(modeId in MODES).toBe(true);
      expect(modeFor({ practice }).id).toBe(modeId);
    }
    expect(modeFor({}).id).toBe("solve");
    expect(modeFor({ mode: "nonsense" }).id).toBe("solve");
    expect(modeFor(null as any).id).toBe("solve");
  });
});

describe("TestDisciplines", () => {
  it("catalogue", () => {
    expect(Object.keys(DISCIPLINES).length).toBe(10);
    const expectedSkills: Record<string, number> = {
      python: 15,
      javascript: 14,
      sql: 13,
      git: 9,
    };
    for (const disc of Object.values(DISCIPLINES)) {
      for (const modeId of disc.modes) {
        expect(modeId in MODES).toBe(true);
      }
      expect(Boolean(disc.framing && disc.title && disc.skills)).toBe(true);
      const codes = disc.skills.map((s) => s.code);
      const expectedCodes = Array.from({ length: codes.length }, (_, i) =>
        String(i + 1).padStart(2, "0"),
      );
      expect(codes).toEqual(expectedCodes);

      const minimum = disc.subject === "programming" ? 2 : 3;
      for (const skill of disc.skills) {
        expect(skill.anchors.length).toBeGreaterThanOrEqual(minimum);
      }
      if (disc.id in expectedSkills) {
        expect(disc.skills.length).toBe(expectedSkills[disc.id]);
      }
    }
  });

  it("training_system_titles", () => {
    expect(skillOf(DISCIPLINES["python"]!, "08")!.title).toBe("Debugging deliberado");
    expect(skillOf(DISCIPLINES["python"]!, 6)!.title.startsWith("Manejo de errores")).toBe(true);
    expect(skillOf(DISCIPLINES["sql"]!, "7")!.title.startsWith("Idempotencia")).toBe(true);
    expect(skillOf(DISCIPLINES["git"]!, "07")!.title.startsWith("Correcci\u00f3n")).toBe(true);
    expect(skillOf(DISCIPLINES["git"]!, "10")).toBeNull();
    expect(skillOf(DISCIPLINES["git"]!, "")).toBeNull();
  });

  it("discipline_for", () => {
    for (const [subject, discId] of Object.entries(DEFAULT_DISCIPLINE)) {
      expect(disciplineFor({ subject }).id).toBe(discId);
    }
    expect(disciplineFor({ subject: "programming", discipline: "sql" }).id).toBe("sql");
    expect(disciplineFor({ subject: "mathematics", mode: "drill" }).id).toBe("math_drill");
    expect(disciplineFor({ subject: "english", discipline: "bogus" }).id).toBe("english_grammar");
  });
});

describe("TestExerciseNote", () => {
  it("reference_math_exercises", () => {
    const paths = fs
      .readdirSync(MATH_EXERCISES)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => path.join(MATH_EXERCISES, f));
    expect(paths.length).toBe(7);

    for (const p of paths) {
      const ex = _load(p);
      const fmPractice = ex.frontmatter["practice"];
      expect(ex.mode).toBe(PRACTICE_ALIASES[fmPractice]);
      expect(ex.subject).toBe("mathematics");
      expect(ex.discipline).toBe("math_general");
      expect(ex.note_id.startsWith("mat.logica.induccion.e")).toBe(true);
      expect(ex.rubric.length).toBe(5);
      expect(ex.hints.length).toBeGreaterThanOrEqual(1);
      expect(ex.hints.length).toBeLessThanOrEqual(3);
      expect(Boolean(ex.statement && ex.solution)).toBe(true);
      expect(ex.typical_errors.length).toBeGreaterThanOrEqual(1);
      for (const [category, text] of ex.typical_errors) {
        expect(ERROR_CATEGORIES).toContain(category as any);
        expect(Boolean(text)).toBe(true);
      }
      expect(ex.rubric[0]!.startsWith("- [")).toBe(false);
      expect(ex.minutes).toBeGreaterThan(0);
    }
  });

  it("first_math_exercise_details", () => {
    const file = fs
      .readdirSync(MATH_EXERCISES)
      .find((f) => f.startsWith("1.10-E01") && f.endsWith(".md"))!;
    const ex = _load(path.join(MATH_EXERCISES, file));

    expect(ex.title).toBe("Suma de los primeros impares");
    expect(ex.mode).toBe("prove");
    expect(ex.hints.length).toBe(3);
    expect(ex.hints[1]!.startsWith("El t\u00e9rmino nuevo")).toBe(true);
    expect(ex.rubric[0]).toBe("Enuncia $P(n)$ expl\u00edcitamente.");
    expect(ex.typical_errors[0]![0]).toBe("procedural");
    expect(parseTimer(ex.timer, ex.minutes, MODES[ex.mode]!.timer)).toEqual({
      kind: "countdown",
      seconds: 600,
      break_seconds: 0,
    });
  });

  it("sample_notes", () => {
    const expected: Record<string, [string, string, string]> = {
      "P-DRILL-01": ["drill", "math_drill", "02"],
      "P-PY-06-E01": ["debug", "python", "06"],
      "P-SQL-07-E01": ["implement", "sql", "07"],
      "P-GIT-07-E01": ["commands", "git", "07"],
      "P-EN-GR-E01": ["rewrite", "english_grammar", "01"],
    };

    const allMd = fs.readdirSync(SAMPLES).filter((f) => f.endsWith(".md"));
    expect(allMd.length).toBe(Object.keys(expected).length);

    for (const [prefix, [mode, discipline, skill]] of Object.entries(expected)) {
      const ex = _sample(prefix);
      expect([ex.mode, ex.discipline, ex.skill]).toEqual([mode, discipline, skill]);
      expect(skillOf(DISCIPLINES[discipline]!, skill)).not.toBeNull();
      expect(DISCIPLINES[discipline]!.modes).toContain(mode);
      expect(Boolean(ex.statement)).toBe(true);
      if (mode === "drill") continue;
      expect(ex.rubric.length).toBe(5);
      expect(ex.hints.length).toBeGreaterThanOrEqual(1);
      expect(ex.hints.length).toBeLessThanOrEqual(3);
      expect(Boolean(ex.solution)).toBe(true);
      expect(Boolean(ex.typical_errors.length)).toBe(true);
      for (const [category] of ex.typical_errors) {
        expect(ERROR_CATEGORIES).toContain(category as any);
      }
    }
  });

  it("sample_specifics", () => {
    const drill = _sample("P-DRILL-01");
    expect([drill.drill, drill.items]).toEqual(["fractions", 15]);
    expect(parseTimer(drill.timer, drill.minutes, "stopwatch")).toEqual({
      kind: "countdown",
      seconds: 300,
      break_seconds: 0,
    });

    const py = _sample("P-PY-06-E01");
    expect(py.code_lang).toBe("python");
    const pyLines = py.code.split("\n");
    expect(pyLines.length).toBeGreaterThanOrEqual(25);
    expect(pyLines.length).toBeLessThanOrEqual(40);
    expect(py.code).not.toContain("```");
    expect(py.code).toContain("except Exception");
    expect(Boolean(py.mastery_signal)).toBe(true);
    expect(py.hints.length).toBe(3);

    expect(Boolean(_sample("P-SQL-07-E01").mastery_signal)).toBe(true);
    expect(Boolean(_sample("P-GIT-07-E01").mastery_signal)).toBe(true);

    const english = _sample("P-EN-GR-E01");
    expect(english.level).toBe("B1");
    expect(english.subject).toBe("english");
  });

  it("is_practice_frontmatter", () => {
    expect(isPracticeFrontmatter({ type: "exercise" })).toBe(true);
    expect(isPracticeFrontmatter({ type: " Exercise " })).toBe(true);
    expect(isPracticeFrontmatter({ type: "concept" })).toBe(false);
    expect(isPracticeFrontmatter({})).toBe(false);
    expect(isPracticeFrontmatter(null)).toBe(false);
  });

  it("aliases_bullets_fences_and_fallbacks", () => {
    const text =
      "---\ntype: exercise\nsubject: programming\nskill: 6\nassistance: nohelp\n---\n\n" +
      "# Fix the parser\n\n" +
      "## Statement\nFind the bug.\n\n" +
      "## Code\n```js\n## not a heading\nconst x = 1;\n```\n\n" +
      "## Hints\n- first hint\n  continues here\n2. second hint\n\n" +
      "## Rubric\n- [x] (2) one\n- [ ] two\n\n" +
      "## Typical errors\n- **Logical** : wrong order\n- plain bullet\n\n" +
      "## Mastery signal\nprints 1\n";

    const ex = parseExercise(text, path.join("vault", "My exercise.md"));
    expect(ex.title).toBe("Fix the parser");
    expect(ex.note_id).toBe("My exercise");
    expect(ex.skill).toBe("06");
    expect(ex.discipline).toBe("programming_logic");
    expect(ex.assistance).toBe("nohelp");
    expect([ex.difficulty, ex.minutes, ex.items]).toEqual([2, 0, 20]);
    expect(ex.code_lang).toBe("js");
    expect(ex.code).toBe("## not a heading\nconst x = 1;");
    expect(ex.hints).toEqual(["first hint\ncontinues here", "second hint"]);
    expect(ex.rubric).toEqual(["one", "two"]);
    expect(ex.typical_errors).toEqual([
      ["logical", "wrong order"],
      ["", "plain bullet"],
    ]);
    expect(ex.mastery_signal).toBe("prints 1");
  });

  it("note_without_frontmatter_or_sections", () => {
    const ex = parseExercise("just text");
    expect([ex.note_id, ex.title, ex.subject, ex.mode]).toEqual(["", "", "general", "solve"]);
    expect([ex.hints, ex.rubric, ex.path]).toEqual([[], [], null]);
  });
});

describe("TestTimer", () => {
  it("parse", () => {
    expect(parseTimer("pomodoro")).toEqual({
      kind: "pomodoro",
      seconds: 1500,
      break_seconds: 300,
    });
    for (const value of ["8m", "8 min", "8", 8, "8 minutos"]) {
      expect(parseTimer(value)).toEqual({
        kind: "countdown",
        seconds: 480,
        break_seconds: 0,
      });
    }
    expect(parseTimer("off").kind).toBe("off");
    expect(parseTimer(false).kind).toBe("off");
    expect(parseTimer("stopwatch").kind).toBe("stopwatch");
  });

  it("priority", () => {
    expect(parseTimer("10m", 30, "pomodoro").seconds).toBe(600);
    expect(parseTimer("", 30, "pomodoro")).toEqual({
      kind: "countdown",
      seconds: 1800,
      break_seconds: 0,
    });
    expect(parseTimer(null, 0, "pomodoro").kind).toBe("pomodoro");
    expect(parseTimer("garbage", 0, "15m").seconds).toBe(900);
    expect(parseTimer(null)).toEqual({
      kind: "stopwatch",
      seconds: 0,
      break_seconds: 0,
    });
    expect(parseTimer("0m", 0, "nonsense").kind).toBe("stopwatch");
  });
});

describe("TestGrading", () => {
  const REPLY = {
    score: 80,
    verdict: "partial",
    rubric: [true, true, false, true, true],
    errors: [
      {
        category: "logical",
        anchor: "",
        description: "Circular.",
        evidence: "assume P(k+1)",
        fix: "Start from P(k).",
      },
    ],
    feedback: "Casi.",
    next_step: "\u00bfQu\u00e9 supones?",
    example: "P(k) => P(k+1)",
  };

  it("messages", () => {
    const ex = _sample("P-PY-06-E01");
    const errors = Array.from({ length: 20 }, () => ({
      category: "logical",
      anchor: "catches the wrong exception type",
      description_en: "Caught ValueError only.",
      repeat_count: 2,
    }));
    const messages = buildGradingMessages(ex, "my answer", {
      hints_used: 1,
      seconds: 125,
      solution_seen: false,
      recent_errors: errors,
    });
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    const system = messages[0]!.content;
    const user = messages[1]!.content;
    expect(system).toContain("never execute");
    expect(system).toContain("except Exception swallows real bugs");
    expect(system).toContain("hypothesis");
    expect(system).toContain("automation task");
    expect(system).toContain('"verdict"');
    expect(user).toContain("my answer");
    expect(user).toContain("def handle_payment_webhook");
    expect(user).toContain("for the judge only");
    expect(user).toContain("Hints used: 1 of 3");
    expect(user).toContain("2 min 5 s");
    expect((user.match(/\[x2\] logical/g) || []).length).toBe(15);

    const english = buildGradingMessages(
      _sample("P-EN-GR-E01"),
      "x",
      { hints_used: 0, seconds: 0, solution_seen: true, recent_errors: [] },
    );
    expect(english[0]!.content).toContain("CEFR level: B1");
    expect(english[1]!.content).toContain("seen before answering: yes");
  });

  it("parse_raw_fenced_embedded", () => {
    const raw = JSON.stringify(REPLY);
    const fenced = "Here you go:\n```json\n" + raw + "\n```\nBye";
    const embedded = "Sure! " + raw + " Hope it helps {not json}";

    for (const text of [raw, fenced, embedded]) {
      const result = parseGradeReply(text, 5);
      expect(result.score).toBe(80);
      expect(result.verdict).toBe("partial");
      expect(result.rubric).toEqual([true, true, false, true, true]);
      expect(result.errors[0]).toEqual({
        category: "logical",
        anchor: "",
        description: "Circular.",
        evidence: "assume P(k+1)",
        fix: "Start from P(k).",
      });
      expect(result.raw).toBe(text);
    }
  });

  it("normalisation", () => {
    const reply = {
      score: "140",
      verdict: "Correcto",
      rubric: [1, "no"],
      errors: [{ category: "weird" }, "plain text", 7],
    };
    const result = parseGradeReply(JSON.stringify(reply), 4);
    expect([result.score, result.verdict]).toEqual([100, "correct"]);
    expect(result.rubric).toEqual([true, false, false, false]);
    expect(result.errors.map((e) => e.category)).toEqual(["conceptual", "conceptual"]);
    expect(result.errors[1]!.description).toBe("plain text");

    expect(
      parseGradeReply('{"score": -5, "rubric": [true, true, true]}', 2).rubric,
    ).toEqual([true, true]);
    expect(parseGradeReply('{"score": -5}', 0).score).toBe(0);
    expect(parseGradeReply('{"score": 55}', 0).verdict).toBe("partial");
    expect(parseGradeReply('{"score": 10}', 0).verdict).toBe("incorrect");
  });

  it("garbage", () => {
    for (const text of ["", "no json here", "[1, 2, 3]", "{broken"]) {
      expect(() => parseGradeReply(text, 5)).toThrow(GradeParseError);
    }
  });

  it("quality_table", () => {
    const table: Array<[number, number, boolean, number]> = [
      [95, 0, false, 5],
      [90, 0, false, 5],
      [89, 0, false, 4],
      [75, 0, false, 4],
      [60, 0, false, 3],
      [40, 0, false, 2],
      [20, 0, false, 1],
      [19, 0, false, 0],
      [95, 1, false, 5],
      [95, 2, false, 4],
      [95, 0, true, 2],
      [95, 3, true, 2],
      [60, 2, true, 2],
      [10, 2, false, 0],
    ];
    for (const [score, hints, seen, quality] of table) {
      expect(qualityFrom(_result(score), hints, seen)).toBe(quality);
    }
  });
});

describe("TestAttempts", () => {
  let vault: string;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "nv_practice_"));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("round_trip", () => {
    const ex = _sample("P-SQL-07-E01");
    const store = new PracticeAttemptStore(vault);
    expect(store.draft(ex.note_id)).toBe("");
    expect(store.attempts(ex.note_id)).toEqual([]);
    store.saveDraft(ex.note_id, "practice/sql.md", "WITH new_event AS (");
    expect(store.draft(ex.note_id)).toBe("WITH new_event AS (");

    const key = attemptKey(ex.note_id);
    expect(key).toMatch(/^att_[0-9a-f]{12}$/);
    const relPath = formatLayout(LAYOUT.study_attempt, { id: key });
    const fullPath = path.join(vault, relPath);
    expect(fs.existsSync(fullPath)).toBe(true);

    const attempt = store.record(ex, "practice/sql.md", {
      answer: "SELECT 1",
      hints_used: 2,
      seconds: 300,
      solution_seen: false,
      transport: "http",
      result: _result(70, [
        {
          category: "logical",
          anchor: "a",
          description: "b",
          evidence: "c",
          fix: "d",
        },
      ]),
      quality: 3,
    });
    expect(attempt["score"]).toBe(70);
    expect(attempt["mode"]).toBe("implement");
    expect(attempt["errors"][0]["category"]).toBe("logical");

    store.record(ex, "practice/sql.md", {
      answer: "x",
      hints_used: 0,
      seconds: 10,
      solution_seen: true,
      transport: "handoff",
      result: null,
      quality: 0,
    });

    const data = store.load(ex.note_id);
    expect(data.draft).toBe("");
    expect(data.note_path).toBe("practice/sql.md");
    expect(data.attempts.length).toBe(2);
    expect(data.attempts[1]!["verdict"]).toBe("ungraded");

    const onDisk = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    expect(onDisk.note_id).toBe(ex.note_id);
    expect(onDisk.attempts.length).toBe(2);
  });
});

describe("TestErrors", () => {
  let vault: string;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "nv_practice_"));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("repeat_detection", () => {
    const mgr = new StudyErrorManager(vault);
    const kwargs = {
      discipline: "python",
      skill: "06",
      mode: "debug",
      anchor: "except Exception swallows real bugs",
    };
    const first = mgr.recordError(
      "implementation",
      "programming",
      "06",
      "except Exception",
      {
        description_en: "Swallows errors.",
        note_id: "n1",
        ...kwargs,
      },
    );
    const second = mgr.recordError(
      "logical",
      "programming",
      "06",
      "except Exception:",
      {
        description_en: "Still swallows.",
        note_id: "n2",
        ...kwargs,
      },
    );
    expect(first.id).toBe(second.id);
    expect(second.repeat_count).toBe(2);
    expect(second.note_id).toBe("n2");
    expect(second.description_en).toBe("Still swallows.");
    expect(mgr.errors().length).toBe(1);

    const otherSkill = mgr.recordError(
      "implementation",
      "programming",
      "07",
      "x",
      {
        ...kwargs,
        skill: "07",
      },
    );
    expect(otherSkill.id).not.toBe(first.id);
    mgr.markResolved(first.id);
    const again = mgr.recordError(
      "implementation",
      "programming",
      "06",
      "x",
      kwargs,
    );
    expect(again.id).not.toBe(first.id);
    expect(again.repeat_count).toBe(1);
    expect(mgr.errors().length).toBe(3);
  });

  it("without_anchor_category_decides", () => {
    const mgr = new StudyErrorManager(vault);
    const a = mgr.recordError("calculation", "mathematics", "02", "1/2+1/3=2/5", {
      discipline: "math_drill",
      skill: "02",
    });
    const b = mgr.recordError("calculation", "mathematics", "02", "3/4+1/4=4/8", {
      discipline: "math_drill",
      skill: "02",
    });
    const c = mgr.recordError("procedural", "mathematics", "02", "x", {
      discipline: "math_drill",
      skill: "02",
    });
    expect(a.id).toBe(b.id);
    expect(b.wrong_answer).toBe("3/4+1/4=4/8");
    expect(a.id).not.toBe(c.id);
  });

  it("legacy_records_keep_new_fields_empty", () => {
    const err = new StudyErrorManager(vault).recordError(
      "grammar",
      "english",
      "tenses",
      "I go",
    );
    for (const key of [
      "discipline",
      "skill",
      "mode",
      "anchor",
      "description_en",
      "fix_en",
      "note_id",
    ] as const) {
      expect(err[key]).toBe("");
    }
    expect(err.last_seen).toBe(err.occurred_at);
  });

  it("record_grade_errors_recent_and_digest", () => {
    const ex = _sample("P-PY-06-E01");
    const result = _result(70, [
      {
        category: "implementation",
        anchor: "except Exception swallows real bugs",
        description: "The handler answers 200 on failures",
        evidence: 'return 200, "ok"',
        fix: "Return 500 and log the traceback",
      },
      {
        category: "logical",
        anchor: "",
        description: "Range not validated.",
        evidence: "",
        fix: "Check amount > 0.",
      },
    ]);
    recordGradeErrors(vault, ex, result, "answer");
    recordGradeErrors(vault, ex, result, "answer");
    new StudyErrorManager(vault).recordError("grammar", "english", "tenses", "I go");

    const recent = recentErrors(vault, "programming");
    expect(recent.length).toBe(2);
    expect(recent.every((e) => e.repeat_count === 2)).toBe(true);
    expect(recentErrors(vault, "programming", 1)[0]!.subject).toBe("programming");
    const logical = recent.find((e) => e.category === "logical")!;
    expect(logical.wrong_answer).toBe("answer");

    const digestPath = writeErrorDigest(vault);
    expect(digestPath).toBe(path.join(vault, LAYOUT.study_error_digest));
    const text = fs.readFileSync(digestPath, "utf-8");
    expect(text.startsWith("# NoteVault learner error log\nGenerated ")).toBe(true);
    expect(text).toContain("## programming");
    expect(text).toContain("## english");
    expect(text.indexOf("## programming")).toBeLessThan(text.indexOf("## english"));
    expect(text).toContain(
      '- [x2] implementation \u00b7 python \u00b7 anchor: "except Exception swallows real bugs" \u2014 The handler answers 200 on failures. Fix: Return 500 and log the traceback. Last seen ',
    );
    expect(text).toContain(`in ${ex.note_id}.`);
    expect(text).toContain("- [x1] grammar");
  });

  it("empty_digest", () => {
    const digestPath = writeErrorDigest(vault);
    const text = fs.readFileSync(digestPath, "utf-8");
    expect(text).toContain("No unresolved errors.");
  });
});

describe("TestApplyResult", () => {
  let vault: string;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "nv_practice_"));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("pipeline", () => {
    const file = fs
      .readdirSync(MATH_EXERCISES)
      .find((f) => f.startsWith("1.10-E01") && f.endsWith(".md"))!;
    const ex = _load(path.join(MATH_EXERCISES, file));

    const result = _result(80, [
      {
        category: "logical",
        anchor:
          "assumes the conclusion in the inductive step (circular reasoning)",
        description: "Circular.",
        evidence: "",
        fix: "Start from P(k).",
      },
    ]);

    const attempt = applyResult(vault, ex, "Mat/E01.md", {
      answer: "proof",
      hints_used: 1,
      seconds: 600,
      solution_seen: false,
      transport: "http",
      result,
    });
    expect([attempt["score"], attempt["quality"]]).toEqual([80, 4]);
    expect(new PracticeAttemptStore(vault).attempts(ex.note_id).length).toBe(1);
    expect(new StudyErrorManager(vault).errors().length).toBe(1);

    const digestText = fs.readFileSync(
      path.join(vault, LAYOUT.study_error_digest),
      "utf-8",
    );
    expect(digestText).toContain("## mathematics");

    let items = new StudySRSManager(vault).allItems();
    expect(items.length).toBe(1);
    expect(items[0]!.entity_id).toBe(ex.note_id);
    expect(items[0]!.entity_type).toBe("exercise");
    expect(items[0]!.topic).toBe("math_general");
    expect(items[0]!.repetitions).toBe(1);
    expect(items[0]!.history[0]!.grade).toBe(4);

    applyResult(vault, ex, "Mat/E01.md", {
      answer: "proof 2",
      hints_used: 0,
      seconds: 300,
      solution_seen: false,
      transport: "bridge",
      result: _result(95),
    });
    items = new StudySRSManager(vault).allItems();
    expect(items.length).toBe(1);
    expect(items[0]!.repetitions).toBe(2);
  });
});

describe("TestHandoff", () => {
  let vault: string;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "nv_practice_"));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("write_read_close", () => {
    expect(handoff.pendingRequests(vault)).toEqual([]);
    const reqId = handoff.newRequestId();
    expect(reqId).toMatch(/^req_\d{14}_[0-9a-f]{6}$/);

    const messages = [
      { role: "system", content: "judge" },
      { role: "user", content: "answer" },
    ];
    const createdReqId = handoff.writeRequest(vault, "grade", messages, {
      note_id: "n1",
      note_path: "a/b.md",
      extra: 1,
    });
    const reqPath = path.join(
      vault,
      formatLayout(LAYOUT.study_handoff_request, { id: createdReqId }),
    );
    const data = JSON.parse(fs.readFileSync(reqPath, "utf-8"));
    expect(data.id).toBe(createdReqId);
    expect(data.kind).toBe("grade");
    expect(data.note_id).toBe("n1");
    expect(data.messages).toEqual(messages);
    expect(data.response_file).toBe(`responses/${createdReqId}.json`);
    expect(data.extra).toBe(1);

    const mdPath = reqPath.replace(/\.json$/, ".md");
    const prompt = fs.readFileSync(mdPath, "utf-8");
    expect(prompt).toContain("judge");
    expect(prompt).toContain(
      formatLayout(LAYOUT.study_handoff_response, { id: createdReqId }),
    );
    expect(prompt).toContain('"verdict"');
    expect(handoff.pendingRequests(vault)).toEqual([createdReqId]);

    expect(handoff.readResponse(vault, createdReqId)).toBeNull();
    const respPath = handoff.responsePath(vault, createdReqId);
    expect(fs.existsSync(path.dirname(respPath))).toBe(true);

    fs.writeFileSync(respPath, "   ", "utf-8");
    expect(handoff.readResponse(vault, createdReqId)).toBeNull();

    fs.writeFileSync(respPath, '{"score": 90}', "utf-8");
    expect(parseGradeReply(handoff.readResponse(vault, createdReqId)!, 0).score).toBe(90);

    handoff.closeRequest(vault, createdReqId);
    expect(fs.existsSync(reqPath)).toBe(false);
    expect(
      fs.existsSync(path.join(path.dirname(reqPath), "done", path.basename(reqPath))),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(path.dirname(reqPath), "done", `${createdReqId}.md`)),
    ).toBe(true);
    expect(handoff.pendingRequests(vault)).toEqual([]);

    // closeRequest on already closed is idempotent
    handoff.closeRequest(vault, createdReqId);
  });

  it("markdown_response_accepted", () => {
    const reqId = handoff.writeRequest(vault, "generate", [], {});
    const mdRespPath = handoff.responsePath(vault, reqId).replace(/\.json$/, ".md");
    fs.writeFileSync(mdRespPath, 'Result:\n```json\n{"score": 50}\n```\n', "utf-8");
    expect(parseGradeReply(handoff.readResponse(vault, reqId)!, 0).score).toBe(50);
  });
});

describe("TestDrills", () => {
  it("generate_and_check_every_kind", () => {
    for (const kind of Object.keys(drills.DRILL_KINDS)) {
      for (let difficulty = 1; difficulty <= 5; difficulty++) {
        const items = drills.generate(kind, 25, difficulty, difficulty);
        expect(items.length).toBe(25);
        for (const item of items) {
          expect(item.kind).toBe(kind);
          expect(drills.check(item, item.answer)).toBe(true);
          expect(drills.check(item, "")).toBe(false);
        }
      }
      expect(drills.generate(kind, 5, 3, 7)).toEqual(drills.generate(kind, 5, 3, 7));
    }
    expect(() => drills.generate("logarithms", 3)).toThrow();
  });

  it("wrong_answers_rejected", () => {
    for (const kind of ["arithmetic", "fractions", "powers", "percent"]) {
      for (const item of drills.generate(kind, 20, 3, 1)) {
        const wrong = String(new Fraction(item.answer).add(new Fraction(1, 1)));
        expect(drills.check(item, wrong)).toBe(false);
      }
    }
    for (const item of drills.generate("derivatives", 20, 3, 1)) {
      expect(drills.check(item, item.answer + " + 1")).toBe(false);
    }
  });

  it("equivalent_answers", () => {
    const half = new drills.DrillItem("1/4 + 1/4", "1/2", "fractions");
    for (const given of ["1/2", "2/4", " 3/6 ", "0.5", "0,5"]) {
      expect(drills.check(half, given)).toBe(true);
    }
    expect(drills.check(half, "1/3")).toBe(false);
    expect(drills.check(half, "1/0")).toBe(false);

    const pct = new drills.DrillItem("15 % de 775", "116.25", "percent");
    expect(drills.check(pct, "116,25")).toBe(true);
    expect(drills.check(pct, "116.250")).toBe(true);

    const neg = new drills.DrillItem("24 - 39", "-15", "arithmetic");
    expect(drills.check(neg, "\u221215")).toBe(true);

    const deriv = new drills.DrillItem("d/dx (2x^3)", "6x^2", "derivatives");
    for (const given of [
      "6x^2",
      "6*x**2",
      "6 x^2",
      "6X^2",
      "3x*2x",
      "6x^2 + 0",
      "(2x)(3x)",
    ]) {
      expect(drills.check(deriv, given)).toBe(true);
    }
    for (const given of [
      "6x^3",
      "6x",
      "x^2",
      "6y^2",
      "__import__('os')",
      "2**2**2**2**2",
      "6x^2)",
      "x.real",
      "[6]",
    ]) {
      expect(drills.check(deriv, given)).toBe(false);
    }
  });

  it("summarize", () => {
    const items = drills.generate("fractions", 4, 2, 3);
    const results: Array<[drills.DrillItem, string, boolean, number]> = [
      [items[0]!, items[0]!.answer, true, 3.0],
      [items[1]!, items[1]!.answer, true, 4.0],
      [items[2]!, "7/9", false, 5.0],
      [items[3]!, "", false, 8.0],
    ];
    const grade = drills.summarize(results);
    expect(grade.score).toBe(50);
    expect(grade.verdict).toBe("partial");
    expect(grade.rubric).toEqual([true, true, false, false]);
    expect(grade.errors.length).toBe(2);
    expect(grade.errors[0]!.category).toBe("calculation");
    expect(grade.errors[0]!.description).toBe(
      `fractions: expected ${items[2]!.answer}, got 7/9`,
    );
    expect(grade.feedback).toContain("2/4 correctas en 20 s");
    expect(grade.example).toContain(items[2]!.answer);

    const perfect = drills.summarize([[items[0]!, items[0]!.answer, true, 2.0]]);
    expect([perfect.score, perfect.verdict, perfect.errors]).toEqual([
      100,
      "correct",
      [],
    ]);
    expect(drills.summarize([]).score).toBe(0);
  });
});

describe("TestVaultKeys", () => {
  it("practice_keys", () => {
    const expected = {
      study_attempts_dir: ".notevault/estudio/intentos",
      study_attempt: ".notevault/estudio/intentos/{id}.json",
      study_error_digest: ".notevault/estudio/errores/ERROR_LOG.md",
      study_handoff_dir: ".notevault/estudio/handoff",
      study_handoff_request: ".notevault/estudio/handoff/requests/{id}.json",
      study_handoff_response: ".notevault/estudio/handoff/responses/{id}.json",
      study_ledger_dir: ".notevault/estudio/ledger",
      study_ledger: ".notevault/estudio/ledger/{id}.json",
    };
    for (const [key, expectedPath] of Object.entries(expected)) {
      expect((LAYOUT as any)[key]).toBe(expectedPath);
    }
  });
});

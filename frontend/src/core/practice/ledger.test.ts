import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudyErrorManager } from "../studyErrorManager.js";
import { StudySRSManager } from "../studySrsManager.js";
import { VaultManager } from "../vaultManager.js";
import { WorkspaceManager } from "../workspaceManager.js";
import { attemptKey } from "./attempts.js";
import { indexCards, loadCard, parseCards } from "./cards.js";
import { scanVault, skillKey } from "./exerciseIndex.js";
import * as lg from "./ledger.js";
import * as rc from "./recommender.js";
import { detectStudyArea } from "./studyArea.js";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const KB = path.join(REPO_ROOT, "docs/knowledge_base/examples");
const MATH_AREA = "Matemáticas/1 Lógica y demostración";
const CONCEPT_DIR = `${MATH_AREA}/1.10 Inducción matemática`;
const EX_DIR = `${CONCEPT_DIR}/Ejercicios`;
const TODAY = new Date(2026, 8, 24); // Sept 24, 2026

function ev(
  daysAgo: number,
  score: number,
  difficulty: number,
  mode: string = "implement",
  hints: number = 0,
  seen: boolean = false
): Record<string, any> {
  const at = new Date(2026, 8, 24, 12);
  at.setDate(at.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  return {
    at: stamp,
    score,
    verdict: score >= 75 ? "correct" : "partial",
    mode,
    hints_used: hints,
    solution_seen: seen,
    difficulty,
  };
}

function exerciseNote(
  noteId: string,
  discipline: string,
  skill: string,
  mode: string,
  difficulty: number = 2,
  subject: string = "programming",
  extra: string = ""
): string {
  return (
    `---\nid: ${noteId}\ntitle: ${noteId}\nsubject: ${subject}\ntype: exercise\n` +
    `discipline: ${discipline}\nskill: "${skill}"\nmode: ${mode}\n` +
    `difficulty: ${difficulty}\n${extra}---\n\n# ${noteId}\n\n## Enunciado\nHaz algo.\n`
  );
}

function recordAttempt(
  root: string,
  noteId: string,
  score: number,
  daysAgo: number = 0,
  mode: string = "",
  hints: number = 0
): void {
  const dir = path.join(root, ".notevault/estudio/intentos");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${attemptKey(noteId)}.json`);

  let data: Record<string, any>;
  if (fs.existsSync(p)) {
    data = JSON.parse(fs.readFileSync(p, "utf-8"));
  } else {
    data = { note_id: noteId, note_path: "", draft: "", attempts: [] };
  }

  const at = new Date();
  at.setDate(at.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;

  data.attempts.push({
    at: stamp,
    score,
    mode,
    hints_used: hints,
    solution_seen: false,
    verdict: score >= 75 ? "correct" : "partial",
  });
  fs.writeFileSync(p, JSON.stringify(data), "utf-8");
}

describe("LedgerReplay", () => {
  it("starts as not started with no attempts", () => {
    expect(lg.replay([], TODAY).status).toBe(lg.NOT_STARTED);
  });

  it("moves to practicing on first attempt even when failed", () => {
    const row = lg.replay([ev(3, 20, 2)], TODAY);
    expect(row.status).toBe(lg.PRACTICING);
    expect(row.attempts).toBe(1);
    expect(row.best).toBe(20);
  });

  it("consolidates on advanced judgment mode without help", () => {
    const row = lg.replay([ev(10, 60, 2), ev(3, 90, 4, "debug")], TODAY);
    expect(row.status).toBe(lg.CONSOLIDATED);
    expect(row.judged).toBe(true);
    expect(row.due).toBe("2026-09-28");
    expect(row.is_due).toBe(false);
  });

  it("does not consolidate with implement mode or hints", () => {
    expect(lg.replay([ev(3, 95, 5, "implement")], TODAY).status).toBe(lg.PRACTICING);
    expect(lg.replay([ev(3, 95, 5, "debug", 1)], TODAY).status).toBe(lg.PRACTICING);
  });

  it("consolidates with all three difficulty bands", () => {
    const events = [ev(9, 80, 1), ev(6, 80, 3)];
    expect(lg.replay(events, TODAY).status).toBe(lg.PRACTICING);
    const row = lg.replay([...events, ev(2, 80, 4)], TODAY);
    expect(row.status).toBe(lg.CONSOLIDATED);
    expect(row.bands).toEqual(["beginner", "intermediate", "advanced"]);
  });

  it("becomes due and doubles interval on review", () => {
    const row1 = lg.replay([ev(20, 90, 4, "refactor")], TODAY);
    expect(row1.is_due).toBe(true);

    const row2 = lg.replay([ev(20, 90, 4, "refactor"), ev(1, 85, 2)], TODAY);
    expect(row2.interval_days).toBe(14);
    expect(row2.is_due).toBe(false);
  });

  it("sends back to practicing when a consolidated skill is failed", () => {
    const row = lg.replay([ev(20, 90, 4, "debug"), ev(1, 10, 2)], TODAY);
    expect(row.status).toBe(lg.PRACTICING);
    expect(row.lapses).toBe(1);
    expect(row.due).toBe("");
  });
});

describe("LedgerStore and Recommender Vault tests", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ledger_test_"));
    fs.mkdirSync(path.join(vaultDir, ".notevault"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  function write(rel: string, text: string): string {
    const p = path.join(vaultDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, "utf-8");
    return p;
  }

  function copyMath(): void {
    const src = path.join(KB, "Matemáticas");
    const dst = path.join(vaultDir, "Matemáticas");
    fs.cpSync(src, dst, { recursive: true });
  }

  function scan() {
    const vm = new VaultManager(vaultDir);
    return scanVault(vaultDir, vm.notePaths());
  }

  function snapshot(area?: any) {
    const vm = new VaultManager(vaultDir);
    return rc.hubSnapshot(vaultDir, vm.notePaths(), TODAY, area);
  }

  it("derives skill from mode for math exercises", () => {
    copyMath();
    const refs = scan().byId();
    expect(refs["mat.logica.induccion.e01"]?.skill).toBe("01"); // prove
    expect(refs["mat.logica.induccion.e04"]?.skill).toBe("04"); // find_error
    expect(refs["mat.logica.induccion.e01"]?.chapter).toBe(CONCEPT_DIR);
    expect(skillKey("math_drill", "drill", "", "fractions")).toBe("02");
  });

  it("builds and persists ledgers from attempts", () => {
    write("P/a.md", exerciseNote("py.a", "python", "06", "debug", 4));
    recordAttempt(vaultDir, "py.a", 92, 12, "debug");

    const ledgers = lg.refreshLedgers(vaultDir, scan().exercises, TODAY);
    const row = lg.skillStatus(ledgers, "python", "06");
    expect(row).not.toBeNull();
    expect(row!.status).toBe(lg.CONSOLIDATED);
    expect(row!.is_due).toBe(true);
    expect(row!.exercises).toBe(1);
    expect(lg.skillStatus(ledgers, "python", "01")?.status).toBe(lg.NOT_STARTED);

    const stored = lg.loadLedger(vaultDir, "python");
    expect(stored.discipline).toBe("python");
    expect(stored.skills.length).toBe(15);
    expect(fs.existsSync(path.join(vaultDir, ".notevault/estudio/ledger/python.json"))).toBe(
      true
    );
  });

  it("recommends next skill pointing to existing never attempted exercise", () => {
    write("P/a.md", exerciseNote("py.s01.e01", "python", "01", "implement"));
    const recs = snapshot().recommendations;
    const nxt = recs.filter((r) => r.kind === rc.NEXT_SKILL);
    expect(nxt[0]!.exercise?.note_id).toBe("py.s01.e01");
    expect(nxt[0]!.message).toBe("");
  });

  it("states when there is no exercise for next skill", () => {
    write("P/a.md", exerciseNote("py.s06.e01", "python", "06", "debug"));
    const snap = snapshot();
    const gap = snap.recommendations.find((r) => r.kind === rc.NEXT_SKILL)!;
    expect(gap.exercise).toBeNull();
    expect(gap.message).toContain("No hay ejercicios de Python · 01");
    expect(snap.queue.gaps).toContain(gap);

    const follow = snap.recommendations.filter(
      (r) => r.kind === rc.NEXT_SKILL && r.exercise !== null
    );
    expect(follow[0]!.exercise?.note_id).toBe("py.s06.e01");
  });

  it("recommends a find_error exercise when an anchor is repeated", () => {
    copyMath();
    const manager = new StudyErrorManager(vaultDir);
    for (const note of ["mat.logica.induccion.e01", "mat.logica.induccion.e02"]) {
      manager.recordError("logical", "mathematics", "math_general", "x", "", "", "", "", {
        discipline: "math_general",
        mode: "prove",
        anchor: "assumes the conclusion",
        note_id: note,
      });
      recordAttempt(vaultDir, note, 50, 0, "prove");
    }

    const rec = snapshot().recommendations.find((r) => r.kind === rc.REMEDIATION)!;
    expect(rec.exercise?.note_id).toBe("mat.logica.induccion.e04");
    expect(rec.reason).toContain("2 veces");
  });

  it("states when repeated anchor has no debug exercise", () => {
    write("P/a.md", exerciseNote("py.s02.e01", "python", "02", "implement"));
    const manager = new StudyErrorManager(vaultDir);
    for (let i = 0; i < 2; i++) {
      manager.recordError("logical", "programming", "02", "x", "", "", "", "", {
        discipline: "python",
        skill: "02",
        anchor: "assumes a key exists",
        note_id: "py.s02.e01",
      });
    }

    const rec = snapshot().recommendations.find((r) => r.kind === rc.REMEDIATION)!;
    expect(rec.exercise).toBeNull();
    expect(rec.message).toContain("No hay ejercicios de depuración");
  });

  it("recommends integration when every skill of chapter is practicing", () => {
    write("C/a.md", exerciseNote("py.s01", "python", "01", "implement"));
    write("C/b.md", exerciseNote("py.s02", "python", "02", "implement"));
    recordAttempt(vaultDir, "py.s01", 60);

    expect(snapshot().recommendations.filter((r) => r.kind === rc.INTEGRATION).length).toBe(
      0
    );

    recordAttempt(vaultDir, "py.s02", 60);
    const rec = snapshot().recommendations.find((r) => r.kind === rc.INTEGRATION)!;
    expect(rec.exercise).toBeNull();
    expect(rec.message).toContain("No hay ejercicios de integración de «C»");

    write("C/i.md", exerciseNote("py.int", "python", "01", "implement", 2, "programming", "integration: true\n"));
    const rec2 = snapshot().recommendations.find((r) => r.kind === rc.INTEGRATION)!;
    expect(rec2.exercise?.note_id).toBe("py.int");
  });

  it("asks for fresh exercise when consolidated skill is due", () => {
    write("P/a.md", exerciseNote("py.s06.e01", "python", "06", "debug", 4));
    write("P/b.md", exerciseNote("py.s06.e02", "python", "06", "debug", 3));
    recordAttempt(vaultDir, "py.s06.e01", 95, 12, "debug");

    const rec = snapshot().recommendations.find((r) => r.kind === rc.REVIEW)!;
    expect(rec.exercise?.note_id).toBe("py.s06.e02");
  });

  it("prefers never attempted then srs due when picking exercise", () => {
    write("P/a.md", exerciseNote("e1", "python", "01", "implement", 1));
    write("P/b.md", exerciseNote("e2", "python", "01", "implement", 2));
    const refs = scan().exercises;
    expect(rc.pickExercise(refs, new Set(["e1"]), {})!.note_id).toBe("e2");
    expect(
      rc.pickExercise(refs, new Set(["e1", "e2"]), { e1: "2026-09-01" })?.note_id
    ).toBe("e1");
    expect(rc.pickExercise(refs, new Set(["e1", "e2"]), {})).toBeNull();
  });

  it("interleaves skills in daily queue", () => {
    for (const skill of ["01", "02"]) {
      for (const n of [1, 2]) {
        write(
          `P/${skill}${n}.md`,
          exerciseNote(`e${skill}${n}`, "python", skill, "implement")
        );
      }
    }
    const srs = new StudySRSManager(vaultDir);
    for (const noteId of ["e011", "e012", "e021", "e022"]) {
      srs.registerItem(noteId, "exercise", "programming");
    }
    const items = snapshot().queue.items;
    const skills = items.filter((i) => i.exercise).map((i) => i.exercise!.skill);
    expect(skills.length).toBe(4);
    expect(skills[0]).not.toBe(skills[1]);
  });
});

describe("Cards and StudyArea tests", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_cards_test_"));
    fs.mkdirSync(path.join(vaultDir, ".notevault"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  function write(rel: string, text: string): string {
    const p = path.join(vaultDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, "utf-8");
    return p;
  }

  function copyMath(): void {
    const src = path.join(KB, "Matemáticas");
    const dst = path.join(vaultDir, "Matemáticas");
    fs.cpSync(src, dst, { recursive: true });
  }

  function scan() {
    const vm = new VaultManager(vaultDir);
    return scanVault(vaultDir, vm.notePaths());
  }

  it("parses reference concept cards", () => {
    const text = fs.readFileSync(
      path.join(KB, `${CONCEPT_DIR}/1.10 Inducción matemática.md`),
      "utf-8"
    );
    const cards = parseCards(text);
    expect(cards.length).toBe(10);
    expect(cards[0]!.number).toBe(1);
    expect(cards[0]!.kind).toBe("definicion");
    expect(cards[0]!.question.startsWith("Enuncia el principio")).toBe(true);
    expect(cards[0]!.answer.startsWith("Si $P(n_0)$")).toBe(true);
  });

  it("is tolerant when parsing cards", () => {
    const text =
      "# X\n\n## Cards\n### Pregunta suelta\nQ: What is 2+2?\nA: 4\n\n" +
      "### T7 - hecho\n- **P**: ¿Capital de Francia?\n- **R**: París,\nsin duda.\n" +
      "### T8 · vacía\nsin marcas\n\n## Otra sección\n### T9\n**P:** no cuenta\n";
    const cards = parseCards(text);
    expect(cards.map((c) => c.number)).toEqual([1, 7]);
    expect(cards[0]!.answer).toBe("4");
    expect(cards[1]!.kind).toBe("hecho");
    expect(cards[1]!.answer).toBe("París,\nsin duda.");
    expect(parseCards("# Sin tarjetas\n\n## Idea\ntexto\n")).toEqual([]);
  });

  it("indexes cards only for studied concepts", () => {
    copyMath();
    const sc = scan();
    expect(sc.card_notes.length).toBe(1);
    expect(indexCards(vaultDir, sc.card_notes, sc.exercises, new Set())).toEqual([]);

    const items = indexCards(
      vaultDir,
      sc.card_notes,
      sc.exercises,
      new Set(["mat.logica.induccion.e03"])
    );
    expect(items.length).toBe(10);
    expect(new Set(items.map((i) => i.entity_type))).toEqual(new Set(["card"]));
    expect(items[2]!.entity_id).toBe("mat.logica.induccion#T3");
    expect(loadCard(vaultDir, items[2]!)?.kind).toBe("notacion");

    const again = indexCards(
      vaultDir,
      sc.card_notes,
      sc.exercises,
      new Set(["mat.logica.induccion.e03"])
    );
    expect(again.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("gates cards with frontmatter estudiado", () => {
    write(
      "M/c.md",
      "---\nid: c\nsubject: mathematics\ntype: concept\nestudiado: true\n---\n# C\n\n## Tarjetas\n### T1 · definicion\n**P:** ¿Qué?\n**R:** Esto.\n"
    );
    write("M/plain.md", "---\nid: p\ntype: concept\nestudiado: true\n---\n# P\n");
    const sc = scan();
    const items = indexCards(vaultDir, sc.card_notes, sc.exercises, new Set());
    expect(items.map((i) => i.entity_id)).toEqual(["c#T1"]);
  });

  it("detects study area and scopes snapshot", () => {
    copyMath();
    const wm = new WorkspaceManager(vaultDir);
    const area = detectStudyArea(`${EX_DIR}/1.10-E01 x.md`, null, wm.workspaces());
    expect(area).not.toBeNull();
    expect(area!.subject).toBe("mathematics");
    expect(area!.folder).toBe(MATH_AREA);
    expect(area!.title).toBe("1 Lógica y demostración");

    const snap = rc.hubSnapshot(vaultDir, new VaultManager(vaultDir).notePaths(), TODAY, area);
    expect(snap.exercises.length).toBe(7);
    expect(new Set(Object.keys(snap.ledgers))).toEqual(new Set(["math_general"]));
  });
});

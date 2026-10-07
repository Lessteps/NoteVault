import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  buildGoalMessages,
  buildTopicCatalog,
  composeDraft,
  keywordsOf,
  parseGoalResponse,
  scheduleGoal,
  type CatalogTopic,
  type GoalDraftReply,
} from "./goalDraft.js";
import type { StudentBrief } from "./brief.js";
import type { TopicSnap } from "./topics.js";

function snap(folder: string, title: string, subject: string, skills: string[], over: Partial<TopicSnap> = {}, pct = 0): TopicSnap {
  return {
    folder,
    subject,
    title,
    progress: {
      topic: { title, subject, mastery: { exam: "none" } },
      skills: Object.fromEntries(skills.map((s) => [s, { mastered: false, status: "not_started", totalAttempts: 0, bestScore: null }])),
      examPassed: false,
      examScore: null,
      completenessPct: pct,
    },
    exerciseCount: 4,
    theoryNotes: 2,
    attemptCount: 0,
    lastAttemptAt: null,
    ...over,
  };
}

const TOPICS: TopicSnap[] = [
  snap("Programación/Python/1 Fundamentos", "1 Fundamentos de Python", "programming", ["implement", "debug"]),
  snap("Programación/Python/2 APIs web", "2 APIs web con Flask", "programming", ["implement", "explain"]),
  snap("Programación/Backend/1 Bases de datos", "1 Bases de datos SQL", "programming", ["implement"]),
  snap("Matemáticas/Álgebra/1 Límites", "1 Límites", "mathematics", ["solve", "prove"]),
  snap("Inglés/Gramática/1 Present simple", "1 Present simple", "english", ["grammar"]),
];

const brief: StudentBrief = { version: 1, date: "2026-10-05", weekday: "lunes", sections: [], skipped: [] };

describe("buildTopicCatalog", () => {
  it("ranks the topics that match the request first, ignoring accents and case", () => {
    const cat = buildTopicCatalog(TOPICS, "Tengo que estudiar BACKEND enfocado en Python y tengo 3 meses");
    const folders = cat.map((t) => t.folder);
    expect(folders.slice(0, 3).sort()).toEqual(["Programación/Backend/1 Bases de datos", "Programación/Python/1 Fundamentos", "Programación/Python/2 APIs web"]);
    // Álgebra se encuentra aunque la petición no lleve tilde
    expect(buildTopicCatalog(TOPICS, "algebra y limites")[0]!.folder).toBe("Matemáticas/Álgebra/1 Límites");
  });

  it("is compact: caps the size and exposes only folder, title, subject, skills, completeness and minutes", () => {
    const many = Array.from({ length: 200 }, (_, i) => snap(`Mat/T${i}`, `Tema ${i}`, "mathematics", ["solve"]));
    const cat = buildTopicCatalog(many, "mates", { max: 25 });
    expect(cat).toHaveLength(25);
    expect(Object.keys(cat[0]!).sort()).toEqual(["completenessPct", "estMinutes", "folder", "skills", "subject", "title"]);
  });

  it("still returns topics when nothing matches, open ones before completed ones", () => {
    const done = snap("Mat/Hecho", "Hecho", "mathematics", ["solve"], {}, 100);
    const open = snap("Mat/Abierto", "Abierto", "mathematics", ["solve"], {}, 20);
    expect(buildTopicCatalog([done, open], "zzz").map((t) => t.folder)).toEqual(["Mat/Abierto", "Mat/Hecho"]);
  });

  it("drops stopwords and numbers from the keywords", () => {
    expect(keywordsOf("quiero estudiar backend en 3 meses")).toEqual(["backend"]);
  });

  it("estimates minutes from pending skills (default) and the exam", () => {
    const withExam = snap("A/B", "B", "x", ["a", "b", "c"]);
    withExam.progress.topic.mastery.exam = "required";
    const [c] = buildTopicCatalog([withExam], "b");
    expect(c!.estMinutes).toBe(90); // 3 skills * 20 + 30 examen
  });
});

describe("buildGoalMessages", () => {
  it("puts rules, brief and the compact catalog in the system message and ends with the user's request", () => {
    const catalog = buildTopicCatalog(TOPICS, "backend");
    const msgs = buildGoalMessages("quiero backend en 3 meses", brief, catalog, [{ role: "user", content: "hola" }, { role: "assistant", content: "¿cuántas horas?" }], { today: "2026-10-05", areas: ["Estudio"] });
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toContain("folder=Programación/Backend/1 Bases de datos");
    expect(msgs[0]!.content).toContain("HOY: 2026-10-05");
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(msgs[3]!.content).toBe("quiero backend en 3 meses");
  });
});

describe("parseGoalResponse", () => {
  const catalog = buildTopicCatalog(TOPICS, "python");

  it("parses a question, also inside a code fence and with text around it", () => {
    const q = { type: "question", text: "¿Cuántas horas por semana?" };
    expect(parseGoalResponse(JSON.stringify(q), catalog)).toEqual({ ok: true, reply: q });
    expect(parseGoalResponse("```json\n" + JSON.stringify(q) + "\n```", catalog)).toEqual({ ok: true, reply: q });
    expect(parseGoalResponse("Claro:\n" + JSON.stringify(q) + "\nSaludos", catalog)).toEqual({ ok: true, reply: q });
  });

  it("parses a draft, drops invented folders (reporting them) and invalid skills", () => {
    const res = parseGoalResponse(
      "```json\n" +
        JSON.stringify({
          type: "goal_draft",
          name: "Backend con Python",
          rationale: "Primero lo básico.",
          hoursPerWeek: 6,
          durationWeeks: 12,
          topics: [
            { folder: "Programación/Python/1 Fundamentos", why: "base" },
            { folder: "Programación/Inventado/Django", why: "no existe" },
            { folder: "Programación/Python/2 APIs web", skills: ["implement", "bogus"], why: "APIs" },
            { folder: "Programación/Python/1 Fundamentos", why: "repetido" },
          ],
        }) +
        "\n```",
      catalog,
    );
    expect(res.ok).toBe(true);
    const r = (res as { ok: true; reply: GoalDraftReply }).reply;
    expect(r.type).toBe("goal_draft");
    expect(r.topics.map((t) => t.folder)).toEqual(["Programación/Python/1 Fundamentos", "Programación/Python/2 APIs web"]);
    expect(r.topics[0]!.skills).toEqual([]); // todas
    expect(r.topics[1]!.skills).toEqual(["implement"]);
    expect(r.discarded).toEqual(["Programación/Inventado/Django"]);
    expect(r.hoursPerWeek).toBe(6);
    expect(r.durationWeeks).toBe(12);
  });

  it("fails (never links) when every folder is invented", () => {
    const res = parseGoalResponse(JSON.stringify({ type: "goal_draft", name: "x", topics: [{ folder: "No/existe" }] }), catalog);
    expect(res).toMatchObject({ ok: false, discarded: ["No/existe"] });
  });

  it("rejects non-JSON", () => {
    expect(parseGoalResponse("no sé", catalog).ok).toBe(false);
    expect(parseGoalResponse("", catalog).ok).toBe(false);
  });
});

describe("scheduleGoal", () => {
  const t = (folder: string, estMinutes: number): { folder: string; title: string; estMinutes: number } => ({ folder, title: folder, estMinutes });

  it("spreads topics in order over 3 months at hours per week, due dates increasing and inside the range", () => {
    // 5 h/semana * 13 semanas = 65 h; 4 temas de 10 h = 40 h: cabe
    const s = scheduleGoal({ topics: [t("A", 600), t("B", 600), t("C", 600), t("D", 600)], start: "2026-10-05", end: "2027-01-05", hoursPerWeek: 5 });
    expect(s.fits).toBe(true);
    expect(s.items.map((i) => i.name)).toEqual(["A", "B", "C", "D"]);
    // 10 h a 5 h/semana = 14 días por tema
    expect(s.items.map((i) => i.due)).toEqual(["2026-10-19", "2026-11-02", "2026-11-16", "2026-11-30"]);
    expect(s.items[0]!.start).toBe("2026-10-05");
    expect(s.items[1]!.start).toBe("2026-10-19");
    expect(s.items[0]!.weekFrom).toBe(1);
    expect(s.items[0]!.weekTo).toBe(2);
    expect(s.items[3]!.due <= s.end).toBe(true);
    expect(s.items[0]!.topic_links).toEqual(["A"]);
    expect(s.totalMinutes).toBe(2400);
    expect(s.warnings).toEqual([]);
  });

  it("warns when it does not fit and compresses the dates to finish on the end date", () => {
    // 2 h/semana * 4 semanas = 8 h pero hay 20 h
    const s = scheduleGoal({ topics: [t("A", 600), t("B", 600)], start: "2026-10-05", end: "2026-11-02", hoursPerWeek: 2 });
    expect(s.fits).toBe(false);
    expect(s.requiredHoursPerWeek).toBe(5);
    expect(s.warnings[0]).toContain("necesitas unas 5 h/semana");
    expect(s.warnings[0]).toContain("acortar el alcance");
    expect(s.items[1]!.due).toBe("2026-11-02");
    expect(s.items.every((i) => i.due <= "2026-11-02")).toBe(true);
  });

  it("handles a single topic", () => {
    const s = scheduleGoal({ topics: [t("Solo", 300)], start: "2026-10-05", end: "2026-12-05", hoursPerWeek: 5 });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.due).toBe("2026-10-12"); // 5 h a 5 h/semana
    expect(s.warnings.join(" ")).toContain("sobra tiempo");
    expect(s.fits).toBe(true);
  });

  it("groups consecutive topics when there are more than maxItems, keeping every link", () => {
    const topics = Array.from({ length: 10 }, (_, i) => t(`T${i}`, 60));
    const s = scheduleGoal({ topics, start: "2026-10-05", end: "2027-02-05", hoursPerWeek: 5, maxItems: 4 });
    expect(s.items).toHaveLength(4);
    expect(s.items.flatMap((i) => i.topic_links)).toEqual(topics.map((x) => x.folder));
  });

  it("encodes skill-restricted links like topic_links expects", () => {
    const s = scheduleGoal({ topics: [{ folder: "Prog/C#", title: "C#", skills: ["a", "b"], estMinutes: 60 }], start: "2026-10-05", end: "2026-11-05", hoursPerWeek: 5 });
    expect(s.items[0]!.topic_links).toEqual(["Prog/C%23#a+b"]);
  });

  it("validates its input", () => {
    expect(() => scheduleGoal({ topics: [], start: "2026-10-05", end: "2026-10-05", hoursPerWeek: 5 })).toThrow();
    expect(() => scheduleGoal({ topics: [], start: "2026-10-05", end: "2026-11-05", hoursPerWeek: 0 })).toThrow();
  });

  it("addDaysIso crosses month and DST boundaries", () => {
    expect(addDaysIso("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDaysIso("2026-03-28", 3)).toBe("2026-03-31");
  });
});

describe("composeDraft", () => {
  const catalog: CatalogTopic[] = buildTopicCatalog(TOPICS, "python");
  const reply = (over: Partial<GoalDraftReply> = {}): GoalDraftReply => ({
    type: "goal_draft",
    name: "Backend",
    rationale: "Porque sí",
    hoursPerWeek: 5,
    durationWeeks: 12,
    topics: [{ folder: "Programación/Python/1 Fundamentos", skills: [], why: "base" }],
    milestones: ["API funcionando"],
    discarded: [],
    ...over,
  });

  it("asks for what is missing instead of inventing hours or a deadline", () => {
    expect(composeDraft(reply({ hoursPerWeek: null }), catalog, "2026-10-05")).toEqual({ missing: "las horas por semana que puedes dedicar" });
    expect(composeDraft(reply({ durationWeeks: null }), catalog, "2026-10-05")).toMatchObject({ missing: expect.stringContaining("plazo") });
  });

  it("builds a draft with the computed calendar and the milestones in the description", () => {
    const d = composeDraft(reply(), catalog, "2026-10-05", "estudio");
    if ("missing" in d) throw new Error("missing");
    expect(d.schedule.end).toBe("2026-12-28");
    expect(d.schedule.items).toHaveLength(1);
    expect(d.description).toContain("- API funcionando");
    expect(d.area).toBe("estudio");
  });
});

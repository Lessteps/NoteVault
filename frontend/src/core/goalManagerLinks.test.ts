// Submetas de primera clase: enlaces a práctica (`practice_links`), avance combinado con los temas, jerarquía de N
// niveles y promover / convertir / mover entre metas sin perder hijos, enlaces ni historial.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Goal, GoalManager, ITEM_DONE, STATUS_DONE } from "./goalManager";
import type { PracticeData } from "./practice/practiceLinks";

const D = new Date(2026, 8, 14);
const mastered = (v: boolean) => ({ mastered: v, consolidated: v }) as never;
const topic = (title: string, ok: boolean) =>
  ({ topic: { title, skills: ["a"], mastery: { exam: "none" } }, skills: { a: mastered(ok) }, examPassed: false }) as never;

describe("submetas de primera clase", () => {
  let dir: string;
  let gm: GoalManager;
  let goal: Goal;
  let practice: PracticeData | null;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-goal-links-"));
    gm = new GoalManager(dir);
    goal = gm.create_goal("Ser backend", { area: "programacion", icon: "🛠", colour: "#112233", priority: 3, start: D });
    practice = { ready: true, kataDates: new Set<string>(), projects: [] };
    gm.practiceLookup = () => practice;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("practice_links round-trip in the item file and are omitted when empty", () => {
    const it = gm.create_item(goal.id, "Constancia", "", { practice_links: ["KATA:daily#week=3", "project:weekly#backend", "nada", "kata:daily#week=3"] });
    const text = fs.readFileSync(gm.item_path(goal.id, it.id), "utf-8");
    expect(text).toContain('practice_links: "kata:daily#week=3,project:weekly#backend"\n');
    expect(new GoalManager(dir).get_item(goal.id, it.id)!.practice_links).toEqual(["kata:daily#week=3", "project:weekly#backend"]);
    gm.update_item(goal.id, it.id, { practice_links: [] });
    expect(fs.readFileSync(gm.item_path(goal.id, it.id), "utf-8")).not.toContain("practice_links");
  });

  it("an older reader keeps unknown keys: the field survives an update made through extra", () => {
    const it = gm.create_item(goal.id, "X", "", { practice_links: ["kata:daily"] });
    gm.update_item(goal.id, it.id, { name: "Y" });
    expect(gm.get_item(goal.id, it.id)!.practice_links).toEqual(["kata:daily"]);
  });

  it("derives completion and progress from the practice lookup, like topic_links", () => {
    const it = gm.create_item(goal.id, "Kata", "", { practice_links: ["kata:daily#week=2"], status: ITEM_DONE });
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(gm.is_done_on(gm.get_item(goal.id, it.id)!, today)).toBe(false); // manual status ignored
    expect(gm.item_progress(gm.get_item(goal.id, it.id)!, goal, today)).toBe(0);
    practice = { ready: true, kataDates: new Set([iso(today)]), projects: [] };
    const week = gm.get_item(goal.id, it.id)!;
    expect(gm.item_progress(week, goal, today)).toBe(0.5);
    practice = { ready: true, kataDates: new Set([iso(today), iso(new Date(today.getTime() - 0))]), projects: [] };
    gm.update_item(goal.id, it.id, { practice_links: ["kata:daily#week=1"] });
    expect(gm.is_done_on(gm.get_item(goal.id, it.id)!, today)).toBe(true);
    expect(gm.practice_progress(gm.get_item(goal.id, it.id)!)!.done).toBe(true);
  });

  it("no practice module: not done, 0 %, the item says there is no data and nothing throws", () => {
    const it = gm.create_item(goal.id, "Kata", "", { practice_links: ["kata:daily", "project:weekly"] });
    practice = null;
    const cur = gm.get_item(goal.id, it.id)!;
    expect(gm.is_done_on(cur, D)).toBe(false);
    expect(gm.item_progress(cur, goal, D)).toBe(0);
    expect(gm.practice_progress(cur)!.noData).toBe(true);
    gm.practiceLookup = null; // sin lookup inyectado el campo no afecta
    expect(gm.practice_progress(cur)).toBeNull();
    expect(gm.is_done_on(cur, D)).toBe(false);
  });

  it("combines topic and practice links: every link weighs the same", () => {
    const it = gm.create_item(goal.id, "Mixta", "", { topic_links: ["T/uno", "T/dos"], practice_links: ["project:folder:p"] });
    gm.topicLookup = (f) => (f === "T/uno" || f === "T/dos" ? topic(f, true) : null);
    practice = { ready: true, kataDates: new Set(), projects: [{ folder: "p", title: "P", state: "building", date: "2026-10-01", graded: false }] };
    const cur = gm.get_item(goal.id, it.id)!;
    // temas 100 % (2 enlaces) + proyecto en construcción 38 % (1 enlace) = (200 + 38) / 3
    expect(gm.linked_progress(cur)).toEqual({ pct: 79, done: false });
    expect(gm.item_progress(cur, goal, D)).toBeCloseTo(0.79, 2);
    expect(gm.is_done_on(cur, D)).toBe(false);
    practice = { ready: true, kataDates: new Set(), projects: [{ folder: "p", title: "P", state: "done", date: "2026-10-01", graded: true }] };
    expect(gm.is_done_on(gm.get_item(goal.id, it.id)!, D)).toBe(true);
    expect(gm.linked_progress(gm.get_item(goal.id, it.id)!)).toEqual({ pct: 100, done: true });
  });

  it("with only topic_links the result is exactly the old one", () => {
    const it = gm.create_item(goal.id, "Temas", "", { topic_links: ["T/uno"] });
    gm.topicLookup = () => topic("uno", false);
    expect(gm.item_progress(gm.get_item(goal.id, it.id)!, goal, D)).toBe(0);
    expect(gm.linked_progress(gm.get_item(goal.id, it.id)!)).toEqual({ pct: 0, done: false });
  });

  it("N levels: progress propagates up and a branch's own links count as one more member", () => {
    const a = gm.create_item(goal.id, "A");
    const a1 = gm.create_item(goal.id, "A1", a.id);
    const a1x = gm.create_item(goal.id, "A1x", a1.id, { practice_links: ["project:folder:p"] });
    const a1y = gm.create_item(goal.id, "A1y", a1.id);
    gm.create_item(goal.id, "A2", a.id);
    practice = { ready: true, kataDates: new Set(), projects: [{ folder: "p", title: "P", state: "done", date: "2026-10-01", graded: true }] };
    gm.set_done(goal.id, a1y.id, D, true);
    const cur = (id: string) => gm.get_item(goal.id, id)!;
    expect(gm.item_progress(cur(a1x.id), goal, D)).toBe(1);
    expect(gm.item_progress(cur(a1.id), goal, D)).toBe(1);
    expect(gm.item_progress(cur(a.id), goal, D)).toBe(0.5); // A1 = 1, A2 = 0
    expect(gm.progress(goal, D)).toBe(0.5);
    // enlaces propios en una rama: un miembro más en su media
    gm.update_item(goal.id, a.id, { practice_links: ["project:folder:p"] });
    expect(gm.item_progress(cur(a.id), goal, D)).toBeCloseTo(2 / 3, 5);
    expect(gm.branch_done(cur(a.id), D)).toBe(false);
  });

  describe("promover / convertir / mover", () => {
    it("promotes a plain branch: its children become the first level of a new goal, tree intact", () => {
      const a = gm.create_item(goal.id, "Frontend", "", { priority: 4, due: new Date(2026, 11, 31), start: D, notes: "Notas", extra: { linked_folder: "Prog/Front" } });
      const b = gm.create_item(goal.id, "React", a.id);
      const c = gm.create_item(goal.id, "Hooks", b.id, { practice_links: ["kata:daily"] });
      const other = gm.create_item(goal.id, "Otra");
      gm.set_done(goal.id, c.id, D, true); // manual status is ignored here, but the file must survive
      const fresh = gm.promote_item(goal.id, a.id)!;

      expect(fresh.name).toBe("Frontend");
      expect([fresh.area, fresh.icon, fresh.colour]).toEqual(["programacion", "🛠", "#112233"]); // heredados
      expect(fresh.priority).toBe(4);
      expect(fresh.description).toBe("Notas");
      expect(fresh.extra.linked_folder).toBe("Prog/Front");
      expect(fresh.end!.getFullYear()).toBe(2026);

      const g2 = new GoalManager(dir);
      expect(g2.get_item(goal.id, a.id)).toBeNull();
      expect(g2.items(goal.id).map((i) => i.name)).toEqual(["Otra"]);
      expect(g2.get_item(goal.id, other.id)).not.toBeNull();
      expect(g2.tree(fresh.id).map((i) => i.name)).toEqual(["React"]);
      const react = g2.tree(fresh.id)[0]!;
      expect(react.children.map((i) => i.name)).toEqual(["Hooks"]);
      expect(react.children[0]!.practice_links).toEqual(["kata:daily"]);
      expect(react.children[0]!.goal).toBe(fresh.id);
    });

    it("a submeta with its own links keeps itself as the only root so nothing is lost", () => {
      gm.topicLookup = () => topic("t", true);
      const a = gm.create_item(goal.id, "Tema", "", { topic_links: ["T/uno"], practice_links: ["kata:daily"], habit_links: ["h1"] });
      const kid = gm.create_item(goal.id, "Hija", a.id);
      const fresh = gm.promote_item(goal.id, a.id)!;
      const g2 = new GoalManager(dir);
      g2.topicLookup = gm.topicLookup;
      const roots = g2.tree(fresh.id);
      expect(roots.map((i) => i.name)).toEqual(["Tema"]);
      expect(roots[0]!.topic_links).toEqual(["T/uno"]);
      expect(roots[0]!.practice_links).toEqual(["kata:daily"]);
      expect(roots[0]!.habit_links).toEqual(["h1"]);
      expect(roots[0]!.children.map((i) => i.name)).toEqual(["Hija"]);
      expect(g2.items(goal.id)).toEqual([]);
      expect(kid.id).toBeTruthy();
    });

    it("promoting moves the registro marks of a repeating child so its history survives", () => {
      const a = gm.create_item(goal.id, "Rama");
      const r = gm.create_item(goal.id, "Diaria", a.id, { repeat: "daily", start: D });
      gm.set_done(goal.id, r.id, D, true);
      const fresh = gm.promote_item(goal.id, a.id)!;
      const g2 = new GoalManager(dir);
      const log = g2.log(D);
      expect(Object.keys(log.items)).toEqual([`${fresh.id}/${r.id}`]);
      expect(g2.is_done_on(g2.get_item(fresh.id, r.id)!, D)).toBe(true);
    });

    it("converts a goal into a submeta of another goal with all its levels, then the goal is gone", () => {
      const src = gm.create_goal("Mates", { priority: 4, start: D, end: new Date(2026, 10, 1), status: STATUS_DONE, description: "Desc" });
      const x = gm.create_item(src.id, "X");
      const y = gm.create_item(src.id, "Y", x.id, { practice_links: ["project:weekly"] });
      const host = gm.create_item(goal.id, "Anfitriona");
      const item = gm.demote_goal(src.id, goal.id, host.id)!;

      expect(item.name).toBe("Mates");
      expect(item.parent).toBe(host.id);
      expect(item.priority).toBe(4);
      expect(item.notes).toBe("Desc");
      expect(item.status).toBe(ITEM_DONE);
      const g2 = new GoalManager(dir);
      expect(g2.get_goal(src.id)).toBeNull();
      const tree = g2.get_item(goal.id, host.id)!.children[0]!;
      expect(tree.name).toBe("Mates");
      expect(tree.children.map((i) => i.name)).toEqual(["X"]);
      expect(tree.children[0]!.children[0]!.practice_links).toEqual(["project:weekly"]);
      expect(tree.children[0]!.children[0]!.id).toBe(y.id);
      expect(g2.demote_goal(goal.id, goal.id)).toBeNull(); // no consigo misma
    });

    it("moves a submeta with its subtree to another goal and keeps progress", () => {
      const dst = gm.create_goal("Otra meta");
      const a = gm.create_item(goal.id, "A");
      const a1 = gm.create_item(goal.id, "A1", a.id);
      gm.set_done(goal.id, a1.id, D, true);
      const moved = gm.move_item_to_goal(goal.id, a.id, dst.id)!;
      const g2 = new GoalManager(dir);
      expect(g2.items(goal.id)).toEqual([]);
      expect(g2.tree(dst.id).map((i) => i.name)).toEqual(["A"]);
      expect(g2.item_progress(g2.get_item(dst.id, moved.id)!, dst, D)).toBe(1);
      expect(g2.move_item_to_goal(dst.id, moved.id, "no-existe")).toBeNull();
    });
  });
});

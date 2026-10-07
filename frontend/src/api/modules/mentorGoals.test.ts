// El Mentor crea metas con el estudiante: conversación con IA simulada, borrador calculado por la app
// y escritura SOLO al confirmar (`mentor_goal_create`), con topic_links a temas reales.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
  },
}));

import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";
import { goalsApi } from "./goals.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---
type: topic
subject: programming
title: "${title}"
skills: [implement, debug]
mastery:
  min_per_skill: 6
  target_difficulty: 3
  exam: none
---
`;

const FUND = "Programación/Python/1 Fundamentos";
const APIS = "Programación/Python/2 APIs web";

let dir: string;
let app: AppState;

function topic(rel: string, title: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}

const goalsOnDisk = () => (fs.existsSync(path.join(dir, ".notevault", "goals")) ? fs.readdirSync(path.join(dir, ".notevault", "goals")) : []);

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  Object.assign(hoisted.store, { provider: "deepseek", api_key: "sk-test", model: "m" });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_goals_"));
  topic(FUND, "1 Fundamentos");
  topic(APIS, "2 APIs web");
  app = new AppState(dir);
  vaultScan(app); // índice caliente: si no, la API responde `loading`
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const draftJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "goal_draft",
    name: "Backend con Python",
    rationale: "Primero bases y luego APIs.",
    hoursPerWeek: 6,
    durationWeeks: 12,
    topics: [
      { folder: FUND, why: "base del lenguaje" },
      { folder: "Programación/Django/Inventado", why: "no existe" },
      { folder: APIS, why: "tu primer backend" },
    ],
    ...over,
  });

describe("mentor_chat", () => {
  it("sin IA lo dice con claridad, no inventa borrador y no persiste nada", async () => {
    for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
    const send = vi.fn();
    const res: any = await mentorApi(app, send).mentor_chat({ message: "quiero backend en 3 meses" });
    expect(res).toMatchObject({ loading: false, kind: "no_ai" });
    expect(res.text).toMatch(/no está configurada/);
    expect(res.draft).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor"))).toBe(false);
  });

  it("pregunta -> respuesta del usuario -> borrador calculado, con catálogo real y sin escribir metas", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ type: "question", text: "¿Cuántas horas por semana tienes y qué nivel de Python?" }))
      .mockResolvedValueOnce("```json\n" + draftJson() + "\n```");
    const api = mentorApi(app, send);

    const q: any = await api.mentor_chat({ message: "tengo que estudiar backend enfocado en Python y tengo 3 meses" });
    expect(q).toMatchObject({ kind: "question" });
    expect(q.text).toContain("horas por semana");

    // la IA vio el catálogo de temas reales (carpetas), no notas
    const system = (send.mock.calls[0]![1] as any[])[0].content as string;
    expect(system).toContain(`folder=${FUND}`);
    expect(system).toContain(`folder=${APIS}`);
    expect(system).not.toContain("CONTENIDO_SECRETO");

    const d: any = await api.mentor_chat({ message: "6 horas por semana, nivel básico" });
    expect(d.kind).toBe("draft");
    // el segundo turno llevaba la conversación
    const secondMessages = send.mock.calls[1]![1] as any[];
    expect(secondMessages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(secondMessages[1].content).toContain("backend");
    expect(secondMessages[3].content).toBe("6 horas por semana, nivel básico");

    // temas inventados descartados y reportados; calendario calculado por la app
    expect(d.draft.topics.map((t: any) => t.folder)).toEqual([FUND, APIS]);
    expect(d.draft.discarded).toEqual(["Programación/Django/Inventado"]);
    expect(d.draft.schedule.items).toHaveLength(2);
    expect(d.draft.schedule.items[0].topic_links).toEqual([FUND]);
    expect(d.draft.schedule.hoursPerWeek).toBe(6);
    expect(d.pending).toBe(d.turns[d.turns.length - 1].id);

    // todo persistido en .notevault/mentor, y ninguna meta escrita
    expect(api.mentor_chat_load().turns).toHaveLength(4);
    expect(fs.readdirSync(path.join(dir, ".notevault", "mentor", "chats")).filter((f) => f !== "index.json")).toHaveLength(1);
    expect(goalsOnDisk()).toEqual([]);
  });

  it("si faltan horas o plazo, pregunta en vez de adivinar", async () => {
    const send = vi.fn().mockResolvedValueOnce(draftJson({ hoursPerWeek: undefined }));
    const res: any = await mentorApi(app, send).mentor_chat({ message: "backend" });
    expect(res.kind).toBe("question");
    expect(res.text).toContain("horas por semana");
    expect(res.draft).toBeUndefined();
  });

  it("errores de la IA y respuestas inválidas se informan sin escribir", async () => {
    const api = mentorApi(app, vi.fn().mockRejectedValueOnce(new Error("red caída")).mockResolvedValueOnce("hola, no soy JSON"));
    expect(await api.mentor_chat({ message: "a" })).toMatchObject({ kind: "error", text: expect.stringContaining("red caída") });
    expect(await api.mentor_chat({ message: "b" })).toMatchObject({ kind: "error" });
    await expect(api.mentor_chat({ message: "  " })).rejects.toThrow(ApiError);
    expect(goalsOnDisk()).toEqual([]);
  });

  it("un ajuste vuelve a generar el borrador con la historia (borrador previo incluido)", async () => {
    const send = vi.fn().mockResolvedValueOnce(draftJson()).mockResolvedValueOnce(draftJson({ durationWeeks: 16, topics: [{ folder: FUND, why: "solo bases" }] }));
    const api = mentorApi(app, send);
    await api.mentor_chat({ message: "backend 3 meses 6 h/semana" });
    const second: any = await api.mentor_chat({ message: "hazlo en 4 meses y quita las APIs" });
    const hist = (send.mock.calls[1]![1] as any[])[2].content as string;
    expect(hist).toContain('"goal_draft"');
    expect(hist).toContain(APIS);
    expect(second.draft.topics.map((t: any) => t.folder)).toEqual([FUND]);
    expect(second.draft.schedule.end).toBe(second.draft.schedule.items.length ? second.draft.schedule.end : "");
    expect(Math.round((Date.parse(second.draft.schedule.end) - Date.parse(second.draft.schedule.start)) / 86400000)).toBe(16 * 7);
  });

  it("descartar no escribe ninguna meta", async () => {
    const api = mentorApi(app, vi.fn().mockResolvedValueOnce(draftJson()));
    const d: any = await api.mentor_chat({ message: "backend" });
    const after = api.mentor_draft_discard(d.pending);
    expect(after.pending).toBeNull();
    expect(goalsOnDisk()).toEqual([]);
    expect(() => api.mentor_draft_discard("nope")).toThrow(ApiError);
  });
});

describe("mentor_goal_create", () => {
  async function draft(api = mentorApi(app, vi.fn().mockResolvedValueOnce(draftJson()))) {
    const d: any = await api.mentor_chat({ message: "backend" });
    return { api, res: d, draft: d.draft, turnId: d.pending as string };
  }

  it("crea la meta y una submeta por tema con topic_links, y su progreso se deriva del tema", async () => {
    const { api, draft: dr, turnId } = await draft();
    const out = api.mentor_goal_create({ draft: dr, turnId });
    expect(out.items).toBe(2);

    const gm = app.mgrs().goals;
    const goal = gm.getGoal(out.goalId)!;
    expect(goal.name).toBe("Backend con Python");
    expect(goal.end).not.toBeNull();
    const items = gm.items(out.goalId).sort((a, b) => a.order - b.order);
    expect(items.map((i) => i.topic_links)).toEqual([[FUND], [APIS]]);
    expect(items.every((i) => i.due && i.start)).toBe(true);
    expect(items[0]!.due!.getTime()).toBeLessThan(items[1]!.due!.getTime());

    // el progreso se deriva del tema (existe, no está roto, aún 0 %) y la meta lo refleja
    const detail: any = goalsApi(app).goals_get(out.goalId);
    for (const it of detail.items) {
      expect(it.topic_progress.broken).toEqual([]);
      expect(it.topic_progress.links[0]).toMatchObject({ broken: false, pct: 0 });
    }
    expect(detail.stats.progress).toBe(0);

    // el borrador queda marcado como creado
    const turn = api.mentor_chat_load().turns.find((t) => t.id === turnId)!;
    expect(turn.createdGoalId).toBe(out.goalId);
    expect(api.mentor_chat_load().pending).toBeNull();
  });

  it("recalcula con los temas que existen ahora: no confía en la UI ni crea enlaces a temas inexistentes", async () => {
    const { api, draft: dr } = await draft();
    const tampered = {
      ...dr,
      topics: [...dr.topics, { folder: "Programación/Falso", title: "Falso", subject: "x", skills: [], why: "", estMinutes: 99999 }],
      schedule: { ...dr.schedule, items: [{ name: "x", topic_links: ["Programación/Falso"] }] },
    };
    const out = api.mentor_goal_create({ draft: tampered });
    const links = app.mgrs().goals.items(out.goalId).sort((a, b) => a.order - b.order).flatMap((i) => i.topic_links);
    expect(links).toEqual([FUND, APIS]);
  });

  it("valida la entrada y no escribe si ningún tema existe", async () => {
    const { api, draft: dr } = await draft();
    expect(() => api.mentor_goal_create({ draft: { ...dr, topics: [{ folder: "No/existe" }] } })).toThrow(/ya en tu sistema/);
    expect(() => api.mentor_goal_create({ draft: { ...dr, schedule: { ...dr.schedule, start: "ayer" } } })).toThrow(ApiError);
    expect(() => api.mentor_goal_create({ draft: { ...dr, schedule: { ...dr.schedule, hoursPerWeek: 0 } } })).toThrow(ApiError);
    expect(() => api.mentor_goal_create({})).toThrow(ApiError);
    expect(goalsOnDisk()).toEqual([]);
  });

  it("solo toca .notevault/goals y .notevault/mentor", async () => {
    const { api, draft: dr, turnId } = await draft();
    api.mentor_goal_create({ draft: dr, turnId });
    const top = fs.readdirSync(dir).sort();
    expect(top).toEqual([".notevault", "Programación"]);
  });
});

describe("mentor_panels", () => {
  it("devuelve metas activas con sus submetas y progreso por tema, proyectos y temas", async () => {
    const api = mentorApi(app, vi.fn().mockResolvedValueOnce(draftJson()));
    const d: any = await api.mentor_chat({ message: "backend" });
    const out = api.mentor_goal_create({ draft: d.draft, turnId: d.pending });
    app.mgrs().projects.create("Mi app", {});
    const p: any = api.mentor_panels();
    expect(p.loading).toBe(false);
    expect(p.goals).toHaveLength(1);
    expect(p.goals[0].card.id).toBe(out.goalId);
    expect(p.goals[0].items).toHaveLength(2);
    expect(p.goals[0].items[0].topic_progress.links[0].title).toBe("1 Fundamentos");
    expect(p.study.topics.total).toBe(2);
    expect(p.study.topics.untreated).toBe(2);
    expect(p.study.areas).toHaveLength(1);
    expect(p.study.areas[0]).toMatchObject({ id: "Programación", total: 2, untreated: 2, inProgress: 0, complete: 0, avgPct: 0, srsDue: 0, errors: 0 });
    expect(p.study.areas[0].groups[0].topics.map((t: any) => t.status)).toEqual(["untreated", "untreated"]);
    expect(Array.isArray(p.projects)).toBe(true);
  });
});

describe("Historial del Mentor (conversaciones propias)", () => {
  const chatsDir = () => path.join(dir, ".notevault", "mentor", "chats");
  const files = () => (fs.existsSync(chatsDir()) ? fs.readdirSync(chatsDir()).filter((f) => f !== "index.json") : []);
  const ask = (api: ReturnType<typeof mentorApi>, message: string) => api.mentor_chat({ message });
  const question = () => vi.fn().mockResolvedValue(JSON.stringify({ type: "question", text: "¿Cuántas horas por semana?" }));

  it("migra el chat.json anterior como primera conversación, sin tocar el original ni perder turnos", () => {
    const legacy = {
      version: 1,
      turns: [
        { id: "t1", role: "user", content: "backend con Python desde cero en tres meses, por favor y gracias", at: "2026-10-05T10:00:00" },
        { id: "t2", role: "assistant", content: "Borrador", at: "2026-10-05T10:00:03", draft: { name: "Backend con Python desde cero", topics: [], schedule: { items: [] }, discarded: [] } },
      ],
    };
    const legacyFile = path.join(dir, ".notevault", "mentor", "chat.json");
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(legacyFile, JSON.stringify(legacy), "utf-8");
    const before = fs.readFileSync(legacyFile, "utf-8");

    const api = mentorApi(app, question());
    const list = api.mentor_chats_list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ count: 2, active: true });
    expect(list[0]!.title).toContain("backend con Python desde cero");
    const loaded = api.mentor_chat_load();
    expect(loaded.turns.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(loaded.pending).toBe("t2"); // el borrador pendiente sigue visible
    expect(loaded.turns[1]!.draft).toMatchObject({ name: "Backend con Python desde cero" });
    expect(fs.readFileSync(legacyFile, "utf-8")).toBe(before);

    // migrar es de una vez: borrar la conversación no la resucita desde chat.json
    api.mentor_chat_delete(loaded.id);
    expect(api.mentor_chats_list()).toEqual([]);
    expect(api.mentor_chat_load().turns).toEqual([]);
  });

  it("lista, abre, renombra, borra y crea conversaciones; el título sale del primer mensaje", async () => {
    const api = mentorApi(app, question());
    await ask(api, "quiero aprender backend con Python en tres meses");
    const first = api.mentor_chat_load();
    expect(first.title).toBe("quiero aprender backend con Python en tres meses");

    const second = api.mentor_chat_new();
    expect(second.id).not.toBe(first.id);
    expect(second.turns).toEqual([]);
    await ask(api, "necesito repasar álgebra lineal");

    const list = api.mentor_chats_list();
    expect(list.map((c) => c.title).sort()).toEqual(["necesito repasar álgebra lineal", "quiero aprender backend con Python en tres meses"]);
    expect(list.find((c) => c.active)!.id).toBe(second.id);

    // abrir cambia la activa y mentor_chat opera sobre ella
    const opened = api.mentor_chat_open(first.id);
    expect(opened.turns).toHaveLength(2);
    await ask(api, "tres horas por semana");
    expect(api.mentor_chat_load().turns).toHaveLength(4);
    expect(api.mentor_chats_list().find((c) => c.id === second.id)!.count).toBe(2);

    expect(api.mentor_chat_rename(first.id, "  Mi backend  ")).toEqual({ id: first.id, title: "Mi backend" });
    expect(() => api.mentor_chat_rename(first.id, "  ")).toThrow(ApiError);
    expect(api.mentor_chats_list().find((c) => c.id === first.id)!.title).toBe("Mi backend");

    // borrar la activa deja activa otra
    const after = api.mentor_chat_delete(first.id);
    expect(after.id).toBe(second.id);
    expect(api.mentor_chats_list()).toHaveLength(1);
    expect(() => api.mentor_chat_open(first.id)).toThrow(ApiError);
    expect(() => api.mentor_chat_delete("../../x")).toThrow(ApiError);
  });

  it("'nueva' reutiliza la conversación activa si está vacía y no lista conversaciones vacías", () => {
    const api = mentorApi(app, question());
    const a = api.mentor_chat_new();
    const b = api.mentor_chat_new();
    expect(b.id).toBe(a.id);
    expect(api.mentor_chats_list()).toEqual([]);
  });

  it("el historial del Mentor no se mezcla con el del asistente (vive solo bajo .notevault/mentor/)", async () => {
    const api = mentorApi(app, question());
    await ask(api, "hola mentor");
    expect(files()).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, ".notevault", "conversations"))).toBe(false);
  });
});

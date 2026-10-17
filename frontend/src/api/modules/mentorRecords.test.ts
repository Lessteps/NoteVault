// Registros de sesión de punta a punta con una vault temporal: la evidencia sale SOLO de la ventana de la sesión, se escriben las notas legibles en
// `_registro/`, los 90 días caducan el detalle y dejan la semana, y «Repensar el plan» propone (con y sin IA) sin tocar nada hasta aplicar.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { SessionRecordStore } from "../../core/mentor/sessionRecordStore.js";
import { addDays } from "../../lib/planTime.js";
import { _setSettingsFileForTest, AppConfig } from "../appConfig.js";
import { AppState } from "../appState.js";
import { mentorRecordsApi, renderRefuerzoTemplate } from "./mentorRecords.js";

let dir: string;
let app: AppState;
let id = "";
const TODAY = "2026-10-16";
const A = "Programación/4 Backend/4.1 Uno";
const B = "Programación/4 Backend/4.2 Dos";
const put = (rel: string, text: string) => {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf-8");
};
const read = (rel: string) => fs.readFileSync(path.join(dir, ...rel.split("/")), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(dir, ...rel.split("/")));
const at = (h: number, m: number, d = TODAY) => `${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
const ms = (h: number, m: number, d = TODAY) => Date.parse(at(h, m, d));

const attempt = (name: string, notePath: string, when: string, score = 40) =>
  put(`.notevault/estudio/intentos/${name}.json`, JSON.stringify({ note_id: name, note_path: notePath, draft: "", attempts: [{ at: when, skill: "design", score, verdict: score < 60 ? "partial" : "correct", subject: "programming", discipline: "programming" }] }));
const error = (name: string, source: string, when: string) =>
  put(`.notevault/estudio/errores/${name}.json`, JSON.stringify({ id: name, category: "conceptual", subject: "programming", topic: "4.1 Uno", source_note: source, occurred_at: when, skill: "design", repeat_count: 2, description_en: "PUT vs PATCH" }));

const api = (send?: (...a: any[]) => Promise<string>) => mentorRecordsApi(app, { today: () => TODAY, now: () => `${TODAY}T16:00:00.000Z`, ...(send ? { send: send as never } : {}) });
const save = (over: Record<string, unknown> = {}) =>
  api().mentor_record_save({
    id, areaKey: "backend", date: TODAY, startedAt: ms(14, 30), minutes: 50, mode: "timer", assessmentId: "as1",
    assigned: [{ kind: "topic", folder: A, title: "4.1 Uno", status: "partial" }, { kind: "task", folder: "manual:task:x", title: "Terminar login", status: "done" }],
    assessment: { understanding: 2, focus: 4, practiced: true, learned: "Cómo validar", doubt: "El token expira", errors: "PUT vs PATCH" }, ...over,
  }) as any;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_rec_"));
  _setSettingsFileForTest(path.join(dir, "settings.json"));
  put(`${A}/4.1 Uno.md`, "# Uno\n");
  put(`${B}/4.2 Dos.md`, "# Dos\n");
  app = new AppState(dir);
  const seed = { area: "Programación", objective: "x", topics: [A, B].map((f, i) => ({ folder: f, title: f.split("/").pop()!, estMinutes: 60, targetWeek: i + 1 })) };
  const start = "2026-10-06";
  const end = addDays(start, 100);
  const built = buildPlan([seed], { id: `${start}_${end}`, start, end, minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", from: start, preconditions: { start, end, minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no" } as never, name: "Plan" }).plan;
  new PlanStore(dir).save({ ...built, structure: "areas", subplans: built.subplans.map((s) => ({ ...s, areaId: "backend", area: "Backend" })) });
  id = built.id;
});
afterEach(() => {
  _setSettingsFileForTest(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("guardar una sesión", () => {
  it("une la sesión con la evidencia de SU ventana de tiempo y de SUS temas, y escribe la nota legible", () => {
    attempt("a_in", `${A}/Ejercicios/design/ej_1.md`, at(14, 40), 35); // dentro
    attempt("a_late", `${A}/Ejercicios/design/ej_2.md`, at(14, 54), 80); // 4 min después de acabar: aún cuenta
    attempt("a_before", `${A}/Ejercicios/design/ej_3.md`, at(13, 0), 10); // antes de empezar
    attempt("a_other", "Otra materia/Tema/ej.md", at(14, 45), 10); // otro tema
    error("e_in", `${A}/Ejercicios/design/ej_1.md`, at(14, 41));
    error("e_before", `${A}/Ejercicios/design/ej_3.md`, at(9, 0));
    put(`${A}/4.1 Uno.md`, "# Uno editado\n"); // mtime = ahora; la ventana es de hace horas, así que NO cuenta
    const r = save();
    expect(r.duplicate).toBe(false);
    expect(r.record.evidence.attempts.map((x: any) => x.score).sort((a: number, b: number) => a - b)).toEqual([35, 80]);
    expect(r.record.evidence.attempts[0].topic).toBe(A);
    expect(r.record.evidence.errors).toHaveLength(1);
    expect(r.record.evidence.errors[0]).toMatchObject({ folder: A, repeat: 2, category: "conceptual" });
    expect(r.record.evidence.filesTouched).toEqual([]);
    expect(r.rel).toBe("Programación/_registro/2026-10-16/1430 Backend.md");
    const md = read(r.rel);
    expect(md).toContain("registro: sesion");
    expect(md).toContain("[[4.1 Uno]] — a medias");
    expect(md).toContain("Intentos: 2");
    expect(exists("Programación/_registro/puntos-debiles.md")).toBe(true);
    expect(exists("Programación/_registro/semana-2026-W42.md")).toBe(true);
    // el JSON de la app existe y es el canónico
    expect(new SessionRecordStore(dir, id).list()).toHaveLength(1);
  });

  it("reintentar el guardado de la misma evaluación no duplica la sesión", () => {
    save();
    const again = save();
    expect(again.duplicate).toBe(true);
    expect(new SessionRecordStore(dir, id).list()).toHaveLength(1);
  });

  it("los archivos del tema editados DENTRO de la ventana cuentan como tocados", () => {
    const abs = path.join(dir, ...`${A}/4.1 Uno.md`.split("/"));
    const when = new Date(ms(14, 45));
    fs.utimesSync(abs, when, when);
    const r = save();
    expect(r.record.evidence.filesTouched).toEqual([`${A}/4.1 Uno.md`]);
  });

  it("rechaza lo inválido y un plan que no existe", () => {
    expect(() => save({ minutes: 0 })).toThrow(/no es válida/);
    expect(() => save({ date: "hoy" })).toThrow(/fecha/);
    expect(() => api().mentor_record_save({ id: "../x" })).toThrow(/Plan inválido/);
    expect(() => api().mentor_record_save({ id: "2020-01-01_2020-02-01" })).toThrow(/ya no existe/);
  });

  it("a los 90 días el detalle caduca (JSON y nota) y queda el resumen de la semana; lo reciente se conserva", () => {
    const old = "2026-06-01";
    save({ date: old, startedAt: ms(10, 0, old), assessmentId: "old1" }); // ya está fuera de los 90 días: se guarda y caduca en el acto
    const st = new SessionRecordStore(dir, id);
    expect(st.list()).toEqual([]);
    expect(exists("Programación/_registro/2026-06-01/1000 Backend.md")).toBe(false);
    expect(st.weeks().map((w) => w.week)).toContain("2026-W23");
    expect(read("Programación/_registro/semana-2026-W23.md")).toContain("Sesiones: **1**");
    save({ assessmentId: "new1" }); // una sesión de hoy no toca el resumen viejo
    expect(st.list().map((r) => r.date)).toEqual([TODAY]);
    expect(read("Programación/_registro/semana-2026-W23.md")).toContain("Sesiones: **1**");
    // 80 días: aún dentro de la retención
    save({ date: "2026-07-28", startedAt: ms(9, 0, "2026-07-28"), assessmentId: "mid1" });
    expect(st.list().map((r) => r.date)).toContain("2026-07-28");
  });
});

describe("repensar el plan con los registros", () => {
  const three = () => {
    for (let i = 0; i < 3; i++) save({ date: `2026-10-${10 + i}`, startedAt: ms(14, 30, `2026-10-${10 + i}`), assessmentId: `s${i}` });
    for (let i = 0; i < 3; i++) error(`rep${i}`, `${A}/Ejercicios/design/ej_${i}.md`, at(14, 40, `2026-10-${10 + i}`));
    // los errores se leen al guardar: se vuelven a guardar con ellos presentes
    for (let i = 0; i < 3; i++) save({ date: `2026-10-${13 + i}`, startedAt: ms(14, 30, `2026-10-${13 + i}`), assessmentId: `t${i}` });
  };

  it("sin sesiones no inventa nada", async () => {
    const r: any = await api().mentor_records_rethink({ id });
    expect(r.proposals).toEqual([]);
    expect(r.note).toContain("Aún no hay sesiones");
  });

  it("sin IA propone por reglas: siempre a confirmar, con la sesión que lo demuestra, y no escribe notas", async () => {
    three();
    const before = fs.readdirSync(path.join(dir, ...A.split("/"))).length;
    const r: any = await api().mentor_records_rethink({ id, noAi: true });
    expect(r.source).toBe("rules");
    expect(r.proposals.length).toBeGreaterThan(0);
    const kinds = r.proposals.map((p: any) => p.kind);
    expect(kinds).toContain("bridge_note");
    for (const p of r.proposals) expect(p).toMatchObject({ status: "open", needsConfirmation: true });
    expect(r.proposals.find((p: any) => p.kind === "bridge_note").evidence.length).toBeGreaterThan(0);
    expect(fs.readdirSync(path.join(dir, ...A.split("/"))).length).toBe(before);
    expect(fs.existsSync(path.join(dir, A, "_Nota puente — 4.1 Uno.md"))).toBe(false);
  });

  it("con IA: una llamada con un resumen, la salida se valida (temas y sesiones que existen) y lo inventado se descarta", async () => {
    three();
    AppConfig.set_ai_config({ provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
    const send = vi.fn(async () => JSON.stringify({ proposals: [
      { kind: "reinforce", folder: A, skill: "design", title: "Reforzar diseño de endpoints", why: "6 errores de PUT/PATCH", recordIds: ["r-s0", "r-s1", "nope"] },
      { kind: "reinforce", folder: "Programación/No existe/Tema", title: "x", why: "x", recordIds: ["r-s0"] },
      { kind: "bridge_note", folder: A, title: "sin evidencia", why: "x", recordIds: ["inventada"] },
      { kind: "borrar_todo", folder: A, title: "x", why: "x", recordIds: ["r-s0"] },
    ] }));
    const r: any = await api(send).mentor_records_rethink({ id });
    expect(send).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify((send.mock.calls[0] as any[])[1]);
    expect(prompt).toContain("Dominio por tema");
    expect(r.source).toBe("ai");
    const ai = r.proposals.filter((p: any) => p.source === "ai");
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ kind: "reinforce", folder: A, skill: "design", needsConfirmation: true });
    expect(ai[0].evidence.map((e: any) => e.recordId)).toEqual(["r-s0", "r-s1"]);
  });

  it("si la IA falla o contesta basura se queda con las reglas y lo dice", async () => {
    three();
    AppConfig.set_ai_config({ provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
    const bad: any = await api(async () => "no es json").mentor_records_rethink({ id });
    expect(bad.source).toBe("rules");
    expect(bad.note).toContain("no devolvió propuestas válidas");
    const boom: any = await api(async () => { throw new Error("límite"); }).mentor_records_rethink({ id });
    expect(boom.source).toBe("rules");
    expect(boom.note).toContain("límite");
  });

  it("descartar y aplicar se recuerdan entre revisiones; aplicar guarda la línea base", async () => {
    three();
    const first: any = await api().mentor_records_rethink({ id, noAi: true });
    const [p1, p2] = first.proposals;
    await api().mentor_proposal_set({ id, proposalId: p1.id, status: "dismissed" });
    const r: any = api().mentor_proposal_set({ id, proposalId: p2.id, status: "applied" });
    const applied = r.proposals.find((p: any) => p.id === p2.id);
    expect(applied.status).toBe("applied");
    expect(applied.appliedAt).toBeTruthy();
    expect(applied.baseline).toBeTruthy();
    expect(applied.followUp.verdict).toBe("pending");
    const again: any = await api().mentor_records_rethink({ id, noAi: true });
    expect(again.proposals.find((p: any) => p.id === p1.id).status).toBe("dismissed");
    expect(again.proposals.find((p: any) => p.id === p2.id).status).toBe("applied");
    expect(() => api().mentor_proposal_set({ id, proposalId: "nope", status: "dismissed" })).toThrow(/ya no existe/);
  });
});

describe("aplicar una propuesta de nota", () => {
  const prepare = async () => {
    for (let i = 0; i < 3; i++) save({ date: `2026-10-${12 + i}`, startedAt: ms(14, 30, `2026-10-${12 + i}`), assessmentId: `s${i}` });
    const r: any = await api().mentor_records_rethink({ id, noAi: true });
    return r.proposals.find((p: any) => p.kind === "bridge_note");
  };

  it("la vista previa dice qué crearía y no escribe; aplicar crea la nota SIN sobrescribir y marca la propuesta", async () => {
    const p = await prepare();
    const prev: any = await api().mentor_proposal_apply({ id, proposalId: p.id, preview: true });
    expect(prev).toMatchObject({ rel: `${A}/_Nota puente — 4.1 Uno.md`, created: false });
    expect(exists(prev.rel)).toBe(false);
    const done: any = await api().mentor_proposal_apply({ id, proposalId: p.id });
    expect(done).toMatchObject({ rel: prev.rel, created: true, source: "rules" });
    const md = read(done.rel);
    expect(md).toContain("registro: refuerzo");
    expect(md).toContain("El token expira"); // las dudas registradas, tal cual
    expect(md).toContain("[[4.1 Uno]]");
    // una segunda aplicación no pisa la primera
    put(done.rel, "MI VERSIÓN");
    const second: any = await api().mentor_proposal_apply({ id, proposalId: p.id });
    expect(second.rel).toBe(`${A}/_Nota puente — 4.1 Uno (2).md`);
    expect(read(done.rel)).toBe("MI VERSIÓN");
    const list: any = api().mentor_records_list({ id });
    expect(list.proposals.find((x: any) => x.id === p.id).status).toBe("applied");
  });

  it("con IA escribe el cuerpo que devuelve (validado) y si es demasiado corto usa las reglas", async () => {
    const p = await prepare();
    AppConfig.set_ai_config({ provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
    const body = `## Qué falló\n- confundes la expiración\n\n## Explicación\n${"El token tiene una caducidad y el servidor debe responder 401. ".repeat(6)}\n\n## Autoevaluación\n- ¿Qué devuelve el servidor?\n`;
    const ok: any = await api(async () => "```markdown\n" + body + "\n```").mentor_proposal_apply({ id, proposalId: p.id });
    expect(ok.source).toBe("ai");
    expect(read(ok.rel)).toContain("## Explicación");
    expect(read(ok.rel)).toContain("registro: refuerzo");
    const short: any = await api(async () => "ok").mentor_proposal_apply({ id, proposalId: p.id });
    expect(short.source).toBe("rules");
  });

  it("solo las propuestas de nota crean notas", async () => {
    await prepare();
    const list: any = api().mentor_records_list({ id });
    const review = list.proposals.find((x: any) => x.kind === "move_review");
    await expect(api().mentor_proposal_apply({ id, proposalId: review.id })).rejects.toThrow(/no crea notas/);
  });
});

describe("listado y plantilla", () => {
  it("el listado trae las sesiones, el dominio, los patrones y la carpeta de las notas", () => {
    save();
    const l: any = api().mentor_records_list({ id });
    expect(l.records).toHaveLength(1);
    expect(l.noteDir).toBe("Programación/_registro");
    expect(l.retentionDays).toBe(90);
    expect(l.overview.mastery[0]).toMatchObject({ folder: A, sessions: 1 });
    expect(l.aiConfigured).toBe(false);
  });

  it("la plantilla de refuerzo no inventa: sin datos dice que no hay detalle", () => {
    const md = renderRefuerzoTemplate({ id: "pr-1", kind: "reinforce", title: "t", folder: A, skill: "design" }, [], TODAY);
    expect(md).toContain("Aún no hay detalle");
    expect(md).toContain("empieza por la skill «design»");
  });
});

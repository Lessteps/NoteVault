// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { generateTopicFromChat, type TopicActionDeps } from "./chatTopicActions";
import type { RegenHandoff, TopicRegenerateJob } from "./types";

const job = (over: Partial<TopicRegenerateJob> = {}): TopicRegenerateJob =>
  ({ id: "j", folder: "A/B/C", what: "theory", log: [], done: true, error: "", finished: 1, total: 1, backup: ".trash/regenerar/x", restored: false, created: [], archived: ["a"], ...over }) as TopicRegenerateJob;
const deps = (over: Partial<TopicActionDeps> = {}): TopicActionDeps => ({
  busy: async () => false,
  confirm: vi.fn(async () => true),
  start: vi.fn(async () => ({ jobId: "j" })),
  status: vi.fn(async () => job()),
  say: vi.fn(async () => undefined),
  toast: vi.fn(),
  refresh: vi.fn(),
  sleep: async () => undefined,
  pollMs: 0,
  ...over,
});

describe("generateTopicFromChat", () => {
  it("pasa por study_topic_regenerate (con confirmación) para la teoría y luego la práctica", async () => {
    const d = deps();
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(true);
    expect(d.confirm).toHaveBeenCalledTimes(1);
    expect(d.start).toHaveBeenNthCalledWith(1, "A/B/C", "theory", "app");
    expect(d.start).toHaveBeenNthCalledWith(2, "A/B/C", "practice", "app");
  });

  it("no hace nada si la persona cancela", async () => {
    const d = deps({ confirm: vi.fn(async () => false) });
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(false);
    expect(d.start).not.toHaveBeenCalled();
  });

  it("no compite con una generación del Mentor en curso", async () => {
    const d = deps({ busy: async () => true });
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(false);
    expect(d.confirm).not.toHaveBeenCalled();
    expect(d.start).not.toHaveBeenCalled();
    expect(d.toast).toHaveBeenCalledWith("error", expect.stringContaining("generación del Mentor en curso"));
  });

  it("espera a que termine el trabajo y se detiene en el primer fallo", async () => {
    const status = vi.fn().mockResolvedValueOnce(job({ done: false })).mockResolvedValueOnce(job({ error: "La IA falló — se restauró la teoría anterior." }));
    const d = deps({ status });
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(false);
    expect(status).toHaveBeenCalledTimes(2);
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith("error", expect.stringContaining("se restauró"));
  });
});

describe("generateTopicFromChat — motor elegido", () => {
  const h = { id: "h1", what: "all", topics: [], prompt: "p", status: "waiting" } as unknown as RegenHandoff;

  it("con «Claude» pasa el motor a study_topic_regenerate", async () => {
    const d = deps({ engine: () => "claude" });
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(true);
    expect(d.start).toHaveBeenNthCalledWith(1, "A/B/C", "theory", "claude");
    expect(d.start).toHaveBeenNthCalledWith(2, "A/B/C", "practice", "claude");
  });

  it("con el agente externo (p. ej. IA en modo puente) crea la tarea y la enseña en vez de fallar", async () => {
    const handoff = vi.fn(async () => h);
    const showHandoff = vi.fn();
    const d = deps({ engine: () => "handoff", handoff, showHandoff });
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(true);
    expect(handoff).toHaveBeenCalledWith("A/B/C");
    expect(showHandoff).toHaveBeenCalledWith(h);
    expect(d.start).not.toHaveBeenCalled();
    expect(d.say).toHaveBeenCalledWith(expect.stringContaining("Ya terminó — validar"));
  });

  it("si crear la tarea falla, lo cuenta en el chat y devuelve false", async () => {
    const d = deps({ engine: () => "handoff", handoff: vi.fn(async () => { throw new Error("sin carpeta"); }) });
    await expect(generateTopicFromChat("A/B/C", d)).resolves.toBe(false);
    expect(d.toast).toHaveBeenCalledWith("error", "sin carpeta");
    expect(d.say).toHaveBeenCalledWith(expect.stringContaining("sin carpeta"));
  });

  it("el bloqueo del Mentor y la cancelación valen también con el agente externo", async () => {
    const handoff = vi.fn(async () => h);
    await generateTopicFromChat("A/B/C", deps({ engine: () => "handoff", handoff, busy: async () => true }));
    await generateTopicFromChat("A/B/C", deps({ engine: () => "handoff", handoff, confirm: vi.fn(async () => false) }));
    expect(handoff).not.toHaveBeenCalled();
  });
});

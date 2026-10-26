import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { ChangeStore } from "../../core/mentor/planChange.js";
import { assistantApi } from "./assistant.js";
import { generationBusy, withGenerationLock } from "./generationLock.js";

/** Toma el turno de generación y lo mantiene hasta `release()` (ya con el turno tomado). */
async function holdLock(): Promise<{ release: () => void; done: Promise<void> }> {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((ok) => (started = ok));
  const done = withGenerationLock(
    () =>
      new Promise<void>((ok) => {
        release = ok;
        started();
      }),
  );
  await ready;
  return { release, done };
}

let dir: string;
let api: ReturnType<typeof assistantApi>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_chatguard_"));
  fs.mkdirSync(path.join(dir, "Mat"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Mat", "Derivadas.md"), "# Derivadas\n\nvieja\n", "utf-8");
  api = assistantApi(new AppState(dir));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("acciones del chat frente al turno de generación y al plan", () => {
  it("generationBusy refleja un turno en curso y en cola", async () => {
    expect(generationBusy()).toBe(false);
    const { release, done } = await holdLock();
    expect(api.assistant_generation_busy()).toBe(true);
    release();
    await done;
    expect(api.assistant_generation_busy()).toBe(false);
  });

  it("no aplica nada mientras corre una generación del Mentor", async () => {
    const { release, done } = await holdLock();
    expect(() => api.assistant_action_apply({ action: "edit_file", args: { path: "Mat/Derivadas.md", content: "# Nueva\n" } })).toThrow(/generación en curso/);
    expect(fs.readFileSync(path.join(dir, "Mat", "Derivadas.md"), "utf-8")).toContain("vieja");
    release();
    await done;
  });

  it("al reemplazar un archivo lo copia antes a .trash/regenerar", () => {
    const r: any = api.assistant_action_apply({ action: "edit_file", args: { path: "Mat/Derivadas.md", content: "# Nueva\n" } });
    expect(r.ok).toBe(true);
    expect(r.backedUp).toEqual(["Mat/Derivadas.md"]);
    const base = path.join(dir, ".trash", "regenerar");
    const [folder] = fs.readdirSync(base);
    expect(folder).toMatch(/_Mat$/);
    expect(fs.readFileSync(path.join(base, folder!, "Derivadas.md"), "utf-8")).toContain("vieja");
    expect(fs.readFileSync(path.join(dir, "Mat", "Derivadas.md"), "utf-8")).toContain("Nueva");
  });

  it("anota el cambio en el historial del plan sin poder deshacerlo", () => {
    expect(api.assistant_plan_note("2026-10-06_2027-04-05", "Chat de notas: Temas nuevos", "Entran al final.")).toMatchObject({ ok: true, n: 1 });
    const [e] = new ChangeStore(dir).list("2026-10-06_2027-04-05");
    expect(e).toMatchObject({ status: "answered", kind: "question", comment: "Chat de notas: Temas nuevos", answer: "Entran al final." });
    expect(() => api.assistant_plan_note("../x", "a")).toThrow(/Plan inválido/);
  });
});

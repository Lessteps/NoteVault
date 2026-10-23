// Caché de la foto de temas del Mentor: se reutiliza sin cambios y NUNCA sirve datos viejos tras una escritura.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAYOUT } from "../../core/vaultFormat.js";
import { examDir } from "../../core/practice/exams.js";
import { cachedTopicSnaps, clearTopicSnapCache, TOPIC_SNAP_TTL_MS } from "./topicSnapCache.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv-snapcache-"));
  clearTopicSnapCache();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const writeJson = (dir: string, name: string, body: unknown): void => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(body));
};

describe("cachedTopicSnaps", () => {
  it("reutiliza la foto mientras el escaneo y las carpetas de intentos y exámenes no cambian", () => {
    const scan = {};
    let calls = 0;
    const compute = (): number => ++calls;
    expect(cachedTopicSnaps(root, scan, compute)).toBe(1);
    expect(cachedTopicSnaps(root, scan, compute)).toBe(1);
    expect(calls).toBe(1);
  });

  it("recalcula si cambia el escaneo de la vault (otro objeto)", () => {
    let calls = 0;
    const compute = (): number => ++calls;
    cachedTopicSnaps(root, {}, compute);
    expect(cachedTopicSnaps(root, {}, compute)).toBe(2);
  });

  it("recalcula tras escribir o modificar un intento, y tras borrarlo", () => {
    const scan = {};
    const dir = path.join(root, LAYOUT.study_attempts_dir);
    let calls = 0;
    const compute = (): number => ++calls;
    cachedTopicSnaps(root, scan, compute);
    writeJson(dir, "a.json", { note_id: "a", attempts: [] });
    expect(cachedTopicSnaps(root, scan, compute)).toBe(2);
    expect(cachedTopicSnaps(root, scan, compute)).toBe(2);
    writeJson(dir, "a.json", { note_id: "a", attempts: [{ at: "2026-10-22" }] }); // mismo archivo, distinto tamaño
    expect(cachedTopicSnaps(root, scan, compute)).toBe(3);
    fs.rmSync(path.join(dir, "a.json"));
    expect(cachedTopicSnaps(root, scan, compute)).toBe(4);
  });

  it("recalcula tras guardar un examen", () => {
    const scan = {};
    let calls = 0;
    const compute = (): number => ++calls;
    cachedTopicSnaps(root, scan, compute);
    writeJson(examDir(root), "tema.json", { passed: true });
    expect(cachedTopicSnaps(root, scan, compute)).toBe(2);
  });

  it("caduca por TTL aunque nada cambie, y cada vault tiene su propia foto", () => {
    const scan = {};
    let t = 1_000;
    let calls = 0;
    const compute = (): number => ++calls;
    cachedTopicSnaps(root, scan, compute, () => t);
    t += TOPIC_SNAP_TTL_MS - 1;
    expect(cachedTopicSnaps(root, scan, compute, () => t)).toBe(1);
    t += 2;
    expect(cachedTopicSnaps(root, scan, compute, () => t)).toBe(2);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "nv-snapcache-"));
    try {
      expect(cachedTopicSnaps(other, scan, compute, () => t)).toBe(3);
      expect(cachedTopicSnaps(root, scan, compute, () => t)).toBe(2);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("clearTopicSnapCache fuerza el recálculo", () => {
    const scan = {};
    let calls = 0;
    const compute = (): number => ++calls;
    cachedTopicSnaps(root, scan, compute);
    clearTopicSnapCache(root);
    expect(cachedTopicSnaps(root, scan, compute)).toBe(2);
  });
});

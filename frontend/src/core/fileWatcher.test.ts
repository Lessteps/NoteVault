import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileWatcherService, type WatchEvent } from "./fileWatcher";

let dir: string;
let watcher: FileWatcherService | null = null;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_watch_"));
});
afterEach(() => {
  watcher?.stop();
  watcher = null;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function collect(): { events: unknown[]; start: () => void } {
  const events: unknown[] = [];
  watcher = new FileWatcherService(dir, (e: WatchEvent) => {
    events.push(e);
  });
  return { events, start: () => watcher!.start() };
}

describe("FileWatcherService", () => {
  it("tells the listener about a change ONCE, as an event with the full path inside", async () => {
    const { events, start } = collect();
    start();
    fs.writeFileSync(path.join(dir, "nota.md"), "hola", "utf-8");
    await wait(600);
    const mine = events.filter((e) => (e as WatchEvent).relPath === "nota.md");
    expect(mine.length).toBeGreaterThan(0);
    // Never a bare string: that was the first of two calls per change.
    expect(events.every((e) => typeof e === "object" && e !== null)).toBe(true);
    expect((mine[0] as WatchEvent).fullPath).toBe(path.join(dir, "nota.md"));
    // A single write does not come back doubled (the old signature fired twice per event).
    expect(new Set(mine.map((e) => JSON.stringify(e))).size).toBe(mine.length);
  });

  it("stays quiet about internal folders but not about notes with similar names", async () => {
    const { events, start } = collect();
    start();
    fs.mkdirSync(path.join(dir, ".notevault"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".notevault", "estado.json"), "{}", "utf-8");
    fs.mkdirSync(path.join(dir, "mis notas"), { recursive: true });
    fs.writeFileSync(path.join(dir, "mis notas", "adjuntos.md"), "x", "utf-8");
    await wait(700);
    const rels = events.map((e) => (e as WatchEvent).relPath);
    expect(rels.some((r) => r.startsWith(".notevault"))).toBe(false);
    expect(rels).toContain("mis notas/adjuntos.md");
  });
});

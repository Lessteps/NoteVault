import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { ExerciseManager } from "../../core/exerciseManager.js";
import { AppState } from "../appState.js";
import { exerciseApi } from "./exercise.js";

function fetchRange(url: string, rangeHeader: string): Promise<{ status: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Range: rangeHeader } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
  });
}

function fetchStatus(url: string): Promise<number> {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on("error", () => resolve(500));
  });
}

describe("exerciseApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof exerciseApi>;
  let today: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ex_test_"));
    app = new AppState(tmpDir);
    api = exerciseApi(app);
    today = todayIso();
  });

  afterEach(() => {
    api._shutdown_media();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("mark writes the same log", () => {
    const day = api.ex_days(today, today)[0]!;
    const exs = day.exercises as Array<{ id: string }>;
    const ex = exs[0]!;
    api.ex_mark(today, ex.id, true, "42,5", 8, "fácil");

    const mgr = new ExerciseManager(tmpDir);
    const entry = mgr.getLog(today).entries[ex.id]!;
    expect(entry.done).toBe(true);
    expect(entry.weight).toBe(42.5);
    expect(entry.reps).toBe(8);

    expect(api.ex_overview().week).toBeGreaterThan(0);
    expect(() => api.ex_mark(today, ex.id, true, "mucho")).toThrow(ApiError);
  });

  it("routine edits", () => {
    const e = api.ex_save("", {
      day: "lunes",
      name: "Dominadas",
      series_reps: "3×8",
    }) as { id: string };

    expect(api.ex_list().some((x) => x.id === e.id)).toBe(true);

    api.ex_save(e.id, { day: "martes", name: "Dominadas lastradas" });
    expect(api.ex_list().find((x) => x.id === e.id)!.day).toBe("martes");

    expect(() => api.ex_save("", { day: "festivo" })).toThrow(ApiError);
    expect(() =>
      api.ex_save("", { day: "lunes", video_path: "C:/secretos.txt" })
    ).toThrow(ApiError);

    api.ex_remove(e.id);
    expect(api.ex_list().some((x) => x.id === e.id)).toBe(false);
  });

  it("video is streamed with ranges", async () => {
    const e = api.ex_list()[0] as { id: string; day: string; name: string };
    const mgr = new ExerciseManager(tmpDir);
    const videos = mgr.videosDir;
    fs.mkdirSync(videos, { recursive: true });

    const sampleData = Buffer.alloc(256 * 40);
    for (let i = 0; i < sampleData.length; i++) {
      sampleData[i] = i % 256;
    }
    const videoFile = path.join(videos, "clip.mp4");
    fs.writeFileSync(videoFile, sampleData);

    api.ex_save(e.id, {
      day: e.day,
      name: e.name,
      video_path: videoFile,
    });

    const res = await api.ex_video_url(e.id);
    expect(res.url.startsWith("http://127.0.0.1:")).toBe(true);

    const rangeRes = await fetchRange(res.url, "bytes=10-19");
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.data).toEqual(sampleData.subarray(10, 20));

    const base = res.url.slice(0, res.url.lastIndexOf("/"));
    expect(await fetchStatus(base + "/deadbeef")).toBe(404);
  });

  it("missing video throws ApiError", async () => {
    const e = api.ex_save("", { day: "lunes", name: "Sin video" }) as {
      id: string;
    };
    await expect(api.ex_video_url(e.id)).rejects.toThrow(ApiError);
  });
});

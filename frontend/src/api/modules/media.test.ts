import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { MediaServer, mediaApi } from "./media.js";

describe("mediaApi and MediaServer", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof mediaApi>;
  let testFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_media_"));
    testFile = path.join(tmpDir, "video.mp4");
    fs.writeFileSync(testFile, Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz"));
    fs.mkdirSync(path.join(tmpDir, "folder"), { recursive: true });

    app = new AppState(tmpDir);
    api = mediaApi(app);
  });

  afterEach(() => {
    api.media_shutdown();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("registers media and serves via HTTP with range support", async () => {
    const res = await api.media_url("video.mp4");
    expect(res.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/m\/[0-9a-f]{32}$/);

    // Full fetch (status 200)
    const fullResp = await fetch(res.url);
    expect(fullResp.status).toBe(200);
    expect(fullResp.headers.get("content-type")).toBe("video/mp4");
    expect(fullResp.headers.get("accept-ranges")).toBe("bytes");
    const fullText = await fullResp.text();
    expect(fullText).toBe("0123456789abcdefghijklmnopqrstuvwxyz");

    // Partial fetch (status 206)
    const partialResp = await fetch(res.url, {
      headers: { Range: "bytes=0-9" },
    });
    expect(partialResp.status).toBe(206);
    expect(partialResp.headers.get("content-range")).toBe("bytes 0-9/36");
    const partialText = await partialResp.text();
    expect(partialText).toBe("0123456789");

    // Invalid range (status 416)
    const invalidResp = await fetch(res.url, {
      headers: { Range: "bytes=100-200" },
    });
    expect(invalidResp.status).toBe(416);

    // HEAD request
    const headResp = await fetch(res.url, { method: "HEAD" });
    expect(headResp.status).toBe(200);
    expect(headResp.headers.get("content-length")).toBe("36");

    // Shutdown
    const shut = api.media_shutdown();
    expect(shut.ok).toBe(true);
  });

  it("rejects non-existent file or folder", async () => {
    await expect(api.media_url("missing.mp4")).rejects.toThrow(ApiError);
    await expect(api.media_url("folder")).rejects.toThrow(ApiError);
  });

  it("handles 404 for unknown media tokens directly on MediaServer", async () => {
    const server = new MediaServer();
    const url = await server.urlFor(testFile);
    const parsed = new URL(url);
    const badUrl = `${parsed.origin}/m/00000000000000000000000000000000`;

    const resp = await fetch(badUrl);
    expect(resp.status).toBe(404);

    server.shutdown();
  });
});

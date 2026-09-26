import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Restrictions, UsageMeter, WebStore } from "../../core/webStore.js";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { BrowserSession, webApi, type BrowserLike } from "./web.js";

let dir: string;
let api: ReturnType<typeof webApi>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_web_"));
  api = webApi(new AppState(dir));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

class FakeWindow implements BrowserLike {
  url: string;
  html: string | null = null;
  constructor(url: string) {
    this.url = url;
  }
  getCurrentUrl(): string {
    return this.url;
  }
  loadHtml(html: string): void {
    this.html = html;
    this.url = "about:blank";
  }
  getTitle(): string {
    return "Título";
  }
}

describe("web api", () => {
  it("bookmarks", () => {
    const b = api.web_bookmark_add("Docs", "docs.python.org") as Record<string, unknown>;
    expect(b.url).toBe("https://docs.python.org");
    expect((api.web_overview() as { bookmarks: unknown[] }).bookmarks.length).toBe(1);
    expect(
      String((api.web_bookmark_add("x", "javascript:alert(1)") as Record<string, unknown>).url).startsWith(
        "https://",
      ),
    ).toBe(true);
    expect(() => api.web_bookmark_add("x", "file:///etc/passwd")).toThrow(ApiError);
    expect((api.web_bookmark_remove("https://docs.python.org") as Record<string, unknown>).ok).toBe(true);
  });

  it("rules and relax phrase", () => {
    let r = (api.web_overview() as { restrictions: Record<string, unknown> }).restrictions;
    r = api.web_preset(r, "Redes sociales") as Record<string, unknown>;
    r.confirm_to_relax = true;
    expect((api.web_restrictions_save(r) as Record<string, unknown>).ok).toBe(true);
    expect((api.web_check("https://m.facebook.com/x") as Record<string, unknown>).allowed).toBe(false);
    const loose = { ...r, blocked_domains: [] };
    expect((api.web_restrictions_save(loose) as Record<string, unknown>).needs_phrase).toBe(true);
    expect((api.web_check("facebook.com") as Record<string, unknown>).allowed).toBe(false);
    expect((api.web_restrictions_save(loose, "Quiero desbloquear") as Record<string, unknown>).ok).toBe(true);
    expect((api.web_check("facebook.com") as Record<string, unknown>).allowed).toBe(true);
  });

  it("open: blocked and system fallback", () => {
    api.web_restrictions_save({ enabled: true, blocked_domains: ["tiktok.com"] });
    expect((api.web_open("tiktok.com") as Record<string, unknown>).blocked).toBe(true);
    expect((api.web_open("example.com") as Record<string, unknown>).system).toBe(true);
    expect(() => api.web_open("file:///etc/passwd")).toThrow(ApiError);
  });

  it("browser session blocks, records history and meters time", () => {
    const ws = new WebStore(dir);
    ws.saveRestrictions(
      Restrictions.fromDict({
        blocked_patterns: ["youtube.com/shorts"],
        daily_limits: { "example.com": 1 },
      }),
    );
    const meter = new UsageMeter(ws);
    const win = new FakeWindow("https://example.com/a");
    const s = new BrowserSession(win, ws, meter);
    expect(s.poll(0)).toBe("ok");
    expect(ws.history()[ws.history().length - 1]!.title).toBe("Título");
    s.poll(70);
    expect(meter.today()["example.com"]).toBeGreaterThanOrEqual(60);
    expect(s.poll(71)).toBe("blocked");
    expect(win.html).toContain("límite diario");
    win.url = "https://www.youtube.com/shorts/abc";
    expect(s.poll(72)).toBe("blocked");
  });
});

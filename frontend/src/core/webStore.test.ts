import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAYOUT } from "./vaultFormat.js";
import {
  Restrictions,
  UsageMeter,
  WebStore,
  domainMatches,
  hostOf,
  normalizeUrl,
} from "./webStore.js";

function layoutPath(root: string, key: keyof typeof LAYOUT, vars: Record<string, string | number> = {}): string {
  const tpl = LAYOUT[key].replace(/\{(\w+)(?::(\d+)d)?\}/g, (_m, k, w) => {
    const v = vars[k];
    if (v === undefined) return `{${k}}`;
    return w ? String(v).padStart(Number(w), "0") : String(v);
  });
  return path.join(root, tpl);
}

describe("web urls", () => {
  it("bare host gets https", () => {
    expect(normalizeUrl("github.com")).toBe("https://github.com");
    expect(normalizeUrl("docs.qt.io/qt-6/")).toBe("https://docs.qt.io/qt-6/");
  });
  it("host with port is not a scheme", () => {
    expect(normalizeUrl("example.com:8080")).toBe("https://example.com:8080");
    expect(normalizeUrl("localhost:8000")).toBe("http://localhost:8000");
  });
  it("words become a search", () => {
    expect(normalizeUrl("como usar qt").startsWith("https://www.google.com/search?q=")).toBe(true);
  });
  it("full urls untouched", () => {
    for (const u of ["https://a.com/x?y=1", "about:blank", "file:///C:/a.html"]) {
      expect(normalizeUrl(u)).toBe(u);
    }
  });
  it("host_of strips www", () => {
    expect(hostOf("https://www.YouTube.com/watch?v=1")).toBe("youtube.com");
  });
  it("domain covers subdomains only", () => {
    expect(domainMatches("m.youtube.com", "youtube.com")).toBe(true);
    expect(domainMatches("youtube.com", "www.youtube.com")).toBe(true);
    expect(domainMatches("notyoutube.com", "youtube.com")).toBe(false);
  });
});

describe("restrictions", () => {
  it("blocks a domain", () => {
    const r = new Restrictions({ blocked_domains: ["tiktok.com"] });
    expect(r.check("https://www.tiktok.com/@x")[0]).toBe(false);
    expect(r.check("https://github.com")[0]).toBe(true);
  });
  it("pattern blocks only that section", () => {
    const r = new Restrictions({ blocked_patterns: ["youtube.com/shorts"] });
    expect(r.check("https://www.youtube.com/shorts/abc")[0]).toBe(false);
    expect(r.check("https://www.youtube.com/watch?v=abc")[0]).toBe(true);
  });
  it("focus mode allows only listed", () => {
    const r = new Restrictions({ mode: "allowlist", allowed_domains: ["qt.io"] });
    expect(r.check("https://doc.qt.io/x")[0]).toBe(true);
    const [ok, reason] = r.check("https://reddit.com");
    expect(ok).toBe(false);
    expect(reason).toContain("enfoque");
  });
  it("daily limit", () => {
    const r = new Restrictions({ daily_limits: { "youtube.com": 30 } });
    expect(r.check("https://youtube.com", { "youtube.com": 29 * 60 })[0]).toBe(true);
    expect(
      r.check("https://m.youtube.com", { "youtube.com": 20 * 60, "m.youtube.com": 10 * 60 })[0],
    ).toBe(false);
  });
  it("disabled and internal pages pass", () => {
    expect(
      new Restrictions({ enabled: false, blocked_domains: ["a.com"] }).check("https://a.com")[0],
    ).toBe(true);
    expect(new Restrictions({ mode: "allowlist" }).check("about:blank")[0]).toBe(true);
  });
  it("presets merge without duplicates", () => {
    const r = new Restrictions({ blocked_domains: ["tiktok.com"] });
    r.applyPreset("Shorts y Reels");
    r.applyPreset("Shorts y Reels");
    expect(r.blocked_domains.filter((d) => d === "tiktok.com").length).toBe(1);
    expect(r.blocked_patterns).toContain("youtube.com/shorts");
  });
  it("relaxation detection", () => {
    const old = new Restrictions({ blocked_domains: ["a.com"], daily_limits: { "b.com": 30 } });
    const tighter = new Restrictions({
      blocked_domains: ["a.com", "c.com"],
      daily_limits: { "b.com": 20 },
    });
    expect(tighter.isRelaxationOf(old)).toBe(false);
    expect(new Restrictions({ daily_limits: { "b.com": 30 } }).isRelaxationOf(old)).toBe(true);
    expect(
      new Restrictions({ blocked_domains: ["a.com"], daily_limits: { "b.com": 45 } }).isRelaxationOf(
        old,
      ),
    ).toBe(true);
    expect(
      new Restrictions({
        enabled: false,
        blocked_domains: ["a.com"],
        daily_limits: { "b.com": 30 },
      }).isRelaxationOf(old),
    ).toBe(true);
  });
  it("round-trips through dict", () => {
    const r = new Restrictions({
      mode: "allowlist",
      allowed_domains: ["qt.io"],
      blocked_domains: ["x.com"],
      blocked_patterns: ["/shorts"],
      daily_limits: { "youtube.com": 15 },
      confirm_to_relax: true,
    });
    expect(Restrictions.fromDict(r.toDict())).toEqual(r);
  });
  it("from_dict cleans input", () => {
    const r = Restrictions.fromDict({
      blocked_domains: ["https://www.TikTok.com/foo", ""],
      daily_limits: { "www.youtube.com": "20", bad: "x" },
    });
    expect(r.blocked_domains).toEqual(["tiktok.com"]);
    expect(r.daily_limits).toEqual({ "youtube.com": 20 });
  });
});

describe("web store", () => {
  let root: string;
  let webStore: WebStore;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nvweb"));
    webStore = new WebStore(root);
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("files live in the documented layout", () => {
    webStore.addBookmark("Qt", "https://doc.qt.io");
    webStore.saveRestrictions(new Restrictions({ blocked_domains: ["x.com"] }));
    webStore.addHistory("https://doc.qt.io", "Qt", new Date(2026, 8, 23, 10, 0, 0));
    webStore.addUsage("doc.qt.io", 60, new Date(2026, 8, 23));
    const cases: [keyof typeof LAYOUT, Record<string, string | number>][] = [
      ["web_bookmarks", {}],
      ["web_restrictions", {}],
      ["web_history_day", { year: 2026, month: 9, date: "2026-09-23" }],
      ["web_usage_day", { year: 2026, month: 9, date: "2026-09-23" }],
    ];
    for (const [key, vars] of cases) {
      const p = layoutPath(root, key, vars);
      expect(fs.existsSync(p), key).toBe(true);
      expect(path.relative(root, p).replace(/\\/g, "/").startsWith(".notevault/web/")).toBe(true);
    }
  });

  it("bookmarks: no duplicates, add/remove", () => {
    webStore.addBookmark("Qt", "https://doc.qt.io");
    webStore.addBookmark("Qt again", "https://doc.qt.io");
    expect(webStore.bookmarks().length).toBe(1);
    expect(webStore.isBookmarked("https://doc.qt.io")).toBe(true);
    expect(webStore.removeBookmark("https://doc.qt.io")).toBe(true);
    expect(webStore.bookmarks()).toEqual([]);
  });

  it("history skips repeats and non-web", () => {
    const t = new Date(2026, 8, 23, 9, 0, 0);
    webStore.addHistory("https://a.com", "A", t);
    webStore.addHistory("https://a.com", "A", t);
    webStore.addHistory("about:blank", "", t);
    webStore.addHistory("https://b.com", "B", t);
    expect(webStore.history(t).map((h) => h.url)).toEqual(["https://a.com", "https://b.com"]);
    expect(webStore.historyDays()).toEqual(["2026-09-23"]);
    webStore.clearHistory();
    expect(webStore.history(t)).toEqual([]);
  });

  it("usage meter flushes to disk", () => {
    const m = new UsageMeter(webStore);
    m.tick("youtube.com", 5);
    m.tick("youtube.com", 5);
    expect(m.today()["youtube.com"]).toBe(10);
    m.flush();
    expect(webStore.usage()["youtube.com"]).toBe(10);
    const now = new Date();
    const p = layoutPath(root, "web_usage_day", {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    });
    expect(JSON.parse(fs.readFileSync(p, "utf-8"))).toEqual({ "youtube.com": 10 });
  });
});

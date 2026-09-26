// Ported from notevault_app/webapp/modules/web.py
// WEB: bookmarks, history, time-per-site, content rules, and a separate browser
// window that enforces them. The pywebview second window becomes an Electron
// BrowserWindow; BrowserSession keeps the same rule/history/metering logic and
// is driven synchronously (Electron webContents.getURL()/getTitle() are sync,
// like the tests' FakeWindow).

import {
  PRESETS,
  RELAX_PHRASE,
  Restrictions,
  UsageMeter,
  WebStore,
  blockedPageHtml,
  hostOf,
  normalizeUrl,
  secondsFor,
} from "../../core/webStore.js";
import { ApiError } from "../../core/errors.js";
import { formatDate } from "../../core/dates.js";
import type { AppState } from "../appState.js";
import { oneLine } from "../common.js";

const TICK_SECONDS = 5;
const MAX_LIST = 300;

/** Minimal window the session drives. Electron's BrowserWindow.webContents
 * satisfies this (getURL/getTitle/loadURL are synchronous accessors). */
export interface BrowserLike {
  getCurrentUrl(): string;
  loadHtml(html: string): void;
  getTitle(): string;
}

function isoDay(d: Date): string {
  return formatDate(d, "%Y-%m-%d");
}
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function monotonic(): number {
  return Date.now() / 1000;
}

/** The rules applied to one browser window. poll() runs every second. */
export class BrowserSession {
  window: BrowserLike;
  store: WebStore;
  meter: UsageMeter;
  lastUrl = "";
  private lastTick: number | null = null;

  constructor(window: BrowserLike, store: WebStore, meter: UsageMeter) {
    this.window = window;
    this.store = store;
    this.meter = meter;
  }

  poll(now?: number): string {
    now = now === undefined ? monotonic() : now;
    if (this.lastTick === null) this.lastTick = now;
    let url: string;
    try {
      url = this.window.getCurrentUrl() || "";
    } catch {
      return "closed";
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      this.lastTick = now;
      return "internal";
    }
    const [allowed, reason] = this.store.restrictions().check(url, this.meter.today());
    if (!allowed) {
      this.window.loadHtml(blockedPageHtml(url, reason));
      this.lastUrl = "";
      return "blocked";
    }
    if (url !== this.lastUrl) {
      let title = "";
      try {
        title = String(this.window.getTitle() || "").slice(0, 300);
      } catch {
        /* page still loading */
      }
      this.store.addHistory(url, title);
      this.lastUrl = url;
    }
    if (now - this.lastTick >= TICK_SECONDS) {
      this.meter.tick(hostOf(url), Math.trunc(now - this.lastTick));
      this.lastTick = now;
    }
    return "ok";
  }
}

/** Lazily open a URL in the OS browser (Electron shell); false if unavailable. */
function openInShell(url: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as { shell?: { openExternal(u: string): Promise<void> } };
    if (!electron?.shell) return false;
    void electron.shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

export function webApi(app: AppState) {
  const web = (): WebStore => new WebStore(app.root);
  let meterObj: UsageMeter | null = null;

  const meter = (): UsageMeter => {
    if (meterObj === null || meterObj.store === null || meterObj.store.root !== app.root) {
      if (meterObj !== null) meterObj.flush();
      meterObj = new UsageMeter(web());
    }
    return meterObj;
  };

  return {
    web_overview(day = ""): Record<string, unknown> {
      const ws = web();
      const d = day ? parseDay(day) : new Date();
      if (d === null) throw new ApiError("Fecha inválida.");
      const r = ws.restrictions();
      const today = new Date();
      const isToday = isoDay(d) === isoDay(today);
      const usage = isToday ? meter().today() : ws.usage(d);
      const week: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        const dd = new Date(today);
        dd.setDate(dd.getDate() - i);
        const total = i
          ? Object.values(ws.usage(dd)).reduce((a, b) => a + b, 0)
          : Object.values(meter().today()).reduce((a, b) => a + b, 0);
        week[isoDay(dd)] = total;
      }
      const usageList = Object.entries(usage)
        .map(([h, s]) => ({ host: h, seconds: s }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 50);
      return {
        bookmarks: ws.bookmarks().map((b) => b.toDict()).slice(0, MAX_LIST),
        history: [...ws.history(d)].reverse().slice(0, MAX_LIST),
        history_days: ws.historyDays().slice(0, 60),
        day: isoDay(d),
        usage: usageList,
        week: Object.entries(week)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => ({ date: k, seconds: v })),
        restrictions: r.toDict(),
        limits: Object.entries(r.daily_limits).map(([dom, m]) => ({
          domain: dom,
          minutes: m,
          used: secondsFor(usage, dom),
        })),
        presets: Object.keys(PRESETS),
        relax_phrase: RELAX_PHRASE,
        embedded: app.window !== null,
      };
    },

    web_normalize(text: string): Record<string, unknown> {
      const url = normalizeUrl(oneLine(text, 2000));
      return { url, host: hostOf(url) };
    },

    web_bookmark_add(title: string, url: string): Record<string, unknown> {
      url = normalizeUrl(oneLine(url, 2000));
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new ApiError("Solo se guardan páginas http o https.");
      }
      return web().addBookmark(oneLine(title, 200), url).toDict();
    },

    web_bookmark_remove(url: string): Record<string, unknown> {
      return { ok: web().removeBookmark(String(url || "")) };
    },

    web_history_clear(): Record<string, unknown> {
      web().clearHistory();
      return { ok: true };
    },

    web_restrictions_save(data: unknown, phrase = ""): Record<string, unknown> {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new ApiError("Reglas inválidas.");
      }
      const d = data as Record<string, unknown>;
      const picked: Record<string, unknown> = {};
      for (const k of [
        "enabled",
        "mode",
        "blocked_domains",
        "blocked_patterns",
        "allowed_domains",
        "daily_limits",
        "confirm_to_relax",
      ]) {
        picked[k] = d[k];
      }
      const nw = Restrictions.fromDict(picked);
      for (const key of ["blocked_domains", "blocked_patterns", "allowed_domains"] as const) {
        nw[key] = nw[key].map((x) => oneLine(x, 300)).slice(0, 500);
      }
      const limits: Record<string, number> = {};
      for (const [k, v] of Object.entries(nw.daily_limits).slice(0, 200)) {
        const kk = oneLine(k, 200);
        if (kk) limits[kk] = Math.min(24 * 60, v);
      }
      nw.daily_limits = limits;
      const ws = web();
      const old = ws.restrictions();
      if (
        old.confirm_to_relax &&
        nw.isRelaxationOf(old) &&
        String(phrase || "").trim().toLowerCase() !== RELAX_PHRASE
      ) {
        return { ok: false, needs_phrase: true, phrase: RELAX_PHRASE };
      }
      ws.saveRestrictions(nw);
      return { ok: true, restrictions: nw.toDict() };
    },

    web_preset(data: unknown, name: string): Record<string, unknown> {
      if (!(name in PRESETS)) throw new ApiError("Preajuste desconocido.");
      const r = Restrictions.fromDict(data && typeof data === "object" ? data : {});
      r.applyPreset(name);
      return r.toDict();
    },

    web_check(url: string): Record<string, unknown> {
      const [ok, reason] = web()
        .restrictions()
        .check(normalizeUrl(String(url || "")), meter().today());
      return { allowed: ok, reason };
    },

    web_open(text: string): Record<string, unknown> {
      const url = normalizeUrl(oneLine(text, 2000));
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new ApiError("Solo se abren páginas http o https.");
      }
      const [ok, reason] = web().restrictions().check(url, meter().today());
      if (!ok) return { ok: false, blocked: true, reason };

      if (app.window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const electron = require("electron") as {
            BrowserWindow?: new (opts: Record<string, unknown>) => any;
          };
          if (electron?.BrowserWindow) {
            const browserWin = new electron.BrowserWindow({
              width: 1200,
              height: 800,
              title: "NoteVault — WEB",
              backgroundColor: "#191919",
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
              },
            });
            const browserLike: BrowserLike = {
              getCurrentUrl: () => {
                try {
                  return browserWin.webContents.getURL() || "";
                } catch {
                  return "";
                }
              },
              getTitle: () => {
                try {
                  return browserWin.webContents.getTitle() || "";
                } catch {
                  return "";
                }
              },
              loadHtml: (html: string) => {
                try {
                  void browserWin.webContents.loadURL(
                    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
                  );
                } catch {}
              },
            };
            const session = new BrowserSession(browserLike, web(), meter());
            const timer = setInterval(() => {
              if (browserWin.isDestroyed()) {
                clearInterval(timer);
                return;
              }
              try {
                session.poll();
              } catch {}
            }, 1000);
            browserWin.on("closed", () => {
              clearInterval(timer);
            });
            void browserWin.loadURL(url);
            return { ok: true, desktop: true };
          }
        } catch {
          // fallback to openInShell
        }
      }

      openInShell(url);
      return { ok: true, system: true };
    },

    browser_attach(_bounds: unknown, url = ""): Record<string, unknown> {
      return { url: url || "https://www.google.com", title: "Navegador", canGoBack: false, canGoForward: false, isLoading: false };
    },
    browser_detach(): Record<string, unknown> {
      return { ok: true };
    },
    browser_set_bounds(): Record<string, unknown> {
      return { ok: true };
    },
    browser_navigate(url: string): Record<string, unknown> {
      return { url: normalizeUrl(url), title: "Página", canGoBack: false, canGoForward: false, isLoading: false };
    },
    browser_action(): Record<string, unknown> {
      return { url: "", title: "", canGoBack: false, canGoForward: false, isLoading: false };
    },
    browser_state(): Record<string, unknown> {
      return { url: "https://www.google.com", title: "Navegador", canGoBack: false, canGoForward: false, isLoading: false };
    },
  };
}

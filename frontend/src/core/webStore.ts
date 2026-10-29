// Ported from notevault_app/core/web_store.py
//
// Data of the WEB module (the built-in browser), with no UI dependency.
// What travels with the vault lives in ``.notevault/web/`` (see
// docs/VAULT_FORMAT.md, section "Web"):
//   marcadores.json                      bookmarks
//   restricciones.json                   content-consumption rules
//   historial/YYYY/MM/YYYY-MM-DD.json    pages visited that day
//   uso/YYYY/MM/YYYY-MM-DD.json          seconds spent per site that day

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatDate } from "./dates.js";
import * as store from "./store.js";
import { DATETIME_FMT, LAYOUT, type LayoutKey } from "./vaultFormat.js";

export const HOME_URL = "https://www.google.com";
export const SEARCH_URL = "https://www.google.com/search?q={q}";
export const HISTORY_KEEP_PER_DAY = 2000;

export const RELAX_PHRASE = "quiero desbloquear";

// One-click presets for the restrictions dialog.
export const PRESETS: Record<string, { blocked_patterns?: string[]; blocked_domains?: string[] }> = {
  "Shorts y Reels": {
    blocked_patterns: [
      "youtube.com/shorts",
      "instagram.com/reels",
      "instagram.com/reel/",
      "facebook.com/reel",
    ],
    blocked_domains: ["tiktok.com"],
  },
  "Redes sociales": {
    blocked_domains: [
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "x.com",
      "twitter.com",
      "reddit.com",
      "threads.net",
    ],
  },
  "Noticias y entretenimiento": {
    blocked_domains: ["netflix.com", "twitch.tv", "9gag.com"],
  },
};

// ── URLs ───────────────────────────────────────────────────────────────────

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const BARE_SCHEMES = ["about:", "data:", "file:", "mailto:", "view-source:"];
const HOSTLIKE_RE =
  /^(localhost|[\w-]+(\.[\w-]+)+|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/;

/** quote_plus equivalent: encode and turn spaces into '+'. */
function quotePlus(text: string): string {
  return encodeURIComponent(text).replace(/%20/g, "+");
}

/** What the address bar navigates to: a URL as typed, a bare host with
 * https:// added, or a web search for anything else. */
export function normalizeUrl(text: string): string {
  const t = (text || "").trim();
  if (!t || /^https?:\/?\/?$/i.test(t) || /google\.com\/search\?q=https?%3A/i.test(t)) return HOME_URL;
  if (SCHEME_RE.test(t) || BARE_SCHEMES.some((s) => t.toLowerCase().startsWith(s))) {
    return t;
  }
  if (!t.includes(" ") && HOSTLIKE_RE.test(t)) {
    return (t.startsWith("localhost") ? "http://" : "https://") + t;
  }
  return SEARCH_URL.replace("{q}", quotePlus(t));
}

/** Lower-case host without a leading ``www.``; "" for non-web URLs. */
export function hostOf(url: string): string {
  let host = "";
  try {
    host = (new URL(url).hostname || "").toLowerCase();
  } catch {
    // Fall back to a manual parse for schemes/URLs the URL class rejects.
    const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/.exec(url);
    if (!m) return "";
    host = (m[1] || "").toLowerCase();
    const at = host.lastIndexOf("@");
    if (at >= 0) host = host.slice(at + 1);
    host = host.replace(/:\d+$/, "");
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

function cleanDomain(text: string): string {
  let t = (text || "").trim().toLowerCase();
  if (t.includes("://")) t = hostOf(t);
  t = t.split("/")[0]!;
  return t.startsWith("www.") ? t.slice(4) : t;
}

/** ``domain`` covers itself and every subdomain: youtube.com matches
 * m.youtube.com but not notyoutube.com. */
export function domainMatches(host: string, domain: string): boolean {
  domain = cleanDomain(domain);
  return !!domain && (host === domain || host.endsWith("." + domain));
}

/** scheme of a URL, lower-case, or "". */
function schemeOf(url: string): string {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  return m ? m[1]!.toLowerCase() : "";
}

// ── Restrictions ──────────────────────────────────────────────────────────

export class Restrictions {
  enabled: boolean;
  // "blocklist": everything allowed except what is blocked.
  // "allowlist": only the allowed domains open (focus mode).
  mode: string;
  blocked_domains: string[];
  blocked_patterns: string[]; // substrings of the URL
  allowed_domains: string[];
  daily_limits: Record<string, number>; // domain -> minutes
  // Self-control friction: loosening the rules asks to type a phrase.
  confirm_to_relax: boolean;

  constructor(init: Partial<Restrictions> = {}) {
    this.enabled = init.enabled ?? true;
    this.mode = init.mode ?? "blocklist";
    this.blocked_domains = init.blocked_domains ? [...init.blocked_domains] : [];
    this.blocked_patterns = init.blocked_patterns ? [...init.blocked_patterns] : [];
    this.allowed_domains = init.allowed_domains ? [...init.allowed_domains] : [];
    this.daily_limits = init.daily_limits ? { ...init.daily_limits } : {};
    this.confirm_to_relax = init.confirm_to_relax ?? false;
  }

  toDict(): Record<string, unknown> {
    const limits: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.daily_limits)) limits[k] = Math.trunc(v);
    return {
      enabled: this.enabled,
      mode: this.mode,
      blocked_domains: [...this.blocked_domains],
      blocked_patterns: [...this.blocked_patterns],
      allowed_domains: [...this.allowed_domains],
      daily_limits: limits,
      confirm_to_relax: this.confirm_to_relax,
    };
  }

  static fromDict(d: unknown): Restrictions {
    const dd = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const limits: Record<string, number> = {};
    const rawLimits = (dd.daily_limits as Record<string, unknown>) || {};
    if (rawLimits && typeof rawLimits === "object") {
      for (const [k, v] of Object.entries(rawLimits)) {
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        if (Number.isFinite(n)) limits[cleanDomain(k)] = Math.max(0, Math.trunc(n));
      }
    }
    const asList = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
    return new Restrictions({
      enabled: dd.enabled === undefined ? true : Boolean(dd.enabled),
      mode: dd.mode === "allowlist" ? "allowlist" : "blocklist",
      blocked_domains: asList(dd.blocked_domains)
        .map((x) => cleanDomain(String(x)))
        .filter((x) => x),
      blocked_patterns: asList(dd.blocked_patterns)
        .map((x) => String(x).trim().toLowerCase())
        .filter((x) => x),
      allowed_domains: asList(dd.allowed_domains)
        .map((x) => cleanDomain(String(x)))
        .filter((x) => x),
      daily_limits: limits,
      confirm_to_relax: Boolean(dd.confirm_to_relax ?? false),
    });
  }

  /** True when these rules let through something the old ones blocked. */
  isRelaxationOf(old: Restrictions): boolean {
    if (!old.enabled) return false;
    if (!this.enabled) return true;
    if (old.mode === "allowlist" && this.mode !== "allowlist") return true;
    if (this.mode === "allowlist") {
      const allowed = new Set(old.allowed_domains);
      if (this.allowed_domains.some((d) => !allowed.has(d))) return true;
    }
    const blockedDomains = new Set(this.blocked_domains);
    if (old.blocked_domains.some((d) => !blockedDomains.has(d))) return true;
    const blockedPatterns = new Set(this.blocked_patterns);
    if (old.blocked_patterns.some((p) => !blockedPatterns.has(p))) return true;
    for (const [dom, minutes] of Object.entries(old.daily_limits)) {
      if (!(dom in this.daily_limits) || this.daily_limits[dom]! > minutes) return true;
    }
    return old.confirm_to_relax && !this.confirm_to_relax;
  }

  applyPreset(name: string): void {
    const preset = PRESETS[name] || {};
    for (const key of ["blocked_domains", "blocked_patterns"] as const) {
      const current = this[key];
      for (const item of preset[key] ?? []) {
        if (!current.includes(item)) current.push(item);
      }
    }
  }

  /** [domain, minutes] of the daily limit that covers host, if any. */
  limitFor(host: string): [string, number] | null {
    for (const [domain, minutes] of Object.entries(this.daily_limits)) {
      if (domainMatches(host, domain)) return [domain, minutes];
    }
    return null;
  }

  /** [allowed, reason]. Only web pages are judged; internal pages
   * (about:, data:, the blocked page itself) always pass. */
  check(url: string, usageToday: Record<string, number> | null = null): [boolean, string] {
    if (!this.enabled) return [true, ""];
    const scheme = schemeOf(url);
    if (scheme !== "http" && scheme !== "https") return [true, ""];
    const host = hostOf(url);
    const low = url.toLowerCase();
    if (this.mode === "allowlist") {
      if (!this.allowed_domains.some((d) => domainMatches(host, d))) {
        return [false, `Modo enfoque: ${host} no está en la lista de sitios permitidos.`];
      }
    }
    for (const d of this.blocked_domains) {
      if (domainMatches(host, d)) return [false, `${d} está bloqueado.`];
    }
    for (const p of this.blocked_patterns) {
      if (p && low.includes(p)) return [false, `Contenido bloqueado por la regla «${p}».`];
    }
    const lim = this.limitFor(host);
    if (lim !== null && usageToday !== null) {
      const [domain, minutes] = lim;
      const used = secondsFor(usageToday, domain);
      if (used >= minutes * 60) {
        return [
          false,
          `Llegaste al límite diario de ${minutes} min en ${domain}. Vuelve mañana.`,
        ];
      }
    }
    return [true, ""];
  }
}

/** Seconds spent today on domain and its subdomains. */
export function secondsFor(usage: Record<string, number> | null | undefined, domain: string): number {
  let total = 0;
  for (const [h, v] of Object.entries(usage || {})) {
    if (domainMatches(h, domain)) total += v;
  }
  return Math.trunc(total);
}

// ── Bookmarks ─────────────────────────────────────────────────────────────

export class Bookmark {
  id: string;
  title: string;
  url: string;
  folder: string;
  created: string;

  constructor(init: { id: string; title: string; url: string; folder?: string; created?: string }) {
    this.id = init.id;
    this.title = init.title;
    this.url = init.url;
    this.folder = init.folder ?? "";
    this.created = init.created ?? "";
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = { id: this.id, title: this.title, url: this.url };
    if (this.folder) d.folder = this.folder;
    if (this.created) d.created = this.created;
    return d;
  }
}

function hex12(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// ── Store ─────────────────────────────────────────────────────────────────

export class WebStore {
  root: string;

  constructor(vaultRoot: string) {
    this.root = vaultRoot;
  }

  // paths
  private p(key: LayoutKey, vars: Record<string, string | number> = {}): string {
    return path.join(this.root, formatLayoutPath(LAYOUT[key], vars));
  }

  private dayPath(key: LayoutKey, day: Date): string {
    return this.p(key, {
      year: day.getFullYear(),
      month: day.getMonth() + 1,
      date: isoDate(day),
    });
  }

  // bookmarks
  bookmarks(): Bookmark[] {
    const raw = store.loadJson<unknown[]>(this.p("web_bookmarks"), []) || [];
    const out: Bookmark[] = [];
    for (const d of Array.isArray(raw) ? raw : []) {
      if (d && typeof d === "object" && (d as Record<string, unknown>).url) {
        const o = d as Record<string, unknown>;
        out.push(
          new Bookmark({
            id: String(o.id || hex12()),
            title: String(o.title || o.url),
            url: String(o.url),
            folder: String(o.folder || ""),
            created: String(o.created || ""),
          }),
        );
      }
    }
    return out;
  }

  saveBookmarks(items: Bookmark[]): void {
    store.writeJson(this.p("web_bookmarks"), items.map((b) => b.toDict()));
  }

  isBookmarked(url: string): boolean {
    return this.bookmarks().some((b) => b.url === url);
  }

  addBookmark(title: string, url: string, folder = ""): Bookmark {
    const items = this.bookmarks();
    for (const b of items) {
      if (b.url === url) return b;
    }
    const b = new Bookmark({
      id: hex12(),
      title: title.trim() || url,
      url,
      folder,
      created: formatDate(new Date(), DATETIME_FMT),
    });
    items.push(b);
    this.saveBookmarks(items);
    return b;
  }

  removeBookmark(url: string): boolean {
    const items = this.bookmarks();
    const kept = items.filter((b) => b.url !== url);
    if (kept.length !== items.length) {
      this.saveBookmarks(kept);
      return true;
    }
    return false;
  }

  // restrictions
  restrictions(): Restrictions {
    return Restrictions.fromDict(store.loadJson(this.p("web_restrictions"), {}));
  }

  saveRestrictions(r: Restrictions): void {
    store.writeJson(this.p("web_restrictions"), r.toDict());
  }

  // history
  history(day: Date | null = null): Array<Record<string, unknown>> {
    const raw = store.loadJson<unknown[]>(this.dayPath("web_history_day", day || new Date()), []);
    return (raw || []).filter(
      (h): h is Record<string, unknown> =>
        !!h && typeof h === "object" && !!(h as Record<string, unknown>).url,
    );
  }

  addHistory(url: string, title = "", when: Date | null = null): void {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return;
    when = when || new Date();
    const items = this.history(when);
    const last = items[items.length - 1];
    if (items.length && last && last.url === url) {
      if (title && last.title !== title) {
        last.title = title;
      } else {
        return;
      }
    } else {
      items.push({ time: formatDate(when, "%H:%M:%S"), url, title: title || url });
    }
    store.writeJson(
      this.dayPath("web_history_day", when),
      items.slice(-HISTORY_KEEP_PER_DAY),
    );
  }

  /** Days that have history, newest first (ISO date strings). */
  historyDays(): string[] {
    const base = path.join(this.p("web_dir"), "historial");
    const days: string[] = [];
    for (const f of globJsonFiles(base)) {
      const stem = path.basename(f, ".json");
      if (/^\d{4}-\d{2}-\d{2}$/.test(stem) && !Number.isNaN(Date.parse(stem))) {
        days.push(stem);
      }
    }
    days.sort();
    days.reverse();
    return days;
  }

  clearHistory(): void {
    const base = path.join(this.p("web_dir"), "historial");
    for (const f of globJsonFiles(base)) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* missing_ok */
      }
    }
  }

  // usage
  usage(day: Date | null = null): Record<string, number> {
    const raw = store.loadJson<Record<string, unknown>>(
      this.dayPath("web_usage_day", day || new Date()),
      {},
    );
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (typeof v === "number") out[String(k)] = Math.trunc(v);
    }
    return out;
  }

  addUsage(host: string, seconds: number, day: Date | null = null): void {
    if (!host || seconds <= 0) return;
    day = day || new Date();
    const u = this.usage(day);
    u[host] = (u[host] || 0) + Math.trunc(seconds);
    const sorted: Record<string, number> = {};
    for (const k of Object.keys(u).sort()) sorted[k] = u[k]!;
    store.writeJson(this.dayPath("web_usage_day", day), sorted);
  }

  // snake_case aliases
  save_bookmarks = this.saveBookmarks.bind(this);
  is_bookmarked = this.isBookmarked.bind(this);
  add_bookmark = this.addBookmark.bind(this);
  remove_bookmark = this.removeBookmark.bind(this);
  save_restrictions = this.saveRestrictions.bind(this);
  add_history = this.addHistory.bind(this);
  history_days = this.historyDays.bind(this);
  clear_history = this.clearHistory.bind(this);
  add_usage = this.addUsage.bind(this);
}

/** Accumulates seconds per host in memory and flushes them in batches,
 * so the browser does not write a file every tick. */
export class UsageMeter {
  store: WebStore | null;
  private pending: Record<string, number> = {};
  private day: Date = new Date();
  private lastFlush: number = monotonic();

  constructor(webStore: WebStore | null) {
    this.store = webStore;
  }

  tick(host: string, seconds: number): void {
    if (!host) return;
    if (isoDate(new Date()) !== isoDate(this.day)) {
      this.flush();
      this.day = new Date();
    }
    this.pending[host] = (this.pending[host] || 0) + seconds;
    if (monotonic() - this.lastFlush >= 30) this.flush();
  }

  /** Stored usage for today plus what is not flushed yet. */
  today(): Record<string, number> {
    const base = this.store ? this.store.usage(this.day) : {};
    for (const [h, s] of Object.entries(this.pending)) base[h] = (base[h] || 0) + s;
    return base;
  }

  flush(): void {
    if (this.store !== null) {
      for (const [h, s] of Object.entries(this.pending)) this.store.addUsage(h, s, this.day);
    }
    this.pending = {};
    this.lastFlush = monotonic();
  }
}

export function blockedPageHtml(url: string, reason: string): string {
  const esc = htmlEscape;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bloqueado</title>
<style>body{background:#1b1b1f;color:#dcdde0;font-family:'Segoe UI',sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{max-width:520px;text-align:center}h1{font-size:44px;margin:0 0 8px}
p{color:#a0a0ab;line-height:1.5}code{color:#b9a6ff;word-break:break-all}</style></head>
<body><div class="box"><h1>⛔</h1><h2>Página bloqueada</h2><p>${esc(reason)}</p>
<p><code>${esc(url)}</code></p>
<p>Puedes cambiar las reglas en WEB → 🛡 Restricciones.</p></div></body></html>`;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monotonic(): number {
  return Date.now() / 1000;
}

function formatLayoutPath(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)(?::(\d+)d)?\}/g, (_m, key, width) => {
    const val = vars[key];
    if (val === undefined) return `{${key}}`;
    return width ? String(val).padStart(Number(width), "0") : String(val);
  });
}

// Recursively list .json files under dir (mirrors the Python year/month/day
// glob intent: any json under the tree). Returns [] if dir is absent.
function globJsonFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...globJsonFiles(full));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// snake_case aliases (parity with the Python module API)
export const normalize_url = normalizeUrl;
export const host_of = hostOf;
export const domain_matches = domainMatches;
export const seconds_for = secondsFor;
export const blocked_page_html = blockedPageHtml;

"""
Data of the WEB module (the built-in browser), with no Qt dependency.

What travels with the vault lives in ``.notevault/web/`` (see
``docs/VAULT_FORMAT.md``, section "Web"):

    marcadores.json                      bookmarks
    restricciones.json                   content-consumption rules
    historial/YYYY/MM/YYYY-MM-DD.json    pages visited that day
    uso/YYYY/MM/YYYY-MM-DD.json          seconds spent per site that day

History and usage are one file per day, so two devices syncing the vault
never write the same file for unrelated browsing. What must NOT travel with
the vault stays on this machine: cookies, logins and cache live in the
browser profile under ``~/.notevault/web_profile`` (a synced Chromium
profile would leak sessions and corrupt itself), and the open tabs of the
last session in ``~/.notevault/web_session.json``.
"""

from __future__ import annotations

import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus, urlsplit

from . import store
from . import vault_format as fmt

HOME_URL = "https://www.google.com"
SEARCH_URL = "https://www.google.com/search?q={q}"
HISTORY_KEEP_PER_DAY = 2000

RELAX_PHRASE = "quiero desbloquear"

# One-click presets for the restrictions dialog.
PRESETS = {
    "Shorts y Reels": {
        "blocked_patterns": ["youtube.com/shorts", "instagram.com/reels",
                             "instagram.com/reel/", "facebook.com/reel"],
        "blocked_domains": ["tiktok.com"],
    },
    "Redes sociales": {
        "blocked_domains": ["facebook.com", "instagram.com", "tiktok.com",
                            "x.com", "twitter.com", "reddit.com", "threads.net"],
    },
    "Noticias y entretenimiento": {
        "blocked_domains": ["netflix.com", "twitch.tv", "9gag.com"],
    },
}


# ── URLs ───────────────────────────────────────────────────────────────────

_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_BARE_SCHEMES = ("about:", "data:", "file:", "mailto:", "view-source:")
_HOSTLIKE = re.compile(r"^(localhost|[\w-]+(\.[\w-]+)+|\d{1,3}(\.\d{1,3}){3})(:\d+)?(/.*)?$")


def normalize_url(text: str) -> str:
    """What the address bar navigates to: a URL as typed, a bare host with
    https:// added, or a web search for anything else."""
    t = (text or "").strip()
    if not t:
        return HOME_URL
    if _SCHEME.match(t) or t.lower().startswith(_BARE_SCHEMES):
        return t
    if " " not in t and _HOSTLIKE.match(t):
        return ("http://" if t.startswith("localhost") else "https://") + t
    return SEARCH_URL.format(q=quote_plus(t))


def host_of(url: str) -> str:
    """Lower-case host without a leading ``www.``; "" for non-web URLs."""
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def _clean_domain(text: str) -> str:
    t = (text or "").strip().lower()
    if "://" in t:
        t = host_of(t)
    t = t.split("/")[0]
    return t[4:] if t.startswith("www.") else t


def domain_matches(host: str, domain: str) -> bool:
    """``domain`` covers itself and every subdomain: youtube.com matches
    m.youtube.com but not notyoutube.com."""
    domain = _clean_domain(domain)
    return bool(domain) and (host == domain or host.endswith("." + domain))


# ── Restrictions ──────────────────────────────────────────────────────────

@dataclass
class Restrictions:
    enabled: bool = True
    # "blocklist": everything allowed except what is blocked.
    # "allowlist": only the allowed domains open (focus mode).
    mode: str = "blocklist"
    blocked_domains: list = field(default_factory=list)
    blocked_patterns: list = field(default_factory=list)   # substrings of the URL
    allowed_domains: list = field(default_factory=list)
    daily_limits: dict = field(default_factory=dict)      # domain -> minutes
    # Self-control friction: loosening the rules asks to type a phrase.
    confirm_to_relax: bool = False

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "mode": self.mode,
            "blocked_domains": list(self.blocked_domains),
            "blocked_patterns": list(self.blocked_patterns),
            "allowed_domains": list(self.allowed_domains),
            "daily_limits": {k: int(v) for k, v in self.daily_limits.items()},
            "confirm_to_relax": self.confirm_to_relax,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Restrictions":
        d = d or {}
        limits = {}
        for k, v in (d.get("daily_limits") or {}).items():
            try:
                limits[_clean_domain(k)] = max(0, int(v))
            except (TypeError, ValueError):
                pass
        return cls(
            enabled=bool(d.get("enabled", True)),
            mode="allowlist" if d.get("mode") == "allowlist" else "blocklist",
            blocked_domains=[_clean_domain(x) for x in d.get("blocked_domains") or [] if _clean_domain(x)],
            blocked_patterns=[str(x).strip().lower() for x in d.get("blocked_patterns") or [] if str(x).strip()],
            allowed_domains=[_clean_domain(x) for x in d.get("allowed_domains") or [] if _clean_domain(x)],
            daily_limits=limits,
            confirm_to_relax=bool(d.get("confirm_to_relax", False)),
        )

    def is_relaxation_of(self, old: "Restrictions") -> bool:
        """True when these rules let through something the old ones blocked."""
        if not old.enabled:
            return False
        if not self.enabled:
            return True
        if old.mode == "allowlist" and self.mode != "allowlist":
            return True
        if self.mode == "allowlist" and set(self.allowed_domains) - set(old.allowed_domains):
            return True
        if set(old.blocked_domains) - set(self.blocked_domains):
            return True
        if set(old.blocked_patterns) - set(self.blocked_patterns):
            return True
        for dom, minutes in old.daily_limits.items():
            if dom not in self.daily_limits or self.daily_limits[dom] > minutes:
                return True
        return old.confirm_to_relax and not self.confirm_to_relax

    def apply_preset(self, name: str):
        preset = PRESETS.get(name) or {}
        for key in ("blocked_domains", "blocked_patterns"):
            current = getattr(self, key)
            for item in preset.get(key, []):
                if item not in current:
                    current.append(item)

    def limit_for(self, host: str) -> Optional[tuple]:
        """(domain, minutes) of the daily limit that covers host, if any."""
        for domain, minutes in self.daily_limits.items():
            if domain_matches(host, domain):
                return domain, minutes
        return None

    def check(self, url: str, usage_today: Optional[dict] = None) -> tuple:
        """(allowed, reason). Only web pages are judged; internal pages
        (about:, data:, the blocked page itself) always pass."""
        if not self.enabled:
            return True, ""
        scheme = (urlsplit(url).scheme or "").lower()
        if scheme not in ("http", "https"):
            return True, ""
        host = host_of(url)
        low = url.lower()
        if self.mode == "allowlist":
            if not any(domain_matches(host, d) for d in self.allowed_domains):
                return False, f"Modo enfoque: {host} no está en la lista de sitios permitidos."
        for d in self.blocked_domains:
            if domain_matches(host, d):
                return False, f"{d} está bloqueado."
        for p in self.blocked_patterns:
            if p and p in low:
                return False, f"Contenido bloqueado por la regla «{p}»."
        lim = self.limit_for(host)
        if lim is not None and usage_today is not None:
            domain, minutes = lim
            used = seconds_for(usage_today, domain)
            if used >= minutes * 60:
                return False, (f"Llegaste al límite diario de {minutes} min en {domain}. "
                               "Vuelve mañana.")
        return True, ""


def seconds_for(usage: dict, domain: str) -> int:
    """Seconds spent today on domain and its subdomains."""
    return int(sum(v for h, v in (usage or {}).items() if domain_matches(h, domain)))


# ── Bookmarks ─────────────────────────────────────────────────────────────

@dataclass
class Bookmark:
    id: str
    title: str
    url: str
    folder: str = ""
    created: str = ""

    def to_dict(self) -> dict:
        d = {"id": self.id, "title": self.title, "url": self.url}
        if self.folder:
            d["folder"] = self.folder
        if self.created:
            d["created"] = self.created
        return d


# ── Store ─────────────────────────────────────────────────────────────────

class WebStore:
    def __init__(self, vault_root: Path):
        self.root = Path(vault_root)

    # paths
    def _p(self, key: str, **kw) -> Path:
        return self.root / fmt.LAYOUT[key].format(**kw)

    def _day_path(self, key: str, day: date) -> Path:
        return self._p(key, year=day.year, month=day.month, date=day.isoformat())

    # bookmarks
    def bookmarks(self) -> list:
        raw = store.load_json(self._p("web_bookmarks"), default=[]) or []
        out = []
        for d in raw if isinstance(raw, list) else []:
            if isinstance(d, dict) and d.get("url"):
                out.append(Bookmark(id=str(d.get("id") or uuid.uuid4().hex[:12]),
                                    title=str(d.get("title") or d["url"]),
                                    url=str(d["url"]), folder=str(d.get("folder") or ""),
                                    created=str(d.get("created") or "")))
        return out

    def save_bookmarks(self, items: list):
        store.write_json(self._p("web_bookmarks"), [b.to_dict() for b in items])

    def is_bookmarked(self, url: str) -> bool:
        return any(b.url == url for b in self.bookmarks())

    def add_bookmark(self, title: str, url: str, folder: str = "") -> Bookmark:
        items = self.bookmarks()
        for b in items:
            if b.url == url:
                return b
        b = Bookmark(id=uuid.uuid4().hex[:12], title=title.strip() or url, url=url,
                     folder=folder, created=datetime.now().strftime(fmt.DATETIME_FMT))
        items.append(b)
        self.save_bookmarks(items)
        return b

    def remove_bookmark(self, url: str) -> bool:
        items = self.bookmarks()
        kept = [b for b in items if b.url != url]
        if len(kept) != len(items):
            self.save_bookmarks(kept)
            return True
        return False

    # restrictions
    def restrictions(self) -> Restrictions:
        return Restrictions.from_dict(store.load_json(self._p("web_restrictions"), default={}))

    def save_restrictions(self, r: Restrictions):
        store.write_json(self._p("web_restrictions"), r.to_dict())

    # history
    def history(self, day: Optional[date] = None) -> list:
        raw = store.load_json(self._day_path("web_history_day", day or date.today()), default=[])
        return [h for h in raw or [] if isinstance(h, dict) and h.get("url")]

    def add_history(self, url: str, title: str = "", when: Optional[datetime] = None):
        if not url.startswith(("http://", "https://")):
            return
        when = when or datetime.now()
        items = self.history(when.date())
        if items and items[-1].get("url") == url:
            if title and items[-1].get("title") != title:
                items[-1]["title"] = title
            else:
                return
        else:
            items.append({"time": when.strftime("%H:%M:%S"), "url": url, "title": title or url})
        store.write_json(self._day_path("web_history_day", when.date()),
                         items[-HISTORY_KEEP_PER_DAY:])

    def history_days(self) -> list:
        """Days that have history, newest first."""
        base = self._p("web_dir") / "historial"
        days = []
        if base.exists():
            for f in base.glob("*/*/*.json"):
                try:
                    days.append(date.fromisoformat(f.stem))
                except ValueError:
                    pass
        return sorted(days, reverse=True)

    def clear_history(self):
        base = self._p("web_dir") / "historial"
        if base.exists():
            for f in base.glob("*/*/*.json"):
                f.unlink(missing_ok=True)

    # usage
    def usage(self, day: Optional[date] = None) -> dict:
        raw = store.load_json(self._day_path("web_usage_day", day or date.today()), default={})
        return {str(k): int(v) for k, v in (raw or {}).items() if isinstance(v, (int, float))}

    def add_usage(self, host: str, seconds: int, day: Optional[date] = None):
        if not host or seconds <= 0:
            return
        day = day or date.today()
        u = self.usage(day)
        u[host] = u.get(host, 0) + int(seconds)
        store.write_json(self._day_path("web_usage_day", day), dict(sorted(u.items())))


class UsageMeter:
    """Accumulates seconds per host in memory and flushes them in batches,
    so the browser does not write a file every tick."""

    def __init__(self, web_store: Optional[WebStore]):
        self.store = web_store
        self._pending: dict = {}
        self._day = date.today()
        self._last_flush = time.monotonic()

    def tick(self, host: str, seconds: int):
        if not host:
            return
        if date.today() != self._day:
            self.flush()
            self._day = date.today()
        self._pending[host] = self._pending.get(host, 0) + seconds
        if time.monotonic() - self._last_flush >= 30:
            self.flush()

    def today(self) -> dict:
        """Stored usage for today plus what is not flushed yet."""
        base = self.store.usage(self._day) if self.store else {}
        for h, s in self._pending.items():
            base[h] = base.get(h, 0) + s
        return base

    def flush(self):
        if self.store is not None:
            for h, s in self._pending.items():
                self.store.add_usage(h, s, self._day)
        self._pending.clear()
        self._last_flush = time.monotonic()


def blocked_page_html(url: str, reason: str) -> str:
    from html import escape
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Bloqueado</title>
<style>body{{background:#1b1b1f;color:#dcdde0;font-family:'Segoe UI',sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
.box{{max-width:520px;text-align:center}}h1{{font-size:44px;margin:0 0 8px}}
p{{color:#a0a0ab;line-height:1.5}}code{{color:#b9a6ff;word-break:break-all}}</style></head>
<body><div class="box"><h1>⛔</h1><h2>Página bloqueada</h2><p>{escape(reason)}</p>
<p><code>{escape(url)}</code></p>
<p>Puedes cambiar las reglas en WEB → 🛡 Restricciones.</p></div></body></html>"""

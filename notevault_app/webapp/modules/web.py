"""WEB: bookmarks, history, time spent per site and content rules, plus a
separate browser window that enforces them.

The browser window is a second pywebview window created WITHOUT the API:
pages opened there never reach Python. A monitor thread watches its address
every second: a page the rules block is replaced by the blocked page, every
visit goes to the history and the time on each site is metered.
"""

from __future__ import annotations

import threading
import time
import webbrowser
from datetime import date, timedelta
from typing import Optional

from ...core.web_store import (
    PRESETS, RELAX_PHRASE, Restrictions, UsageMeter, WebStore, blocked_page_html, host_of,
    normalize_url, seconds_for,
)
from ..errors import ApiError
from .common import one_line

POLL_SECONDS = 1.0
TICK_SECONDS = 5
MAX_LIST = 300


class BrowserSession:
    """The rules applied to one browser window. `poll()` is called every
    second by the monitor thread (and directly by the tests)."""

    def __init__(self, window, store: WebStore, meter: UsageMeter):
        self.window = window
        self.store = store
        self.meter = meter
        self.last_url = ""
        self._last_tick: Optional[float] = None

    def poll(self, now: Optional[float] = None) -> str:
        now = time.monotonic() if now is None else now
        if self._last_tick is None:
            self._last_tick = now
        try:
            url = self.window.get_current_url() or ""
        except Exception:  # noqa: BLE001 - the window is closing
            return "closed"
        if not url.startswith(("http://", "https://")):
            self._last_tick = now
            return "internal"
        allowed, reason = self.store.restrictions().check(url, self.meter.today())
        if not allowed:
            self.window.load_html(blocked_page_html(url, reason))
            self.last_url = ""
            return "blocked"
        if url != self.last_url:
            title = ""
            try:
                title = str(self.window.evaluate_js("document.title") or "")[:300]
            except Exception:  # noqa: BLE001 - the page is still loading
                pass
            self.store.add_history(url, title)
            self.last_url = url
        if now - self._last_tick >= TICK_SECONDS:
            self.meter.tick(host_of(url), int(now - self._last_tick))
            self._last_tick = now
        return "ok"


class WebApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _window."""

    def _web(self) -> WebStore:
        return WebStore(self._root)

    def _web_meter(self) -> UsageMeter:
        meter = getattr(self, "_web_meter_obj", None)
        if meter is None or meter.store is None or meter.store.root != self._root:
            if meter is not None:
                meter.flush()
            meter = UsageMeter(self._web())
            self._web_meter_obj = meter
        return meter

    # ── overview ──────────────────────────────────────────────────────────

    def web_overview(self, day: str = "") -> dict:
        with self._lock:
            ws = self._web()
            try:
                d = date.fromisoformat(day) if day else date.today()
            except ValueError:
                raise ApiError("Fecha inválida.") from None
            r = ws.restrictions()
            usage = self._web_meter().today() if d == date.today() else ws.usage(d)
            week = {}
            for i in range(7):
                dd = date.today() - timedelta(days=i)
                week[dd.isoformat()] = sum(ws.usage(dd).values()) if i else sum(self._web_meter().today().values())
            return {
                "bookmarks": [b.to_dict() for b in ws.bookmarks()][:MAX_LIST],
                "history": list(reversed(ws.history(d)))[:MAX_LIST],
                "history_days": [x.isoformat() for x in ws.history_days()[:60]],
                "day": d.isoformat(),
                "usage": sorted(({"host": h, "seconds": s} for h, s in usage.items()),
                                key=lambda x: -x["seconds"])[:50],
                "week": [{"date": k, "seconds": v} for k, v in sorted(week.items())],
                "restrictions": r.to_dict(),
                "limits": [{"domain": dom, "minutes": m, "used": seconds_for(usage, dom)}
                           for dom, m in r.daily_limits.items()],
                "presets": list(PRESETS),
                "relax_phrase": RELAX_PHRASE,
                "embedded": getattr(self, "_window", None) is not None,
            }

    def web_normalize(self, text: str) -> dict:
        url = normalize_url(one_line(text, 2000))
        return {"url": url, "host": host_of(url)}

    # ── bookmarks / history ───────────────────────────────────────────────

    def web_bookmark_add(self, title: str, url: str) -> dict:
        url = normalize_url(one_line(url, 2000))
        if not url.startswith(("http://", "https://")):
            raise ApiError("Solo se guardan páginas http o https.")
        with self._lock:
            return self._web().add_bookmark(one_line(title, 200), url).to_dict()

    def web_bookmark_remove(self, url: str) -> dict:
        with self._lock:
            return {"ok": self._web().remove_bookmark(str(url or ""))}

    def web_history_clear(self) -> dict:
        with self._lock:
            self._web().clear_history()
            return {"ok": True}

    # ── restrictions ──────────────────────────────────────────────────────

    def web_restrictions_save(self, data: dict, phrase: str = "") -> dict:
        """Save the rules. Loosening them with «pedir confirmación» on needs
        the phrase typed exactly."""
        if not isinstance(data, dict):
            raise ApiError("Reglas inválidas.")
        new = Restrictions.from_dict({k: data.get(k) for k in (
            "enabled", "mode", "blocked_domains", "blocked_patterns", "allowed_domains",
            "daily_limits", "confirm_to_relax")})
        for key in ("blocked_domains", "blocked_patterns", "allowed_domains"):
            setattr(new, key, [one_line(x, 300) for x in getattr(new, key)][:500])
        new.daily_limits = {one_line(k, 200): min(24 * 60, v) for k, v in list(new.daily_limits.items())[:200] if k}
        with self._lock:
            ws = self._web()
            old = ws.restrictions()
            if old.confirm_to_relax and new.is_relaxation_of(old) \
                    and str(phrase or "").strip().lower() != RELAX_PHRASE:
                return {"ok": False, "needs_phrase": True, "phrase": RELAX_PHRASE}
            ws.save_restrictions(new)
            return {"ok": True, "restrictions": new.to_dict()}

    def web_preset(self, data: dict, name: str) -> dict:
        """The rules with a preset added (not saved)."""
        if name not in PRESETS:
            raise ApiError("Preajuste desconocido.")
        r = Restrictions.from_dict(data if isinstance(data, dict) else {})
        r.apply_preset(name)
        return r.to_dict()

    def web_check(self, url: str) -> dict:
        with self._lock:
            ok, reason = self._web().restrictions().check(normalize_url(str(url or "")), self._web_meter().today())
            return {"allowed": ok, "reason": reason}

    # ── the browser window ────────────────────────────────────────────────

    def web_open(self, text: str) -> dict:
        """Open a page in the NoteVault browser window (rules enforced); the
        dev bridge, with no window of its own, uses the system browser."""
        url = normalize_url(one_line(text, 2000))
        if not url.startswith(("http://", "https://")):
            raise ApiError("Solo se abren páginas http o https.")
        with self._lock:
            ok, reason = self._web().restrictions().check(url, self._web_meter().today())
            if not ok:
                return {"ok": False, "blocked": True, "reason": reason}
        if getattr(self, "_window", None) is None:
            webbrowser.open(url)
            return {"ok": True, "system": True}
        import webview  # only inside the desktop app
        win = getattr(self, "_web_window", None)
        if win is not None:
            try:
                win.load_url(url)
                win.show()
                return {"ok": True}
            except Exception:  # noqa: BLE001 - it was closed: make a new one
                self._web_window = None
        win = webview.create_window("NoteVault · WEB", url, width=1200, height=820, text_select=True, zoomable=True)
        self._web_window = win
        session = BrowserSession(win, self._web(), self._web_meter())
        stop = threading.Event()
        win.events.closed += lambda: stop.set()

        def monitor():
            while not stop.wait(POLL_SECONDS):
                if session.poll() == "closed":
                    break
            session.meter.flush()
            if getattr(self, "_web_window", None) is win:
                self._web_window = None

        threading.Thread(target=monitor, name="nv-web-monitor", daemon=True).start()
        return {"ok": True}

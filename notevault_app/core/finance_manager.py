"""
Finanzas: daily movements, categories, and savings goals kept apart from Metas.

    .notevault/finanzas/
    ├── categorias/<cat-id>.json          one category per file
    ├── metas/<fgoal-id>.json             one savings goal per file
    ├── AAAA/MM/AAAA-MM-DD.json           the day's movements
    └── adjuntos/AAAA/MM/<mov-id>-<n>.png invoices and references

Amounts are integer cents everywhere, on disk and in memory; formatting
happens only when showing them. Balance = ingresos - gastos - ahorros + retiros.
"""

import calendar
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from . import store, vault_format
from . import module_attachments as ma
from .recurrence import Recurrence

GASTO, INGRESO, AHORRO, RETIRO = vault_format.MOVEMENT_TYPES
G_ACTIVE, G_PAUSED, G_DONE = vault_format.FINANCE_GOAL_STATUSES
TYPE_LABELS = {GASTO: "Gasto", INGRESO: "Ingreso", AHORRO: "Ahorro", RETIRO: "Retiro"}
TYPE_COLOURS = {GASTO: "#f2555a", INGRESO: "#4ade80", AHORRO: "#eab308", RETIRO: "#ff9632"}

DEFAULT_CATEGORIES = (
    ("Comida", "🍽", "#f4511e", GASTO), ("Transporte", "🚌", "#039be5", GASTO),
    ("Vivienda", "🏠", "#8e24aa", GASTO), ("Servicios", "💡", "#f6bf26", GASTO),
    ("Salud", "💊", "#33b679", GASTO), ("Educación", "📚", "#3f51b5", GASTO),
    ("Ocio", "🎮", "#e67c73", GASTO), ("Compras", "🛍", "#7986cb", GASTO),
    ("Otros", "•", "#616161", GASTO),
    ("Salario", "💼", "#0b8043", INGRESO), ("Extra", "✨", "#33b679", INGRESO),
    ("Regalo", "🎁", "#e67c73", INGRESO),
)


def format_money(cents: int, currency: str = vault_format.DEFAULT_CURRENCY, sign: bool = False) -> str:
    """'$ 12.500' for COP (no decimals, dot thousands); '$ 12,50' with decimals otherwise."""
    cents = int(cents or 0)
    neg, cents = cents < 0, abs(cents)
    if currency == "COP":
        text = f"{(cents + 50) // 100:,}".replace(",", ".")
    else:
        whole, rest = divmod(cents, 100)
        text = f"{whole:,}".replace(",", ".") + f",{rest:02d}"
    prefix = "-" if neg else ("+" if sign and cents else "")
    return f"{prefix}$ {text}"


def empty_totals() -> dict:
    return {GASTO: 0, INGRESO: 0, AHORRO: 0, RETIRO: 0, "balance": 0}


def totals(movements) -> dict:
    out = empty_totals()
    for m in movements:
        t = m.get("type")
        if t in out:
            out[t] += int(m.get("amount_cents") or 0)
    out["balance"] = out[INGRESO] - out[GASTO] - out[AHORRO] + out[RETIRO]
    return out


def _clean_int(v, default=0):
    return v if isinstance(v, int) and not isinstance(v, bool) else default


def sanitize_movement(raw: dict) -> dict:
    """The movement with keys in MOVEMENT_KEYS order; empty optional keys dropped."""
    raw = raw if isinstance(raw, dict) else {}
    out = {
        "id": str(raw.get("id") or store.new_id("mv")),
        "type": raw.get("type") if raw.get("type") in vault_format.MOVEMENT_TYPES else GASTO,
        "amount_cents": abs(_clean_int(raw.get("amount_cents"))),
        "currency": str(raw.get("currency") or vault_format.DEFAULT_CURRENCY),
    }
    for key in ("category", "goal", "what", "reason", "time"):
        value = raw.get(key)
        if value not in (None, ""):
            out[key] = str(value)
    out["attachments"] = [str(a) for a in (raw.get("attachments") or []) if a]
    if raw.get("created"):
        out["created"] = str(raw["created"])
    for key, value in raw.items():             # keys a newer client added
        if key not in out and key not in vault_format.MOVEMENT_KEYS:
            out[key] = value
    return out


def sanitize_category(raw: dict, fallback_id: str = "") -> dict:
    raw = raw if isinstance(raw, dict) else {}
    order = raw.get("order")
    return {
        "id": str(raw.get("id") or fallback_id),
        "name": str(raw.get("name") or "Categoría"),
        "icon": str(raw.get("icon") or ""),
        "colour": str(raw.get("colour") or "#616161"),
        "kind": raw.get("kind") if raw.get("kind") in (GASTO, INGRESO) else GASTO,
        "budget_month_cents": _clean_int(raw.get("budget_month_cents")),
        "order": order if isinstance(order, (int, float)) and not isinstance(order, bool) else 0,
        "archived": bool(raw.get("archived", False)),
    }


def sanitize_goal(raw: dict, fallback_id: str = "") -> dict:
    raw = raw if isinstance(raw, dict) else {}
    cadence = raw.get("cadence") if isinstance(raw.get("cadence"), dict) else {}
    if cadence.get("mode") == "period" and cadence.get("period") in ("week", "month"):
        cadence = {"mode": "period", "period": cadence["period"]}
    else:
        rule = Recurrence.parse(cadence.get("rule")).to_string() or "daily"
        cadence = {"mode": "rule", "rule": rule}
    return {
        "id": str(raw.get("id") or fallback_id),
        "name": str(raw.get("name") or "Meta de ahorro"),
        "icon": str(raw.get("icon") or "💰"),
        "colour": str(raw.get("colour") or "#33b679"),
        "target_cents": abs(_clean_int(raw.get("target_cents"))),
        "currency": str(raw.get("currency") or vault_format.DEFAULT_CURRENCY),
        "start": str(raw.get("start") or ""),
        "deadline": str(raw.get("deadline") or ""),
        "show_in_daily": bool(raw.get("show_in_daily", False)),
        "cadence": cadence,
        "suggested_cents": abs(_clean_int(raw.get("suggested_cents"))),
        "status": raw.get("status") if raw.get("status") in vault_format.FINANCE_GOAL_STATUSES else G_ACTIVE,
        "created": str(raw.get("created") or ""),
        "notes": str(raw.get("notes") or ""),
    }


class FinanceManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["finance_dir"]
        self._days = store.MtimeCache()

    # ── Paths ─────────────────────────────────────────────────────────────

    def day_path(self, d: date) -> Path:
        return self.vault_root / vault_format.LAYOUT["finance_day"].format(
            year=d.year, month=d.month, date=d.isoformat())

    def category_path(self, cid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["finance_category"].format(id=cid)

    def goal_path(self, gid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["finance_goal"].format(id=gid)

    # ── Categories ────────────────────────────────────────────────────────

    def categories(self, kind: Optional[str] = None, include_archived: bool = False) -> list:
        folder = self.category_path("x").parent
        out = []
        for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
            if vault_format.is_sync_conflict(path.name):
                continue
            data = store.load_json(path)
            if isinstance(data, dict):
                out.append(sanitize_category(data, path.stem))
        out = [c for c in out if (include_archived or not c["archived"]) and (kind is None or c["kind"] == kind)]
        out.sort(key=lambda c: (c["kind"] != GASTO, c["order"], c["name"].lower()))
        return out

    def category_map(self) -> dict:
        return {c["id"]: c for c in self.categories(include_archived=True)}

    def ensure_defaults(self) -> bool:
        """Create the default categories when the folder is empty."""
        if self.categories(include_archived=True):
            return False
        for n, (name, icon, colour, kind) in enumerate(DEFAULT_CATEGORIES, start=1):
            self._save_category(sanitize_category({"id": store.slug(name), "name": name, "icon": icon,
                                                   "colour": colour, "kind": kind, "order": n}))
        return True

    def _save_category(self, cat: dict):
        store.write_json(self.category_path(cat["id"]), sanitize_category(cat))

    def create_category(self, name: str, kind: str = GASTO, icon: str = "", colour: str = "#616161",
                        budget_month_cents: int = 0) -> dict:
        existing = {c["id"] for c in self.categories(include_archived=True)}
        base = store.slug(name)
        cid, n = base, 2
        while cid in existing:
            cid, n = f"{base}-{n}", n + 1
        order = max([c["order"] for c in self.categories(kind, True)] or [0]) + 1
        cat = sanitize_category({"id": cid, "name": name.strip() or "Categoría", "icon": icon,
                                 "colour": colour, "kind": kind, "order": order,
                                 "budget_month_cents": budget_month_cents})
        self._save_category(cat)
        return cat

    def update_category(self, cid: str, **fields) -> Optional[dict]:
        cat = self.category_map().get(cid)
        if cat is None:
            return None
        cat.update({k: v for k, v in fields.items() if k in vault_format.CATEGORY_KEYS and k != "id"})
        self._save_category(cat)
        return cat

    def archive_category(self, cid: str, archived: bool = True):
        return self.update_category(cid, archived=archived)

    # ── Movements ─────────────────────────────────────────────────────────

    def _load_day(self, path):
        data = store.load_json(path, {}) if path else {}
        movs = data.get("movements") if isinstance(data, dict) else None
        return [sanitize_movement(m) for m in movs if isinstance(m, dict)] if isinstance(movs, list) else []

    def day(self, d: date) -> list:
        return [dict(m, attachments=list(m["attachments"])) for m in self._days.get(self.day_path(d), self._load_day)]

    def _save_day(self, d: date, movements: list):
        path = self.day_path(d)
        self._days.forget(path)
        if not movements:
            if path.exists():
                path.unlink()
            return
        store.write_json(path, {"movements": [sanitize_movement(m) for m in movements]})

    def add(self, d: date, type: str, amount_cents: int, **fields) -> dict:
        mov = sanitize_movement(dict(fields, type=type, amount_cents=amount_cents,
                                     created=fields.get("created") or datetime.now().strftime("%Y-%m-%dT%H:%M")))
        movements = self.day(d)
        movements.append(mov)
        self._save_day(d, movements)
        if mov.get("goal"):
            self.refresh_goal_status(mov["goal"])
        return mov

    def get(self, d: date, mid: str) -> Optional[dict]:
        return next((m for m in self.day(d) if m["id"] == mid), None)

    def update(self, d: date, mid: str, **fields) -> Optional[dict]:
        movements = self.day(d)
        for i, m in enumerate(movements):
            if m["id"] == mid:
                m.update({k: v for k, v in fields.items() if k != "id"})
                for key in ("category", "goal", "what", "reason", "time"):
                    if m.get(key) in (None, ""):
                        m.pop(key, None)
                movements[i] = sanitize_movement(m)
                self._save_day(d, movements)
                for gid in {fields.get("goal"), m.get("goal")} - {None, ""}:
                    self.refresh_goal_status(gid)
                return movements[i]
        return None

    def move(self, mid: str, old_d: date, new_d: date) -> Optional[dict]:
        if old_d == new_d:
            return self.get(old_d, mid)
        movements = self.day(old_d)
        mov = next((m for m in movements if m["id"] == mid), None)
        if mov is None:
            return None
        target = self.day(new_d)
        target.append(mov)
        self._save_day(new_d, target)           # write the new place first
        self._save_day(old_d, [m for m in movements if m["id"] != mid])
        return mov

    def delete(self, d: date, mid: str) -> bool:
        movements = self.day(d)
        mov = next((m for m in movements if m["id"] == mid), None)
        if mov is None:
            return False
        for ref in mov.get("attachments", []):
            ma.remove(self.vault_root, ref, "finanzas-adjuntos")
        self._save_day(d, [m for m in movements if m["id"] != mid])
        if mov.get("goal"):
            self.refresh_goal_status(mov["goal"])
        return True

    # ── Ranges ────────────────────────────────────────────────────────────

    def range(self, first: date, last: date) -> list:
        """[(date, movement)] in order."""
        out = []
        d = first
        while d <= last:
            path = self.day_path(d)
            if path.exists():
                out.extend((d, m) for m in self.day(d))
            d += timedelta(days=1)
        return out

    def all_days(self) -> list:
        if not self.dir.is_dir():
            return []
        days = []
        for path in self.dir.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/*.json"):
            try:
                days.append(date.fromisoformat(path.stem))
            except ValueError:
                continue
        return sorted(days)

    @staticmethod
    def week_bounds(d: date) -> tuple:
        monday = d - timedelta(days=d.weekday())
        return monday, monday + timedelta(days=6)

    @staticmethod
    def month_bounds(year: int, month: int) -> tuple:
        return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])

    def week(self, d: date) -> list:
        return self.range(*self.week_bounds(d))

    def month(self, year: int, month: int) -> list:
        return self.range(*self.month_bounds(year, month))

    def year(self, year: int) -> list:
        return self.range(date(year, 1, 1), date(year, 12, 31))

    # ── Sums ──────────────────────────────────────────────────────────────

    @staticmethod
    def by_category(pairs, kind: str = GASTO) -> dict:
        out: dict = {}
        for _d, m in pairs:
            if m["type"] == kind:
                key = m.get("category", "")
                out[key] = out.get(key, 0) + m["amount_cents"]
        return out

    @staticmethod
    def by_day(pairs, first: date, last: date) -> list:
        days: dict = {}
        for d, m in pairs:
            days.setdefault(d, []).append(m)
        out, d = [], first
        while d <= last:
            out.append((d, totals(days.get(d, []))))
            d += timedelta(days=1)
        return out

    def by_month(self, year: int) -> list:
        pairs = self.year(year)
        return [(m, totals([mv for d, mv in pairs if d.month == m])) for m in range(1, 13)]

    def budget_used(self, year: int, month: int) -> list:
        """[(category, used cents, budget cents)] for expense categories with a budget or spending."""
        spent = self.by_category(self.month(year, month), GASTO)
        out = []
        for c in self.categories(GASTO, include_archived=True):
            used = spent.get(c["id"], 0)
            if c["budget_month_cents"] or used:
                out.append((c, used, c["budget_month_cents"]))
        return out

    def compare_month(self, year: int, month: int) -> tuple:
        prev_y, prev_m = (year - 1, 12) if month == 1 else (year, month - 1)
        this = totals(m for _d, m in self.month(year, month))
        prev = totals(m for _d, m in self.month(prev_y, prev_m))
        return this, prev

    # ── Savings goals ─────────────────────────────────────────────────────

    def goals(self, include_done: bool = True) -> list:
        folder = self.goal_path("x").parent
        out = []
        for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
            if vault_format.is_sync_conflict(path.name):
                continue
            data = store.load_json(path)
            if isinstance(data, dict):
                out.append(sanitize_goal(data, path.stem))
        if not include_done:
            out = [g for g in out if g["status"] != G_DONE]
        order = {G_ACTIVE: 0, G_PAUSED: 1, G_DONE: 2}
        out.sort(key=lambda g: (order[g["status"]], g["deadline"] or "9999", g["name"].lower()))
        return out

    def get_goal(self, gid: str) -> Optional[dict]:
        data = store.load_json(self.goal_path(gid))
        return sanitize_goal(data, gid) if isinstance(data, dict) else None

    def _save_goal(self, goal: dict):
        store.write_json(self.goal_path(goal["id"]), sanitize_goal(goal))

    def create_goal(self, name: str, target_cents: int, **fields) -> dict:
        today = date.today().isoformat()
        goal = sanitize_goal(dict({"start": today, "created": today, "show_in_daily": True},
                                  **fields, id=store.new_id("f"), name=name.strip() or "Meta de ahorro",
                                  target_cents=target_cents))
        self._save_goal(goal)
        return goal

    def update_goal(self, gid: str, **fields) -> Optional[dict]:
        goal = self.get_goal(gid)
        if goal is None:
            return None
        goal.update({k: v for k, v in fields.items() if k in vault_format.FINANCE_GOAL_KEYS and k != "id"})
        self._save_goal(goal)
        return self.get_goal(gid)

    def delete_goal(self, gid: str):
        store.to_trash(self.vault_root, self.goal_path(gid), "finanzas-metas")

    def goal_movements(self, gid: str) -> list:
        """[(date, movement)] of every ahorro/retiro for the goal, oldest first."""
        out = []
        for d in self.all_days():
            for m in self.day(d):
                if m.get("goal") == gid and m["type"] in (AHORRO, RETIRO):
                    out.append((d, m))
        return out

    def saved(self, gid: str) -> int:
        return sum(m["amount_cents"] if m["type"] == AHORRO else -m["amount_cents"]
                   for _d, m in self.goal_movements(gid))

    def refresh_goal_status(self, gid: str):
        """A goal becomes Cumplida when the saved amount reaches the target, and
        goes back to Activa if a withdrawal takes it below again."""
        goal = self.get_goal(gid)
        if goal is None or not goal["target_cents"] or goal["status"] == G_PAUSED:
            return
        reached = self.saved(gid) >= goal["target_cents"]
        status = G_DONE if reached else G_ACTIVE
        if status != goal["status"]:
            goal["status"] = status
            self._save_goal(goal)

    def history(self, gid: str) -> dict:
        """{"days": [(date, net cents, [movements])], "months": [("AAAA-MM", net cents)]}"""
        days: dict = {}
        for d, m in self.goal_movements(gid):
            days.setdefault(d, []).append(m)
        rows, months = [], {}
        for d in sorted(days):
            net = sum(m["amount_cents"] if m["type"] == AHORRO else -m["amount_cents"] for m in days[d])
            rows.append((d, net, days[d]))
            key = f"{d.year}-{d.month:02d}"
            months[key] = months.get(key, 0) + net
        return {"days": rows, "months": sorted(months.items())}

    def _period(self, goal: dict, d: date) -> tuple:
        if goal["cadence"]["period"] == "week":
            return self.week_bounds(d)
        return self.month_bounds(d.year, d.month)

    def due_checks(self, d: date) -> list:
        """[(goal, checked, [movement ids])] for goals shown in Diario that are due on d."""
        out = []
        for goal in self.goals(include_done=False):
            if not goal["show_in_daily"] or goal["status"] != G_ACTIVE:
                continue
            start = store.parse_day(goal["start"]) if goal["start"] else None
            if start and d < start:
                continue
            cadence = goal["cadence"]
            if cadence["mode"] == "period":
                first, last = self._period(goal, d)
            else:
                if not Recurrence.parse(cadence["rule"]).occurs_on(d, start):
                    continue
                first = last = d
            ids = [m["id"] for _dd, m in self.range(first, last)
                   if m.get("goal") == goal["id"] and m["type"] == AHORRO]
            out.append((goal, bool(ids), ids))
        return out

    def pace(self, gid: str, today: Optional[date] = None) -> dict:
        """What is left and how much to save per day / week / month to arrive on time."""
        today = today or date.today()
        goal = self.get_goal(gid)
        saved = self.saved(gid)
        remaining = max(0, goal["target_cents"] - saved) if goal else 0
        out = {"saved": saved, "remaining": remaining, "per_day": None, "per_week": None,
               "per_month": None, "days_left": None}
        deadline = store.parse_day(goal["deadline"]) if goal and goal["deadline"] else None
        if deadline:
            days = (deadline - today).days + 1
            out["days_left"] = days - 1
            if days > 0 and remaining:
                out["per_day"] = -(-remaining // days)
                out["per_week"] = -(-remaining * 7 // days)
                out["per_month"] = -(-remaining * 30 // days)
        return out

    def projection(self, gid: str, today: Optional[date] = None) -> Optional[date]:
        """Estimated date of reaching the target at the pace of the last 30 days."""
        today = today or date.today()
        goal = self.get_goal(gid)
        if goal is None:
            return None
        remaining = goal["target_cents"] - self.saved(gid)
        if remaining <= 0:
            return today
        first = today - timedelta(days=29)
        recent = sum(m["amount_cents"] if m["type"] == AHORRO else -m["amount_cents"]
                     for d, m in self.goal_movements(gid) if d >= first)
        if recent <= 0:
            return None
        return today + timedelta(days=-(-remaining * 30 // recent))

    def general_savings(self) -> int:
        """Ahorro without a goal, minus withdrawals without a goal."""
        total = 0
        for d in self.all_days():
            for m in self.day(d):
                if not m.get("goal"):
                    if m["type"] == AHORRO:
                        total += m["amount_cents"]
                    elif m["type"] == RETIRO:
                        total -= m["amount_cents"]
        return total

    def search(self, pairs, query: str = "", kind: str = "", category: str = "") -> list:
        q = (query or "").strip().lower()
        out = []
        for d, m in pairs:
            if kind and m["type"] != kind:
                continue
            if category and m.get("category", "") != category:
                continue
            if q and q not in f"{m.get('what', '')} {m.get('reason', '')}".lower():
                continue
            out.append((d, m))
        return out


class FinanceCalendarSource:
    """Savings checks that are due, as all-day items in the calendar."""

    prefix = "saving:"

    def __init__(self, manager: FinanceManager):
        self.manager = manager

    def occurrences(self, first: date, last: date) -> dict:
        from .schedule_manager import Occurrence
        today = date.today()
        out: dict = {}
        d = max(first, today - timedelta(days=31))
        while d <= min(last, today + timedelta(days=62)):
            for goal, checked, _ids in self.manager.due_checks(d):
                if goal["cadence"]["mode"] == "period" and d != self.manager._period(goal, d)[0]:
                    continue            # one block per period, on its first day
                out.setdefault(d, []).append(Occurrence(
                    id=f"{self.prefix}{goal['id']}", title=f"{goal['icon']} Ahorro {goal['name']}",
                    kind="saving", date=d, start=None, duration_min=None, colour=goal["colour"],
                    links=[{"type": "finance_goal", "id": goal["id"]}], done=checked,
                    source="finanzas", editable=False))
            d += timedelta(days=1)
        return out

    def set_done(self, d: date, occurrence_id: str, done: bool):
        gid = occurrence_id[len(self.prefix):]
        goal = self.manager.get_goal(gid)
        if goal is None:
            return
        if done:
            self.manager.add(d, AHORRO, goal["suggested_cents"], goal=gid, what=f"Ahorro {goal['name']}")
        else:
            for m in self.manager.day(d):
                if m.get("goal") == gid and m["type"] == AHORRO:
                    self.manager.delete(d, m["id"])

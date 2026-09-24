"""Finanzas: the bridge over core.finance_manager (movements, categories,
savings goals). Amounts travel as integer cents."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any, Optional

from ...core import finance_manager as fin
from ...core import vault_format
from ...core.recurrence import Recurrence
from ..errors import ApiError
from .common import clamp_int, one_line, opt_date, opt_time
from .files import check_ref

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_CENTS = 10 ** 15
MAX_RANGE_DAYS = 400


def _cents(value: Any, allow_zero: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        try:
            value = int(str(value))
        except (TypeError, ValueError):
            raise ApiError("Importe inválido.") from None
    value = int(value)
    if value < 0 or value > MAX_CENTS or (value == 0 and not allow_zero):
        raise ApiError("Importe inválido.")
    return value


def _pairs(pairs) -> list:
    return [dict(m, date=d.isoformat()) for d, m in pairs]


class FinanceApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _mgrs()."""

    def _fm(self) -> fin.FinanceManager:
        fm = self._mgrs().finances
        fm.ensure_defaults()
        return fm

    def _fin_date(self, value: Any) -> date:
        d = opt_date(value)
        if d is None:
            raise ApiError("Fecha inválida.")
        return d

    # ── overview ──────────────────────────────────────────────────────────

    def fin_meta(self) -> dict:
        with self._lock:
            fm = self._fm()
            return {
                "types": list(vault_format.MOVEMENT_TYPES), "type_labels": fin.TYPE_LABELS,
                "type_colours": fin.TYPE_COLOURS, "goal_statuses": list(vault_format.FINANCE_GOAL_STATUSES),
                "currency": vault_format.DEFAULT_CURRENCY,
                "categories": fm.categories(include_archived=True),
                "goals": fm.goals(),
            }

    def fin_sidebar(self) -> dict:
        """Diario's pending savings, this month's sums and the saved totals."""
        with self._lock:
            fm = self._fm()
            today = date.today()
            this, _prev = fm.compare_month(today.year, today.month)
            goals = [{"id": g["id"], "icon": g["icon"], "name": g["name"], "saved": fm.saved(g["id"])}
                     for g in fm.goals(include_done=True)]
            general = fm.general_savings()
            return {
                "pending": sum(1 for _g, checked, _i in fm.due_checks(today) if not checked),
                "month": this, "general": general, "goals": goals,
                "total_saved": general + sum(g["saved"] for g in goals),
            }

    def fin_range(self, first: str, last: str) -> list:
        with self._lock:
            a, b = self._fin_date(first), self._fin_date(last)
            if b < a or (b - a).days > MAX_RANGE_DAYS:
                raise ApiError("Rango de fechas inválido.")
            return _pairs(self._fm().range(a, b))

    def fin_month_extras(self, year: int, month: int) -> dict:
        """Budgets and the comparison with the previous month."""
        with self._lock:
            y, m = clamp_int(year, 1970, 3000, date.today().year), clamp_int(month, 1, 12, 1)
            fm = self._fm()
            this, prev = fm.compare_month(y, m)
            return {"budgets": [{"category": c, "used": used, "budget": budget}
                                for c, used, budget in fm.budget_used(y, m)],
                    "this": this, "prev": prev}

    def fin_due_checks(self, day: str) -> list:
        with self._lock:
            fm = self._fm()
            d = self._fin_date(day)
            out = []
            for goal, checked, ids in fm.due_checks(d):
                if goal["cadence"]["mode"] == "period":
                    first, last = fm._period(goal, d)
                else:
                    first = last = d
                out.append({"goal": goal, "checked": checked, "ids": ids, "pace": fm.pace(goal["id"]),
                            "first": first.isoformat(), "last": last.isoformat()})
            return out

    # ── movements ─────────────────────────────────────────────────────────

    def _fin_movement_fields(self, fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos del movimiento inválidos.")
        fm = self._fm()
        kind = fields.get("type", fin.GASTO)
        if kind not in vault_format.MOVEMENT_TYPES:
            raise ApiError("Tipo inválido.")
        out = {"type": kind, "amount_cents": _cents(fields.get("amount_cents")),
               "what": one_line(fields.get("what"), 200), "reason": one_line(fields.get("reason"), 400),
               "time": opt_time(fields.get("time")) or "", "category": "", "goal": ""}
        if kind in (fin.GASTO, fin.INGRESO):
            cat = str(fields.get("category") or "")
            if cat and cat not in fm.category_map():
                raise ApiError("Esa categoría no existe.")
            out["category"] = cat
        else:
            goal = str(fields.get("goal") or "")
            if goal and fm.get_goal(goal) is None:
                raise ApiError("Esa meta de ahorro no existe.")
            out["goal"] = goal
        refs = fields.get("attachments") or []
        if not isinstance(refs, list):
            raise ApiError("Adjuntos inválidos.")
        out["attachments"] = [check_ref(r) for r in refs][:30]
        return out

    def fin_add(self, day: str, fields: dict) -> dict:
        with self._lock:
            d = self._fin_date(day)
            f = self._fin_movement_fields(fields)
            mid = str(fields.get("id") or "")
            if mid and not re.fullmatch(r"mv\d{8}-[0-9a-f]{6}", mid):
                raise ApiError("Id inválido.")
            kind, cents = f.pop("type"), f.pop("amount_cents")
            if mid:
                f["id"] = mid
            return self._fm().add(d, kind, cents, **f)

    def fin_new_id(self) -> dict:
        """An id for a movement not saved yet (its attachments need an owner)."""
        from ...core import store
        return {"id": store.new_id("mv")}

    def fin_update(self, day: str, mid: str, fields: dict, new_day: str = "") -> dict:
        with self._lock:
            d = self._fin_date(day)
            fm = self._fm()
            if fm.get(d, str(mid)) is None:
                raise ApiError("Ese movimiento ya no existe.")
            f = self._fin_movement_fields(fields)
            mov = fm.update(d, str(mid), **f)
            target = opt_date(new_day)
            if target and target != d:
                mov = fm.move(str(mid), d, target)
            return mov or {}

    def fin_delete(self, day: str, mid: str) -> dict:
        """The movement is removed; its attachments go to the vault trash."""
        with self._lock:
            if not self._fm().delete(self._fin_date(day), str(mid)):
                raise ApiError("Ese movimiento ya no existe.")
            return {"ok": True}

    def fin_delete_many(self, day_ids: list) -> dict:
        with self._lock:
            if not isinstance(day_ids, list):
                raise ApiError("Datos inválidos.")
            fm = self._fm()
            for pair in day_ids[:200]:
                if isinstance(pair, (list, tuple)) and len(pair) == 2:
                    fm.delete(self._fin_date(pair[0]), str(pair[1]))
            return {"ok": True}

    # ── categories ────────────────────────────────────────────────────────

    def fin_category_save(self, cid: str, fields: dict) -> dict:
        with self._lock:
            if not isinstance(fields, dict):
                raise ApiError("Datos inválidos.")
            fm = self._fm()
            name = one_line(fields.get("name"), 60)
            icon = one_line(fields.get("icon"), 8)
            colour = str(fields.get("colour") or "#616161")
            if not _HEX_RE.match(colour):
                raise ApiError("Color inválido.")
            budget = _cents(fields.get("budget_month_cents") or 0, allow_zero=True)
            if not cid:
                kind = fields.get("kind", fin.GASTO)
                if kind not in (fin.GASTO, fin.INGRESO):
                    raise ApiError("Tipo inválido.")
                if not name:
                    raise ApiError("La categoría necesita un nombre.")
                return fm.create_category(name, kind, icon, colour, budget)
            if str(cid) not in fm.category_map():
                raise ApiError("Esa categoría ya no existe.")
            patch = {"icon": icon, "colour": colour, "budget_month_cents": budget}
            if name:
                patch["name"] = name
            if "archived" in fields:
                patch["archived"] = bool(fields["archived"])
            return fm.update_category(str(cid), **patch)

    # ── savings goals ─────────────────────────────────────────────────────

    def _fin_goal_fields(self, fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos de la meta inválidos.")
        out: dict = {}
        if "name" in fields:
            out["name"] = one_line(fields["name"], 120) or "Meta de ahorro"
        if "icon" in fields:
            out["icon"] = one_line(fields["icon"], 8) or "💰"
        if "target_cents" in fields:
            out["target_cents"] = _cents(fields["target_cents"])
        if "suggested_cents" in fields:
            out["suggested_cents"] = _cents(fields["suggested_cents"] or 0, allow_zero=True)
        for k in ("start", "deadline"):
            if k in fields:
                d = opt_date(fields[k])
                out[k] = d.isoformat() if d else ""
        if "colour" in fields:
            c = str(fields["colour"] or "")
            if not _HEX_RE.match(c):
                raise ApiError("Color inválido.")
            out["colour"] = c
        if "show_in_daily" in fields:
            out["show_in_daily"] = bool(fields["show_in_daily"])
        if "cadence" in fields:
            c = fields["cadence"] if isinstance(fields["cadence"], dict) else {}
            if c.get("mode") == "period":
                if c.get("period") not in ("week", "month"):
                    raise ApiError("Periodo inválido.")
                out["cadence"] = {"mode": "period", "period": c["period"]}
            else:
                rule = Recurrence.parse(one_line(c.get("rule"), 60)).to_string()
                out["cadence"] = {"mode": "rule", "rule": rule or "daily"}
        if "status" in fields:
            if fields["status"] not in vault_format.FINANCE_GOAL_STATUSES:
                raise ApiError("Estado inválido.")
            out["status"] = fields["status"]
        if "notes" in fields:
            out["notes"] = str(fields["notes"] or "")[:20_000]
        return out

    def fin_goals(self) -> dict:
        with self._lock:
            fm = self._fm()
            today = date.today()
            out = []
            for g in fm.goals():
                proj = fm.projection(g["id"], today)
                out.append(dict(g, pace=fm.pace(g["id"], today), projection=proj.isoformat() if proj else None))
            return {"goals": out, "general": fm.general_savings()}

    def fin_goal(self, gid: str) -> dict:
        with self._lock:
            fm = self._fm()
            g = fm.get_goal(str(gid))
            if g is None:
                raise ApiError("Esa meta de ahorro ya no existe.")
            today = date.today()
            proj = fm.projection(g["id"], today)
            hist = fm.history(g["id"])
            movements = fm.goal_movements(g["id"])
            return {
                "goal": g, "pace": fm.pace(g["id"], today), "projection": proj.isoformat() if proj else None,
                "days": [{"date": d.isoformat(), "net": net} for d, net, _m in hist["days"]],
                "months": hist["months"], "movements": _pairs(movements),
            }

    def fin_goal_save(self, gid: str, fields: dict) -> dict:
        with self._lock:
            fm = self._fm()
            f = self._fin_goal_fields(fields)
            if not gid:
                if "target_cents" not in f:
                    raise ApiError("La meta necesita un objetivo.")
                name = f.pop("name", "Meta de ahorro")
                target = f.pop("target_cents")
                return fm.create_goal(name, target, **f)
            if fm.get_goal(str(gid)) is None:
                raise ApiError("Esa meta de ahorro ya no existe.")
            g = fm.update_goal(str(gid), **f)
            fm.refresh_goal_status(str(gid))
            return fm.get_goal(str(gid)) or g

    def fin_goal_delete(self, gid: str) -> dict:
        """The goal file goes to the vault trash; its movements stay."""
        with self._lock:
            fm = self._fm()
            if fm.get_goal(str(gid)) is None:
                raise ApiError("Esa meta de ahorro ya no existe.")
            fm.delete_goal(str(gid))
            return {"ok": True}

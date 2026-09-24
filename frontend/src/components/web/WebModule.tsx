// WEB: address bar, bookmarks, history, time per site and the content rules
// the NoteVault browser window enforces.

import { Bookmark, Globe, History, LayoutDashboard, Shield, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../lib/bridge";
import { newId } from "../../lib/canvas";
import type { WebOverview, WebRules } from "../../lib/types";
import { useApp } from "../../store/app";
import { useCanvas } from "../../store/canvas";
import { Columns } from "../common/charts";
import { Field, input, PrimaryButton } from "../common/forms";
import { askText, cn, confirmAction } from "../ui";

type Tab = "bookmarks" | "history" | "usage" | "rules";

const mins = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

export function WebModule() {
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<WebOverview | null>(null);
  const [tab, setTab] = useState<Tab>("bookmarks");
  const [address, setAddress] = useState("");
  const [day, setDay] = useState("");

  const load = useCallback(async (d = day) => {
    try {
      setData(await api.webOverview(d));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [day, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (text: string) => {
    if (!text.trim()) return;
    try {
      const r = await api.webOpen(text);
      if (r.blocked) toast("error", `⛔ ${r.reason}`);
      else if (r.system) toast("info", "Abierto en el navegador del sistema (las reglas solo se aplican en la app de escritorio).");
      setTimeout(() => void load(), 1500);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const toCanvas = async (url: string, title: string) => {
    const c = useCanvas.getState();
    if (!c.path) {
      toast("info", "Abre un canvas en Notas para añadirle la página.");
      return;
    }
    const d = c.doc;
    const b = d.nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0);
    c.commit({ ...d, nodes: [...d.nodes, { id: newId(), type: "link", x: 0, y: b + 40, width: 320, height: 100, url, label: title }] });
    toast("info", "Página añadida al canvas abierto.");
  };

  if (!data) return <div className="grid flex-1 place-items-center bg-surface text-[13px] text-faint">Cargando…</div>;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-surface">
      <div className="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
        <Globe size={18} className="text-accent-text" />
        <form className="flex flex-1 gap-2" onSubmit={(e) => {
          e.preventDefault();
          void open(address);
        }}>
          <input aria-label="Dirección o búsqueda" value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder="Escribe una dirección o lo que quieras buscar…" className={cn(input, "h-9")} />
          <PrimaryButton type="submit">Abrir</PrimaryButton>
        </form>
        {!data.restrictions.enabled
          ? <span className="text-[11.5px] text-faint">Reglas desactivadas</span>
          : <span className="flex items-center gap-1 text-[11.5px] text-mint"><Shield size={13} /> Reglas activas{data.restrictions.mode === "allowlist" && " · modo enfoque"}</span>}
      </div>
      <div className="flex flex-none gap-1 border-b border-line px-5 py-2" role="tablist" aria-label="WEB">
        {([["bookmarks", "Marcadores", <Bookmark key="b" size={14} />], ["history", "Historial", <History key="h" size={14} />],
          ["usage", "Tiempo", <Timer key="t" size={14} />], ["rules", "Restricciones", <Shield key="r" size={14} />]] as Array<[Tab, string, ReactNode]>).map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px]", tab === id ? "bg-accent-soft text-text" : "text-dim hover:bg-hover")}>
            {icon}{label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl">
          {tab === "bookmarks" && (
            <Bookmarks data={data} onOpen={open} onCanvas={toCanvas} onChanged={() => void load()} current={address} />
          )}
          {tab === "history" && (
            <HistoryTab data={data} onOpen={open} onCanvas={toCanvas} onDay={(d) => {
              setDay(d);
              void load(d);
            }} onChanged={() => void load()} />
          )}
          {tab === "usage" && <Usage data={data} />}
          {tab === "rules" && <Rules data={data} onSaved={() => void load()} />}
        </div>
      </div>
    </div>
  );
}

function Row({ title, url, sub, onOpen, onCanvas, extra }: {
  title: string; url: string; sub?: string; onOpen: () => void; onCanvas: () => void; extra?: ReactNode;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-hover">
      <Globe size={14} className="flex-none text-faint" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[13px] text-text">{title}</div>
        <div className="truncate font-mono text-[10.5px] text-faint">{sub ? `${sub} · ` : ""}{url}</div>
      </button>
      <button type="button" title="Añadir al canvas abierto" onClick={onCanvas}
        className="hidden h-7 w-7 place-items-center rounded-md text-faint hover:bg-elevated hover:text-text group-hover:grid"><LayoutDashboard size={14} /></button>
      {extra}
    </div>
  );
}

function Bookmarks({ data, onOpen, onCanvas, onChanged, current }: {
  data: WebOverview; onOpen: (u: string) => void; onCanvas: (u: string, t: string) => void; onChanged: () => void; current: string;
}) {
  const add = async () => {
    const url = await askText("Dirección del marcador", current || "https://", "Siguiente");
    if (!url) return;
    const title = await askText("Nombre", "", "Guardar");
    if (title === null) return;
    try {
      await api.webBookmarkAdd(title, url);
      onChanged();
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  };
  return (
    <div>
      <div className="mb-2 flex items-center">
        <h2 className="text-[15px] font-semibold text-text">Marcadores</h2>
        <button type="button" onClick={() => void add()} className="ml-auto text-[12.5px] text-accent-text hover:underline">+ Añadir marcador</button>
      </div>
      {data.bookmarks.length === 0 && <p className="text-[12.5px] text-faint">Aún no hay marcadores.</p>}
      {data.bookmarks.map((b) => (
        <Row key={b.id} title={b.title} url={b.url} onOpen={() => onOpen(b.url)} onCanvas={() => onCanvas(b.url, b.title)}
          extra={
            <button type="button" title="Quitar marcador" onClick={() => void api.webBookmarkRemove(b.url).then(onChanged)}
              className="hidden h-7 w-7 place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger group-hover:grid"><Trash2 size={14} /></button>
          } />
      ))}
    </div>
  );
}

function HistoryTab({ data, onOpen, onCanvas, onDay, onChanged }: {
  data: WebOverview; onOpen: (u: string) => void; onCanvas: (u: string, t: string) => void; onDay: (d: string) => void; onChanged: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-text">Historial</h2>
        <select aria-label="Día" value={data.day} onChange={(e) => onDay(e.target.value)} className={cn(input, "w-44 py-1")}>
          {[data.day, ...data.history_days.filter((d) => d !== data.day)].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button type="button" onClick={() => void confirmAction("Borrar historial", "Se borra todo el historial de WEB. El tiempo por sitio se conserva.", "Borrar", true)
          .then((ok) => {
            if (ok) void api.webHistoryClear().then(onChanged);
          })}
          className="ml-auto text-[12.5px] text-danger hover:underline">Borrar historial</button>
      </div>
      {data.history.length === 0 && <p className="text-[12.5px] text-faint">Sin visitas ese día.</p>}
      {data.history.map((h, i) => (
        <Row key={i} title={h.title} url={h.url} sub={h.time.slice(0, 5)} onOpen={() => onOpen(h.url)} onCanvas={() => onCanvas(h.url, h.title)} />
      ))}
    </div>
  );
}

function Usage({ data }: { data: WebOverview }) {
  const total = data.usage.reduce((a, u) => a + u.seconds, 0);
  const max = Math.max(1, ...data.usage.map((u) => u.seconds));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-text">Tiempo en la web</h2>
        <p className="text-[12.5px] text-dim">Hoy: {mins(total)} en el navegador de NoteVault.</p>
      </div>
      <div className="rounded-xl border border-line bg-card p-4">
        <Columns values={data.week.map((w) => Math.round(w.seconds / 60))} labels={data.week.map((w) => w.date.slice(8, 10))} format={(v) => `${v} min`} />
      </div>
      {data.limits.length > 0 && (
        <div className="rounded-xl border border-line bg-card p-4">
          <h3 className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-faint">Límites diarios</h3>
          {data.limits.map((l) => (
            <div key={l.domain} className="mb-2">
              <div className="flex text-[12.5px]"><span className="text-text">{l.domain}</span><span className="ml-auto text-dim">{mins(l.used)} / {l.minutes} min</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-line">
                <div className={cn("h-1.5 rounded-full", l.used >= l.minutes * 60 ? "bg-danger" : "bg-accent")} style={{ width: `${Math.min(100, (100 * l.used) / Math.max(1, l.minutes * 60))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-faint">Hoy por sitio</h3>
        {data.usage.length === 0 && <p className="text-[12.5px] text-faint">Sin actividad hoy.</p>}
        {data.usage.map((u) => (
          <div key={u.host} className="mb-1.5 flex items-center gap-3 text-[12.5px]">
            <span className="w-48 truncate text-text">{u.host}</span>
            <div className="h-1.5 flex-1 rounded-full bg-line"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${(100 * u.seconds) / max}%` }} /></div>
            <span className="w-20 text-right text-dim">{mins(u.seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const lines = (t: string) => [...new Set(t.split("\n").map((x) => x.trim()).filter(Boolean))];

function Rules({ data, onSaved }: { data: WebOverview; onSaved: () => void }) {
  const [r, setR] = useState<WebRules>(data.restrictions);
  const [limits, setLimits] = useState(Object.entries(data.restrictions.daily_limits).map(([d, m]) => `${d} ${m}`).join("\n"));
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    setR(data.restrictions);
    setLimits(Object.entries(data.restrictions.daily_limits).map(([d, m]) => `${d} ${m}`).join("\n"));
  }, [data.restrictions]);

  const current = (): WebRules => {
    const daily: Record<string, number> = {};
    for (const l of lines(limits)) {
      const m = /^(\S+)\s+(\d+)/.exec(l);
      if (m) daily[m[1]!] = Number(m[2]);
    }
    return { ...r, daily_limits: daily };
  };

  const save = async (phrase = "") => {
    try {
      const res = await api.webRestrictionsSave(current(), phrase);
      if (res.needs_phrase) {
        const typed = await askText(`Estás aflojando tus reglas. Escribe «${res.phrase}» para confirmarlo.`, "", "Confirmar");
        if (typed) await save(typed);
        return;
      }
      toast("info", "Reglas guardadas.");
      onSaved();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const area = (label: string, key: "blocked_domains" | "blocked_patterns" | "allowed_domains", hint: string) => (
    <Field label={label}>
      <textarea value={r[key].join("\n")} rows={5} placeholder={hint}
        onChange={(e) => setR({ ...r, [key]: e.target.value.split("\n") })}
        onBlur={(e) => setR({ ...r, [key]: lines(e.target.value) })}
        className={cn(input, "font-mono text-[12px]")} />
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-text">Restricciones de contenido</h2>
        <p className="text-[12.5px] text-dim">Se aplican en la ventana del navegador de NoteVault: una página bloqueada se sustituye por un aviso.</p>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-text">
        <input type="checkbox" checked={r.enabled} onChange={(e) => setR({ ...r, enabled: e.target.checked })} /> Reglas activadas
      </label>
      <div className="flex gap-4 text-[13px] text-text">
        <label className="flex items-center gap-2"><input type="radio" checked={r.mode === "blocklist"} onChange={() => setR({ ...r, mode: "blocklist" })} /> Bloquear lo que indique</label>
        <label className="flex items-center gap-2"><input type="radio" checked={r.mode === "allowlist"} onChange={() => setR({ ...r, mode: "allowlist" })} /> Modo enfoque: solo los sitios permitidos</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-faint">Preajustes:</span>
        {data.presets.map((p) => (
          <button key={p} type="button" onClick={() => void api.webPreset({ ...r, blocked_domains: lines(r.blocked_domains.join("\n")), blocked_patterns: lines(r.blocked_patterns.join("\n")) }, p).then(setR)}
            className="rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">+ {p}</button>
        ))}
      </div>
      {r.mode === "allowlist"
        ? area("Sitios permitidos (uno por línea)", "allowed_domains", "wikipedia.org\ndocs.python.org")
        : (
          <div className="grid grid-cols-2 gap-3">
            {area("Sitios bloqueados", "blocked_domains", "tiktok.com")}
            {area("Fragmentos de URL bloqueados", "blocked_patterns", "youtube.com/shorts")}
          </div>
        )}
      <Field label="Límites diarios (sitio y minutos por línea)">
        <textarea value={limits} onChange={(e) => setLimits(e.target.value)} rows={4} placeholder="youtube.com 30"
          className={cn(input, "font-mono text-[12px]")} />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-text">
        <input type="checkbox" checked={r.confirm_to_relax} onChange={(e) => setR({ ...r, confirm_to_relax: e.target.checked })} />
        Pedir confirmación al aflojar las reglas (escribir «{data.relax_phrase}»)
      </label>
      <div><PrimaryButton onClick={() => void save()}>Guardar reglas</PrimaryButton></div>
    </div>
  );
}

// The Repaso calendar: WHEN every reviewed topic comes back. A big month grid shows each topic on
// its review day (and, fainter, the days after it if every review is done on time, following the
// spaced-repetition ladder 3 · 7 · 14 · 30 · 60 · 120), a list gives each topic its exact date,
// and any review can be moved: drag it to another day, type a date, or nudge it by days.
// The reminders (Windows notification) are configured, and tried out, at the bottom.

import { Bell, CalendarClock, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { ReviewItem } from "../../lib/types";
import { useApp } from "../../store/app";
import { Modal } from "../common/forms";
import { cn } from "../ui";
import { useStudyVersion } from "./StudyPanel";

export const useReviewCalendar = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (n: number) => String(n).padStart(2, "0");

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]!.slice(0, 3)}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function when(inDays: number): string {
  if (inDays === 0) return "hoy";
  if (inDays === 1) return "mañana";
  if (inDays < 0) return inDays === -1 ? "venció ayer" : `venció hace ${-inDays} días`;
  return `en ${inDays} días`;
}

/** Short label for a topic chip: its number ("1.1") when it has one, else its first words. */
function chipLabel(topic: string): string {
  return /^(\d+(?:\.\d+)*)\s/.exec(topic)?.[1] ?? topic.split(/\s+/).slice(0, 2).join(" ");
}

interface Marker {
  item: ReviewItem;
  /** true for the pending review, false for a projected one */
  real: boolean;
  level: number;
  interval: number;
}

export function ReviewCalendar() {
  const open = useReviewCalendar((s) => s.open);
  const close = useReviewCalendar((s) => s.set);
  const version = useStudyVersion((s) => s.v);
  const openNote = useApp((s) => s.openNote);
  const toast = useApp((s) => s.toast);

  const [data, setData] = useState<{ today: string; items: ReviewItem[] } | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);
  const [projected, setProjected] = useState(true);
  const [reminders, setReminders] = useState<{ enabled: boolean; hour: number }>({ enabled: true, hour: 9 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // The month opens where the next review is, so the grid is never empty when the next one is a month away.
  const placed = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.studyReviewsList();
      setData(res);
      if (!placed.current) {
        placed.current = true;
        const monthOf = res.today.slice(0, 7);
        if (res.items.length && !res.items.some((i) => i.next.startsWith(monthOf))) {
          const next = res.items.map((i) => i.next).filter((d) => d >= res.today).sort()[0] ?? res.items[0]!.next;
          setCursor({ y: Number(next.slice(0, 4)), m: Number(next.slice(5, 7)) - 1 });
        }
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) {
      placed.current = false;
      return;
    }
    void refresh();
    void api.studyReviewSettings().then(setReminders).catch(() => undefined);
  }, [open, refresh, version]);

  const items = data?.items ?? [];
  const today = data?.today ?? "";

  // day → what is scheduled on it
  const byDay = useMemo(() => {
    const map = new Map<string, Marker[]>();
    const put = (date: string, m: Marker) => map.set(date, [...(map.get(date) ?? []), m]);
    for (const item of items) {
      item.upcoming.forEach((u, i) => {
        if (i === 0) put(u.date, { item, real: true, level: u.level, interval: u.interval });
        else if (projected) put(u.date, { item, real: false, level: u.level, interval: u.interval });
      });
    }
    return map;
  }, [items, projected]);

  const move = async (item: ReviewItem, date: string) => {
    if (date === item.next) return;
    try {
      await api.studyReviewReschedule(item.path, date);
      await refresh();
      toast("info", `«${item.topic}» se repasará el ${shortDate(date)}.`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const practice = async (item: ReviewItem) => {
    try {
      const view = await api.studyViewEnsure(item.topicPath);
      if (view.ok && view.path) {
        close(false);
        await openNote(view.path);
        useApp.getState().setMode("read");
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const saveReminders = async (next: { enabled: boolean; hour: number }) => {
    setReminders(next);
    try {
      setReminders(await api.studyReviewSettingsSet(next));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const testReminder = async () => {
    try {
      const r = await api.studyReviewNotifyTest();
      toast(
        r.supported ? "info" : "error",
        r.supported
          ? `Notificación enviada (${r.due ? `${r.due} repaso(s) pendiente(s)` : "sin repasos pendientes ahora"}). Mira la esquina inferior derecha de Windows; si no aparece, revisa el modo «No molestar».`
          : "Este sistema no permite notificaciones desde la app.",
      );
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  if (!open) return null;

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const step = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const shown = selected
    ? (byDay.get(selected) ?? []).map((m) => m.item).filter((it, i, a) => a.indexOf(it) === i)
    : items;
  const overdue = items.filter((i) => i.inDays < 0).length;

  return (
    <Modal
      title="Calendario de repasos"
      onClose={() => close(false)}
      width={1120}
      footer={
        <>
          <Bell size={14} className="flex-none text-accent-text" />
          <label className="flex items-center gap-1.5 text-[12px] text-text">
            <input type="checkbox" checked={reminders.enabled} onChange={(e) => void saveReminders({ ...reminders, enabled: e.target.checked })} />
            Recordatorios de Windows
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-dim">
            a partir de las
            <select
              value={reminders.hour}
              disabled={!reminders.enabled}
              onChange={(e) => void saveReminders({ ...reminders, hour: Number(e.target.value) })}
              className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-text disabled:opacity-50"
            >
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}
            </select>
          </label>
          <span className="min-w-0 flex-1 truncate text-[11px] text-faint">Un aviso por tema y por día; la app debe estar abierta.</span>
          <button type="button" onClick={() => void testReminder()} className="rounded-lg border border-line px-3 py-1 text-[12px] font-semibold text-text hover:border-accent">
            Probar notificación
          </button>
        </>
      }
    >
      <div className="flex min-h-0 gap-4">
        {/* ── Month ── */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <button type="button" onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded text-dim hover:bg-hover"><ChevronLeft size={15} /></button>
            <span className="min-w-[150px] text-center text-[14px] font-semibold capitalize text-text">{MONTHS[cursor.m]} {cursor.y}</span>
            <button type="button" onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded text-dim hover:bg-hover"><ChevronRight size={15} /></button>
            <button type="button" onClick={() => setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-dim hover:text-text">Hoy</button>
            <span className="flex-1" />
            <label className="flex items-center gap-1.5 text-[11.5px] text-dim">
              <input type="checkbox" checked={projected} onChange={(e) => setProjected(e.target.checked)} />
              Mostrar los repasos siguientes
            </label>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase text-faint">
            {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(i + 1)}`;
              const marks = byDay.get(iso) ?? [];
              return (
                <div
                  key={iso}
                  onClick={() => setSelected((s) => (s === iso ? null : iso))}
                  onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(iso); } }}
                  onDragLeave={() => setOver((o) => (o === iso ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const path = e.dataTransfer.getData("text/nv-review") || dragging;
                    setOver(null);
                    setDragging(null);
                    const it = items.find((x) => x.path === path);
                    if (it) void move(it, iso);
                  }}
                  className={cn(
                    "min-h-[88px] cursor-pointer rounded-lg border p-1 text-left transition-colors",
                    iso === today ? "border-accent" : "border-line",
                    selected === iso && "bg-accent-soft/40",
                    over === iso && "border-accent bg-accent-soft",
                    iso < today && "opacity-70",
                  )}
                >
                  <div className={cn("text-[11px]", iso === today ? "font-bold text-accent-text" : "text-dim")}>{i + 1}</div>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {marks.slice(0, 3).map((m, k) => (
                      <span
                        key={`${m.item.path}${k}`}
                        draggable={m.real}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/nv-review", m.item.path);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(m.item.path);
                        }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        title={`${m.item.topic}\n${m.real ? "Repaso pendiente: arrástralo a otro día para moverlo" : `Si repasas a tiempo: nivel ${m.level}, ${m.interval} días después del anterior`}`}
                        className={cn(
                          "truncate rounded px-1 text-[10px] leading-4",
                          m.real
                            ? iso <= today ? "cursor-grab bg-warn-soft font-semibold text-warn" : "cursor-grab bg-accent-soft font-semibold text-accent-text"
                            : "border border-dashed border-line text-faint",
                        )}
                      >
                        {chipLabel(m.item.topic)}
                      </span>
                    ))}
                    {marks.length > 3 && <span className="px-1 text-[10px] text-faint">+{marks.length - 3} más</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Arrastra un repaso a otro día para moverlo. Los de línea punteada son una proyección: cuándo tocarían si repasas
            cada vez en su fecha (3 → 7 → 14 → 30 → 60 → 120 días).
          </p>
        </div>

        {/* ── Topics ── */}
        <div className="flex max-h-[62vh] w-[400px] flex-none flex-col">
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock size={14} className="text-accent-text" />
            <span className="text-[12.5px] font-semibold text-text">
              {selected ? `Repasos del ${shortDate(selected)}` : "Todos los repasos"}
            </span>
            {overdue > 0 && !selected && <span className="rounded-full bg-warn-soft px-1.5 font-mono text-[10px] font-bold text-warn">{overdue} atrasado(s)</span>}
            <span className="flex-1" />
            {selected && <button type="button" onClick={() => setSelected(null)} className="text-[11px] text-dim hover:text-text">Ver todos</button>}
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {!items.length && (
              <p className="text-[12px] leading-relaxed text-faint">
                Aún no hay repasos. Cada vez que practiques un tema (con la skill que sea) se crea su repaso y aquí verás cuándo repetirlo.
              </p>
            )}
            {selected && !shown.length && <p className="text-[12px] text-faint">Ningún repaso ese día.</p>}
            {shown.map((it) => (
              <div key={it.path} className="rounded-lg border border-line bg-panel px-3 py-2">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => void openNote(it.path)} title="Abrir la nota de repaso" className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[12.5px] font-semibold text-text">{it.topic}</div>
                    <div className="text-[10.5px] text-faint">
                      nivel {it.level} · {it.practicedDays} día(s) practicado(s){it.last ? ` · último ${shortDate(it.last)}` : ""}
                    </div>
                  </button>
                  <span className={cn("flex-none rounded-full px-2 py-0.5 font-mono text-[10px] font-bold", it.inDays <= 0 ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-text")}>
                    {when(it.inDays)}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <input
                    type="date"
                    aria-label={`Fecha del repaso de ${it.topic}`}
                    value={it.next}
                    onChange={(e) => e.target.value && void move(it, e.target.value)}
                    className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text"
                  />
                  {([["−1 d", -1], ["+1 d", 1], ["+1 sem", 7]] as const).map(([label, d]) => (
                    <button key={label} type="button" onClick={() => void move(it, addDaysIso(it.next, d))} className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-dim hover:border-accent hover:text-text">{label}</button>
                  ))}
                  <button type="button" onClick={() => void move(it, today)} className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-dim hover:border-accent hover:text-text">Hoy</button>
                  <span className="flex-1" />
                  <button type="button" onClick={() => void practice(it)} className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-accent-strong">
                    <Play size={10} /> Practicar
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px] text-faint">
                  <span>Después:</span>
                  {it.upcoming.slice(1).map((u) => (
                    <span key={u.date} className="rounded border border-dashed border-line px-1" title={`Nivel ${u.level}: ${u.interval} días después del anterior`}>
                      {shortDate(u.date)} <span className="text-faint/70">(+{u.interval})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

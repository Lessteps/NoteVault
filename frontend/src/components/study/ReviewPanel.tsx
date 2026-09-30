// Repaso: the right-panel face with the spaced-repetition schedule of every topic
// practised so far. Each topic has a review note (`<Subject>/Repaso/<topic>.md`)
// that is updated automatically after every graded attempt, whatever the skill.

import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Play, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import type { ReviewItem } from "../../lib/types";
import { useApp } from "../../store/app";
import { cn, IconButton } from "../ui";
import { useStudyVersion } from "./StudyPanel";
import { useReviewCalendar } from "./ReviewCalendar";

export const useReviewPanel = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]!.slice(0, 3)}`;
}

function when(inDays: number): string {
  if (inDays === 0) return "hoy";
  if (inDays === 1) return "mañana";
  if (inDays < 0) return inDays === -1 ? "venció ayer" : `venció hace ${-inDays} días`;
  return `en ${inDays} días`;
}

function MonthGrid({ items, today }: { items: ReviewItem[]; today: string }) {
  const [year, month] = today.split("-").map(Number) as [number, number];
  const [cursor, setCursor] = useState({ y: year, m: month - 1 });
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.next, (map.get(it.next) ?? 0) + 1);
    return map;
  }, [items]);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const step = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="rounded-xl border border-line bg-card p-2.5">
      <div className="mb-1.5 flex items-center">
        <button type="button" onClick={() => step(-1)} className="grid h-6 w-6 place-items-center rounded text-dim hover:bg-hover"><ChevronLeft size={14} /></button>
        <span className="flex-1 text-center text-[12px] font-semibold capitalize text-text">{MONTHS[cursor.m]} {cursor.y}</span>
        <button type="button" onClick={() => step(1)} className="grid h-6 w-6 place-items-center rounded text-dim hover:bg-hover"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center font-mono text-[9.5px] text-faint">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => <span key={d}>{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(i + 1)}`;
          const n = byDay.get(iso) ?? 0;
          const due = n > 0 && iso <= today;
          return (
            <span
              key={iso}
              title={n ? `${n} repaso${n === 1 ? "" : "s"}` : undefined}
              className={cn(
                "mx-auto grid h-6 w-6 place-items-center rounded-full text-[11px]",
                iso === today && "ring-1 ring-accent",
                n > 0 ? (due ? "bg-warn-soft font-bold text-warn" : "bg-accent-soft font-bold text-accent-text") : "text-dim",
              )}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewPanel() {
  const version = useStudyVersion((s) => s.v);
  const setOpen = useReviewPanel((s) => s.setOpen);
  const openNote = useApp((s) => s.openNote);
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<{ today: string; items: ReviewItem[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.studyReviewsList());
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  const practice = async (item: ReviewItem) => {
    try {
      const view = await api.studyViewEnsure(item.topicPath);
      if (view.ok && view.path) {
        await openNote(view.path);
        useApp.getState().setMode("read");
      }
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const items = data?.items ?? [];
  const dueCount = items.filter((i) => i.inDays <= 0).length;

  return (
    <aside className="flex h-full w-[320px] flex-none flex-col border-l border-line bg-panel" aria-label="Repaso">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <CalendarClock size={14} className="text-accent-text" />
        <span className="text-[12px] font-semibold text-text">Repaso</span>
        {dueCount > 0 && <span className="rounded-full bg-warn-soft px-1.5 font-mono text-[10px] font-bold text-warn">{dueCount}</span>}
        <div className="flex-1" />
        <IconButton title="Calendario completo: cuándo es cada repaso, moverlos y recordatorios" onClick={() => useReviewCalendar.getState().set(true)}>
          <CalendarDays size={14} />
        </IconButton>
        <IconButton title="Recargar" onClick={() => void refresh()}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </IconButton>
        <IconButton title="Cerrar" onClick={() => setOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {data && <MonthGrid items={items} today={data.today} />}
        <button
          type="button"
          onClick={() => useReviewCalendar.getState().set(true)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-text hover:border-accent"
        >
          <CalendarDays size={13} /> Abrir el calendario completo
        </button>

        {data && items.length === 0 && (
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Aún no hay repasos. Cada vez que practiques un tema (con la skill que sea) se crea su nota en
            <span className="font-mono"> Repaso/ </span>
            y aquí verás cuándo repetirlo.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((it) => (
            <div key={it.path} className="rounded-lg border border-line bg-card px-3 py-2">
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => void openNote(it.path)} className="min-w-0 flex-1 text-left" title="Abrir la nota de repaso">
                  <div className="truncate text-[12.5px] font-semibold text-text">{it.topic}</div>
                  <div className="text-[10.5px] text-faint">
                    {shortDate(it.next)} · nivel {it.level}
                    {it.skills.length > 0 && ` · ${it.skills.slice(0, 3).join(", ")}`}
                  </div>
                </button>
                <span className={cn("flex-none rounded-full px-2 py-0.5 font-mono text-[10px] font-bold", it.inDays <= 0 ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-text")}>
                  {when(it.inDays)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void practice(it)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim hover:border-accent hover:text-text"
              >
                <Play size={11} /> Practicar
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

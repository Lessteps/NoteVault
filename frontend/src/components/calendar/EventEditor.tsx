// The event / task editor that every calendar view opens.

import { Clock, MapPin, Palette, Repeat, Text, Trash2, X, Bell, BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { fmtDuration, GCAL_COLOURS, MONTHS_ES, REMINDERS, toHm, toMin, WEEKDAYS_ES } from "../../lib/calendar";
import { parseIso } from "../../lib/habits";
import { formatRepeat, parseRepeat, WEEKDAYS } from "../../lib/tasks";
import type { CalPayload } from "../../lib/types";
import { useApp } from "../../store/app";
import { useCalendar } from "../../store/calendar";
import { cn, confirmAction, IconButton } from "../ui";

type Preset = "none" | "daily" | "weekly" | "weekdays" | "monthly" | "custom";

function presets(day: string): Record<Exclude<Preset, "custom">, string> {
  const d = parseIso(day);
  return {
    none: "", daily: "daily", weekly: `weekly:${(d.getDay() + 6) % 7}`,
    weekdays: "weekly:0,1,2,3,4", monthly: `monthly:${d.getDate()}`,
  };
}

function presetFor(rule: string, day: string): Preset {
  const clean = formatRepeat(parseRepeat(rule));
  const found = (Object.entries(presets(day)) as Array<[Preset, string]>).find(([, r]) => r === clean);
  return found ? found[0] : "custom";
}

const base = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent";
const field = `${base} w-full`;

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-2 flex-none text-faint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EventEditor() {
  const editor = useCalendar((s) => s.editor);
  const close = useCalendar((s) => s.closeEditor);
  const load = useCalendar((s) => s.load);
  const toast = useApp((s) => s.toast);
  const titleRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<"event" | "task">("event");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [preset, setPreset] = useState<Preset>("none");
  const [custom, setCustom] = useState("weekly:0");
  const [until, setUntil] = useState<string | null>(null);
  const [reminder, setReminder] = useState<number | null>(null);
  const [colour, setColour] = useState("#039be5");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const it = editor.item;
    setKind(editor.kind);
    setTitle(it.title);
    setDay(it.date);
    setAllDay(!it.start);
    const s = toMin(it.start) ?? 9 * 60;
    setStart(toHm(s));
    setEnd(toHm(Math.min(24 * 60 - 1, s + (it.duration ?? 60))));
    const p = presetFor(it.repeat, it.date);
    setPreset(p);
    setCustom(p === "custom" ? it.repeat : `weekly:${(parseIso(it.date).getDay() + 6) % 7}`);
    setUntil(it.until);
    setReminder(it.reminder_min);
    setColour(it.colour ?? "#039be5");
    setLocation(it.location);
    setDescription(it.description);
    setSubject(it.subject);
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }, [editor]);

  if (!editor) return null;
  const isTask = kind === "task";
  const rule = preset === "custom" ? formatRepeat(parseRepeat(custom)) : presets(day || editor.item.date)[preset];
  const customRule = parseRepeat(custom);
  const d = day ? parseIso(day) : new Date();
  const wd = WEEKDAYS_ES[(d.getDay() + 6) % 7]!;
  const startMin = toMin(start) ?? 0;
  const endMin = Math.max(startMin + 5, toMin(end) ?? startMin + 60);

  const save = async () => {
    if (!day) return;
    const payload: CalPayload = {
      mode: editor.mode,
      kind,
      orig: editor.mode === "edit" ? { kind: editor.item.kind, id: editor.item.id, date: editor.item.date } : {},
      title: title.trim() || "(Sin título)",
      date: day,
      start: allDay ? null : start,
      duration: allDay || isTask ? null : endMin - startMin,
      repeat: rule,
      until: preset === "custom" ? until : null,
      location: location.trim(),
      description: description.trim(),
      subject: subject.trim(),
      reminder_min: allDay ? null : reminder,
      colour,
    };
    setBusy(true);
    try {
      const res = await api.calSave(payload);
      toast("info", res.message);
      close();
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scope: "one" | "all") => {
    const it = editor.item;
    if (it.kind !== "routine" && !(await confirmAction("Eliminar", `¿Eliminar «${it.title}»?`, "Eliminar", true))) return;
    try {
      await api.calDelete({ kind: it.kind, id: it.id, date: it.date }, scope);
      toast("info", "Eliminado");
      close();
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[8vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Editor de evento"
        className="w-[460px] max-w-[92vw] rounded-2xl border border-line-strong bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
        }}
      >
        <div className="flex items-center justify-end gap-1 px-3 pt-2">
          {editor.mode === "edit" && editor.item.kind === "routine" && (
            <>
              <button type="button" onClick={() => void remove("one")}
                className="rounded-md px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">Quitar solo este día</button>
              <button type="button" onClick={() => void remove("all")}
                className="rounded-md px-2 py-1 text-[12px] text-danger hover:bg-danger-soft">Eliminar serie</button>
            </>
          )}
          {editor.mode === "edit" && editor.item.kind !== "routine" && (
            <IconButton title="Eliminar" onClick={() => void remove("all")}><Trash2 size={15} /></IconButton>
          )}
          <IconButton title="Cerrar" onClick={close}><X size={15} /></IconButton>
        </div>
        <div className="space-y-3.5 px-5 pb-5">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.ctrlKey && void save()}
            placeholder="Añadir título"
            className="w-full border-b-2 border-line bg-transparent pb-1.5 text-[20px] text-text outline-none placeholder:text-faint focus:border-accent"
          />
          {editor.mode === "create" && (
            <div className="flex gap-1.5">
              {(["event", "task"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[12.5px]",
                    kind === k ? "bg-accent-soft text-accent-text" : "text-dim hover:bg-hover",
                  )}
                >
                  {k === "event" ? "Evento" : "Tarea"}
                </button>
              ))}
            </div>
          )}
          <Row icon={<Clock />}>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="Fecha" value={day} onChange={(e) => setDay(e.target.value)} className={cn(base, "w-[150px]")} />
              {!allDay && (
                <>
                  <input type="time" aria-label="Inicio" value={start} onChange={(e) => setStart(e.target.value)} className={cn(base, "w-[110px]")} />
                  {!isTask && (
                    <>
                      <span className="text-faint">–</span>
                      <input type="time" aria-label="Fin" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(base, "w-[110px]")} />
                    </>
                  )}
                </>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[12px] text-dim">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[var(--nv-accent)]" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                Todo el día
              </label>
              {!allDay && !isTask && <span className="text-faint">{fmtDuration(endMin - startMin)}</span>}
              {day && <span className="text-faint">{wd}, {d.getDate()} de {MONTHS_ES[d.getMonth()]}</span>}
            </div>
          </Row>
          <Row icon={<Repeat />}>
            <select aria-label="Repetición" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className={field}>
              <option value="none">No se repite</option>
              <option value="daily">Cada día</option>
              <option value="weekly">Cada semana el {wd}</option>
              <option value="weekdays">Todos los días laborables (de lunes a viernes)</option>
              <option value="monthly">Cada mes el día {d.getDate()}</option>
              <option value="custom">Personalizado…</option>
            </select>
            {preset === "custom" && (
              <div className="mt-2 space-y-2 rounded-lg border border-line p-2.5">
                <select
                  value={customRule.kind === "every" ? "every" : customRule.kind === "monthly" ? "monthly" : "weekly"}
                  onChange={(e) => setCustom(e.target.value === "every" ? "every:2" : e.target.value === "monthly" ? `monthly:${d.getDate()}` : "weekly:0")}
                  className={field}
                >
                  <option value="weekly">Días de la semana</option>
                  <option value="every">Cada N días</option>
                  <option value="monthly">Días del mes</option>
                </select>
                {customRule.kind === "every" ? (
                  <label className="flex items-center gap-2 text-[12.5px] text-dim">
                    Cada
                    <input type="number" min={2} max={365} value={customRule.every}
                      onChange={(e) => setCustom(`every:${Math.max(2, Number(e.target.value) || 2)}`)} className={cn(base, "w-20")} />
                    días
                  </label>
                ) : customRule.kind === "monthly" ? (
                  <input
                    defaultValue={customRule.monthDays.join(", ")}
                    onBlur={(e) => {
                      const r = formatRepeat({ ...parseRepeat(`monthly:${e.target.value.replace(/\s/g, "")}`), kind: "monthly" });
                      if (r) setCustom(r);
                    }}
                    className={field}
                  />
                ) : (
                  <div className="flex gap-1">
                    {WEEKDAYS.map((w, i) => {
                      const on = customRule.weekdays.includes(i) || customRule.kind === "daily" || customRule.kind === "workdays" && i < 5;
                      return (
                        <button key={w} type="button" aria-pressed={on}
                          onClick={() => {
                            const cur = customRule.kind === "daily" ? [0, 1, 2, 3, 4, 5, 6] : customRule.weekdays;
                            const next = on ? cur.filter((x) => x !== i) : [...cur, i];
                            if (next.length) setCustom(`weekly:${next.sort().join(",")}`);
                          }}
                          className={cn("h-7 w-7 rounded-full text-[11.5px]", on ? "bg-accent text-white" : "border border-line text-dim")}
                        >{w}</button>
                      );
                    })}
                  </div>
                )}
                <label className="flex items-center gap-2 text-[12.5px] text-dim">
                  Termina
                  <input type="date" value={until ?? ""} onChange={(e) => setUntil(e.target.value || null)} className={cn(base, "w-[150px]")} />
                </label>
              </div>
            )}
          </Row>
          {!allDay && (
            <Row icon={<Bell />}>
              <select aria-label="Notificación" value={reminder === null ? "" : String(reminder)}
                onChange={(e) => setReminder(e.target.value === "" ? null : Number(e.target.value))} className={field}>
                {REMINDERS.map(([v, l]) => <option key={l} value={v === null ? "" : String(v)}>{l}</option>)}
              </select>
            </Row>
          )}
          {!isTask && (
            <>
              <Row icon={<MapPin />}>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Añadir ubicación" className={field} />
              </Row>
              <Row icon={<Palette />}>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {GCAL_COLOURS.map(([hex, name]) => (
                    <button key={hex} type="button" title={name} aria-label={name}
                      onClick={() => setColour(hex)}
                      className={cn("h-6 w-6 rounded-full", colour === hex && "ring-2 ring-text ring-offset-2 ring-offset-card")}
                      style={{ background: hex }} />
                  ))}
                </div>
              </Row>
            </>
          )}
          {isTask && (
            <Row icon={<BookOpen />}>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asignatura" className={field} />
            </Row>
          )}
          <Row icon={<Text />}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Añadir descripción" className={cn(field, "resize-y")} />
          </Row>
          <div className="flex justify-end pt-1">
            <button type="button" disabled={busy} onClick={() => void save()}
              className="rounded-full bg-accent px-5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong disabled:opacity-50">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

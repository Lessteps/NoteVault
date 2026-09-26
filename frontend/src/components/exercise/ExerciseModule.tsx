// Ejercicio: weekly routine, daily log (weight, reps), register, videos.

import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Film, LayoutGrid, Link2, ListChecks, Pencil, Play, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { MONTHS_ES } from "../../lib/calendar";
import { addDays, weekStart } from "../../lib/habits";
import { shortDate, todayIso } from "../../lib/tasks";
import type { Exercise, ExerciseDay, ExerciseOverview } from "../../lib/types";
import { useApp } from "../../store/app";
import { ModuleSidebar } from "../ModuleSidebar";
import { Field, GhostButton, input, inputBase, PrimaryButton } from "../common/forms";
import { StatTile } from "../common/StatTile";
import { YearGrid } from "../common/YearGrid";
import { cn, confirmAction, IconButton } from "../ui";

type DayMeta = { key: string; name: string; subtitle: string; glyph: string };
const DAY_KEYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const ORANGE = "#ff9632";

function dateOfWeekday(key: string): string {
  return addDays(weekStart(todayIso()), DAY_KEYS.indexOf(key));
}

function useFail() {
  const toast = useApp((s) => s.toast);
  return (e: unknown) => toast("error", (e as Error).message);
}

/** One exercise row: tick, weight, reps, notes (saved on change / blur). */
function ExerciseRow({ day, ex, entry, onChanged, onVideo, compact }: {
  day: string; ex: Exercise; entry: { done?: boolean; weight?: number; reps?: number; notes?: string };
  onChanged: () => void; onVideo?: (ex: Exercise) => void; compact?: boolean;
}) {
  const fail = useFail();
  const [done, setDone] = useState(Boolean(entry.done));
  const [weight, setWeight] = useState(entry.weight ? String(entry.weight) : "");
  const [reps, setReps] = useState(entry.reps ? String(entry.reps) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  // The latest values, read by every save: a blur and a click can fire two
  // saves before React re-renders, and the second must not send stale fields.
  const latest = useRef({ done, weight, reps, notes });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const future = day > todayIso();
  useEffect(() => {
    const v = { done: Boolean(entry.done), weight: entry.weight ? String(entry.weight) : "", reps: entry.reps ? String(entry.reps) : "", notes: entry.notes ?? "" };
    latest.current = v;
    setDone(v.done);
    setWeight(v.weight);
    setReps(v.reps);
    setNotes(v.notes);
    // Only when another day or exercise is shown: after that the row owns its
    // values, so a reload after a save never wipes what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, ex.id]);
  const change = (patch: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...patch };
  };
  const save = (patch: Partial<typeof latest.current> = {}) => {
    change(patch);
    // One write at a time, in order.
    queue.current = queue.current.then(async () => {
      const v = latest.current;
      try {
        await api.exMark(day, ex.id, v.done, v.weight || 0, v.reps || 0, v.notes);
        onChanged();
      } catch (e) {
        fail(e);
      }
    });
    return queue.current;
  };
  const small = cn(inputBase, "w-16 py-1 text-right text-[12px]");
  return (
    <div className={cn("rounded-lg border border-line bg-card px-3", compact ? "py-1.5" : "py-2.5")}>
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label={`Hecho: ${ex.name}`} checked={done} disabled={future} style={{ accentColor: ORANGE }}
          onChange={(e) => { setDone(e.target.checked); void save({ done: e.target.checked }); }} />
        {onVideo && (ex.has_video || Boolean(ex.video_path)) ? (
          <button
            type="button"
            onClick={() => onVideo(ex)}
            title={`Ver video: ${ex.name}`}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate text-left text-[13px] hover:underline",
              done ? "text-faint line-through" : "text-text hover:text-accent-text"
            )}
          >
            <span>{ex.name}</span>
            <Play size={11} className="flex-none text-amber-400" />
          </button>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", done ? "text-faint line-through" : "text-text")}>{ex.name}</span>
        )}
        {ex.series_reps && <span className="text-[11.5px] text-dim">{ex.series_reps}</span>}
        {!compact && ex.rest && <span className="text-[11px] text-faint">⏱ {ex.rest}</span>}
        <input className={small} placeholder="kg" aria-label={`Peso: ${ex.name}`} value={weight} disabled={future}
          onChange={(e) => { setWeight(e.target.value); change({ weight: e.target.value }); }} onBlur={() => void save()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <input className={small} placeholder="reps" aria-label={`Reps: ${ex.name}`} value={reps} disabled={future}
          onChange={(e) => { setReps(e.target.value); change({ reps: e.target.value }); }} onBlur={() => void save()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        {compact && (
          <input className={cn(inputBase, "w-44 py-1 text-[12px]")} placeholder="Notas" value={notes} disabled={future}
            onChange={(e) => { setNotes(e.target.value); change({ notes: e.target.value }); }} onBlur={() => void save()} />
        )}
        {onVideo && (ex.has_video || Boolean(ex.video_path)) && <GhostButton onClick={() => onVideo(ex)} className="py-1"><Play size={12} /> Video</GhostButton>}
      </div>
      {!compact && ex.how_to && <p className="mt-1.5 pl-7 text-[12px] leading-relaxed text-faint">{ex.how_to}</p>}
    </div>
  );
}

function DayTracker({ meta, onVideo }: { meta: DayMeta; onVideo: (ex: Exercise) => void }) {
  const fail = useFail();
  const [day, setDay] = useState<ExerciseDay | null>(null);
  const date = dateOfWeekday(meta.key);
  const load = () => api.exDays(date, date).then((d) => setDay(d[0] ?? null)).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const done = day ? day.exercises.filter((e) => day.log[e.id]?.done).length : 0;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-text">{meta.glyph} {meta.name}</h1>
          <div className="text-[13px] text-dim">{meta.subtitle}</div>
        </div>
        <span className="flex-1" />
        <span className="text-[12px] text-faint">{shortDate(date)}{date === todayIso() ? " · hoy" : ""}</span>
        {day && <span className="rounded-md px-2 py-0.5 font-mono text-[12px]" style={{ background: "color-mix(in srgb, #ff9632 18%, transparent)", color: ORANGE }}>{done}/{day.exercises.length}</span>}
      </div>
      {day && !day.exercises.length && <p className="py-10 text-center text-[13px] text-faint">Día de descanso: no hay ejercicios. Añádelos en «Gestionar ejercicios».</p>}
      <div className="space-y-2">
        {day?.exercises.map((ex) => <ExerciseRow key={ex.id} day={date} ex={ex} entry={day.log[ex.id] ?? {}} onChanged={() => void load()} onVideo={onVideo} />)}
      </div>
    </div>
  );
}

function Registro({ onVideo }: { onVideo?: (ex: Exercise) => void }) {
  const fail = useFail();
  const [monday, setMonday] = useState(weekStart(todayIso()));
  const [days, setDays] = useState<ExerciseDay[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set([todayIso()]));
  const load = () => api.exDays(monday, addDays(monday, 6)).then(setDays).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);
  const names: Record<string, string> = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-2">
        <h1 className="text-[21px] font-semibold text-text">📋 Registro de ejercicios</h1>
        <span className="ml-2 text-[13px] text-dim">{shortDate(monday)} – {shortDate(addDays(monday, 6))}</span>
        <span className="flex-1" />
        <GhostButton onClick={() => setOpen(new Set(days.map((d) => d.date)))}>Expandir todo</GhostButton>
        <GhostButton onClick={() => setOpen(new Set())}>Contraer</GhostButton>
        <GhostButton onClick={() => setMonday(addDays(monday, -7))}>‹</GhostButton>
        <GhostButton onClick={() => { setMonday(weekStart(todayIso())); setOpen(new Set([todayIso()])); }}>Hoy</GhostButton>
        <GhostButton onClick={() => setMonday(addDays(monday, 7))}>›</GhostButton>
      </div>
      {days.map((d) => {
        const isOpen = open.has(d.date);
        const done = d.exercises.filter((e) => d.log[e.id]?.done).length;
        return (
          <section key={d.date} className="rounded-xl border border-line bg-panel">
            <button type="button" onClick={() => { const n = new Set(open); if (n.has(d.date)) n.delete(d.date); else n.add(d.date); setOpen(n); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
              {isOpen ? <ChevronDown size={14} className="text-faint" /> : <ChevronRight size={14} className="text-faint" />}
              <span className="text-[13.5px] font-semibold text-text">{names[d.day]} {Number(d.date.slice(8))} de {MONTHS_ES[Number(d.date.slice(5, 7)) - 1]}</span>
              {d.date === todayIso() && <span className="rounded bg-accent px-1.5 text-[10px] font-semibold text-white">HOY</span>}
              <span className="flex-1" />
              {d.date > todayIso() ? <span className="text-faint">⏳</span> : d.exercises.length > 0 && (
                <span className="font-mono text-[11.5px]" style={{ color: done === d.exercises.length ? "var(--nv-mint)" : ORANGE }}>{done}/{d.exercises.length}</span>
              )}
            </button>
            {isOpen && (
              <div className="space-y-1.5 px-4 pb-3">
                {d.exercises.map((ex) => <ExerciseRow key={ex.id} compact day={d.date} ex={ex} entry={d.log[ex.id] ?? {}} onChanged={() => void load()} onVideo={onVideo} />)}
                {!d.exercises.length && <p className="text-[12px] text-faint">Descanso.</p>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Overview({ days, list }: { days: DayMeta[]; list: Exercise[] }) {
  const fail = useFail();
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<ExerciseOverview | null>(null);
  useEffect(() => {
    api.exOverview(year, filter).then(setData).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, filter]);
  const dayName = (k: string) => days.find((d) => d.key === k)?.name ?? k;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
      <h1 className="text-[21px] font-semibold text-text">🏋 Vista general — Ejercicio</h1>
      <div className="grid grid-cols-3 gap-3">
        <StatTile value={data?.week ?? 0} label="Esta semana · días entrenados" colour={ORANGE} />
        <StatTile value={data?.month ?? 0} label="Este mes · días entrenados" colour={ORANGE} />
        <StatTile value={data?.year ?? 0} label={`${new Date().getFullYear()} · días entrenados`} colour={ORANGE} />
      </div>
      <section className="rounded-xl border border-line bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-text">Racha de ejercicio</span>
          <select className={cn(inputBase, "py-1 text-[12px]")} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por ejercicio">
            <option value="">⊙ Todos los días</option>
            {DAY_KEYS.map((k) => {
              const exs = list.filter((e) => e.day === k);
              return exs.length ? <optgroup key={k} label={dayName(k)}>{exs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup> : null;
            })}
          </select>
          <span className="flex-1" />
          <GhostButton onClick={() => setYear(year - 1)}>‹</GhostButton>
          <span className="font-mono text-[12px] text-dim">{year}</span>
          <GhostButton onClick={() => setYear(year + 1)}>›</GhostButton>
        </div>
        <YearGrid year={year} values={data?.grid ?? {}} colour={ORANGE} />
      </section>
      <section>
        <div className="mb-2 text-[13px] font-semibold text-text">Desglose por ejercicio</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {data?.breakdown.map((b) => (
            <div key={b.day} className="rounded-xl border border-line bg-card p-3">
              <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: ORANGE }}>{dayName(b.day)}</div>
              {b.rows.map((r) => {
                const pct = r.total ? r.done / r.total : 0;
                return (
                  <div key={r.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-dim">{r.name}</span>
                    <span className="font-mono text-[11px]" style={{ color: pct >= 1 ? "var(--nv-mint)" : pct >= 0.5 ? ORANGE : "var(--nv-faint)" }}>{r.done}/{r.total} {Math.round(pct * 100)}%</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const EMPTY: Partial<Exercise> = { day: "lunes", name: "", video_path: "", series_reps: "", rest: "", how_to: "" };

function Manage({ days, list, reload }: { days: DayMeta[]; list: Exercise[]; reload: () => void }) {
  const fail = useFail();
  const toast = useApp((s) => s.toast);
  const [editing, setEditing] = useState<string>("");
  const [f, setF] = useState<Partial<Exercise>>(EMPTY);
  const [status, setStatus] = useState("");
  const save = async () => {
    if (!f.name?.trim()) return setStatus("El ejercicio necesita un nombre.");
    try {
      await api.exSave(editing, f);
      setStatus(editing ? "Ejercicio actualizado ✓" : "Ejercicio añadido ✓");
      setEditing("");
      setF({ ...EMPTY, day: f.day });
      reload();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-6 py-4">
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[21px] font-semibold text-text">⚙ Gestionar ejercicios</h1>
          <span className="flex-1" />
          <GhostButton onClick={async () => {
            try {
              const r = await api.exLinkVideos();
              toast("info", `Vinculados: ${r.linked.length} · ya estaban: ${r.already.length} · sin video: ${r.missing.length}`);
              reload();
            } catch (e) {
              fail(e);
            }
          }}><Link2 size={13} /> Vincular videos automáticamente</GhostButton>
        </div>
        {days.map((d) => {
          const exs = list.filter((e) => e.day === d.key);
          return (
            <section key={d.key}>
              <div className="mb-1 text-[12.5px] font-semibold" style={{ color: ORANGE }}>{d.glyph} {d.name} <span className="font-normal text-faint">· {d.subtitle}</span></div>
              <div className="divide-y divide-line rounded-xl border border-line bg-card">
                {exs.map((e) => (
                  <div key={e.id} className={cn("group flex items-center gap-2 px-3 py-1.5 text-[12.5px]", editing === e.id && "bg-accent-soft")}>
                    <span className="min-w-0 flex-1 truncate text-text">{e.name}</span>
                    <span className="text-[11.5px] text-dim">{e.series_reps}</span>
                    <span title={e.has_video ? e.video_name : "Sin video"} className={e.has_video ? "text-mint" : "text-faint"}><Film size={13} /></span>
                    <IconButton title="Editar" onClick={() => { setEditing(e.id); setF({ ...e }); setStatus(""); }}><Pencil size={12} /></IconButton>
                    <IconButton title="Quitar" onClick={async () => {
                      if (!(await confirmAction("Quitar ejercicio", `¿Quitar «${e.name}» de la rutina? Los registros pasados se conservan.`, "Quitar", true))) return;
                      try {
                        await api.exRemove(e.id);
                        reload();
                      } catch (err) {
                        fail(err);
                      }
                    }}><X size={12} /></IconButton>
                  </div>
                ))}
                {!exs.length && <div className="px-3 py-2 text-[12px] text-faint">Sin ejercicios.</div>}
              </div>
            </section>
          );
        })}
      </div>
      <aside className="w-[360px] flex-none space-y-3 overflow-y-auto rounded-xl border border-line bg-panel p-4">
        <div className="text-[14px] font-semibold text-text">{editing ? "✎ Editar ejercicio" : "➕ Añadir ejercicio"}</div>
        <Field label="Día">
          <select className={input} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
            {days.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><input className={input} value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Video (ruta del archivo)">
          <input className={input} value={f.video_path ?? ""} placeholder="C:\\Videos\\press-banca.mp4" onChange={(e) => setF({ ...f, video_path: e.target.value })} />
        </Field>
        {editing && <GhostButton onClick={async () => {
          try {
            const r = await api.exPickVideo(editing);
            if (r.ok) { setStatus("Video copiado al vault ✓"); reload(); }
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}>📂 Elegir video y copiarlo al vault</GhostButton>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Series × reps"><input className={input} value={f.series_reps ?? ""} placeholder="4×8" onChange={(e) => setF({ ...f, series_reps: e.target.value })} /></Field>
          <Field label="Descanso"><input className={input} value={f.rest ?? ""} placeholder="90 s" onChange={(e) => setF({ ...f, rest: e.target.value })} /></Field>
        </div>
        <Field label="Cómo hacerlo"><textarea rows={4} className={cn(input, "resize-y")} value={f.how_to ?? ""} onChange={(e) => setF({ ...f, how_to: e.target.value })} /></Field>
        <div className="flex gap-2">
          <PrimaryButton onClick={() => void save()}>Guardar ejercicio</PrimaryButton>
          {editing && <GhostButton onClick={() => { setEditing(""); setF({ ...EMPTY, day: f.day }); setStatus(""); }}>Cancelar</GhostButton>}
        </div>
        {status && <p className="text-[12px] text-dim">{status}</p>}
      </aside>
    </div>
  );
}

function VideoPlayer({ ex, onBack }: { ex: Exercise; onBack: () => void }) {
  const fail = useFail();
  const [src, setSrc] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => {
    api.exVideoUrl(ex.id).then(setSrc).catch((e) => { fail(e); onBack(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
      <div className="flex items-center gap-2">
        <GhostButton onClick={onBack} className="border-transparent px-1.5"><ChevronLeft size={14} /> Volver</GhostButton>
        <span className="text-[15px] font-semibold text-text">{ex.name}</span>
        <span className="flex-1" />
        <GhostButton onClick={() => void api.exOpenVideo(ex.id).catch(fail)}><ExternalLink size={13} /> Abrir en el reproductor del sistema</GhostButton>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center rounded-xl bg-black">
        {src && <video key={src.url} src={src.url} controls autoPlay className="max-h-full max-w-full" />}
      </div>
      <div className="flex flex-wrap gap-4 text-[12.5px] text-dim">
        {ex.series_reps && <span>📊 {ex.series_reps}</span>}{ex.rest && <span>⏱ {ex.rest}</span>}<span className="text-faint">{src?.name}</span>
      </div>
      {ex.how_to && <p className="text-[12.5px] leading-relaxed text-dim">{ex.how_to}</p>}
    </div>
  );
}

export function ExerciseModule() {
  const fail = useFail();
  const [view, setView] = useState("overview");
  const [days, setDays] = useState<DayMeta[]>([]);
  const [list, setList] = useState<Exercise[]>([]);
  const [video, setVideo] = useState<Exercise | null>(null);
  const reload = () => api.exList().then(setList).catch(fail);
  useEffect(() => {
    api.exMeta().then((m) => setDays(m.days)).catch(fail);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const todayKey = DAY_KEYS[(new Date().getDay() + 6) % 7]!;
  const items = useMemo(() => [
    { id: "overview", label: "Vista general", icon: <LayoutGrid /> },
    { id: "registro", label: "Registro", icon: <ListChecks /> },
    ...days.map((d) => ({ id: d.key, label: `${d.glyph} ${d.name}`, hint: d.subtitle, icon: <span className="text-[11px]">{d.key === todayKey ? "●" : ""}</span> })),
    { id: "manage", label: "Gestionar ejercicios", icon: <Settings2 /> },
  ], [days, todayKey]);
  const dayMeta = days.find((d) => d.key === view);
  return (
    <div className="flex min-w-0 flex-1">
      <ModuleSidebar title="Ejercicio" active={view} onSelect={(id) => { setView(id); setVideo(null); }} items={items} />
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {video ? <VideoPlayer ex={video} onBack={() => setVideo(null)} />
          : view === "overview" ? <Overview days={days} list={list} />
            : view === "registro" ? <Registro onVideo={setVideo} />
              : view === "manage" ? <Manage days={days} list={list} reload={() => void reload()} />
                : dayMeta ? <DayTracker key={dayMeta.key} meta={dayMeta} onVideo={setVideo} />
                  : null}
      </main>
    </div>
  );
}


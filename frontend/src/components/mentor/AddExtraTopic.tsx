// Mentor — «Próximos temas»: enseña QUÉ TEMAS VIENEN (los de las próximas semanas, por semana y por área, en el orden de la ruta) y deja ADELANTAR
// uno a un día (hoy por defecto) como tema extra. Solo se adelantan los siguientes en orden estricto de cada área: un tema cuyo anterior aún no está
// hecho, adelantado ni planeado para ese día sale desactivado con «Antes: <tema>». Ya no se ofrece ningún tema de la vault fuera de la ruta.
// Botón + diálogo; guarda con `mentor_plan_extra_topic_add`. Pieza reutilizable por props: quien la monte recoge el plan nuevo en `onChanged`.

import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { dateLabel } from "../../lib/planSchedule";
import type { MentorPlan, MentorTopicCandidate } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, Field, GhostButton, input, Modal } from "../common/forms";
import { cn } from "../ui";

export interface AddExtraTopicProps {
  planId: string;
  /** día al que se adelanta (AAAA-MM-DD); en el panel se puede cambiar */
  date: string;
  /** abre el panel en las semanas de esta área (id de subplan); sin él, de todas las áreas */
  area?: string;
  /** si true, solo permite ver y adelantar temas de esta área (oculta selector todas las áreas) */
  lockArea?: boolean;
  /** si true (modo Ejecución), fija la fecha a la sesión actual (date), oculta selector de fecha y permite añadir próximos temas sin bloqueo por orden */
  lockSession?: boolean;
  /** límites del selector de fecha (los del plan) */
  minDate?: string;
  maxDate?: string;
  onChanged: (plan: MentorPlan) => void;
  /** si se da, solo se ven y adelantan los temas de ESA asignatura (título del grupo: «Lenguaje: JavaScript»); `info` es la línea de estado que se enseña arriba */
  subject?: { id?: string; title: string; info?: string };
  /** texto del botón */
  label?: string;
  className?: string;
}

const COLD_RETRY_MS = 700;
const STATE_LABEL = { pendiente: "Pendiente", planeado: "Planeado", adelantado: "Adelantado" } as const;

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const codeOf = (folder: string): string => folder.split("/").pop() ?? folder;

interface Data {
  ahead: MentorTopicCandidate[];
  weeks: Record<string, { from: string; to: string }>;
  plannedByArea: Record<string, number>;
}

function TopicRow({ c, day, busy, onAdd, dayText, lockSession }: { c: MentorTopicCandidate; day: string; busy: boolean; onAdd: () => void; dayText: string; lockSession?: boolean }) {
  const state = c.state ?? "pendiente";
  const here = !!c.onDay;
  const blocked = !lockSession && !here && !!c.blockedBy;
  const hint = here ? (state === "adelantado" ? `Adelantado a ${dateLabel(day)}` : `Ya está planeado para ${dateLabel(day)}`) : c.blockedBy ? `Sigue a: ${c.blockedBy}` : state === "adelantado" ? `Adelantado el ${(c.addedDates[0] && dateLabel(c.addedDates[0])) ?? ""}` : c.plannedDate ? `Cae el ${dateLabel(c.plannedDate)}` : "";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2" data-testid="extra-topic-candidate" data-folder={c.folder} data-blocked={blocked || here ? "true" : "false"}>
      <span className="w-12 flex-none font-mono text-[12.5px] text-faint" title="Posición en la ruta del área">{c.position}/{c.total}</span>
      <span className="min-w-0 flex-1 basis-44">
        <span className="block text-[14px] font-medium text-text">{c.title}</span>
        <span className="block text-[13px] text-dim">
          <span className="font-mono">{codeOf(c.folder)}</span>
          {c.group ? ` · ${c.group}` : ""}
          {c.estMinutes ? ` · ${c.estMinutes} min` : ""}
          {hint ? ` · ${hint}` : ""}
        </span>
      </span>
      <Chip large colour={state === "adelantado" ? "var(--nv-accent)" : state === "planeado" ? "var(--nv-mint)" : "var(--nv-faint)"}>{STATE_LABEL[state]}</Chip>
      <GhostButton aria-label={`Adelantar ${c.title}`} disabled={busy || here || blocked} onClick={onAdd} title={blocked ? `Antes: ${c.blockedBy}` : undefined}>
        <ArrowUpRight size={14} aria-hidden /> {dayText}
      </GhostButton>
    </li>
  );
}

export function AddExtraTopic({ planId, date, area, lockArea, lockSession, minDate, maxDate, onChanged, subject, label = "Añadir más temas al aprendizaje diario", className }: AddExtraTopicProps) {
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(date);
  const [allAreas, setAllAreas] = useState(!area && !lockArea);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => setDay(date), [date]);

  const scope = lockSession ? area : (allAreas && !lockArea) ? undefined : area;
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError("");
    try {
      for (let i = 0; i < 40; i++) {
        const r = await api.mentorPlanTopicCandidates({ id: planId, upcoming: true, date: day, ...(scope ? { area: scope } : {}), ...(subject?.id ? { group: subject.id } : {}) });
        if (seq.current !== mine) return;
        if (!r.loading) return void setData({ ahead: r.ahead, weeks: r.weeks ?? {}, plannedByArea: r.plannedByArea ?? {} });
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        if (seq.current !== mine) return;
      }
      setError("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
    } catch (e) {
      if (seq.current === mine) setError((e as Error).message);
    }
  }, [planId, scope, day, subject?.id]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const add = async (c: MentorTopicCandidate): Promise<void> => {
    setBusy(true);
    try {
      const plan = await api.mentorPlanExtraTopicAdd({ id: planId, folder: c.folder, date: day });
      onChanged(plan);
      toast("info", `«${c.title}» adelantado al ${day}.`);
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = (): void => {
    setOpen(false);
    setData(null);
  };

  // semana → área → temas (en el orden de la ruta)
  const groups = useMemo(() => {
    const byWeek = new Map<number, Map<string, { name: string; rows: MentorTopicCandidate[] }>>();
    for (const c of data?.ahead ?? []) {
      if (subject && !subject.id && c.group !== subject.title) continue;
      const w = c.week ?? c.targetWeek ?? 0;
      const areas = byWeek.get(w) ?? new Map<string, { name: string; rows: MentorTopicCandidate[] }>();
      const key = c.subplanId ?? c.area ?? "";
      const g = areas.get(key) ?? { name: c.area ?? key, rows: [] };
      g.rows.push(c);
      areas.set(key, g);
      byWeek.set(w, areas);
    }
    return [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
  }, [data, subject]);

  const dayText = day === localToday() ? "Adelantar a hoy" : `Adelantar al ${dateLabel(day)}`;
  const planned = Object.entries(data?.plannedByArea ?? {});

  return (
    <>
      <GhostButton large="md" className={cn(className)} onClick={() => { setDay(date); setAllAreas(!area && !lockArea); setOpen(true); }} aria-expanded={open} data-testid="add-extra-topic">
        <ArrowUpRight size={15} aria-hidden /> {label}
      </GhostButton>
      {open && (
        <Modal title={subject ? `Añadir más temas · ${subject.title}` : lockSession ? "Añadir más temas al aprendizaje diario" : "Próximos temas"} onClose={close} width={760}>
          {subject && (
            <p className="rounded-lg border border-line bg-panel px-3 py-2 text-[13.5px]" data-testid="extra-topic-subject">
              <strong className="text-text">{subject.title}</strong>
              {subject.info ? <span className="text-dim"> · {subject.info}</span> : null}
              <span className="block text-dim">Solo se muestran los próximos temas de esta asignatura.</span>
            </p>
          )}
          <p className="text-[14px] text-dim">
            {lockSession
              ? "Selecciona los próximos temas de esta área para añadirlos a tu sesión de aprendizaje diario."
              : "Estos son los temas de las próximas semanas, en el orden de la ruta. Puedes adelantar a un día solo el siguiente de cada área."}
          </p>
          {!lockSession && (
            <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr]">
              <Field label="Día">
                <input type="date" className={input} value={day} min={minDate} max={maxDate} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Día" />
              </Field>
              {area && !lockArea && (
                <div className="flex flex-wrap items-center gap-2">
                  <GhostButton large="md" aria-pressed={!allAreas} onClick={() => setAllAreas(false)} className={cn(!allAreas && "border-accent bg-accent-soft font-semibold text-accent-text")}>Esta área</GhostButton>
                  <GhostButton large="md" aria-pressed={allAreas} onClick={() => setAllAreas(true)} className={cn(allAreas && "border-accent bg-accent-soft font-semibold text-accent-text")}>Todas las áreas</GhostButton>
                </div>
              )}
            </div>
          )}
          {data && planned.length > 0 && (
            <p className="text-[13.5px] text-dim" data-testid="next-topics-planned">
              Ya planeados el {dateLabel(day)}:{" "}
              {planned.map(([id, n]) => `${data.ahead.find((c) => c.subplanId === id)?.area ?? id} ${n}`).join(" · ")}
            </p>
          )}
          {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
          {!data && !error && <p className="text-[14px] text-dim" role="status">Buscando los próximos temas…</p>}
          {data && groups.length === 0 && <p className="text-[14px] text-dim">{subject ? `No quedan temas pendientes de ${subject.title} en las próximas semanas.` : "No quedan temas pendientes en las próximas semanas."}</p>}
          {data &&
            groups.map(([week, areas]) => {
              const r = data.weeks[String(week)];
              return (
                <section key={week} aria-label={`Semana ${week}`} className="space-y-2" data-testid="next-topics-week" data-week={week}>
                  <h4 className="text-[13px] font-semibold uppercase tracking-wider text-faint">
                    Semana {week}
                    {r ? ` · ${dateLabel(r.from)} – ${dateLabel(r.to)}` : ""}
                  </h4>
                  {[...areas.entries()].map(([key, g]) => (
                    <div key={key} data-testid="next-topics-area" data-area={key}>
                      <p className="mb-1 text-[13.5px] font-semibold text-text">
                        {g.name}
                        <span className="font-normal text-dim"> · hoy {data.plannedByArea[key] ?? 0} {(data.plannedByArea[key] ?? 0) === 1 ? "planeado" : "planeados"}</span>
                      </p>
                      <ul className="space-y-1.5">{g.rows.map((c) => <TopicRow key={c.folder} c={c} day={day} busy={busy} dayText={dayText} lockSession={lockSession} onAdd={() => void add(c)} />)}</ul>
                    </div>
                  ))}
                </section>
              );
            })}
        </Modal>
      )}
    </>
  );
}

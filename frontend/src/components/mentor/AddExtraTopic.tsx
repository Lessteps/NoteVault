// Mentor — «Añadir tema»: añade a mano un TEMA EXTRA a un día (hoy por defecto): uno de la ruta que está más adelante (decisión del estudiante,
// se adelanta y sale de su sitio en la cola) o cualquier tema de la vault que no está en el plan (va a su área o al cubo «Extra»). Botón + diálogo con
// búsqueda; guarda con `mentor_plan_extra_topic_add`. Pieza reutilizable por props: quien la monte recoge el plan nuevo en `onChanged`.

import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { MentorPlan, MentorTopicCandidate } from "../../lib/types";
import { useApp } from "../../store/app";
import { Field, GhostButton, input, Modal } from "../common/forms";
import { cn } from "../ui";

export interface AddExtraTopicProps {
  planId: string;
  /** día al que se añade (AAAA-MM-DD); en el diálogo se puede cambiar */
  date: string;
  /** limita «siguientes de la ruta» a un área (id de subplan) y atribuye a ella los temas de la vault que se añadan */
  area?: string;
  /** límites del selector de fecha (los del plan) */
  minDate?: string;
  maxDate?: string;
  onChanged: (plan: MentorPlan) => void;
  /** texto del botón */
  label?: string;
  className?: string;
}

const COLD_RETRY_MS = 700;

function CandidateRow({ c, busy, added, onAdd }: { c: MentorTopicCandidate; busy: boolean; added: boolean; onAdd: () => void }) {
  const meta = c.inPlan ? `${c.area ?? ""} · tema ${c.position} de ${c.total}${c.estMinutes ? ` · ${c.estMinutes} min` : ""}` : (c.subject ?? "Vault");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2" data-testid="extra-topic-candidate">
      <span className="min-w-0 flex-1 basis-44">
        <span className="block text-[14px] font-medium text-text">{c.title}</span>
        <span className="block text-[13px] text-dim">{meta}</span>
      </span>
      {added ? (
        <span className="text-[13px] font-medium text-mint">Añadido</span>
      ) : (
        <GhostButton aria-label={`Añadir ${c.title}`} disabled={busy} onClick={onAdd}>
          <Plus size={14} aria-hidden /> Añadir
        </GhostButton>
      )}
    </li>
  );
}

export function AddExtraTopic({ planId, date, area, minDate, maxDate, onChanged, label = "Añadir tema", className }: AddExtraTopicProps) {
  const toast = useApp((s) => s.toast);
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [day, setDay] = useState(date);
  const [data, setData] = useState<{ ahead: MentorTopicCandidate[]; vault: MentorTopicCandidate[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const seq = useRef(0);
  useEffect(() => setDay(date), [date]);

  const load = useCallback(
    async (q: string) => {
      const mine = ++seq.current;
      setError("");
      try {
        for (let i = 0; i < 40; i++) {
          const r = await api.mentorPlanTopicCandidates({ id: planId, ...(q.trim() ? { query: q.trim() } : {}), ...(area ? { area } : {}) });
          if (seq.current !== mine) return;
          if (!r.loading) return void setData({ ahead: r.ahead, vault: r.vault });
          await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
          if (seq.current !== mine) return;
        }
        setError("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      } catch (e) {
        if (seq.current === mine) setError((e as Error).message);
      }
    },
    [planId, area],
  );
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(query), query ? 200 : 0);
    return () => clearTimeout(t);
  }, [open, query, load]);

  const add = async (c: MentorTopicCandidate): Promise<void> => {
    setBusy(true);
    try {
      const plan = await api.mentorPlanExtraTopicAdd({ id: planId, folder: c.folder, date: day, ...(!c.inPlan && area ? { area } : {}) });
      setAdded((s) => new Set(s).add(c.folder));
      onChanged(plan);
      toast("info", `«${c.title}» añadido al ${day}.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = (): void => {
    setOpen(false);
    setQuery("");
    setAdded(new Set());
  };

  return (
    <>
      <GhostButton large="md" className={cn(className)} onClick={() => setOpen(true)} aria-expanded={open} data-testid="add-extra-topic">
        <Plus size={15} aria-hidden /> {label}
      </GhostButton>
      {open && (
        <Modal title="Añadir un tema extra" onClose={close} width={640}>
          <p className="text-[14px] text-dim">Añade un tema a un día aunque no te toque todavía. Un tema de la ruta se adelanta (sale de su sitio en la cola); uno de la vault fuera del plan va a {area ? "esta área" : "«Extra»"}.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Buscar tema">
              <input id={`${uid}-q`} autoFocus type="search" className={input} placeholder="Título o carpeta…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar tema" />
            </Field>
            <Field label="Día">
              <input type="date" className={input} value={day} min={minDate} max={maxDate} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Día" />
            </Field>
          </div>
          {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
          {!data && !error && <p className="text-[14px] text-dim" role="status">Buscando temas…</p>}
          {data && (
            <div className="space-y-4">
              <section aria-label="Siguientes de la ruta">
                <h4 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-faint">Siguientes de la ruta</h4>
                {data.ahead.length ? (
                  <ul className="space-y-1.5">{data.ahead.map((c) => <CandidateRow key={c.folder} c={c} busy={busy} added={added.has(c.folder)} onAdd={() => void add(c)} />)}</ul>
                ) : (
                  <p className="text-[14px] text-dim">No hay temas de la ruta que coincidan.</p>
                )}
              </section>
              <section aria-label="Otros temas de la vault">
                <h4 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-faint">Otros temas de la vault</h4>
                {data.vault.length ? (
                  <ul className="space-y-1.5">{data.vault.map((c) => <CandidateRow key={c.folder} c={c} busy={busy} added={added.has(c.folder)} onAdd={() => void add(c)} />)}</ul>
                ) : (
                  <p className="text-[14px] text-dim">No hay otros temas de la vault que coincidan.</p>
                )}
              </section>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

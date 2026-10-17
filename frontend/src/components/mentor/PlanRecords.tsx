// Mentor — Plan, sub-vista «Registros»: TODO lo que dejan las sesiones de estudio y lo que el Mentor aprende de ello.
//
//  · «Repensar el plan con mis registros»: el Mentor lee los registros (con IA o por reglas) y PROPONE cambios pequeños con la sesión que los demuestra.
//    Nada se aplica solo: cada propuesta se ve, se confirma (diciendo exactamente qué se crea o cambia) y se puede descartar. Lo aplicado se sigue en el tiempo.
//  · Dominio por tema, patrones detectados y la lista de sesiones, cada una con su nota legible en `<Materia>/_registro/`.
// Los datos salen de `mentor_records_list`; la lógica (dominio, patrones, propuestas) es de `lib/sessionRecords.ts`.

import { BookOpenCheck, ChevronDown, ChevronRight, FolderOpen, NotebookText, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { PROPOSAL_LABEL, registryIndexRel, sessionNoteTargets, topicDossierRel, type ProposalView, type RecordsList, type SessionRecord } from "../../lib/sessionRecords";
import { minutesText } from "../../lib/timeLog";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { usePomodoro } from "../../store/pomodoro";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { LoadState, ProgressBar } from "./parts";
import { SectionHeading } from "./planKit";

const FOLLOW: Record<string, { text: string; colour: string }> = {
  improved: { text: "Mejoró", colour: "var(--nv-mint)" },
  same: { text: "Sin cambio", colour: "var(--nv-faint)" },
  worse: { text: "Empeoró", colour: "var(--nv-danger)" },
  pending: { text: "Midiendo…", colour: "var(--nv-faint)" },
};
const STATUS_TEXT = { done: "completado", partial: "a medias", none: "no se tocó" } as const;
const dayText = (iso: string): string => new Date(`${iso}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
const tomorrow = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Los registros del plan; se recargan cuando se guarda una sesión o cambia el plan. */
export function useRecords(planId: string) {
  const logVersion = usePomodoro((s) => s.logVersion);
  const planVersion = useMentor((s) => s.planVersion);
  const [data, setData] = useState<RecordsList | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const r = await api.mentorRecordsList(planId);
      // una respuesta incompleta no rompe la vista: lo que falte se toma vacío
      setData({
        records: Array.isArray(r?.records) ? r.records : [],
        overview: { mastery: r?.overview?.mastery ?? [], patterns: r?.overview?.patterns ?? [], weeks: r?.overview?.weeks ?? [] },
        proposals: Array.isArray(r?.proposals) ? r.proposals : [],
        lastReviewAt: r?.lastReviewAt ?? "",
        space: r?.space ?? "Programación",
        noteDir: r?.noteDir ?? "Programación/_registro",
        retentionDays: r?.retentionDays ?? 90,
        aiConfigured: !!r?.aiConfigured,
      });
    } catch (e) {
      setError((e as Error).message || "No se pudieron leer los registros.");
    }
  }, [planId]);
  useEffect(() => {
    void load();
  }, [load, logVersion, planVersion]);
  return { data, setData, error, reload: () => void load() };
}

function SessionRow({ r, space }: { r: SessionRecord; space: string }) {
  const [open, setOpen] = useState(false);
  const a = r.assessment;
  const openNote = useApp((s) => s.openNote);
  const toast = useApp((s) => s.toast);
  return (
    <li className="rounded-xl border border-line bg-surface" data-testid="record-row" data-id={r.id}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-left">
        {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
        <span className="w-28 flex-none text-[14px] font-semibold first-letter:uppercase">{dayText(r.date)} · {r.start}</span>
        <span className="min-w-0 flex-1 basis-40 truncate text-[14.5px]">{r.areaName}{r.assigned.length ? ` · ${r.assigned.map((t) => t.title).join(", ")}` : " · sesión libre"}</span>
        <Chip>{minutesText(r.minutes)}</Chip>
        {a && a.understanding > 0 && <span className="font-mono text-[12.5px] text-dim" title="Comprensión · concentración">{a.understanding}★ · {a.focus || "—"}★</span>}
        {r.evidence.errors.length > 0 && <Chip colour="var(--nv-warn)">{r.evidence.errors.reduce((n, e) => n + e.repeat, 0)} errores</Chip>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-4 py-3 text-[14px]" data-testid="record-detail">
          {r.assigned.length > 0 && (
            <ul className="space-y-0.5" aria-label="Lo que se trabajó">
              {r.assigned.map((t) => <li key={t.folder + t.title}><strong className="font-medium">{t.title}</strong> <span className="text-dim">— {STATUS_TEXT[t.status]}</span></li>)}
            </ul>
          )}
          {a?.learned && <p><span className="font-medium">Aprendí:</span> {a.learned}</p>}
          {a?.doubt && <p><span className="font-medium">Duda pendiente:</span> {a.doubt}</p>}
          {a?.errors && <p><span className="font-medium">Errores o problemas:</span> {a.errors}</p>}
          <p className="text-[13px] text-dim">
            Evidencia de la app: {r.evidence.attempts.length} {r.evidence.attempts.length === 1 ? "intento" : "intentos"}
            {r.evidence.attempts.length ? ` (media ${Math.round(r.evidence.attempts.reduce((n, x) => n + x.score, 0) / r.evidence.attempts.length)})` : ""}
            {` · ${r.evidence.errors.length} ${r.evidence.errors.length === 1 ? "error" : "errores"} · ${r.evidence.filesTouched.length} ${r.evidence.filesTouched.length === 1 ? "archivo tocado" : "archivos tocados"}`}
          </p>
          <div className="flex flex-wrap gap-2" data-testid="record-notes">
            {sessionNoteTargets(space, r).map((t) => (
              <GhostButton key={t.rel} onClick={() => void openNote(t.rel).catch((e: Error) => toast("error", e.message))} title={t.rel} data-testid="record-open-note">
                <NotebookText size={14} aria-hidden /> {t.topic ? `Nota en la carpeta de ${t.topic.title}` : "Nota de la sesión libre"}
              </GhostButton>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function ProposalCard({ p, onApply, onDismiss, busy }: { p: ProposalView; onApply: () => void; onDismiss: () => void; busy: boolean }) {
  const f = p.followUp ? FOLLOW[p.followUp.verdict]! : null;
  return (
    <li className={cn("rounded-2xl border bg-card p-4", p.status === "open" ? "border-line" : "border-line opacity-80")} data-testid="proposal" data-id={p.id} data-status={p.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip colour="var(--nv-accent)">{PROPOSAL_LABEL[p.kind]}</Chip>
        {p.source === "ai" && <Chip>Propuesta de la IA</Chip>}
        <h3 className="min-w-0 flex-1 basis-60 text-[16px] font-semibold">{p.title}</h3>
        {p.status === "applied" && <Chip colour="var(--nv-mint)">Aplicada</Chip>}
        {p.status === "dismissed" && <Chip>Descartada</Chip>}
        {f && <Chip colour={f.colour}>{f.text}</Chip>}
      </div>
      <p className="mt-1.5 text-[14.5px] text-dim">{p.why}</p>
      {p.evidence.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13.5px]" aria-label="Evidencia">
          {p.evidence.map((e) => <li key={e.recordId} className="text-dim"><span className="font-medium text-text">{dayText(e.date)}</span> · {e.note}</li>)}
        </ul>
      )}
      {p.followUp && <p className="mt-1.5 text-[13px] text-dim" data-testid="proposal-followup">{p.followUp.detail}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[13px] text-faint">
          {p.cost.aiCalls || p.cost.files ? `Costaría ${p.cost.aiCalls} ${p.cost.aiCalls === 1 ? "llamada de IA" : "llamadas de IA"} y ${p.cost.files} ${p.cost.files === 1 ? "archivo nuevo" : "archivos nuevos"}.` : "No crea archivos ni usa IA."}
        </span>
        {p.status === "open" && (
          <>
            <GhostButton onClick={onDismiss} disabled={busy} data-testid="proposal-dismiss">Descartar</GhostButton>
            <PrimaryButton onClick={onApply} disabled={busy} data-testid="proposal-apply">Aplicar…</PrimaryButton>
          </>
        )}
      </div>
    </li>
  );
}

export function PlanRecords({ planId }: { planId: string }) {
  const toast = useApp((s) => s.toast);
  const openNote = useApp((s) => s.openNote);
  const { data, setData, error, reload } = useRecords(planId);
  const [area, setArea] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(20);

  const areas = useMemo(() => [...new Map((data?.records ?? []).map((r) => [r.areaKey, r.areaName] as const))], [data]);
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [days]);
  const records = useMemo(() => (data?.records ?? []).filter((r) => (!area || r.areaKey === area) && r.date >= cutoff), [data, area, cutoff]);

  const rethink = async (noAi: boolean): Promise<void> => {
    setBusy(true);
    setNote("");
    try {
      const r = await api.mentorRecordsRethink(planId, noAi);
      setData((d) => (d ? { ...d, proposals: r.proposals } : d));
      setNote(r.note ?? (r.proposals.some((p) => p.status === "open") ? `Propuestas ${r.source === "ai" ? "de la IA" : "por reglas"} sobre tus registros.` : "No hay nada que proponer con lo que tienes registrado."));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mark = async (p: ProposalView, status: "dismissed" | "applied"): Promise<void> => {
    const r = await api.mentorProposalSet(planId, p.id, status);
    setData((d) => (d ? { ...d, proposals: r.proposals } : d));
  };

  const apply = async (p: ProposalView): Promise<void> => {
    setBusy(true);
    try {
      if (p.kind === "reinforce" || p.kind === "bridge_note") {
        const prev = await api.mentorProposalApply(planId, p.id, true);
        const ok = await confirmAction(PROPOSAL_LABEL[p.kind], `Se creará una nota NUEVA en tu vault:\n${prev.rel}\n\n${prev.aiCalls ? `Usa ${prev.aiCalls} llamada de IA para escribirla. ` : "Se escribe por reglas, sin IA. "}No se sobrescribe nada de lo que ya existe.`, "Crear la nota");
        if (!ok) return;
        const r = await api.mentorProposalApply(planId, p.id);
        toast("info", `Nota creada: ${r.rel}`);
        reload();
        await openNote(r.rel).catch(() => undefined);
      } else if (p.kind === "move_review") {
        const reviews = await api.studyReviewsList();
        const it = reviews.items.find((x) => x.kind !== "vocab" && (x.topicPath === p.folder || x.topicPath.startsWith(`${p.folder}/`)));
        if (!it) {
          toast("info", "Ese tema todavía no tiene un repaso programado: aparece cuando lo practiques.");
          return;
        }
        if (!(await confirmAction("Adelantar el repaso", `El repaso de «${p.title}» pasará a mañana. No cambia nada más.`, "Mover a mañana"))) return;
        await api.studyReviewReschedule(it.path, tomorrow());
        await mark(p, "applied");
        toast("info", "Repaso movido a mañana.");
      } else if (p.kind === "optional") {
        if (!(await confirmAction("Mover a opcional", `«${p.title}» pasará a la ruta opcional. La nota NO se borra y puedes reactivarlo.`, "Mover a opcional"))) return;
        await api.mentorPlanRouteSet({ id: planId, folders: [p.folder], route: "optional", reason: p.why });
        await mark(p, "applied");
        useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
      } else if (p.kind === "lighten") {
        if (!(await confirmAction("Bajar la carga del plan", "Se aligera el plan (se puede deshacer desde «Preguntas y ajustes»).", "Aligerar el plan"))) return;
        await api.mentorPlanChange({ id: planId, ops: [{ op: "lighter" }], label: "Aligerar a partir de mis registros" });
        await mark(p, "applied");
        useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <section data-testid="plan-records"><LoadState warming={false} error={error} empty onRetry={reload} /></section>;
  const open = data.proposals.filter((p) => p.status === "open");
  const done = data.proposals.filter((p) => p.status !== "open");
  const weak = data.overview.mastery.slice(0, 10);

  return (
    <section aria-labelledby="rec-h" data-testid="plan-records" className="space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <SectionHeading id="rec-h" hint={`Cada bloque de estudio deja un registro. El detalle se guarda ${data.retentionDays} días; después queda el resumen de la semana. Las notas están en «${data.noteDir}».`}>Registros</SectionHeading>
        </div>
        <GhostButton large onClick={() => void api.revealPath(data.noteDir).catch((e: Error) => toast("error", e.message))} data-testid="records-folder"><FolderOpen size={15} aria-hidden /> Abrir la carpeta de registros</GhostButton>
        <GhostButton large onClick={() => void openNote(`${data.noteDir}/puntos-debiles.md`).catch(() => toast("info", "Aún no hay puntos débiles: se crean al guardar tu primera sesión."))} data-testid="records-weak"><BookOpenCheck size={15} aria-hidden /> Puntos débiles</GhostButton>
        <GhostButton large onClick={() => void openNote(registryIndexRel(data.space)).catch(() => toast("info", "Aún no hay índice: se crea al guardar tu primera sesión."))} data-testid="records-index"><NotebookText size={15} aria-hidden /> Índice por temas</GhostButton>
      </div>

      {/* 1 · Repensar el plan */}
      <div className="space-y-3" data-testid="records-rethink">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 text-[18px] font-semibold">Repensar el plan con mis registros</h3>
          <GhostButton large onClick={() => void rethink(true)} disabled={busy || !data.records.length} data-testid="rethink-rules">Por reglas (sin IA)</GhostButton>
          <PrimaryButton large onClick={() => void rethink(!data.aiConfigured)} disabled={busy || !data.records.length} data-testid="rethink">
            <Sparkles size={16} aria-hidden /> {busy ? "Analizando…" : data.aiConfigured ? "Repensar con IA" : "Repensar"}
          </PrimaryButton>
        </div>
        <p className="text-[14px] text-dim">El Mentor lee tus sesiones y <strong className="text-text">propone</strong> cambios pequeños, cada uno con la sesión que lo demuestra. Nada se aplica solo: tú decides.{data.lastReviewAt ? ` Última revisión: ${dayText(data.lastReviewAt.slice(0, 10))}.` : ""}</p>
        {note && <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px]" data-testid="rethink-note">{note}</p>}
        {!data.records.length && <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="records-empty">Aún no hay sesiones registradas. Termina un bloque de estudio (Pomodoro) y rellena su registro: aparecerá aquí.</p>}
        {open.length > 0 && <ul className="space-y-3" aria-label="Propuestas abiertas" data-testid="proposals-open">{open.map((p) => <ProposalCard key={p.id} p={p} busy={busy} onApply={() => void apply(p)} onDismiss={() => void mark(p, "dismissed")} />)}</ul>}
        {done.length > 0 && (
          <details>
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-[14px] text-accent-text">Aplicadas y descartadas ({done.length})</summary>
            <ul className="mt-2 space-y-3" data-testid="proposals-done">{done.map((p) => <ProposalCard key={p.id} p={p} busy={busy} onApply={() => undefined} onDismiss={() => undefined} />)}</ul>
          </details>
        )}
      </div>

      {/* 2 · Dominio y patrones */}
      {data.records.length > 0 && (
        <div className="grid items-start gap-6 @4xl:grid-cols-2 [&>*]:min-w-0">
          <div data-testid="records-mastery">
            <h3 className="mb-2 text-[18px] font-semibold">Dominio por tema</h3>
            <p className="mb-2 text-[13.5px] text-dim">Lo medido (notas de tus intentos, errores) pesa más que lo que declaras. Los más flojos, primero.</p>
            <ul className="space-y-1.5">
              {weak.map((m) => (
                <li key={m.folder} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 text-[14px]" data-testid="mastery-row">
                  <button type="button" onClick={() => void openNote(topicDossierRel(data.space, m.folder, m.title)).catch(() => toast("info", "Ese tema aún no tiene resumen de registros."))} title="Abrir el resumen de registros de este tema" className="min-w-0 flex-1 truncate text-left hover:underline" data-testid="mastery-open">{m.title}</button>
                  <span className="hidden w-28 flex-none @xl:block"><ProgressBar pct={m.mastery} label={`Dominio de ${m.title}`} /></span>
                  <strong className="w-12 flex-none text-right">{m.mastery} %</strong>
                  <span className="w-28 flex-none text-right text-[12.5px] text-dim">{m.sessions} ses. · {m.errors} err.</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="records-patterns">
            <h3 className="mb-2 text-[18px] font-semibold">Patrones de los últimos 14 días</h3>
            {data.overview.patterns.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim">Nada llamativo: ningún error se repite ni queda un tema atascado.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.overview.patterns.map((p) => (
                  <li key={`${p.kind}:${p.folder}:${p.skill ?? ""}`} className="rounded-lg border border-warn/50 bg-warn-soft px-3 py-2 text-[14px]" data-testid="pattern-row">
                    <strong>{p.title}</strong> <span className="text-dim">— {p.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 3 · Sesiones */}
      <div className="space-y-3" data-testid="records-sessions">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 text-[18px] font-semibold">Sesiones <span className="text-[14px] font-normal text-dim">{records.length}</span></h3>
          <label className="text-[13.5px] text-dim">Área{" "}
            <select value={area} onChange={(e) => { setArea(e.target.value); setShown(20); }} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[14px] text-text" data-testid="records-area">
              <option value="">Todas</option>
              {areas.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </label>
          <label className="text-[13.5px] text-dim">Últimos{" "}
            <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setShown(20); }} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[14px] text-text" data-testid="records-days">
              {[7, 30, 90].map((n) => <option key={n} value={n}>{n} días</option>)}
            </select>
          </label>
          <GhostButton onClick={reload} aria-label="Recargar los registros"><RefreshCw size={14} aria-hidden /></GhostButton>
        </div>
        {records.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim">No hay sesiones en este rango.</p>
        ) : (
          <ul className="space-y-2" aria-label="Sesiones registradas">
            {records.slice(0, shown).map((r) => <SessionRow key={r.id} r={r} space={data.space} />)}
          </ul>
        )}
        {records.length > shown && <GhostButton onClick={() => setShown((n) => n + 20)}>Ver más ({records.length - shown})</GhostButton>}
      </div>

      {/* 4 · Semanas ya resumidas */}
      {data.overview.weeks.length > 0 && (
        <div data-testid="records-weeks">
          <h3 className="mb-2 text-[18px] font-semibold">Semanas</h3>
          <ul className="grid gap-2 @3xl:grid-cols-2">
            {data.overview.weeks.slice(0, 12).map((w) => (
              <li key={w.week} className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[14px]" data-testid="week-row">
                <strong>{w.week}</strong> <span className="text-dim">· {w.sessions} {w.sessions === 1 ? "sesión" : "sesiones"} · {minutesText(w.minutes)}{w.avgUnderstanding !== null ? ` · comprensión ${w.avgUnderstanding}/5` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

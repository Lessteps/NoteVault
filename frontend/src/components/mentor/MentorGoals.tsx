// Mentor — Metas: resumen general de las metas en desarrollo, con el aspecto del módulo Metas pero
// DESPLEGABLE y de SOLO LECTURA, más el borrador que se conversa con el Mentor en el panel del asistente.
//
// Aquí no se edita nada: las metas solo se editan en el módulo Metas (botón "Abrir en Metas"). Lo único
// que escribe es "Crear meta" del borrador, que ejecuta código determinista (`mentor_goal_create`).

import { Check, CheckCircle2, ChevronsUpDown, Circle, CircleAlert, ExternalLink, MessageSquarePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { shortDate } from "../../lib/tasks";
import type { GoalCard, MentorGoalDraft, MentorGoalItemSlim } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { useMentor } from "../../store/mentor";
import { BlockProgress, Sparkline } from "../common/charts";
import { Chip, GhostButton, PrimaryButton, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";
import { dateLine } from "../goals/GoalsBoard";
import { catColour } from "../goals/Submetas";
import { cn } from "../ui";
import { openTopic } from "./openTopic";
import { dayText, Disclosure, hm, LoadState, PanelPage, useMentorPanels } from "./parts";

export async function openGoalInMetas(id: string): Promise<void> {
  await useGoals.getState().open(id);
  useApp.getState().setModule("metas");
}

/** El botón de crear una meta: abre el asistente (columna derecha) en el contexto del Mentor. */
function NewGoalButton({ className }: { className?: string }) {
  const start = useMentor((s) => s.startGoalChat);
  return (
    <PrimaryButton onClick={() => void start()} className={className}>
      <MessageSquarePlus size={14} /> ＋ Nueva meta con el Mentor
    </PrimaryButton>
  );
}

export function MentorGoals() {
  const { panels, warming, error, reload } = useMentorPanels();
  const turns = useMentor((s) => s.turns);
  const pending = useMentor((s) => s.pending);
  const chatLoaded = useMentor((s) => s.chatLoaded);
  const loadChat = useMentor((s) => s.loadChat);
  const createdId = useMentor((s) => s.createdGoalId);
  const draftTurn = turns.find((t) => t.id === pending && t.draft);
  const [open, setOpen] = useState<Set<string>>(new Set());

  // el borrador vive en la conversación guardada: se carga aquí también si el panel se abre primero
  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);

  // la meta recién creada aparece ya desplegada
  useEffect(() => {
    if (createdId) setOpen((s) => new Set(s).add(createdId));
  }, [createdId]);

  const groups = useMemo(() => {
    if (!panels) return [];
    const out: Array<{ key: string; title: string; colour: string; goals: typeof panels.goals }> = [];
    for (const a of panels.areas) {
      const gs = panels.goals.filter((g) => g.card.area === a.id);
      if (gs.length) out.push({ key: a.id, title: `${a.icon} ${a.name}`, colour: a.colour, goals: gs });
    }
    const rest = panels.goals.filter((g) => !panels.areas.some((a) => a.id === g.card.area));
    if (rest.length) out.push({ key: "_", title: "Sin área", colour: "var(--nv-dim)", goals: rest });
    return out;
  }, [panels]);

  const allIds = panels?.goals.map((g) => g.card.id) ?? [];
  const allOpen = allIds.length > 0 && allIds.every((id) => open.has(id));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <PanelPage
      title="Mentor — Metas"
      subtitle="Resumen general de tus metas en desarrollo. Se editan en el módulo Metas."
      wide
      action={<NewGoalButton />}
    >
      <LoadState warming={warming} error={error} empty={!panels} onRetry={() => void reload()} />

      {draftTurn?.draft && <DraftCard draft={draftTurn.draft} />}

      {panels && panels.goals.length === 0 && !draftTurn && (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center" data-testid="goals-empty">
          <p className="mx-auto max-w-md text-[13px] leading-relaxed text-faint">
            No tienes metas activas. Cuéntale al Mentor qué quieres lograr y la creáis juntos, con calendario y temas de tu sistema de notas.
          </p>
          <div className="mt-3 flex justify-center">
            <NewGoalButton />
          </div>
        </div>
      )}

      {panels && panels.goals.length > 0 && (
        <div className="flex items-center gap-2 text-[11.5px] text-faint">
          <span>{panels.goals.length} meta{panels.goals.length !== 1 ? "s" : ""} activa{panels.goals.length !== 1 ? "s" : ""}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(allIds))}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-dim hover:bg-hover hover:text-text"
          >
            <ChevronsUpDown size={12} /> {allOpen ? "Contraer todas" : "Expandir todas"}
          </button>
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => {
          const avg = g.goals.reduce((a, x) => a + x.card.progress, 0) / g.goals.length;
          return (
            <section key={g.key} aria-label={g.title}>
              <h2 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-semibold" style={{ color: g.colour }}>
                {g.title} <BlockProgress value={avg} colour={g.colour} blocks={10} />
                <span className="text-[11.5px] font-normal text-faint">{g.goals.length} meta{g.goals.length !== 1 ? "s" : ""}</span>
              </h2>
              <div className="space-y-3">
                {g.goals.map(({ card, items }) => (
                  <GoalAccordion key={card.id} card={card} items={items} open={open.has(card.id)} onToggle={() => toggle(card.id)} fresh={card.id === createdId} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PanelPage>
  );
}

/** Una meta como en el tablero de Metas; al pulsarla despliega sus submetas (solo lectura). */
export function GoalAccordion({
  card,
  items,
  open,
  onToggle,
  fresh = false,
}: {
  card: GoalCard;
  items: MentorGoalItemSlim[];
  open: boolean;
  onToggle: () => void;
  fresh?: boolean;
}) {
  const [line, lineColour] = dateLine(card);
  const left = card.days_left;
  return (
    <section
      className="rounded-xl border border-line bg-card p-4"
      style={{ borderTop: `3px solid ${card.colour}` }}
      data-testid="goal-card"
      aria-label={`Meta ${card.name}`}
    >
      <Disclosure open={open} onToggle={onToggle} label={`${open ? "Contraer" : "Expandir"} ${card.name}`}>
        <div className="flex items-start gap-2.5">
          <span className="text-[20px] leading-none">{card.icon || "🎯"}</span>
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-text">{card.name}</span>
          {fresh && <Chip colour="var(--nv-mint)">Recién creada</Chip>}
          <Chip colour={PRIORITY_COLOURS[card.priority]}>
            {PRIORITY_GLYPHS[card.priority]} {PRIORITY_NAMES[card.priority]}
          </Chip>
        </div>
        <div className="mt-1.5 text-[11px]" style={{ color: lineColour }}>
          {card.status !== "Activa" ? `${card.status} · ` : ""}
          {line}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <BlockProgress value={card.progress} colour={card.colour} />
          <span className="text-[11.5px] font-medium text-text">{Math.round(card.progress * 100)} %</span>
          <span className="text-[11px] text-dim">{card.counts[0]}/{card.counts[1]} submetas</span>
          {left !== null && left !== undefined && !card.overdue && (
            <Chip colour={left <= 7 ? "var(--nv-warn)" : undefined}>⏰ {left === 0 ? "termina hoy" : `${left} d restantes`}</Chip>
          )}
          {card.overdue_items > 0 && <Chip colour="var(--nv-danger)">⚠ {card.overdue_items} vencida{card.overdue_items !== 1 ? "s" : ""}</Chip>}
          <span className="ml-auto flex-none">
            <Sparkline values={card.daily} colour={card.colour} width={64} />
          </span>
        </div>
      </Disclosure>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <SubmetaOutline items={items} colour={card.colour} />
          <GhostButton onClick={() => void openGoalInMetas(card.id)}>
            <ExternalLink size={13} /> Abrir en Metas
          </GhostButton>
        </div>
      )}
    </section>
  );
}

/** El árbol de submetas del módulo Metas, sin controles: estado, vencimiento, avance y temas enlazados. */
function SubmetaOutline({ items, colour }: { items: MentorGoalItemSlim[]; colour: string }) {
  const rows = useMemo(() => {
    const out: Array<[MentorGoalItemSlim, number]> = [];
    const byParent = new Map<string, MentorGoalItemSlim[]>();
    for (const i of items) byParent.set(i.parent || "", [...(byParent.get(i.parent || "") ?? []), i]);
    const walk = (parent: string, depth: number) => {
      for (const it of byParent.get(parent) ?? []) {
        out.push([it, depth]);
        walk(it.id, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [items]);
  const MAX = 60;
  if (!rows.length) return <p className="text-[12.5px] text-faint">Esta meta aún no tiene submetas.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <ul className="divide-y divide-line" aria-label="Submetas">
        {rows.slice(0, MAX).map(([it, depth]) => {
          const done = it.status === "Hecha";
          return (
            <li key={it.id} className="px-3 py-2" data-testid="goal-item">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]" style={{ paddingLeft: depth * 16 }}>
                {done ? <CheckCircle2 size={14} className="flex-none text-mint" aria-label="Hecha" /> : <Circle size={14} className="flex-none text-faint" aria-label="Pendiente" />}
                <span className={cn("min-w-0 flex-1 basis-40", done ? "text-faint line-through" : "text-text")}>
                  {it.is_priority ? "⭐ " : ""}
                  {it.name}
                </span>
                {it.category && <Chip colour={catColour(it.category)}>{it.category}</Chip>}
                {it.status === "En curso" && <Chip colour="var(--nv-info)">En curso</Chip>}
                {it.due && <span className={cn("text-[11px]", it.late ? "text-danger" : "text-faint")}>{it.late ? "vencida · " : "vence "}{shortDate(it.due)}</span>}
                <span className="flex items-center gap-1.5">
                  <BlockProgress value={it.progress} colour={colour} blocks={6} />
                  <span className="w-8 text-right text-[11px] text-dim">{Math.round(it.progress * 100)} %</span>
                </span>
              </div>
              {it.topic_progress?.links.map((l) => (
                <div key={l.link} className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px]" style={{ paddingLeft: depth * 16 + 22 }}>
                  <span className="text-dim">📚 {l.title}</span>
                  {l.broken ? (
                    <Chip colour="var(--nv-danger)">enlace roto</Chip>
                  ) : (
                    <>
                      <Chip colour={l.done ? "var(--nv-mint)" : "#7c5af0"}>{l.pct} %</Chip>
                      <button type="button" onClick={() => void openTopic(l.topic)} className="ml-auto text-accent-text hover:underline">
                        ver tema
                      </button>
                    </>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {rows.length > MAX && <p className="border-t border-line px-3 py-1.5 text-[11.5px] text-faint">y {rows.length - MAX} más…</p>}
    </div>
  );
}

function DraftCard({ draft }: { draft: MentorGoalDraft }) {
  const creating = useMentor((s) => s.creating);
  const createGoal = useMentor((s) => s.createGoal);
  const discard = useMentor((s) => s.discard);
  const s = draft.schedule;
  const byFolder = new Map(draft.topics.map((t) => [t.folder, t]));
  return (
    <section
      className="rounded-xl border border-line bg-card p-4"
      style={{ borderTop: "3px solid var(--nv-warn)" }}
      data-testid="goal-draft"
      aria-label={`Borrador de meta ${draft.name}`}
    >
      <div className="space-y-3">
        <div>
          <div className="flex flex-wrap items-start gap-2.5">
            <span className="text-[20px] leading-none">🎯</span>
            <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{draft.name}</h3>
            <Chip colour="var(--nv-warn)">Borrador</Chip>
          </div>
          <p className="mt-1 text-[11.5px] text-faint">
            {dayText(s.start)} → {dayText(s.end)} · {s.weeks} semanas · {s.hoursPerWeek} h/semana · {hm(s.totalMinutes)} de estudio estimadas
          </p>
          {draft.description && <p className="mt-1.5 whitespace-pre-line text-[12.5px] text-dim">{draft.description}</p>}
        </div>

        {s.warnings.map((w) => (
          <div key={w} role="status" className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-dim">
            <CircleAlert size={14} className="mt-0.5 flex-none text-warn" /> <span>{w}</span>
          </div>
        ))}
        {draft.discarded.length > 0 && (
          <p className="text-[12px] text-faint">Descartados por no existir en tu sistema de notas: {draft.discarded.join(", ")}.</p>
        )}

        <ol className="overflow-hidden rounded-lg border border-line divide-y divide-line" aria-label="Calendario por semanas">
          {s.items.map((it) => (
            <li key={it.name + it.due} className="px-3 py-2" data-testid="draft-item">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                <Chip>{it.weekFrom === it.weekTo ? `Semana ${it.weekFrom}` : `Semanas ${it.weekFrom}–${it.weekTo}`}</Chip>
                <span className="min-w-0 flex-1 basis-40 font-medium">{it.name}</span>
                <span className="text-[11.5px] text-faint">{hm(it.minutes)}</span>
                <span className="text-[11.5px] text-faint">vence {shortDate(it.due)}</span>
              </div>
              {it.folders.map((f) => {
                const t = byFolder.get(f);
                return (
                  <p key={f} className="mt-1 pl-1 text-[11.5px] text-dim">
                    📚 {t?.title ?? f}
                    {t?.skills.length ? ` (${t.skills.join(", ")})` : ""}
                    {t?.why ? ` — ${t.why}` : ""}
                  </p>
                );
              })}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton onClick={() => void createGoal()} disabled={creating}>
            <Check size={14} /> Crear meta
          </PrimaryButton>
          <GhostButton onClick={() => void discard()} danger>
            <Trash2 size={13} /> Descartar
          </GhostButton>
          <span className="min-w-0 basis-52 flex-1 text-[11.5px] text-faint">Hasta que la crees no se escribe nada. Para ajustarla, díselo al Mentor en el asistente.</span>
        </div>
      </div>
    </section>
  );
}

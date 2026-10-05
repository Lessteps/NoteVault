// Mentor — Metas: PREVISUALIZACIÓN de las metas en desarrollo y del borrador que se conversa en el Chat.
//
// Aquí no se edita nada: las metas solo se editan en el módulo Metas (botón "Abrir en Metas"). Lo único
// que escribe es "Crear meta" del borrador, que ejecuta código determinista (`mentor_goal_create`).

import { Check, CircleAlert, ExternalLink, Target, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { GoalCard, MentorGoalDraft, MentorGoalItemSlim } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { useMentor } from "../../store/mentor";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { Panel } from "../common/StatTile";
import { openTopic } from "./openTopic";
import { dayText, daysLeftText, hm, LoadState, PanelPage, useMentorPanels } from "./parts";

export async function openGoalInMetas(id: string): Promise<void> {
  await useGoals.getState().open(id);
  useApp.getState().setModule("metas");
}

export function MentorGoals() {
  const { panels, warming, error, reload } = useMentorPanels();
  const turns = useMentor((s) => s.turns);
  const pending = useMentor((s) => s.pending);
  const chatLoaded = useMentor((s) => s.chatLoaded);
  const loadChat = useMentor((s) => s.loadChat);
  const createdId = useMentor((s) => s.createdGoalId);
  const draftTurn = turns.find((t) => t.id === pending && t.draft);

  // el borrador vive en la conversación guardada: se carga aquí también si el panel se abre primero
  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);

  const areaName = (id: string) => panels?.areas.find((a) => a.id === id)?.name ?? "";

  return (
    <PanelPage title="Mentor — Metas" subtitle="Previsualización de tus metas en desarrollo. Se editan en el módulo Metas." wide>
      <LoadState warming={warming} error={error} empty={!panels} onRetry={() => void reload()} />

      {draftTurn?.draft && <DraftCard draft={draftTurn.draft} />}

      {panels && panels.goals.length === 0 && !draftTurn && (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-[12.5px] text-faint">
          No tienes metas activas. Cuéntale al Mentor qué quieres lograr en la pestaña «Conversación» y la creáis juntos.
        </p>
      )}

      {panels && (
        <div className="grid gap-4 @3xl:grid-cols-2">
          {panels.goals.map(({ card, items }) => (
            <GoalPreview key={card.id} card={card} items={items} area={areaName(card.area)} fresh={card.id === createdId} />
          ))}
        </div>
      )}
    </PanelPage>
  );
}

function GoalPreview({ card, items, area, fresh }: { card: GoalCard; items: MentorGoalItemSlim[]; area: string; fresh: boolean }) {
  const roots = items.filter((i) => !i.parent);
  const shown = roots.slice(0, 8);
  const left = card.days_left;
  return (
    <section className="rounded-xl border border-line bg-card p-4" data-testid="goal-card" aria-label={`Meta ${card.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Target size={15} className="flex-none text-accent-text" />
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{card.name}</h3>
        {fresh && <Chip colour="var(--nv-mint)">Recién creada</Chip>}
        {area && <Chip>{area}</Chip>}
      </div>
      <p className="mt-1 text-[12px] text-faint">
        {card.start ? `${dayText(card.start)} → ` : ""}
        {card.end ? dayText(card.end) : "sin fecha final"}
        {left !== null && left !== undefined ? ` · ${daysLeftText(left)}` : ""}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <BlockProgress value={card.progress} colour={card.colour || "var(--nv-accent)"} blocks={20} />
        <span className="text-[12px] text-dim">{Math.round(card.progress * 100)} %</span>
        <span className="text-[12px] text-faint">· {card.counts[0]}/{card.counts[1]} submetas</span>
      </div>

      {shown.length > 0 && (
        <ul className="mt-3 space-y-2">
          {shown.map((it) => (
            <li key={it.id} className="rounded-lg border border-line px-2.5 py-2" data-testid="goal-item">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className={it.status === "done" ? "text-faint line-through" : "text-text"}>{it.name}</span>
                {it.due && <span className={it.late ? "text-danger" : "text-faint"}>vence {dayText(it.due)}</span>}
                <span className="ml-auto text-[11.5px] text-faint">{Math.round(it.progress * 100)} %</span>
              </div>
              {it.topic_progress?.links.map((l) => (
                <div key={l.link} className="mt-1 flex items-center gap-2 text-[11.5px]">
                  <span className="text-dim">📚 {l.title}</span>
                  {l.broken ? <Chip colour="var(--nv-danger)">enlace roto</Chip> : <span className="text-faint">{l.pct} %</span>}
                  {!l.broken && (
                    <button type="button" onClick={() => void openTopic(l.topic)} className="ml-auto text-accent-text hover:underline">
                      ver tema
                    </button>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      {roots.length > shown.length && <p className="mt-2 text-[11.5px] text-faint">y {roots.length - shown.length} submetas más…</p>}

      <div className="mt-3">
        <GhostButton onClick={() => void openGoalInMetas(card.id)}>
          <ExternalLink size={13} /> Abrir en Metas
        </GhostButton>
      </div>
    </section>
  );
}

function DraftCard({ draft }: { draft: MentorGoalDraft }) {
  const creating = useMentor((s) => s.creating);
  const createGoal = useMentor((s) => s.createGoal);
  const discard = useMentor((s) => s.discard);
  const s = draft.schedule;
  const byFolder = new Map(draft.topics.map((t) => [t.folder, t]));
  return (
    <Panel title="Borrador de meta" action={<Chip colour="var(--nv-warn)">Borrador</Chip>}>
      <div data-testid="goal-draft" className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold">{draft.name}</h3>
          <p className="text-[12px] text-faint">
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

        <ol className="space-y-1.5" aria-label="Calendario por semanas">
          {s.items.map((it) => (
            <li key={it.name + it.due} className="rounded-lg border border-line px-3 py-2" data-testid="draft-item">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <Chip>{it.weekFrom === it.weekTo ? `Semana ${it.weekFrom}` : `Semanas ${it.weekFrom}–${it.weekTo}`}</Chip>
                <span className="font-medium">{it.name}</span>
                <span className="text-faint">{hm(it.minutes)}</span>
                <span className="ml-auto text-faint">vence {dayText(it.due)}</span>
              </div>
              {it.folders.map((f) => {
                const t = byFolder.get(f);
                return (
                  <p key={f} className="mt-1 text-[11.5px] text-dim">
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
          <span className="text-[12px] text-faint">Hasta que la crees no se escribe nada. Para ajustarla, díselo al Mentor en la conversación.</span>
        </div>
      </div>
    </Panel>
  );
}

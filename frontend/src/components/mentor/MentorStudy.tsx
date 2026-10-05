// Mentor — Notas / Estudio: resumen de temas en texto compacto (a medias, sin tratar, recientes,
// repasos vencidos, errores) con enlace "ver tema". No repite los anillos del Resumen de estudio.

import type { MentorTopicRow } from "../../lib/types";
import { BlockProgress } from "../common/charts";
import { Chip } from "../common/forms";
import { Panel } from "../common/StatTile";
import { openTopic } from "./openTopic";
import { LoadState, PanelPage, useMentorPanels } from "./parts";

function TopicList({ rows, empty }: { rows: MentorTopicRow[]; empty: string }) {
  if (!rows.length) return <p className="text-[12.5px] text-faint">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((t) => (
        <li key={t.folder} className="py-2" data-testid="topic-row">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text" title={t.title}>{t.title}</span>
            <Chip>{t.subject}</Chip>
            <button type="button" onClick={() => void openTopic(t.folder)} className="flex-none text-[12px] text-accent-text hover:underline">
              ver tema
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-faint">
            <BlockProgress value={t.completenessPct / 100} colour="var(--nv-accent)" blocks={8} />
            <span className="whitespace-nowrap text-dim">{t.completenessPct} %</span>
            {t.pendingSkills.length > 0 && <span className="min-w-0 break-words">pendiente: {t.pendingSkills.join(", ")}</span>}
            {t.lastAttemptDays !== null && <span className="whitespace-nowrap">último intento {t.lastAttemptDays === 0 ? "hoy" : `hace ${t.lastAttemptDays} d`}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MentorStudy() {
  const { panels, warming, error, reload } = useMentorPanels();
  const s = panels?.study;
  return (
    <PanelPage title="Mentor — Notas y estudio" subtitle="Dónde estás en tus temas. El detalle con anillos está en el Resumen de estudio." wide>
      <LoadState warming={warming} error={error} empty={!panels} onRetry={() => void reload()} />
      {s && (
        <>
          <p className="text-[13px] text-dim" data-testid="study-summary">
            {s.topics.total} temas: {s.topics.inProgress} a medias, {s.topics.untreated} sin tratar, {s.topics.complete} completos.
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @3xl:grid-cols-2">
            <Panel title="A medias">
              <TopicList rows={s.topics.inProgressList} empty="Ningún tema a medias." />
            </Panel>
            <Panel title="Sin tratar">
              <TopicList rows={s.topics.untreatedList} empty="Todo el material tiene al menos un intento." />
            </Panel>
            <Panel title="Recientes (7 días)">
              <TopicList rows={s.topics.recentList} empty="Sin actividad en la última semana." />
            </Panel>
            <Panel title="Repasos y errores">
              <div className="space-y-3 text-[12.5px]">
                <div>
                  <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Repasos vencidos</h4>
                  {s.srs.dueTotal === 0 ? (
                    <p className="text-faint">No tienes repasos vencidos.</p>
                  ) : (
                    <ul className="space-y-0.5 text-dim">
                      <li>{s.srs.dueTotal} en total.</li>
                      {s.srs.bySubject.slice(0, 5).map((r) => (
                        <li key={r.subject}>
                          {r.subject}: {r.count} (el más antiguo, {r.oldestOverdueDays} d de retraso)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Errores sin resolver</h4>
                  {s.errors.unresolved === 0 ? (
                    <p className="text-faint">Sin errores pendientes.</p>
                  ) : (
                    <ul className="space-y-0.5 text-dim">
                      <li>{s.errors.unresolved} en total.</li>
                      {s.errors.repeaters.map((e) => (
                        <li key={e.id}>
                          {e.subject} · {e.topic}
                          {e.skill ? ` (${e.skill})` : ""}: repetido {e.repeatCount} veces
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}
    </PanelPage>
  );
}

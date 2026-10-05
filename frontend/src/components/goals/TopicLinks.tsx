// "Temas de estudio" de una submeta: selector en árbol materia -> área -> tema (y skills
// opcionales) y chips con el avance de cada enlace. Con enlaces la submeta se cumple sola.

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatTopicLink, parseTopicLink } from "../../lib/topicLinks";
import { api } from "../../lib/bridge";
import type { TopicDashboardItem, TopicLinkProgress } from "../../lib/types";
import { cn } from "../ui";

const chip = "rounded-full border px-2 py-0.5 text-[11.5px]";

export function TopicLinks({ value, onChange }: { value: string[]; onChange: (links: string[]) => void }) {
  const [topics, setTopics] = useState<TopicDashboardItem[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<TopicLinkProgress | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api.studyTopicDashboard().then((d) => {
        if (!alive) return;
        if (d.loading) timer = setTimeout(load, 1500); // el índice aún se calienta
        else setTopics(d.topics);
      }).catch(() => alive && setTopics([]));
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const key = value.join("\n");
  useEffect(() => {
    let alive = true;
    if (!value.length) { setProgress(null); return; }
    api.goalsTopicLinksProgress(value).then((p) => alive && setProgress(p)).catch(() => alive && setProgress(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // materia -> área -> temas
  const tree = useMemo(() => {
    const out = new Map<string, Map<string, TopicDashboardItem[]>>();
    for (const t of topics) {
      const areas = out.get(t.subject) ?? new Map<string, TopicDashboardItem[]>();
      areas.set(t.area, [...(areas.get(t.area) ?? []), t]);
      out.set(t.subject, areas);
    }
    return out;
  }, [topics]);

  const linkOf = (folder: string) => value.find((v) => parseTopicLink(v)?.topic === folder);
  const replace = (folder: string, next: string | null) => {
    const rest = value.filter((v) => parseTopicLink(v)?.topic !== folder);
    onChange(next ? [...rest, next] : rest);
  };
  const toggleTopic = (t: TopicDashboardItem) =>
    replace(t.folder, linkOf(t.folder) ? null : formatTopicLink({ topic: t.folder, skills: [] }));
  const toggleSkill = (t: TopicDashboardItem, skill: string) => {
    const cur = parseTopicLink(linkOf(t.folder));
    const all = t.manifest.skills;
    const set = new Set(cur ? (cur.skills.length ? cur.skills : all) : []);
    if (set.has(skill)) set.delete(skill); else set.add(skill);
    const picked = all.filter((s) => set.has(s));
    replace(t.folder, picked.length ? formatTopicLink({ topic: t.folder, skills: picked.length === all.length ? [] : picked }) : null);
  };
  const fold = (k: string) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => {
          const p = progress?.links.find((l) => l.link === v) ?? progress?.links[i];
          const parsed = parseTopicLink(v);
          const label = p?.title ?? parsed?.topic.split("/").pop() ?? v;
          return (
            <span key={v} className={cn(chip, "flex items-center gap-1", p?.broken ? "border-[#e5484d] text-[#e5484d]" : p?.done ? "border-[var(--nv-mint)] text-text" : "border-[#7c5af0] bg-[#7c5af0]/20 text-text")}
              title={p?.broken ? "El tema ya no existe (enlace roto)" : parsed?.skills.length ? `Skills: ${parsed.skills.join(", ")}` : "Todas las skills del tema"}>
              {label}{parsed?.skills.length ? ` · ${parsed.skills.length} skills` : ""}
              <span className="font-mono text-[10.5px] text-dim">{p ? (p.broken ? "roto" : `${p.pct}%`) : ""}</span>
              <button type="button" aria-label={`Quitar ${label}`} onClick={() => onChange(value.filter((x) => x !== v))}><X size={11} /></button>
            </span>
          );
        })}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(chip, "border-line text-dim hover:bg-hover")}>
          {open ? "Cerrar" : "＋ Enlazar tema"}
        </button>
        {!value.length && !open && <span className="text-[11.5px] text-faint">Sin temas enlazados.</span>}
      </div>
      {open && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-card p-2 text-[12px]">
          {!tree.size && <span className="text-faint">No hay temas de estudio.</span>}
          {[...tree].map(([subject, areas]) => (
            <div key={subject}>
              <div className="px-1 py-0.5 font-mono text-[10px] uppercase text-faint">{subject}</div>
              {[...areas].map(([area, list]) => {
                const ak = `${subject}/${area}`;
                const isOpen = expanded.has(ak);
                return (
                  <div key={ak} className="ml-2">
                    <button type="button" onClick={() => fold(ak)} className="flex w-full items-center gap-1 py-0.5 text-left text-dim hover:text-text">
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{area}
                      <span className="text-faint">({list.filter((t) => linkOf(t.folder)).length}/{list.length})</span>
                    </button>
                    {isOpen && list.map((t) => {
                      const link = parseTopicLink(linkOf(t.folder));
                      return (
                        <div key={t.folder} className="ml-4">
                          <label className="flex items-center gap-1.5 py-0.5">
                            <input type="checkbox" checked={Boolean(link)} onChange={() => toggleTopic(t)} />
                            <span className="truncate text-text">{t.manifest.title}</span>
                            <span className="ml-auto font-mono text-[10.5px] text-faint">{t.progress.completenessPct}%</span>
                          </label>
                          {link && (
                            <div className="ml-5 flex flex-wrap gap-x-3 gap-y-0.5 pb-1">
                              {t.manifest.skills.map((s) => (
                                <label key={s} className="flex items-center gap-1 text-dim">
                                  <input type="checkbox" checked={!link.skills.length || link.skills.includes(s)} onChange={() => toggleSkill(t, s)} />
                                  {t.progress.skills[s]?.label ?? s}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

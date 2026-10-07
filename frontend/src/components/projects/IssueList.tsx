// Lista: the issue tree with sorting; children indented under their parent.

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import type { Issue } from "../../lib/types";
import { issueById, useProjects } from "../../store/projects";
import { inputBase } from "../common/forms";
import { StatusSelect } from "../tasks/controls";
import { cn, IconButton } from "../ui";
import { DueChip, PriorityMark } from "./IssueBits";

const SORTS: Array<[string, string]> = [["manual", "Orden manual"], ["number", "Clave"], ["priority", "Prioridad"], ["due", "Fecha"], ["status", "Estado"]];

export function IssueList() {
  const detail = useProjects((s) => s.detail)!;
  const openIssue = useProjects((s) => s.openIssue);
  const issueId = useProjects((s) => s.issueId);
  const setCreating = useProjects((s) => s.setCreating);
  const moveIssue = useProjects((s) => s.moveIssue);
  const [sort, setSort] = useState("manual");
  const [hideDone, setHideDone] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const p = detail.project;

  const cmp = (a: Issue, b: Issue) => {
    if (sort === "number") return a.number - b.number;
    if (sort === "priority") return b.priority - a.priority || a.number - b.number;
    if (sort === "due") return (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.number - b.number;
    if (sort === "status") return p.columns.indexOf(a.status) - p.columns.indexOf(b.status) || a.number - b.number;
    return a.order - b.order || a.number - b.number;
  };
  const rows: Array<[Issue, number]> = [];
  const walk = (list: Issue[], depth: number) => {
    for (const i of [...list].sort(cmp)) {
      if (hideDone && i.done) continue;
      rows.push([i, depth]);
      if (!closed.has(i.id)) walk(i.children.map((c) => issueById(detail, c)).filter((x): x is Issue => Boolean(x)), depth + 1);
    }
  };
  walk(detail.issues.filter((i) => !i.parent), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 px-5 py-2.5">
        <select className={cn(inputBase, "py-1 text-[12px]")} value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>Ordenar: {l}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-dim">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ocultar hechas
        </label>
        <span className="ml-auto text-[11.5px] text-faint">{detail.issues.length} issues</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {rows.map(([i, depth]) => (
            <div key={i.id} className={cn("group flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-hover", issueId === i.id && "bg-accent-soft")}>
              <span style={{ width: depth * 18 }} className="flex-none" />
              {i.children.length ? (
                <button type="button" aria-label="Plegar" className="text-faint"
                  onClick={() => { const n = new Set(closed); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); setClosed(n); }}>
                  {closed.has(i.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : <span className="w-[13px]" />}
              <input type="checkbox" checked={i.done} aria-label={`Hecha: ${i.title}`} className="accent-[var(--nv-mint)]"
                onChange={(e) => void moveIssue(i.id, e.target.checked ? p.done_column : p.columns[0]!, 10 ** 6)} />
              <span className="text-[12px]" style={{ color: i.type_colour }} title={i.type}>{i.icon}</span>
              <span className="w-16 flex-none font-mono text-[11px] text-faint">{i.key}</span>
              <button type="button" onClick={() => openIssue(i.id)} className={cn("min-w-0 flex-1 truncate text-left text-[13px]", i.done ? "text-faint line-through" : "text-text")}>
                {i.title}
              </button>
              <DueChip issue={i} />
              <PriorityMark p={i.priority} />
              <StatusSelect value={i.status} statuses={p.columns} onChange={(v) => void moveIssue(i.id, v, 10 ** 6)} />
              {i.type !== "Subtarea" && (
                <IconButton title="Crear hija" className="opacity-0 group-hover:opacity-100" onClick={() => setCreating({ parent: i.id })}><Plus size={13} /></IconButton>
              )}
            </div>
          ))}
          {!rows.length && <div className="p-6 text-center text-[13px] text-faint">Sin issues todavía. Crea uno con «Crear issue» (atajo: C).</div>}
        </div>
      </div>
    </div>
  );
}

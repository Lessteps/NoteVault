import type { Issue } from "../../lib/types";
import { shortDate } from "../../lib/tasks";
import { Chip, PRIORITY_COLOURS, PRIORITY_GLYPHS, PRIORITY_NAMES } from "../common/forms";

export function PriorityMark({ p }: { p: number }) {
  return <span title={PRIORITY_NAMES[p]} className="font-mono text-[12px]" style={{ color: PRIORITY_COLOURS[p] }}>{PRIORITY_GLYPHS[p]}</span>;
}

export function DueChip({ issue }: { issue: Issue }) {
  if (!issue.due) return null;
  return <Chip colour={issue.overdue ? "var(--nv-danger)" : "var(--nv-dim)"}>⏰ {shortDate(issue.due)}{issue.due_time ? ` ${issue.due_time}` : ""}{issue.repeat ? " ↻" : ""}</Chip>;
}

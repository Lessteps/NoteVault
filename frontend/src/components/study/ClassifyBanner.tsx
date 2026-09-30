// An English topic has no default branch. When one is not classified (it is outside a branch folder and
// its practice file has no `branch:`), this banner says so and lets the user resolve it explicitly.

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { ENGLISH_BRANCHES } from "../../lib/englishSkillData";
import { useApp } from "../../store/app";
import { cn } from "../ui";

export function ClassifyBanner({ folder, subject, onResolved }: { folder?: string; subject?: string; onResolved: () => void }) {
  const toast = useApp((s) => s.toast);
  const english = /^(english|ingl[eé]s)$/i.test(subject ?? "");
  const [state, setState] = useState<{ reason: string; suggestion: string | null } | null>(null);

  const check = useCallback(async () => {
    if (!folder || !english) {
      setState(null);
      return;
    }
    try {
      const r = await api.studyTopicClassification(folder);
      setState(r.ok ? null : { reason: r.reason ?? "", suggestion: r.suggestion ?? null });
    } catch {
      setState(null);
    }
  }, [folder, english]);

  useEffect(() => {
    void check();
  }, [check]);

  if (!state) return null;

  const choose = async (branch: string) => {
    try {
      await api.studyTopicClassify(folder!, branch);
      toast("info", "Tema clasificado.");
      setState(null);
      onResolved();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div role="alert" className="flex flex-none flex-wrap items-center gap-2 border-b border-warn/30 bg-warn-soft px-5 py-2 text-[12px] text-text">
      <AlertTriangle size={14} className="flex-none text-warn" />
      <span className="min-w-0 flex-1">{state.reason} Elige su rama:</span>
      {ENGLISH_BRANCHES.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => void choose(b.id)}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-[12px] font-semibold hover:border-accent",
            state.suggestion === b.id ? "border-accent bg-accent text-white" : "border-line bg-panel text-text",
          )}
          title={state.suggestion === b.id ? "Sugerida por el nombre del tema (no se aplica sola)" : undefined}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

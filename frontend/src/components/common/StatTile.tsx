import type { ReactNode } from "react";

export function StatTile({ value, label, colour, hint }: { value: ReactNode; label: string; colour?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3" title={hint}>
      <div className="text-[22px] font-semibold leading-tight" style={{ color: colour ?? "var(--nv-text)" }}>{value}</div>
      <div className="mt-0.5 text-[11.5px] text-faint">{label}</div>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-text">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

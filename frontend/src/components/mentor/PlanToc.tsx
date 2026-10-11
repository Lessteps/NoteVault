// Mentor — Plan: tabla de contenido a la derecha (como en Notion) y el aviso general de lo que falta generar.
//
// La pestaña «Mi plan» es larga: se divide en secciones con un ancla cada una y esta tabla deja saltar a cualquiera, resaltando la que se está
// leyendo. En pantallas estrechas desaparece (las secciones siguen ahí, en orden).

import { ArrowDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../ui";
import { GhostButton } from "../common/forms";

export interface TocItem {
  id: string;
  label: string;
  /** dato corto a la derecha (un número, «falta») */
  hint?: string;
}

/** Salta a una sección (respeta el `scroll-padding` del contenedor, que deja libre la barra de pestañas). */
export function goToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.focus?.({ preventScroll: true });
}

export function PlanToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Number.POSITIVE_INFINITY);
        const visible = items.map((i) => ({ id: i.id, top: seen.get(i.id) ?? Number.POSITIVE_INFINITY })).filter((x) => Number.isFinite(x.top));
        if (visible.length) setActive(visible.sort((a, b) => a.top - b.top)[0]!.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);
  return (
    <nav aria-label="Contenido de esta pestaña" data-testid="plan-toc" className="text-[14px]">
      <p className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-wider text-faint">En esta página</p>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => { setActive(i.id); goToSection(i.id); }}
              aria-current={active === i.id ? "location" : undefined}
              className={cn(
                "-ml-px flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left transition-colors",
                active === i.id ? "border-accent font-semibold text-text" : "border-transparent text-dim hover:border-line hover:text-text",
              )}
              data-testid={`toc-${i.id}`}
            >
              <span className="min-w-0 flex-1 truncate">{i.label}</span>
              {i.hint && <span className="flex-none rounded-md bg-hover px-1.5 text-[12px] text-dim">{i.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** El contenido con su tabla de contenido sticky a la derecha (solo en anchos grandes). */
export function TocLayout({ items, children }: { items: TocItem[]; children: ReactNode }) {
  return (
    <div className="@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_13.5rem] @5xl:items-start @5xl:gap-8">
      <div className="min-w-0 space-y-6">{children}</div>
      <aside className="sticky top-20 hidden self-start @5xl:block" aria-label="Navegación del plan">
        <PlanToc items={items} />
      </aside>
    </div>
  );
}

/** Aviso general, arriba del todo: lo que todavía no existe y cómo generarlo. */
export function GenerateNotice({ topics, withPractice, withTheory, designPct }: { topics: number; withPractice: number; withTheory: number; designPct?: number }) {
  const missing = Math.max(0, topics - withPractice);
  const theoryMissing = Math.max(0, topics - withTheory);
  if (!missing && !theoryMissing) return null;
  return (
    <section aria-labelledby="gen-title" data-testid="generate-notice" className="rounded-2xl border-2 border-accent/60 bg-card p-4 @3xl:p-5">
      <h2 id="gen-title" className="text-[18px] font-semibold">Falta generar contenido</h2>
      <p className="mt-1 text-[14.5px] text-dim">
        El plan ya está armado, pero los archivos de práctica de sus temas todavía no existen en tu vault.{" "}
        {missing > 0 && <><strong className="text-text">{missing} de {topics} temas</strong> no tienen ejercicios.{" "}</>}
        {theoryMissing > 0 && <><strong className="text-text">{theoryMissing}</strong> no tienen teoría.{" "}</>}
        {designPct !== undefined && <>Diseño de los temas: {designPct} %. </>}
        Se crean con «Ejecutar plan»: primero muestra el informe exacto de lo que va a crear y no escribe nada hasta que confirmes.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GhostButton large onClick={() => goToSection("sec-ejecutar")} data-testid="generate-go">
          <ArrowDown size={16} aria-hidden /> Ir a «Ejecutar plan»
        </GhostButton>
        <span className="text-[13.5px] text-faint">La práctica diaria por área (katas) es otra capa y ya está creada.</span>
      </div>
    </section>
  );
}

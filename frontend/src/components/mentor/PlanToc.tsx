// Mentor — Plan: tabla de contenido a la derecha (como en Notion) y el aviso general de lo que falta generar.
//
// La pestaña «Mi plan» es larga: se divide en secciones con un ancla cada una y esta tabla deja saltar a cualquiera, resaltando la que se está
// leyendo. En pantallas estrechas desaparece (las secciones siguen ahí, en orden).
//
// La sección activa se calcula con la posición de cada ancla respecto a una línea bajo la barra de pestañas (no con «lo que se ve»): es la
// última sección cuyo inicio ya pasó esa línea; al llegar al final de la página es la última. Al pulsar una entrada, la elegida manda mientras
// dura el desplazamiento suave (si no, el cálculo la cambiaba a mitad de camino).

import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui";
import { GhostButton } from "../common/forms";

export interface TocItem {
  id: string;
  label: string;
  /** dato corto a la derecha (un número, «falta») */
  hint?: string;
}

/** La línea (px bajo el borde superior del contenedor con scroll) a partir de la cual una sección cuenta como «la que se lee». */
const READ_LINE = 140;
const CLICK_LOCK_MS = 900;

/** Salta a una sección (respeta el `scroll-padding` del contenedor, que deja libre la barra de pestañas). */
export function goToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.focus?.({ preventScroll: true });
}

/** El ancestro que hace scroll de verdad (la sub-interfaz del plan), o null si es la ventana. */
export function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** La sección activa para una posición de scroll: pura, para poder probarla sin navegador. */
export function activeSection(tops: ReadonlyArray<{ id: string; top: number }>, line: number, atBottom: boolean): string {
  if (!tops.length) return "";
  if (atBottom) return tops[tops.length - 1]!.id;
  let current = tops[0]!.id;
  for (const t of tops) if (t.top <= line) current = t.id;
  return current;
}

export function PlanToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const lockUntil = useRef(0);
  const key = items.map((i) => i.id).join("|");

  const compute = useCallback(() => {
    if (Date.now() < lockUntil.current) return;
    const ids = key.split("|").filter(Boolean);
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const sc = scrollParentOf(els[0]!);
    const base = sc ? sc.getBoundingClientRect().top : 0;
    const atBottom = !!sc && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
    setActive(activeSection(els.map((e) => ({ id: e.id, top: e.getBoundingClientRect().top - base })), READ_LINE, atBottom));
  }, [key]);

  useEffect(() => {
    const first = document.getElementById(key.split("|")[0] ?? "");
    const sc = scrollParentOf(first);
    let raf = 0;
    const onScroll = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    const target: HTMLElement | Window = sc ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();
    // el contenido de las secciones carga después (cobertura, ejecución): se recalcula cuando cambia el alto
    const ro = typeof ResizeObserver !== "undefined" && sc ? new ResizeObserver(onScroll) : null;
    if (ro && sc) for (const c of Array.from(sc.children)) ro.observe(c);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
    };
  }, [key, compute]);

  const go = (id: string): void => {
    lockUntil.current = Date.now() + CLICK_LOCK_MS;
    setActive(id);
    goToSection(id);
    // pasado el desplazamiento suave, vuelve a mandar la posición real
    setTimeout(compute, CLICK_LOCK_MS + 50);
  };

  return (
    <nav aria-label="Contenido de esta pestaña" data-testid="plan-toc" className="text-[14px]">
      <p className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-wider text-faint">En esta página</p>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => go(i.id)}
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

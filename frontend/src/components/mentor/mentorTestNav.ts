// Apoyo para las pruebas del Mentor (no es una prueba): cómo llegar, con la barra lateral de Planeación y las pestañas de las páginas del plan,
// a lo que antes eran los ítems «Mi plan › sub-vista» y «Agenda › Día · Semana · Mes · Calendario».
//
//  · `navTab(host, "plan" | "agenda" | "entregables"…)` — el ítem de la barra: «Mi plan» y «Agenda» son ahora la Vista general.
//  · `navView(host, "semana" | "mes" | "calendario" | "dia")` — el control Semana|Mes, la pestaña Calendario o el «Ver día» de la fecha mirada.
//  · `gotoSection(host, id, click)` — la sub-vista: Resumen/Datos/Alcance → pestaña «Detalles» · Temas/Catálogo/Áreas → «Por área» ·
//    Registros y Preparar (y ejecutar/cobertura/antigravity) → su ítem de «Más» · «fases» → Vista general, Mes.

const q = (host: ParentNode, sel: string): HTMLElement | null => host.querySelector<HTMLElement>(sel);

export const pageTabButton = (host: ParentNode, id: string): HTMLElement | null => q(host, `#page-tabs-tab-${id}`);

export function navTab(host: ParentNode, id: string): HTMLElement {
  const real = id === "plan" || id === "agenda" ? "general" : id;
  return q(host, `[data-testid='nav-pl:${real}']`)!;
}

export function navView(host: ParentNode, id: string): HTMLElement {
  if (id === "semana" || id === "mes") return q(host, `[data-testid=agenda-period-${id}]`)!;
  if (id === "calendario") return pageTabButton(host, "calendario")!;
  const date = (q(host, "[data-testid=agenda-date]") as HTMLInputElement | null)?.value ?? "";
  return q(host, `[data-testid=agenda-week-day][data-date='${date}'] button`)!;
}

export async function gotoSection(host: ParentNode, id: string, click: (el: any) => Promise<unknown>): Promise<void> {
  if (id === "fases") {
    await click(navTab(host, "general"));
    await click(navView(host, "mes"));
    return;
  }
  if (id === "registros" || id === "preparar" || id === "ejecutar" || id === "cobertura" || id === "antigravity") {
    await click(q(host, `[data-testid='nav-pl:${id === "registros" ? "registros" : "preparar"}']`));
    if (id === "ejecutar" || id === "cobertura" || id === "antigravity") {
      const t = q(host, `[data-testid=prepare-${id}]`);
      if (t) await click(t);
    }
    return;
  }
  await click(navTab(host, "general"));
  const tab = id === "temas" || id === "catalogo" || id === "areas" ? "area" : "detalles";
  await click(pageTabButton(host, tab));
  if (id === "areas") host.querySelector("[data-testid=plan-areas-detail]")?.setAttribute("open", "");
}

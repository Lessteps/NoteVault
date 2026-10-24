// Abrir la vista de una carpeta SIN escribir en la vault: `study_view_ensure` es solo lectura por defecto. Si la vista no existe, se pregunta a la
// persona («Crear vista de práctica») y solo entonces se crea (y se avisa de cuántos archivos se crearon).

import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";

type ViewResult = Awaited<ReturnType<typeof api.studyViewEnsure>>;

/**
 * Devuelve la vista existente de la carpeta/tema, o la crea tras pedir permiso (`ask`). Con `ask = false` (p. ej. un clic en una carpeta del
 * explorador) nunca pregunta ni escribe: devuelve `null` si no hay vista.
 */
export async function viewWithConsent(folder: string, ask = true): Promise<ViewResult | null> {
  const r = await api.studyViewEnsure(folder);
  if (r.ok && r.path) return r;
  if (!r.missing || !ask) return null;
  const name = r.path.split("/").pop() ?? r.path;
  if (typeof window === "undefined" || !window.confirm(`Esta carpeta aún no tiene su vista («${name}»).\n\n¿Crear la vista de práctica? Se añadirá ese archivo a tu vault (no sobrescribe nada).`)) return null;
  const made = await api.studyViewEnsure(folder, true);
  if (made.created.length) useApp.getState().toast("info", `Se ${made.created.length === 1 ? "creó 1 archivo" : `crearon ${made.created.length} archivos`}: ${made.created.map((c) => c.split("/").pop()).join(", ")}`);
  return made.ok && made.path ? made : null;
}

// "Ver tema": abre la vista de práctica de la carpeta del tema en Notas (el Mentor no edita nada).

import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";

export async function openTopic(folder: string, what = "tema"): Promise<void> {
  const toast = useApp.getState().toast;
  try {
    const r = await api.studyViewEnsure(folder);
    if (r.path) await useApp.getState().openNote(r.path);
    else toast("info", `${what === "área" ? "Esta área" : "Ese tema"} no tiene vista todavía.`);
  } catch (e) {
    toast("error", (e as Error).message);
  }
}

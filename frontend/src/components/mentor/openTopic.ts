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

/** «Abrir apunte»: el .md de teoría del tema (el que se llama igual que su carpeta). La práctica se abre con `openTopic`. */
export async function openTopicNote(folder: string): Promise<void> {
  const { toast, openNote } = useApp.getState();
  const name = folder.split("/").pop() ?? folder;
  const path = `${folder}/${name}.md`;
  try {
    await api.readNote(path);
  } catch {
    toast("info", "Este tema aún no tiene apunte (.md): usa su archivo de práctica.");
    return;
  }
  await openNote(path);
}

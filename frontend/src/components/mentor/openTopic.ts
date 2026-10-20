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

/** «Abrir canvas explicativo»: el mapa `.canvas` de la carpeta del tema (el que se llama igual que ella, si no el primero). */
export async function openTopicCanvas(folder: string): Promise<void> {
  const { toast, openTab } = useApp.getState();
  try {
    const entries = await api.listDir(folder);
    const name = folder.split("/").pop() ?? folder;
    const canvases = entries.filter((e) => e.type === "note" && (e.kind === "canvas" || e.name.toLowerCase().endsWith(".canvas")));
    const pick = canvases.find((e) => e.name.startsWith(name) && !e.name.toLowerCase().includes(".nuevo")) ?? canvases[0];
    if (!pick) {
      toast("info", "Este tema aún no tiene canvas explicativo: se crea al generarlo desde «Ejecutar plan».");
      return;
    }
    openTab({ kind: "canvas", path: pick.path });
  } catch (e) {
    toast("error", (e as Error).message);
  }
}

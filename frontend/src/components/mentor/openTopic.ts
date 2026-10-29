// "Ver tema": abre la vista de práctica de la carpeta del tema en Notas (el Mentor no edita nada).

import { api } from "../../lib/bridge";
import { viewWithConsent } from "../study/ensureView";
import { useApp } from "../../store/app";

export async function openTopic(folder: string, what = "tema"): Promise<void> {
  const toast = useApp.getState().toast;
  try {
    // solo lectura: si no hay vista se pregunta antes de crearla
    const r = await viewWithConsent(folder);
    if (r?.path) {
      await useApp.getState().openNote(r.path);
      return;
    }
    try {
      const resolved = await api.mentorTopicResolve?.({ folder, ensureCanvas: false });
      if (resolved?.practiceNote) {
        await useApp.getState().openNote(resolved.practiceNote);
        return;
      }
      if (resolved?.found && resolved.folder !== folder) {
        const r2 = await viewWithConsent(resolved.folder);
        if (r2?.path) {
          await useApp.getState().openNote(r2.path);
          return;
        }
      }
    } catch {
      // continuar con aviso por defecto
    }
    toast("info", `${what === "área" ? "Esta área" : "Ese tema"} no tiene vista todavía.`);
  } catch (e) {
    try {
      const resolved = await api.mentorTopicResolve?.({ folder, ensureCanvas: false });
      if (resolved?.practiceNote) {
        await useApp.getState().openNote(resolved.practiceNote);
        return;
      }
    } catch {
      // ignorar
    }
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
    await openNote(path);
    return;
  } catch {
    try {
      const resolved = await api.mentorTopicResolve?.({ folder, ensureCanvas: false });
      if (resolved?.theoryNote) {
        await openNote(resolved.theoryNote);
        return;
      }
    } catch {
      // continuar con aviso
    }
    toast("info", "Este tema aún no tiene apunte (.md): usa su archivo de práctica.");
  }
}

/** «Abrir canvas explicativo»: el mapa `.canvas` de la carpeta del tema (resuelve por ID si cambió la estructura de carpetas o lo genera desde su `.md`). */
export async function openTopicCanvas(folder: string): Promise<void> {
  const { toast, openTab } = useApp.getState();
  try {
    let pickPath: string | null = null;
    try {
      const entries = await api.listDir(folder);
      const name = folder.split("/").pop() ?? folder;
      const canvases = entries.filter((e) => e.type === "note" && (e.kind === "canvas" || e.name.toLowerCase().endsWith(".canvas")));
      const pick = canvases.find((e) => e.name.startsWith(name) && !e.name.toLowerCase().includes(".nuevo")) ?? canvases[0];
      if (pick) pickPath = pick.path;
    } catch {
      // La carpeta pudo cambiar de estructura; intentamos resolver por ID de tema
    }
    if (!pickPath) {
      try {
        const resolved = await api.mentorTopicResolve?.({ folder, ensureCanvas: true });
        if (resolved?.canvasFile) {
          pickPath = resolved.canvasFile;
        }
      } catch {
        // continuar con el mensaje informativo
      }
    }
    if (!pickPath) {
      toast("info", "Este tema aún no tiene canvas explicativo: se crea al generarlo desde «Ejecutar plan».");
      return;
    }
    openTab({ kind: "canvas", path: pickPath }, { preview: true });
  } catch (e) {
    toast("error", (e as Error).message);
  }
}

// Progreso de temas de estudio por carpeta, para los `topic_links` de las submetas.
//
// Misma fuente que `study_topic_dashboard` (manifiestos de las notas ya leídas +
// ejercicios + intentos + examen), pero perezoso: solo se calcula el tema que se
// pregunta. El mapa se reutiliza unos segundos porque una sola respuesta de Metas
// consulta el mismo tema muchas veces (progreso, hecha-hoy, conteos...).

import { loadExamRecordForTopic } from "../core/practice/exams.js";
import { loadAllAttempts } from "../core/practice/ledger.js";
import { computeTopicProgress, manifestsFromNotes, type TopicManifest, type TopicProgress } from "../core/practice/topic.js";
import type { TopicLookup } from "../core/practice/topicLinks.js";
import type { AppState } from "./appState.js";
import { vaultScan } from "./vaultScan.js";

const TTL_MS = 3000;

interface Built {
  at: number;
  root: string;
  manifests: Map<string, TopicManifest>;
  progress: Map<string, TopicProgress | null>;
  attempts: Record<string, any> | null;
}

let built: Built | null = null;

function fresh(app: AppState): Built {
  if (built && built.root === app.root && Date.now() - built.at < TTL_MS) return built;
  const manifests = new Map<string, TopicManifest>();
  for (const found of manifestsFromNotes(vaultScan(app).notes)) {
    const folder = app.rel(found.topicFolder).replace(/\\/g, "/");
    if (!manifests.has(folder)) {
      manifests.set(folder, { ...found.manifest, path: app.rel(found.manifestPath), folder });
    }
  }
  built = { at: Date.now(), root: app.root, manifests, progress: new Map(), attempts: null };
  return built;
}

export function topicLookupFor(app: AppState): TopicLookup {
  return (folder: string): TopicProgress | null => {
    const b = fresh(app);
    const key = folder.replace(/\\/g, "/");
    if (b.progress.has(key)) return b.progress.get(key)!;
    const manifest = b.manifests.get(key);
    let result: TopicProgress | null = null;
    if (manifest) {
      b.attempts ??= loadAllAttempts(app.root);
      const exercises = vaultScan(app).exercises.filter((ex) =>
        (ex.rel || ex.path).replace(/\\/g, "/").startsWith(key + "/"),
      );
      result = computeTopicProgress(manifest, exercises, b.attempts, loadExamRecordForTopic(app.root, manifest), 0);
    }
    b.progress.set(key, result);
    return result;
  };
}

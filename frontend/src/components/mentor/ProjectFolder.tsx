// Mentor — botón «Crear carpeta del proyecto»: deja el proyecto como carpeta propia dentro de la ruta (`<Materia>/Mentor/Ruta …/<n>. <Área>/<n>.k <tipo>/<proyecto>/`)
// con su plantilla de archivos .md (README, especificación, plan, bitácora, entrega…). Nunca sobrescribe: si ya existe, solo la abre.

import { FolderPlus, FileText } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { GhostButton } from "../common/forms";
import { FolderOpenMenu } from "./FolderOpenMenu";

type Project = Record<string, unknown>;

export function ProjectFolder({ planId, areaKeys, project, label = "Crear carpeta del proyecto", testid = "project-folder" }: {
  planId: string;
  areaKeys: string[];
  /** el proyecto tal como lo entiende `sanitizeProject` (kind, title, description, sections…); sin él solo se prepara la estructura de la ruta */
  project?: Project;
  label?: string;
  testid?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ dirs: string[]; readme: string; existed: boolean } | null>(null);
  const toast = useApp.getState().toast;

  const create = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.mentorProjectsScaffold({ id: planId, areaKeys, ...(project ? { project } : {}) });
      const dirs = r.projects.map((p) => p.dir);
      const readme = r.projects[0]?.readme ?? `${r.route}/README.md`;
      const fresh = r.projects.some((p) => p.created.length > 0);
      useApp.getState().refreshTree?.();
      setMade({ dirs: dirs.length ? dirs : [r.route], readme, existed: !!project && !fresh });
      toast("info", !project ? "Estructura de la ruta lista en Mentor." : fresh ? `Carpeta creada en ${r.projects.length === 1 ? r.projects[0]!.area : `${r.projects.length} áreas`}.` : "La carpeta ya existía: no se tocó nada.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testid}>
      <GhostButton onClick={() => void create()} disabled={busy} data-testid={`${testid}-create`}>
        <FolderPlus size={15} aria-hidden /> {busy ? "Creando…" : made ? "Volver a revisar" : label}
      </GhostButton>
      {made && (
        <>
          <GhostButton onClick={() => void useApp.getState().openNote(made.readme)} data-testid={`${testid}-readme`}>
            <FileText size={15} aria-hidden /> Abrir README
          </GhostButton>
          <FolderOpenMenu dir={made.dirs[0]!} testid={`${testid}-folder`} />
          {made.existed && <span className="text-[12.5px] text-dim">Ya existía; no se sobrescribió.</span>}
        </>
      )}
    </div>
  );
}

// Datos de prueba del currículo de referencia (solo para tests).
import type { AreaCoverage, CoverageRow, CoverageStatus, CurriculumImportance } from "./curriculum";
import { coverageLevel, coveragePct } from "./curriculum";

export function row(id: string, category: string, status: CoverageStatus, importance: CurriculumImportance = "esencial", items: string[] = ["a", "b"], matchedFolders: string[] = []): CoverageRow {
  return {
    entry: { id, category, title: `Tema ${id}`, importance, items, keywords: [id] },
    status,
    matchedFolders,
    suggestedFolder: `Programación/12 CSS/12.${id} Tema ${id}`,
  };
}

export function cover(areaId: string, title: string, areaFolder: string, rows: CoverageRow[], space = "Programación"): AreaCoverage {
  const covered = rows.filter((r) => r.status === "cubierto").length;
  const partial = rows.filter((r) => r.status === "parcial").length;
  const pct = coveragePct(covered, partial, rows.length);
  return { areaId, title, space, areaFolder, total: rows.length, covered, partial, missing: rows.length - covered - partial, pct, level: coverageLevel(pct), rows };
}

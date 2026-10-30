import type { CurriculumArea } from "../../lib/curriculum";
import { expandAtomic } from "./atomic";
import { ATOMIC_DESIGN_ENTRIES } from "./catalog/atomic-design";
import { AUTOMATION_ENTRIES, BACKEND_ENTRIES, DATABASES_ENTRIES, ELECTRON_ENTRIES, JAVASCRIPT_ENTRIES, MOBILE_ENTRIES, PYTHON_ENTRIES, TOOLING_ENTRIES, TYPESCRIPT_ENTRIES } from "./catalog/core-areas";
import { CSS_ENTRIES } from "./catalog/css";
import { HTML_ENTRIES } from "./catalog/html";
import { JAVA_ENTRIES } from "./catalog/java";
import { JS_REFERENCE_ENTRIES } from "./catalog/js-reference";

export { CURRICULUM_OVERVIEWS, type OverviewRule } from "./catalog/overviews";

const SPACE = "Programación";

/**
 * Currículo de referencia por área (HTML, CSS, Atomic Design, referencia de JavaScript, Java): lo que cada área DEBERÍA cubrir.
 * HTML, CSS y Atomic Design son áreas internas dentro de Frontend (`5 Frontend/HTML`, `5 Frontend/CSS` y `5 Frontend/Atomic Design`).
 */
export function curriculumAreas(): CurriculumArea[] {
  const areas: CurriculumArea[] = [
    { id: "html", title: "HTML", space: SPACE, areaFolder: "5 Frontend/HTML", prefix: "5.18", atomic: true, entries: HTML_ENTRIES },
    { id: "css", title: "CSS", space: SPACE, areaFolder: "5 Frontend/CSS", prefix: "5.19", atomic: true, entries: CSS_ENTRIES },
    { id: "atomic-design", title: "Atomic Design", space: SPACE, areaFolder: "5 Frontend/Atomic Design", prefix: "5.20", entries: ATOMIC_DESIGN_ENTRIES },
    { id: "js-reference", title: "JavaScript Reference", space: SPACE, areaFolder: "13 JavaScript Reference", atomic: true, entries: JS_REFERENCE_ENTRIES },
    { id: "java", title: "Java", space: SPACE, areaFolder: "14 Java", entries: JAVA_ENTRIES },
    // áreas de conocimiento: sus temas son capítulos numerados (`2.1.N`, `4.N`…), y el currículo dice qué capítulos debería tener
    { id: "python", title: "Python", space: SPACE, areaFolder: "2.1 Python", prefix: "2.1", entries: PYTHON_ENTRIES },
    { id: "javascript", title: "JavaScript", space: SPACE, areaFolder: "2.2 JavaScript", prefix: "2.2", entries: JAVASCRIPT_ENTRIES },
    { id: "typescript", title: "TypeScript", space: SPACE, areaFolder: "2.3 TypeScript", prefix: "2.3", entries: TYPESCRIPT_ENTRIES },
    { id: "electron", title: "Desktop Apps (Electron)", space: SPACE, areaFolder: "3 Desktop Apps (Electron)", prefix: "3", entries: ELECTRON_ENTRIES },
    { id: "backend", title: "Backend", space: SPACE, areaFolder: "4 Backend", prefix: "4", entries: BACKEND_ENTRIES },
    { id: "databases", title: "Databases", space: SPACE, areaFolder: "6 Databases", prefix: "6", entries: DATABASES_ENTRIES },
    { id: "automation", title: "Automation", space: SPACE, areaFolder: "7 Automation", prefix: "7", entries: AUTOMATION_ENTRIES },
    { id: "mobile", title: "Mobile", space: SPACE, areaFolder: "8 Mobile", prefix: "8", entries: MOBILE_ENTRIES },
    { id: "tooling", title: "Tooling and Quality", space: SPACE, areaFolder: "9 Tooling and Quality", prefix: "9", entries: TOOLING_ENTRIES },
  ];
  return areas.map(expandAtomic);
}

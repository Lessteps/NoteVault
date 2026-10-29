import type { CurriculumArea } from "../../lib/curriculum";
import { expandAtomic } from "./atomic";
import { ATOMIC_DESIGN_ENTRIES } from "./catalog/atomic-design";
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
  ];
  return areas.map(expandAtomic);
}
